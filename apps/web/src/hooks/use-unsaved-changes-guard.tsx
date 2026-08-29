import { useCallback } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { AppDialog } from '../components/ui/dialog'
import { Button } from '../components/ui/button'

export function useUnsavedChangesGuard({ dirty, resetDraft }: { dirty: boolean; resetDraft: () => void }) {
  const blocker = useBlocker(dirty)

  useBeforeUnload(useCallback((event) => {
    if (!dirty) return
    event.preventDefault()
  }, [dirty]))

  const dialog = <AppDialog
    open={blocker.state === 'blocked'}
    onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset() }}
    title="放弃未保存修改？"
    description="离开当前页面会丢弃尚未提交到 React 内存的草稿。"
    size="sm"
    footer={<>
      <Button variant="outline" onClick={() => { if (blocker.state === 'blocked') blocker.reset() }}>继续编辑</Button>
      <Button variant="danger" onClick={() => { resetDraft(); if (blocker.state === 'blocked') blocker.proceed() }}>放弃修改并离开</Button>
    </>}
  >
    <p className="text-sm text-muted-foreground">没有文件被写入磁盘；此确认只保护当前页面内存中的未保存内容。</p>
  </AppDialog>

  return dialog
}
