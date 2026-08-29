import { getAgentFileAssociation, type AgentProjectionContext } from './agent-config-projection'
import type { FullAgent } from './domain'

export type AgentFileSource =
  | { status: 'available'; provenance: 'demo-projection'; language: 'yaml' | 'markdown' | 'json' | 'text'; content: string }
  | { status: 'unavailable'; reason: 'external-reference' | 'unsupported-file'; message: string }

const quote = (value: string) => JSON.stringify(value)
const yamlList = (values: string[], indent = '  ') => values.length ? values.map((item) => `${indent}- ${quote(item)}`).join('\n') : `${indent}[]`
const assetIds = (ids: string[]) => yamlList(ids)

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
    content: [
      `workspaceId: ${quote(binding.workspaceId)}`,
      `instructions: ${quote(binding.instructions)}`,
      'rules:', assetIds(binding.ruleIds),
      'skills:', assetIds(binding.skillIds),
      'mcp:', assetIds(binding.mcpIds),
      `memoryRevision: ${quote(binding.memoryRevision)}`,
    ].join('\n'),
  }
}

export function projectAgentFileSource(agent: FullAgent, _context: AgentProjectionContext, path: string): AgentFileSource {
  const association = getAgentFileAssociation(agent, path)
  if (!association) return { status: 'unavailable', reason: 'unsupported-file', message: '文件不在当前 AgentPackage 的演示记录中。' }
  if (agent.packageSource.kind === 'external-reference') return { status: 'unavailable', reason: 'external-reference', message: '源码不可用：此 AgentPackage 仅登记为外部只读引用，Web Mock 未读取磁盘。' }

  const normalized = association.file.path
  const workspace = workspaceSource(agent, normalized)
  if (workspace) return workspace

  if (normalized === 'agent.yaml') return {
    status: 'available', provenance: 'demo-projection', language: 'yaml',
    content: [
      `id: ${quote(agent.id)}`,
      `name: ${quote(agent.name)}`,
      `role: ${quote(agent.role)}`,
      `status: ${quote(agent.status)}`,
      `companyId: ${quote(agent.companyId ?? '')}`,
      `primaryDepartmentId: ${quote(agent.primaryDepartmentId ?? '')}`,
      `mission: ${quote(agent.mission)}`,
      'responsibilities:', yamlList(agent.responsibilities),
      'permissions:',
      `  files: ${quote(agent.permissions.files)}`,
      `  commands: ${quote(agent.permissions.commands)}`,
      `  network: ${quote(agent.permissions.network)}`,
      `  delegation: ${quote(agent.permissions.delegation)}`,
      'sopRefs:', assetIds(agent.sopRefs),
    ].join('\n'),
  }
  if (normalized === 'soul.md') return {
    status: 'available', provenance: 'demo-projection', language: 'markdown',
    content: `# ${agent.name} 行为原则\n\n## 主要职责\n\n${agent.responsibilities.map((item) => `- ${item}`).join('\n')}\n\n## 决策边界\n\n${agent.decisionBoundaries.map((item) => `- ${item}`).join('\n')}\n\n## 禁止事项\n\n${agent.prohibitions.map((item) => `- ${item}`).join('\n')}`,
  }
  if (normalized === 'instructions.md') return { status: 'available', provenance: 'demo-projection', language: 'markdown', content: agent.instructions }
  if (normalized === 'config/skills.yaml') return { status: 'available', provenance: 'demo-projection', language: 'yaml', content: `skills:\n${assetIds(agent.skillRefs)}` }
  if (normalized === 'config/rules.yaml') return { status: 'available', provenance: 'demo-projection', language: 'yaml', content: `rules:\n${assetIds(agent.ruleRefs)}` }
  if (/^config\/mcp\.(yaml|json)$/.test(normalized)) return { status: 'available', provenance: 'demo-projection', language: normalized.endsWith('.json') ? 'json' : 'yaml', content: normalized.endsWith('.json') ? JSON.stringify({ mcp: agent.mcpRefs }, null, 2) : `mcp:\n${assetIds(agent.mcpRefs)}` }
  if (normalized === 'memory/long-term.md') return { status: 'available', provenance: 'demo-projection', language: 'markdown', content: `# 长期正式记忆\n\nRevision: ${association.file.revision ?? '未设置'}\n\n正式内容未在 Web Mock 中读取；修改必须经过 MemoryCandidate、Review 和 MemoryRevision。` }

  return { status: 'unavailable', reason: 'unsupported-file', message: '文件已登记，但当前 Web Mock 尚未定义该格式的源码投影。' }
}
