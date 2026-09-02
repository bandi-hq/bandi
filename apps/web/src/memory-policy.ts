import type { FullAgent, MemoryCandidate, MemoryReviewPrincipal, MemorySpace } from './domain'

type MemoryPolicyState = {
  agents: FullAgent[]
  companies: { id: string; assistantAgentId?: string }[]
  departments: { id: string; companyId: string; managerAgentId?: string }[]
  workspaces: {
    id: string
    companyId?: string
    primaryDepartmentId?: string
    collaboratorDepartmentIds: string[]
    projectLeadAgentId?: string
  }[]
  memorySpaces: MemorySpace[]
  memoryCandidates: MemoryCandidate[]
}

export type MemoryGovernance = {
  space?: MemorySpace
  reviewPrincipal?: MemoryReviewPrincipal
  canPropose: boolean
  canReview: boolean
  errors: string[]
}

function hasWorkspaceBinding(agent: FullAgent, workspaceId: string) {
  return agent.workspaceBindings.some((binding) => binding.workspaceId === workspaceId)
}

function hasDepartmentAccess(state: MemoryPolicyState, agent: FullAgent, departmentId: string, workspaceId: string) {
  if (agent.primaryDepartmentId === departmentId) return true
  return agent.serviceGrants.some((grant) =>
    grant.departmentId === departmentId
    && grant.workspaceIds.includes(workspaceId)
    && grant.status === '有效',
  )
}

function belongsToAgent(state: MemoryPolicyState, space: MemorySpace, proposer: FullAgent) {
  const key = space.scopeKey
  if (key.kind === 'agent_long_term') return key.agentId === proposer.id
  if (key.kind === 'agent_workspace') return key.agentId === proposer.id && hasWorkspaceBinding(proposer, key.workspaceId)
  if (!hasWorkspaceBinding(proposer, key.workspaceId)) return false
  if (key.kind === 'workspace_shared') return true

  const workspace = state.workspaces.find((item) => item.id === key.workspaceId)
  const departmentParticipates = workspace?.primaryDepartmentId === key.departmentId
    || workspace?.collaboratorDepartmentIds.includes(key.departmentId)
  return Boolean(departmentParticipates && hasDepartmentAccess(state, proposer, key.departmentId, key.workspaceId))
}

function fallbackPrincipal(state: MemoryPolicyState, companyId: string | undefined, proposerId: string): MemoryReviewPrincipal | undefined {
  if (!companyId) return undefined
  const assistantId = state.companies.find((item) => item.id === companyId)?.assistantAgentId
  const assistant = state.agents.find((item) => item.id === assistantId && item.status === 'active')
  return assistant && assistant.id !== proposerId
    ? { kind: 'agent', agentId: assistant.id }
    : { kind: 'chairman_user', companyId }
}

function resolveReviewer(state: MemoryPolicyState, space: MemorySpace, proposer: FullAgent): MemoryReviewPrincipal | undefined {
  const key = space.scopeKey
  const workspaceId = 'workspaceId' in key ? key.workspaceId : undefined
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  const companyId = workspace?.companyId ?? proposer.companyId

  if (key.kind === 'agent_long_term' || key.kind === 'agent_workspace') {
    const manager = state.agents.find((item) => item.id === proposer.managerAgentId && item.status === 'active')
    return manager && manager.id !== proposer.id
      ? { kind: 'agent', agentId: manager.id }
      : fallbackPrincipal(state, companyId, proposer.id)
  }

  const departmentId = key.kind === 'workspace_shared' ? workspace?.primaryDepartmentId : key.departmentId
  const department = state.departments.find((item) => item.id === departmentId)
  const steward = state.agents.find((item) => item.id === department?.managerAgentId && item.status === 'active')
  if (!steward) return undefined
  return steward.id === proposer.id
    ? fallbackPrincipal(state, department?.companyId ?? companyId, proposer.id)
    : { kind: 'agent', agentId: steward.id }
}

export function getEligibleMemorySpaces(state: MemoryPolicyState, proposerAgentId: string) {
  const proposer = state.agents.find((item) => item.id === proposerAgentId)
  if (!proposer) return []
  return state.memorySpaces.filter((space) => belongsToAgent(state, space, proposer))
}

export function resolveMemoryGovernance(state: MemoryPolicyState, spaceId: string, proposerAgentId: string): MemoryGovernance {
  const proposer = state.agents.find((item) => item.id === proposerAgentId)
  const space = state.memorySpaces.find((item) => item.id === spaceId)
  const errors: string[] = []

  if (!proposer) errors.push('提议者不存在。')
  if (!space) errors.push('目标 MemorySpace 不存在。')
  if (proposer && space && !belongsToAgent(state, space, proposer)) errors.push('该 MemorySpace 不属于提议者可写入的范围。')

  const reviewPrincipal = proposer && space ? resolveReviewer(state, space, proposer) : undefined
  if (proposer && !reviewPrincipal) errors.push('没有可用的独立审核责任主体，请先完善公司或主管关系。')
  if (reviewPrincipal?.kind === 'agent' && reviewPrincipal.agentId === proposerAgentId) errors.push('提议者不能审核自己的候选。')

  return {
    space,
    reviewPrincipal,
    canPropose: errors.length === 0,
    canReview: errors.length === 0 && Boolean(reviewPrincipal),
    errors,
  }
}

export function retargetMemoryCandidate(state: MemoryPolicyState, candidateId: string, nextSpaceId: string) {
  const candidate = state.memoryCandidates.find((item) => item.id === candidateId)
  if (!candidate) return undefined
  const governance = resolveMemoryGovernance(state, nextSpaceId, candidate.proposerAgentId)
  if (!governance.canPropose || !governance.reviewPrincipal) return undefined
  return { ...candidate, spaceId: nextSpaceId, reviewPrincipal: governance.reviewPrincipal }
}
