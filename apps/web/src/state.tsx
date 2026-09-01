import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { aiClients as initialAiClients, type AiClient } from './mock'
import { resolveMemoryGovernance } from './memory-policy'
import {
  initialAgents,
  initialConfigurationEnvironments,
  initialAssets,
  initialBackupSnapshots,
  initialCompanies,
  initialConfigRevisions,
  initialDepartments,
  initialMemoryCandidates,
  initialMemorySpaces,
  initialPluginInstallations,
  initialRoles,
  initialWorkspaces,
  type ConfigurationEnvironment,
  type BackupSnapshot,
  type Company,
  type ConfigRevision,
  type FullAgent,
  type FullAsset,
  type FullDepartment,
  type FullWorkspace,
  type MemoryCandidate,
  type MemoryCandidateStatus,
  type MemorySpace,
  type Role,
} from './domain'
import { applyPluginAction, type PluginAction, type PluginInstallation } from './plugin-installation'
import { applySkillAction, type SkillAction } from './skill-installation'
import { getAgentPackageEditability } from './agent-package-schema'
import { validateOrchestrationOverride } from './orchestration-policy'
import { applyAgentConfig, describeAgentConfigFile, getAgentConfigPath, isAgentConfigPayload, serializeAgentConfig, snapshotAgentConfig, type AgentConfigPayload, type SaveAgentConfigInput } from './agent-config-model'
import { appendConfigRevision } from './config-revisions'
import { configurationEnvironmentPath, isConfigurationEnvironment, normalizeConfigurationEnvironment, serializeConfigurationEnvironment, validateConfigurationEnvironment } from './configuration-environment-model'
import type { AgentRecoveryOperationSummaryDto, MemoryReviewBundleDto, ReviewMemoryCandidateResult } from './contracts'
import type { TerminalId } from './terminal-model'
import type { MainMenuLayoutPreference } from './navigation-layout'
import { isDesktopRuntime, listAgentRecoveryOperations, listAgents, loadOrganizationSnapshot } from './desktop-bridge'
import {
  DEFAULT_UI_PREFERENCES,
  getAccessibleAccent,
  loadUiPreferences,
  resolveTheme,
  saveUiPreferences,
  type EffectiveTheme,
  type UiPreferences,
} from './ui-preferences'

export type NoticeTone = 'success' | 'info' | 'warning' | 'error'

export type Notice = {
  id: string
  tone: NoticeTone
  title: string
  description?: string
  duration?: number
}

export type DialogState =
  | { kind: 'diff'; assetId?: string; agentId?: string; path?: string }
  | { kind: 'source'; assetId?: string; agentId?: string; section?: string }
  | { kind: 'shared'; assetId: string; changes?: Partial<FullAsset>; message?: string }
  | { kind: 'conflict'; assetId?: string; agentId?: string }
  | { kind: 'permission'; agentId: string; nextFiles?: string }
  | { kind: 'memory'; candidateId: string }
  | { kind: 'client-guide'; workspaceId?: string; clientId?: string; agentId?: string; planning?: boolean }
  | { kind: 'config-history'; ownerType: ConfigRevision['ownerType']; ownerId: string; path: string }
  | { kind: 'workspace-responsibility'; workspaceId: string }
  | { kind: 'remove-workspace-index'; workspaceId: string }
  | { kind: 'backup-restore'; snapshotId: string }
  | { kind: 'organization'; entity: 'company' | 'department'; id?: string; mode: 'create' | 'edit' }
  | null

export type BackupSettings = {
  gitConnection: { status: 'disconnected'; visibility: 'private' } | { status: 'connected-demo'; visibility: 'private'; repository: string }
  formalMemoryRemote: 'excluded' | 'confirmed'
}

export type NetworkProxySettings = {
  mode: 'system' | 'none' | 'manual'
  httpProxy: string
  httpsProxy: string
  socksProxy: string
  noProxy: string
}

export type SettingsState = {
  language: '简体中文' | 'English'
  agentRoot: string
  terminal: TerminalId
  externalChangeInterval: '手动' | '5 分钟' | '15 分钟'
  autoSnapshot: boolean
  networkProxy: NetworkProxySettings
}

export type OnboardingState = {
  status: 'active' | 'completed'
}

export type HydrationStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

type OrganizationServiceGrant = {
  agentId: string
  id: string
  departmentId: string
  capabilities: string[]
  workspaceIds: string[]
  prohibitions: string[]
  status: '有效' | '暂停'
}

export type State = {
  runtime: 'web' | 'desktop'
  hydration: { managedAgents: HydrationStatus; organization: HydrationStatus; agentRecovery: HydrationStatus }
  agentRecoveryOperations: AgentRecoveryOperationSummaryDto[]
  organizationServiceGrants: OrganizationServiceGrant[]
  onboarding: OnboardingState
  agents: FullAgent[]
  companies: Company[]
  departments: FullDepartment[]
  roles: Role[]
  workspaces: FullWorkspace[]
  assets: FullAsset[]
  pluginInstallations: PluginInstallation[]
  memorySpaces: MemorySpace[]
  memoryCandidates: MemoryCandidate[]
  configRevisions: ConfigRevision[]
  backupSnapshots: BackupSnapshot[]
  backupSettings: BackupSettings
  settings: SettingsState
  aiClients: AiClient[]
  configurationEnvironments: ConfigurationEnvironment[]
  currentConfigurationEnvironmentId: string
  recentAgentIds: string[]
  currentWorkspaceId: string | null
  uiPreferences: UiPreferences
  theme: EffectiveTheme
  mainMenuLayoutPreference: MainMenuLayoutPreference
  dialog: DialogState
  notice?: Notice
}

export type Action =
  | { type: 'THEME' }
  | { type: 'SET_MAIN_MENU_LAYOUT'; preference: MainMenuLayoutPreference }
  | { type: 'UPDATE_UI_PREFERENCES'; preferences: UiPreferences }
  | { type: 'SET_EFFECTIVE_THEME'; theme: EffectiveTheme }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'OPEN_DIALOG'; dialog: Exclude<DialogState, null> }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SHEET'; sheet: 'diff' | 'source' | 'shared' | 'conflict' | 'permission' | 'memory' | 'claude' | null }
  | { type: 'CREATE_AGENT'; agent: FullAgent }
  | { type: 'UPSERT_MANAGED_AGENT'; agent: FullAgent; message?: string }
  | { type: 'HYDRATE_MANAGED_AGENTS'; agents: FullAgent[] }
  | { type: 'FAIL_MANAGED_AGENTS_HYDRATION'; message: string }
  | { type: 'HYDRATE_AGENT_RECOVERY'; operations: AgentRecoveryOperationSummaryDto[] }
  | { type: 'SYNC_AGENT_RECOVERY'; operation: AgentRecoveryOperationSummaryDto; agent?: FullAgent }
  | { type: 'FAIL_AGENT_RECOVERY_HYDRATION'; message: string }
  | { type: 'HYDRATE_ORGANIZATION'; companies: Company[]; departments: FullDepartment[]; roles: Role[]; workspaces: FullWorkspace[]; serviceGrants: OrganizationServiceGrant[] }
  | { type: 'FAIL_ORGANIZATION_HYDRATION'; message: string }
  | { type: 'SYNC_PERSISTED_COMPANIES'; companies: Company[] }
  | { type: 'SYNC_PERSISTED_DEPARTMENTS'; departments: FullDepartment[] }
  | { type: 'SYNC_PERSISTED_ROLES'; roles: Role[] }
  | { type: 'SYNC_PERSISTED_WORKSPACES'; workspaces: FullWorkspace[] }
  | { type: 'UPDATE_AGENT'; agentId: string; changes: Partial<FullAgent>; message?: string }
  | { type: 'SET_AGENT_LIFECYCLE'; agentId: string; status: FullAgent['status'] }
  | { type: 'SAVE_INSTRUCTIONS'; agentId?: string; text: string }
  | { type: 'SAVE_AGENT_CONFIG'; input: SaveAgentConfigInput; summary?: string }
  | { type: 'RESTORE_CONFIG_REVISION'; revisionId: string }
  | { type: 'CREATE_COMPANY'; company: Company }
  | { type: 'UPDATE_COMPANY'; companyId: string; changes: Partial<Company> }
  | { type: 'CREATE_DEPARTMENT'; department: FullDepartment }
  | { type: 'UPDATE_DEPARTMENT'; departmentId: string; changes: Partial<FullDepartment> }
  | { type: 'CREATE_ROLE'; role: Role }
  | { type: 'UPDATE_ROLE'; roleId: string; changes: Partial<Role> }
  | { type: 'ADD_WORKSPACE'; workspace: FullWorkspace }
  | { type: 'UPDATE_WORKSPACE'; workspaceId: string; changes: Partial<FullWorkspace> }
  | { type: 'REMOVE_WORKSPACE_INDEX'; workspaceId: string }
  | { type: 'SELECT_WORKSPACE'; workspaceId: string }
  | { type: 'UPDATE_ASSET'; assetId: string; changes: Partial<FullAsset>; message?: string }
  | { type: 'CREATE_ASSET'; asset: FullAsset }
  | { type: 'APPLY_SKILL_ACTION'; skillId: string; action: SkillAction; version?: string }
  | { type: 'APPLY_PLUGIN_ACTION'; pluginId: string; action: PluginAction; version?: string }
  | { type: 'UPDATE_BACKUP_SETTINGS'; changes: Partial<BackupSettings> }
  | { type: 'CREATE_MEMORY_CANDIDATE'; candidate: MemoryCandidate }
  | { type: 'SYNC_FORMAL_MEMORY_CANDIDATE'; bundle: MemoryReviewBundleDto }
  | { type: 'HYDRATE_FORMAL_MEMORY_REVIEWS'; bundles: MemoryReviewBundleDto[] }
  | { type: 'SYNC_FORMAL_MEMORY_REVIEW'; result: ReviewMemoryCandidateResult }
  | { type: 'REVIEW_MEMORY_CANDIDATE'; candidateId: string; status: MemoryCandidateStatus }
  | { type: 'CREATE_DEMO_BACKUP_SNAPSHOT'; snapshot: BackupSnapshot }
  | { type: 'SIMULATE_RESTORE'; snapshotId: string; beforeSnapshot: BackupSnapshot }
  | { type: 'UPDATE_SETTINGS'; changes: Partial<SettingsState> }
  | { type: 'RECORD_RECENT_AGENT'; agentId: string }
  | { type: 'REMOVE_RECENT_AGENT'; agentId: string }
  | { type: 'CLEAR_RECENT_AGENTS' }
  | { type: 'ADD_CUSTOM_AI_CLIENT'; client: AiClient }
  | { type: 'SAVE_CONFIGURATION_ENVIRONMENT'; environment: ConfigurationEnvironment }
  | { type: 'CREATE_CONFIGURATION_ENVIRONMENT'; environment: ConfigurationEnvironment; sourceEnvironmentId?: string }
  | { type: 'SELECT_CONFIGURATION_ENVIRONMENT'; environmentId: string }
  | { type: 'SET_ENVIRONMENT_CLIENT_REGISTRATION'; environmentId: string; clientId: string; registered: boolean }
  | { type: 'SHOW_NOTICE'; notice: Omit<Notice, 'id'> }
  | { type: 'CLEAR_NOTICE'; id?: string }
  | { type: 'TOAST'; text?: string }

function getInitialUiPreferences(): UiPreferences {
  try {
    return loadUiPreferences(localStorage)
  } catch {
    return { ...DEFAULT_UI_PREFERENCES }
  }
}

const initialUiPreferences = getInitialUiPreferences()

export const initialState: State = {
  runtime: 'web',
  hydration: { managedAgents: 'idle', organization: 'idle', agentRecovery: 'idle' },
  agentRecoveryOperations: [],
  organizationServiceGrants: [],
  onboarding: { status: 'active' },
  agents: initialAgents,
  companies: initialCompanies,
  departments: initialDepartments,
  roles: initialRoles,
  workspaces: initialWorkspaces,
  assets: initialAssets,
  pluginInstallations: initialPluginInstallations,
  memorySpaces: initialMemorySpaces,
  memoryCandidates: initialMemoryCandidates,
  configRevisions: initialConfigRevisions,
  backupSnapshots: initialBackupSnapshots,
  backupSettings: { gitConnection: { status: 'disconnected', visibility: 'private' }, formalMemoryRemote: 'excluded' },
  settings: {
    language: '简体中文',
    agentRoot: '~/.bandi/agents',
    terminal: 'terminal',
    externalChangeInterval: '5 分钟',
    autoSnapshot: true,
    networkProxy: { mode: 'system', httpProxy: '', httpsProxy: '', socksProxy: '', noProxy: '' },
  },
  aiClients: initialAiClients,
  configurationEnvironments: initialConfigurationEnvironments,
  currentConfigurationEnvironmentId: initialConfigurationEnvironments[0].id,
  recentAgentIds: [],
  currentWorkspaceId: 'bandi',
  uiPreferences: initialUiPreferences,
  theme: resolveTheme(initialUiPreferences.theme, false),
  mainMenuLayoutPreference: initialUiPreferences.mainMenuLayout,
  dialog: null,
}

function createDesktopInitialState(): State {
  return {
    ...initialState,
    runtime: 'desktop',
    hydration: { managedAgents: 'loading', organization: 'loading', agentRecovery: 'loading' },
    agentRecoveryOperations: [],
    agents: [],
    companies: [],
    departments: [],
    roles: [],
    workspaces: [],
    assets: [],
    pluginInstallations: [],
    memorySpaces: [],
    memoryCandidates: [],
    configRevisions: [],
    backupSnapshots: [],
    recentAgentIds: [],
    currentWorkspaceId: null,
  }
}

let noticeId = 0
const notice = (tone: NoticeTone, title: string, description?: string, duration = 5000): Notice => ({
  id: `notice-${++noticeId}`,
  tone,
  title,
  description,
  duration,
})

function memoryOwnerLabel(state: State, owner: MemoryReviewBundleDto['space']['owner']) {
  if (owner.kind === 'agent') return state.agents.find((item) => item.id === owner.agentId)?.name ?? owner.agentId
  if (owner.kind === 'workspace') return state.workspaces.find((item) => item.id === owner.workspaceId)?.name ?? owner.workspaceId
  const department = state.departments.find((item) => item.id === owner.departmentId)?.name ?? owner.departmentId
  const workspace = state.workspaces.find((item) => item.id === owner.workspaceId)?.name ?? owner.workspaceId
  return `${department} × ${workspace}`
}

function mapFormalMemoryBundle(state: State, bundle: MemoryReviewBundleDto): { space: MemorySpace; candidate: MemoryCandidate } {
  const owner = memoryOwnerLabel(state, bundle.space.owner)
  const steward = state.agents.find((item) => item.id === bundle.space.stewardAgentId)?.name ?? bundle.space.stewardAgentId
  const reviewer = state.agents.find((item) => item.id === bundle.space.reviewerAgentId)?.name ?? bundle.space.reviewerAgentId
  const formalStatus = bundle.candidate.status
  const scopeType = {
    agent_long_term: 'Agent 长期记忆',
    agent_workspace: 'Agent 工作区记忆',
    workspace_shared: '工作区公共记忆',
    department_workspace: '部门工作区记忆',
  }[bundle.space.scopeType] as MemorySpace['scopeType']
  const relativePath = bundle.space.storageLocator.relativePath ?? bundle.space.storageLocator.displayPath
  const path = bundle.space.storageLocator.rootKind === 'managed' && 'agentId' in bundle.space.scopeKey
    ? `~/.bandi/agents/agt_${bundle.space.scopeKey.agentId}/${relativePath}`
    : relativePath
  return {
    space: {
      id: bundle.space.id,
      scopeType,
      scopeKey: bundle.space.scopeKey,
      owner,
      steward,
      reviewer,
      reviewerAgentId: bundle.space.reviewerAgentId,
      revision: bundle.space.currentRevisionId ?? '尚无正式版本',
      path,
    },
    candidate: {
      id: bundle.candidate.id,
      spaceId: bundle.candidate.spaceId,
      proposerAgentId: bundle.candidate.proposerAgentId,
      reviewerAgentId: bundle.candidate.reviewerAgentId,
      summary: bundle.candidate.summary,
      current: bundle.currentContent,
      proposed: bundle.candidate.proposedContent,
      status: formalStatus === 'changes_requested'
        ? '要求修改'
        : formalStatus === 'rejected'
          ? '已驳回'
          : formalStatus === 'written'
            ? '已写入正式 Revision'
            : formalStatus === 'approved_pending_write' || formalStatus === 'revision_pending'
              ? '已批准'
              : '待审核',
    },
  }
}

function mergeFormalMemoryBundles(state: State, bundles: MemoryReviewBundleDto[]): Pick<State, 'memorySpaces' | 'memoryCandidates'> {
  const mapped = bundles.map((bundle) => mapFormalMemoryBundle(state, bundle))
  const spaceIds = new Set(mapped.map(({ space }) => space.id))
  const candidateIds = new Set(mapped.map(({ candidate }) => candidate.id))
  return {
    memorySpaces: [...state.memorySpaces.filter((item) => !spaceIds.has(item.id)), ...mapped.map(({ space }) => space).filter((space, index, spaces) => spaces.findIndex((item) => item.id === space.id) === index)],
    memoryCandidates: [...state.memoryCandidates.filter((item) => !candidateIds.has(item.id)), ...mapped.map(({ candidate }) => candidate)],
  }
}

function initializeAgentConfigRecords(agent: FullAgent, revisions: ConfigRevision[]): { agent: FullAgent; revisions: ConfigRevision[] } {
  if (agent.packageSource.kind === 'external-reference') return { agent, revisions }
  const payloads: AgentConfigPayload[] = [
    snapshotAgentConfig(agent, 'identity'),
    snapshotAgentConfig(agent, 'instructions'),
    snapshotAgentConfig(agent, 'context'),
    snapshotAgentConfig(agent, 'permissions'),
    snapshotAgentConfig(agent, 'orchestration'),
    ...(agent.hookRefs.length ? [snapshotAgentConfig(agent, 'hooks')] : []),
    ...(agent.commandRefs.length ? [snapshotAgentConfig(agent, 'commands')] : []),
    ...agent.workspaceBindings.map((value) => snapshotAgentConfig(agent, 'workspace-binding', value.workspaceId)),
  ].filter((payload): payload is AgentConfigPayload => Boolean(payload))
  let nextRevisions = revisions
  let files = agent.files
  for (const payload of payloads) {
    const path = getAgentConfigPath(payload)
    const content = serializeAgentConfig(agent, payload)
    const file = describeAgentConfigFile(payload)
    if (!path || content === undefined || !file) continue
    const appended = appendConfigRevision(nextRevisions, { ownerType: 'agent', ownerId: agent.id, path, content, summary: `创建 ${file.type} 演示配置`, payload, evidence: 'memory-only' })
    nextRevisions = appended.revisions
    files = files.some((item) => item.path === path)
      ? files.map((item) => item.path === path ? { ...item, ...file, revision: appended.revision.id } : item)
      : [...files, { ...file, revision: appended.revision.id }]
  }
  return { agent: { ...agent, files }, revisions: nextRevisions }
}

function saveAgentConfig(state: State, agentId: string, payload: AgentConfigPayload, summary: string): State {
  const agent = state.agents.find((item) => item.id === agentId)
  if (!agent) return { ...state, notice: notice('warning', '无法更新 Agent 配置', 'Agent 不存在') }
  const editability = getAgentPackageEditability(agent.packageSchema)
  if (!editability.editable) return { ...state, notice: notice('warning', '无法更新 Agent 配置', editability.reason) }
  if (payload.kind === 'identity') {
    const role = state.roles.find((item) => item.id === payload.value.roleId)
    if (payload.value.id !== agent.id || !role || role.status !== 'active' || role.companyId !== payload.value.companyId || (role.departmentId && role.departmentId !== payload.value.primaryDepartmentId)) {
      return { ...state, notice: notice('error', '无法更新 Agent 配置', 'Agent ID、岗位或组织作用域无效') }
    }
  }
  if (payload.kind === 'workspace-binding' && payload.value.orchestrationPolicy && validateOrchestrationOverride(agent.orchestrationPolicy, payload.value.orchestrationPolicy).length) {
    return { ...state, notice: notice('error', '无法更新 Agent 配置', '工作区协作策略只能收紧根级策略') }
  }
  const currentPayload = snapshotAgentConfig(agent, payload.kind, payload.kind === 'workspace-binding' ? payload.value.workspaceId : undefined)
  if (currentPayload && JSON.stringify(currentPayload) === JSON.stringify(payload)) return state
  const path = getAgentConfigPath(payload)
  const nextAgent = applyAgentConfig(agent, payload)
  const content = serializeAgentConfig(agent, payload)
  const file = describeAgentConfigFile(payload)
  if (!path || !nextAgent || content === undefined || !file) {
    return { ...state, notice: notice('error', '无法更新 Agent 配置', '配置目标或路径无效') }
  }
  const appended = appendConfigRevision(state.configRevisions, {
    ownerType: 'agent', ownerId: agentId, path, content, summary, payload, evidence: 'memory-only',
  })
  if (!appended.created) return state
  const existingFile = nextAgent.files.some((item) => item.path === path)
  const files = existingFile
    ? nextAgent.files.map((item) => item.path === path ? { ...item, ...file, revision: appended.revision.id } : item)
    : [...nextAgent.files, { ...file, revision: appended.revision.id }]
  return {
    ...state,
    agents: state.agents.map((item) => item.id === agentId ? { ...nextAgent, files, updated: '刚刚' } : item),
    configRevisions: appended.revisions,
    notice: notice('success', 'Agent 配置已记录', `${path} · ${appended.revision.id} · 仅在当前页面有效 · 未写入文件`),
  }
}

const legacyDialog = (sheet: Exclude<Extract<Action, { type: 'SHEET' }>['sheet'], null>, state: State): Exclude<DialogState, null> => {
  if (sheet === 'claude') return { kind: 'client-guide', workspaceId: state.currentWorkspaceId ?? undefined }
  if (sheet === 'permission') return { kind: 'permission', agentId: 'zhouce' }
  if (sheet === 'memory') return { kind: 'memory', candidateId: state.memoryCandidates.find((item) => item.status === '待审核')?.id ?? state.memoryCandidates[0]?.id ?? 'MC-028' }
  if (sheet === 'shared') return { kind: 'shared', assetId: 'rule-common' }
  return { kind: sheet }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'THEME': {
      const theme = state.theme === 'light' ? 'dark' : 'light'
      return { ...state, theme, uiPreferences: { ...state.uiPreferences, theme } }
    }
    case 'SET_MAIN_MENU_LAYOUT':
      return state.mainMenuLayoutPreference === action.preference
        ? state
        : { ...state, mainMenuLayoutPreference: action.preference, uiPreferences: { ...state.uiPreferences, mainMenuLayout: action.preference } }
    case 'UPDATE_UI_PREFERENCES':
      return JSON.stringify(state.uiPreferences) === JSON.stringify(action.preferences)
        ? state
        : {
            ...state,
            uiPreferences: action.preferences,
            mainMenuLayoutPreference: action.preferences.mainMenuLayout,
            notice: notice('success', '个性化设置已应用', '仅保存在当前设备，不进入 Agent 配置、版本历史或备份'),
          }
    case 'SET_EFFECTIVE_THEME':
      return state.theme === action.theme ? state : { ...state, theme: action.theme }
    case 'COMPLETE_ONBOARDING':
      return state.onboarding.status === 'completed'
        ? state
        : { ...state, onboarding: { status: 'completed' } }
    case 'OPEN_DIALOG':
      return { ...state, dialog: action.dialog }
    case 'CLOSE_DIALOG':
      return { ...state, dialog: null }
    case 'SHEET':
      return { ...state, dialog: action.sheet ? legacyDialog(action.sheet, state) : null }
    case 'CREATE_AGENT': {
      if (state.agents.some((item) => item.id === action.agent.id || item.name === action.agent.name)) return state
      const initialized = initializeAgentConfigRecords(action.agent, state.configRevisions)
      return { ...state, agents: [...state.agents, initialized.agent], configRevisions: initialized.revisions, notice: notice('success', `${action.agent.name} 已添加到演示配置`, action.agent.packageSource.kind === 'external-reference' ? '只登记外部只读引用 · 未读取或创建真实 AgentPackage' : '已记录当前页面配置版本 · 未创建真实 AgentPackage') }
    }
    case 'UPSERT_MANAGED_AGENT': {
      const exists = state.agents.some((item) => item.id === action.agent.id)
      return {
        ...state,
        agents: exists
          ? state.agents.map((item) => item.id === action.agent.id ? action.agent : item)
          : [...state.agents, action.agent],
        notice: notice('success', 'AgentPackage 已保存', action.message ?? '已写入 Bandi Desktop 受管目录'),
      }
    }
    case 'HYDRATE_MANAGED_AGENTS': {
      const grantsByAgent = new Map<string, FullAgent['serviceGrants']>()
      for (const grant of state.organizationServiceGrants) {
        const { agentId, ...value } = grant
        grantsByAgent.set(agentId, [...(grantsByAgent.get(agentId) ?? []), value])
      }
      return {
        ...state,
        hydration: { ...state.hydration, managedAgents: 'succeeded' },
        agents: action.agents.map((agent) => ({ ...agent, serviceGrants: grantsByAgent.get(agent.id) ?? [] })),
      }
    }
    case 'FAIL_MANAGED_AGENTS_HYDRATION':
      return {
        ...state,
        hydration: { ...state.hydration, managedAgents: 'failed' },
        notice: notice('error', '无法恢复本机 Agent 配置事实', action.message),
      }
    case 'HYDRATE_AGENT_RECOVERY':
      return {
        ...state,
        hydration: { ...state.hydration, agentRecovery: 'succeeded' },
        agentRecoveryOperations: action.operations.filter((item) => item.status !== 'completed'),
      }
    case 'SYNC_AGENT_RECOVERY': {
      const operations = action.operation.status === 'completed'
        ? state.agentRecoveryOperations.filter((item) => item.id !== action.operation.id)
        : [...state.agentRecoveryOperations.filter((item) => item.id !== action.operation.id), action.operation]
      const agents = action.agent
        ? state.agents.some((item) => item.id === action.agent!.id)
          ? state.agents.map((item) => item.id === action.agent!.id ? action.agent! : item)
          : [...state.agents, action.agent]
        : state.agents
      return { ...state, agents, agentRecoveryOperations: operations }
    }
    case 'FAIL_AGENT_RECOVERY_HYDRATION':
      return {
        ...state,
        hydration: { ...state.hydration, agentRecovery: 'failed' },
        notice: notice('error', '无法读取待恢复的 Agent 配置', action.message),
      }
    case 'HYDRATE_ORGANIZATION': {
      const grantsByAgent = new Map<string, FullAgent['serviceGrants']>()
      for (const grant of action.serviceGrants) {
        const { agentId, ...value } = grant
        grantsByAgent.set(agentId, [...(grantsByAgent.get(agentId) ?? []), value])
      }
      return {
        ...state,
        hydration: { ...state.hydration, organization: 'succeeded' },
        organizationServiceGrants: action.serviceGrants,
        onboarding: state.runtime === 'desktop'
          ? { status: action.workspaces.length ? 'completed' : 'active' }
          : state.onboarding,
        companies: action.companies,
        departments: action.departments,
        roles: action.roles,
        workspaces: action.workspaces,
        currentWorkspaceId: action.workspaces.some((item) => item.id === state.currentWorkspaceId) ? state.currentWorkspaceId : action.workspaces[0]?.id ?? null,
        agents: state.agents.map((agent) => ({ ...agent, serviceGrants: grantsByAgent.get(agent.id) ?? [] })),
      }
    }
    case 'FAIL_ORGANIZATION_HYDRATION':
      return {
        ...state,
        hydration: { ...state.hydration, organization: 'failed' },
        notice: notice('error', '无法恢复本机组织配置事实', action.message),
      }
    case 'SYNC_PERSISTED_COMPANIES': {
      const persisted = new Map(action.companies.map((company) => [company.id, company]))
      const companies = state.companies.map((company) => persisted.get(company.id) ?? company)
      for (const company of action.companies) {
        if (!companies.some((item) => item.id === company.id)) companies.push(company)
      }
      return { ...state, companies }
    }
    case 'SYNC_PERSISTED_DEPARTMENTS': {
      const persisted = new Map(action.departments.map((department) => [department.id, department]))
      const departments = state.departments.map((department) => persisted.get(department.id) ?? department)
      for (const department of action.departments) {
        if (!departments.some((item) => item.id === department.id)) departments.push(department)
      }
      return { ...state, departments }
    }
    case 'SYNC_PERSISTED_ROLES': {
      const persisted = new Map(action.roles.map((role) => [role.id, role]))
      const roles = state.roles.map((role) => persisted.get(role.id) ?? role)
      for (const role of action.roles) {
        if (!roles.some((item) => item.id === role.id)) roles.push(role)
      }
      return { ...state, roles }
    }
    case 'SYNC_PERSISTED_WORKSPACES': {
      const persisted = new Map(action.workspaces.map((workspace) => [workspace.id, workspace]))
      const workspaces = state.workspaces.map((workspace) => persisted.get(workspace.id) ?? workspace)
      for (const workspace of action.workspaces) {
        if (!workspaces.some((item) => item.id === workspace.id)) workspaces.push(workspace)
      }
      return { ...state, workspaces, currentWorkspaceId: action.workspaces.at(-1)?.id ?? state.currentWorkspaceId }
    }
    case 'UPDATE_AGENT':
      return { ...state, agents: state.agents.map((item) => item.id === action.agentId ? { ...item, ...action.changes, updated: '刚刚' } : item), notice: notice('success', 'Agent 演示配置已更新', action.message ?? '仅在当前页面有效 · 未写入文件') }
    case 'SET_AGENT_LIFECYCLE': {
      const agent = state.agents.find((item) => item.id === action.agentId)
      const manifest = agent ? snapshotAgentConfig(agent, 'identity') : undefined
      if (!agent || !manifest || manifest.kind !== 'identity') return state
      return saveAgentConfig(state, agent.id, { ...manifest, value: { ...manifest.value, status: action.status } }, `更新生命周期为 ${action.status}`)
    }
    case 'SAVE_INSTRUCTIONS':
      return saveAgentConfig(state, action.agentId ?? 'zhouce', { kind: 'instructions', value: action.text }, '保存主指令演示配置')
    case 'SAVE_AGENT_CONFIG': {
      const { agentId, ...payload } = action.input
      return saveAgentConfig(state, agentId, payload, action.summary ?? `保存 ${payload.kind} 演示配置`)
    }
    case 'RESTORE_CONFIG_REVISION': {
      const target = state.configRevisions.find((item) => item.id === action.revisionId)
      if (!target) return { ...state, notice: notice('warning', '无法恢复配置版本', '目标版本不存在') }
      if (target.ownerType === 'agent') {
        const payload = isAgentConfigPayload(target.payload)
          ? target.payload
          : target.path === 'instructions.md'
            ? { kind: 'instructions' as const, value: target.content }
            : undefined
        if (!payload || getAgentConfigPath(payload) !== target.path) return { ...state, notice: notice('warning', '无法恢复配置版本', '该版本没有与目标路径匹配的可验证结构化快照') }
        const restored = saveAgentConfig(state, target.ownerId, payload, `恢复自 ${target.id}`)
        if (restored.configRevisions === state.configRevisions) return { ...restored, notice: notice('info', '无需恢复配置版本', '目标版本与当前结构化配置相同，未生成重复版本') }
        const latest = restored.configRevisions[0]
        return { ...restored, dialog: null, configRevisions: [{ ...latest, restoredFromRevisionId: target.id }, ...restored.configRevisions.slice(1)] }
      }
      if (target.ownerType === 'configuration-environment') {
        if (!isConfigurationEnvironment(target.payload)) return { ...state, notice: notice('warning', '无法恢复配置版本', '该配置方案版本没有可验证结构化快照') }
        const candidate = target.payload
        const clientIds = state.aiClients.map((client) => client.id)
        if (configurationEnvironmentPath(candidate) !== target.path || Object.keys(validateConfigurationEnvironment(candidate, clientIds)).length) return { ...state, notice: notice('warning', '无法恢复配置版本', '该配置方案版本与目标路径不匹配或字段无效') }
        const restored = reducer(state, { type: 'SAVE_CONFIGURATION_ENVIRONMENT', environment: candidate })
        if (restored.configRevisions === state.configRevisions) return { ...restored, notice: notice('info', '无需恢复配置版本', '目标版本与当前配置方案相同') }
        const latest = restored.configRevisions[0]
        return { ...restored, dialog: null, configRevisions: [{ ...latest, restoredFromRevisionId: target.id }, ...restored.configRevisions.slice(1)] }
      }
      const appended = appendConfigRevision(state.configRevisions, { ownerType: target.ownerType, ownerId: target.ownerId, path: target.path, content: target.content, summary: `恢复自 ${target.id}`, restoredFromRevisionId: target.id, evidence: 'memory-only' })
      const revision = appended.revision
      const configRevisions = appended.revisions
      if (target.ownerType === 'asset') {
        const asset = state.assets.find((item) => item.id === target.ownerId)
        if (!asset || asset.kind === 'Memory') return { ...state, notice: notice('warning', '无法恢复配置版本', '正式记忆使用独立的记忆版本') }
        let changes: Partial<FullAsset> = { content: target.content }
        if (asset.kind === 'SOP') {
          try {
            const steps: unknown = JSON.parse(target.content)
            if (!Array.isArray(steps)) throw new Error('SOP 快照不是步骤数组')
            changes = { steps: steps as FullAsset['steps'] }
          } catch {
            return { ...state, notice: notice('warning', '无法恢复配置版本', 'SOP 版本内容损坏或结构无效') }
          }
        }
        return { ...state, assets: state.assets.map((item) => item.id === target.ownerId ? { ...item, ...changes } : item), configRevisions, dialog: null, notice: notice('success', '已恢复为新的演示版本', `${revision.id} · 来源 ${target.id} · 未写入真实文件`) }
      }
      return state
    }
    case 'CREATE_COMPANY':
      if (state.companies.some((item) => item.id === action.company.id)) return state
      return { ...state, companies: [...state.companies, action.company], notice: notice('success', '公司已加入演示组织', '仅在当前页面有效') }
    case 'UPDATE_COMPANY':
      return { ...state, companies: state.companies.map((item) => item.id === action.companyId ? { ...item, ...action.changes } : item), notice: notice('success', '公司演示信息已更新', '未写入文件') }
    case 'CREATE_DEPARTMENT':
      if (state.departments.some((item) => item.id === action.department.id)) return state
      return { ...state, departments: [...state.departments, action.department], companies: state.companies.map((item) => item.id === action.department.companyId ? { ...item, departmentIds: [...item.departmentIds, action.department.id] } : item), notice: notice('success', '部门已加入演示组织', '未修改 AgentPackage') }
    case 'UPDATE_DEPARTMENT':
      return { ...state, departments: state.departments.map((item) => item.id === action.departmentId ? { ...item, ...action.changes } : item), notice: notice('success', '部门关系已更新', '未隐式修改 Agent 配置或权限') }
    case 'CREATE_ROLE': {
      if (state.roles.some((item) => item.id === action.role.id || (item.companyId === action.role.companyId && item.name === action.role.name))) return { ...state, notice: notice('warning', '无法创建岗位', '稳定 ID 或公司内名称重复') }
      const path = `companies/${action.role.companyId}/roles/${action.role.id}.yaml`
      const content = JSON.stringify(action.role, null, 2)
      const appended = appendConfigRevision(state.configRevisions, { ownerType: 'role', ownerId: action.role.id, path, content, summary: `创建岗位${action.role.name}`, payload: action.role, evidence: 'memory-only' })
      return { ...state, roles: [...state.roles, action.role], configRevisions: appended.revisions, notice: notice('success', '岗位已记录到页面内存', `${path} · 不授予权限或资产`) }
    }
    case 'UPDATE_ROLE': {
      const current = state.roles.find((item) => item.id === action.roleId)
      if (!current) return { ...state, notice: notice('warning', '无法更新岗位', '岗位不存在') }
      const role = { ...current, ...action.changes, id: current.id } as Role
      if (state.roles.some((item) => item.id !== role.id && item.companyId === role.companyId && item.name === role.name)) return { ...state, notice: notice('warning', '无法更新岗位', '公司内岗位名称重复') }
      if (JSON.stringify(role) === JSON.stringify(current)) return state
      const path = `companies/${role.companyId}/roles/${role.id}.yaml`
      const content = JSON.stringify(role, null, 2)
      const appended = appendConfigRevision(state.configRevisions, { ownerType: 'role', ownerId: role.id, path, content, summary: `${role.status === 'archived' ? '归档' : '更新'}岗位 ${role.name}`, payload: role, evidence: 'memory-only' })
      return { ...state, roles: state.roles.map((item) => item.id === role.id ? role : item), configRevisions: appended.revisions, notice: notice('success', '岗位已记录到页面内存', `${path} · 未修改 Agent 权限、资产或 AgentPackage`) }
    }
    case 'ADD_WORKSPACE':
      if (state.workspaces.some((item) => item.id === action.workspace.id)) return state
      return { ...state, workspaces: [...state.workspaces, action.workspace], currentWorkspaceId: action.workspace.id, notice: notice('success', '工作区已添加到演示索引', '未读取或写入真实目录') }
    case 'UPDATE_WORKSPACE':
      return { ...state, workspaces: state.workspaces.map((item) => item.id === action.workspaceId ? { ...item, ...action.changes } : item), notice: notice('success', '工作区演示关系已更新', '未修改目录或 AgentPackage') }
    case 'REMOVE_WORKSPACE_INDEX': {
      const target = state.workspaces.find((item) => item.id === action.workspaceId)
      if (!target) return { ...state, notice: notice('warning', '无法移除工作区', '目标已不在当前演示索引中') }
      const workspaces = state.workspaces.filter((item) => item.id !== action.workspaceId)
      return {
        ...state,
        workspaces,
        currentWorkspaceId: state.currentWorkspaceId === action.workspaceId ? workspaces[0]?.id ?? null : state.currentWorkspaceId,
        dialog: null,
        notice: notice('success', `${target.name} 已从演示索引移除`, '未删除目录、文件、Agent 工作区专属配置、记忆范围 或资产引用'),
      }
    }
    case 'SELECT_WORKSPACE':
      return state.workspaces.some((workspace) => workspace.id === action.workspaceId) ? { ...state, currentWorkspaceId: action.workspaceId } : state
    case 'UPDATE_ASSET': {
      const asset = state.assets.find((item) => item.id === action.assetId)
      if (!asset) return state
      const nextAsset = { ...asset, ...action.changes } as FullAsset
      const revisionContent = asset.kind === 'SOP' && action.changes.steps ? JSON.stringify(nextAsset.steps ?? []) : typeof action.changes.content === 'string' ? nextAsset.content : undefined
      const appended = revisionContent !== undefined && asset.kind !== 'Memory'
        ? appendConfigRevision(state.configRevisions, { ownerType: 'asset', ownerId: asset.id, path: asset.path, content: revisionContent, summary: `保存 ${asset.name} 演示配置`, evidence: 'memory-only' })
        : undefined
      const configRevisions = appended?.revisions ?? state.configRevisions
      return { ...state, assets: state.assets.map((item) => item.id === action.assetId ? nextAsset : item), configRevisions, notice: notice('success', '资产演示配置已更新', appended ? `已记录 ${appended.revision.id} · 仅在当前页面有效 · 未写入文件` : action.message ?? '仅在当前页面有效 · 未写入文件') }
    }
    case 'CREATE_ASSET':
      if (state.assets.some((item) => item.id === action.asset.id)) return state
      return { ...state, assets: [...state.assets, action.asset], notice: notice('success', '资产已创建在演示内存中', '未创建真实文件') }
    case 'APPLY_SKILL_ACTION': {
      const asset = state.assets.find((item) => item.id === action.skillId)
      if (!asset?.skill) return { ...state, notice: notice('warning', '无法更新技能演示状态', '目标不存在或不是可管理的技能') }
      const installation = applySkillAction(asset.skill.installation, action.action, action.version)
      if (!installation) return { ...state, notice: notice('warning', '当前技能状态不支持此操作', '未修改安装记录或使用位置') }
      const labels: Record<SkillAction, string> = { install: '安装', update: '更新', rollback: '回滚', uninstall: '卸载' }
      return { ...state, assets: state.assets.map((item) => item.id === asset.id && item.skill ? { ...item, status: action.action === 'uninstall' ? '可演示安装' : '演示已安装', skill: { ...item.skill, installation } } : item), notice: notice('success', `技能已模拟${labels[action.action]}`, '仅更新当前页面内存 · 未下载、复制或删除文件 · 未执行安装脚本 · 未自动分配给 Agent') }
    }
    case 'APPLY_PLUGIN_ACTION': {
      const installation = state.pluginInstallations.find((item) => item.pluginId === action.pluginId)
      if (!installation) return { ...state, notice: notice('warning', '无法更新插件演示状态', '目标没有独立的插件安装记录') }
      const next = applyPluginAction(installation, action.action, action.version)
      if (!next) return { ...state, notice: notice('warning', '当前插件状态不支持此操作', '未修改安装记录或 Agent 组件使用位置') }
      const labels: Record<PluginAction, string> = { install: '安装', update: '更新', rollback: '回滚', uninstall: '卸载' }
      return { ...state, pluginInstallations: state.pluginInstallations.map((item) => item.pluginId === action.pluginId ? next : item), notice: notice('success', `插件已模拟${labels[action.action]}`, '仅更新当前页面中的插件安装记录 · 未探测、下载、执行安装脚本或写入文件 · 未自动增删 Agent 组件使用位置') }
    }
    case 'UPDATE_BACKUP_SETTINGS':
      return { ...state, backupSettings: { ...state.backupSettings, ...action.changes }, notice: notice('info', '备份演示策略已更新', '仅在当前页面有效 · 未连接 Git、上传文件或读取凭据') }
    case 'CREATE_MEMORY_CANDIDATE': {
      if (state.memoryCandidates.some((item) => item.id === action.candidate.id)) return { ...state, notice: notice('warning', '无法创建正式记忆候选', '候选 ID 已存在') }
      const governance = resolveMemoryGovernance(state, action.candidate.spaceId, action.candidate.proposerAgentId)
      if (!governance.canPropose || !governance.reviewerAgentId) {
        return { ...state, notice: notice('error', '无法创建正式记忆候选', governance.errors.join(' ')) }
      }
      const candidate = { ...action.candidate, reviewerAgentId: governance.reviewerAgentId }
      return { ...state, memoryCandidates: [...state.memoryCandidates, candidate], notice: notice('success', '正式记忆候选已创建', '尚未写入正式记忆') }
    }
    case 'SYNC_FORMAL_MEMORY_CANDIDATE': {
      return {
        ...state,
        ...mergeFormalMemoryBundles(state, [action.bundle]),
        notice: notice('success', '正式记忆候选已创建', '已保存到本机审核队列，尚未写入正式 Memory'),
      }
    }
    case 'HYDRATE_FORMAL_MEMORY_REVIEWS':
      return { ...state, ...mergeFormalMemoryBundles(state, action.bundles) }
    case 'SYNC_FORMAL_MEMORY_REVIEW': {
      const { result } = action
      if (!('candidate' in result)) return state
      const status: MemoryCandidateStatus = result.kind === 'saved'
        ? '已写入正式 Revision'
        : result.kind === 'review_recorded'
          ? result.candidate.status === 'changes_requested' ? '要求修改' : '已驳回'
          : '已批准'
      return {
        ...state,
        memoryCandidates: state.memoryCandidates.map((item) => item.id === result.candidate.id ? { ...item, status } : item),
        memorySpaces: result.kind === 'saved'
          ? state.memorySpaces.map((space) => space.id === result.revision.spaceId ? { ...space, revision: result.revision.id } : space)
          : state.memorySpaces,
      }
    }
    case 'REVIEW_MEMORY_CANDIDATE': {
      const candidate = state.memoryCandidates.find((item) => item.id === action.candidateId)
      if (!candidate) return { ...state, notice: notice('warning', '无法审核正式记忆候选', '候选不存在') }
      const governance = resolveMemoryGovernance(state, candidate.spaceId, candidate.proposerAgentId)
      if (action.status === '已写入演示 Revision' && (!governance.canReview || governance.reviewerAgentId !== candidate.reviewerAgentId)) {
        return { ...state, notice: notice('error', '无法批准正式记忆候选', governance.errors.join(' ') || '审核关系已变化，请重新创建或改投候选。') }
      }
      if (candidate.status === '已写入演示 Revision') return { ...state, notice: notice('warning', '候选已经写入演示 Revision', '不会重复递增 Revision') }
      const memorySpaces = action.status === '已写入演示 Revision' ? state.memorySpaces.map((space) => space.id === candidate.spaceId ? { ...space, revision: `r${Number(space.revision.replace(/\D/g, '') || 0) + 1}` } : space) : state.memorySpaces
      return {
        ...state,
        memorySpaces,
        memoryCandidates: state.memoryCandidates.map((item) => item.id === action.candidateId ? { ...item, status: action.status } : item),
        dialog: null,
        notice: action.status === '已写入演示 Revision'
          ? notice('success', '候选已模拟写入正式记忆', '已创建新 Revision · 未写入磁盘')
          : notice('info', `候选状态已更新为${action.status}`, '仅在当前页面有效'),
      }
    }
    case 'CREATE_DEMO_BACKUP_SNAPSHOT':
      return { ...state, backupSnapshots: [action.snapshot, ...state.backupSnapshots], notice: notice('success', '已创建演示快照记录', '未读取、打包或写入真实文件') }
    case 'SIMULATE_RESTORE':
      return { ...state, backupSnapshots: [action.beforeSnapshot, ...state.backupSnapshots], dialog: null, notice: notice('info', `已记录模拟恢复 ${action.snapshotId}`, '未恢复任何真实文件') }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.changes }, notice: notice('success', '设置已在当前页面更新', '未写入配置文件') }
    case 'RECORD_RECENT_AGENT': {
      if (!state.agents.some((item) => item.id === action.agentId) || state.recentAgentIds.includes(action.agentId)) return state
      return { ...state, recentAgentIds: [action.agentId, ...state.recentAgentIds].slice(0, 6) }
    }
    case 'REMOVE_RECENT_AGENT': {
      if (!state.recentAgentIds.includes(action.agentId)) return state
      return {
        ...state,
        recentAgentIds: state.recentAgentIds.filter((id) => id !== action.agentId),
        notice: notice('info', '已从最近访问中移除', '仅影响当前页面'),
      }
    }
    case 'CLEAR_RECENT_AGENTS':
      return state.recentAgentIds.length
        ? { ...state, recentAgentIds: [], notice: notice('info', '最近访问记录已清空', '仅影响当前页面') }
        : state
    case 'ADD_CUSTOM_AI_CLIENT': {
      const normalizedName = action.client.name.trim()
      const duplicate = state.aiClients.some((item) => item.id === action.client.id || item.name.trim().toLowerCase() === normalizedName.toLowerCase())
      if (!normalizedName || duplicate) return state
      const client = { ...action.client, name: normalizedName, persistence: 'memory-only' as const }
      return { ...state, aiClients: [...state.aiClients, client], notice: notice('info', `${client.name}已添加`, '仅登记到当前页面 · 未探测本机 · 未写入磁盘') }
    }
    case 'SAVE_CONFIGURATION_ENVIRONMENT': {
      const environment = normalizeConfigurationEnvironment(action.environment)
      const clientIds = state.aiClients.map((client) => client.id)
      const errors = validateConfigurationEnvironment(environment, clientIds)
      const path = configurationEnvironmentPath(environment)
      const content = serializeConfigurationEnvironment(environment, clientIds)
      const duplicateName = state.configurationEnvironments.some((item) => item.id !== environment.id && item.name.trim().toLowerCase() === environment.name.toLowerCase())
      if (Object.keys(errors).length || !path || content === undefined || duplicateName) return { ...state, notice: notice('error', '无法记录配置方案', duplicateName ? '方案名称重复' : '方案字段、工具引用或路径无效') }
      const appended = appendConfigRevision(state.configRevisions, {
        ownerType: 'configuration-environment', ownerId: environment.id, path, content,
        summary: `保存 ${environment.name} 演示配置方案`, payload: environment, evidence: 'memory-only',
      })
      if (!appended.created) return state
      const exists = state.configurationEnvironments.some((item) => item.id === environment.id)
      return {
        ...state,
        configurationEnvironments: exists
          ? state.configurationEnvironments.map((item) => item.id === environment.id ? { ...environment, evidence: 'memory-only' } : item)
          : [...state.configurationEnvironments, { ...environment, evidence: 'memory-only' }],
        configRevisions: appended.revisions,
        notice: notice('success', '配置方案已记录', `${path} · 未读取或修改真实工具配置`),
      }
    }
    case 'CREATE_CONFIGURATION_ENVIRONMENT': {
      const source = action.sourceEnvironmentId
        ? state.configurationEnvironments.find((item) => item.id === action.sourceEnvironmentId)
        : undefined
      if (action.sourceEnvironmentId && !source) return { ...state, notice: notice('error', '无法创建配置方案', '复制来源不存在') }
      if (state.configurationEnvironments.some((item) => item.id === action.environment.id || item.name.trim().toLowerCase() === action.environment.name.trim().toLowerCase())) return { ...state, notice: notice('error', '无法创建配置方案', '方案 ID 或名称重复') }
      const environment = {
        ...action.environment,
        clientIds: source ? [...source.clientIds] : [...action.environment.clientIds],
      }
      const saved = reducer(state, { type: 'SAVE_CONFIGURATION_ENVIRONMENT', environment })
      return saved.configRevisions === state.configRevisions ? saved : { ...saved, currentConfigurationEnvironmentId: environment.id }
    }
    case 'SELECT_CONFIGURATION_ENVIRONMENT':
      return state.configurationEnvironments.some((item) => item.id === action.environmentId)
        ? { ...state, currentConfigurationEnvironmentId: action.environmentId, notice: notice('info', '当前配置方案已切换', '仅影响当前页面，未切换真实工具配置') }
        : { ...state, notice: notice('error', '无法切换配置方案', '目标方案不存在') }
    case 'SET_ENVIRONMENT_CLIENT_REGISTRATION': {
      const environment = state.configurationEnvironments.find((item) => item.id === action.environmentId)
      if (!environment || !state.aiClients.some((item) => item.id === action.clientId)) return { ...state, notice: notice('error', '无法更新工具登记', '配置方案或工具不存在') }
      const clientIds = action.registered
        ? [...new Set([...environment.clientIds, action.clientId])]
        : environment.clientIds.filter((id) => id !== action.clientId)
      return reducer(state, { type: 'SAVE_CONFIGURATION_ENVIRONMENT', environment: { ...environment, clientIds } })
    }
    case 'SHOW_NOTICE':
      return { ...state, notice: notice(action.notice.tone, action.notice.title, action.notice.description, action.notice.duration) }
    case 'CLEAR_NOTICE':
      return !action.id || state.notice?.id === action.id ? { ...state, notice: undefined } : state
    case 'TOAST':
      return { ...state, notice: action.text ? notice('info', '演示操作未执行系统能力', action.text) : undefined }
  }
}

export type UiPreviewAssets = { logo?: string | null; background?: string | null }

type AppContextValue = {
  state: State
  dispatch: React.Dispatch<Action>
  effectiveUiPreferences: UiPreferences
  effectiveTheme: EffectiveTheme
  uiPreviewAssets?: UiPreviewAssets
  setUiPreferencesPreview: (preferences?: UiPreferences, assets?: UiPreviewAssets) => void
}

const Ctx = createContext<AppContextValue | null>(null)

export function AppProvider({ children, initialState: providedState }: { children: ReactNode; initialState?: State }) {
  const [state, dispatch] = useReducer(reducer, providedState ?? (isDesktopRuntime() ? createDesktopInitialState() : initialState))
  const [preview, setPreview] = useState<{ preferences: UiPreferences; assets?: UiPreviewAssets }>()
  const [prefersDark, setPrefersDark] = useState(() => providedState?.theme === 'dark')
  const effectiveUiPreferences = preview?.preferences ?? state.uiPreferences
  const effectiveTheme = resolveTheme(effectiveUiPreferences.theme, prefersDark)
  const setUiPreferencesPreview = useCallback((preferences?: UiPreferences, assets?: UiPreviewAssets) => {
    setPreview(preferences ? { preferences, assets } : undefined)
  }, [])

  useEffect(() => {
    if (providedState || !isDesktopRuntime()) return
    const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
    void listAgents()
      .then((agents) => dispatch({ type: 'HYDRATE_MANAGED_AGENTS', agents }))
      .catch((error) => dispatch({ type: 'FAIL_MANAGED_AGENTS_HYDRATION', message: errorMessage(error) }))
    void loadOrganizationSnapshot()
      .then((snapshot) => dispatch({ type: 'HYDRATE_ORGANIZATION', ...snapshot }))
      .catch((error) => dispatch({ type: 'FAIL_ORGANIZATION_HYDRATION', message: errorMessage(error) }))
    void listAgentRecoveryOperations()
      .then((operations) => dispatch({ type: 'HYDRATE_AGENT_RECOVERY', operations }))
      .catch((error) => dispatch({ type: 'FAIL_AGENT_RECOVERY_HYDRATION', message: errorMessage(error) }))
  }, [providedState])

  useEffect(() => {
    if (providedState) return
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
    const update = () => setPrefersDark(media?.matches ?? false)
    update()
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [providedState])

  useEffect(() => {
    const root = document.documentElement
    const accent = getAccessibleAccent(effectiveUiPreferences.accentColor)
    root.classList.toggle('dark', effectiveTheme === 'dark')
    root.dataset.theme = effectiveTheme
    root.dataset.interfaceFont = effectiveUiPreferences.interfaceFont
    root.dataset.monoFont = effectiveUiPreferences.monoFont
    root.dataset.fontScale = effectiveUiPreferences.fontScale
    root.dataset.density = effectiveUiPreferences.density
    root.dataset.backgroundStyle = effectiveUiPreferences.backgroundStyle
    root.style.setProperty('--accent', accent?.color ?? DEFAULT_UI_PREFERENCES.accentColor)
    root.style.setProperty('--accent-foreground', accent?.foreground ?? '#ffffff')
    root.style.setProperty('--background-dim', `${effectiveUiPreferences.backgroundDim / 100}`)
  }, [effectiveTheme, effectiveUiPreferences])

  useEffect(() => {
    try {
      saveUiPreferences(localStorage, state.uiPreferences)
    } catch {
      /* 本机偏好写入失败时仍保留当前会话效果 */
    }
  }, [state.uiPreferences])

  const value = useMemo<AppContextValue>(() => ({
    state,
    dispatch,
    effectiveUiPreferences,
    effectiveTheme,
    uiPreviewAssets: preview?.assets,
    setUiPreferencesPreview,
  }), [effectiveTheme, effectiveUiPreferences, preview?.assets, setUiPreferencesPreview, state])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useApp 必须在 AppProvider 中使用')
  return value
}
