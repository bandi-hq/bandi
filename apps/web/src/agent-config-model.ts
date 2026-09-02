import { AGENT_PACKAGE_SCHEMA_VERSION } from './agent-package-schema'
import { isParameterBinding, type ParameterBinding } from './component-parameters'
import type { AgentFile, ContextPolicy, ContextPolicyOverride, EvidenceKind, FullAgent, WorkspaceBinding, WorkspaceBindingConfig } from './domain'
import { validateOrchestrationOverride, validateOrchestrationPolicy, type OrchestrationPolicy } from './orchestration-policy'

export type AgentIdentityConfig = Pick<
  FullAgent,
  | 'id'
  | 'name'
  | 'roleId'
  | 'status'
  | 'companyId'
  | 'primaryDepartmentId'
  | 'managerAgentId'
  | 'avatarPath'
  | 'mission'
  | 'responsibilities'
  | 'deliverables'
  | 'decisionBoundaries'
  | 'escalationConditions'
  | 'prohibitions'
  | 'completionDefinition'
> & { schemaVersion: typeof AGENT_PACKAGE_SCHEMA_VERSION }

export type AgentContextConfig = {
  policy: ContextPolicy
  contextWindowTokens: number
  outputProfileId?: string
  outputParameterBindings?: ParameterBinding[]
}

export type AgentConfigPayload =
  | { kind: 'identity'; value: AgentIdentityConfig }
  | { kind: 'instructions'; value: string }
  | { kind: 'context'; value: AgentContextConfig }
  | { kind: 'skills'; value: string[] }
  | { kind: 'rules'; value: string[] }
  | { kind: 'mcp'; value: string[] }
  | { kind: 'permissions'; value: FullAgent['permissions'] }
  | { kind: 'sop'; value: string[] }
  | { kind: 'orchestration'; value: OrchestrationPolicy }
  | { kind: 'hooks'; value: FullAgent['hookRefs'] }
  | { kind: 'commands'; value: FullAgent['commandRefs'] }
  | { kind: 'workspace-binding'; value: WorkspaceBindingConfig }

export type SaveAgentConfigInput = AgentConfigPayload & { agentId: string }

const rootScope = { kind: 'agent-root' } as const
const quote = (value: string) => JSON.stringify(value)
const yamlList = (values: string[], indent = '  ') => values.length ? values.map((item) => `${indent}- ${quote(item)}`).join('\n') : `${indent}[]`

export const defaultContextPolicy: ContextPolicy = {
  enabled: true,
  triggerRatio: 0.8,
  targetRatio: 0.5,
  protectRecentTurns: 6,
  protectOpeningTurns: 2,
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000

export function validateContextWindowTokens(value: number): string[] {
  return Number.isInteger(value) && value >= 1_000 && value <= 2_000_000
    ? []
    : ['规划上下文窗口必须是 1,000 到 2,000,000 之间的整数。']
}

export function validateContextPolicy(policy: ContextPolicy): string[] {
  const errors: string[] = []
  if (!Number.isFinite(policy.triggerRatio) || policy.triggerRatio < 0.5 || policy.triggerRatio > 0.95) errors.push('触发比例必须在 50% 到 95% 之间。')
  if (!Number.isFinite(policy.targetRatio) || policy.targetRatio < 0.2 || policy.targetRatio > 0.8) errors.push('目标比例必须在 20% 到 80% 之间。')
  if (policy.targetRatio > policy.triggerRatio - 0.1) errors.push('目标比例必须至少比触发比例低 10 个百分点。')
  if (!Number.isInteger(policy.protectRecentTurns) || policy.protectRecentTurns < 0 || policy.protectRecentTurns > 20) errors.push('保护最近轮次必须是 0 到 20 的整数。')
  if (!Number.isInteger(policy.protectOpeningTurns) || policy.protectOpeningTurns < 0 || policy.protectOpeningTurns > 10) errors.push('保护开头轮次必须是 0 到 10 的整数。')
  return errors
}

export function isContextPolicyOverride(value: unknown): value is ContextPolicyOverride {
  if (!isRecord(value)) return false
  const allowed = new Set(['enabled', 'triggerRatio', 'targetRatio', 'protectRecentTurns', 'protectOpeningTurns'])
  return Object.entries(value).every(([key, item]) => allowed.has(key) && (
    key === 'enabled' ? typeof item === 'boolean' : typeof item === 'number'
  ))
}

export function mergeContextPolicy(policy: ContextPolicy, override?: ContextPolicyOverride): ContextPolicy {
  return { ...policy, ...override }
}

export function parseAgentContextConfig(content: string): AgentContextConfig | undefined {
  const scalar = (key: string) => content.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'))?.[1]
  const enabled = scalar('enabled')
  const triggerRatio = Number(scalar('triggerRatio'))
  const targetRatio = Number(scalar('targetRatio'))
  const protectRecentTurns = Number(scalar('protectRecentTurns'))
  const protectOpeningTurns = Number(scalar('protectOpeningTurns'))
  const contextWindowSource = scalar('contextWindowTokens')
  const contextWindowTokens = contextWindowSource === undefined ? DEFAULT_CONTEXT_WINDOW_TOKENS : Number(contextWindowSource)
  if (scalar('schemaVersion') !== String(AGENT_PACKAGE_SCHEMA_VERSION) || !['true', 'false'].includes(enabled ?? '')) return undefined
  const policy: ContextPolicy = { enabled: enabled === 'true', triggerRatio, targetRatio, protectRecentTurns, protectOpeningTurns }
  if (validateContextPolicy(policy).length || validateContextWindowTokens(contextWindowTokens).length) return undefined
  const profileSource = scalar('outputProfileId')
  const bindingsSource = scalar('outputParameterBindings')
  if (profileSource === undefined || bindingsSource === undefined) return undefined
  let outputProfileId: string
  let bindings: unknown
  try {
    outputProfileId = JSON.parse(profileSource) as string
    bindings = JSON.parse(bindingsSource)
  } catch {
    return undefined
  }
  if (typeof outputProfileId !== 'string' || !Array.isArray(bindings) || !bindings.every(isParameterBinding)) return undefined
  return { policy, contextWindowTokens, outputProfileId: outputProfileId || undefined, outputParameterBindings: bindings }
}

function parseCanonicalReferenceList(content: string, key: 'rules' | 'skills' | 'mcp' | 'sop'): string[] | undefined {
  const lines = content.split(/\r?\n/)
  if (lines[0] !== `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}` || lines[1] !== `${key}:`) return undefined
  const body = lines.slice(2).filter((line) => line.length > 0)
  if (body.length === 1 && body[0] === '  []') return []
  const refs: string[] = []
  for (const line of body) {
    const match = line.match(/^ {2}- ("(?:[^"\\]|\\.)*")$/)
    if (!match) return undefined
    let value: unknown
    try {
      value = JSON.parse(match[1])
    } catch {
      return undefined
    }
    if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value) || value === '.' || value === '..' || refs.includes(value)) return undefined
    refs.push(value)
  }
  return refs.length <= 500 ? refs : undefined
}

export const parseAgentRuleRefs = (content: string) => parseCanonicalReferenceList(content, 'rules')
export const parseAgentSkillRefs = (content: string) => parseCanonicalReferenceList(content, 'skills')
export const parseAgentMcpRefs = (content: string) => parseCanonicalReferenceList(content, 'mcp')
export const parseAgentSopRefs = (content: string) => parseCanonicalReferenceList(content, 'sop')

function isSafeComponentBinding(binding: ParameterBinding) {
  if (!isSafePathSegment(binding.parameterId)) return false
  if (binding.type === 'number') return Number.isFinite(binding.value)
  if (binding.type === 'boolean') return true
  if (binding.type === 'string-list') return binding.value.length <= 100 && binding.value.every((item) => item.length <= 4096 && !item.includes('\0'))
  return binding.value.length <= 4096 && !binding.value.includes('\0')
}

function isSafeComponentReferences(references: unknown): references is FullAgent['hookRefs'] {
  if (!Array.isArray(references) || references.length > 500) return false
  const assetIds = new Set<string>()
  for (const reference of references) {
    if (!isRecord(reference) || Object.keys(reference).some((field) => field !== 'assetId' && field !== 'parameterBindings')
      || typeof reference.assetId !== 'string' || !isSafePathSegment(reference.assetId) || assetIds.has(reference.assetId)
      || !Array.isArray(reference.parameterBindings) || reference.parameterBindings.length > 100
      || !reference.parameterBindings.every((binding) => isParameterBinding(binding) && isSafeComponentBinding(binding))) return false
    const parameterIds = new Set<string>()
    for (const binding of reference.parameterBindings) {
      if (!isSafePathSegment(binding.parameterId) || parameterIds.has(binding.parameterId)) return false
      parameterIds.add(binding.parameterId)
    }
    assetIds.add(reference.assetId)
  }
  return true
}

export function parseAgentComponentRefs(content: string, key: 'hooks' | 'commands'): FullAgent['hookRefs'] | undefined {
  const lines = content.split(/\r?\n/)
  if (lines.length !== 2 || lines[0] !== `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}` || !lines[1].startsWith(`${key}: `)) return undefined
  let references: unknown
  try { references = JSON.parse(lines[1].slice(`${key}: `.length)) } catch { return undefined }
  return isSafeComponentReferences(references) ? references : undefined
}

export function parseAgentOrchestrationPolicy(content: string): OrchestrationPolicy | undefined {
  const lines = content.split(/\r?\n/)
  if (lines.length !== 2 || lines[0] !== `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}` || !lines[1].startsWith('orchestration: ')) return undefined
  let policy: unknown
  try { policy = JSON.parse(lines[1].slice('orchestration: '.length)) } catch { return undefined }
  if (!isRecord(policy)) return undefined
  const allowed = new Set([
    'enabled', 'maxDelegationDepth', 'allowedAgentIds', 'allowedRoleIds', 'allowedDepartmentIds',
    'requireWorkspaceBinding', 'requireSopMatch', 'requireServiceGrantForCrossDepartment',
    'escalationAgentId', 'escalationConditions', 'prohibitions',
  ])
  if (Object.keys(policy).some((key) => !allowed.has(key)) || !isAgentConfigPayload({ kind: 'orchestration', value: policy })) return undefined
  return policy as OrchestrationPolicy
}

export function parseAgentPermissions(content: string): FullAgent['permissions'] | undefined {
  const lines = content.split(/\r?\n/)
  const keys = ['files', 'commands', 'network', 'delegation'] as const
  if (lines.length !== 6 || lines[0] !== `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}` || lines[1] !== 'permissions:') return undefined
  const permissions = {} as FullAgent['permissions']
  for (const [index, key] of keys.entries()) {
    const match = lines[index + 2]?.match(new RegExp(`^ {2}${key}: ("(?:[^"\\\\]|\\\\.)*")$`))
    if (!match) return undefined
    let value: unknown
    try { value = JSON.parse(match[1]) } catch { return undefined }
    if (typeof value !== 'string' || !value || value.length > 256 || value.includes('\0')) return undefined
    permissions[key] = value
  }
  return permissions
}

export function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
}

export function workspaceConfigPath(workspaceId: string): string | undefined {
  return isSafePathSegment(workspaceId) ? `workspaces/${workspaceId}/config.yaml` : undefined
}

function hasSafeUniqueIds(values: string[]) {
  return values.length <= 500 && new Set(values).size === values.length && values.every(isSafePathSegment)
}

function isSafeContextOverride(root: ContextPolicy, override: ContextPolicyOverride) {
  return isContextPolicyOverride(override)
    && !(override.enabled === true && !root.enabled)
    && !(override.triggerRatio !== undefined && override.triggerRatio > root.triggerRatio)
    && !(override.targetRatio !== undefined && override.targetRatio > root.targetRatio)
    && !(override.protectRecentTurns !== undefined && override.protectRecentTurns < root.protectRecentTurns)
    && !(override.protectOpeningTurns !== undefined && override.protectOpeningTurns < root.protectOpeningTurns)
}

export function validateWorkspaceBindingConfig(agent: FullAgent, value: WorkspaceBindingConfig): string[] {
  const errors: string[] = []
  const allowed = new Set(['workspaceId', 'instructions', 'ruleIds', 'skillIds', 'mcpIds', 'contextPolicy', 'outputProfileId', 'outputParameterBindings', 'orchestrationPolicy', 'hookRefs', 'commandRefs'])
  if (Object.keys(value).some((key) => !allowed.has(key))) errors.push('WorkspaceBinding 普通配置包含未知字段；正式记忆修订不能在此写入。')
  if (!workspaceConfigPath(value.workspaceId)) errors.push('WorkspaceBinding 必须使用合法稳定的 Workspace ID。')
  if (value.instructions.length > 64 * 1024 || value.instructions.includes('\0')) errors.push('专属 Instructions 禁止空字符且不能超过 64 KiB。')
  if (![value.ruleIds, value.skillIds, value.mcpIds].every(hasSafeUniqueIds)) errors.push('Rule、Skill 与 MCP 引用必须是不重复的稳定资产 ID，且每类最多 500 项。')
  if (value.contextPolicy && (!isSafeContextOverride(agent.contextPolicy, value.contextPolicy) || validateContextPolicy(mergeContextPolicy(agent.contextPolicy, value.contextPolicy)).length)) errors.push('工作区上下文覆盖无效或扩大了根级策略。')
  if (value.outputProfileId !== undefined && !isSafePathSegment(value.outputProfileId)) errors.push('输出格式必须使用稳定资产 ID。')
  if ((value.outputParameterBindings?.length ?? 0) > 100 || !(value.outputParameterBindings ?? []).every((binding) => isParameterBinding(binding) && isSafeComponentBinding(binding))) errors.push('输出参数覆盖包含非法、敏感或过大的值。')
  if (value.orchestrationPolicy && validateOrchestrationOverride(agent.orchestrationPolicy, value.orchestrationPolicy).length) errors.push('工作区协作策略只能收紧根级策略。')
  if (value.hookRefs !== undefined && !isSafeComponentReferences(value.hookRefs)) errors.push('Hook 局部引用无效。')
  if (value.commandRefs !== undefined && !isSafeComponentReferences(value.commandRefs)) errors.push('Command 局部引用无效。')
  return errors
}

export function parseWorkspaceBindingConfig(content: string, agent: FullAgent): WorkspaceBindingConfig | undefined {
  const lines = content.split(/\r?\n/)
  if (lines.length !== 2 || lines[0] !== `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}` || !lines[1].startsWith('workspaceBinding: ')) return undefined
  let value: unknown
  try { value = JSON.parse(lines[1].slice('workspaceBinding: '.length)) } catch { return undefined }
  if (!isRecord(value)) return undefined
  const allowed = new Set(['workspaceId', 'instructions', 'ruleIds', 'skillIds', 'mcpIds', 'contextPolicy', 'outputProfileId', 'outputParameterBindings', 'orchestrationPolicy', 'hookRefs', 'commandRefs'])
  if (Object.keys(value).some((key) => !allowed.has(key)) || 'memoryRevision' in value) return undefined
  const payload = { kind: 'workspace-binding' as const, value }
  return isAgentConfigPayload(payload) && !validateWorkspaceBindingConfig(agent, payload.value).length ? payload.value : undefined
}

export const agentRootConfigPaths = {
  identity: 'agent.yaml',
  instructions: 'instructions.md',
  context: 'config/context.yaml',
  skills: 'config/skills.yaml',
  rules: 'config/rules.yaml',
  mcp: 'config/mcp.yaml',
  permissions: 'config/permissions.yaml',
  sop: 'config/sop.yaml',
  orchestration: 'config/orchestration.yaml',
  hooks: 'config/hooks.yaml',
  commands: 'config/commands.yaml',
} as const satisfies Record<Exclude<AgentConfigPayload['kind'], 'workspace-binding'>, string>

export function getAgentConfigPath(payload: AgentConfigPayload): string | undefined {
  return payload.kind === 'workspace-binding'
    ? workspaceConfigPath(payload.value.workspaceId)
    : agentRootConfigPaths[payload.kind]
}

export function snapshotAgentConfig(agent: FullAgent, kind: AgentConfigPayload['kind'], workspaceId?: string): AgentConfigPayload | undefined {
  switch (kind) {
    case 'identity': return { kind, value: {
      schemaVersion: AGENT_PACKAGE_SCHEMA_VERSION,
      id: agent.id,
      name: agent.name,
      roleId: agent.roleId,
      status: agent.status,
      companyId: agent.companyId,
      primaryDepartmentId: agent.primaryDepartmentId,
      managerAgentId: agent.managerAgentId,
      avatarPath: agent.avatarPath,
      mission: agent.mission,
      responsibilities: agent.responsibilities,
      deliverables: agent.deliverables,
      decisionBoundaries: agent.decisionBoundaries,
      escalationConditions: agent.escalationConditions,
      prohibitions: agent.prohibitions,
      completionDefinition: agent.completionDefinition,
    } }
    case 'instructions': return { kind, value: agent.instructions }
    case 'context': return { kind, value: { policy: { ...agent.contextPolicy }, contextWindowTokens: agent.contextWindowTokens, outputProfileId: agent.outputProfileId, outputParameterBindings: agent.outputParameterBindings } }
    case 'skills': return { kind, value: agent.skillRefs }
    case 'rules': return { kind, value: agent.ruleRefs }
    case 'mcp': return { kind, value: agent.mcpRefs }
    case 'permissions': return { kind, value: agent.permissions }
    case 'sop': return { kind, value: agent.sopRefs }
    case 'orchestration': return { kind, value: agent.orchestrationPolicy }
    case 'hooks': return { kind, value: agent.hookRefs }
    case 'commands': return { kind, value: agent.commandRefs }
    case 'workspace-binding': {
      const value = agent.workspaceBindings.find((binding) => binding.workspaceId === workspaceId)
      if (!value) return undefined
      const config: WorkspaceBindingConfig = {
        workspaceId: value.workspaceId,
        instructions: value.instructions,
        ruleIds: [...value.ruleIds],
        skillIds: [...value.skillIds],
        mcpIds: [...value.mcpIds],
        contextPolicy: value.contextPolicy,
        outputProfileId: value.outputProfileId,
        outputParameterBindings: value.outputParameterBindings,
        orchestrationPolicy: value.orchestrationPolicy,
        hookRefs: value.hookRefs,
        commandRefs: value.commandRefs,
      }
      return { kind, value: config }
    }
  }
}

export function applyAgentConfig(agent: FullAgent, payload: AgentConfigPayload): FullAgent | undefined {
  switch (payload.kind) {
    case 'identity': return payload.value.id !== agent.id || payload.value.schemaVersion !== AGENT_PACKAGE_SCHEMA_VERSION ? undefined : { ...agent, ...payload.value }
    case 'instructions': return { ...agent, instructions: payload.value }
    case 'context': return validateContextPolicy(payload.value.policy).length || validateContextWindowTokens(payload.value.contextWindowTokens).length ? undefined : { ...agent, contextPolicy: { ...payload.value.policy }, contextWindowTokens: payload.value.contextWindowTokens, outputProfileId: payload.value.outputProfileId, outputParameterBindings: payload.value.outputParameterBindings ?? [] }
    case 'skills': return { ...agent, skillRefs: [...payload.value] }
    case 'rules': return { ...agent, ruleRefs: [...payload.value] }
    case 'mcp': return { ...agent, mcpRefs: [...payload.value] }
    case 'permissions': return { ...agent, permissions: { ...payload.value } }
    case 'sop': return { ...agent, sopRefs: [...payload.value] }
    case 'orchestration': return validateOrchestrationPolicy(payload.value).length ? undefined : { ...agent, orchestrationPolicy: { ...payload.value } }
    case 'hooks': return { ...agent, hookRefs: payload.value.map((item) => ({ ...item, parameterBindings: [...item.parameterBindings] })) }
    case 'commands': return { ...agent, commandRefs: payload.value.map((item) => ({ ...item, parameterBindings: [...item.parameterBindings] })) }
    case 'workspace-binding': {
      if (validateWorkspaceBindingConfig(agent, payload.value).length) return undefined
      const existing = agent.workspaceBindings.find((binding) => binding.workspaceId === payload.value.workspaceId)
      const next: WorkspaceBinding = { ...payload.value, memoryRevision: existing?.memoryRevision ?? '' }
      return {
        ...agent,
        workspaceBindings: existing
          ? agent.workspaceBindings.map((binding) => binding.workspaceId === payload.value.workspaceId ? next : binding)
          : [...agent.workspaceBindings, next],
      }
    }
  }
}

export function serializeAgentConfig(agent: FullAgent, payload: AgentConfigPayload): string | undefined {
  const applied = applyAgentConfig(agent, payload)
  if (!applied) return undefined
  switch (payload.kind) {
    case 'identity': return [
      `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}`,
      `id: ${quote(applied.id)}`,
      `name: ${quote(applied.name)}`,
      ...(applied.roleId ? [`roleId: ${quote(applied.roleId)}`] : []),
      `status: ${quote(applied.status)}`,
      ...(applied.companyId ? [`companyId: ${quote(applied.companyId)}`] : []),
      ...(applied.primaryDepartmentId ? [`primaryDepartmentId: ${quote(applied.primaryDepartmentId)}`] : []),
      ...(applied.managerAgentId ? [`managerAgentId: ${quote(applied.managerAgentId)}`] : []),
      ...(applied.avatarPath ? [`avatarPath: ${quote(applied.avatarPath)}`] : []),
      `mission: ${quote(applied.mission)}`,
      'responsibilities:', yamlList(applied.responsibilities),
      'deliverables:', yamlList(applied.deliverables),
      'decisionBoundaries:', yamlList(applied.decisionBoundaries),
      'escalationConditions:', yamlList(applied.escalationConditions),
      'prohibitions:', yamlList(applied.prohibitions),
      'completionDefinition:', yamlList(applied.completionDefinition),
    ].join('\n')
    case 'instructions': return applied.instructions
    case 'context': return [
      `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}`,
      'contextPolicy:',
      `  enabled: ${applied.contextPolicy.enabled}`,
      `  triggerRatio: ${applied.contextPolicy.triggerRatio}`,
      `  targetRatio: ${applied.contextPolicy.targetRatio}`,
      `  protectRecentTurns: ${applied.contextPolicy.protectRecentTurns}`,
      `  protectOpeningTurns: ${applied.contextPolicy.protectOpeningTurns}`,
      `contextWindowTokens: ${applied.contextWindowTokens}`,
      `outputProfileId: ${quote(applied.outputProfileId ?? '')}`,
      `outputParameterBindings: ${JSON.stringify(applied.outputParameterBindings)}`,
    ].join('\n')
    case 'skills': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nskills:\n${yamlList(applied.skillRefs)}`
    case 'rules': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nrules:\n${yamlList(applied.ruleRefs)}`
    case 'mcp': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nmcp:\n${yamlList(applied.mcpRefs)}`
    case 'permissions': return [
      `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}`,
      'permissions:',
      `  files: ${quote(applied.permissions.files)}`,
      `  commands: ${quote(applied.permissions.commands)}`,
      `  network: ${quote(applied.permissions.network)}`,
      `  delegation: ${quote(applied.permissions.delegation)}`,
    ].join('\n')
    case 'sop': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nsop:\n${yamlList(applied.sopRefs)}`
    case 'orchestration': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\norchestration: ${JSON.stringify(applied.orchestrationPolicy)}`
    case 'hooks': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nhooks: ${JSON.stringify(applied.hookRefs)}`
    case 'commands': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\ncommands: ${JSON.stringify(applied.commandRefs)}`
    case 'workspace-binding': return `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}\nworkspaceBinding: ${JSON.stringify(payload.value)}`
  }
}

export function describeAgentConfigFile(payload: AgentConfigPayload, evidence: EvidenceKind = 'memory-only'): AgentFile | undefined {
  const path = getAgentConfigPath(payload)
  if (!path) return undefined
  const descriptions: Record<AgentConfigPayload['kind'], string> = {
    identity: '稳定身份与职责',
    instructions: '主 Instructions',
    context: '上下文与输出格式',
    skills: 'Skill 配置与引用',
    rules: 'Rule 配置与引用',
    mcp: 'MCP 配置与引用',
    permissions: '长期权限边界',
    sop: 'SOP 配置与引用',
    orchestration: '长期协作与委派边界',
    hooks: 'Hook 配置与引用',
    commands: 'Command 配置与引用',
    'workspace-binding': '工作区专属配置',
  }
  return {
    path,
    type: descriptions[payload.kind],
    status: evidence === 'memory-only' ? '页面内存记录' : '预置演示资料',
    evidence,
    scope: payload.kind === 'workspace-binding' ? { kind: 'workspace', workspaceId: payload.value.workspaceId } : rootScope,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export function isAgentConfigPayload(value: unknown): value is AgentConfigPayload {
  if (!isRecord(value) || typeof value.kind !== 'string' || !('value' in value)) return false
  if (value.kind === 'instructions') return typeof value.value === 'string'
  if (value.kind === 'skills' || value.kind === 'rules' || value.kind === 'mcp' || value.kind === 'sop') return isStringArray(value.value)
  if (value.kind === 'hooks' || value.kind === 'commands') return Array.isArray(value.value)
    && value.value.length <= 500
    && value.value.every((item) => isRecord(item) && Object.keys(item).every((key) => key === 'assetId' || key === 'parameterBindings')
      && typeof item.assetId === 'string' && isSafePathSegment(item.assetId)
      && Array.isArray(item.parameterBindings) && item.parameterBindings.length <= 100
      && item.parameterBindings.every((binding) => isParameterBinding(binding) && isSafeComponentBinding(binding)))
  if (!isRecord(value.value)) return false
  const payloadValue = value.value
  if (value.kind === 'context') return isRecord(payloadValue.policy)
    && typeof payloadValue.contextWindowTokens === 'number'
    && validateContextWindowTokens(payloadValue.contextWindowTokens).length === 0
    && typeof payloadValue.policy.enabled === 'boolean'
    && typeof payloadValue.policy.triggerRatio === 'number'
    && typeof payloadValue.policy.targetRatio === 'number'
    && typeof payloadValue.policy.protectRecentTurns === 'number'
    && typeof payloadValue.policy.protectOpeningTurns === 'number'
    && validateContextPolicy(payloadValue.policy as ContextPolicy).length === 0
    && (payloadValue.outputProfileId === undefined || typeof payloadValue.outputProfileId === 'string')
    && (payloadValue.outputParameterBindings === undefined || (Array.isArray(payloadValue.outputParameterBindings)
      && payloadValue.outputParameterBindings.every(isParameterBinding)))
  if (value.kind === 'orchestration') return typeof payloadValue.enabled === 'boolean'
    && typeof payloadValue.maxDelegationDepth === 'number'
    && isStringArray(payloadValue.allowedAgentIds)
    && isStringArray(payloadValue.allowedRoleIds)
    && isStringArray(payloadValue.allowedDepartmentIds)
    && typeof payloadValue.requireWorkspaceBinding === 'boolean'
    && typeof payloadValue.requireSopMatch === 'boolean'
    && typeof payloadValue.requireServiceGrantForCrossDepartment === 'boolean'
    && (payloadValue.escalationAgentId === undefined || typeof payloadValue.escalationAgentId === 'string')
    && isStringArray(payloadValue.escalationConditions)
    && isStringArray(payloadValue.prohibitions)
    && validateOrchestrationPolicy(payloadValue as OrchestrationPolicy).length === 0
  if (value.kind === 'permissions') return ['files', 'commands', 'network', 'delegation'].every((key) => typeof payloadValue[key] === 'string')
  if (value.kind === 'workspace-binding') return Object.keys(payloadValue).every((key) => ['workspaceId', 'instructions', 'ruleIds', 'skillIds', 'mcpIds', 'contextPolicy', 'outputProfileId', 'outputParameterBindings', 'orchestrationPolicy', 'hookRefs', 'commandRefs'].includes(key))
    && typeof payloadValue.workspaceId === 'string'
    && workspaceConfigPath(payloadValue.workspaceId) !== undefined
    && typeof payloadValue.instructions === 'string'
    && isStringArray(payloadValue.ruleIds)
    && isStringArray(payloadValue.skillIds)
    && isStringArray(payloadValue.mcpIds)
    && (payloadValue.contextPolicy === undefined || isContextPolicyOverride(payloadValue.contextPolicy))
    && (payloadValue.outputProfileId === undefined || typeof payloadValue.outputProfileId === 'string')
    && (payloadValue.outputParameterBindings === undefined || (Array.isArray(payloadValue.outputParameterBindings) && payloadValue.outputParameterBindings.every((binding) => isParameterBinding(binding) && isSafeComponentBinding(binding))))
    && (payloadValue.orchestrationPolicy === undefined || isRecord(payloadValue.orchestrationPolicy))
    && (payloadValue.hookRefs === undefined || isSafeComponentReferences(payloadValue.hookRefs))
    && (payloadValue.commandRefs === undefined || isSafeComponentReferences(payloadValue.commandRefs))
  if (value.kind === 'identity') {
    const organizationFields = ['roleId', 'companyId', 'primaryDepartmentId'] as const
    const organizationCount = organizationFields.filter((key) => typeof payloadValue[key] === 'string' && payloadValue[key] !== '').length
    return payloadValue.schemaVersion === AGENT_PACKAGE_SCHEMA_VERSION
      && ['id', 'name', 'mission'].every((key) => typeof payloadValue[key] === 'string')
      && (organizationCount === 0 || organizationCount === organizationFields.length)
      && organizationFields.every((key) => payloadValue[key] === undefined || typeof payloadValue[key] === 'string')
      && ['active', 'inactive', 'archived'].includes(String(payloadValue.status))
      && ['responsibilities', 'deliverables', 'decisionBoundaries', 'escalationConditions', 'prohibitions', 'completionDefinition'].every((key) => isStringArray(payloadValue[key]))
      && (payloadValue.managerAgentId === undefined || typeof payloadValue.managerAgentId === 'string')
      && (payloadValue.avatarPath === undefined || payloadValue.avatarPath === 'avatar.png')
  }
  return false
}

export function configPayloadEquals(left: AgentConfigPayload, right: AgentConfigPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
