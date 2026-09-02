// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../state'
import type { OrganizationSnapshot } from '../contracts'
import { initialAgents, initialWorkspaces } from '../domain'

const desktopBridge = vi.hoisted(() => ({
  listManagedAgents: vi.fn(),
  loadOrganizationSnapshot: vi.fn(),
  loadToolConfiguration: vi.fn(),
  listAgentRecoveryOperations: vi.fn(),
}))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => true,
  listAgents: desktopBridge.listManagedAgents,
  listManagedAgents: desktopBridge.listManagedAgents,
  loadOrganizationSnapshot: desktopBridge.loadOrganizationSnapshot,
  loadToolConfiguration: desktopBridge.loadToolConfiguration,
  listAgentRecoveryOperations: desktopBridge.listAgentRecoveryOperations,
}))

function SnapshotProbe() {
  const { state } = useApp()
  return <>
    <span data-testid="companies">{state.companies.map((item) => item.name).join(',')}</span>
    <span data-testid="agents">{state.agents.map((item) => `${item.name}:${item.serviceGrants.length}`).join(',')}</span>
    <span data-testid="workspaces">{state.workspaces.map((item) => item.name).join(',')}</span>
    <span data-testid="hydration">{state.hydration.managedAgents},{state.hydration.organization}</span>
    <span data-testid="hydration-errors">{Object.entries(state.hydrationErrors).map(([key, value]) => `${key}:${value}`).join('|')}</span>
    <span data-testid="onboarding">{state.onboarding.status}</span>
    {state.notice && <span role="alert">{state.notice.title}：{state.notice.description}</span>}
  </>
}

beforeEach(() => {
  desktopBridge.listManagedAgents.mockReset()
  desktopBridge.loadOrganizationSnapshot.mockReset()
  desktopBridge.loadToolConfiguration.mockReset().mockResolvedValue({ revision: 0, selectedPlanId: 'default', builtInToolIds: [], plans: [{ id: 'default', name: '默认方案', toolIds: [] }], customTools: [] })
  desktopBridge.listAgentRecoveryOperations.mockReset()
  desktopBridge.listAgentRecoveryOperations.mockResolvedValue([])
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Desktop 组织事实恢复', () => {
  it('用 AgentPackage discovery 与 Organization Snapshot 替换演示事实', async () => {
    const agent = {
      ...initialAgents[0],
      id: 'persisted-agent',
      name: '持久化 Agent',
      serviceGrants: [],
    }
    const snapshot: OrganizationSnapshot = {
      schemaVersion: 1,
      companies: [{ id: 'persisted-company', name: '持久化公司', mission: '真实使命', boundary: '真实边界', departmentIds: [], workspaceIds: [], sharedAssetIds: [] }],
      departments: [],
      roles: [],
      workspaces: [],
      serviceGrants: [{ agentId: agent.id, id: 'grant-1', departmentId: 'department-1', capabilities: ['配置审查'], workspaceIds: [], prohibitions: ['不得扩大权限'], status: '有效' }],
    }
    desktopBridge.listManagedAgents.mockResolvedValue({ agents: [agent], diagnostics: [] })
    desktopBridge.loadOrganizationSnapshot.mockResolvedValue(snapshot)

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(screen.getByTestId('companies')).toBeEmptyDOMElement()
    expect(screen.getByTestId('agents')).toBeEmptyDOMElement()
    expect(screen.getByTestId('hydration')).toHaveTextContent('loading,loading')
    expect(await screen.findByTestId('companies')).toHaveTextContent('持久化公司')
    expect(screen.getByTestId('companies')).not.toHaveTextContent('星河科技')
    expect(screen.getByTestId('agents')).toHaveTextContent('持久化 Agent:1')
    expect(screen.getByTestId('workspaces')).toBeEmptyDOMElement()
    expect(screen.getByTestId('hydration')).toHaveTextContent('succeeded,succeeded')
    expect(screen.getByTestId('onboarding')).toHaveTextContent('completed')
  })

  it('受管 Agent discovery 是 authoritative replace，不保留旧 Agent', async () => {
    desktopBridge.listManagedAgents.mockResolvedValue({ agents: [], diagnostics: [] })
    desktopBridge.loadOrganizationSnapshot.mockResolvedValue({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [], serviceGrants: [] })

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    await vi.waitFor(() => expect(screen.getByTestId('hydration')).toHaveTextContent('succeeded,succeeded'))
    expect(screen.getByTestId('agents')).toBeEmptyDOMElement()
  })

  it('Organization 失败不阻断 Agent 成功事实', async () => {
    desktopBridge.listManagedAgents.mockResolvedValue({ agents: [{ ...initialAgents[0], id: 'real-agent', name: '真实 Agent', serviceGrants: [] }], diagnostics: [] })
    desktopBridge.loadOrganizationSnapshot.mockRejectedValue(new Error('organization unavailable'))

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(await screen.findByTestId('agents')).toHaveTextContent('真实 Agent:0')
    expect(screen.getByTestId('hydration')).toHaveTextContent('succeeded,failed')
    expect(screen.getByTestId('hydration-errors')).toHaveTextContent('organization:organization unavailable')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Agent 失败不阻断 Organization 成功事实，但不会由 Workspace 伪装完成 onboarding', async () => {
    desktopBridge.listManagedAgents.mockRejectedValue(new Error('agent root unavailable'))
    desktopBridge.loadOrganizationSnapshot.mockResolvedValue({
      schemaVersion: 1,
      companies: [], departments: [], roles: [], serviceGrants: [],
      workspaces: [{ ...initialWorkspaces[0], id: 'real-workspace', name: '真实工作区', path: '/real' }],
    })

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(await screen.findByTestId('workspaces')).toHaveTextContent('真实工作区')
    expect(screen.getByTestId('hydration')).toHaveTextContent('failed,succeeded')
    expect(screen.getByTestId('onboarding')).toHaveTextContent('active')
  })

  it('并发失败分别保留诊断且不写入瞬时 notice', async () => {
    desktopBridge.listManagedAgents.mockRejectedValue(new Error('agent root unavailable'))
    desktopBridge.loadOrganizationSnapshot.mockRejectedValue(new Error('database migration failed'))
    desktopBridge.listAgentRecoveryOperations.mockRejectedValue(new Error('recovery unavailable'))

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    await vi.waitFor(() => expect(screen.getByTestId('hydration-errors')).toHaveTextContent('managedAgents:agent root unavailable'))
    expect(screen.getByTestId('hydration-errors')).toHaveTextContent('organization:database migration failed')
    expect(screen.getByTestId('hydration-errors')).toHaveTextContent('agentRecovery:recovery unavailable')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
