import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib'
import { Tooltip } from './tooltip'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean; side?: 'left' | 'right'; navigation?: boolean }
export function Sheet({ open, onOpenChange, title, description, children, footer, wide, side = 'right', navigation }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px] data-[state=open]:animate-fade" />
    <Dialog.Content data-sheet-side={side} className={cn('fixed inset-y-0 z-50 flex w-full flex-col bg-background shadow-2xl outline-none', side === 'right' ? 'right-0 max-w-xl border-l border-border' : 'left-0 max-w-sm border-r border-border', wide && side === 'right' && 'max-w-3xl', navigation && 'max-w-[280px]')}>
      <header className="flex items-start justify-between border-b border-border px-6 py-5"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>{description && <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>}</div><Tooltip content="关闭" side="left"><Dialog.Close className="rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭"><X size={18}/></Dialog.Close></Tooltip></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>{footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">{footer}</footer>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
