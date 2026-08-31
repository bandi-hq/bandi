import { describe, expect, it } from 'vitest'
import {
  parseMainMenuLayoutPreference,
  resolveMainMenuLayout,
} from '../navigation-layout'

describe('主菜单布局', () => {
  it.each([
    'follow-window',
    'expanded',
    'compact',
    'hidden',
  ] as const)('解析合法偏好 %s', (preference) => {
    expect(parseMainMenuLayoutPreference(preference)).toBe(preference)
  })

  it.each([null, '', 'unknown', 1280])('非法值 %s 回退为跟随窗口', (value) => {
    expect(parseMainMenuLayoutPreference(value)).toBe('follow-window')
  })

  it.each([
    ['follow-window', 1280, 'expanded'],
    ['follow-window', 1279, 'compact'],
    ['follow-window', 960, 'compact'],
    ['expanded', 1280, 'expanded'],
    ['expanded', 1279, 'expanded'],
    ['expanded', 960, 'expanded'],
    ['expanded', 959, 'compact'],
    ['compact', 1280, 'compact'],
    ['compact', 960, 'compact'],
    ['compact', 959, 'compact'],
  ] as const)('%s 在 %spx 时解析为 %s', (preference, width, expected) => {
    expect(resolveMainMenuLayout(preference, width >= 1280, width >= 960, true)).toBe(expected)
  })

  it.each(['follow-window', 'expanded', 'compact', 'hidden'] as const)('%s 在没有最近 Agent 时隐藏', (preference) => {
    expect(resolveMainMenuLayout(preference, true, true, false)).toBe('hidden')
  })

  it.each([
    [true, true],
    [true, false],
    [false, false],
  ] as const)('显式隐藏在所有断点保持隐藏', (isWideViewport, canFitExpandedMenu) => {
    expect(resolveMainMenuLayout('hidden', isWideViewport, canFitExpandedMenu, true)).toBe('hidden')
  })
})
