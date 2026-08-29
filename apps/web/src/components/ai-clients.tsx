import * as Dialog from '@radix-ui/react-dialog'
import { Search, Check, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import claudeLogo from '../assets/ai-clients/claude.svg'
import openClawLogo from '../assets/ai-clients/openclaw.svg'
import openCodeLogo from '../assets/ai-clients/opencode.svg'
import piLogo from '../assets/ai-clients/pi.svg'
import { cn } from '../lib'
import type { AiClient, AiClientKind } from '../mock'
import { useApp } from '../state'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'

const logoMap: Partial<Record<AiClientKind, string>> = {
  'claude-code': claudeLogo,
  'claude-desktop': claudeLogo,
  opencode: openCodeLogo,
  openclaw: openClawLogo,
  pi: piLogo,
}

export function AiClientIcon({ client, size = 18, tile = false }: { client: AiClient; size?: number; tile?: boolean }) {
  const [failed, setFailed] = useState(false)
  const logo = logoMap[client.kind]

  if (!logo || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center border border-current/20 bg-current/8 font-semibold leading-none',
          tile ? 'rounded-[22%]' : 'rounded-[5px]',
        )}
        style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.36)) }}
      >
        {client.shortName}
      </span>
    )
  }

  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 object-cover',
        tile && 'rounded-[22%]',
      )}
    />
  )
}

export function AiClientStatus({ client }: { client: AiClient }) {
  return (
    <span className={cn('text-xs', client.enabled ? 'text-foreground' : 'text-muted-foreground')}>
      {client.isDefault ? '默认 · ' : ''}{client.enabled ? '已启用' : '未启用'} · 本机未探测
    </span>
  )
}

function addCustomClient(name: string, clients: AiClient[], dispatch: ReturnType<typeof useApp>['dispatch']) {
  const normalizedName = name.trim()
  const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const id = `custom-${slug || 'client'}-${clients.filter((client) => client.kind === 'custom').length + 1}`
  dispatch({
    type: 'ADD_CUSTOM_AI_CLIENT',
    client: {
      id,
      kind: 'custom',
      name: normalizedName,
      shortName: normalizedName.slice(0, 2).toUpperCase(),
      description: '用户添加的自定义演示客户端',
      enabled: true,
      detection: 'not-checked',
      persistence: 'memory-only',
    },
  })
}

function CustomClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useApp()
  const [name, setName] = useState('')
  const normalizedName = name.trim()
  const duplicate = state.aiClients.some((client) => client.name.toLowerCase() === normalizedName.toLowerCase())
  const disabled = !normalizedName || duplicate

  const submit = () => {
    if (disabled) return
    addCustomClient(normalizedName, state.aiClients, dispatch)
    setName('')
    onOpenChange(false)
  }

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) setName('')
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-fade" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold">添加自定义客户端</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">只创建当前页面中的演示入口，不探测、安装或连接客户端。</Dialog.Description>
              </div>
              <Tooltip content="关闭" side="left"><Dialog.Close className="rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭"><X size={18} /></Dialog.Close></Tooltip>
            </div>
            <label htmlFor="custom-client-name" className="mt-5 block text-sm font-medium">客户端名称</label>
            <input
              id="custom-client-name"
              autoFocus
              className="mt-2 h-10 w-full px-3"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
              placeholder="例如 My CLI"
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate ? 'custom-client-error' : undefined}
            />
            {duplicate && normalizedName && <p id="custom-client-error" className="mt-2 text-xs text-danger">该客户端名称已存在。</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => changeOpen(false)}>取消</Button>
              <Button disabled={disabled} onClick={submit}>添加</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ClientPickerContent({ onCustom, compact = false }: { onCustom: () => void; compact?: boolean }) {
  const { state, dispatch } = useApp()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const clients = state.aiClients.filter((client) =>
    !normalizedQuery || `${client.name} ${client.shortName}`.toLocaleLowerCase().includes(normalizedQuery),
  )

  return (
    <>
      <div className="border-b border-border px-4 py-3.5">
        <b className="block">AI 客户端</b>
        <p className="mt-1 text-xs text-muted-foreground">快速添加或切换配置上下文</p>
        <label className="relative mt-3 block">
          <span className="sr-only">搜索 AI 客户端</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            data-client-search
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-full pl-9 pr-3 text-sm"
            placeholder="搜索客户端"
          />
        </label>
      </div>
      <div className="max-h-[min(460px,58vh)] overflow-y-auto p-2">
        {clients.map((client) => {
          const active = state.activeAiClientId === client.id
          return (
            <div key={client.id} className="flex min-h-14 items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/65">
              <span className="grid size-10 shrink-0 place-items-center"><AiClientIcon client={client} size={40} tile /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{client.name}</b>
                <small className="block truncate text-muted-foreground">{client.isDefault ? '默认客户端 · ' : ''}本机未探测</small>
              </span>
              {client.enabled ? (
                <Button variant={active ? 'ghost' : 'outline'} size="sm" disabled={active} onClick={() => dispatch({ type: 'SELECT_AI_CLIENT', clientId: client.id })}>
                  {active ? <><Check size={14} />当前</> : '切换'}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'ENABLE_AI_CLIENT', clientId: client.id })}>添加</Button>
              )}
            </div>
          )
        })}
        {clients.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的客户端</p>}
        <button
          type="button"
          onClick={onCustom}
          className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 text-left text-sm font-medium hover:border-foreground hover:bg-muted/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={17} />添加自定义客户端
        </button>
      </div>
      <div className={cn('border-t border-border bg-muted/40 px-4 py-3 text-[11px] leading-5 text-muted-foreground', compact && 'rounded-b-xl')}>
        仅当前页面内存 · 未探测本机 · 未写入磁盘
      </div>
    </>
  )
}

type PopoverPosition = { left: number; top: number; width: number }

export function AiClientPickerPopover({ open, onClose, anchorRef }: { open: boolean; onClose: () => void; anchorRef: React.RefObject<HTMLButtonElement | null> }) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const closePicker = useCallback(() => {
    onClose()
    requestAnimationFrame(() => anchorRef.current?.focus())
  }, [anchorRef, onClose])
  const [position, setPosition] = useState<PopoverPosition>({ left: 64, top: 16, width: 360 })

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const gap = 8
    const margin = 12
    const width = Math.min(360, Math.max(240, window.innerWidth - rect.right - gap - margin))
    const estimatedHeight = Math.min(620, window.innerHeight - margin * 2)
    const top = Math.min(Math.max(rect.top, margin), Math.max(margin, window.innerHeight - estimatedHeight - margin))
    setPosition({ left: Math.min(rect.right + gap, window.innerWidth - width - margin), top, width })
  }, [anchorRef])

  useEffect(() => {
    if (!open) return
    updatePosition()
    requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLInputElement>('[data-client-search]')?.focus())
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) closePicker()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !customOpen) closePicker()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, closePicker, customOpen, open, updatePosition])

  if (!open) return null

  return (
    <>
      {!customOpen && <div
        id="ai-client-picker"
        ref={popoverRef}
        role="region"
        aria-label="AI 客户端选择器"
        style={position}
        className="fixed z-50 max-h-[calc(100dvh-24px)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <ClientPickerContent compact onCustom={() => setCustomOpen(true)} />
      </div>}
      <CustomClientDialog open={customOpen} onOpenChange={(nextOpen) => { setCustomOpen(nextOpen); if (!nextOpen) closePicker() }} />
    </>
  )
}

export function AddAiClientDialog() {
  const { dispatch } = useApp()
  const [customOpen, setCustomOpen] = useState(false)
  const close = () => dispatch({ type: 'SHEET', sheet: null })

  return (
    <>
      <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) close() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-fade" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl outline-none">
            <Dialog.Title className="sr-only">AI 客户端</Dialog.Title>
            <Dialog.Description className="sr-only">添加或切换 AI 客户端演示入口</Dialog.Description>
            <Tooltip content="关闭" side="left" triggerClassName="absolute right-3 top-3 z-10"><Dialog.Close className="rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭"><X size={18} /></Dialog.Close></Tooltip>
            <ClientPickerContent onCustom={() => setCustomOpen(true)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <CustomClientDialog open={customOpen} onOpenChange={setCustomOpen} />
    </>
  )
}

export function AiClientManagementSection() {
  const { state, dispatch } = useApp()

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <b>AI 客户端</b>
          <p className="mt-1 text-xs text-muted-foreground">管理 Bandi 中的演示入口，不表示本机已安装或连接。</p>
        </div>
        <Button size="sm" onClick={() => dispatch({ type: 'SHEET', sheet: 'add-ai-client' })}><Plus size={15} />添加 AI 客户端</Button>
      </div>
      <div className="border-b border-warning/20 bg-warning/8 px-5 py-3 text-xs text-warning">所有客户端均未探测本机；启用和停用只保存在当前页面内存中。</div>
      <div className="divide-y divide-border">
        {state.aiClients.map((client) => (
          <div key={client.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center"><AiClientIcon client={client} size={40} tile /></span><div><b className="block">{client.name}</b><AiClientStatus client={client} /></div></div>
            <div className="text-xs leading-5 text-muted-foreground"><div>探测：未执行</div><div>{client.persistence === 'initial-demo' ? '演示初始状态' : '仅当前页面内存'}</div></div>
            <div className="flex flex-wrap justify-end gap-2">
              {client.enabled && state.activeAiClientId !== client.id && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'SELECT_AI_CLIENT', clientId: client.id })}>设为当前</Button>}
              {!client.enabled && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'ENABLE_AI_CLIENT', clientId: client.id })}>演示启用</Button>}
              {client.enabled && !client.isDefault && <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'DISABLE_AI_CLIENT', clientId: client.id })}>从演示中停用</Button>}
              {client.isDefault && <span className="rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium">默认客户端</span>}
              {state.activeAiClientId === client.id && !client.isDefault && <span className="rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background">当前客户端</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
