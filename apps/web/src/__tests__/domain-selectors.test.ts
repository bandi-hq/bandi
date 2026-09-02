import { describe, expect, it } from 'vitest'
import { getAgentsBoundToWorkspace, getAgentConfigStatus, getDanglingWorkspaceBindings, getLatestRevisionForAgent, getWorkspaceConfigStatus } from '../domain-selectors'
import { initialState, reducer } from '../state'

describe('配置事实 selectors', () => {
  it('Workspace Agents 只从 Binding 派生', () => {
    const state = { ...initialState, workspaces: initialState.workspaces.map((workspace) => workspace.id === 'bandi' ? { ...workspace, agentIds: [] } : workspace) }
    expect(getAgentsBoundToWorkspace(state, 'bandi').map((agent) => agent.id)).toEqual(['zhiheng', 'zhouce', 'linxu'])
  })

  it('移除 Workspace 索引后保留并报告 dangling Binding', () => {
    const state = reducer(initialState, { type: 'REMOVE_WORKSPACE_INDEX', workspaceId: 'card' })
    const dangling = getDanglingWorkspaceBindings(state)
    expect(dangling.some(({ agent, binding }) => agent.id === 'zhouce' && binding.workspaceId === 'card')).toBe(true)
    expect(getAgentConfigStatus(state, state.agents.find((agent) => agent.id === 'zhouce')!).issues.some((issue) => issue.code === 'missing-workspace')).toBe(true)
  })

  it('新建且没有文件证据的 Workspace 为未验证', () => {
    const workspace = { ...initialState.workspaces[0], id: 'new', files: [] }
    expect(getWorkspaceConfigStatus(initialState, workspace)).toMatchObject({ level: 'unknown', label: '未验证' })
  })

  it('最近保存只来自 ConfigRevision', () => {
    expect(getLatestRevisionForAgent(initialState, 'zhouce')?.id).toBe('cfg-zhouce-instructions-r8')
  })

  it('报告 package 兼容状态、Role 作用域和 Workspace 编排扩权', () => {
    const source = initialState.agents.find((agent) => agent.id === 'zhouce')!
    const agent = {
      ...source,
      packageSchema: { schemaVersion: 2, compatibility: 'future' as const },
      roleId: 'missing-role',
      workspaceBindings: source.workspaceBindings.map((binding) => binding.workspaceId === 'bandi' ? { ...binding, orchestrationPolicy: { maxDelegationDepth: source.orchestrationPolicy.maxDelegationDepth + 1 } } : binding),
    }
    const state = { ...initialState, agents: initialState.agents.map((item) => item.id === agent.id ? agent : item) }
    const codes = getAgentConfigStatus(state, agent).issues.map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['package-future', 'role-missing', 'orchestration-expanded']))
  })

  it('空 Workspace Rule 是合法配置，缺少文件事实才报告缺口', () => {
    const source = initialState.agents.find((agent) => agent.id === 'zhouce')!
    const agent = {
      ...source,
      files: source.files.filter((file) => file.path !== 'workspaces/bandi/config.yaml'),
      workspaceBindings: source.workspaceBindings.map((binding) => binding.workspaceId === 'bandi' ? { ...binding, ruleIds: [] } : binding),
    }
    const state = { ...initialState, agents: initialState.agents.map((item) => item.id === agent.id ? agent : item) }
    const issues = getAgentConfigStatus(state, agent).issues

    expect(issues.some((issue) => issue.label.includes('缺少 Rules'))).toBe(false)
    expect(issues.some((issue) => issue.code === 'missing-binding-file' && issue.label.includes('bandi'))).toBe(true)
  })

  it('外部只读引用不根据空文件列表推断 Binding 文件缺失', () => {
    const source = initialState.agents.find((agent) => agent.id === 'zhouce')!
    const agent = {
      ...source,
      files: [],
      packageSource: { kind: 'external-reference' as const, externalPath: '/tmp/external', strategy: 'reference-only' as const },
      packageSchema: { compatibility: 'unverified' as const },
    }
    const state = { ...initialState, agents: initialState.agents.map((item) => item.id === agent.id ? agent : item) }
    const codes = getAgentConfigStatus(state, agent).issues.map((issue) => issue.code)

    expect(codes).toContain('package-unverified')
    expect(codes).not.toContain('missing-binding-file')
  })

  it('报告类型错误、Plugin 不可用和参数非法的组件引用', () => {
    const source = initialState.agents.find((agent) => agent.id === 'zhouce')!
    const agent = {
      ...source,
      hookRefs: [{ assetId: 'command-config-audit', parameterBindings: [] }],
      commandRefs: [{ assetId: 'command-config-audit', parameterBindings: [{ parameterId: 'scope', type: 'enum' as const, value: 'invalid' }] }],
    }
    const state = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === agent.id ? agent : item),
      pluginInstallations: initialState.pluginInstallations.map((item) => ({ ...item, status: 'available' as const, installedVersion: undefined })),
    }
    const codes = getAgentConfigStatus(state, agent).issues.map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['asset-kind-mismatch', 'plugin-unavailable', 'parameter-invalid']))
  })
})
