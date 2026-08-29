import type { FullAgent, MemoryCandidate, MemorySpace } from './domain'

type MemoryPolicyState = {
  agents: FullAgent[]
  departments: { id: string; managerAgentId?: string }[]
  workspaces: {
    id: string
    primaryDepartmentId?: string
    projectLeadAgentId?: string
    publicMemorySpaceId: string
    departmentMemorySpaceIds: string[]
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

function workspaceIdForSpace(state: MemoryPolicyState, space: MemorySpace) {
  return state.workspaces.find((workspace) =>
    workspace.publicMemorySpaceId === space.id
    || workspace.departmentMemorySpaceIds.includes(space.id)
    || space.path.includes(`/workspaces/${workspace.id}/`),
  )?.id
}

function belongsToAgent(state: MemoryPolicyState, space: MemorySpace, proposer: FullAgent) {
  if (space.scopeType === 'Agent 长期') return space.path.includes(`/agt_${proposer.id}/`)
  if (space.scopeType === 'Agent × Workspace') {
    const workspaceId = workspaceIdForSpace(state, space)
    return Boolean(workspaceId && proposer.workspaceBindings.some((binding) => binding.workspaceId === workspaceId) && space.path.includes(`/agt_${proposer.id}/`))
  }

  const workspaceId = workspaceIdForSpace(state, space)
  if (!workspaceId || !proposer.workspaceBindings.some((binding) => binding.workspaceId === workspaceId)) return false
  if (space.scopeType === 'Workspace 公共') return true

  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  return Boolean(workspace && (
    workspace.primaryDepartmentId === proposer.primaryDepartmentId
    || proposer.serviceGrants.some((grant) => grant.departmentId === workspace.primaryDepartmentId && grant.workspaceIds.includes(workspaceId) && grant.status === '有效')
  ))
}

function resolveReviewer(state: MemoryPolicyState, space: MemorySpace, proposer: FullAgent) {
  const workspaceId = workspaceIdForSpace(state, space)
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  let reviewerAgentId = space.reviewerAgentId

  if (space.scopeType === 'Agent 长期' || space.scopeType === 'Agent × Workspace') {
    reviewerAgentId = proposer.managerAgentId ?? reviewerAgentId
  } else if (space.scopeType === 'Workspace 公共') {
    reviewerAgentId = workspace?.projectLeadAgentId
      ?? state.departments.find((item) => item.id === workspace?.primaryDepartmentId)?.managerAgentId
      ?? reviewerAgentId
  } else {
    reviewerAgentId = state.departments.find((item) => item.id === workspace?.primaryDepartmentId)?.managerAgentId
      ?? reviewerAgentId
  }

  if (reviewerAgentId === proposer.id) {
    reviewerAgentId = state.agents.find((item) => item.id === reviewerAgentId)?.managerAgentId
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
