import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export const Switch = forwardRef<HTMLButtonElement, Props>(function Switch({ checked, className, disabled, onCheckedChange, ...props }, ref) {
  return <button ref={ref} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)} className={cn('group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 shadow-inner transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-45', checked ? 'border-primary/70 bg-primary shadow-primary/20' : 'border-border bg-muted shadow-black/5 hover:border-muted-foreground/40', className)} {...props}><span aria-hidden="true" className={cn('block size-5 rounded-full border bg-card shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-out group-active:scale-95', checked ? 'translate-x-5 border-white/25' : 'translate-x-0 border-border')} /></button>
})
