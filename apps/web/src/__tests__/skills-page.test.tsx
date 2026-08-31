// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsPage } from '../pages/assets/skills-page'
import { AppProvider } from '../state'

const NativeRequest = globalThis.Request

beforeEach(() => {
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, { ...init, signal: undefined })
    }
  })
})

function renderSkills(initialEntry = '/assets/skills') {
  const router = createMemoryRouter([{
    path: '/assets/skills',
    element: <AppProvider><SkillsPage /></AppProvider>,
  }], { initialEntries: [initialEntry] })
  return { router, ...render(<RouterProvider router={router} />) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Skills 视图 Tab', () => {
  it('默认浏览全部 Skill，并通过键盘循环切换视图', async () => {
    renderSkills()
    const browse = screen.getByRole('tab', { name: '浏览' })
    const installed = screen.getByRole('tab', { name: '已安装' })
    const updates = screen.getByRole('tab', { name: '可更新' })

    expect(browse).toHaveAttribute('aria-selected', 'true')
    expect(browse).toHaveAttribute('aria-controls', 'skills-view-panel-browse')
    expect(screen.getByRole('tabpanel', { name: '浏览' })).toBeInTheDocument()
    expect(screen.getByText('文档整理')).toBeInTheDocument()

    fireEvent.keyDown(browse, { key: 'ArrowLeft' })
    await waitFor(() => expect(updates).toHaveFocus())
    await waitFor(() => expect(updates).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByText('发布检查')).toBeInTheDocument()
    expect(screen.queryByText('代码审查')).not.toBeInTheDocument()

    fireEvent.keyDown(updates, { key: 'Home' })
    await waitFor(() => expect(browse).toHaveFocus())
    expect(browse).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(browse, { key: 'End' })
    await waitFor(() => expect(updates).toHaveFocus())
    fireEvent.keyDown(updates, { key: 'ArrowRight' })
    await waitFor(() => expect(browse).toHaveFocus())
    expect(installed).toHaveAttribute('tabindex', '-1')
  })

  it('非法视图回退浏览，并保留搜索与来源筛选', () => {
    renderSkills('/assets/skills?view=unknown&q=发布&source=git')

    expect(screen.getByRole('tab', { name: '浏览' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: '搜索 Skills' })).toHaveValue('发布')
    expect(screen.getByRole('combobox', { name: 'Skill 来源' })).toHaveValue('git')
    expect(screen.getByText('发布检查')).toBeInTheDocument()
  })
})
