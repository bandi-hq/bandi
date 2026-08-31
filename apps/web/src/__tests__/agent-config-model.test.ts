import { describe, expect, it } from 'vitest'
import { applyAgentConfig, describeAgentConfigFile, getAgentConfigPath, isAgentConfigPayload, serializeAgentConfig, snapshotAgentConfig, validateContextPolicy, workspaceConfigPath } from '../agent-config-model'
import { initialAgents } from '../domain'

const agent = initialAgents.find((item) => item.id === 'zhouce')!

describe('Agent 配置模型', () => {
  it('把普通配置映射到唯一规范路径', () => {
    expect(getAgentConfigPath({ kind: 'instructions', value: 'x' })).toBe('instructions.md')
    expect(getAgentConfigPath({ kind: 'rules', value: [] })).toBe('config/rules.yaml')
    expect(getAgentConfigPath({ kind: 'context', value: { policy: agent.contextPolicy } })).toBe('config/context.yaml')
    expect(workspaceConfigPath('card')).toBe('workspaces/card/config.yaml')
    expect(workspaceConfigPath('../card')).toBeUndefined()
  })

  it('稳定序列化并应用 WorkspaceBinding', () => {
    const value = { workspaceId: 'lab', instructions: '研究验证', ruleIds: ['rule-common'], skillIds: [], mcpIds: [], memoryRevision: '' }
    const payload = { kind: 'workspace-binding' as const, value }
    const content = serializeAgentConfig(agent, payload)
    expect(content).toContain('workspaceId: "lab"')
    expect(content).toContain('rules:')
    expect(applyAgentConfig(agent, payload)?.workspaceBindings.at(-1)).toEqual(value)
  })

  it('为新 Binding 只登记 config.yaml', () => {
    const payload = { kind: 'workspace-binding' as const, value: { workspaceId: 'lab', instructions: '', ruleIds: [], skillIds: [], mcpIds: [], memoryRevision: '' } }
    const file = describeAgentConfigFile(payload)
    expect(file?.path).toBe('workspaces/lab/config.yaml')
    expect(file?.path).not.toContain('memory.md')
    expect(file?.evidence).toBe('memory-only')
  })

  it('往返应用并序列化上下文策略与输出格式', () => {
    const payload = {
      kind: 'context' as const,
      value: {
        policy: { ...agent.contextPolicy, triggerRatio: 0.85, targetRatio: 0.55 },
        outputProfileId: 'output-verifiable-delivery',
      },
    }
    const applied = applyAgentConfig(agent, payload)
    expect(applied?.contextPolicy.triggerRatio).toBe(0.85)
    expect(applied?.outputProfileId).toBe('output-verifiable-delivery')
    expect(serializeAgentConfig(agent, payload)).toContain('triggerRatio: 0.85')
    expect(serializeAgentConfig(agent, payload)).toContain('outputProfileId: "output-verifiable-delivery"')
  })

  it('在身份配置中稳定保存头像引用并拒绝任意路径', () => {
    const withAvatar = { ...agent, avatarPath: 'avatar.png' as const }
    const payload = snapshotAgentConfig(withAvatar, 'identity')!
    expect(payload.kind).toBe('identity')
    if (payload.kind !== 'identity') throw new Error('身份快照类型错误')
    expect(serializeAgentConfig(withAvatar, payload)).toContain('avatarPath: "avatar.png"')
    expect(applyAgentConfig(agent, payload)?.avatarPath).toBe('avatar.png')

    const withoutAvatar = snapshotAgentConfig(agent, 'identity')!
    expect(serializeAgentConfig(agent, withoutAvatar)).not.toContain('avatarPath')
    expect(isAgentConfigPayload({ ...payload, value: { ...payload.value, avatarPath: '../avatar.png' } })).toBe(false)
    expect(isAgentConfigPayload({ ...payload, value: { ...payload.value, avatarPath: 'https://example.com/avatar.png' } })).toBe(false)
  })

  it('拒绝非法上下文策略', () => {
    expect(validateContextPolicy({ ...agent.contextPolicy, triggerRatio: 0.49 })).not.toHaveLength(0)
    expect(validateContextPolicy({ ...agent.contextPolicy, targetRatio: 0.75, triggerRatio: 0.8 })).not.toHaveLength(0)
    expect(validateContextPolicy({ ...agent.contextPolicy, protectRecentTurns: 1.5 })).not.toHaveLength(0)
    expect(applyAgentConfig(agent, {
      kind: 'context',
      value: { policy: { ...agent.contextPolicy, targetRatio: 0.75, triggerRatio: 0.8 } },
    })).toBeUndefined()
  })

  it('Workspace 只序列化显式 Context 与输出格式覆盖', () => {
    const payload = {
      kind: 'workspace-binding' as const,
      value: {
        workspaceId: 'lab', instructions: '', ruleIds: [], skillIds: [], mcpIds: [], memoryRevision: '',
        contextPolicy: { triggerRatio: 0.9 },
        outputProfileId: 'output-verifiable-delivery',
      },
    }
    const content = serializeAgentConfig(agent, payload)!
    expect(content).toContain('triggerRatio: 0.9')
    expect(content).not.toContain('targetRatio:')
    expect(content).not.toContain('aiClientProfileId')
  })
})
