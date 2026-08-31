// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorSessionProvider } from '../editor-session'
import { AgentDetailPage } from '../pages/agents/agent-detail-page'
import { AppProvider } from '../state'

const NativeRequest = globalThis.Request

beforeEach(() => {
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
})

function renderAgent(initialEntry = '/agents/zhouce') {
  const router = createMemoryRouter([{
    path: '/agents/:id',
    element: <AppProvider><EditorSessionProvider><AgentDetailPage /></EditorSessionProvider></AppProvider>,
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

  it('身份编辑只从身份与职责领域内进入', async () => {
    const { router } = renderAgent()

    expect(screen.queryByRole('link', { name: '编辑身份与职责' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '身份与职责' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))

    expect(screen.getByDisplayValue('周策')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tab=identity')
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
    expect(screen.getByText(/只读源码投影|演示源码投影/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '预览' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('tab', { name: '源码' })).toHaveAttribute('aria-pressed', 'true')
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
    const editor = screen.getByRole('textbox', { name: 'Instructions 正文' })
    fireEvent.change(editor, { target: { value: '尚未保存的新正文' } })

    expect(editor).toHaveValue('尚未保存的新正文')
    expect(screen.getByRole('button', { name: '模拟保存' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
  })
})
