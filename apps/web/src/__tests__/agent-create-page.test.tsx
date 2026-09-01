// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCreatePage } from '../pages/agents/agent-create-page'
import { AppProvider, initialState, useApp, type State } from '../state'

const NativeRequest = globalThis.Request

const bridge = vi.hoisted(() => ({
  desktop: false,
  commitManagedAgentCreation: vi.fn(),
  registerExternalAgent: vi.fn(),
  selectDirectory: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  commitManagedAgentCreation: bridge.commitManagedAgentCreation,
  isDesktopRuntime: () => bridge.desktop,
  registerExternalAgent: bridge.registerExternalAgent,
  selectDirectory: bridge.selectDirectory,
}))

beforeEach(() => {
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-agent-id' })
  bridge.commitManagedAgentCreation.mockReset()
  bridge.registerExternalAgent.mockReset()
  bridge.selectDirectory.mockReset()
  bridge.selectDirectory.mockResolvedValue('/tmp/external-agent')
  bridge.registerExternalAgent.mockImplementation(async (agent, selectedRoot) => ({ agentId: agent.id, canonicalRoot: selectedRoot, metadata: agent, createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  bridge.desktop = false
})

function ResultProbe() {
  const { state } = useApp()
  const location = useLocation()
  return <div>{location.pathname}{location.search}<span>{state.notice?.title}</span><span>{state.notice?.description}</span></div>
}

function renderPage(state: State = initialState, initialEntry = '/agents/new') {
  const router = createMemoryRouter([
    { path: '/agents/new', element: <AgentCreatePage /> },
    { path: '/agents/:id', element: <ResultProbe /> },
    { path: '/organization', element: <div>组织管理页</div> },
  ], { initialEntries: [initialEntry] })
  return {
    router,
    ...render(
      <AppProvider initialState={state}>
        <RouterProvider router={router} />
      </AppProvider>,
    ),
  }
}

function completeIdentity(name = '阿') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Agent 名称' }), { target: { value: name } })
  fireEvent.change(screen.getByRole('combobox', { name: '所属部门' }), { target: { value: 'dev' } })
  fireEvent.change(screen.getByRole('combobox', { name: '岗位' }), { target: { value: 'role-web-engineer' } })
  fireEvent.click(screen.getByRole('button', { name: '继续' }))
}

function completeDuties() {
  fireEvent.change(screen.getByRole('textbox', { name: '使命' }), { target: { value: '交付可靠界面' } })
  fireEvent.change(screen.getByRole('textbox', { name: '主要职责（每行一项）' }), { target: { value: '前端实现' } })
  fireEvent.change(screen.getByRole('textbox', { name: '决策边界' }), { target: { value: '不扩大范围' } })
  fireEvent.change(screen.getByRole('textbox', { name: '禁止事项' }), { target: { value: '不得扩大权限' } })
  fireEvent.click(screen.getByRole('button', { name: '继续' }))
}

function managedResult(agent: State['agents'][number], status = 'completed') {
  return {
    operation: {
      id: 'operation-fixed',
      agentId: agent.id,
      operationKind: 'create',
      status,
      createdAt: '2026-09-02T00:00:00Z',
    },
    agent,
  }
}

describe('Agent 创建页', () => {
  it('Desktop 准确说明会创建受管 AgentPackage，且不默认绑定 xinghe', () => {
    bridge.desktop = true
    const state = {
      ...initialState,
      companies: [{ ...initialState.companies[0], id: 'company-custom', name: '自定义公司' }],
      departments: initialState.departments.map((item) => ({ ...item, companyId: 'company-custom' })),
      roles: initialState.roles.map((item) => ({ ...item, companyId: 'company-custom' })),
    }
    renderPage(state)

    expect(screen.getByText('创建受管 AgentPackage，并将组织关系保存到 Bandi Desktop。')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '所属公司' })).toHaveValue('company-custom')
    expect(screen.queryByText(/不会在磁盘上生成 AgentPackage/)).not.toBeInTheDocument()
  })

  it('Desktop 外部引用使用系统目录并真实持久化', async () => {
    bridge.desktop = true
    const { router } = renderPage(initialState, '/agents/new?mode=import')

    expect(screen.getByRole('heading', { name: '登记外部 AgentPackage' })).toBeInTheDocument()
    expect(screen.getByText(/重启后保留，但不会复制、扫描、读取或修改目录内容/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '稳定 agent-id' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))
    await screen.findByText('/tmp/external-agent')
    completeIdentity('外部助手')
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '登记外部引用' }))

    await waitFor(() => expect(bridge.registerExternalAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-fixed-agent-id' }), '/tmp/external-agent'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/agents/agent-fixed-agent-id'))
    expect(screen.getByText(/外部 AgentPackage 引用已登记/)).toBeInTheDocument()
  })

  it('空组织时引导先创建公司，不展示无法完成的创建表单', () => {
    renderPage({ ...initialState, companies: [], departments: [], roles: [] })

    expect(screen.getByText('请先创建公司')).toBeInTheDocument()
    expect(screen.getByText(/Agent 必须选择所属公司、所属部门和有效岗位/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '前往组织管理' })).toHaveAttribute('href', '/organization')
    expect(screen.queryByRole('textbox', { name: 'Agent 名称' })).not.toBeInTheDocument()
  })

  it('中文名称使用固定技术标识，并展示完整确认摘要', () => {
    bridge.desktop = true
    renderPage()
    completeIdentity()
    completeDuties()

    expect(screen.getByText((_, element) => element?.textContent === '技术标识：agent-fixed-agent-id（由系统生成，创建后不可修改）')).toBeInTheDocument()
    expect(screen.getByText(/所属部门：研发部 · 初始工作区：暂不设置 · 跨部门授权：0 项/)).toBeInTheDocument()
    expect(screen.getByText('长期权限：仅当前工作区 / 构建与测试 / 默认禁止网络')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent 名称' }), { target: { value: '阿阿' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    expect(screen.getByText((_, element) => element?.textContent === '技术标识：agent-fixed-agent-id（由系统生成，创建后不可修改）')).toBeInTheDocument()
  })

  it('没有其他部门时禁用跨部门授权并解释原因', () => {
    const state = {
      ...initialState,
      departments: initialState.departments.filter((item) => item.id === 'dev'),
      roles: initialState.roles.filter((item) => item.departmentId === 'dev'),
    }
    renderPage(state)
    completeIdentity()
    completeDuties()

    expect(screen.getByRole('button', { name: '添加授权' })).toBeDisabled()
    expect(screen.getByText('当前公司没有其他可授权部门。')).toBeInTheDocument()
  })

  it('Desktop 创建时所有身份事实使用同一固定 ID', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent))
    const { router } = renderPage()
    completeIdentity()
    completeDuties()

    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    expect(screen.getByRole('combobox', { name: '目标部门' })).toHaveValue('office')
    expect(screen.queryByRole('option', { name: '研发部' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '研究组' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '目标部门' }), { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1))
    const [requestId, agent, files, grants] = bridge.commitManagedAgentCreation.mock.calls[0]
    expect(requestId).toBe('create-agent-agent-fixed-agent-id')
    expect(agent.id).toBe('agent-fixed-agent-id')
    expect(agent.packagePath).toBe('~/.bandi/agents/agt_agent-fixed-agent-id/')
    expect(agent.packageSource.packageId).toBe('agt_agent-fixed-agent-id')
    expect(files.find((file: { path: string }) => file.path === 'agent.yaml')?.content).toContain('id: "agent-fixed-agent-id"')
    expect(files.map((file: { path: string }) => file.path).sort()).toEqual([
      'agent.yaml',
      'config/commands.yaml',
      'config/context.yaml',
      'config/hooks.yaml',
      'config/mcp.yaml',
      'config/orchestration.yaml',
      'config/permissions.yaml',
      'config/rules.yaml',
      'config/skills.yaml',
      'config/sop.yaml',
      'instructions.md',
    ])
    expect(grants).toEqual([expect.objectContaining({ departmentId: 'test' })])
    await waitFor(() => expect(router.state.location.pathname).toBe('/agents/agent-fixed-agent-id'), { timeout: 3_000 })
    expect(screen.queryByText('放弃未保存修改？')).not.toBeInTheDocument()
    expect(await screen.findByText('已创建完整受管 AgentPackage 与组织关系')).toBeInTheDocument()
  })

  it('技术标识异常时返回身份步骤并给出可恢复提示', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockRejectedValue(new Error('INVALID_AGENT_ID: Agent 标识无效'))
    renderPage()
    completeIdentity()
    completeDuties()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('系统生成的技术标识无效，请重试创建。技术详情：INVALID_AGENT_ID')
    expect(screen.getByRole('textbox', { name: 'Agent 名称' })).toBeInTheDocument()
  })

  it('半成功状态引导到全局待处理恢复，不在页面重复编排', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent, 'organization_pending'))
    renderPage()
    completeIdentity()
    completeDuties()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent 配置尚未完整保存，可从首页待处理项继续修复')
    expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1)
  })
})
