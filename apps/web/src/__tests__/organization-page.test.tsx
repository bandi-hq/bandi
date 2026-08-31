// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LegacyDepartmentRedirect, OrganizationPage } from '../pages/organization/organization-pages'
import { GlobalSheets } from '../sheets'
import { AppProvider, initialState } from '../state'

const NativeRequest = globalThis.Request

beforeEach(() => {
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderOrganization(initialEntry = '/organization', state = initialState) {
  const router = createMemoryRouter([{
    path: '/',
    element: <AppProvider initialState={state}><Outlet /><GlobalSheets /></AppProvider>,
    children: [
      { path: 'organization', element: <OrganizationPage /> },
      { path: 'organization/departments/:id', element: <LegacyDepartmentRedirect /> },
    ],
  }], { initialEntries: [initialEntry] })
  return { router, ...render(<RouterProvider router={router} />) }
}

const rootWithChildren = initialState.departments.find((department) => initialState.departments.some((item) => item.parentDepartmentId === department.id))!
const child = initialState.departments.find((department) => department.parentDepartmentId === rootWithChildren.id)!

describe('组织页', () => {
  it('独立展开和折叠部门，不改变右侧 Company 概览', () => {
    renderOrganization(`/organization?company=${rootWithChildren.companyId}`)

    const toggle = screen.getByRole('button', { name: `收起${rootWithChildren.name}` })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: child.name })).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: child.name })).not.toBeInTheDocument()
    expect(screen.getByText(initialState.companies.find((company) => company.id === rootWithChildren.companyId)!.mission)).toBeInTheDocument()
  })

  it('在同一组织页选择部门并展示详情', async () => {
    const { router } = renderOrganization(`/organization?company=${rootWithChildren.companyId}`)

    fireEvent.click(screen.getByRole('button', { name: child.name }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/organization'))
    expect(router.state.location.search).toContain(`company=${child.companyId}`)
    expect(router.state.location.search).toContain(`department=${child.id}`)
    expect(screen.getByRole('button', { name: child.name })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: child.name })).toBeInTheDocument()
    expect(screen.getByText(child.mission)).toBeInTheDocument()
    expect(screen.getByText('部门职责')).toBeInTheDocument()
    expect(screen.getByText('岗位设置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加岗位' })).toBeInTheDocument()
    expect(screen.getByText('部门成员')).toBeInTheDocument()
    expect(screen.getByText('服务授权')).toBeInTheDocument()
    expect(screen.getByLabelText('共 0 项服务授权')).toBeInTheDocument()
    expect(screen.queryByText('显式服务授权')).not.toBeInTheDocument()
    expect(screen.queryByText('有效')).not.toBeInTheDocument()
  })

  it('公司概览使用统一的中文实体术语', () => {
    renderOrganization(`/organization?company=${rootWithChildren.companyId}`)

    expect(screen.getByText('公司')).toBeInTheDocument()
    expect(screen.getByText('工作区')).toBeInTheDocument()
    expect(screen.queryByText('Company')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspaces')).not.toBeInTheDocument()
  })

  it('编辑部门时只读展示所属公司', () => {
    renderOrganization(`/organization?company=${child.companyId}&department=${child.id}`)

    fireEvent.click(screen.getByRole('button', { name: '编辑部门' }))

    const dialog = screen.getByRole('dialog', { name: '编辑部门' })
    expect(within(dialog).getByText('所属公司')).toBeInTheDocument()
    expect(within(dialog).getByText(initialState.companies.find((company) => company.id === child.companyId)!.name)).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: '所属公司' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Company')).not.toBeInTheDocument()
  })

  it('深链接自动显示所选部门并展开祖先', () => {
    renderOrganization(`/organization?company=${child.companyId}&department=${child.id}`)

    expect(screen.getByRole('button', { name: `收起${rootWithChildren.name}` })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: child.name })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: child.name })).toBeInTheDocument()
  })

  it('成员较多时显示摘要，并可在全部成员中搜索', () => {
    const baseAgent = initialState.agents[0]
    const agents = Array.from({ length: 7 }, (_, index) => ({
      ...baseAgent,
      id: `member-${index + 1}`,
      name: index === 6 ? '特别成员' : `成员 ${index + 1}`,
    }))
    const state = {
      ...initialState,
      agents,
      departments: initialState.departments.map((department) => department.id === child.id
        ? { ...department, memberAgentIds: agents.map((agent) => agent.id) }
        : department),
    }

    renderOrganization(`/organization?company=${child.companyId}&department=${child.id}`, state)

    expect(screen.getByLabelText('共 7 位成员')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看全部 7 位成员' })).toBeInTheDocument()
    expect(screen.queryByText('特别成员')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看全部 7 位成员' }))
    const dialog = screen.getByRole('dialog', { name: `${child.name}成员` })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '搜索成员' }), { target: { value: '特别' } })
    expect(within(dialog).getByText('特别成员')).toBeInTheDocument()
    expect(within(dialog).queryByText('成员 1')).not.toBeInTheDocument()
  })

  it('用清晰中文展示部门项目记忆及关联 Workspace', () => {
    const department = initialState.departments.find((item) => item.id === 'dev')!
    renderOrganization(`/organization?company=${department.companyId}&department=${department.id}`)

    expect(screen.getByText('部门项目记忆')).toBeInTheDocument()
    expect(screen.getByText('按工作区沉淀的长期约定与项目经验。')).toBeInTheDocument()
    expect(screen.getByText('第 7 版')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看 Bandi 的部门项目记忆，第 7 版' })).toHaveAttribute('href', '/workspaces/bandi?tab=memory')
    expect(screen.queryByText('Department × Workspace Memory')).not.toBeInTheDocument()
  })

  it('切换 Company 后清除旧部门选择', async () => {
    const otherCompany = initialState.companies.find((company) => company.id !== child.companyId)!
    const { router } = renderOrganization(`/organization?company=${child.companyId}&department=${child.id}`)

    fireEvent.change(screen.getByLabelText('当前公司'), { target: { value: otherCompany.id } })

    await vi.waitFor(() => expect(router.state.location.search).toBe(`?company=${otherCompany.id}`))
    expect(screen.getByText(otherCompany.mission)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: child.name })).not.toBeInTheDocument()
  })

  it('忽略无效部门并兼容旧部门链接', async () => {
    const company = initialState.companies.find((item) => item.id === child.companyId)!
    const invalid = renderOrganization(`/organization?company=${company.id}&department=missing`)
    expect(screen.getByText(company.mission)).toBeInTheDocument()
    invalid.unmount()

    const legacy = renderOrganization(`/organization/departments/${child.id}`)
    await vi.waitFor(() => expect(legacy.router.state.location.pathname).toBe('/organization'))
    expect(legacy.router.state.location.search).toBe(`?company=${child.companyId}&department=${child.id}`)
    expect(screen.getByRole('heading', { name: child.name })).toBeInTheDocument()
  })
})
