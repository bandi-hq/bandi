// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../pages/home-page'
import { OrganizationPage } from '../pages/organization/organization-pages'
import { WorkspaceDetailPage, WorkspaceWizardPage } from '../pages/workspaces/workspace-pages'
import { GlobalSheets } from '../sheets'
import { AppProvider, initialState, type State } from '../state'

const desktopBridge = vi.hoisted(() => ({
  desktop: false,
  selectWorkspaceDirectory: vi.fn(),
  createWorkspace: vi.fn(),
  generateEntityId: vi.fn(),
  loadOrganizationSnapshot: vi.fn(),
  listAgents: vi.fn(),
  listAgentRecoveryOperations: vi.fn(),
  continueAgentRecovery: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => desktopBridge.desktop,
  listAgents: desktopBridge.listAgents,
  listManagedAgents: () => Promise.resolve([]),
  loadOrganizationSnapshot: desktopBridge.loadOrganizationSnapshot,
  selectWorkspaceDirectory: desktopBridge.selectWorkspaceDirectory,
  createWorkspace: desktopBridge.createWorkspace,
  generateEntityId: desktopBridge.generateEntityId,
  listAgentRecoveryOperations: desktopBridge.listAgentRecoveryOperations,
  continueAgentRecovery: desktopBridge.continueAgentRecovery,
}))

const storage = new Map<string, string>()
const NativeRequest = globalThis.Request

beforeEach(() => {
  storage.clear()
  desktopBridge.desktop = false
  desktopBridge.selectWorkspaceDirectory.mockReset()
  desktopBridge.listAgents.mockReset()
  desktopBridge.createWorkspace.mockReset()
  desktopBridge.generateEntityId.mockReset()
  desktopBridge.loadOrganizationSnapshot.mockReset()
  desktopBridge.listAgentRecoveryOperations.mockReset()
  desktopBridge.continueAgentRecovery.mockReset()
  desktopBridge.listAgents.mockResolvedValue([])
  desktopBridge.listAgentRecoveryOperations.mockResolvedValue([])
  desktopBridge.loadOrganizationSnapshot.mockResolvedValue({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [], serviceGrants: [] })
  desktopBridge.generateEntityId.mockResolvedValue('workspace-generated')
  desktopBridge.createWorkspace.mockImplementation((_requestId: string, selectedPath: string, workspace) => Promise.resolve({ ...workspace, path: selectedPath }))
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderRoutes(initialEntry: string, state: State) {
  const router = createMemoryRouter([{
    path: '/',
    element: <AppProvider initialState={state}><Outlet /><GlobalSheets /></AppProvider>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'organization', element: <OrganizationPage /> },
      { path: 'workspaces/new', element: <WorkspaceWizardPage /> },
      { path: 'workspaces/:id', element: <WorkspaceDetailPage /> },
    ],
  }], { initialEntries: [initialEntry] })
  return { ...render(<RouterProvider router={router} />), router }
}

const emptyState: State = {
  ...initialState,
  companies: [],
  departments: [],
  workspaces: [],
  currentWorkspaceId: null,
}

describe('渐进式首次体验', () => {
  it('Desktop 等待全部 hydration，只有 Workspace 时仍进入 Agent-first 首次使用页', async () => {
    desktopBridge.desktop = true
    let resolveSnapshot!: (value: { schemaVersion: 1; companies: []; departments: []; roles: []; workspaces: State['workspaces']; serviceGrants: [] }) => void
    desktopBridge.loadOrganizationSnapshot.mockImplementation(() => new Promise((resolve) => { resolveSnapshot = resolve }))
    const router = createMemoryRouter([{ path: '/', element: <AppProvider><HomePage /></AppProvider> }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading', { name: '恢复你的 Agent 配置' })).toBeInTheDocument()
    expect(screen.queryByText('星河科技')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '先导入或创建一个长期 Agent' })).not.toBeInTheDocument()

    resolveSnapshot({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [{ ...initialState.workspaces[0], id: 'hydrated', name: '真实工作区' }], serviceGrants: [] })

    expect(await screen.findByRole('heading', { name: '先导入或创建一个长期 Agent' })).toBeInTheDocument()
    expect(screen.getByText(/首次启动不会扫描电脑或申请宽泛磁盘访问/)).toBeInTheDocument()
    expect(screen.queryByText('真实工作区')).not.toBeInTheDocument()
  })

  it('Desktop 持久展示多项读取失败并允许重试', async () => {
    desktopBridge.desktop = true
    desktopBridge.listAgents.mockRejectedValueOnce(new Error('agent root unavailable')).mockResolvedValue([])
    desktopBridge.loadOrganizationSnapshot.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [], serviceGrants: [] })
    desktopBridge.listAgentRecoveryOperations.mockImplementation(() => new Promise(() => undefined))
    const router = createMemoryRouter([{ path: '/', element: <AppProvider><HomePage /></AppProvider> }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法完整读取本机配置')
    expect(alert).toHaveTextContent('agent root unavailable')
    expect(alert).toHaveTextContent('database unavailable')
    expect(alert).toHaveTextContent('仍在读取')
    expect(alert).not.toHaveTextContent('页面顶部错误提示')

    desktopBridge.listAgentRecoveryOperations.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
    expect(await screen.findByRole('heading', { name: '先导入或创建一个长期 Agent' })).toBeInTheDocument()
    expect(desktopBridge.listAgents).toHaveBeenCalledTimes(2)
  })

  it('首页可继续未完成 Agent 配置，blocked 状态只允许查看', async () => {
    const pending = {
      id: 'operation-pending',
      agentId: initialState.agents[0].id,
      operationKind: 'create' as const,
      status: 'organization_pending' as const,
      createdAt: '2026-09-02T00:00:00Z',
    }
    desktopBridge.continueAgentRecovery.mockResolvedValue({
      operation: { ...pending, status: 'completed' },
      agent: initialState.agents[0],
    })
    renderRoutes('/', {
      ...initialState,
      onboarding: { status: 'completed' },
      agentRecoveryOperations: [pending, { ...pending, id: 'operation-blocked', agentId: initialState.agents[1].id, status: 'blocked' }],
    })

    expect(screen.getAllByText('Agent 配置尚未完整保存')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '查看 Agent' })).toHaveAttribute('href', `/agents/${initialState.agents[1].id}`)
    fireEvent.click(screen.getByRole('button', { name: '继续修复' }))

    await waitFor(() => expect(screen.getAllByText('Agent 配置尚未完整保存')).toHaveLength(1))
    expect(desktopBridge.continueAgentRecovery).toHaveBeenCalledWith('operation-pending')
  })

  it('首次使用从 Agent 导入或创建开始', () => {
    renderRoutes('/', { ...emptyState, agents: [] })

    expect(screen.getByRole('heading', { name: '先导入或创建一个长期 Agent' })).toBeInTheDocument()
    expect(screen.getByText('无需预先创建工作区、公司、部门或岗位。')).toBeInTheDocument()
    expect(screen.getByText(/浏览器演示不会读取或写入本机文件/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '导入已有 Agent' })).toHaveAttribute('href', '/agents/new?mode=import')
    expect(screen.getByRole('link', { name: '创建个人 Agent' })).toHaveAttribute('href', '/agents/new')
  })

  it('无 Company 时可登记未验证 Workspace 并直接查看 Claude Code 指引', async () => {
    const { router } = renderRoutes('/workspaces/new?onboarding=1', emptyState)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '个人项目' } })
    fireEvent.change(screen.getByLabelText('本地目录'), { target: { value: '/Users/demo/project' } })
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))

    const organization = screen.getByRole('checkbox', { name: /关联组织/ })
    expect(organization).not.toBeChecked()
    expect(organization).toBeDisabled()
    expect(screen.getByText(/尚未创建公司，可先完成工作区/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    expect(screen.getByText('暂不关联组织')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '添加演示工作区' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/workspace-1'))
    expect(await screen.findByRole('heading', { name: '个人项目' })).toBeInTheDocument()
    expect(screen.getByText('先独立使用，或让 AI 帮你规划协作方式')).toBeInTheDocument()
    expect(screen.getByText('未验证')).toBeInTheDocument()
    expect(screen.getAllByText('未关联组织').length).toBeGreaterThan(0)

    expect(screen.getByRole('button', { name: '在 Claude Code 中继续' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '导入 Claude Agent' })).toHaveAttribute('href', '/agents/new?mode=import&workspace=workspace-1')
    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    expect(screen.getByRole('dialog', { name: '让 AI 帮我规划协作方式' })).toBeInTheDocument()
    expect(screen.getByLabelText('你的场景与目标')).toBeInTheDocument()
    expect(screen.getByText(/Bandi 不生成、执行或回传命令/)).toBeInTheDocument()
    expect(screen.getAllByText('/Users/demo/project').length).toBeGreaterThan(0)
  })

  it('Web 模式为空字段提供关联错误', () => {
    renderRoutes('/workspaces/new', emptyState)

    fireEvent.click(screen.getByRole('button', { name: /继续/ }))

    expect(screen.getByLabelText('名称')).toHaveAttribute('aria-describedby', 'workspace-name-error')
    expect(screen.getByLabelText('本地目录')).toHaveAttribute('aria-describedby', 'workspace-path-error')
    expect(screen.getByText('请输入工作区名称。')).toBeInTheDocument()
    expect(screen.getByText('请输入以 / 或 ~/ 开头的完整路径。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择目录' })).not.toBeInTheDocument()
  })

  it('Desktop 模式通过系统选择器取得路径', async () => {
    desktopBridge.desktop = true
    desktopBridge.selectWorkspaceDirectory.mockResolvedValue('/Volumes/demo/project')
    renderRoutes('/workspaces/new', emptyState)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '桌面项目' } })
    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(await screen.findByText('/Volumes/demo/project')).toBeInTheDocument()
    expect(desktopBridge.selectWorkspaceDirectory).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('名称')).toHaveValue('桌面项目')
    expect(screen.queryByRole('textbox', { name: '本地目录' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新选择目录' })).toBeInTheDocument()
  })

  it('Desktop 模式完成时通过本地服务登记规范化工作区', async () => {
    desktopBridge.desktop = true
    desktopBridge.selectWorkspaceDirectory.mockResolvedValue('/Volumes/demo/project')
    desktopBridge.generateEntityId.mockResolvedValue('workspace-desktop-project')
    desktopBridge.createWorkspace.mockImplementation((_requestId: string, _selectedPath: string, workspace) => Promise.resolve({ ...workspace, path: '/Volumes/demo/canonical' }))
    const { router } = renderRoutes('/workspaces/new', emptyState)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'desktop-project' } })
    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))
    expect(await screen.findByText('/Volumes/demo/project')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))

    await vi.waitFor(() => expect(desktopBridge.createWorkspace).toHaveBeenCalledWith('create-workspace-desktop-project', '/Volumes/demo/project', expect.objectContaining({ id: 'workspace-desktop-project', name: 'desktop-project' })))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/workspace-desktop-project'))
  })

  it('Desktop 创建失败后使用同一稳定 ID 重试', async () => {
    desktopBridge.desktop = true
    desktopBridge.selectWorkspaceDirectory.mockResolvedValue('/Volumes/demo/project')
    desktopBridge.generateEntityId.mockResolvedValue('workspace-retry-project')
    desktopBridge.createWorkspace.mockRejectedValueOnce(new Error('database busy')).mockImplementation((_requestId: string, selectedPath: string, workspace) => Promise.resolve({ ...workspace, path: selectedPath }))
    const { router } = renderRoutes('/workspaces/new', emptyState)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '重试项目' } })
    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))
    expect(await screen.findByText('/Volumes/demo/project')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续/ }))
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('database busy')
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/workspace-retry-project'))
    expect(desktopBridge.generateEntityId).toHaveBeenCalledTimes(1)
    expect(desktopBridge.createWorkspace).toHaveBeenCalledTimes(2)
  })

  it('Desktop 模式取消选择时保留原路径且不报错', async () => {
    desktopBridge.desktop = true
    desktopBridge.selectWorkspaceDirectory.mockResolvedValueOnce('/Volumes/demo/first').mockResolvedValueOnce(null)
    renderRoutes('/workspaces/new', emptyState)

    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))
    expect(await screen.findByText('/Volumes/demo/first')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新选择目录' }))

    await vi.waitFor(() => expect(desktopBridge.selectWorkspaceDirectory).toHaveBeenCalledTimes(2))
    expect(screen.getByText('/Volumes/demo/first')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Desktop 模式展示目录选择失败并允许重试', async () => {
    desktopBridge.desktop = true
    desktopBridge.selectWorkspaceDirectory.mockRejectedValue(new Error('native failure'))
    renderRoutes('/workspaces/new', emptyState)

    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('无法打开系统目录选择器，请重试。')
    expect(screen.getByRole('button', { name: '选择目录' })).toBeEnabled()
  })

  it('无 Company 时保留组织入口并只引导创建公司', () => {
    renderRoutes('/organization', emptyState)

    expect(screen.getByText('尚未建立组织')).toBeInTheDocument()
    expect(screen.getByText('这不会影响你登记工作区、管理现有配置或继续使用 Claude Code。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建公司' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建部门' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '当前公司' })).not.toBeInTheDocument()
  })
})
