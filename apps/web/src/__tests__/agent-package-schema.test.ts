import { describe, expect, it } from 'vitest'
import {
  getAgentPackageCompatibility,
  getAgentPackageEditability,
  isAgentPackageSchema,
} from '../agent-package-schema'

describe('AgentPackage schema', () => {
  it('区分 current、legacy、future 和 unverified', () => {
    expect(getAgentPackageCompatibility(1, true)).toBe('current')
    expect(getAgentPackageCompatibility(undefined, true)).toBe('legacy')
    expect(getAgentPackageCompatibility(2, true)).toBe('future')
    expect(getAgentPackageCompatibility(1, false)).toBe('unverified')
  })

  it('只有元数据一致的 current v1 可编辑', () => {
    expect(getAgentPackageEditability({ schemaVersion: 1, compatibility: 'current' })).toEqual({ editable: true })
    expect(getAgentPackageEditability({ schemaVersion: 2, compatibility: 'current' }).editable).toBe(false)
    expect(getAgentPackageEditability({ schemaVersion: 1, compatibility: 'legacy' }).editable).toBe(false)
    expect(getAgentPackageEditability({ schemaVersion: 1, compatibility: 'future' }).editable).toBe(false)
    expect(getAgentPackageEditability({ compatibility: 'unverified' }).editable).toBe(false)
  })

  it('运行时 guard 拒绝非法版本和兼容状态', () => {
    expect(isAgentPackageSchema({ schemaVersion: 1, compatibility: 'current' })).toBe(true)
    expect(isAgentPackageSchema({ compatibility: 'unverified' })).toBe(true)
    expect(isAgentPackageSchema({ schemaVersion: 0, compatibility: 'current' })).toBe(false)
    expect(isAgentPackageSchema({ schemaVersion: 1, compatibility: 'unknown' })).toBe(false)
  })
})
