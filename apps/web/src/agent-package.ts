import type { AgentFile } from './domain'

export type AgentPackageNode = {
  name: string
  path: string
  kind: 'directory' | 'file'
  children: AgentPackageNode[]
  file?: AgentFile
}

export function normalizeAgentPackagePath(path: string): string | undefined {
  const normalized = path.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.endsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return undefined
  return normalized
}

export function buildAgentPackageTree(files: AgentFile[]): AgentPackageNode[] {
  const roots: AgentPackageNode[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const path = normalizeAgentPackagePath(file.path)
    if (!path || seen.has(path)) continue
    seen.add(path)
    const parts = path.split('/')
    let level = roots
    parts.forEach((name, index) => {
      const nodePath = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      let node = level.find((item) => item.name === name)
      if (!node) {
        node = { name, path: nodePath, kind: isFile ? 'file' : 'directory', children: [], file: isFile ? { ...file, path } : undefined }
        level.push(node)
        level.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1)
      }
      level = node.children
    })
  }
  return roots
}

export function findAgentPackageNode(nodes: AgentPackageNode[], path: string): AgentPackageNode | undefined {
  const normalized = normalizeAgentPackagePath(path)
  if (!normalized) return undefined
  for (const node of nodes) {
    if (node.path === normalized) return node
    const child = findAgentPackageNode(node.children, normalized)
    if (child) return child
  }
  return undefined
}

export function getDefaultAgentPackagePath(files: AgentFile[]): string | undefined {
  const paths = files.map((file) => normalizeAgentPackagePath(file.path)).filter((path): path is string => Boolean(path))
  return paths.includes('agent.yaml') ? 'agent.yaml' : paths[0]
}

export const getAgentPackageBreadcrumb = (path: string) => normalizeAgentPackagePath(path)?.split('/') ?? []
