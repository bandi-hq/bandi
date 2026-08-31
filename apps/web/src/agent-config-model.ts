import { AGENT_PACKAGE_SCHEMA_VERSION } from './agent-package-schema'
import { isParameterBinding, type ParameterBinding } from './component-parameters'
import type { AgentFile, ContextPolicy, ContextPolicyOverride, EvidenceKind, FullAgent, WorkspaceBinding } from './domain'
import { validateOrchestrationPolicy, type OrchestrationPolicy } from './orchestration-policy'

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
  | { kind: 'workspace-binding'; value: WorkspaceBinding }

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

export function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
}

export function workspaceConfigPath(workspaceId: string): string | undefined {
  return isSafePathSegment(workspaceId) ? `workspaces/${workspaceId}/config.yaml` : undefined
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
    case 'context': return { kind, value: { policy: { ...agent.contextPolicy }, outputProfileId: agent.outputProfileId, outputParameterBindings: agent.outputParameterBindings } }
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
      return value ? { kind, value } : undefined
    }
  }
}

export function applyAgentConfig(agent: FullAgent, payload: AgentConfigPayload): FullAgent | undefined {
  switch (payload.kind) {
    case 'identity': return payload.value.id !== agent.id || payload.value.schemaVersion !== AGENT_PACKAGE_SCHEMA_VERSION ? undefined : { ...agent, ...payload.value }
    case 'instructions': return { ...agent, instructions: payload.value }
    case 'context': return validateContextPolicy(payload.value.policy).length ? undefined : { ...agent, contextPolicy: { ...payload.value.policy }, outputProfileId: payload.value.outputProfileId, outputParameterBindings: payload.value.outputParameterBindings ?? [] }
    case 'skills': return { ...agent, skillRefs: [...payload.value] }
    case 'rules': return { ...agent, ruleRefs: [...payload.value] }
    case 'mcp': return { ...agent, mcpRefs: [...payload.value] }
    case 'permissions': return { ...agent, permissions: { ...payload.value } }
    case 'sop': return { ...agent, sopRefs: [...payload.value] }
    case 'orchestration': return validateOrchestrationPolicy(payload.value).length ? undefined : { ...agent, orchestrationPolicy: { ...payload.value } }
    case 'hooks': return { ...agent, hookRefs: payload.value.map((item) => ({ ...item, parameterBindings: [...item.parameterBindings] })) }
    case 'commands': return { ...agent, commandRefs: payload.value.map((item) => ({ ...item, parameterBindings: [...item.parameterBindings] })) }
    case 'workspace-binding': {
      if (!workspaceConfigPath(payload.value.workspaceId)) return undefined
      if (payload.value.contextPolicy && validateContextPolicy(mergeContextPolicy(agent.contextPolicy, payload.value.contextPolicy)).length) return undefined
      const exists = agent.workspaceBindings.some((binding) => binding.workspaceId === payload.value.workspaceId)
      return {
        ...agent,
        workspaceBindings: exists
          ? agent.workspaceBindings.map((binding) => binding.workspaceId === payload.value.workspaceId ? { ...payload.value } : binding)
          : [...agent.workspaceBindings, { ...payload.value }],
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
      `roleId: ${quote(applied.roleId)}`,
      `status: ${quote(applied.status)}`,
      `companyId: ${quote(applied.companyId ?? '')}`,
      `primaryDepartmentId: ${quote(applied.primaryDepartmentId ?? '')}`,
      `managerAgentId: ${quote(applied.managerAgentId ?? '')}`,
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
    case 'workspace-binding': {
      const contextLines = payload.value.contextPolicy
        ? ['contextPolicy:', ...Object.entries(payload.value.contextPolicy).map(([key, value]) => `  ${key}: ${value}`)]
        : []
      return [
        `schemaVersion: ${AGENT_PACKAGE_SCHEMA_VERSION}`,
        `workspaceId: ${quote(payload.value.workspaceId)}`,
        `instructions: ${quote(payload.value.instructions)}`,
        'rules:', yamlList(payload.value.ruleIds),
        'skills:', yamlList(payload.value.skillIds),
        'mcp:', yamlList(payload.value.mcpIds),
        ...contextLines,
        `memoryRevision: ${quote(payload.value.memoryRevision)}`,
      ].join('\n')
    }
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
  if (value.kind === 'hooks' || value.kind === 'commands') return Array.isArray(value.value) && value.value.every((item) => isRecord(item) && typeof item.assetId === 'string' && Array.isArray(item.parameterBindings) && item.parameterBindings.every(isParameterBinding))
  if (!isRecord(value.value)) return false
  const payloadValue = value.value
  if (value.kind === 'context') return isRecord(payloadValue.policy)
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
    && isStringArray(payloadValue.escalationConditions)
    && isStringArray(payloadValue.prohibitions)
    && validateOrchestrationPolicy(payloadValue as OrchestrationPolicy).length === 0
  if (value.kind === 'permissions') return ['files', 'commands', 'network', 'delegation'].every((key) => typeof payloadValue[key] === 'string')
  if (value.kind === 'workspace-binding') return typeof payloadValue.workspaceId === 'string'
    && workspaceConfigPath(payloadValue.workspaceId) !== undefined
    && typeof payloadValue.instructions === 'string'
    && isStringArray(payloadValue.ruleIds)
    && isStringArray(payloadValue.skillIds)
    && isStringArray(payloadValue.mcpIds)
    && (payloadValue.contextPolicy === undefined || isContextPolicyOverride(payloadValue.contextPolicy))
    && typeof payloadValue.memoryRevision === 'string'
  if (value.kind === 'identity') return payloadValue.schemaVersion === AGENT_PACKAGE_SCHEMA_VERSION
    && ['id', 'name', 'roleId', 'mission'].every((key) => typeof payloadValue[key] === 'string')
    && ['active', 'inactive', 'archived'].includes(String(payloadValue.status))
    && ['responsibilities', 'deliverables', 'decisionBoundaries', 'escalationConditions', 'prohibitions', 'completionDefinition'].every((key) => isStringArray(payloadValue[key]))
    && ['companyId', 'primaryDepartmentId', 'managerAgentId'].every((key) => payloadValue[key] === undefined || typeof payloadValue[key] === 'string')
    && (payloadValue.avatarPath === undefined || payloadValue.avatarPath === 'avatar.png')
  return false
}

export function configPayloadEquals(left: AgentConfigPayload, right: AgentConfigPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
