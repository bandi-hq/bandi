import { describe, expect, it } from 'vitest'
import { initialState } from '../state'
import {
  getEligibleMemorySpaces,
  resolveMemoryGovernance,
  retargetMemoryCandidate,
} from '../memory-policy'

describe('Memory 治理策略', () => {
  it('只返回提议者合法可写入的空间', () => {
    const spaces = getEligibleMemorySpaces(initialState, 'linxu')
    expect(spaces.length).toBeGreaterThan(0)
    expect(spaces.every((space) => resolveMemoryGovernance(initialState, space.id, 'linxu').canPropose)).toBe(true)
    expect(spaces.some((space) => space.id === 'mem-agent-zhouce')).toBe(false)
  })

  it('Agent 长期空间由独立主管审核', () => {
    const result = resolveMemoryGovernance(initialState, 'mem-agent-zhouce', 'zhouce')
    expect(result.canPropose).toBe(true)
    expect(result.reviewerAgentId).not.toBe('zhouce')
  })

  it('拒绝跨 Agent 写入', () => {
    const result = resolveMemoryGovernance(initialState, 'mem-agent-zhouce', 'linxu')
    expect(result.canPropose).toBe(false)
    expect(result.errors).toContain('该 MemorySpace 不属于提议者可写入的范围。')
  })

  it('缺少独立审核者时阻塞候选', () => {
    const state = {
      ...initialState,
      agents: initialState.agents.map((agent) => agent.id === 'zhouce'
        ? { ...agent, managerAgentId: undefined }
        : agent),
      companies: initialState.companies.map((company) => company.id === 'xinghe'
        ? { ...company, assistantAgentId: undefined }
        : company),
      memorySpaces: initialState.memorySpaces.map((space) => space.id === 'mem-agent-zhouce'
        ? { ...space, reviewerAgentId: undefined }
        : space),
    }
    const result = resolveMemoryGovernance(state, 'mem-agent-zhouce', 'zhouce')
    expect(result.canPropose).toBe(false)
    expect(result.errors).toContain('没有可用的独立审核者，请先完善主管或项目责任关系。')
  })

  it('改投合法空间后重新计算审核者', () => {
    const candidate = initialState.memoryCandidates.find((item) => item.proposerAgentId === 'zhouce')
    const target = getEligibleMemorySpaces(initialState, 'zhouce').find((space) => space.id !== candidate?.spaceId)
    expect(candidate).toBeDefined()
    expect(target).toBeDefined()
    const result = retargetMemoryCandidate(initialState, candidate!.id, target!.id)
    const governance = resolveMemoryGovernance(initialState, target!.id, 'zhouce')
    expect(result?.spaceId).toBe(target!.id)
    expect(result?.reviewerAgentId).toBe(governance.reviewerAgentId)
  })
})
