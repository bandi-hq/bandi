import type { FullAgent, MemoryCandidate, MemorySpace } from './domain'

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
  reviewerAgentId?: string
  canPropose: boolean
  canReview: boolean
  errors: string[]
}

function workspaceIdForSpace(space: MemorySpace) {
  return 'workspaceId' in space.scopeKey ? space.scopeKey.workspaceId : undefined
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
  if (key.kind === 'agent_workspace') {
    return key.agentId === proposer.id && hasWorkspaceBinding(proposer, key.workspaceId)
  }
  if (!hasWorkspaceBinding(proposer, key.workspaceId)) return false
  if (key.kind === 'workspace_shared') return true

  const workspace = state.workspaces.find((item) => item.id === key.workspaceId)
  const departmentParticipates = workspace?.primaryDepartmentId === key.departmentId
    || workspace?.collaboratorDepartmentIds.includes(key.departmentId)
  return Boolean(departmentParticipates && hasDepartmentAccess(state, proposer, key.departmentId, key.workspaceId))
}

function companyAssistant(state: MemoryPolicyState, workspaceId?: string, agent?: FullAgent) {
  const companyId = workspaceId
    ? state.workspaces.find((item) => item.id === workspaceId)?.companyId
    : state.departments.find((item) => item.id === agent?.primaryDepartmentId)?.companyId
  return state.companies.find((item) => item.id === companyId)?.assistantAgentId
}

function resolveReviewer(state: MemoryPolicyState, space: MemorySpace, proposer: FullAgent) {
  const key = space.scopeKey
  const workspaceId = workspaceIdForSpace(space)
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  let reviewerAgentId: string | undefined

  if (key.kind === 'agent_long_term' || key.kind === 'agent_workspace') {
    reviewerAgentId = proposer.managerAgentId ?? companyAssistant(state, workspaceId, proposer)
  } else if (key.kind === 'workspace_shared') {
    reviewerAgentId = state.departments.find((item) => item.id === workspace?.primaryDepartmentId)?.managerAgentId
      ?? workspace?.projectLeadAgentId
  } else {
    reviewerAgentId = state.departments.find((item) => item.id === key.departmentId)?.managerAgentId
  }

  if (reviewerAgentId === proposer.id) {
    reviewerAgentId = state.agents.find((item) => item.id === reviewerAgentId)?.managerAgentId
      ?? companyAssistant(state, workspaceId, proposer)
  }

  return reviewerAgentId
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

  const reviewerAgentId = proposer && space ? resolveReviewer(state, space, proposer) : undefined
  if (proposer && !reviewerAgentId) errors.push('没有可用的独立审核者，请先完善主管或项目责任关系。')
  if (reviewerAgentId && !state.agents.some((item) => item.id === reviewerAgentId)) errors.push('审核者不存在。')
  if (reviewerAgentId === proposerAgentId) errors.push('提议者不能审核自己的候选。')

  return {
    space,
    reviewerAgentId,
    canPropose: errors.length === 0,
    canReview: errors.length === 0 && Boolean(reviewerAgentId),
    errors,
  }
}

export function retargetMemoryCandidate(state: MemoryPolicyState, candidateId: string, nextSpaceId: string) {
  const candidate = state.memoryCandidates.find((item) => item.id === candidateId)
  if (!candidate) return undefined
  const governance = resolveMemoryGovernance(state, nextSpaceId, candidate.proposerAgentId)
  if (!governance.canPropose || !governance.reviewerAgentId) return undefined
  return { ...candidate, spaceId: nextSpaceId, reviewerAgentId: governance.reviewerAgentId }
}
