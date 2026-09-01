import { normalizeAgentPackagePath, getDefaultAgentPackagePath } from './agent-package'
import type { AgentFile, FullAgent, FullAsset, FullWorkspace, MemorySpace, Role } from './domain'

export type AgentConfigSection =
  | 'overview'
  | 'package'
  | 'identity'
  | 'instructions'
  | 'context'
  | 'skills'
  | 'memory'
  | 'rules'
  | 'mcp'
  | 'permissions'
  | 'collaboration'
  | 'workspaces'
  | 'sop'

export type AgentFileView = 'preview' | 'source'

export type AgentProjectionContext = {
  assets: FullAsset[]
  workspaces: FullWorkspace[]
  memorySpaces: MemorySpace[]
  roles?: Role[]
}

export type AgentConfigSectionDefinition = {
  id: AgentConfigSection
  label: string
}

export type AgentFileAssociation = {
  file: AgentFile
  sections: AgentConfigSection[]
  primarySection: AgentConfigSection
}

export type AgentFilePreview = {
  title: string
  description: string
  fields: Array<{ label: string; value: string | string[] }>
  notice?: string
}

export type AgentConfigRoute = {
  section: AgentConfigSection
  path?: string
  view: AgentFileView
  canonicalParams: URLSearchParams
  needsReplace: boolean
  notice?: string
}

export const agentConfigSections: AgentConfigSectionDefinition[] = [
  { id: 'overview', label: '概览' },
  { id: 'package', label: 'AgentPackage' },
  { id: 'identity', label: '身份与职责' },
  { id: 'instructions', label: '主指令' },
  { id: 'context', label: '上下文' },
  { id: 'skills', label: '技能' },
  { id: 'memory', label: '长期记忆' },
  { id: 'rules', label: '规则' },
  { id: 'mcp', label: 'MCP' },
  { id: 'permissions', label: '权限' },
  { id: 'collaboration', label: '协作与编排' },
  { id: 'workspaces', label: '工作区' },
  { id: 'sop', label: 'SOP' },
]

const sectionIds = new Set<AgentConfigSection>(agentConfigSections.map((item) => item.id))

export function isAgentConfigSection(value: string | null): value is AgentConfigSection {
  return Boolean(value && sectionIds.has(value as AgentConfigSection))
}

export function isAgentFileView(value: string | null): value is AgentFileView {
  return value === 'preview' || value === 'source'
}

function workspaceBindingForPath(agent: FullAgent, path: string) {
  const match = /^workspaces\/([^/]+)\/(config\.yaml|memory\.md)$/.exec(path)
  if (!match) return undefined
  return agent.workspaceBindings.find((item) => item.workspaceId === match[1])
}

function sectionsForFile(agent: FullAgent, path: string): AgentConfigSection[] {
  if (path === 'agent.yaml') return ['overview', 'identity']
  if (path === 'soul.md') return ['identity']
  if (path === 'instructions.md') return ['instructions']
  if (path === 'config/context.yaml') return ['context']
  if (path === 'config/skills.yaml') return ['skills']
  if (path === 'config/rules.yaml') return ['rules']
  if (/^config\/mcp\.(yaml|json)$/.test(path)) return ['mcp']
  if (/^config\/permissions\.(yaml|json)$/.test(path)) return ['permissions']
  if (/^config\/sop\.(yaml|json)$/.test(path)) return ['sop']
  if (path === 'config/orchestration.yaml' || path === 'config/hooks.yaml' || path === 'config/commands.yaml') return ['collaboration']
  if (path === 'memory/long-term.md') return ['memory']
  if (/^workspaces\/[^/]+\/memory\.md$/.test(path)) return ['memory', 'workspaces']
  if (/^workspaces\/[^/]+\/config\.yaml$/.test(path)) {
    const binding = workspaceBindingForPath(agent, path)
    const sections: AgentConfigSection[] = ['workspaces', 'instructions']
    if (binding?.skillIds.length) sections.push('skills')
    if (binding?.ruleIds.length) sections.push('rules')
    if (binding?.mcpIds.length) sections.push('mcp')
    if (binding?.contextPolicy || binding?.outputProfileId) sections.push('context')
    if (binding?.orchestrationPolicy || binding?.hookRefs?.length || binding?.commandRefs?.length) sections.push('collaboration')
    return sections
  }
  return ['overview']
}

export function getAgentFileAssociations(agent: FullAgent): AgentFileAssociation[] {
  const seen = new Set<string>()
  return agent.files.flatMap((file) => {
    const path = normalizeAgentPackagePath(file.path)
    if (!path || seen.has(path)) return []
    seen.add(path)
    const sections = sectionsForFile(agent, path)
    return [{ file: { ...file, path }, sections, primarySection: sections[0] }]
  })
}

export function getFilesForAgentSection(agent: FullAgent, section: AgentConfigSection): AgentFileAssociation[] {
  const associations = getAgentFileAssociations(agent)
  return section === 'package'
    ? associations
    : associations.filter((item) => item.sections.includes(section))
}

export function getPrimarySectionForAgentFile(agent: FullAgent, path: string): AgentConfigSection | undefined {
  const normalized = normalizeAgentPackagePath(path)
  return getAgentFileAssociations(agent).find((item) => item.file.path === normalized)?.primarySection
}

export function getAgentFileAssociation(agent: FullAgent, path: string): AgentFileAssociation | undefined {
  const normalized = normalizeAgentPackagePath(path)
  return getAgentFileAssociations(agent).find((item) => item.file.path === normalized)
}

const assetNames = (ids: string[], context: AgentProjectionContext) => ids.map((id) => context.assets.find((item) => item.id === id)?.name ?? id)

export function projectAgentFilePreview(agent: FullAgent, context: AgentProjectionContext, path: string): AgentFilePreview | undefined {
  const association = getAgentFileAssociation(agent, path)
  if (!association) return undefined
  const normalized = association.file.path
  const binding = workspaceBindingForPath(agent, normalized)
  const workspace = binding ? context.workspaces.find((item) => item.id === binding.workspaceId) : undefined
  const externalNotice = agent.packageSource.kind === 'external-reference'
    ? '仅展示当前页面中明确登记的配置信息；未读取外部文件。'
    : undefined

  if (normalized === 'agent.yaml') {
    const role = context.roles?.find((item) => item.id === agent.roleId)
    return {
      title: 'Agent 身份与职责',
      description: '稳定身份、岗位、组织职责和生命周期的完整清单预览。',
      fields: [
        { label: '格式版本', value: agent.packageSchema.schemaVersion ? `v${agent.packageSchema.schemaVersion} · ${agent.packageSchema.compatibility}` : agent.packageSchema.compatibility },
        { label: '技术标识', value: agent.id },
        { label: '名称与岗位', value: `${agent.name} · ${role?.name ?? agent.roleId}` },
        { label: '生命周期', value: agent.status },
        { label: '所属部门', value: agent.department },
        { label: '使命', value: agent.mission },
      ],
      notice: externalNotice,
    }
  }
  if (normalized === 'soul.md') return { title: '长期行为原则', description: '职责、决策边界和禁止事项的可读预览。', fields: [{ label: '职责', value: agent.responsibilities }, { label: '决策边界', value: agent.decisionBoundaries }, { label: '禁止事项', value: agent.prohibitions }], notice: externalNotice }
  if (normalized === 'instructions.md') return { title: '主指令', description: 'Agent 自有的主指令正文。', fields: [{ label: '正文', value: agent.instructions }], notice: externalNotice }
  if (normalized === 'config/context.yaml') return {
    title: '上下文与输出格式',
    description: '供 AI 编程工具生成运行配置时读取的长期设置。',
    fields: [
      { label: '规划上下文窗口', value: `${agent.contextWindowTokens.toLocaleString('zh-CN')} Token` },
      { label: '压缩策略', value: agent.contextPolicy.enabled ? `约 ${Math.round(agent.contextWindowTokens * agent.contextPolicy.triggerRatio).toLocaleString('zh-CN')} Token（${Math.round(agent.contextPolicy.triggerRatio * 100)}%）→ 约 ${Math.round(agent.contextWindowTokens * agent.contextPolicy.targetRatio).toLocaleString('zh-CN')} Token` : '已关闭' },
      { label: '消息保护', value: `最近 ${agent.contextPolicy.protectRecentTurns} 轮 · 开头 ${agent.contextPolicy.protectOpeningTurns} 轮` },
      { label: '输出格式', value: agent.outputProfileId ? context.assets.find((item) => item.id === agent.outputProfileId)?.name ?? agent.outputProfileId : '未设置' },
      { label: '输出参数', value: agent.outputParameterBindings.map((item) => item.parameterId) },
    ],
    notice: externalNotice ?? '这些规划值尚未应用，也不包含当前会话、Token 使用量、压缩次数或摘要正文。',
  }
  if (normalized === 'config/skills.yaml') return { title: '技能引用', description: 'Agent 使用的技能；安装状态与使用关系分开记录。', fields: [{ label: '已引用', value: assetNames(agent.skillRefs, context) }], notice: externalNotice }
  if (normalized === 'config/rules.yaml') return { title: '规则引用', description: 'Agent 显式引用的规则资产。', fields: [{ label: '已引用', value: assetNames(agent.ruleRefs, context) }], notice: externalNotice }
  if (normalized === 'config/orchestration.yaml') return { title: '长期协作与委派边界', description: '仅保存静态委派范围、必需条件、升级目标和禁止事项。', fields: [{ label: '委派状态', value: agent.orchestrationPolicy.enabled ? '允许（仍受权限和组织边界约束）' : '禁止' }, { label: '最大深度', value: String(agent.orchestrationPolicy.maxDelegationDepth) }, { label: '允许 Agent', value: agent.orchestrationPolicy.allowedAgentIds }, { label: '允许岗位', value: agent.orchestrationPolicy.allowedRoleIds }, { label: '允许部门', value: agent.orchestrationPolicy.allowedDepartmentIds }, { label: '升级条件', value: agent.orchestrationPolicy.escalationConditions }, { label: '禁止事项', value: agent.orchestrationPolicy.prohibitions }], notice: externalNotice ?? '不包含当前任务、参与者、进度、审批或运行记录。' }
  if (normalized === 'config/hooks.yaml') return { title: 'Hook 引用', description: '仅管理可信 HookDefinition 的显式引用与非敏感参数；不会执行 Hook。', fields: [{ label: '已引用', value: agent.hookRefs.map((item) => context.assets.find((asset) => asset.id === item.assetId)?.name ?? item.assetId) }, { label: '参数绑定', value: agent.hookRefs.flatMap((item) => item.parameterBindings.map((binding) => `${item.assetId}.${binding.parameterId}`)) }], notice: externalNotice ?? '存在引用不表示 Hook 已触发或已在当前会话中加载。' }
  if (normalized === 'config/commands.yaml') return { title: 'Command 引用', description: '仅管理 CommandDefinition 的显式引用与非敏感参数；不会执行命令。', fields: [{ label: '已引用', value: agent.commandRefs.map((item) => context.assets.find((asset) => asset.id === item.assetId)?.name ?? item.assetId) }, { label: '参数绑定', value: agent.commandRefs.flatMap((item) => item.parameterBindings.map((binding) => `${item.assetId}.${binding.parameterId}`)) }], notice: externalNotice ?? '不接受 Shell 字符串、可执行程序、工作目录或环境变量。' }
  if (normalized === 'memory/long-term.md') {
    const spaces = context.memorySpaces.filter((item) => item.owner.includes(agent.name) && item.scopeType === 'Agent 长期')
    return { title: '长期正式记忆', description: '正式记忆只能经修改建议、审核和版本记录更新。', fields: [{ label: '记忆范围', value: spaces.map((item) => `${item.owner} · ${item.revision}`) }, { label: '治理', value: spaces.map((item) => `归口 ${item.steward} · 审核 ${item.reviewer}`) }], notice: externalNotice }
  }
  if (binding && normalized.endsWith('/config.yaml')) return { title: `${workspace?.name ?? binding.workspaceId} 专属配置`, description: 'Agent 的工作区专属配置；只展示覆盖值，不冒充合并后的有效配置。', fields: [{ label: '主指令', value: binding.instructions }, { label: '规则', value: assetNames(binding.ruleIds, context) }, { label: '技能', value: assetNames(binding.skillIds, context) }, { label: 'MCP', value: assetNames(binding.mcpIds, context) }, { label: '上下文覆盖', value: binding.contextPolicy ? Object.keys(binding.contextPolicy).join('、') : '继承 Agent 根级' }, { label: '输出格式', value: binding.outputProfileId ?? '继承 Agent 根级' }, { label: '编排收紧', value: binding.orchestrationPolicy ? Object.keys(binding.orchestrationPolicy).join('、') : '继承 Agent 根级' }, { label: 'Hook 覆盖', value: binding.hookRefs?.map((item) => item.assetId) ?? [] }, { label: 'Command 覆盖', value: binding.commandRefs?.map((item) => item.assetId) ?? [] }], notice: externalNotice }
  if (normalized.endsWith('/memory.md')) {
    const memoryWorkspaceId = association.file.scope.kind === 'workspace' ? association.file.scope.workspaceId : undefined
    const memoryWorkspace = context.workspaces.find((item) => item.id === memoryWorkspaceId)
    return { title: `${memoryWorkspace?.name ?? '工作区'} 专属记忆`, description: '工作区专属记忆的治理信息预览。', fields: [{ label: '版本', value: association.file.revision ?? binding?.memoryRevision ?? '未设置' }, { label: '状态', value: association.file.status }], notice: externalNotice }
  }
  return { title: association.file.type, description: '当前文件尚无专属结构化预览。', fields: [{ label: '路径', value: normalized }, { label: '状态', value: association.file.status }], notice: externalNotice }
}

export function resolveAgentConfigRoute(agent: FullAgent, params: URLSearchParams): AgentConfigRoute {
  const canonical = new URLSearchParams(params)
  const rawTab = params.get('tab')
  const rawPath = params.get('path')
  const normalizedPath = rawPath ? normalizeAgentPackagePath(rawPath) : undefined
  const association = normalizedPath ? getAgentFileAssociation(agent, normalizedPath) : undefined
  let notice: string | undefined
  let section: AgentConfigSection = isAgentConfigSection(rawTab) ? rawTab : 'overview'
  let path = association?.file.path

  if (rawTab === 'files') {
    section = 'package'
    if (!rawPath) path = getDefaultAgentPackagePath(agent.files)
    else if (!association) notice = '链接中的文件不存在或路径无效，已返回 AgentPackage。'
  } else if (section === 'package' && !rawPath) {
    path = getDefaultAgentPackagePath(agent.files)
  } else if (rawTab && !isAgentConfigSection(rawTab)) {
    section = 'overview'
    notice = '链接中的配置领域无效，已返回概览。'
  }

  if (rawPath && !association) {
    path = undefined
    notice ??= '链接中的文件不存在或路径无效，已返回当前配置领域。'
  } else if (association && section !== 'package' && !association.sections.includes(section)) {
    section = association.primarySection
    notice = '该文件不属于原配置领域，已切换到对应配置。'
  }

  const view: AgentFileView = path && isAgentFileView(params.get('view')) ? params.get('view') as AgentFileView : 'preview'
  if (section === 'overview' && !path) canonical.delete('tab')
  else canonical.set('tab', section)
  if (path) {
    canonical.set('path', path)
    canonical.set('view', view)
  } else {
    canonical.delete('path')
    canonical.delete('view')
  }

  return { section, path, view, canonicalParams: canonical, needsReplace: canonical.toString() !== params.toString(), notice }
}
