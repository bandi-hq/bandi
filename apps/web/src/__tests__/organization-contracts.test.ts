import { describe, expect, it } from 'vitest'
import fixture from '../../../../packages/contracts/fixtures/organization-snapshot.valid.json'
import type { OrganizationSnapshot } from '../contracts'

describe('组织与工作区共享合同', () => {
  it('使用 camelCase DTO 并保留稳定组织关系', () => {
    const snapshot = fixture as OrganizationSnapshot
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.departments[0].companyId).toBe(snapshot.companies[0].id)
    expect(snapshot.roles[0].departmentId).toBe(snapshot.departments[0].id)
    expect(snapshot.workspaces[0].primaryDepartmentId).toBe(snapshot.departments[0].id)
    expect(snapshot.serviceGrants[0].agentId).toBe('agent-owner')
    expect(snapshot.serviceGrants[0].workspaceIds).toEqual([snapshot.workspaces[0].id])
  })
})
