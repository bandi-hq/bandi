import { getLatestAgentRevision, getRecentWorkspaceRevisions, listConfigRevisions } from './config-revisions'
import { workspaceConfigPath } from './agent-config-model'
import { getAgentPackageEditability } from './agent-package-schema'
import { validateParameterBindings } from './component-parameters'
import { findDelegationCycles, validateOrchestrationOverride, validateOrchestrationPolicy } from './orchestration-policy'
import type { ConfigRevision, FullAgent, FullAsset, FullWorkspace, Role } from './domain'
import type { PluginInstallation } from './plugin-installation'

export type ConfigIssue = {
  code:
    | 'external-change'
    | 'missing-rules'
    | 'missing-reference'
    | 'skill-unavailable'
    | 'missing-workspace'
    | 'missing-binding-file'
    | 'unverified'
    | 'package-legacy'
    | 'package-future'
    | 'package-unverified'
    | 'manifest-invalid'
    | 'role-missing'
    | 'role-scope-mismatch'
    | 'orchestration-invalid'
    | 'orchestration-expanded'
    | 'delegation-cycle'
    | 'asset-kind-mismatch'
    | 'plugin-unavailable'
    | 'parameter-invalid'
  label: string
}

export type ConfigStatus = {
  level: 'healthy' | 'warning' | 'error' | 'unknown'
  label: string
  issues: ConfigIssue[]
}

type SelectorState = {
  agents: FullAgent[]
  workspaces: FullWorkspace[]
  assets: FullAsset[]
  roles: Role[]
  pluginInstallations: PluginInstallation[]
  configRevisions: ConfigRevision[]
}

export function getAgentsBoundToWorkspace(state: Pick<SelectorState, 'agents'>, workspaceId: string): FullAgent[] {
  return state.agents.filter((agent) => agent.workspaceBindings.some((binding) => binding.workspaceId === workspaceId))
}

export function getDanglingWorkspaceBindings(state: Pick<SelectorState, 'agents' | 'workspaces'>) {
  const indexed = new Set(state.workspaces.map((workspace) => workspace.id))
  return state.agents.flatMap((agent) => agent.workspaceBindings
    .filter((binding) => !indexed.has(binding.workspaceId))
    .map((binding) => ({ agent, binding })))
}

function missingReferences(ids: string[], assets: FullAsset[]) {
  const available = new Set(assets.map((asset) => asset.id))
  return ids.filter((id) => !available.has(id))
}

function validateComponentReferences(
  references: FullAgent['hookRefs'] | FullAgent['commandRefs'],
  expectedKind: 'Hook' | 'Command',
  state: Pick<SelectorState, 'assets' | 'pluginInstallations'>,
  label: string,
): ConfigIssue[] {
  return references.flatMap((reference) => {
    const asset = state.assets.find((item) => item.id === reference.assetId)
    if (!asset) return [{ code: 'missing-reference' as const, label: `${label} ${reference.assetId} 不存在` }]
    if (asset.kind !== expectedKind) return [{ code: 'asset-kind-mismatch' as const, label: `${label} ${reference.assetId} 的资产类型应为 ${expectedKind}` }]
    const definition = expectedKind === 'Hook' ? asset.hook : asset.command
    if (!definition) return [{ code: 'asset-kind-mismatch' as const, label: `${label} ${reference.assetId} 缺少类型化定义` }]
    const issues: ConfigIssue[] = validateParameterBindings(definition.parameters, reference.parameterBindings)
      .map((issue) => ({ code: 'parameter-invalid', label: `${label} ${reference.assetId}.${issue.parameterId}：${issue.message}` }))
    const pluginAssetId = definition.pluginAssetId
    if (pluginAssetId) {
      const installation = state.pluginInstallations.find((item) => item.pluginId === pluginAssetId)
      if (!installation || installation.status === 'available' || installation.status === 'incompatible' || !installation.compatible || !installation.componentsComplete) {
        issues.push({ code: 'plugin-unavailable', label: `${label} ${reference.assetId} 的 Plugin ${pluginAssetId} 未安装、组件不完整或不兼容` })
      }
    }
    return issues
  })
}

export function getAgentConfigStatus(state: Pick<SelectorState, 'agents' | 'workspaces' | 'assets' | 'roles' | 'pluginInstallations'>, agent: FullAgent): ConfigStatus {
  const issues: ConfigIssue[] = []
  if (agent.files.some((file) => file.status.includes('外部变化'))) issues.push({ code: 'external-change', label: '存在预置的外部变化记录' })
  if (agent.packageSchema.compatibility === 'legacy') issues.push({ code: 'package-legacy', label: 'AgentPackage 为旧版，只读且需要明确升级' })
  if (agent.packageSchema.compatibility === 'future') issues.push({ code: 'package-future', label: 'AgentPackage 来自更高版本，禁止降级保存' })
  if (agent.packageSchema.compatibility === 'unverified') issues.push({ code: 'package-unverified', label: '外部 AgentPackage 未读取和验证，仅保留引用' })
  if (!getAgentPackageEditability(agent.packageSchema).editable && agent.packageSchema.compatibility === 'current') issues.push({ code: 'manifest-invalid', label: 'AgentPackage schema 元数据不一致' })
  const organizationFields = [agent.roleId, agent.companyId, agent.primaryDepartmentId]
  const organizationCount = organizationFields.filter(Boolean).length
  if (organizationCount > 0 && organizationCount < organizationFields.length) {
    issues.push({ code: 'role-scope-mismatch', label: '组织关联必须同时包含公司、主属部门和岗位' })
  } else if (agent.roleId) {
    const role = state.roles.find((item) => item.id === agent.roleId)
    if (!role) issues.push({ code: 'role-missing', label: `Role ${agent.roleId} 不存在` })
    else if (role.companyId !== agent.companyId || (role.departmentId && role.departmentId !== agent.primaryDepartmentId)) issues.push({ code: 'role-scope-mismatch', label: `Role ${role.name} 与 Agent 的公司或部门作用域不匹配` })
  }
  const missingRootRefs = missingReferences([...agent.ruleRefs, ...agent.skillRefs, ...agent.mcpRefs, ...agent.sopRefs], state.assets)
  if (missingRootRefs.length) issues.push({ code: 'missing-reference', label: `存在失效引用：${missingRootRefs.join('、')}` })
  const orchestrationIssues = validateOrchestrationPolicy(agent.orchestrationPolicy)
  issues.push(...orchestrationIssues.map((issue) => ({ code: 'orchestration-invalid' as const, label: issue.message })))
  const cycles = findDelegationCycles(new Map(state.agents.map((item) => [item.id, item.orchestrationPolicy.allowedAgentIds])))
  if (cycles.some((cycle) => cycle.includes(agent.id))) issues.push({ code: 'delegation-cycle', label: `委派范围存在环：${cycles.find((cycle) => cycle.includes(agent.id))?.join(' → ')}` })
  issues.push(...validateComponentReferences(agent.hookRefs, 'Hook', state, 'Hook'))
  issues.push(...validateComponentReferences(agent.commandRefs, 'Command', state, 'Command'))
  if (agent.outputProfileId) {
    const output = state.assets.find((item) => item.id === agent.outputProfileId)
    if (!output) issues.push({ code: 'missing-reference', label: `OutputProfile ${agent.outputProfileId} 不存在` })
    else if (output.kind !== 'OutputProfile' || !output.outputProfile) issues.push({ code: 'asset-kind-mismatch', label: `${agent.outputProfileId} 不是有效的 OutputProfile` })
    else issues.push(...validateParameterBindings(output.outputProfile.parameters, agent.outputParameterBindings).map((issue) => ({ code: 'parameter-invalid' as const, label: `OutputProfile ${issue.parameterId}：${issue.message}` })))
  }
  const workspaceIds = new Set(state.workspaces.map((workspace) => workspace.id))
  for (const binding of agent.workspaceBindings) {
    if (!workspaceIds.has(binding.workspaceId)) issues.push({ code: 'missing-workspace', label: `工作区 ${binding.workspaceId} 不在当前索引中` })
    if (!binding.ruleIds.length) issues.push({ code: 'missing-rules', label: `${binding.workspaceId} Binding 缺少 Rules` })
    const path = workspaceConfigPath(binding.workspaceId)
    if (!path || !agent.files.some((file) => file.path === path)) issues.push({ code: 'missing-binding-file', label: `${binding.workspaceId} Binding 未登记配置文件` })
    const missing = missingReferences([...binding.ruleIds, ...binding.skillIds, ...binding.mcpIds], state.assets)
    if (missing.length) issues.push({ code: 'missing-reference', label: `${binding.workspaceId} 存在失效引用：${missing.join('、')}` })
    if (binding.orchestrationPolicy) issues.push(...validateOrchestrationOverride(agent.orchestrationPolicy, binding.orchestrationPolicy).map((issue) => ({ code: 'orchestration-expanded' as const, label: `${binding.workspaceId}：${issue.message}` })))
    issues.push(...validateComponentReferences(binding.hookRefs ?? [], 'Hook', state, `${binding.workspaceId} Hook`))
    issues.push(...validateComponentReferences(binding.commandRefs ?? [], 'Command', state, `${binding.workspaceId} Command`))
    if (binding.outputProfileId) {
      const output = state.assets.find((item) => item.id === binding.outputProfileId)
      if (!output) issues.push({ code: 'missing-reference', label: `${binding.workspaceId} OutputProfile ${binding.outputProfileId} 不存在` })
      else if (output.kind !== 'OutputProfile' || !output.outputProfile) issues.push({ code: 'asset-kind-mismatch', label: `${binding.workspaceId} 的 ${binding.outputProfileId} 不是有效 OutputProfile` })
      else issues.push(...validateParameterBindings(output.outputProfile.parameters, binding.outputParameterBindings ?? []).map((issue) => ({ code: 'parameter-invalid' as const, label: `${binding.workspaceId} OutputProfile ${issue.parameterId}：${issue.message}` })))
    }
  }
  for (const skillId of [...agent.skillRefs, ...agent.workspaceBindings.flatMap((binding) => binding.skillIds)]) {
    const skill = state.assets.find((asset) => asset.id === skillId)?.skill
    if (!skill || skill.installation.status === 'available') issues.push({ code: 'skill-unavailable', label: `Skill ${skillId} 当前不可用` })
  }
  if (!issues.length) return { level: 'healthy', label: '演示记录完整', issues }
  if (issues.some((issue) => issue.code === 'external-change')) return { level: 'warning', label: '外部变化（演示）', issues }
  return { level: 'error', label: '配置缺口', issues }
}

export function getWorkspaceConfigStatus(state: Pick<SelectorState, 'agents' | 'workspaces' | 'assets' | 'roles' | 'pluginInstallations'>, workspace: FullWorkspace): ConfigStatus {
  if (!workspace.files.length) return { level: 'unknown', label: '未验证', issues: [{ code: 'unverified', label: '尚未读取工作区目录或文件' }] }
  const agents = getAgentsBoundToWorkspace(state, workspace.id)
  const issues = agents.flatMap((agent) => getAgentConfigStatus(state, agent).issues.filter((issue) => issue.label.includes(workspace.id) || issue.code === 'external-change'))
  if (workspace.files.some((file) => file.status.includes('外部变化'))) issues.unshift({ code: 'external-change', label: '工作区存在预置的外部变化记录' })
  if (!issues.length) return { level: 'healthy', label: '演示记录完整', issues }
  return { level: issues.some((issue) => issue.code === 'external-change') ? 'warning' : 'error', label: issues.some((issue) => issue.code === 'external-change') ? '外部变化（演示）' : '配置缺口', issues }
}

export function getLatestRevisionForAgent(state: Pick<SelectorState, 'configRevisions'>, agentId: string) {
  return getLatestAgentRevision(state.configRevisions, agentId)
}

export function getRecentRevisionsForWorkspace(state: Pick<SelectorState, 'agents' | 'configRevisions'>, workspaceId: string) {
  const agentIds = getAgentsBoundToWorkspace(state, workspaceId).map((agent) => agent.id)
  return getRecentWorkspaceRevisions(state.configRevisions, agentIds, workspaceId)
}

export function getConfigHistory(state: Pick<SelectorState, 'configRevisions'>, ownerType: ConfigRevision['ownerType'], ownerId: string, path: string) {
  return listConfigRevisions(state.configRevisions, { ownerType, ownerId, path })
}
