import { describe, expect, it } from 'vitest'
import { configurationEnvironmentPath, isConfigurationEnvironment, normalizeConfigurationEnvironment, serializeConfigurationEnvironment, validateConfigurationEnvironment } from '../configuration-environment-model'
import type { ConfigurationEnvironment } from '../domain'

const environment: ConfigurationEnvironment = { id: 'company-a', name: 'A 公司', clientIds: ['codex', 'claude-code', 'codex'], evidence: 'memory-only' }
const clients = ['claude-code', 'codex']

describe('配置环境模型', () => {
  it('规范化工具引用并稳定序列化', () => {
    const normalized = normalizeConfigurationEnvironment(environment)
    expect(normalized.clientIds).toEqual(['claude-code', 'codex'])
    expect(configurationEnvironmentPath(normalized)).toBe('configuration-environments/company-a.yaml')
    const serialized = serializeConfigurationEnvironment(normalized, clients)
    expect(serialized).toContain('- "claude-code"')
    expect(serialized).not.toContain('clientLaunchProfiles')
  })

  it('允许空环境并拒绝非法 ID 和不存在的工具', () => {
    expect(validateConfigurationEnvironment({ ...environment, clientIds: [] }, clients)).toEqual({})
    expect(validateConfigurationEnvironment({ ...environment, id: '../bad' }, clients).id).toBeDefined()
    expect(validateConfigurationEnvironment({ ...environment, clientIds: ['missing'] }, clients).clientIds).toBeDefined()
  })

  it('运行时合同只接受方案身份、工具引用和证据', () => {
    expect(isConfigurationEnvironment(environment)).toBe(true)
    expect(isConfigurationEnvironment({ ...environment, clientIds: [1] })).toBe(false)
  })
})
