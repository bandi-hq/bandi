import { normalizeAgentPackagePath, getDefaultAgentPackagePath } from './agent-package'
import type { AgentFile, FullAgent, FullAsset, FullWorkspace, MemorySpace } from './domain'

export type AgentConfigSection =
  | 'overview'
  | 'package'
  | 'identity'
  | 'instructions'
  | 'skills'
  | 'memory'
  | 'rules'
  | 'mcp'
  | 'permissions'
  | 'workspaces'
  | 'sop'

export type AgentFileView = 'preview' | 'source'

export type AgentProjectionContext = {
  assets: FullAsset[]
  workspaces: FullWorkspace[]
  memorySpaces: MemorySpace[]
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
  { id: 'instructions', label: 'Instructions' },
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
  { id: 'rules', label: 'Rules' },
  { id: 'mcp', label: 'MCP' },
  { id: 'permissions', label: '权限' },
  { id: 'workspaces', label: 'Workspaces' },
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
  if (path === 'agent.yaml') return ['overview', 'identity', 'permissions', 'sop']
  if (path === 'soul.md') return ['identity']
  if (path === 'instructions.md') return ['instructions']
  if (path === 'config/skills.yaml') return ['skills']
  if (path === 'config/rules.yaml') return ['rules']
  if (/^config\/mcp\.(yaml|json)$/.test(path)) return ['mcp']
  if (/^config\/permissions\.(yaml|json)$/.test(path)) return ['permissions']
  if (/^config\/sop\.(yaml|json)$/.test(path)) return ['sop']
  if (path === 'memory/long-term.md') return ['memory']
  if (/^workspaces\/[^/]+\/memory\.md$/.test(path)) return ['memory', 'workspaces']
  if (/^workspaces\/[^/]+\/config\.yaml$/.test(path)) {
    const binding = workspaceBindingForPath(agent, path)
    const sections: AgentConfigSection[] = ['workspaces', 'instructions']
    if (binding?.skillIds.length) sections.push('skills')
    if (binding?.ruleIds.length) sections.push('rules')
    if (binding?.mcpIds.length) sections.push('mcp')
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
    ? '仅展示当前页面中明确登记的结构化事实；Web Mock 未读取外部文件。'
    : undefined

  if (normalized === 'agent.yaml') return {
    title: 'Agent 身份与边界',
    description: '稳定身份、组织职责、生命周期和权限的结构化预览。',
    fields: [
      { label: '稳定 ID', value: agent.id },
      { label: '名称与岗位', value: `${agent.name} · ${agent.role}` },
      { label: '主属部门', value: agent.department },
      { label: '使命', value: agent.mission },
      { label: '权限', value: Object.entries(agent.permissions).map(([key, value]) => `${key}: ${value}`) },
      { label: 'SOP 引用', value: assetNames(agent.sopRefs, context) },
    ],
    notice: externalNotice,
  }
  if (normalized === 'soul.md') return { title: '长期行为原则', description: '职责、决策边界和禁止事项的可读预览。', fields: [{ label: '职责', value: agent.responsibilities }, { label: '决策边界', value: agent.decisionBoundaries }, { label: '禁止事项', value: agent.prohibitions }], notice: externalNotice }
  if (normalized === 'instructions.md') return { title: '主 Instructions', description: 'Agent 自有的主指令正文。', fields: [{ label: '正文', value: agent.instructions }], notice: externalNotice }
  if (normalized === 'config/skills.yaml') return { title: 'Skill 引用', description: 'Agent 显式引用的 Skill；安装事实与引用事实保持分离。', fields: [{ label: '已引用', value: assetNames(agent.skillRefs, context) }], notice: externalNotice }
  if (normalized === 'config/rules.yaml') return { title: 'Rule 引用', description: 'Agent 显式引用的规则资产。', fields: [{ label: '已引用', value: assetNames(agent.ruleRefs, context) }], notice: externalNotice }
  if (normalized === 'memory/long-term.md') {
    const spaces = context.memorySpaces.filter((item) => item.owner.includes(agent.name) && item.scopeType === 'Agent 长期')
    return { title: '长期正式记忆', description: '正式 Memory 只能经 Candidate、Review 和 Revision 更新。', fields: [{ label: 'MemorySpace', value: spaces.map((item) => `${item.owner} · ${item.revision}`) }, { label: '治理', value: spaces.map((item) => `归口 ${item.steward} · 审核 ${item.reviewer}`) }], notice: externalNotice }
  }
  if (binding && normalized.endsWith('/config.yaml')) return { title: `${workspace?.name ?? binding.workspaceId} 专属配置`, description: 'Agent × Workspace 的显式专属配置。', fields: [{ label: 'Instructions', value: binding.instructions }, { label: 'Rules', value: assetNames(binding.ruleIds, context) }, { label: 'Skills', value: assetNames(binding.skillIds, context) }, { label: 'MCP', value: assetNames(binding.mcpIds, context) }], notice: externalNotice }
  if (normalized.endsWith('/memory.md')) {
    const memoryWorkspaceId = association.file.scope.kind === 'workspace' ? association.file.scope.workspaceId : undefined
    const memoryWorkspace = context.workspaces.find((item) => item.id === memoryWorkspaceId)
    return { title: `${memoryWorkspace?.name ?? 'Workspace'} 专属记忆`, description: 'Workspace 专属记忆的治理元数据预览。', fields: [{ label: 'Revision', value: association.file.revision ?? binding?.memoryRevision ?? '未设置' }, { label: '状态', value: association.file.status }], notice: externalNotice }
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
