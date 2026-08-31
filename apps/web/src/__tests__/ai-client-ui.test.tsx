// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiClientHandoffAction } from '../components/ai-clients'
import type { State } from '../state'
import { GlobalSheets } from '../sheets'
import { AppProvider, initialState, useApp } from '../state'

const desktopBridge = vi.hoisted(() => ({
  desktop: false,
  requestLaunchWorkspace: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => desktopBridge.desktop,
  listManagedAgents: () => Promise.resolve([]),
  requestLaunchWorkspace: desktopBridge.requestLaunchWorkspace,
}))

function HandoffHarness({ workspaceId = 'bandi', planning = false }: { workspaceId?: string; planning?: boolean }) {
  return <><AiClientHandoffAction workspaceId={workspaceId || undefined} planning={planning} /><GlobalSheets /></>
}

function renderHandoff(clientIds: string[], workspaceId = 'bandi', planning = false) {
  const state: State = {
    ...initialState,
    configurationEnvironments: initialState.configurationEnvironments.map((item) => item.id === 'personal' ? { ...item, clientIds } : item),
  }
  return render(<MemoryRouter><AppProvider initialState={state}><HandoffHarness workspaceId={workspaceId} planning={planning} /></AppProvider></MemoryRouter>)
}

function GuideHarness() {
  const { dispatch, state } = useApp()
  return <>
    <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'client-guide', workspaceId: 'bandi', clientId: 'codex' } })}>Codex 指引</button>
    <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'client-guide', workspaceId: 'bandi', clientId: 'claude-code' } })}>Claude 指引</button>
    {state.notice && <output>{state.notice.title} {state.notice.description}</output>}
    <GlobalSheets />
  </>
}

beforeEach(() => {
  desktopBridge.desktop = false
  desktopBridge.requestLaunchWorkspace.mockReset()
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AI 编程工具界面', () => {
  it('按当前方案工具数量展示添加、直接进入或选择入口', () => {
    const empty = renderHandoff([])
    expect(screen.getByRole('button', { name: '添加 AI 编程工具' })).toBeInTheDocument()
    empty.unmount()

    const single = renderHandoff(['claude-code'])
    expect(screen.getByRole('button', { name: '在 Claude Code 中继续' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择 AI 编程工具' })).not.toBeInTheDocument()
    single.unmount()

    renderHandoff(['claude-code', 'codex'])
    fireEvent.keyDown(screen.getByRole('button', { name: '选择 AI 编程工具' }), { key: 'Enter' })
    expect(screen.getByText('可继续使用')).toBeInTheDocument()
    expect(screen.getByText('仅配置')).toBeInTheDocument()
    expect(screen.getByText('打开工作区交接说明')).toBeInTheDocument()
    expect(screen.getByText('仅配置 · 尚未定义启动适配')).toBeInTheDocument()
  })

  it('多个仅配置工具时不显示空的可继续分组', () => {
    renderHandoff(['codex', 'gemini-cli'])
    fireEvent.keyDown(screen.getByRole('button', { name: '选择 AI 编程工具' }), { key: 'Enter' })

    expect(screen.queryByText('可继续使用')).not.toBeInTheDocument()
    expect(screen.getByText('仅配置')).toBeInTheDocument()
  })

  it('无工作区时禁用 Claude Code 交接但保留配置入口', () => {
    renderHandoff(['claude-code', 'codex'], '')
    fireEvent.keyDown(screen.getByRole('button', { name: '选择 AI 编程工具' }), { key: 'Enter' })

    expect(screen.getByRole('menuitem', { name: /Claude Code/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Codex/ })).not.toHaveAttribute('data-disabled')
  })

  it('仅配置工具可查看配置且不存在的客户端不回退 Claude Code', () => {
    renderHandoff(['codex'], '')
    fireEvent.click(screen.getByRole('button', { name: '查看 Codex 配置' }))
    expect(screen.getByRole('dialog', { name: 'Codex 配置入口' })).toBeInTheDocument()
    expect(screen.getByText('已加入当前配置方案')).toBeInTheDocument()
    expect(screen.queryByText(/^claude$/)).not.toBeInTheDocument()
  })

  it('Claude Code 与非 Claude 配置指引保持执行语义分离', () => {
    render(<MemoryRouter><AppProvider><GuideHarness /></AppProvider></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Codex 指引' }))
    expect(screen.getByRole('dialog', { name: 'Codex 配置入口' })).toBeInTheDocument()
    expect(screen.queryByText(/^claude$/)).not.toBeInTheDocument()
    expect(screen.getByText(/尚未定义经过验证的启动命令/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /中打开/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    expect(screen.getByRole('dialog', { name: '在 Claude Code 中继续' })).toBeInTheDocument()
    expect(screen.getByText("cd '/Volumes/wwx/org/bandi' && 'claude' '/bandi:bandi'")).toBeInTheDocument()
    expect(screen.getByText(/不执行 Shell/)).toBeInTheDocument()
    expect(screen.getByText(/浏览器无法直接启动本机终端/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Terminal\.app 中进入 Bandi/ })).not.toBeInTheDocument()
  })

  it('Web 环境复制完整启动命令', async () => {
    render(<MemoryRouter><AppProvider><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '复制完整启动命令' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cd '/Volumes/wwx/org/bandi' && 'claude' '/bandi:bandi'"))
    expect(screen.getByRole('button', { name: '复制完整启动命令' })).toBeInTheDocument()
  })

  it('规划协作方式时只复制一次性说明且不修改启动参数', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestLaunchWorkspace.mockResolvedValue({ kind: 'accepted', requestId: 'request-1', acceptedAt: '1' })
    renderHandoff(['claude-code'], 'bandi', true)

    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    expect(screen.getByRole('dialog', { name: '让 AI 帮我规划协作方式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制协作规划说明' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('你的场景与目标'), { target: { value: '长期协调产品、研发和运营' } })
    fireEvent.change(screen.getByLabelText('当前参与者与资源（可选）'), { target: { value: '一名负责人和两个现有 Agent' } })
    fireEvent.change(screen.getByLabelText('高频协作与重要边界（可选）'), { target: { value: '发布前必须人工验收' } })
    fireEvent.click(screen.getByRole('button', { name: '复制协作规划说明' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('场景与目标：长期协调产品、研发和运营')))
    const prompt = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] as string
    expect(prompt).toContain('先提出必要的澄清问题')
    expect(prompt).toContain('个人工作区是否已经足够')
    expect(prompt).toContain('当前参与者与资源：一名负责人和两个现有 Agent')
    expect(prompt).toContain('高频协作与重要边界：发布前必须人工验收')
    expect(prompt).toContain('在我明确确认前')

    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中进入 Bandi' }))
    await waitFor(() => expect(desktopBridge.requestLaunchWorkspace).toHaveBeenCalledWith({ requestId: 'request-1', workspaceId: 'bandi', cwd: '/Volumes/wwx/org/bandi', terminalId: 'terminal', executable: 'claude', args: [], enterBandiOnStart: true }))
    expect(JSON.stringify(desktopBridge.requestLaunchWorkspace.mock.calls[0][0])).not.toContain('长期协调')
    expect(JSON.stringify(desktopBridge.requestLaunchWorkspace.mock.calls[0][0])).not.toContain('--permission-mode')
  })

  it('关闭规划弹窗后不会保留表单内容', () => {
    renderHandoff(['claude-code'], 'bandi', true)
    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    fireEvent.change(screen.getByLabelText('你的场景与目标'), { target: { value: '临时规划内容' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    expect(screen.getByLabelText('你的场景与目标')).toHaveValue('')
  })

  it('Desktop 使用所选终端提交结构化启动请求且不声称已加载', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestLaunchWorkspace.mockResolvedValue({ kind: 'accepted', requestId: 'request-1', acceptedAt: '1' })
    render(<MemoryRouter><AppProvider><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中进入 Bandi' }))

    await waitFor(() => expect(desktopBridge.requestLaunchWorkspace).toHaveBeenCalledWith({ requestId: 'request-1', workspaceId: 'bandi', cwd: '/Volumes/wwx/org/bandi', terminalId: 'terminal', executable: 'claude', args: [], enterBandiOnStart: true }))
    expect(await screen.findByText(/不表示 Claude Code 或 Bandi 已成功加载/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('终端要求降级时使用后端返回的规范化参数生成复制命令', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestLaunchWorkspace.mockResolvedValue({ kind: 'fallback-required', requestId: 'request-1', executable: 'claude', args: ['--model', 'opus', '/bandi:bandi'], message: '请复制命令运行' })
    render(<MemoryRouter><AppProvider><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中进入 Bandi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请复制命令运行')
    fireEvent.click(screen.getByRole('button', { name: '复制完整启动命令' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cd '/Volumes/wwx/org/bandi' && 'claude' '--model' 'opus' '/bandi:bandi'"))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('启动请求被拒绝时保留弹窗并显示复制降级', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestLaunchWorkspace.mockResolvedValue({ kind: 'rejected', requestId: 'request-1', code: 'TERMINAL_OPEN_FAILED', message: '终端未安装' })
    render(<MemoryRouter><AppProvider><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中进入 Bandi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('终端未安装')
    expect(screen.getByRole('button', { name: '复制完整启动命令' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
