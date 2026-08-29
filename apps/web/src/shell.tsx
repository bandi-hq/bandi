import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Boxes,
  Building2,
  CircleAlert,
  CircleCheck,
  CircleX,
  Home,
  Info,
  X,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Workflow,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AiClientIcon, AiClientPickerPopover } from './components/ai-clients'
import { Button } from './components/ui/button'
import { Sheet } from './components/ui/sheet'
import { Tooltip } from './components/ui/tooltip'
import { GlobalSheets } from './sheets'
import { useApp } from './state'
import { cn } from './lib'

const nav = [
  ['/', '首页', Home],
  ['/agents', 'Agents', Bot],
  ['/organization', '组织', Building2],
  ['/workspaces', 'Workspaces', Boxes],
  ['/assets', '资产', Workflow],
  ['/settings', '设置', Settings],
] as const

const titles: Record<string, string> = {
  '/': '首页',
  '/agents': 'Agents',
  '/organization': '组织',
  '/workspaces': 'Workspaces',
  '/assets': '资产',
  '/settings': '设置',
}

function PrimaryNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="主导航">
      {nav.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive && 'bg-foreground font-medium text-background hover:bg-foreground hover:text-background',
            )
          }
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Shell() {
  const { state, dispatch } = useApp()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const addClientButtonRef = useRef<HTMLButtonElement>(null)
  const root = `/${location.pathname.split('/')[1]}`
  const title = location.pathname === '/agents/new' ? '创建 Agent'
    : location.pathname.startsWith('/organization/companies/') ? '公司详情'
      : location.pathname.startsWith('/organization/departments/') ? '部门详情'
        : location.pathname === '/workspaces/new' ? '添加 Workspace'
          : location.pathname === '/settings/claude-code' ? 'Claude Code 集成'
            : location.pathname === '/settings/backup' ? '备份与恢复'
              : titles[root] || '配置详情'
  const workspace = state.workspaces.find((item) => item.id === state.currentWorkspaceId)
  const activeClient = state.aiClients.find((item) => item.id === state.activeAiClientId) ?? state.aiClients[0]
  const enabledClients = state.aiClients.filter((item) => item.enabled)
  const issueCount = state.agents.filter((item) => item.config !== '配置完整').length + state.memoryCandidates.filter((item) => item.status === '待审核').length

  useEffect(() => {
    if (!state.notice?.duration) return
    const id = state.notice.id
    const timer = window.setTimeout(() => dispatch({ type: 'CLEAR_NOTICE', id }), state.notice.duration)
    return () => window.clearTimeout(timer)
  }, [dispatch, state.notice])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[56px_220px_minmax(0,1fr)] max-[1279px]:grid-cols-[56px_188px_minmax(0,1fr)] max-[959.98px]:grid-cols-[56px_minmax(0,1fr)]">
        <aside className="sticky top-0 z-30 flex h-screen flex-col items-center border-r border-border bg-card py-3" aria-label="AI 客户端">
          <Tooltip content="Bandi 首页" side="right" triggerClassName="mb-5">
            <NavLink
              to="/"
              className="grid size-10 place-items-center rounded-xl border border-foreground bg-foreground text-sm font-black text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Bandi 首页"
            >
              B
            </NavLink>
          </Tooltip>
          <div className="flex w-full flex-1 flex-col items-center gap-2">
            {enabledClients.map((client) => {
              const active = client.id === activeClient.id
              return (
                <Tooltip key={client.id} content={client.name} side="right">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SELECT_AI_CLIENT', clientId: client.id })}
                    className={cn(
                      'group relative grid size-10 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                      active ? 'bg-muted/70' : 'hover:bg-muted/60',
                    )}
                    aria-label={`${client.name}，已启用${active ? '，当前客户端' : ''}，本机未探测`}
                    aria-pressed={active}
                  >
                    {active && <span aria-hidden="true" className="absolute -right-1 h-5 w-0.5 rounded-full bg-foreground" />}
                    <span className={cn(
                      'transition-[filter,opacity,transform] duration-150 motion-reduce:transition-none',
                      active
                        ? 'opacity-100'
                        : 'opacity-65 grayscale group-hover:scale-[1.03] group-hover:opacity-90 group-hover:grayscale-[35%]',
                    )}>
                      <AiClientIcon client={client} size={40} tile />
                    </span>
                  </button>
                </Tooltip>
              )
            })}
            <Tooltip content="添加 AI 客户端" side="right">
              <button
                ref={addClientButtonRef}
                type="button"
                onClick={() => setClientPickerOpen((value) => !value)}
                className="grid size-10 place-items-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="添加 AI 客户端"
                aria-expanded={clientPickerOpen}
                aria-haspopup="listbox"
                aria-controls="ai-client-picker"
              >
                <Plus size={18} />
              </button>
            </Tooltip>
          </div>
          <Tooltip content={state.theme === 'light' ? '切换暗色' : '切换亮色'} side="right">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => dispatch({ type: 'THEME' })}
              aria-label={state.theme === 'light' ? '切换暗色' : '切换亮色'}
            >
              {state.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
          </Tooltip>
        </aside>

        <aside className="sticky top-0 h-screen border-r border-border bg-card max-[959.98px]:hidden">
          <div className="border-b border-border px-4 py-4">
            <div className="text-sm font-semibold">Bandi</div>
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/65 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center"><AiClientIcon client={activeClient} size={32} tile /></span>
              <span className="min-w-0"><small className="block text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">当前客户端</small><b className="block truncate text-sm">{activeClient.name}</b></span>
            </div>
          </div>
          <div className="p-3">
            <div className="label px-2 pb-2 pt-1">配置管理</div>
            <PrimaryNavigation />
          </div>
          <div className="absolute inset-x-3 bottom-4 space-y-2 border-t border-border pt-4">
            <button onClick={() => { const candidate = state.memoryCandidates.find((item) => item.status === '待审核'); if (candidate) dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } }); else dispatch({ type: 'TOAST', text: '当前没有待审核 MemoryCandidate；其他配置问题请从首页进入' }) }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted">
              <CircleAlert size={16} className="text-warning" />
              <span>配置问题 <b>{issueCount}</b></span>
            </button>
            <div className="px-2 text-[11px] leading-5 text-muted-foreground">演示模式<br />未探测本机 · 未写入磁盘</div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/94 px-6 py-2 backdrop-blur max-[1279px]:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Tooltip content="打开主菜单" side="bottom" triggerClassName="hidden max-[959.98px]:inline-flex">
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} aria-label="打开主菜单">
                  <Menu size={19} />
                </Button>
              </Tooltip>
              <div className="min-w-0">
                <h1 className="font-semibold">{title}</h1>
                <p className="mono max-w-[38vw] truncate text-[11px] text-muted-foreground max-[700px]:max-w-[45vw]">{workspace?.path ?? '尚未选择 Workspace'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground max-[700px]:hidden">
                Workspace
                <select
                  aria-label="当前 Workspace"
                  value={workspace?.id ?? ''}
                  disabled={!state.workspaces.length}
                  onChange={(event) => dispatch({ type: 'SELECT_WORKSPACE', workspaceId: event.target.value })}
                  className="h-9 max-w-40 bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed"
                >
                  {!state.workspaces.length && <option value="">暂无 Workspace</option>}
                  {state.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground min-[1180px]:block">演示模式 · 未探测本机 · 未写盘</div>
              <Button disabled={!workspace} onClick={() => workspace && dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'client-guide', workspaceId: workspace.id } })} aria-label={workspace ? `打开 ${activeClient.name} 使用指引` : '请先添加 Workspace'}>
                <AiClientIcon client={activeClient} size={16} />
                <span className="max-[700px]:hidden">{activeClient.name} 使用指引</span>
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1420px] p-6 max-[1279px]:p-5 max-[700px]:p-4"><Outlet /></main>
        </div>
      </div>

      <AiClientPickerPopover open={clientPickerOpen} onClose={() => setClientPickerOpen(false)} anchorRef={addClientButtonRef} />

      {menuOpen && (
        <Sheet open onOpenChange={setMenuOpen} title="主菜单" description={`当前客户端：${activeClient.name}`} side="left" navigation>
          <PrimaryNavigation onNavigate={() => setMenuOpen(false)} />
          <div className="mt-6 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">演示模式 · 未探测本机 · 未写入磁盘</div>
        </Sheet>
      )}

      {state.notice && (() => {
        const Icon = state.notice.tone === 'success' ? CircleCheck : state.notice.tone === 'error' ? CircleX : state.notice.tone === 'warning' ? CircleAlert : Info
        return <div role={state.notice.tone === 'error' ? 'alert' : 'status'} aria-live={state.notice.tone === 'error' ? 'assertive' : 'polite'} className={cn('fixed bottom-5 right-5 z-[70] flex max-w-md gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xl', state.notice.tone === 'success' && 'border-success/30', state.notice.tone === 'warning' && 'border-warning/30', state.notice.tone === 'error' && 'border-danger/30', state.notice.tone === 'info' && 'border-border')}>
          <Icon aria-hidden="true" className={cn('mt-0.5 shrink-0', state.notice.tone === 'success' && 'text-success', state.notice.tone === 'warning' && 'text-warning', state.notice.tone === 'error' && 'text-danger', state.notice.tone === 'info' && 'text-muted-foreground')} size={18} />
          <div className="min-w-0 flex-1"><b>{state.notice.title}</b>{state.notice.description && <p className="mono mt-1 text-xs leading-5 text-muted-foreground">{state.notice.description}</p>}</div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2" aria-label="关闭通知" onClick={() => dispatch({ type: 'CLEAR_NOTICE', id: state.notice?.id })}><X size={16} aria-hidden="true" /></Button>
        </div>
      })()}
      <GlobalSheets />
    </div>
  )
}
