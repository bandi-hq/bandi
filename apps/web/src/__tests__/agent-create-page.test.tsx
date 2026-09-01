// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCreatePage } from '../pages/agents/agent-create-page'
import { AppProvider, initialState, useApp, type State } from '../state'

const bridge = vi.hoisted(() => ({
  desktop: false,
  createManagedAgent: vi.fn(),
  saveDepartment: vi.fn(),
  saveServiceGrants: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  createManagedAgent: bridge.createManagedAgent,
  isDesktopRuntime: () => bridge.desktop,
  saveDepartment: bridge.saveDepartment,
  saveServiceGrants: bridge.saveServiceGrants,
}))

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-agent-id' })
  bridge.createManagedAgent.mockReset()
  bridge.saveDepartment.mockReset()
  bridge.saveServiceGrants.mockReset()
  bridge.saveDepartment.mockImplementation(async (department) => department)
  bridge.saveServiceGrants.mockResolvedValue([])
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

function renderPage(state: State = initialState) {
  const router = createMemoryRouter([
    { path: '/agents/new', element: <AgentCreatePage /> },
    { path: '/agents/:id', element: <ResultProbe /> },
    { path: '/organization', element: <div>组织管理页</div> },
  ], { initialEntries: ['/agents/new'] })
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
  fireEvent.change(screen.getByRole('combobox', { name: '唯一主属部门' }), { target: { value: 'dev' } })
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

function managedResult(agent: State['agents'][number]) {
  return {
    agent,
    baselineRef: {
      assetContentHash: 'identity-hash',
      sourceLocatorHash: 'locator-hash',
      capturedAt: '2026-09-02T00:00:00Z',
    },
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

  it('空组织时引导先创建公司，不展示无法完成的创建表单', () => {
    renderPage({ ...initialState, companies: [], departments: [], roles: [] })

    expect(screen.getByText('请先创建公司')).toBeInTheDocument()
    expect(screen.getByText(/Agent 必须选择所属公司、唯一主属部门和有效岗位/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '前往组织管理' })).toHaveAttribute('href', '/organization')
    expect(screen.queryByRole('textbox', { name: 'Agent 名称' })).not.toBeInTheDocument()
  })

  it('中文名称使用固定技术标识，并展示完整确认摘要', () => {
    bridge.desktop = true
    renderPage()
    completeIdentity()
    completeDuties()

    expect(screen.getByText(/技术标识：agent-fixed-agent-id（创建后不可修改）/)).toBeInTheDocument()
    expect(screen.getByText(/主属部门：研发部 · 初始工作区：暂不设置 · 跨部门授权：0 项/)).toBeInTheDocument()
    expect(screen.getByText('长期权限：仅当前工作区 / 构建与测试 / 默认禁止网络')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent 名称' }), { target: { value: '阿阿' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    expect(screen.getByText(/技术标识：agent-fixed-agent-id（创建后不可修改）/)).toBeInTheDocument()
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
    bridge.createManagedAgent.mockImplementation(async (agent) => managedResult(agent))
    const { router } = renderPage()
    completeIdentity()
    completeDuties()

    fireEvent.click(screen.getByRole('button', { name: '添加授权' }))
    expect(screen.getByRole('combobox', { name: '目标部门' })).toHaveValue('office')
    expect(screen.queryByRole('option', { name: '研发部' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '研究组' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '目标部门' }), { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(bridge.createManagedAgent).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(router.state.location.pathname, screen.queryByRole('alert')?.textContent ?? undefined).toBe('/agents/agent-fixed-agent-id'))
    expect(screen.queryByText('放弃未保存修改？')).not.toBeInTheDocument()
    const [agent, files] = bridge.createManagedAgent.mock.calls[0]
    expect(agent.id).toBe('agent-fixed-agent-id')
    expect(agent.packagePath).toBe('~/.bandi/agents/agt_agent-fixed-agent-id/')
    expect(agent.packageSource.packageId).toBe('agt_agent-fixed-agent-id')
    expect(files.find((file: { path: string }) => file.path === 'agent.yaml')?.content).toContain('id: agent-fixed-agent-id')
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
    expect(bridge.saveServiceGrants).toHaveBeenCalledWith('agent-fixed-agent-id', [expect.objectContaining({ departmentId: 'test' })])
    expect(bridge.saveDepartment).toHaveBeenCalledWith(expect.objectContaining({ memberAgentIds: expect.arrayContaining(['agent-fixed-agent-id']) }))
    expect(screen.getByText('AgentPackage 已保存')).toBeInTheDocument()
  })

  it('技术标识异常时返回身份步骤并给出可恢复提示', async () => {
    bridge.desktop = true
    bridge.createManagedAgent.mockRejectedValue(new Error('INVALID_AGENT_ID: Agent 标识无效'))
    renderPage()
    completeIdentity()
    completeDuties()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('系统生成的技术标识无效，请重试创建。技术详情：INVALID_AGENT_ID')
    expect(screen.getByRole('textbox', { name: 'Agent 名称' })).toBeInTheDocument()
  })

  it('组织保存失败后重试不会重复创建 AgentPackage', async () => {
    bridge.desktop = true
    bridge.createManagedAgent.mockImplementation(async (agent) => managedResult(agent))
    bridge.saveServiceGrants
      .mockRejectedValueOnce(new Error('database busy'))
      .mockResolvedValueOnce([])
    renderPage()
    completeIdentity()
    completeDuties()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('AgentPackage 已创建，但组织关系尚未完整保存：database busy')
    expect(screen.getByRole('alert')).toHaveTextContent('本次不会重复创建 AgentPackage')
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(screen.getByText('AgentPackage 已保存')).toBeInTheDocument())
    expect(bridge.createManagedAgent).toHaveBeenCalledTimes(1)
    expect(bridge.saveServiceGrants).toHaveBeenCalledTimes(2)
  })
})
