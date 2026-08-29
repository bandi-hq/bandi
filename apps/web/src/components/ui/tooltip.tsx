import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib'

type Side = 'top' | 'right' | 'bottom' | 'left'
type Position = { left: number; top: number }

type Props = {
  children: ReactElement<{ 'aria-describedby'?: string }>
  content: string
  side?: Side
  className?: string
  triggerClassName?: string
}

const transforms: Record<Side, string> = {
  top: '-translate-x-1/2 -translate-y-full',
  right: '-translate-y-1/2',
  bottom: '-translate-x-1/2',
  left: '-translate-x-full -translate-y-1/2',
}

export function Tooltip({ children, content, side = 'top', className, triggerClassName }: Props) {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position>({ left: 0, top: 0 })

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 8
    if (side === 'right') setPosition({ left: rect.right + gap, top: rect.top + rect.height / 2 })
    if (side === 'left') setPosition({ left: rect.left - gap, top: rect.top + rect.height / 2 })
    if (side === 'top') setPosition({ left: rect.left + rect.width / 2, top: rect.top - gap })
    if (side === 'bottom') setPosition({ left: rect.left + rect.width / 2, top: rect.bottom + gap })
  }, [side])

  const show = (delay = 250) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      updatePosition()
      setOpen(true)
    }, delay)
  }

  const hide = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, updatePosition])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex', triggerClassName)}
        onPointerEnter={() => show()}
        onPointerLeave={hide}
        onFocusCapture={() => show(0)}
        onBlurCapture={hide}
      >
        {children.props['aria-describedby']
          ? children
          : cloneElement(children, { 'aria-describedby': id })}
      </span>
      {open && createPortal(
        <span
          id={id}
          role="tooltip"
          style={position}
          className={cn(
            'pointer-events-none fixed z-[100] max-w-64 whitespace-normal break-words rounded-lg bg-foreground px-3 py-2 text-xs font-medium leading-5 text-background shadow-xl',
            transforms[side],
            className,
          )}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  )
}
