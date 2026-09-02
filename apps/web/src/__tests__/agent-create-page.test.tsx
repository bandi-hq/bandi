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
  importClaudeAgent: vi.fn(),
  previewClaudeAgent: vi.fn(),
  registerExternalAgent: vi.fn(),
  selectClaudeAgentFile: vi.fn(),
  selectDirectory: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  commitManagedAgentCreation: bridge.commitManagedAgentCreation,
  importClaudeAgent: bridge.importClaudeAgent,
  isDesktopRuntime: () => bridge.desktop,
  previewClaudeAgent: bridge.previewClaudeAgent,
  registerExternalAgent: bridge.registerExternalAgent,
  selectClaudeAgentFile: bridge.selectClaudeAgentFile,
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
  bridge.importClaudeAgent.mockReset()
  bridge.previewClaudeAgent.mockReset()
  bridge.registerExternalAgent.mockReset()
  bridge.selectClaudeAgentFile.mockReset()
  bridge.selectDirectory.mockReset()
  bridge.selectClaudeAgentFile.mockResolvedValue('/tmp/.claude/agents/reviewer.md')
  bridge.previewClaudeAgent.mockResolvedValue({ sourcePath: '/tmp/.claude/agents/reviewer.md', sourceBaselineHash: 'sha256:source', name: 'Reviewer', description: 'Reviews code', instructions: 'Review carefully.', recognizedFields: ['name', 'description'], ignoredFields: [] })
  bridge.selectDirectory.mockResolvedValue('/tmp/external-agent')
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
  ], { initialEntries: [initialEntry] })
  return {
    router,
    ...render(<AppProvider initialState={state}><RouterProvider router={router} /></AppProvider>),
  }
}

function managedResult(agent: State['agents'][number], status = 'completed') {
  return {
    operation: { id: 'operation-fixed', agentId: agent.id, operationKind: 'create', status, createdAt: '2026-09-02T00:00:00Z' },
    agent,
  }
}

function enterName(name = '阿策') {
  fireEvent.change(screen.getByRole('textbox', { name: /Agent 名称/ }), { target: { value: name } })
}

function associateOrganization() {
  fireEvent.click(screen.getByRole('checkbox', { name: /关联组织/ }))
  fireEvent.change(screen.getByRole('combobox', { name: /所属公司/ }), { target: { value: 'xinghe' } })
  fireEvent.change(screen.getByRole('combobox', { name: /所属部门/ }), { target: { value: 'dev' } })
  fireEvent.change(screen.getByRole('combobox', { name: /岗位/ }), { target: { value: 'role-web-engineer' } })
}

describe('Agent 创建页', () => {
  it('普通创建默认只展示最小表单，不默认关联组织', () => {
    bridge.desktop = true
    renderPage()

    expect(screen.getByText(/创建并管理一个长期 Agent 配置/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Agent 名称/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /关联组织/ })).not.toBeChecked()
    expect(screen.queryByRole('combobox', { name: '所属公司' })).not.toBeInTheDocument()
    expect(screen.queryByText('1 身份与组织')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '继续' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建 Agent' })).toBeInTheDocument()
  })

  it('空名称显示内联错误并聚焦名称字段', () => {
    bridge.desktop = true
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(screen.getByText('请输入 Agent 名称。')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Agent 名称/ })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: /Agent 名称/ })).toHaveAttribute('aria-invalid', 'true')
    expect(bridge.commitManagedAgentCreation).not.toHaveBeenCalled()
  })

  it('拒绝低质量名称，并在创建时裁剪首尾空白', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent))
    renderPage()
    const input = screen.getByRole('textbox', { name: /Agent 名称/ })

    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))
    expect(screen.getByText('名称不能全部是数字。')).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(bridge.commitManagedAgentCreation).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  阿策  ' } })
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))
    await waitFor(() => expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1))
    expect(bridge.commitManagedAgentCreation.mock.calls[0][1].name).toBe('阿策')
  })

  it('仅填写名称即可创建无组织 Agent，并保持安全默认', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent))
    const { router } = renderPage()
    enterName()

    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1))
    const [requestId, agent, files, grants] = bridge.commitManagedAgentCreation.mock.calls[0]
    expect(requestId).toBe('create-agent-agent-fixed-agent-id')
    expect(agent).toMatchObject({
      id: 'agent-fixed-agent-id',
      name: '阿策',
      mission: '',
      responsibilities: [],
      deliverables: [],
      decisionBoundaries: [],
      escalationConditions: [],
      prohibitions: [],
      completionDefinition: [],
      permissions: { files: '未授予', commands: '未授予', network: '未授予', delegation: '未授予' },
      serviceGrants: [],
    })
    expect(agent.companyId).toBeUndefined()
    expect(agent.primaryDepartmentId).toBeUndefined()
    expect(agent.roleId).toBeUndefined()
    expect(grants).toEqual([])
    expect(files.map((file: { path: string }) => file.path).sort()).toEqual([
      'agent.yaml', 'config/commands.yaml', 'config/context.yaml', 'config/hooks.yaml', 'config/mcp.yaml',
      'config/orchestration.yaml', 'config/permissions.yaml', 'config/rules.yaml', 'config/skills.yaml',
      'config/sop.yaml', 'instructions.md',
    ])
    await waitFor(() => expect(router.state.location.pathname).toBe('/agents/agent-fixed-agent-id'))
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('Agent 已创建')).toBeInTheDocument()
    expect(screen.getByText(/任务使用与执行仍在 Claude Code 中完成/)).toBeInTheDocument()
  })

  it('关联组织时要求完整三字段，关闭后清除隐藏值', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent))
    renderPage()
    enterName()
    fireEvent.click(screen.getByRole('checkbox', { name: /关联组织/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))
    expect(screen.getByText('请选择所属公司。')).toBeInTheDocument()
    expect(bridge.commitManagedAgentCreation).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('combobox', { name: /所属公司/ }), { target: { value: 'xinghe' } })
    fireEvent.change(screen.getByRole('combobox', { name: /所属部门/ }), { target: { value: 'dev' } })
    fireEvent.change(screen.getByRole('combobox', { name: /岗位/ }), { target: { value: 'role-web-engineer' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /关联组织/ }))
    expect(screen.queryByRole('combobox', { name: '所属公司' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1))
    const agent = bridge.commitManagedAgentCreation.mock.calls[0][1]
    expect(agent.companyId).toBeUndefined()
    expect(agent.primaryDepartmentId).toBeUndefined()
    expect(agent.roleId).toBeUndefined()
  })

  it('部门深链接自动展开组织区并预填公司和部门', () => {
    renderPage(initialState, '/agents/new?department=dev')

    expect(screen.getByRole('checkbox', { name: /关联组织/ })).toBeChecked()
    expect(screen.getByRole('combobox', { name: /所属公司/ })).toHaveValue('xinghe')
    expect(screen.getByRole('combobox', { name: /所属部门/ })).toHaveValue('dev')
    expect(screen.getByRole('combobox', { name: /岗位/ })).toHaveValue('')
  })

  it('工作区深链接明确展示绑定或失效状态', () => {
    const validWorkspace = initialState.workspaces[0]
    const { unmount } = renderPage(initialState, `/agents/new?workspace=${validWorkspace.id}`)
    expect(screen.getByText((_, element) => element?.textContent === `将关联到工作区：${validWorkspace.name}`)).toBeInTheDocument()
    unmount()

    renderPage(initialState, '/agents/new?workspace=missing')
    expect(screen.getByRole('alert')).toHaveTextContent('预选工作区已不存在，没有使用其他工作区替代。')
  })

  it('导入模式保留三步流程和来源安全语义', async () => {
    bridge.desktop = true
    bridge.importClaudeAgent.mockImplementation(async (_path, _hash, _requestId, agent) => managedResult(agent))
    const { router } = renderPage(initialState, '/agents/new?mode=import')

    expect(screen.getByText('1 身份与组织')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '选择 .md 文件' }))
    expect(await screen.findByText('Reviews code')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.click(screen.getByRole('button', { name: '导入受管副本' }))

    await waitFor(() => expect(bridge.importClaudeAgent).toHaveBeenCalledWith('/tmp/.claude/agents/reviewer.md', 'sha256:source', 'import-agent-agent-fixed-agent-id', expect.objectContaining({ id: 'agent-fixed-agent-id', instructions: 'Review carefully.' }), expect.any(Array), []))
    await waitFor(() => expect(router.state.location.pathname).toBe('/agents/agent-fixed-agent-id'))
  })

  it('导入名称不合格时允许就地修正后继续', async () => {
    bridge.desktop = true
    bridge.previewClaudeAgent.mockResolvedValue({ sourcePath: '/tmp/.claude/agents/reviewer.md', sourceBaselineHash: 'sha256:source', name: '123456', description: 'Reviews code', instructions: 'Review carefully.', recognizedFields: ['name'], ignoredFields: [] })
    renderPage(initialState, '/agents/new?mode=import')

    fireEvent.click(screen.getByRole('button', { name: '选择 .md 文件' }))
    const input = await screen.findByRole('textbox', { name: /Agent 名称/ })
    expect(input).toHaveValue('123456')
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByText('名称不能全部是数字。')).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(screen.getByText('1 身份与组织')).toHaveClass('text-foreground')

    fireEvent.change(input, { target: { value: '代码审查员' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByText('2 职责与边界')).toHaveClass('text-foreground')
  })

  it('半成功状态保留草稿并引导到全局恢复', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent, 'organization_pending'))
    renderPage()
    enterName()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent 配置尚未完整保存，可从首页待处理项继续修复')
    expect(screen.getByRole('textbox', { name: /Agent 名称/ })).toHaveValue('阿策')
    expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1)
  })

  it('完整组织创建只提交同作用域的三字段', async () => {
    bridge.desktop = true
    bridge.commitManagedAgentCreation.mockImplementation(async (_requestId, agent) => managedResult(agent))
    renderPage()
    enterName()
    associateOrganization()
    fireEvent.click(screen.getByRole('button', { name: '创建 Agent' }))

    await waitFor(() => expect(bridge.commitManagedAgentCreation).toHaveBeenCalledTimes(1))
    expect(bridge.commitManagedAgentCreation.mock.calls[0][1]).toMatchObject({ companyId: 'xinghe', primaryDepartmentId: 'dev', roleId: 'role-web-engineer' })
  })
})
