import { describe, expect, it, vi } from 'vitest'
import { executeAppCommand, isAppCommandId } from '../app-commands'

describe('app commands', () => {
  it('只接受白名单命令', () => {
    expect(isAppCommandId('navigation.agents')).toBe(true)
    expect(isAppCommandId('shell.exec')).toBe(false)
  })

  it('没有活动编辑器时不消费保存命令', () => {
    expect(executeAppCommand('editor.save', {
      navigate: vi.fn(),
      dispatch: vi.fn(),
    })).toBe(false)
  })

  it('保存命令调用活动编辑器原有处理器', () => {
    const save = vi.fn()
    expect(executeAppCommand('editor.save', {
      navigate: vi.fn(),
      dispatch: vi.fn(),
      editor: { id: 'instructions', dirty: true, canSave: true, save, cancel: vi.fn() },
    })).toBe(true)
    expect(save).toHaveBeenCalledOnce()
  })
})
