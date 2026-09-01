// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetsPage } from '../pages/assets/asset-pages'
import { AppProvider, initialState } from '../state'
import * as desktopBridge from '../desktop-bridge'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const router = createMemoryRouter([{ path: '/assets', element: <AppProvider initialState={initialState}><AssetsPage /></AppProvider> }], { initialEntries: ['/assets'] })
  return render(<RouterProvider router={router} />)
}

describe('资产索引', () => {
  it('Desktop 只读展示真实发现事实且不提供演示写入入口', async () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(true)
    const hash = `sha256:${'a'.repeat(64)}` as const
    const discover = vi.spyOn(desktopBridge, 'discoverConfig').mockResolvedValue({
      requestId: 'discover-assets',
      profileVersion: 'agent-package-v1',
      containers: [{ id: 'container-1', locator: { rootKind: 'managed', displayPath: 'config/skills.yaml', relativePath: 'config/skills.yaml' }, format: 'yaml', contentHash: hash, writable: true }],
      sharedAssets: [],
      assets: [{ id: 'asset-skills', containerId: 'container-1', kind: 'skills', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] }],
      references: [{ sourceAssetId: 'asset-skills', sourceContainerId: 'container-1', referrerKind: 'agent', referrerId: 'zhouce', targetAssetId: 'skill-review', targetKind: 'skill', state: 'unresolved', sourcePath: 'config/skills.yaml' }],
      diagnostics: [{ code: 'claude_user_root_not_checked', severity: 'info', message: 'Claude 用户根尚未检查' }],
    })

    renderPage()

    expect(await screen.findByText('asset-skills')).toBeInTheDocument()
    expect(screen.getByText('config/skills.yaml')).toBeInTheDocument()
    expect(screen.getByText('Claude 用户根尚未检查')).toBeInTheDocument()
    expect(screen.getByText('1 条引用异常')).toBeInTheDocument()
    expect(screen.getAllByText('技能')).toHaveLength(2)
    expect(screen.getByText('允许受控写入')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建演示资产' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /管理.*Skills/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新索引' }))
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(2))
  })

  it('Web 保留明确的页面内存演示入口且不调用 discovery', () => {
    vi.spyOn(desktopBridge, 'isDesktopRuntime').mockReturnValue(false)
    const discover = vi.spyOn(desktopBridge, 'discoverConfig')

    renderPage()

    expect(screen.getByRole('button', { name: '新建演示资产' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '管理演示技能' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '技能' })).toHaveValue('Skill')
    expect(discover).not.toHaveBeenCalled()
  })
})
