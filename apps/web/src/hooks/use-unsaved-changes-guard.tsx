import { useCallback } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { AppDialog } from '../components/ui/dialog'
import { Button } from '../components/ui/button'

export function UnsavedChangesGuard({ resetDraft }: { resetDraft: () => void }) {
  return useUnsavedChangesGuard({ dirty: true, resetDraft })
}

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
    description="离开当前页面会丢弃尚未保存的修改。"
    size="sm"
    footer={<>
      <Button variant="outline" onClick={() => { if (blocker.state === 'blocked') blocker.reset() }}>继续编辑</Button>
      <Button variant="danger" onClick={() => { resetDraft(); if (blocker.state === 'blocked') blocker.proceed() }}>放弃修改并离开</Button>
    </>}
  >
    <p className="text-sm text-muted-foreground">尚未写入任何文件；此确认仅用于防止当前页面中的修改丢失。</p>
  </AppDialog>

  return dialog
}
