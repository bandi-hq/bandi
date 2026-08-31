// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
}))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => desktopBridge.desktop,
  listManagedAgents: () => Promise.resolve([]),
  selectWorkspaceDirectory: desktopBridge.selectWorkspaceDirectory,
}))

const storage = new Map<string, string>()
const NativeRequest = globalThis.Request

beforeEach(() => {
  storage.clear()
  desktopBridge.desktop = false
  desktopBridge.selectWorkspaceDirectory.mockReset()
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
  it('允许从现有项目目录开始', () => {
    renderRoutes('/', emptyState)

    expect(screen.getByRole('heading', { name: '先建立你的个人工作区' })).toBeInTheDocument()
    expect(screen.getByText('无需先创建 AgentPackage、安装 Bandi Plugin 或建立公司。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '选择目录开始' })).toHaveAttribute('href', '/workspaces/new?onboarding=1')
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

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/个人项目'))
    expect(await screen.findByRole('heading', { name: '个人项目' })).toBeInTheDocument()
    expect(screen.getByText('先独立使用，或让 AI 帮你规划协作方式')).toBeInTheDocument()
    expect(screen.getByText('未验证')).toBeInTheDocument()
    expect(screen.getAllByText('未关联组织').length).toBeGreaterThan(0)

    expect(screen.getByRole('button', { name: '在 Claude Code 中继续' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    expect(screen.getByRole('dialog', { name: '让 AI 帮我规划协作方式' })).toBeInTheDocument()
    expect(screen.getByLabelText('你的场景与目标')).toBeInTheDocument()
    expect(screen.getByText(/'claude' '\/bandi:bandi'/)).toBeInTheDocument()
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
