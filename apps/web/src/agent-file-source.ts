import { getAgentFileAssociation, type AgentProjectionContext } from './agent-config-projection'
import type { FullAgent } from './domain'
import { agentRootConfigPaths, serializeAgentConfig, snapshotAgentConfig, type AgentConfigPayload } from './agent-config-model'
import { getAgentPackageEditability } from './agent-package-schema'

export type AgentFileSource =
  | { status: 'available'; provenance: 'demo-projection'; language: 'yaml' | 'markdown' | 'json' | 'text'; content: string }
  | { status: 'unavailable'; reason: 'incompatible-package' | 'external-reference' | 'unsupported-file'; message: string }

const sourceKinds: Exclude<AgentConfigPayload['kind'], 'identity' | 'workspace-binding'>[] = [
  'instructions',
  'context',
  'skills',
  'rules',
  'mcp',
  'permissions',
  'sop',
  'orchestration',
  'hooks',
  'commands',
]

const configKindByPath = new Map<string, (typeof sourceKinds)[number]>(
  sourceKinds.map((kind) => [agentRootConfigPaths[kind], kind]),
)

function workspaceSource(agent: FullAgent, path: string): AgentFileSource | undefined {
  const match = /^workspaces\/([^/]+)\/(config\.yaml|memory\.md)$/.exec(path)
  if (!match) return undefined
  const binding = agent.workspaceBindings.find((item) => item.workspaceId === match[1])
  if (!binding) return { status: 'unavailable', reason: 'unsupported-file', message: '文件已登记，但当前页面内存中没有对应的 WorkspaceBinding。' }
  if (match[2] === 'memory.md') return {
    status: 'available', provenance: 'demo-projection', language: 'markdown',
    content: `# Workspace Memory\n\n- Workspace: ${binding.workspaceId}\n- Revision: ${binding.memoryRevision}\n\n正式内容未在 Web Mock 中读取；修改仍需经过 MemoryCandidate、Review 和 MemoryRevision。`,
  }
  return {
    status: 'available', provenance: 'demo-projection', language: 'yaml',
    content: serializeAgentConfig(agent, { kind: 'workspace-binding', value: binding }) ?? '',
  }
}

export function projectAgentFileSource(agent: FullAgent, _context: AgentProjectionContext, path: string): AgentFileSource {
  const association = getAgentFileAssociation(agent, path)
  if (!association) return { status: 'unavailable', reason: 'unsupported-file', message: '文件不在当前 AgentPackage 的演示记录中。' }
  if (agent.packageSource.kind === 'external-reference' || agent.packageSchema.compatibility === 'unverified') return { status: 'unavailable', reason: 'external-reference', message: '源码不可用：此 AgentPackage 仅登记为外部只读引用，Web Mock 未读取磁盘。' }
  const editability = getAgentPackageEditability(agent.packageSchema)
  if (!editability.editable) return { status: 'unavailable', reason: 'incompatible-package', message: `源码不可用：${editability.reason ?? '当前 AgentPackage 与 v1 不兼容。'}` }

  const normalized = association.file.path
  const workspace = workspaceSource(agent, normalized)
  if (workspace) return workspace

  if (normalized === 'agent.yaml') {
    const payload = snapshotAgentConfig(agent, 'identity')
    const content = payload ? serializeAgentConfig(agent, payload) : undefined
    if (content !== undefined) return { status: 'available', provenance: 'demo-projection', language: 'yaml', content }
  }
  if (normalized === 'soul.md') return {
    status: 'available', provenance: 'demo-projection', language: 'markdown',
    content: `# ${agent.name} 行为原则\n\n## 主要职责\n\n${agent.responsibilities.map((item) => `- ${item}`).join('\n')}\n\n## 决策边界\n\n${agent.decisionBoundaries.map((item) => `- ${item}`).join('\n')}\n\n## 禁止事项\n\n${agent.prohibitions.map((item) => `- ${item}`).join('\n')}`,
  }
  const configKind = configKindByPath.get(normalized)
  if (configKind) {
    const payload = snapshotAgentConfig(agent, configKind)
    const content = payload ? serializeAgentConfig(agent, payload) : undefined
    if (content !== undefined) return { status: 'available', provenance: 'demo-projection', language: configKind === 'instructions' ? 'markdown' : 'yaml', content }
  }
  if (/^config\/mcp\.json$/.test(normalized)) return { status: 'available', provenance: 'demo-projection', language: 'json', content: JSON.stringify({ mcp: agent.mcpRefs }, null, 2) }
  if (normalized === 'memory/long-term.md') return { status: 'available', provenance: 'demo-projection', language: 'markdown', content: `# 长期正式记忆\n\nRevision: ${association.file.revision ?? '未设置'}\n\n正式内容未在 Web Mock 中读取；修改必须经过 MemoryCandidate、Review 和 MemoryRevision。` }

  return { status: 'unavailable', reason: 'unsupported-file', message: '文件已登记，但当前 Web Mock 尚未定义该格式的源码投影。' }
}
