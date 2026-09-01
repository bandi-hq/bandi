// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiClientHandoffAction } from '../components/ai-clients'
import { GlobalSheets } from '../sheets'
import { AppProvider, initialState, useApp, type State } from '../state'

const desktopBridge = vi.hoisted(() => ({ desktop: false, requestClientHandoff: vi.fn() }))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => desktopBridge.desktop,
  listManagedAgents: () => Promise.resolve([]),
  loadOrganizationSnapshot: () => Promise.resolve({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [], serviceGrants: [] }),
  requestClientHandoff: desktopBridge.requestClientHandoff,
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

const result = (status: 'supported' | 'degraded' | 'unavailable' | 'not_checked', outcome: 'accepted' | 'manual_required' | 'rejected' | 'not_attempted') => ({
  clientId: 'claude-code', adapterId: 'claude-code-terminal-v1', workspaceId: 'bandi', terminalId: 'terminal', intent: 'continue_workspace',
  capability: { status, reason: `${status} 原因`, evidence: ['合同测试'], remediation: ['复制路径后手动继续'] }, outcome,
})

beforeEach(() => {
  desktopBridge.desktop = false
  desktopBridge.requestClientHandoff.mockReset()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AI 编程工具界面', () => {
  it('按当前方案工具数量展示添加、直接进入或选择入口', () => {
    const empty = renderHandoff([])
    expect(screen.getByRole('button', { name: '选择要管理的 AI 编程工具' })).toBeInTheDocument()
    empty.unmount()
    const single = renderHandoff(['claude-code'])
    expect(screen.getByRole('button', { name: '在 Claude Code 中继续' })).toBeInTheDocument()
    single.unmount()
    renderHandoff(['claude-code', 'codex'])
    fireEvent.keyDown(screen.getByRole('button', { name: '选择 AI 编程工具' }), { key: 'Enter' })
    expect(screen.getByText('可继续使用')).toBeInTheDocument()
    expect(screen.queryByText('仅配置')).not.toBeInTheDocument()
  })

  it('无工作区时禁用所有已验证的目录交接入口', () => {
    renderHandoff(['claude-code', 'codex'], '')
    fireEvent.keyDown(screen.getByRole('button', { name: '选择 AI 编程工具' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: /Claude Code/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Codex/ })).toHaveAttribute('data-disabled')
  })

  it('Codex 与 Claude Code 共用安全目录交接且不生成命令', () => {
    render(<MemoryRouter><AppProvider initialState={initialState}><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Codex 指引' }))
    expect(screen.getByRole('dialog', { name: '在 Codex 中继续' })).toBeInTheDocument()
    expect(screen.getByText(/Bandi 不生成、执行或回传命令/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    expect(screen.getByText(/Bandi 不生成、执行或回传命令/)).toBeInTheDocument()
    expect(screen.queryByText(/cd '/)).not.toBeInTheDocument()
  })

  it('Web 环境只复制工作目录', async () => {
    render(<MemoryRouter><AppProvider initialState={initialState}><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    const copy = screen.getByRole('button', { name: '复制工作目录' })
    fireEvent.click(copy)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/Volumes/wwx/org/bandi')
  })

  it('规划说明不进入五字段交接请求', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestClientHandoff.mockResolvedValue(result('supported', 'accepted'))
    renderHandoff(['claude-code'], 'bandi', true)
    fireEvent.click(screen.getByRole('button', { name: '让 AI 帮我规划协作方式' }))
    fireEvent.change(screen.getByLabelText('你的场景与目标'), { target: { value: '长期协调产品、研发和运营' } })
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中打开目录' }))
    await waitFor(() => expect(desktopBridge.requestClientHandoff).toHaveBeenCalledWith({ clientId: 'claude-code', adapterId: 'claude-code-terminal-v1', workspaceId: 'bandi', terminalId: 'terminal', intent: 'continue_workspace' }))
    expect(JSON.stringify(desktopBridge.requestClientHandoff.mock.calls[0][0])).not.toContain('长期协调')
  })

  it('accepted 只说明目录打开请求已接受', async () => {
    desktopBridge.desktop = true
    desktopBridge.requestClientHandoff.mockResolvedValue(result('supported', 'accepted'))
    render(<MemoryRouter><AppProvider initialState={initialState}><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中打开目录' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已向系统请求打开工作区目录')
    expect(screen.getByRole('status')).toHaveTextContent('是否成功打开取决于系统设置')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['degraded', 'manual_required'],
    ['unavailable', 'rejected'],
    ['not_checked', 'not_attempted'],
  ] as const)('%s 结果保留弹窗并提供路径降级', async (status, outcome) => {
    desktopBridge.desktop = true
    desktopBridge.requestClientHandoff.mockResolvedValue(result(status, outcome))
    render(<MemoryRouter><AppProvider initialState={initialState}><GuideHarness /></AppProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 指引' }))
    fireEvent.click(screen.getByRole('button', { name: '在 Terminal.app 中打开目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`${status} 原因`)
    expect(screen.getByRole('button', { name: '复制工作目录' })).toBeInTheDocument()
  })
})
