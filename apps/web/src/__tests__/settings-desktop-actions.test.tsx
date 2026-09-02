// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FactoryResetPanel } from '../pages/settings/factory-reset-panel'
import { ToolsHandoffSection } from '../pages/settings/tools-handoff-section'
import { AppProvider, initialState } from '../state'
import { applyToolConfigurationSnapshot } from '../tool-configuration'
import { MAIN_MENU_LAYOUT_STORAGE_KEY } from '../navigation-layout'
import { LEGACY_THEME_STORAGE_KEY, UI_PREFERENCES_STORAGE_KEY } from '../ui-preferences'

const bridge = vi.hoisted(() => ({
  commitFactoryReset: vi.fn(),
  createToolPlan: vi.fn(),
  copyToolPlan: vi.fn(),
  deleteCustomTool: vi.fn(),
  deleteToolPlan: vi.fn(),
  loadToolConfiguration: vi.fn(),
  previewFactoryReset: vi.fn(),
  saveCustomTool: vi.fn(),
  saveToolPlan: vi.fn(),
  selectToolPlan: vi.fn(),
}))

vi.mock('../desktop-bridge', () => bridge)

const initialSnapshot = {
  revision: 2,
  selectedPlanId: 'default',
  builtInToolIds: ['claude-code'],
  plans: [{ id: 'default', name: '默认方案', toolIds: [] }],
  customTools: [],
}

function renderTools() {
  render(
    <AppProvider initialState={{
      ...initialState,
      runtime: 'desktop',
      hydration: { ...initialState.hydration, toolConfiguration: 'succeeded' },
      ...applyToolConfigurationSnapshot(initialSnapshot),
    }}>
      <ToolsHandoffSection />
    </AppProvider>,
  )
}

const storage = new Map<string, string>()
beforeEach(() => {
  vi.clearAllMocks()
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Desktop 工具方案', () => {
  it('以后端返回快照创建并切换方案', async () => {
    const created = {
      ...initialSnapshot,
      revision: 3,
      selectedPlanId: 'review',
      plans: [...initialSnapshot.plans, { id: 'review', name: '评审方案', toolIds: [] }],
    }
    bridge.createToolPlan.mockResolvedValue(created)
    renderTools()

    fireEvent.click(screen.getByRole('button', { name: '新建方案' }))
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '评审方案' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: '当前方案' })).toHaveValue('review'))
    expect(bridge.createToolPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: '评审方案', toolIds: [] }),
      2,
    )
  })

  it('写入失败时保留当前方案并显示错误', async () => {
    bridge.saveToolPlan.mockRejectedValue(new Error('revision conflict'))
    renderTools()

    fireEvent.click(screen.getByRole('button', { name: '加入工具方案' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('revision conflict')
    expect(screen.getByRole('combobox', { name: '当前方案' })).toHaveValue('default')
  })
})

describe('恢复出厂状态面板', () => {
  const preview = {
    requestId: 'reset-1',
    previewRef: 'preview-1',
    expiresAt: '2026-09-03T12:00:00Z',
    confirmationText: '恢复出厂状态',
    targets: [{ id: 'database', state: 'present' }],
    canCommit: true,
  }

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, '{}')
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'dark')
    localStorage.setItem(MAIN_MENU_LAYOUT_STORAGE_KEY, '[]')
    localStorage.setItem('unrelated-key', 'keep')
    bridge.previewFactoryReset.mockResolvedValue(preview)
  })

  async function openAndConfirm() {
    fireEvent.click(screen.getByRole('button', { name: '预览恢复范围' }))
    const input = await screen.findByRole('textbox', { name: '输入“恢复出厂状态”确认' })
    expect(screen.getByRole('button', { name: '确认恢复' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '恢复出厂状态' } })
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
  }

  it('提交成功后只清理三个白名单偏好并要求重启', async () => {
    bridge.commitFactoryReset.mockResolvedValue({ requiresRestart: true })
    render(<FactoryResetPanel />)

    await openAndConfirm()

    expect(await screen.findByRole('status')).toHaveTextContent('请立即重启 Bandi')
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(MAIN_MENU_LAYOUT_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
    expect(bridge.commitFactoryReset).toHaveBeenCalledWith({
      requestId: 'reset-1',
      previewRef: 'preview-1',
      confirmationText: '恢复出厂状态',
    })
  })

  it('提交失败时不清理任何偏好', async () => {
    bridge.commitFactoryReset.mockRejectedValue(new Error('目标已变化'))
    render(<FactoryResetPanel />)

    await openAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('目标已变化')
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBe('{}')
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBe('dark')
    expect(localStorage.getItem(MAIN_MENU_LAYOUT_STORAGE_KEY)).toBe('[]')
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
  })
})
