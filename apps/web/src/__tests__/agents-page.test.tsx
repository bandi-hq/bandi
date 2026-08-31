// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentsPage, getAgentListTarget } from '../pages/agents/agents-page'
import { AppProvider, initialState } from '../state'

function renderAgents() {
  const router = createMemoryRouter([{
    path: '/agents',
    element: <AppProvider><AgentsPage /></AppProvider>,
  }], { initialEntries: ['/agents'] })
  return render(<RouterProvider router={router} />)
}

afterEach(cleanup)

describe('Agents 列表入口', () => {
  it('每个 Agent 只提供一个统一详情入口', () => {
    renderAgents()

    const links = screen.getAllByRole('link', { name: /查看 .* Agent 详情/ })
    expect(links).toHaveLength(initialState.agents.length)
    expect(screen.queryByRole('link', { name: /编辑基本信息|Agent 配置/ })).not.toBeInTheDocument()
  })

  it('按配置状态生成最相关的详情落点', () => {
    renderAgents()

    expect(screen.getByRole('link', { name: '查看 知衡 Agent 详情' })).toHaveAttribute('href', '/agents/zhiheng')
    expect(screen.getByRole('link', { name: '查看 周策 Agent 详情，定位到外部变化' })).toHaveAttribute('href', '/agents/zhouce?tab=package&path=instructions.md&view=preview')
    expect(screen.getByRole('link', { name: '查看 林序 Agent 详情，定位到缺少 Rules' })).toHaveAttribute('href', '/agents/linxu?tab=rules')
  })

  it('外部变化缺少对应文件时安全降级到 AgentPackage', () => {
    const agent = initialState.agents.find((item) => item.id === 'zhouce')!
    expect(getAgentListTarget({
      ...agent,
      files: agent.files.map((file) => ({ ...file, status: '已索引' })),
    })).toBe('/agents/zhouce?tab=package')
  })
})
