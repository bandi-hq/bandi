import { describe, expect, it } from 'vitest'
import { clientLaunchProfileError, configurationEnvironmentPath, isHighRiskLaunchProfile, normalizeConfigurationEnvironment, serializeConfigurationEnvironment, validateConfigurationEnvironment } from '../configuration-environment-model'
import type { ConfigurationEnvironment } from '../domain'

const environment: ConfigurationEnvironment = { id: 'company-a', name: 'A 公司', clientIds: ['codex', 'claude-code', 'codex'], evidence: 'memory-only' }
const clients = ['claude-code', 'codex']

describe('配置环境模型', () => {
  it('规范化工具引用并稳定序列化', () => {
    const normalized = normalizeConfigurationEnvironment(environment)
    expect(normalized.clientIds).toEqual(['claude-code', 'codex'])
    expect(configurationEnvironmentPath(normalized)).toBe('configuration-environments/company-a.yaml')
    expect(serializeConfigurationEnvironment(normalized, clients)).toContain('- "claude-code"')
  })

  it('允许空环境并拒绝非法 ID 和不存在的工具', () => {
    expect(validateConfigurationEnvironment({ ...environment, clientIds: [] }, clients)).toEqual({})
    expect(validateConfigurationEnvironment({ ...environment, id: '../bad' }, clients).id).toBeDefined()
    expect(validateConfigurationEnvironment({ ...environment, clientIds: ['missing'] }, clients).clientIds).toBeDefined()
  })

  it('保留结构化参数顺序并序列化启动配置', () => {
    const configured: ConfigurationEnvironment = {
      ...environment,
      clientLaunchProfiles: {
        'claude-code': {
          version: 1,
          executable: ' claude ',
          args: ['--model', ' opus ', '--dangerously-skip-permissions'],
          enterBandiOnStart: true,
        },
      },
    }
    const normalized = normalizeConfigurationEnvironment(configured)
    expect(normalized.clientLaunchProfiles?.['claude-code']).toEqual({
      version: 1,
      executable: 'claude',
      args: ['--model', 'opus', '--dangerously-skip-permissions'],
      enterBandiOnStart: true,
    })
    expect(serializeConfigurationEnvironment(configured, clients)).toContain('clientLaunchProfiles:')
    expect(isHighRiskLaunchProfile(normalized.clientLaunchProfiles!['claude-code'])).toBe(true)
  })

  it('拒绝 Shell 命令名、换行参数和悬空启动配置', () => {
    expect(clientLaunchProfileError({ version: 1, executable: 'claude && other', args: [], enterBandiOnStart: true })).toBeDefined()
    expect(clientLaunchProfileError({ version: 1, executable: 'claude', args: ['ok\nbad'], enterBandiOnStart: true })).toBeDefined()
    expect(validateConfigurationEnvironment({
      ...environment,
      clientLaunchProfiles: { missing: { version: 1, executable: 'claude', args: [], enterBandiOnStart: true } },
    }, clients).clientLaunchProfiles).toBeDefined()
  })
})
