// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorSessionProvider } from '../editor-session'
import { AgentDetailPage } from '../pages/agents/agent-detail-page'
import { GlobalSheets } from '../sheets'
import { AppProvider, initialState, useApp, type State } from '../state'
import * as desktopBridge from '../desktop-bridge'
import type { DiscoveryResult, LoadEditorResult } from '../contracts'

const NativeRequest = globalThis.Request

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
})

function NoticeProbe() {
  const { state } = useApp()
  if (!state.notice) return null
  return <output role={state.notice.tone === 'error' ? 'alert' : 'status'}>{state.notice.title} {state.notice.description}</output>
}

function renderAgent(initialEntry = '/agents/zhouce', state?: State) {
  const router = createMemoryRouter([{
    path: '/agents/:id',
    element: <AppProvider initialState={state}><EditorSessionProvider><AgentDetailPage /><GlobalSheets /><NoticeProbe /></EditorSessionProvider></AppProvider>,
  }], { initialEntries: [initialEntry] })
  return { router, ...render(<RouterProvider router={router} />) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Agent 双模式配置工作台', () => {
  it('默认以身份和配置健康度呈现管理概览', () => {
    renderAgent()

    expect(screen.getByRole('heading', { name: '周策', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/研发/)).toBeInTheDocument()
    expect(screen.getByText('把已确认产品目标交付为可验证的软件成果。')).toBeInTheDocument()
    expect(screen.getAllByText(/\.bandi\/agents\/agt_zhouce/)).toHaveLength(2)
    expect(screen.getByRole('tab', { name: '管理视图' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'AgentPackage' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('region', { name: 'Agent 摘要' })).not.toBeInTheDocument()
    expect(screen.queryByText('岗位使命')).not.toBeInTheDocument()
    expect(screen.getByText('配置状态')).toBeInTheDocument()
    expect(screen.getByText('最近保存')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Agent 配置领域' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '概览' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '主指令' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '主指令 Instructions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '当前配置关联文件' })).not.toBeInTheDocument()
  })

  it.each([
    ['外部引用', { kind: 'external-reference' as const, externalPath: '/tmp/external', strategy: 'reference-only' as const }, { compatibility: 'unverified' as const }],
    ['旧版受管包', { kind: 'bandi-managed' as const, packageId: 'agt_zhouce', strategy: 'managed' as const }, { schemaVersion: 0, compatibility: 'legacy' as const }],
    ['未来版受管包', { kind: 'bandi-managed' as const, packageId: 'agt_zhouce', strategy: 'managed' as const }, { schemaVersion: 2, compatibility: 'future' as const }],
  ])('Desktop %s 的配置领域保持只读', (_label, packageSource, packageSchema) => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      runtime: 'desktop',
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource, packageSchema } : item),
    }

    renderAgent('/agents/zhouce?tab=identity', state)

    expect(screen.getByRole('heading', { name: '当前 AgentPackage 不可编辑' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览永久删除影响' })).not.toBeInTheDocument()
  })

  it('身份编辑只从身份与职责领域内进入', async () => {
    const { router } = renderAgent()

    expect(screen.queryByRole('link', { name: '编辑身份与职责' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '身份与职责' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))

    expect(screen.getByDisplayValue('周策')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tab=identity')
  })

  it('Desktop 受管身份从磁盘加载基线并保存 revision', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? {
        ...item,
        packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' },
      } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'d'.repeat(64)}` as const
    const baselineRef = { id: 'identity-baseline', assetId: 'identity-asset', containerId: 'identity-container', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'loadManagedAgentIdentity').mockResolvedValue({ assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, canonicalContent: 'schemaVersion: 1\nid: zhouce\n', baselineRef })
    const save = vi.spyOn(desktopBridge, 'commitManagedAgentIdentity').mockImplementation(async (_requestId, agent) => ({
      operation: { id: 'identity-operation', agentId: agent.id, operationKind: 'identity_update', status: 'completed', createdAt: '2026-09-02T00:00:00Z' },
      agent,
    }))

    renderAgent('/agents/zhouce?tab=identity', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(await screen.findByDisplayValue('周策')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('周策'), { target: { value: '周策更新' } })
    fireEvent.click(await screen.findByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(
      expect.stringMatching(/^save-identity-zhouce-/),
      expect.objectContaining({ id: 'zhouce', name: '周策更新' }),
      expect.stringContaining('name: "周策更新"'),
      baselineRef,
      'schemaVersion: 1\nid: zhouce\n',
      source.serviceGrants,
      { kind: 'keep' },
    ))
    await waitFor(() => expect(screen.queryByDisplayValue('周策更新')).not.toBeInTheDocument())
  })

  it('Desktop 受管身份同步部门成员与服务授权', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const targetDepartment = initialState.departments.find((item) => item.id !== source.primaryDepartmentId && item.companyId === source.companyId)!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'1'.repeat(64)}` as const
    const baselineRef = { id: 'identity-org-base', assetId: 'identity-asset', containerId: 'identity-container', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'loadManagedAgentIdentity').mockResolvedValue({ assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, canonicalContent: 'schemaVersion: 1\nid: zhouce\n', baselineRef })
    const commit = vi.spyOn(desktopBridge, 'commitManagedAgentIdentity').mockImplementation(async (_requestId, agent) => ({
      operation: { id: 'identity-org-operation', agentId: agent.id, operationKind: 'identity_update', status: 'completed', createdAt: '2026-09-02T00:00:00Z' },
      agent,
    }))

    renderAgent('/agents/zhouce?tab=identity', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await screen.findByDisplayValue('周策')
    fireEvent.change(screen.getByLabelText('所属部门'), { target: { value: targetDepartment.id } })
    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    const capabilityInputs = screen.getAllByLabelText('允许能力')
    fireEvent.change(capabilityInputs.at(-1)!, { target: { value: '配置审查、发布复核' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1))
    expect(commit).toHaveBeenCalledWith(
      expect.stringMatching(/^save-identity-zhouce-/),
      expect.objectContaining({ id: source.id, primaryDepartmentId: targetDepartment.id }),
      expect.any(String),
      baselineRef,
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ capabilities: ['配置审查', '发布复核'] })]),
      { kind: 'keep' },
    )
    await waitFor(() => expect(screen.getByText(/发布复核/)).toBeInTheDocument())
  })

  it('Desktop 身份半成功立即进入全局待处理并复用同一请求 ID', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? {
        ...item,
        packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' },
      } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'2'.repeat(64)}` as const
    const baselineRef = { id: 'identity-retry-base', assetId: 'identity-asset', containerId: 'identity-container', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'loadManagedAgentIdentity').mockResolvedValue({ assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, canonicalContent: 'schemaVersion: 1\nid: zhouce\n', baselineRef })
    const commit = vi.spyOn(desktopBridge, 'commitManagedAgentIdentity').mockImplementation(async (_requestId, agent) => ({
      operation: { id: 'identity-retry-operation', agentId: agent.id, operationKind: 'identity_update', status: 'organization_pending', createdAt: '2026-09-02T00:00:00Z' },
    }))

    renderAgent('/agents/zhouce?tab=identity', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const name = await screen.findByDisplayValue('周策')
    fireEvent.change(name, { target: { value: '周策更新' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('首页待处理项继续修复')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    expect(commit.mock.calls[0][0]).toBe(commit.mock.calls[1][0])
  })

  it('Desktop 受管身份外部变化保留草稿并展示三方 manifest', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'e'.repeat(64)}` as const
    const baselineRef = { id: 'identity-base', assetId: 'identity-asset', containerId: 'identity-container', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'loadManagedAgentIdentity').mockResolvedValue({ assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, canonicalContent: 'name: "周策"\n', baselineRef })
    vi.spyOn(desktopBridge, 'commitManagedAgentIdentity').mockResolvedValue({
      operation: { id: 'identity-conflict-operation', agentId: source.id, operationKind: 'identity_update', status: 'prepared', createdAt: '2026-09-02T00:00:00Z' },
      identityResult: { kind: 'baseline_changed', requestId: 'save-identity-zhouce', assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, base: { content: 'name: "周策"\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, current: { content: 'name: "磁盘更新"\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, proposed: { content: 'name: "周策更新"\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, diagnostics: [{ code: 'baseline_changed', severity: 'warning', message: '已发生外部变化' }] },
    })

    renderAgent('/agents/zhouce?tab=identity', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const name = await screen.findByDisplayValue('周策')
    fireEvent.change(name, { target: { value: '周策更新' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('编辑期间发生变化')
    expect(screen.getByDisplayValue('周策更新')).toBeInTheDocument()
    expect(screen.getByText('name: "磁盘更新"')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '基于当前内容重新编辑' })).toBeEnabled()
  })

  it('Desktop 受管身份读取历史并恢复为新版本', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const managed = { ...source, packageSource: { kind: 'bandi-managed' as const, packageId: 'agt_zhouce', strategy: 'managed' as const } }
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? managed : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'f'.repeat(64)}` as const
    const baselineRef = { id: 'identity-base', assetId: 'identity-asset', containerId: 'identity-container', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'loadManagedAgentIdentity').mockResolvedValue({ assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, canonicalContent: 'name: "当前"\n', baselineRef })
    vi.spyOn(desktopBridge, 'listConfigRevisions').mockResolvedValue([{ id: 'identity-old', assetId: 'identity-asset', containerId: 'identity-container', locator: { rootKind: 'managed', displayPath: '/tmp/agent.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-old', savedAt: '2026-08-31T00:00:00Z', summary: '保存身份与职责', confirmationRefs: [] }])
    vi.spyOn(desktopBridge, 'readConfigRevisionContent').mockResolvedValue('name: "历史"\n')
    const restore = vi.spyOn(desktopBridge, 'restoreManagedAgentIdentity').mockResolvedValue({ kind: 'unchanged', requestId: 'restore-identity-zhouce', agent: managed, baselineRef })

    renderAgent('/agents/zhouce?tab=identity', state)
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }))
    expect(await screen.findByRole('dialog', { name: '身份与职责版本历史' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '恢复为新版本' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'identity-asset', revisionId: 'identity-old', confirmed: true })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '身份与职责版本历史' })).not.toBeInTheDocument())
  })

  it('Desktop Agent 长期 Memory 创建真实候选并进入审核', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'a'.repeat(64)}` as const
    const baseline = { id: 'memory-base', assetId: 'memory-agent-zhouce', containerId: 'memory-agent-zhouce', assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverEligibleMemorySpaces').mockResolvedValue({ requestId: 'discover-memory-zhouce', spaces: [{ id: 'memory-agent-zhouce', scopeType: 'agent_long_term', scopeKey: { kind: 'agent_long_term', agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer', visibilityPolicy: 'agent_private', storageProfileVersion: 'memory-v1', state: 'active', storageLocator: { rootKind: 'managed', displayPath: 'memory/long-term.md', relativePath: 'memory/long-term.md' }, contentHash: hash, updatedAt: '2026-09-01T00:00:00Z' }], diagnostics: [] })
    vi.spyOn(desktopBridge, 'listMemoryReviews').mockResolvedValue([])
    const create = vi.spyOn(desktopBridge, 'createMemoryCandidate').mockImplementation(async (request) => ({
      requestId: request.requestId,
      space: { id: 'memory-agent-zhouce', scopeType: 'agent_long_term', scopeKey: { kind: 'agent_long_term' as const, agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer', visibilityPolicy: 'agent_private', storageProfileVersion: 'memory-v1', state: 'active', storageLocator: { rootKind: 'managed', displayPath: 'memory/long-term.md', relativePath: 'memory/long-term.md' }, contentHash: hash, updatedAt: '2026-09-01T00:00:00Z' },
      candidate: { id: request.candidateId, spaceId: 'memory-agent-zhouce', proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, source: request.source, summary: request.summary, proposedContent: request.proposedContent, proposedContentHash: hash, submittedBaseline: baseline, status: 'pending_review', version: 1, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
      currentContent: '当前正式内容',
    }))
    vi.spyOn(desktopBridge, 'loadMemoryReview').mockImplementation(async (requestId, candidateId) => {
      const created = create.mock.results[0]?.value
      const bundle = await created
      return { ...bundle, requestId, candidate: { ...bundle.candidate, id: candidateId } }
    })

    renderAgent('/agents/zhouce?tab=memory', state)
    fireEvent.change(await screen.findByLabelText('目标记忆范围'), { target: { value: 'memory-agent-zhouce' } })
    fireEvent.change(screen.getByLabelText('建议写回的完整内容'), { target: { value: '新的正式内容' } })
    fireEvent.click(screen.getByRole('button', { name: '提交修改建议' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'memory-agent-zhouce', proposerAgentId: 'zhouce', proposedContent: '新的正式内容' })))
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('reviewerAgentId')
    const candidateButton = await screen.findByRole('button', { name: /正式记忆修改/ })
    fireEvent.click(candidateButton)
    expect(await screen.findByRole('dialog', { name: /审核正式记忆修改建议/ })).toBeInTheDocument()
    expect(screen.getByText('新的正式内容')).toBeInTheDocument()
  })

  it('Desktop 启动时静默恢复正式 Memory 候选', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      notice: { id: 'existing-notice', tone: 'info', title: '原有通知' },
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item),
      memoryCandidates: initialState.memoryCandidates.filter((item) => item.spaceId !== 'memory-agent-zhouce'),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'c'.repeat(64)}` as const
    vi.spyOn(desktopBridge, 'discoverEligibleMemorySpaces').mockResolvedValue({ requestId: 'discover-memory-zhouce', spaces: [{ id: 'memory-agent-zhouce', scopeType: 'agent_long_term', scopeKey: { kind: 'agent_long_term', agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer', visibilityPolicy: 'agent_private', storageProfileVersion: 'memory-v1', state: 'active', storageLocator: { rootKind: 'managed', displayPath: 'memory/long-term.md', relativePath: 'memory/long-term.md' }, contentHash: hash, updatedAt: '2026-09-01T00:00:00Z' }], diagnostics: [] })
    vi.spyOn(desktopBridge, 'listMemoryReviews').mockResolvedValue([{
      requestId: 'list-memory-zhouce',
      space: { id: 'memory-agent-zhouce', scopeType: 'agent_long_term', scopeKey: { kind: 'agent_long_term' as const, agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer', visibilityPolicy: 'agent_private', storageProfileVersion: 'memory-v1', state: 'active', storageLocator: { rootKind: 'managed', displayPath: 'memory/long-term.md', relativePath: 'memory/long-term.md' }, currentRevisionId: 'memory-revision-1', contentHash: hash, updatedAt: '2026-09-01T00:00:00Z' },
      candidate: { id: 'candidate-hydrated', spaceId: 'memory-agent-zhouce', proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, source: { kind: 'manual', label: 'test' }, summary: '重启恢复候选', proposedContent: '正式内容', proposedContentHash: hash, submittedBaseline: { id: 'base', assetId: 'memory-agent-zhouce', containerId: 'memory-agent-zhouce', assetContentHash: hash, containerContentHash: hash }, status: 'written', version: 3, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:01:00Z' },
      currentContent: '正式内容',
    }])

    renderAgent('/agents/zhouce?tab=memory', state)

    expect(await screen.findByText('candidate-hydrated')).toBeInTheDocument()
    expect(screen.getByText('已写入正式 Revision')).toBeInTheDocument()
    expect(screen.queryByText('正式记忆候选已创建')).not.toBeInTheDocument()
  })

  it('Desktop 四类正式空间显示各自历史入口并阻止只读空间提交', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'d'.repeat(64)}` as const
    const timestamp = '2026-09-01T00:00:00Z'
    const scopes = [
      { id: 'mem-agent-zhouce', scopeType: 'agent_long_term' as const, scopeKey: { kind: 'agent_long_term' as const, agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, visibilityPolicy: 'agent_private' as const, rootKind: 'managed' as const, relativePath: 'memory/long-term.md', state: 'active' as const },
      { id: 'mem-agent-ws-zhouce-bandi', scopeType: 'agent_workspace' as const, scopeKey: { kind: 'agent_workspace' as const, agentId: 'zhouce', workspaceId: 'bandi' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, visibilityPolicy: 'agent_private' as const, rootKind: 'managed' as const, relativePath: 'workspaces/bandi/memory.md', state: 'active' as const },
      { id: 'mem-ws-bandi', scopeType: 'workspace_shared' as const, scopeKey: { kind: 'workspace_shared' as const, workspaceId: 'bandi' }, owner: { kind: 'workspace' as const, workspaceId: 'bandi' }, visibilityPolicy: 'workspace_shared' as const, rootKind: 'workspace' as const, relativePath: '.bandi/memory/public.md', state: 'active' as const },
      { id: 'mem-dev-bandi', scopeType: 'department_workspace' as const, scopeKey: { kind: 'department_workspace' as const, departmentId: 'dev', workspaceId: 'bandi' }, owner: { kind: 'department_workspace' as const, departmentId: 'dev', workspaceId: 'bandi' }, visibilityPolicy: 'department_workspace' as const, rootKind: 'workspace' as const, relativePath: '.bandi/memory/departments/dev.md', state: 'read_only_history' as const },
    ]
    vi.spyOn(desktopBridge, 'discoverEligibleMemorySpaces').mockResolvedValue({ requestId: 'discover-memory-zhouce', spaces: scopes.map((scope) => ({ ...scope, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer' as const, storageProfileVersion: 'memory-v1' as const, storageLocator: { rootKind: scope.rootKind, displayPath: scope.relativePath, relativePath: scope.relativePath }, contentHash: hash, updatedAt: timestamp })), diagnostics: [] })
    vi.spyOn(desktopBridge, 'listMemoryReviews').mockResolvedValue(scopes.map((scope, index) => ({
      requestId: 'list-memory-zhouce',
      space: { ...scope, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer' as const, storageProfileVersion: 'memory-v1' as const, storageLocator: { rootKind: scope.rootKind, displayPath: scope.relativePath, relativePath: scope.relativePath }, currentRevisionId: `revision-${index}`, contentHash: hash, updatedAt: timestamp },
      candidate: { id: `candidate-${index}`, spaceId: scope.id, proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, source: { kind: 'manual' as const, label: 'test' }, summary: `候选 ${index}`, proposedContent: '内容', proposedContentHash: hash, submittedBaseline: { id: `base-${index}`, assetId: scope.id, containerId: scope.id, assetContentHash: hash, containerContentHash: hash }, status: 'written' as const, version: 1, createdAt: timestamp, updatedAt: timestamp },
      currentContent: '内容',
    })))

    renderAgent('/agents/zhouce?tab=memory', state)

    expect((await screen.findAllByRole('button', { name: '正式版本历史' }))).toHaveLength(4)
    expect(screen.getByText('只读历史')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('目标记忆范围'), { target: { value: 'mem-dev-bandi' } })
    expect(screen.getByLabelText('建议写回的完整内容')).toBeDisabled()
    expect(screen.getByRole('button', { name: '提交修改建议' })).toBeDisabled()
    expect(screen.getByText(/关系已失效/)).toBeInTheDocument()
  })

  it('Desktop 正式 Memory revision pending 可补记且不重复批准', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item),
      memoryCandidates: [{ id: 'memory-candidate-recovery', spaceId: 'memory-agent-zhouce', proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, summary: '正式记忆修改', current: '旧内容', proposed: '新内容', status: '待审核' }],
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'b'.repeat(64)}` as const
    const baseline = { id: 'memory-base', assetId: 'memory-agent-zhouce', containerId: 'memory-agent-zhouce', assetContentHash: hash, containerContentHash: hash }
    const candidate = { id: 'memory-candidate-recovery', spaceId: 'memory-agent-zhouce', proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, source: { kind: 'manual' as const, label: 'test' }, summary: '正式记忆修改', proposedContent: '新内容', proposedContentHash: hash, submittedBaseline: baseline, status: 'pending_review' as const, version: 1, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    const bundle = { requestId: 'load', space: { id: 'memory-agent-zhouce', scopeType: 'agent_long_term' as const, scopeKey: { kind: 'agent_long_term' as const, agentId: 'zhouce' }, owner: { kind: 'agent' as const, agentId: 'zhouce' }, stewardAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, reviewPolicy: 'independent_reviewer' as const, visibilityPolicy: 'agent_private' as const, storageProfileVersion: 'memory-v1' as const, state: 'active' as const, storageLocator: { rootKind: 'managed' as const, displayPath: 'memory/long-term.md', relativePath: 'memory/long-term.md' }, contentHash: hash, updatedAt: '2026-09-01T00:00:00Z' }, candidate, currentContent: '旧内容' }
    vi.spyOn(desktopBridge, 'discoverEligibleMemorySpaces').mockResolvedValue({ requestId: 'discover-memory-zhouce', spaces: [bundle.space], diagnostics: [] })
    vi.spyOn(desktopBridge, 'listMemoryReviews').mockResolvedValue([])
    vi.spyOn(desktopBridge, 'loadMemoryReview').mockResolvedValue(bundle)
    const decision = { id: 'decision-1', candidateId: candidate.id, actorPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, decision: 'approve' as const, decidedAt: '2026-09-01T00:01:00Z' }
    const receipt = { id: 'receipt-1', containerId: candidate.spaceId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-09-01T00:01:00Z', atomicReplace: true }
    const review = vi.spyOn(desktopBridge, 'reviewMemoryCandidate').mockResolvedValue({ kind: 'revision_pending', requestId: 'review', candidate: { ...candidate, status: 'revision_pending', version: 2 }, decision, writeReceipt: receipt, recoveryRef: 'revision-1', diagnostics: [{ code: 'memory_revision_pending', severity: 'warning', message: '版本待补记' }] })
    const recover = vi.spyOn(desktopBridge, 'recoverMemoryRevision').mockResolvedValue({ kind: 'saved', requestId: 'recover', candidate: { ...candidate, status: 'written', version: 3 }, decision, revision: { id: 'revision-1', spaceId: candidate.spaceId, candidateId: candidate.id, reviewDecisionId: decision.id, proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent' as const, agentId: 'zhiheng' }, sourceContentHash: hash, contentHash: hash, storageLocator: bundle.space.storageLocator, writeReceiptId: receipt.id, writtenAt: receipt.verifiedAt }, writeReceipt: receipt })

    renderAgent('/agents/zhouce?tab=memory', state)
    fireEvent.click(await screen.findByRole('button', { name: /正式记忆修改/ }))
    await screen.findByText('新内容')
    fireEvent.click(screen.getByRole('button', { name: '批准并写入正式记忆' }))
    expect(await screen.findByText(/记忆版本尚待补记/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '补记记忆版本' }))

    await waitFor(() => expect(recover).toHaveBeenCalledWith({ requestId: 'recover-memory-memory-candidate-recovery', candidateId: candidate.id, recoveryRef: 'revision-1' }))
    expect(review).toHaveBeenCalledTimes(1)
    expect((await screen.findAllByText('revision-1')).length).toBeGreaterThan(0)
  })

  it('Web 正式 Memory 审核保持页面内存演示且不调用 Desktop bridge', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const review = vi.spyOn(desktopBridge, 'reviewMemoryCandidate')
    const load = vi.spyOn(desktopBridge, 'loadMemoryReview')
    renderAgent('/agents/zhouce?tab=memory')
    fireEvent.click(screen.getByRole('button', { name: /记录已确认的 API 方案/ }))
    expect(await screen.findByText(/浏览器演示/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '要求修改' }))
    expect(review).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it('双模式 Tab 支持循环键盘切换并同步 URL 与面板', async () => {
    renderAgent()
    const management = screen.getByRole('tab', { name: '管理视图' })
    const packageTab = screen.getByRole('tab', { name: 'AgentPackage' })

    expect(management).toHaveAttribute('aria-controls', 'agent-mode-panel-management')
    expect(screen.getByRole('tabpanel', { name: '管理视图' })).toBeInTheDocument()

    fireEvent.keyDown(management, { key: 'ArrowLeft' })
    await waitFor(() => expect(packageTab).toHaveFocus())
    await waitFor(() => expect(packageTab).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('tabpanel', { name: 'AgentPackage' })).toBeInTheDocument()

    fireEvent.keyDown(packageTab, { key: 'Home' })
    await waitFor(() => expect(management).toHaveFocus())
    expect(management).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(management, { key: 'End' })
    await waitFor(() => expect(packageTab).toHaveFocus())
    fireEvent.keyDown(packageTab, { key: 'ArrowRight' })
    await waitFor(() => expect(management).toHaveFocus())
  })

  it('关闭窄屏文件选择后恢复触发按钮焦点', async () => {
    renderAgent('/agents/zhouce?tab=package')

    const trigger = screen.getByRole('button', { name: '选择文件' })
    trigger.focus()
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog', { name: '选择 AgentPackage 文件' })).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('受管 AgentPackage 未返回文件时提供安全重新读取', () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      runtime: 'desktop',
      agents: initialState.agents.map((item) => item.id === source.id ? {
        ...item,
        files: [],
        packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' },
      } : item),
    }

    renderAgent('/agents/zhouce?tab=package', state)

    expect(screen.getByText('尚未读取到 AgentPackage 文件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新读取' })).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择文件' })).not.toBeInTheDocument()
    expect(screen.queryByText('选择一个文件查看结构化预览或只读源码。')).not.toBeInTheDocument()
  })

  it.each([
    ['外部引用', { kind: 'external-reference' as const, externalPath: '/tmp/external', strategy: 'reference-only' as const }, { compatibility: 'unverified' as const }, '外部目录未被读取'],
    ['Web 演示', { kind: 'bandi-demo' as const, strategy: 'create-demo' as const }, { schemaVersion: 1, compatibility: 'current' as const }, '当前演示没有已登记文件'],
  ])('%s 的空 AgentPackage 不提供系统读取操作', (_label, packageSource, packageSchema, title) => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? { ...item, files: [], packageSource, packageSchema } : item),
    }

    renderAgent('/agents/zhouce?tab=package', state)

    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
  })

  it('AgentPackage 深链展示文件树和默认文件', () => {
    renderAgent('/agents/zhouce?tab=package&path=agent.yaml&view=preview')

    expect(screen.getByRole('tab', { name: 'AgentPackage' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tree', { name: '周策 AgentPackage 目录' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'agent.yaml' })).toBeInTheDocument()
    expect(screen.queryByText('关联文件')).not.toBeInTheDocument()
  })

  it('保留源码深链并提供结构化预览切换', () => {
    renderAgent('/agents/zhouce?tab=package&path=config%2Frules.yaml&view=source')

    expect(screen.getByRole('tab', { name: 'AgentPackage' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/只读源码根据当前页面中的配置生成/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '预览' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('tab', { name: '源码' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('复制当前源码到系统剪贴板', async () => {
    renderAgent('/agents/zhouce?tab=package&path=config%2Frules.yaml&view=source')

    fireEvent.click(screen.getByRole('button', { name: '复制当前源码' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('rule-common')))
    expect(await screen.findByRole('status')).toHaveTextContent('源码已复制')
  })

  it('剪贴板拒绝时报告真实失败', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))
    renderAgent('/agents/zhouce?tab=package&path=agent.yaml&view=preview')

    fireEvent.click(screen.getByRole('button', { name: '复制当前预览' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
  })

  it('文件树使用 roving tabindex 并声明完整树语义', () => {
    renderAgent('/agents/zhouce?tab=package&path=agent.yaml&view=preview')
    const tree = screen.getByRole('tree', { name: '周策 AgentPackage 目录' })
    const items = within(tree).getAllByRole('treeitem')
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1)
    expect(within(tree).getByRole('treeitem', { name: /agent.yaml/ })).toHaveAttribute('aria-selected', 'true')
    expect(items.some((item) => item.hasAttribute('aria-expanded'))).toBe(true)
  })

  it('Instructions 编辑态注册草稿并保留未保存内容', () => {
    renderAgent('/agents/zhouce?tab=instructions')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const editor = screen.getByRole('textbox', { name: '主指令正文' })
    fireEvent.change(editor, { target: { value: '尚未保存的新正文' } })

    expect(editor).toHaveValue('尚未保存的新正文')
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
  })

  it('Desktop 受管 Instructions 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = {
      ...initialState,
      agents: initialState.agents.map((item) => item.id === source.id ? {
        ...item,
        packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' },
      } : item),
    }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const asset = { id: 'asset-1', containerId: 'container-1', kind: 'instructions', officialScope: 'managed', assetContentHash: `sha256:${'a'.repeat(64)}`, containerContentHash: `sha256:${'a'.repeat(64)}`, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const discovery: DiscoveryResult = { requestId: 'discover-zhouce', profileVersion: 'agent-package-v1', containers: [{ id: 'container-1', locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md', relativePath: 'agt_zhouce/instructions.md' }, format: 'markdown', contentHash: asset.containerContentHash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] }
    const loaded: LoadEditorResult = { requestId: 'load-zhouce', asset, canonicalContent: '# Disk\n', redacted: false, baselineRef: { id: 'base-1', assetId: asset.id, containerId: asset.containerId, assetContentHash: asset.assetContentHash, containerContentHash: asset.containerContentHash }, diagnostics: [] }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue(discovery)
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue(loaded)
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'unchanged', requestId: 'save-zhouce', asset })

    renderAgent('/agents/zhouce?tab=instructions', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(await screen.findByRole('textbox', { name: '主指令正文' })).toHaveValue('# Disk\n')
    fireEvent.change(screen.getByRole('textbox', { name: '主指令正文' }), { target: { value: '# Updated\n' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-1', baseContent: '# Disk\n', change: { kind: 'instructions', value: '# Updated\n' } })))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '主指令正文' })).not.toBeInTheDocument())
  })

  it('Desktop Instructions 读取真实历史并恢复为新版本', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'c'.repeat(64)}` as const
    const asset = { id: 'asset-1', containerId: 'container-1', kind: 'instructions', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const loaded: LoadEditorResult = { requestId: 'load-history', asset, canonicalContent: '# Current\n', redacted: false, baselineRef: { id: 'base-1', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }, diagnostics: [] }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-history', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md', relativePath: 'agt_zhouce/instructions.md' }, format: 'markdown', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue(loaded)
    vi.spyOn(desktopBridge, 'listConfigRevisions').mockResolvedValue([{ id: 'revision-old', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-old', savedAt: '2026-08-31T00:00:00Z', summary: '保存 Instructions', confirmationRefs: [] }])
    vi.spyOn(desktopBridge, 'readConfigRevisionContent').mockResolvedValue('# Historical\n')
    const restore = vi.spyOn(desktopBridge, 'restoreConfigRevision').mockResolvedValue({ kind: 'saved', requestId: 'restore-zhouce', asset, revision: { id: 'revision-restored', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-restored', savedAt: '2026-08-31T00:01:00Z', summary: '恢复自 revision-old', confirmationRefs: [], restoredFromRevisionId: 'revision-old' }, writeReceipt: { id: 'receipt-restored', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-08-31T00:01:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=instructions', state)
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }))
    expect(await screen.findByRole('dialog', { name: '主指令版本历史' })).toBeInTheDocument()
    expect(screen.getByText('# Historical')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '恢复为新版本' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, revisionId: 'revision-old', baseContent: '# Current\n', confirmed: true })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '主指令版本历史' })).not.toBeInTheDocument())
  })

  it('Desktop Instructions 外部变化保留草稿并展示三方内容', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'b'.repeat(64)}` as const
    const asset = { id: 'asset-1', containerId: 'container-1', kind: 'instructions', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-zhouce', profileVersion: 'agent-package-v1', containers: [{ id: 'container-1', locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md', relativePath: 'agt_zhouce/instructions.md' }, format: 'markdown', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-zhouce', asset, canonicalContent: '# Base\n', redacted: false, baselineRef: { id: 'base-1', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }, diagnostics: [] })
    vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'baseline_changed', requestId: 'save-zhouce', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/instructions.md' }, base: { content: '# Base\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, current: { content: '# Current\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, proposed: { content: '# Proposed\n', assetContentHash: hash, containerContentHash: hash, redacted: false }, diagnostics: [{ code: 'baseline_changed', severity: 'warning', message: '已发生外部变化' }] })

    renderAgent('/agents/zhouce?tab=instructions', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const editor = await screen.findByRole('textbox', { name: '主指令正文' })
    fireEvent.change(editor, { target: { value: '# Proposed\n' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('编辑期间发生变化')
    expect(screen.getByRole('textbox', { name: '主指令正文' })).toHaveValue('# Proposed\n')
    expect(screen.getByText('# Base')).toBeInTheDocument()
    expect(screen.getByText('# Current')).toBeInTheDocument()
    expect(screen.getAllByText('# Proposed')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '基于当前内容重新编辑' })).toBeEnabled()
  })

  it('纯 Web Context 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    renderAgent('/agents/zhouce?tab=context')
    expect(screen.getByText(/当前页面保存位置/)).toBeInTheDocument()
    expect(screen.getByText('200,000 Token')).toBeInTheDocument()
    expect(screen.getByText(/约 160,000 Token/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(await screen.findByLabelText('规划上下文窗口（Token）'), { target: { value: '256000' } })
    fireEvent.change(screen.getByDisplayValue(80), { target: { value: '95' } })
    expect(screen.getByText(/约在 243,200 Token/)).toBeInTheDocument()
    expect(screen.getByText(/当前未应用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
  })

  it('Desktop 受管 Context 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'4'.repeat(64)}` as const
    const asset = { id: 'context-asset', containerId: 'context-container', kind: 'context', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\ncontextPolicy:\n  enabled: true\n  triggerRatio: 0.8\n  targetRatio: 0.5\n  protectRecentTurns: 6\n  protectOpeningTurns: 2\noutputProfileId: ""\noutputParameterBindings: []'
    const baselineRef = { id: 'context-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-context', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/context.yaml', relativePath: 'agt_zhouce/config/context.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-context', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'unchanged', requestId: 'save-context-zhouce', asset })

    renderAgent('/agents/zhouce?tab=context', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(await screen.findByDisplayValue(80)).toHaveValue(80)
    fireEvent.change(screen.getByLabelText('规划上下文窗口（Token）'), { target: { value: '256000' } })
    fireEvent.change(screen.getByDisplayValue(80), { target: { value: '85' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'context', value: expect.stringMatching(/triggerRatio: 0\.85[\s\S]*contextWindowTokens: 256000/) }) })))
    await waitFor(() => expect(screen.queryByLabelText('触发比例（%）')).not.toBeInTheDocument())
  })

  it('纯 Web Rules 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    renderAgent('/agents/zhouce?tab=rules')
    expect(screen.getByText(/当前页面保存位置/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
  })

  it('Desktop 受管 Rules 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' }, ruleRefs: ['rule-common'] } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'6'.repeat(64)}` as const
    const asset = { id: 'rules-asset', containerId: 'rules-container', kind: 'rules', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\nrules:\n  - "rule-common"'
    const baselineRef = { id: 'rules-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-rules', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/rules.yaml', relativePath: 'agt_zhouce/config/rules.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-rules', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-rules-zhouce', asset, revision: { id: 'revision-rules', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/rules.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-rules', savedAt: '2026-08-31T12:00:00Z', summary: '保存 Rule 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-rules', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-08-31T12:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=rules', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const checkbox = await screen.findByRole('checkbox', { name: /移除/ })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'rules', value: expect.stringContaining('rules:') }) })))
  })

  it('纯 Web Skills 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    renderAgent('/agents/zhouce?tab=skills')
    expect(screen.getByText(/当前页面保存位置/)).toHaveTextContent('config/skills.yaml')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
  })

  it('Desktop 受管 Skills 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' }, skillRefs: ['skill-review'] } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'7'.repeat(64)}` as const
    const asset = { id: 'skills-asset', containerId: 'skills-container', kind: 'skills', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\nskills:\n  - "skill-review"'
    const baselineRef = { id: 'skills-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-skills', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/skills.yaml', relativePath: 'agt_zhouce/config/skills.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-skills', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-skills-zhouce', asset, revision: { id: 'revision-skills', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/skills.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-skills', savedAt: '2026-08-31T12:00:00Z', summary: '保存 Skill 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-skills', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-08-31T12:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=skills', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const checkbox = await screen.findByRole('checkbox', { name: /移除/ })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'skills', value: expect.stringContaining('skills:') }) })))
  })

  it('纯 Web MCP 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    renderAgent('/agents/zhouce?tab=mcp')
    expect(screen.getByText(/当前页面保存位置/)).toHaveTextContent('config/mcp.yaml')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
  })

  it('Desktop 受管 MCP 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' }, mcpRefs: ['mcp-bandi'] } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'8'.repeat(64)}` as const
    const asset = { id: 'mcp-asset', containerId: 'mcp-container', kind: 'mcp', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\nmcp:\n  - "mcp-bandi"'
    const baselineRef = { id: 'mcp-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-mcp', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/mcp.yaml', relativePath: 'agt_zhouce/config/mcp.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-mcp', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-mcp-zhouce', asset, revision: { id: 'revision-mcp', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/mcp.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-mcp', savedAt: '2026-08-31T12:00:00Z', summary: '保存 MCP 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-mcp', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-08-31T12:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=mcp', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const checkbox = await screen.findByRole('checkbox', { name: /移除/ })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'mcp', value: expect.stringContaining('mcp:') }) })))
  })

  it('纯 Web SOP 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const save = vi.spyOn(desktopBridge, 'saveConfig')
    renderAgent('/agents/zhouce?tab=sop')
    expect(screen.getByText(/当前页面保存位置/)).toHaveTextContent('config/sop.yaml')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('Desktop 受管 SOP 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' }, sopRefs: ['sop-delivery'] } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'d'.repeat(64)}` as const
    const asset = { id: 'sop-asset', containerId: 'sop-container', kind: 'sop', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\nsop:\n  - "sop-delivery"'
    const baselineRef = { id: 'sop-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-sop', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/sop.yaml', relativePath: 'agt_zhouce/config/sop.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-sop', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-sop-zhouce', asset, revision: { id: 'revision-sop', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/sop.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-sop', savedAt: '2026-09-01T00:00:00Z', summary: '保存 SOP 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-sop', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-09-01T00:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=sop', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /移除/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'sop', value: expect.stringContaining('sop:') }) })))
  })

  it('纯 Web Orchestration 与 Hook/Command 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const save = vi.spyOn(desktopBridge, 'saveConfig')
    renderAgent('/agents/zhouce?tab=collaboration')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存到当前页面' })).toBeEnabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('Desktop 受管 Orchestration 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'e'.repeat(64)}` as const
    const asset = { id: 'orchestration-asset', containerId: 'orchestration-container', kind: 'orchestration', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = `schemaVersion: 1\norchestration: ${JSON.stringify(source.orchestrationPolicy)}`
    const baselineRef = { id: 'orchestration-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-orchestration', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/orchestration.yaml', relativePath: 'agt_zhouce/config/orchestration.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-orchestration', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-orchestration-zhouce', asset, revision: { id: 'revision-orchestration', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/orchestration.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-orchestration', savedAt: '2026-09-01T00:00:00Z', summary: '保存静态编排策略', confirmationRefs: [] }, writeReceipt: { id: 'receipt-orchestration', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-09-01T00:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=collaboration', state)
    const collaboration = screen.getByRole('heading', { name: '长期协作与委派边界' }).closest('section')!
    fireEvent.click(within(collaboration).getByRole('button', { name: '编辑' }))
    const depth = await screen.findByLabelText('最大委派深度')
    fireEvent.change(depth, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'orchestration', value: expect.stringContaining('orchestration:') }) })))
  })

  it('Desktop 受管 Hook 通过发现、参数校验与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, hookRefs: [], packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'f'.repeat(64)}` as const
    const asset = { id: 'hooks-asset', containerId: 'hooks-container', kind: 'hooks', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\nhooks: []'
    const baselineRef = { id: 'hooks-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-hooks', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/hooks.yaml', relativePath: 'agt_zhouce/config/hooks.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-hooks', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-hooks-zhouce', asset, revision: { id: 'revision-hooks', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/hooks.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-hooks', savedAt: '2026-09-01T00:00:00Z', summary: '保存 Hook 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-hooks', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-09-01T00:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=collaboration', state)
    const hookPanel = screen.getByText('钩子引用', { selector: 'b' }).closest('section')!
    fireEvent.click(within(hookPanel).getByRole('button', { name: '编辑' }))
    const hook = await within(hookPanel).findByRole('checkbox', { name: '配置保存声明' })
    fireEvent.click(hook)
    fireEvent.click(within(hookPanel).getByRole('checkbox', { name: /覆盖包含配置路径/ }))
    fireEvent.click(within(hookPanel).getByRole('checkbox', { name: '否' }))
    fireEvent.click(within(hookPanel).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'hooks', value: expect.stringContaining('"parameterId":"include-path"') }) })))
  })

  it('Desktop 受管 Command 通过发现、参数校验与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, commandRefs: [], packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'8'.repeat(64)}` as const
    const asset = { id: 'commands-asset', containerId: 'commands-container', kind: 'commands', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\ncommands: []'
    const baselineRef = { id: 'commands-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-commands', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/commands.yaml', relativePath: 'agt_zhouce/config/commands.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-commands', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'saved', requestId: 'save-commands-zhouce', asset, revision: { id: 'revision-commands', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/commands.yaml' }, assetContentHash: hash, containerContentHash: hash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-commands', savedAt: '2026-09-01T00:00:00Z', summary: '保存 Command 引用', confirmationRefs: [] }, writeReceipt: { id: 'receipt-commands', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: hash, verifiedAt: '2026-09-01T00:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=collaboration', state)
    const commandPanel = screen.getByText('命令引用', { selector: 'b' }).closest('section')!
    fireEvent.click(within(commandPanel).getByRole('button', { name: '编辑' }))
    const command = await within(commandPanel).findByRole('checkbox', { name: '配置审计命令' })
    fireEvent.click(command)
    fireEvent.click(within(commandPanel).getByRole('checkbox', { name: /覆盖检查范围/ }))
    fireEvent.change(within(commandPanel).getByRole('combobox', { name: '检查范围' }), { target: { value: 'workspace' } })
    fireEvent.click(within(commandPanel).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, baseContent: base, change: expect.objectContaining({ kind: 'commands', value: expect.stringContaining('"parameterId":"scope"') }) })))
  })

  it('纯 Web WorkspaceBinding 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const save = vi.spyOn(desktopBridge, 'saveConfig')
    const create = vi.spyOn(desktopBridge, 'createWorkspaceBinding')

    renderAgent('/agents/zhouce?tab=workspaces')
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0])
    const instructions = screen.getByLabelText('专属主指令')
    fireEvent.change(instructions, { target: { value: '页面内存更新' } })
    fireEvent.click(screen.getByRole('button', { name: '保存到当前页面' }))

    expect(save).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(await screen.findByText('页面内存更新')).toBeInTheDocument()
  })

  it('Desktop 受管 WorkspaceBinding 通过发现、加载与真实保存闭环', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const binding = source.workspaceBindings[0]
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'7'.repeat(64)}` as const
    const asset = { id: 'workspace-binding-asset', containerId: 'workspace-binding-container', kind: 'workspace_binding', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = `schemaVersion: 1\nworkspaceBinding: ${JSON.stringify({ workspaceId: binding.workspaceId, instructions: binding.instructions, ruleIds: binding.ruleIds, skillIds: binding.skillIds, mcpIds: binding.mcpIds })}`
    const baselineRef = { id: 'workspace-binding-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-workspace-binding', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/config.yaml', relativePath: `agt_zhouce/workspaces/${binding.workspaceId}/config.yaml` }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-workspace-binding', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'unchanged', requestId: 'save-workspace-binding', asset })

    renderAgent('/agents/zhouce?tab=workspaces', state)
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0])
    const instructions = await screen.findByLabelText('专属主指令')
    fireEvent.change(instructions, { target: { value: '真实 WorkspaceBinding 更新' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assetId: asset.id, expectedBaseline: baselineRef, baseContent: base, change: expect.objectContaining({ kind: 'workspace_binding', value: expect.stringContaining('真实 WorkspaceBinding 更新') }) })))
    expect(save.mock.calls[0][0].change.value).not.toContain('memoryRevision')
  })

  it('Desktop 添加工作区配置 只提交稳定身份与规范正文', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'6'.repeat(64)}` as const
    const asset = { id: 'workspace-binding-created', containerId: 'workspace-binding-created-container', kind: 'workspace_binding', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const create = vi.spyOn(desktopBridge, 'createWorkspaceBinding').mockResolvedValue({ kind: 'unchanged', requestId: 'create-workspace-binding-zhouce-lab', asset })

    renderAgent('/agents/zhouce?tab=workspaces', state)
    fireEvent.click(screen.getByRole('button', { name: '添加工作区配置' }))
    const dialog = screen.getByRole('dialog', { name: '添加工作区配置' })
    fireEvent.change(within(dialog).getByLabelText('工作区'), { target: { value: 'lab' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认选择' }))
    expect(screen.getByText('lab', { selector: 'b' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('专属主指令'), { target: { value: '独立研究专属配置' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const request = create.mock.calls[0][0]
    expect(request).toEqual(expect.objectContaining({ agentId: 'zhouce', workspaceId: 'lab', value: expect.stringContaining('独立研究专属配置') }))
    expect(Object.keys(request).sort()).toEqual(['agentId', 'requestId', 'value', 'workspaceId'])
    expect(request.value).not.toContain('memoryRevision')
  })

  it('添加工作区配置 必须明确选择，取消保持零写入', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const extraWorkspace = { ...initialState.workspaces[0], id: 'sandbox', name: '沙盒工作区', path: '/tmp/sandbox' }
    const state: State = { ...initialState, workspaces: [...initialState.workspaces, extraWorkspace] }
    const create = vi.spyOn(desktopBridge, 'createWorkspaceBinding')

    renderAgent('/agents/zhouce?tab=workspaces', state)
    fireEvent.click(screen.getByRole('button', { name: '添加工作区配置' }))
    const dialog = screen.getByRole('dialog', { name: '添加工作区配置' })
    const select = within(dialog).getByLabelText('工作区')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(expect.arrayContaining(['独立研究（lab）', '沙盒工作区（sandbox）']))
    expect(within(dialog).getByRole('button', { name: '确认选择' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog', { name: '添加工作区配置' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('专属主指令')).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(source.workspaceBindings).toHaveLength(initialState.agents.find((item) => item.id === source.id)!.workspaceBindings.length)
  })

  it('Desktop Permissions 在双 Agent 发现结果中只加载当前 Agent 容器', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const other = initialState.agents.find((item) => item.id !== source.id)!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => ({ ...item, packageSource: { kind: 'bandi-managed', packageId: `agt_${item.id}`, strategy: 'managed' } })) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'3'.repeat(64)}` as const
    const otherAsset = { id: 'permissions-other', containerId: 'permissions-other-container', kind: 'permissions', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const currentAsset = { ...otherAsset, id: 'permissions-current', containerId: 'permissions-current-container' }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-permissions-dual', profileVersion: 'agent-package-v1', containers: [
      { id: otherAsset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/other-permissions.yaml', relativePath: `agt_${other.id}/config/permissions.yaml` }, format: 'yaml', contentHash: hash, writable: true },
      { id: currentAsset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/current-permissions.yaml', relativePath: 'agt_zhouce/config/permissions.yaml' }, format: 'yaml', contentHash: hash, writable: true },
    ], assets: [otherAsset, currentAsset], sharedAssets: [], references: [], diagnostics: [] })
    const load = vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-current', asset: currentAsset, canonicalContent: 'schemaVersion: 1\npermissions:\n  files: "仅当前工作区"\n  commands: "构建、测试与版本控制"\n  network: "仅已配置 MCP"\n  delegation: "仅明确服务授权范围"', redacted: false, baselineRef: { id: 'base-current', assetId: currentAsset.id, containerId: currentAsset.containerId, assetContentHash: hash, containerContentHash: hash }, diagnostics: [] })

    renderAgent('/agents/zhouce?tab=permissions', state)
    fireEvent.click(screen.getByRole('button', { name: '调整权限' }))

    await waitFor(() => expect(load).toHaveBeenCalledWith({ requestId: 'load-permissions-zhouce', assetId: currentAsset.id }))
  })

  it.each([
    ['缺失', [], [], /未发现该 Agent 的可编辑 Permissions 资产/],
    ['歧义', ['permissions-a', 'permissions-b'], ['container-a', 'container-b'], /Permissions 资产.*定位存在歧义/],
  ])('Desktop Permissions 定位%s时拒绝进入编辑', async (_case, assetIds, containerIds, message) => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'4'.repeat(64)}` as const
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-permissions-error', profileVersion: 'agent-package-v1', containers: containerIds.map((id) => ({ id, locator: { rootKind: 'managed' as const, displayPath: `/tmp/${id}.yaml`, relativePath: 'agt_zhouce/config/permissions.yaml' }, format: 'yaml' as const, contentHash: hash, writable: true })), assets: assetIds.map((id, index) => ({ id, containerId: containerIds[index], kind: 'permissions' as const, officialScope: 'managed' as const, assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed' as const, diagnostics: [] })), sharedAssets: [], references: [], diagnostics: [] })
    const load = vi.spyOn(desktopBridge, 'loadConfigEditor')

    renderAgent('/agents/zhouce?tab=permissions', state)
    fireEvent.click(screen.getByRole('button', { name: '调整权限' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByLabelText('文件写入')).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('纯 Web Permissions 保持页面内存保存到当前页面边界', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const save = vi.spyOn(desktopBridge, 'saveConfig')

    renderAgent('/agents/zhouce?tab=permissions')
    fireEvent.click(screen.getByRole('button', { name: '调整权限' }))
    fireEvent.change(screen.getByLabelText('文件写入'), { target: { value: '任意目录' } })
    fireEvent.click(screen.getByRole('button', { name: '保存到当前页面' }))

    const dialog = await screen.findByRole('dialog', { name: '确认扩大 Agent 长期权限' })
    expect(within(dialog).getByText(/仅在当前页面更新/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText(/输入 Agent 名称/), { target: { value: '周策' } })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: '确认扩大权限' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '确认扩大 Agent 长期权限' })).not.toBeInTheDocument())
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('任意目录')).toBeInTheDocument()
  })

  it('Desktop Permissions 扩大权限通过一次性 challenge 确认', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'9'.repeat(64)}` as const
    const proposedHash = `sha256:${'a'.repeat(64)}` as const
    const asset = { id: 'permissions-asset', containerId: 'permissions-container', kind: 'permissions', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\npermissions:\n  files: "仅当前工作区"\n  commands: "构建、测试与版本控制"\n  network: "仅已配置 MCP"\n  delegation: "仅明确服务授权范围"'
    const baselineRef = { id: 'permissions-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-permissions', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/permissions.yaml', relativePath: 'agt_zhouce/config/permissions.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-permissions', asset, canonicalContent: base, redacted: false, baselineRef, diagnostics: [] })
    const save = vi.spyOn(desktopBridge, 'saveConfig')
      .mockResolvedValueOnce({ kind: 'confirmation_required', requestId: 'save-permissions-zhouce', challenge: { id: 'confirmation-permissions', assetId: asset.id, proposedContentHash: proposedHash, expiresAt: '2026-08-31T12:10:00Z', reason: '扩大 Agent 长期权限边界' }, diagnostics: [{ code: 'permission_expansion_confirmation_required', severity: 'warning', message: '扩大 Agent 长期权限必须独立确认' }] })
      .mockResolvedValueOnce({ kind: 'saved', requestId: 'save-permissions-zhouce', asset, revision: { id: 'revision-permissions', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/permissions.yaml' }, assetContentHash: proposedHash, containerContentHash: proposedHash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-permissions', savedAt: '2026-08-31T12:00:00Z', summary: '保存长期权限边界', confirmationRefs: ['confirmation-permissions'] }, writeReceipt: { id: 'receipt-permissions', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: proposedHash, verifiedAt: '2026-08-31T12:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=permissions', state)
    fireEvent.click(screen.getByRole('button', { name: '调整权限' }))
    fireEvent.change(await screen.findByLabelText('文件写入'), { target: { value: '任意目录' } })
    fireEvent.click(screen.getByRole('button', { name: '保存边界' }))

    const dialog = await screen.findByRole('dialog', { name: '确认扩大 Agent 长期权限' })
    fireEvent.change(within(dialog).getByLabelText(/输入 Agent 名称/), { target: { value: '周策' } })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: '确认扩大权限' }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ assetId: asset.id, confirmationRef: undefined, change: expect.objectContaining({ kind: 'permissions', value: expect.stringContaining('files: "任意目录"') }) }))
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ assetId: asset.id, confirmationRef: 'confirmation-permissions' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '确认扩大 Agent 长期权限' })).not.toBeInTheDocument())
  })

  it('Desktop Permissions 恢复到更宽边界时再次要求 challenge', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const managed = { ...source, permissions: { ...source.permissions, files: '只读当前工作区' }, packageSource: { kind: 'bandi-managed' as const, packageId: 'agt_zhouce', strategy: 'managed' as const } }
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? managed : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'b'.repeat(64)}` as const
    const targetHash = `sha256:${'c'.repeat(64)}` as const
    const asset = { id: 'permissions-restore-asset', containerId: 'permissions-restore-container', kind: 'permissions', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const current = 'schemaVersion: 1\npermissions:\n  files: "只读当前工作区"\n  commands: "构建、测试与版本控制"\n  network: "仅已配置 MCP"\n  delegation: "仅明确服务授权范围"'
    const target = current.replace('只读当前工作区', '任意目录')
    const baselineRef = { id: 'permissions-restore-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }
    const revision = { id: 'revision-permissions-wide', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed' as const, displayPath: '/tmp/permissions.yaml' }, assetContentHash: targetHash, containerContentHash: targetHash, sourceAssetBaselineHash: hash, sourceContainerBaselineHash: hash, redacted: false, writeReceiptId: 'receipt-wide', savedAt: '2026-08-31T11:00:00Z', summary: '历史宽权限', confirmationRefs: ['old-confirmation'] }
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-permissions-restore', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/permissions.yaml', relativePath: 'agt_zhouce/config/permissions.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-permissions-restore', asset, canonicalContent: current, redacted: false, baselineRef, diagnostics: [] })
    vi.spyOn(desktopBridge, 'listConfigRevisions').mockResolvedValue([revision])
    vi.spyOn(desktopBridge, 'readConfigRevisionContent').mockResolvedValue(target)
    const restore = vi.spyOn(desktopBridge, 'restoreConfigRevision')
      .mockResolvedValueOnce({ kind: 'confirmation_required', requestId: 'restore-permissions-zhouce', challenge: { id: 'confirmation-restore-permissions', assetId: asset.id, proposedContentHash: targetHash, expiresAt: '2026-08-31T12:10:00Z', reason: '扩大 Agent 长期权限边界' }, diagnostics: [{ code: 'permission_expansion_confirmation_required', severity: 'warning', message: '扩大 Agent 长期权限必须独立确认' }] })
      .mockResolvedValueOnce({ kind: 'saved', requestId: 'restore-permissions-zhouce', asset, revision: { ...revision, id: 'revision-permissions-restored', restoredFromRevisionId: revision.id, confirmationRefs: ['confirmation-restore-permissions'] }, writeReceipt: { id: 'receipt-restored', containerId: asset.containerId, previousContainerHash: hash, writtenContainerHash: targetHash, verifiedAt: '2026-08-31T12:00:00Z', atomicReplace: true } })

    renderAgent('/agents/zhouce?tab=permissions', state)
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }))
    const history = await screen.findByRole('dialog', { name: '长期权限版本历史' })
    fireEvent.click(within(history).getByRole('checkbox'))
    fireEvent.click(within(history).getByRole('button', { name: '恢复为新版本' }))

    const confirmation = await screen.findByRole('dialog', { name: '确认扩大 Agent 长期权限' })
    fireEvent.change(within(confirmation).getByLabelText(/输入 Agent 名称/), { target: { value: '周策' } })
    fireEvent.click(within(confirmation).getByRole('checkbox'))
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认扩大权限' }))

    await waitFor(() => expect(restore).toHaveBeenCalledTimes(2))
    expect(restore).toHaveBeenNthCalledWith(1, expect.objectContaining({ revisionId: revision.id, confirmationRef: undefined }))
    expect(restore).toHaveBeenNthCalledWith(2, expect.objectContaining({ revisionId: revision.id, confirmationRef: 'confirmation-restore-permissions' }))
  })

  it('Desktop Context 外部变化保留草稿并展示三方 YAML', async () => {
    const source = initialState.agents.find((item) => item.id === 'zhouce')!
    const state: State = { ...initialState, agents: initialState.agents.map((item) => item.id === source.id ? { ...item, packageSource: { kind: 'bandi-managed', packageId: 'agt_zhouce', strategy: 'managed' } } : item) }
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'5'.repeat(64)}` as const
    const asset = { id: 'context-asset', containerId: 'context-container', kind: 'context', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] } satisfies import('../contracts').SourceAssetSummaryDto
    const base = 'schemaVersion: 1\ncontextPolicy:\n  enabled: true\n  triggerRatio: 0.8\n  targetRatio: 0.5\n  protectRecentTurns: 6\n  protectOpeningTurns: 2\noutputProfileId: ""\noutputParameterBindings: []'
    vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({ requestId: 'discover-context', profileVersion: 'agent-package-v1', containers: [{ id: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/context.yaml', relativePath: 'agt_zhouce/config/context.yaml' }, format: 'yaml', contentHash: hash, writable: true }], assets: [asset], sharedAssets: [], references: [], diagnostics: [] })
    vi.spyOn(desktopBridge, 'loadConfigEditor').mockResolvedValue({ requestId: 'load-context', asset, canonicalContent: base, redacted: false, baselineRef: { id: 'context-base', assetId: asset.id, containerId: asset.containerId, assetContentHash: hash, containerContentHash: hash }, diagnostics: [] })
    vi.spyOn(desktopBridge, 'saveConfig').mockResolvedValue({ kind: 'baseline_changed', requestId: 'save-context-zhouce', assetId: asset.id, containerId: asset.containerId, locator: { rootKind: 'managed', displayPath: '/tmp/context.yaml' }, base: { content: base, assetContentHash: hash, containerContentHash: hash, redacted: false }, current: { content: base.replace('triggerRatio: 0.8', 'triggerRatio: 0.9'), assetContentHash: hash, containerContentHash: hash, redacted: false }, proposed: { content: base.replace('triggerRatio: 0.8', 'triggerRatio: 0.85'), assetContentHash: hash, containerContentHash: hash, redacted: false }, diagnostics: [{ code: 'baseline_changed', severity: 'warning', message: '已发生外部变化' }] })

    renderAgent('/agents/zhouce?tab=context', state)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(await screen.findByDisplayValue(80), { target: { value: '85' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('编辑期间发生变化')
    expect(screen.getByDisplayValue(85)).toHaveValue(85)
    expect(screen.getByText(/triggerRatio: 0.9/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '基于当前内容重新编辑' })).toBeEnabled()
  })
})
