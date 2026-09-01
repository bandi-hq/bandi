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
}))

vi.mock('../desktop-bridge', () => ({
  isDesktopRuntime: () => true,
  listManagedAgents: desktopBridge.listManagedAgents,
  loadOrganizationSnapshot: desktopBridge.loadOrganizationSnapshot,
}))

function SnapshotProbe() {
  const { state } = useApp()
  return <>
    <span data-testid="companies">{state.companies.map((item) => item.name).join(',')}</span>
    <span data-testid="agents">{state.agents.map((item) => `${item.name}:${item.serviceGrants.length}`).join(',')}</span>
    <span data-testid="workspaces">{state.workspaces.map((item) => item.name).join(',')}</span>
    <span data-testid="hydration">{state.hydration.managedAgents},{state.hydration.organization}</span>
    <span data-testid="onboarding">{state.onboarding.status}</span>
    {state.notice && <span role="alert">{state.notice.title}：{state.notice.description}</span>}
  </>
}

beforeEach(() => {
  desktopBridge.listManagedAgents.mockReset()
  desktopBridge.loadOrganizationSnapshot.mockReset()
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
    desktopBridge.listManagedAgents.mockResolvedValue([agent])
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
    expect(screen.getByTestId('onboarding')).toHaveTextContent('active')
  })

  it('受管 Agent discovery 是 authoritative replace，不保留旧 Agent', async () => {
    desktopBridge.listManagedAgents.mockResolvedValue([])
    desktopBridge.loadOrganizationSnapshot.mockResolvedValue({ schemaVersion: 1, companies: [], departments: [], roles: [], workspaces: [], serviceGrants: [] })

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    await vi.waitFor(() => expect(screen.getByTestId('hydration')).toHaveTextContent('succeeded,succeeded'))
    expect(screen.getByTestId('agents')).toBeEmptyDOMElement()
  })

  it('Organization 失败不阻断 Agent 成功事实', async () => {
    desktopBridge.listManagedAgents.mockResolvedValue([{ ...initialAgents[0], id: 'real-agent', name: '真实 Agent', serviceGrants: [] }])
    desktopBridge.loadOrganizationSnapshot.mockRejectedValue(new Error('organization unavailable'))

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(await screen.findByTestId('agents')).toHaveTextContent('真实 Agent:0')
    expect(screen.getByTestId('hydration')).toHaveTextContent('succeeded,failed')
    expect(screen.getByRole('alert')).toHaveTextContent('无法恢复本机组织配置事实：organization unavailable')
  })

  it('Agent 失败不阻断 Organization 成功事实，并由真实 Workspace 完成 onboarding', async () => {
    desktopBridge.listManagedAgents.mockRejectedValue(new Error('agent root unavailable'))
    desktopBridge.loadOrganizationSnapshot.mockResolvedValue({
      schemaVersion: 1,
      companies: [], departments: [], roles: [], serviceGrants: [],
      workspaces: [{ ...initialWorkspaces[0], id: 'real-workspace', name: '真实工作区', path: '/real' }],
    })

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(await screen.findByTestId('workspaces')).toHaveTextContent('真实工作区')
    expect(screen.getByTestId('hydration')).toHaveTextContent('failed,succeeded')
    expect(screen.getByTestId('onboarding')).toHaveTextContent('completed')
  })

  it('恢复失败时展示诊断且不伪报成功', async () => {
    desktopBridge.listManagedAgents.mockResolvedValue([])
    desktopBridge.loadOrganizationSnapshot.mockRejectedValue(new Error('database migration failed'))

    render(<AppProvider><SnapshotProbe /></AppProvider>)

    expect(await screen.findByRole('alert')).toHaveTextContent('无法恢复本机组织配置事实：database migration failed')
  })
})
