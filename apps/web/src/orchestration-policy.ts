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

const stableIdPattern = /^[A-Za-z0-9._-]+$/

function hasInvalidIds(values: string[]) {
  return values.length > 500
    || new Set(values).size !== values.length
    || values.some((value) => !stableIdPattern.test(value) || value === '.' || value === '..')
}

function hasInvalidStatements(values: string[]) {
  return values.length > 100
    || values.some((value) => !value.trim() || value.length > 512 || value.includes('\0'))
}

export function validateOrchestrationPolicy(policy: OrchestrationPolicy): OrchestrationIssue[] {
  if (!Number.isInteger(policy.maxDelegationDepth) || policy.maxDelegationDepth < 0 || policy.maxDelegationDepth > 32) {
    return [{ code: 'invalid-depth', message: '最大委派深度必须是 0 到 32 的整数。' }]
  }
  if (hasInvalidIds(policy.allowedAgentIds) || hasInvalidIds(policy.allowedRoleIds) || hasInvalidIds(policy.allowedDepartmentIds)
    || (policy.escalationAgentId !== undefined && hasInvalidIds([policy.escalationAgentId]))) {
    return [{ code: 'expanded-scope', message: '委派范围必须使用不重复的稳定标识，且每类最多 500 项。' }]
  }
  if (hasInvalidStatements(policy.escalationConditions) || hasInvalidStatements(policy.prohibitions)) {
    return [{ code: 'expanded-scope', message: '升级条件和禁止事项必须为非空文本，每类最多 100 项、每项最多 512 字符。' }]
  }
  return []
}

export function validateOrchestrationOverride(
  root: OrchestrationPolicy,
  override: OrchestrationPolicyOverride,
): OrchestrationIssue[] {
  const issues: OrchestrationIssue[] = []
  if (override.enabled === true && !root.enabled) issues.push({ code: 'expanded-scope', message: '工作区不能启用根策略已禁止的委派。' })
  if (override.maxDelegationDepth !== undefined && (!Number.isInteger(override.maxDelegationDepth) || override.maxDelegationDepth < 0 || override.maxDelegationDepth > root.maxDelegationDepth)) issues.push({ code: 'expanded-scope', message: '工作区最大委派深度必须是 0 到根级深度之间的整数。' })
  for (const values of [override.allowedAgentIds, override.allowedRoleIds, override.allowedDepartmentIds]) {
    if (values && hasInvalidIds(values)) issues.push({ code: 'expanded-scope', message: '工作区委派范围必须使用不重复的稳定标识，且每类最多 500 项。' })
  }
  if (override.escalationAgentId !== undefined && hasInvalidIds([override.escalationAgentId])) issues.push({ code: 'expanded-scope', message: '工作区升级目标必须使用稳定 Agent ID。' })
  if (override.escalationConditions && hasInvalidStatements(override.escalationConditions)) issues.push({ code: 'expanded-scope', message: '工作区升级条件必须为非空文本，每类最多 100 项、每项最多 512 字符。' })
  if (override.prohibitions && hasInvalidStatements(override.prohibitions)) issues.push({ code: 'expanded-scope', message: '工作区禁止事项必须为非空文本，每类最多 100 项、每项最多 512 字符。' })
  for (const [candidate, allowed, label] of [
    [override.allowedAgentIds, root.allowedAgentIds, 'Agent'],
    [override.allowedRoleIds, root.allowedRoleIds, '岗位'],
    [override.allowedDepartmentIds, root.allowedDepartmentIds, '部门'],
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
