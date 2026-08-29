import { describe, expect, it } from 'vitest'
import { initialState, reducer } from '../state'
import type { AiClient } from '../mock'
import { buildBackupPreview, createDemoSnapshot } from '../backup-policy'

const customClient: AiClient = {
  id: 'custom-demo',
  kind: 'custom',
  name: 'Demo CLI',
  shortName: 'DE',
  description: '自定义演示客户端',
  enabled: true,
  detection: 'not-checked',
  persistence: 'memory-only',
}

describe('演示状态', () => {
  it('包含九个唯一内置客户端，且默认仅启用 Claude Code', () => {
    expect(initialState.aiClients.map((client) => client.id)).toEqual([
      'claude-code',
      'claude-desktop',
      'codex',
      'gemini-cli',
      'grok-build',
      'opencode',
      'openclaw',
      'hermes',
      'pi',
    ])
    expect(new Set(initialState.aiClients.map((client) => client.kind)).size).toBe(9)
    expect(initialState.aiClients.every((client) => client.detection === 'not-checked')).toBe(true)
    expect(initialState.aiClients.filter((client) => client.enabled).map((client) => client.id)).toEqual(['claude-code'])
    expect(initialState.activeAiClientId).toBe('claude-code')
  })

  it('切换主题', () => expect(reducer(initialState, { type: 'THEME' }).theme).toBe('dark'))

  it('保存指令只生成明确模拟回执', () =>
    expect(reducer(initialState, { type: 'SAVE_INSTRUCTIONS', text: 'x' }).notice?.description).toContain('仅当前页面内存'))

  it('添加 Workspace 只更新集中状态并选中它', () => {
    const result = reducer(initialState, {
      type: 'ADD_WORKSPACE',
      workspace: {
        id: 'x', name: 'x', path: '/x', config: '配置完整', health: '配置完整',
        collaboratorDepartmentIds: [], agentIds: [], assetIds: [], publicMemorySpaceId: 'mem-x',
        departmentMemorySpaceIds: [], files: [], recentEdits: [],
      },
    })
    expect(result.workspaces).toHaveLength(initialState.workspaces.length + 1)
    expect(result.currentWorkspaceId).toBe('x')
  })

  it('只能选择已启用客户端', () => {
    expect(reducer(initialState, { type: 'SELECT_AI_CLIENT', clientId: 'codex' })).toBe(initialState)
    const enabled = reducer(initialState, { type: 'ENABLE_AI_CLIENT', clientId: 'codex' })
    expect(enabled.activeAiClientId).toBe('codex')
    expect(enabled.notice?.description).toContain('当前页面内存')
    expect(enabled.notice?.description).toContain('未写入磁盘')
  })

  it.each(['claude-desktop', 'codex', 'gemini-cli', 'grok-build', 'opencode', 'openclaw', 'hermes', 'pi'])('可模拟启用内置客户端 %s', (clientId) => {
    const enabled = reducer(initialState, { type: 'ENABLE_AI_CLIENT', clientId })
    expect(enabled.activeAiClientId).toBe(clientId)
    expect(enabled.aiClients.find((client) => client.id === clientId)?.enabled).toBe(true)
    expect(enabled.notice?.description).toContain('未探测本机')
  })

  it('默认 Claude Code 不可停用', () => {
    expect(reducer(initialState, { type: 'DISABLE_AI_CLIENT', clientId: 'claude-code' })).toBe(initialState)
  })

  it('停用当前非默认客户端后回退 Claude Code', () => {
    const enabled = reducer(initialState, { type: 'ENABLE_AI_CLIENT', clientId: 'codex' })
    const disabled = reducer(enabled, { type: 'DISABLE_AI_CLIENT', clientId: 'codex' })
    expect(disabled.activeAiClientId).toBe('claude-code')
    expect(disabled.aiClients.find((client) => client.id === 'codex')?.enabled).toBe(false)
  })

  it('添加自定义客户端不会重复', () => {
    const added = reducer(initialState, { type: 'ADD_CUSTOM_AI_CLIENT', client: customClient })
    const duplicate = reducer(added, { type: 'ADD_CUSTOM_AI_CLIENT', client: customClient })
    expect(added.aiClients).toHaveLength(initialState.aiClients.length + 1)
    expect(duplicate).toBe(added)
  })

  it('只接受存在的 Workspace', () => {
    expect(reducer(initialState, { type: 'SELECT_WORKSPACE', workspaceId: 'missing' })).toBe(initialState)
    expect(reducer(initialState, { type: 'SELECT_WORKSPACE', workspaceId: 'card' }).currentWorkspaceId).toBe('card')
  })

  it('移除当前 Workspace 后选择剩余项且保留其他领域关系', () => {
    const result = reducer(initialState, { type: 'REMOVE_WORKSPACE_INDEX', workspaceId: 'bandi' })
    expect(result.currentWorkspaceId).toBe('card')
    expect(result.agents).toBe(initialState.agents)
    expect(result.memorySpaces).toBe(initialState.memorySpaces)
    expect(result.assets).toBe(initialState.assets)
  })

  it('移除最后一个 Workspace 后进入零 Workspace 状态', () => {
    const single = { ...initialState, workspaces: [initialState.workspaces[0]], currentWorkspaceId: 'bandi' }
    const result = reducer(single, { type: 'REMOVE_WORKSPACE_INDEX', workspaceId: 'bandi' })
    expect(result.workspaces).toHaveLength(0)
    expect(result.currentWorkspaceId).toBeNull()
  })

  it('Skill 生命周期只修改安装事实，不修改 Agent 引用', () => {
    const originalRefs = initialState.agents.map((agent) => agent.skillRefs)
    const installed = reducer(initialState, { type: 'APPLY_SKILL_ACTION', skillId: 'skill-docs', action: 'install' })
    expect(installed.assets.find((asset) => asset.id === 'skill-docs')?.skill?.installation.status).toBe('installed')
    expect(installed.agents.map((agent) => agent.skillRefs)).toEqual(originalRefs)
    expect(installed.notice?.description).toContain('未自动分配给 Agent')

    const rolledBack = reducer(initialState, { type: 'APPLY_SKILL_ACTION', skillId: 'skill-release', action: 'rollback', version: '2.0.0' })
    expect(rolledBack.assets.find((asset) => asset.id === 'skill-release')?.skill?.installation.installedVersion).toBe('2.0.0')
  })

  it('备份设置只更新演示策略且 Private 固定', () => {
    const result = reducer(initialState, { type: 'UPDATE_BACKUP_SETTINGS', changes: { gitConnection: { status: 'connected-demo', visibility: 'private', repository: 'github.com/demo/private' }, formalMemoryRemote: 'confirmed' } })
    expect(result.backupSettings.gitConnection.visibility).toBe('private')
    expect(result.backupSettings.formalMemoryRemote).toBe('confirmed')
    expect(result.notice?.description).toContain('未连接 Git')
  })

  it('模拟恢复只新增恢复前快照，不修改业务集合', () => {
    const preview = buildBackupPreview(initialState, { kind: 'agent', agentId: 'zhouce' })!
    const beforeSnapshot = createDemoSnapshot(preview, { id: 'before-test', createdAt: '刚刚', kind: '恢复前演示' })
    const result = reducer(initialState, { type: 'SIMULATE_RESTORE', snapshotId: 'snap-demo-001', beforeSnapshot })
    expect(result.backupSnapshots[0]).toEqual(beforeSnapshot)
    expect(result.agents).toBe(initialState.agents)
    expect(result.assets).toBe(initialState.assets)
    expect(result.companies).toBe(initialState.companies)
    expect(result.workspaces).toBe(initialState.workspaces)
  })

  it('拒绝创建提议者无法写入的 MemoryCandidate', () => {
    const result = reducer(initialState, {
      type: 'CREATE_MEMORY_CANDIDATE',
      candidate: {
        id: 'MC-invalid', spaceId: 'mem-agent-zhouce', proposerAgentId: 'linxu', reviewerAgentId: 'zhouce',
        summary: '错误目标', current: '', proposed: 'x', status: '待审核',
      },
    })
    expect(result.memoryCandidates).toBe(initialState.memoryCandidates)
    expect(result.notice?.tone).toBe('error')
  })
})
