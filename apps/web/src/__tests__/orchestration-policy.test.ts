import { describe, expect, it } from 'vitest'
import {
  findDelegationCycles,
  mergeOrchestrationPolicy,
  validateOrchestrationOverride,
  validateOrchestrationPolicy,
  type OrchestrationPolicy,
} from '../orchestration-policy'

const root: OrchestrationPolicy = {
  enabled: true,
  maxDelegationDepth: 2,
  allowedAgentIds: ['a', 'b'],
  allowedRoleIds: ['lead', 'engineer'],
  allowedDepartmentIds: ['dev', 'qa'],
  requireWorkspaceBinding: true,
  requireSopMatch: true,
  requireServiceGrantForCrossDepartment: true,
  escalationAgentId: 'a',
  escalationConditions: ['没有合法候选'],
  prohibitions: ['禁止跨公司'],
}

describe('OrchestrationPolicy', () => {
  it('接受只收紧的 Workspace override', () => {
    const override = {
      enabled: false,
      maxDelegationDepth: 1,
      allowedAgentIds: ['b'],
      allowedRoleIds: ['engineer'],
      allowedDepartmentIds: ['dev'],
      prohibitions: ['禁止跨公司', '禁止生产发布'],
    }
    expect(validateOrchestrationOverride(root, override)).toEqual([])
    expect(mergeOrchestrationPolicy(root, override)).toMatchObject(override)
  })

  it('拒绝扩大范围、减弱要求和删除禁止事项', () => {
    const issues = validateOrchestrationOverride(root, {
      maxDelegationDepth: 3,
      allowedAgentIds: ['c'],
      requireSopMatch: false,
      prohibitions: [],
    })
    expect(issues.map((issue) => issue.code)).toEqual([
      'expanded-scope',
      'expanded-scope',
      'weakened-requirement',
      'removed-prohibition',
    ])
  })

  it('拒绝非法深度并检测委派环', () => {
    expect(validateOrchestrationPolicy({ ...root, maxDelegationDepth: -1 })[0]?.code).toBe('invalid-depth')
    const cycles = findDelegationCycles(new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]))
    expect(cycles).toEqual([['a', 'b', 'c', 'a']])
  })
})
