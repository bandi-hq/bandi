export type OrchestrationPolicy = {
  enabled: boolean
  maxDelegationDepth: number
  allowedAgentIds: string[]
  allowedRoleIds: string[]
  allowedDepartmentIds: string[]
  requireWorkspaceBinding: boolean
  requireSopMatch: boolean
  requireServiceGrantForCrossDepartment: boolean
  escalationAgentId?: string
  escalationConditions: string[]
  prohibitions: string[]
}

export type OrchestrationPolicyOverride = Partial<OrchestrationPolicy>

export type OrchestrationIssue = {
  code: 'invalid-depth' | 'expanded-scope' | 'weakened-requirement' | 'removed-prohibition' | 'delegation-cycle'
  message: string
}

function isSubset(candidate: string[], root: string[]) {
  const allowed = new Set(root)
  return candidate.every((item) => allowed.has(item))
}

export function validateOrchestrationPolicy(policy: OrchestrationPolicy): OrchestrationIssue[] {
  if (!Number.isInteger(policy.maxDelegationDepth) || policy.maxDelegationDepth < 0) {
    return [{ code: 'invalid-depth', message: '最大委派深度必须是非负整数。' }]
  }
  return []
}

export function validateOrchestrationOverride(
  root: OrchestrationPolicy,
  override: OrchestrationPolicyOverride,
): OrchestrationIssue[] {
  const issues: OrchestrationIssue[] = []
  if (override.enabled === true && !root.enabled) issues.push({ code: 'expanded-scope', message: '工作区不能启用根策略已禁止的委派。' })
  if (override.maxDelegationDepth !== undefined && override.maxDelegationDepth > root.maxDelegationDepth) issues.push({ code: 'expanded-scope', message: '工作区最大委派深度不能高于根策略。' })
  for (const [candidate, allowed, label] of [
    [override.allowedAgentIds, root.allowedAgentIds, 'Agent'],
    [override.allowedRoleIds, root.allowedRoleIds, 'Role'],
    [override.allowedDepartmentIds, root.allowedDepartmentIds, 'Department'],
  ] as const) {
    if (candidate && !isSubset(candidate, allowed)) issues.push({ code: 'expanded-scope', message: `工作区 ${label} 范围必须是根策略的子集。` })
  }
  for (const key of ['requireWorkspaceBinding', 'requireSopMatch', 'requireServiceGrantForCrossDepartment'] as const) {
    if (root[key] && override[key] === false) issues.push({ code: 'weakened-requirement', message: '工作区不能取消根策略的必需条件。' })
  }
  if (override.prohibitions && !isSubset(root.prohibitions, override.prohibitions)) issues.push({ code: 'removed-prohibition', message: '工作区禁止事项必须保留根策略全部条目。' })
  return issues
}

export function mergeOrchestrationPolicy(
  root: OrchestrationPolicy,
  override?: OrchestrationPolicyOverride,
): OrchestrationPolicy {
  if (!override) return root
  return { ...root, ...override }
}

export function findDelegationCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const cycles: string[][] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []

  function visit(agentId: string) {
    if (visiting.has(agentId)) {
      const start = path.indexOf(agentId)
      cycles.push([...path.slice(start), agentId])
      return
    }
    if (visited.has(agentId)) return
    visiting.add(agentId)
    path.push(agentId)
    for (const target of edges.get(agentId) ?? []) visit(target)
    path.pop()
    visiting.delete(agentId)
    visited.add(agentId)
  }

  for (const agentId of edges.keys()) visit(agentId)
  return cycles
}
