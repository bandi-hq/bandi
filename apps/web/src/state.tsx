import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { aiClients as initialAiClients, type AiClient } from './mock'
import { resolveMemoryGovernance } from './memory-policy'
import {
  initialAgents,
  initialAssets,
  initialBackupSnapshots,
  initialCompanies,
  initialDepartments,
  initialMemoryCandidates,
  initialMemorySpaces,
  initialWorkspaces,
  type BackupSnapshot,
  type Company,
  type FullAgent,
  type FullAsset,
  type FullDepartment,
  type FullWorkspace,
  type MemoryCandidate,
  type MemoryCandidateStatus,
  type MemorySpace,
} from './domain'
import { applySkillAction, type SkillAction } from './skill-installation'

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
  | { kind: 'client-guide'; workspaceId?: string; view?: 'overview' | 'quick' | 'terminal' | 'records' }
  | { kind: 'add-ai-client' }
  | { kind: 'workspace-responsibility'; workspaceId: string }
  | { kind: 'remove-workspace-index'; workspaceId: string }
  | { kind: 'backup-restore'; snapshotId: string }
  | { kind: 'organization'; entity: 'company' | 'department'; id?: string; mode: 'create' | 'edit' }
  | null

export type BackupSettings = {
  gitConnection: { status: 'disconnected'; visibility: 'private' } | { status: 'connected-demo'; visibility: 'private'; repository: string }
  formalMemoryRemote: 'excluded' | 'confirmed'
}

export type SettingsState = {
  language: '简体中文' | 'English'
  defaultWorkspaceAssociation: '暂不关联' | '当前公司'
  agentRoot: string
  editor: string
  terminal: string
  externalChangeInterval: '手动' | '5 分钟' | '15 分钟'
  autoSnapshot: boolean
}

export type State = {
  agents: FullAgent[]
  companies: Company[]
  departments: FullDepartment[]
  workspaces: FullWorkspace[]
  assets: FullAsset[]
  memorySpaces: MemorySpace[]
  memoryCandidates: MemoryCandidate[]
  backupSnapshots: BackupSnapshot[]
  backupSettings: BackupSettings
  settings: SettingsState
  aiClients: AiClient[]
  activeAiClientId: string
  currentWorkspaceId: string | null
  theme: 'light' | 'dark'
  dialog: DialogState
  notice?: Notice
}

export type Action =
  | { type: 'THEME' }
  | { type: 'OPEN_DIALOG'; dialog: Exclude<DialogState, null> }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SHEET'; sheet: 'diff' | 'source' | 'shared' | 'conflict' | 'permission' | 'memory' | 'claude' | 'add-ai-client' | null }
  | { type: 'CREATE_AGENT'; agent: FullAgent }
  | { type: 'UPDATE_AGENT'; agentId: string; changes: Partial<FullAgent>; message?: string }
  | { type: 'SET_AGENT_LIFECYCLE'; agentId: string; status: FullAgent['status'] }
  | { type: 'SAVE_INSTRUCTIONS'; agentId?: string; text: string }
  | { type: 'CREATE_COMPANY'; company: Company }
  | { type: 'UPDATE_COMPANY'; companyId: string; changes: Partial<Company> }
  | { type: 'CREATE_DEPARTMENT'; department: FullDepartment }
  | { type: 'UPDATE_DEPARTMENT'; departmentId: string; changes: Partial<FullDepartment> }
  | { type: 'ADD_WORKSPACE'; workspace: FullWorkspace }
  | { type: 'UPDATE_WORKSPACE'; workspaceId: string; changes: Partial<FullWorkspace> }
  | { type: 'REMOVE_WORKSPACE_INDEX'; workspaceId: string }
  | { type: 'SELECT_WORKSPACE'; workspaceId: string }
  | { type: 'UPDATE_ASSET'; assetId: string; changes: Partial<FullAsset>; message?: string }
  | { type: 'CREATE_ASSET'; asset: FullAsset }
  | { type: 'APPLY_SKILL_ACTION'; skillId: string; action: SkillAction; version?: string }
  | { type: 'UPDATE_BACKUP_SETTINGS'; changes: Partial<BackupSettings> }
  | { type: 'CREATE_MEMORY_CANDIDATE'; candidate: MemoryCandidate }
  | { type: 'REVIEW_MEMORY_CANDIDATE'; candidateId: string; status: MemoryCandidateStatus }
  | { type: 'CREATE_DEMO_BACKUP_SNAPSHOT'; snapshot: BackupSnapshot }
  | { type: 'SIMULATE_RESTORE'; snapshotId: string; beforeSnapshot: BackupSnapshot }
  | { type: 'UPDATE_SETTINGS'; changes: Partial<SettingsState> }
  | { type: 'SELECT_AI_CLIENT'; clientId: string }
  | { type: 'ENABLE_AI_CLIENT'; clientId: string }
  | { type: 'DISABLE_AI_CLIENT'; clientId: string }
  | { type: 'ADD_CUSTOM_AI_CLIENT'; client: AiClient }
  | { type: 'SHOW_NOTICE'; notice: Omit<Notice, 'id'> }
  | { type: 'CLEAR_NOTICE'; id?: string }
  | { type: 'TOAST'; text?: string }

function getInitialTheme(): State['theme'] {
  try {
    return localStorage.getItem('bandi-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const initialState: State = {
  agents: initialAgents,
  companies: initialCompanies,
  departments: initialDepartments,
  workspaces: initialWorkspaces,
  assets: initialAssets,
  memorySpaces: initialMemorySpaces,
  memoryCandidates: initialMemoryCandidates,
  backupSnapshots: initialBackupSnapshots,
  backupSettings: { gitConnection: { status: 'disconnected', visibility: 'private' }, formalMemoryRemote: 'excluded' },
  settings: {
    language: '简体中文',
    defaultWorkspaceAssociation: '暂不关联',
    agentRoot: '~/.bandi/agents',
    editor: 'Visual Studio Code',
    terminal: '系统默认终端',
    externalChangeInterval: '5 分钟',
    autoSnapshot: true,
  },
  aiClients: initialAiClients,
  activeAiClientId: 'claude-code',
  currentWorkspaceId: 'bandi',
  theme: getInitialTheme(),
  dialog: null,
}

let noticeId = 0
const notice = (tone: NoticeTone, title: string, description?: string, duration = 5000): Notice => ({
  id: `notice-${++noticeId}`,
  tone,
  title,
  description,
  duration,
})

const clientNotice = (name: string, action: string) =>
  notice('success', `${name}${action}`, '仅更新当前页面内存 · 未探测本机 · 未写入磁盘')

const legacyDialog = (sheet: Exclude<Extract<Action, { type: 'SHEET' }>['sheet'], null>, state: State): Exclude<DialogState, null> => {
  if (sheet === 'claude') return { kind: 'client-guide', workspaceId: state.currentWorkspaceId ?? undefined }
  if (sheet === 'add-ai-client') return { kind: 'add-ai-client' }
  if (sheet === 'permission') return { kind: 'permission', agentId: 'zhouce' }
  if (sheet === 'memory') return { kind: 'memory', candidateId: state.memoryCandidates.find((item) => item.status === '待审核')?.id ?? state.memoryCandidates[0]?.id ?? 'MC-028' }
  if (sheet === 'shared') return { kind: 'shared', assetId: 'rule-common' }
  return { kind: sheet }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    case 'OPEN_DIALOG':
      return { ...state, dialog: action.dialog }
    case 'CLOSE_DIALOG':
      return { ...state, dialog: null }
    case 'SHEET':
      return { ...state, dialog: action.sheet ? legacyDialog(action.sheet, state) : null }
    case 'CREATE_AGENT':
      if (state.agents.some((item) => item.id === action.agent.id || item.name === action.agent.name)) return state
      return { ...state, agents: [...state.agents, action.agent], notice: notice('success', `${action.agent.name} 已添加到演示配置`, '未创建真实 AgentPackage') }
    case 'UPDATE_AGENT':
      return { ...state, agents: state.agents.map((item) => item.id === action.agentId ? { ...item, ...action.changes, updated: '刚刚' } : item), notice: notice('success', 'Agent 演示配置已更新', action.message ?? '仅当前页面内存 · 未写入磁盘') }
    case 'SET_AGENT_LIFECYCLE':
      return { ...state, agents: state.agents.map((item) => item.id === action.agentId ? { ...item, status: action.status, updated: '刚刚' } : item), notice: notice('success', `生命周期已更新为${action.status}`, 'AgentPackage 与正式记忆仍保留') }
    case 'SAVE_INSTRUCTIONS': {
      const agentId = action.agentId ?? 'zhouce'
      return { ...state, agents: state.agents.map((item) => item.id === agentId ? { ...item, instructions: action.text, updated: '刚刚' } : item), notice: notice('success', 'Instructions 演示配置已更新', `目标：~/.bandi/agents/agt_${agentId}/instructions.md · 仅当前页面内存 · 未写入真实文件`) }
    }
    case 'CREATE_COMPANY':
      if (state.companies.some((item) => item.id === action.company.id)) return state
      return { ...state, companies: [...state.companies, action.company], notice: notice('success', 'Company 已加入演示组织', '仅当前页面内存') }
    case 'UPDATE_COMPANY':
      return { ...state, companies: state.companies.map((item) => item.id === action.companyId ? { ...item, ...action.changes } : item), notice: notice('success', 'Company 演示信息已更新', '未写入文件') }
    case 'CREATE_DEPARTMENT':
      if (state.departments.some((item) => item.id === action.department.id)) return state
      return { ...state, departments: [...state.departments, action.department], companies: state.companies.map((item) => item.id === action.department.companyId ? { ...item, departmentIds: [...item.departmentIds, action.department.id] } : item), notice: notice('success', '部门已加入演示组织', '未修改 AgentPackage') }
    case 'UPDATE_DEPARTMENT':
      return { ...state, departments: state.departments.map((item) => item.id === action.departmentId ? { ...item, ...action.changes } : item), notice: notice('success', '部门关系已更新', '未隐式修改 Agent 配置或权限') }
    case 'ADD_WORKSPACE':
      if (state.workspaces.some((item) => item.id === action.workspace.id)) return state
      return { ...state, workspaces: [...state.workspaces, action.workspace], currentWorkspaceId: action.workspace.id, notice: notice('success', 'Workspace 已添加到演示索引', '未读取或写入真实目录') }
    case 'UPDATE_WORKSPACE':
      return { ...state, workspaces: state.workspaces.map((item) => item.id === action.workspaceId ? { ...item, ...action.changes } : item), notice: notice('success', 'Workspace 演示关系已更新', '未修改目录或 AgentPackage') }
    case 'REMOVE_WORKSPACE_INDEX': {
      const target = state.workspaces.find((item) => item.id === action.workspaceId)
      if (!target) return { ...state, notice: notice('warning', '无法移除 Workspace', '目标已不在当前演示索引中') }
      const workspaces = state.workspaces.filter((item) => item.id !== action.workspaceId)
      return {
        ...state,
        workspaces,
        currentWorkspaceId: state.currentWorkspaceId === action.workspaceId ? workspaces[0]?.id ?? null : state.currentWorkspaceId,
        dialog: null,
        notice: notice('success', `${target.name} 已从演示索引移除`, '未删除目录、文件、Agent WorkspaceBinding、MemorySpace 或资产引用'),
      }
    }
    case 'SELECT_WORKSPACE':
      return state.workspaces.some((workspace) => workspace.id === action.workspaceId) ? { ...state, currentWorkspaceId: action.workspaceId } : state
    case 'UPDATE_ASSET':
      return { ...state, assets: state.assets.map((item) => item.id === action.assetId ? { ...item, ...action.changes } as FullAsset : item), notice: notice('success', '资产演示配置已更新', action.message ?? '仅当前页面内存 · 未写入真实文件') }
    case 'CREATE_ASSET':
      if (state.assets.some((item) => item.id === action.asset.id)) return state
      return { ...state, assets: [...state.assets, action.asset], notice: notice('success', '资产已创建在演示内存中', '未创建真实文件') }
    case 'APPLY_SKILL_ACTION': {
      const asset = state.assets.find((item) => item.id === action.skillId)
      if (!asset?.skill) return { ...state, notice: notice('warning', '无法更新 Skill 演示状态', '目标不存在或不是可管理的 Skill') }
      const installation = applySkillAction(asset.skill.installation, action.action, action.version)
      if (!installation) return { ...state, notice: notice('warning', '当前 Skill 状态不支持此操作', '未修改安装事实或 Agent 引用') }
      const labels: Record<SkillAction, string> = { install: '安装', update: '更新', rollback: '回滚', uninstall: '卸载' }
      return { ...state, assets: state.assets.map((item) => item.id === asset.id && item.skill ? { ...item, status: action.action === 'uninstall' ? '可演示安装' : '演示已安装', skill: { ...item.skill, installation } } : item), notice: notice('success', `Skill 已模拟${labels[action.action]}`, '仅更新当前页面内存 · 未下载、复制或删除文件 · 未执行安装脚本 · 未自动分配给 Agent') }
    }
    case 'UPDATE_BACKUP_SETTINGS':
      return { ...state, backupSettings: { ...state.backupSettings, ...action.changes }, notice: notice('info', '备份演示策略已更新', '仅当前页面内存 · 未连接 Git、上传文件或读取凭据') }
    case 'CREATE_MEMORY_CANDIDATE': {
      if (state.memoryCandidates.some((item) => item.id === action.candidate.id)) return { ...state, notice: notice('warning', '无法创建正式记忆候选', '候选 ID 已存在') }
      const governance = resolveMemoryGovernance(state, action.candidate.spaceId, action.candidate.proposerAgentId)
      if (!governance.canPropose || !governance.reviewerAgentId) {
        return { ...state, notice: notice('error', '无法创建正式记忆候选', governance.errors.join(' ')) }
      }
      const candidate = { ...action.candidate, reviewerAgentId: governance.reviewerAgentId }
      return { ...state, memoryCandidates: [...state.memoryCandidates, candidate], notice: notice('success', '正式记忆候选已创建', '尚未写入 MemorySpace') }
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
          : notice('info', `候选状态已更新为${action.status}`, '仅当前页面内存'),
      }
    }
    case 'CREATE_DEMO_BACKUP_SNAPSHOT':
      return { ...state, backupSnapshots: [action.snapshot, ...state.backupSnapshots], notice: notice('success', '已创建演示快照记录', '未读取、打包或写入真实文件') }
    case 'SIMULATE_RESTORE':
      return { ...state, backupSnapshots: [action.beforeSnapshot, ...state.backupSnapshots], dialog: null, notice: notice('info', `已记录模拟恢复 ${action.snapshotId}`, '未恢复任何真实文件') }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.changes }, notice: notice('success', '设置已更新到当前页面内存', '未写入配置文件') }
    case 'SELECT_AI_CLIENT': {
      const client = state.aiClients.find((item) => item.id === action.clientId)
      return client?.enabled ? { ...state, activeAiClientId: client.id } : state
    }
    case 'ENABLE_AI_CLIENT': {
      const client = state.aiClients.find((item) => item.id === action.clientId)
      if (!client) return state
      return { ...state, aiClients: state.aiClients.map((item) => item.id === client.id ? { ...item, enabled: true, persistence: 'memory-only' } : item), activeAiClientId: client.id, notice: clientNotice(client.name, '已模拟启用') }
    }
    case 'DISABLE_AI_CLIENT': {
      const client = state.aiClients.find((item) => item.id === action.clientId)
      if (!client || client.isDefault) return state
      return { ...state, aiClients: state.aiClients.map((item) => item.id === client.id ? { ...item, enabled: false } : item), activeAiClientId: state.activeAiClientId === client.id ? 'claude-code' : state.activeAiClientId, notice: clientNotice(client.name, '已停用') }
    }
    case 'ADD_CUSTOM_AI_CLIENT': {
      const duplicate = state.aiClients.some((item) => item.id === action.client.id || item.name.toLowerCase() === action.client.name.toLowerCase())
      if (duplicate) return state
      return { ...state, aiClients: [...state.aiClients, { ...action.client, enabled: true, persistence: 'memory-only' }], activeAiClientId: action.client.id, notice: clientNotice(action.client.name, '已添加并启用') }
    }
    case 'SHOW_NOTICE':
      return { ...state, notice: notice(action.notice.tone, action.notice.title, action.notice.description, action.notice.duration) }
    case 'CLEAR_NOTICE':
      return !action.id || state.notice?.id === action.id ? { ...state, notice: undefined } : state
    case 'TOAST':
      return { ...state, notice: action.text ? notice('info', '演示操作未执行系统能力', action.text) : undefined }
  }
}

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null)

export function AppProvider({ children, initialState: providedState }: { children: ReactNode; initialState?: State }) {
  const [state, dispatch] = useReducer(reducer, providedState ?? initialState)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
    try {
      localStorage.setItem('bandi-theme', state.theme)
    } catch {
      /* 主题偏好持久化失败时仍可正常使用 */
    }
  }, [state.theme])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useApp() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useApp 必须在 AppProvider 中使用')
  return value
}
