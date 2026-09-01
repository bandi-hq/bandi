// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { Shell } from '../shell'
import { EditorSessionProvider } from '../editor-session'
import { AppProvider, initialState, type State } from '../state'
import type { MainMenuLayoutPreference } from '../navigation-layout'

type MediaListener = (event: MediaQueryListEvent) => void

function createMatchMedia(initialWidth: number) {
  let width = initialWidth
  const queries = new Map<string, { listeners: Set<MediaListener>; query: MediaQueryList }>()
  const matches = (media: string) => width >= Number(media.match(/\d+/)?.[0] ?? 0)

  vi.stubGlobal('matchMedia', vi.fn((media: string) => {
    const existing = queries.get(media)
    if (existing) return existing.query
    const listeners = new Set<MediaListener>()
    const query = {
      get matches() { return matches(media) },
      media,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as MediaListener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as MediaListener),
      addListener: (listener: MediaListener) => listeners.add(listener),
      removeListener: (listener: MediaListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as MediaQueryList
    queries.set(media, { listeners, query })
    return query
  }))

  return {
    resize(nextWidth: number) {
      width = nextWidth
      queries.forEach(({ listeners }, media) => {
        const event = { matches: matches(media), media } as MediaQueryListEvent
        listeners.forEach((listener) => listener(event))
      })
    },
  }
}

function renderShell(
  preference: MainMenuLayoutPreference,
  theme: State['theme'] = 'light',
  initialEntry = '/',
  recentAgentIds: string[] = [],
) {
  const state: State = {
    ...initialState,
    theme,
    onboarding: { status: 'completed' },
    mainMenuLayoutPreference: preference,
    uiPreferences: { ...initialState.uiPreferences, mainMenuLayout: preference },
    recentAgentIds,
  }
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppProvider initialState={state}>
        <EditorSessionProvider>
          <Routes>
            <Route path="/" element={<Shell />}>
              <Route index element={<div>概览内容</div>} />
              <Route path="agents" element={<div>Agents 内容<Link to="/agents/zhouce">进入周策</Link></div>} />
              <Route path="agents/:id" element={<div>Agent 详情</div>} />
              <Route path="organization" element={<div>组织内容</div>} />
              <Route path="workspaces" element={<div>工作区内容</div>} />
              <Route path="assets" element={<div>资产内容</div>} />
              <Route path="settings" element={<div>设置内容</div>} />
            </Route>
          </Routes>
        </EditorSessionProvider>
      </AppProvider>
    </MemoryRouter>,
  )
}

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('应用壳导航布局', () => {
  it.each(['light', 'dark'] as const)('%s 主题显示对应品牌标识', (theme) => {
    createMatchMedia(1440)
    renderShell('expanded', theme)

    const rail = screen.getByLabelText('Bandi 配置管理')
    expect(rail.querySelector('[data-brand-variant]')).toHaveAttribute('data-brand-variant', theme)
  })

  it('一级配置入口始终位于 Rail，无最近访问记录时隐藏上下文栏', () => {
    createMatchMedia(1440)
    const { container } = renderShell('expanded')
    const rail = screen.getByLabelText('Bandi 配置管理')

    for (const name of ['Agent', '组织', '工作区', '资产', '设置']) {
      expect(within(rail).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(rail).getByRole('link', { name: /概览/ })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: '切换暗色' })).toBeInTheDocument()
    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'hidden')
    expect(screen.queryByLabelText('最近访问')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开主菜单' })).not.toBeInTheDocument()
  })

  it.each([
    ['follow-window', 1280, 'expanded'],
    ['follow-window', 1279, 'compact'],
    ['expanded', 960, 'expanded'],
    ['expanded', 959, 'compact'],
    ['compact', 1440, 'compact'],
  ] as const)('%s 在 %spx 使用 %s Agent 栏', (preference, width, expected) => {
    createMatchMedia(width)
    const { container } = renderShell(preference, 'light', '/', ['zhouce'])

    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', expected)
    expect(screen.getByRole('complementary', { name: '最近访问' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看全部 Agent' })).not.toBeInTheDocument()
    if (expected === 'expanded') {
      expect(screen.getByText('最近访问')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '收起最近访问' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '最近访问更多操作' })).toHaveAttribute('aria-haspopup', 'menu')
      expect(within(screen.getByRole('complementary', { name: '最近访问' })).getByText('周策')).toBeInTheDocument()
    } else {
      expect(screen.queryByText('最近访问')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '展开最近访问' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '最近访问更多操作' })).not.toBeInTheDocument()
    }
  })

  it('直接进入 Agent 详情时首屏显示当前 Agent', async () => {
    createMatchMedia(1440)
    const { container } = renderShell('expanded', 'light', '/agents/zhouce')

    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'expanded')
    const recent = screen.getByRole('complementary', { name: '最近访问' })
    expect(within(recent).getByRole('link', { name: /周策/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Agent 详情')).toBeInTheDocument()
    expect(screen.queryByText(/在线|运行中|Session/)).not.toBeInTheDocument()
    await waitFor(() => expect(within(recent).getByRole('link', { name: /周策/ })).toBeInTheDocument())
  })

  it('展开态直接提供收起与更多操作，紧凑态只提供展开', () => {
    createMatchMedia(1440)
    const { unmount } = renderShell('expanded', 'light', '/', ['zhouce'])
    expect(screen.getByRole('button', { name: '收起最近访问' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最近访问更多操作' })).toHaveAttribute('aria-haspopup', 'menu')
    unmount()

    renderShell('compact', 'light', '/', ['zhouce'])
    expect(screen.getByRole('button', { name: '展开最近访问' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '最近访问更多操作' })).not.toBeInTheDocument()
  })

  it('可显式隐藏上下文栏且 Agent 深链不会重新显示', async () => {
    createMatchMedia(1440)
    const { container } = renderShell('hidden', 'light', '/agents/zhouce', ['songyan'])

    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'hidden')
    expect(screen.queryByLabelText('最近访问')).not.toBeInTheDocument()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('bandi-ui-preferences-v1') ?? '{}').mainMenuLayout).toBe('hidden'))
  })

  it('切换已有 Agent 只更新选中态，不改变列表排序', () => {
    createMatchMedia(1440)
    renderShell('expanded', 'light', '/agents/zhouce', ['songyan', 'zhouce'])

    const links = within(screen.getByRole('complementary', { name: '最近访问' })).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^宋研/),
      expect.stringMatching(/^周策/),
    ])
    expect(links[1]).toHaveAttribute('aria-current', 'page')
  })

  it('关闭最后一项后隐藏整栏，再次进入该 Agent 时重新显示', async () => {
    createMatchMedia(1440)
    const { container } = renderShell('expanded', 'light', '/agents/zhouce', ['zhouce'])

    fireEvent.click(screen.getByRole('button', { name: '从最近访问中移除周策' }))

    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'hidden')
    expect(screen.queryByLabelText('最近访问')).not.toBeInTheDocument()
    expect(screen.getByText('Agent 详情')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Agent' }))
    fireEvent.click(screen.getByRole('link', { name: '进入周策' }))

    await waitFor(() => expect(screen.getByRole('complementary', { name: '最近访问' })).toBeInTheDocument())
  })

  it('跟随窗口调整最近访问栏宽度', async () => {
    const viewport = createMatchMedia(1279)
    const { container } = renderShell('follow-window', 'light', '/', ['zhouce'])
    expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'compact')

    act(() => viewport.resize(1280))
    await waitFor(() => expect(container.querySelector('[data-main-menu-layout]')).toHaveAttribute('data-main-menu-layout', 'expanded'))
  })

  it('浏览器能力边界只在 Header 显示一次', () => {
    createMatchMedia(1440)
    renderShell('expanded', 'light', '/', ['zhouce'])
    expect(screen.getAllByText(/浏览器演示/)).toHaveLength(1)
    expect(screen.getByText(/不读取本机配置/)).toBeInTheDocument()
  })
})
