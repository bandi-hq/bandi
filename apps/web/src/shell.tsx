import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Bot,
  Boxes,
  Building2,
  CircleAlert,
  CircleCheck,
  CircleX,
  Home,
  Info,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Moon,
  Settings,
  Sun,
  Workflow,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AiClientHandoffAction } from './components/ai-clients'
import { Button } from './components/ui/button'
import { Tooltip } from './components/ui/tooltip'
import { GlobalSheets } from './sheets'
import { useApp } from './state'
import { cn } from './lib'
import { executeAppCommand, isAppCommandId, type AppCommandId } from './app-commands'
import { isDesktopRuntime, listenForDesktopCommands, readUiAsset, setDesktopTitle } from './desktop-bridge'
import { useEditorSession } from './editor-session'
import { formatWindowTitle, resolveRouteMetadata } from './route-metadata'
import { getAgentConfigStatus } from './domain-selectors'
import { BrandMark } from './components/app/brand-mark'
import { resolveMainMenuLayout } from './navigation-layout'

const nav = [
  ['/', '概览', Home],
  ['/agents', 'Agent', Bot],
  ['/organization', '组织', Building2],
  ['/workspaces', '工作区', Boxes],
  ['/assets', '资产', Workflow],
] as const

const settingsNav = ['/settings', '设置', Settings] as const

function useMediaQuery(query: string) {
  const getMatches = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
  const [matches, setMatches] = useState(getMatches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

const railLinkClass = ({ isActive }: { isActive: boolean }) => cn(
  'relative grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  isActive && 'bg-foreground text-background hover:bg-foreground hover:text-background before:absolute before:-left-2 before:h-5 before:w-0.5 before:rounded-full before:bg-foreground',
)

const menuContentClass = 'z-50 min-w-40 rounded-lg border border-border bg-card p-1 text-sm text-foreground shadow-lg'
const menuItemClass = 'flex min-h-9 cursor-default select-none items-center rounded-md px-2.5 outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground'

function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="ghost" size="icon" className="size-8 min-h-8 shrink-0 p-0" aria-label={label}><MoreHorizontal size={16} aria-hidden="true" /></Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass}>{children}</DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}

function RailNavigation({ issueCount }: { issueCount: number }) {
  return (
    <nav className="flex w-full flex-col items-center gap-2" aria-label="配置管理">
      {nav.map(([to, label, Icon]) => (
        <Tooltip key={to} content={label} side="right">
          <NavLink to={to} end={to === '/'} aria-label={to === '/' && issueCount ? `${label}，${issueCount} 项待处理` : label} className={railLinkClass}>
            <Icon size={18} aria-hidden="true" />
            {to === '/' && issueCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-background" aria-hidden="true">{issueCount}</span>}
          </NavLink>
        </Tooltip>
      ))}
    </nav>
  )
}

export function Shell() {
  const { state, dispatch, effectiveUiPreferences, effectiveTheme, uiPreviewAssets } = useApp()
  const [savedAssets, setSavedAssets] = useState<{ logo?: string; background?: string }>({})
  const location = useLocation()
  const navigate = useNavigate()
  const editor = useEditorSession()
  const metadata = resolveRouteMetadata(`${location.pathname}${location.search}`, {
    agents: state.agents,
    companies: state.companies,
    departments: state.departments,
    workspaces: state.workspaces,
    assets: state.assets,
  })
  const title = metadata.title
  const workspace = state.workspaces.find((item) => item.id === state.currentWorkspaceId)
  const runtimeLabel = isDesktopRuntime()
    ? 'Bandi Desktop · 本机配置管理'
    : '浏览器演示 · 不读取本机配置 · 更改仅在当前页面有效'
  const recentAgents = state.recentAgentIds.flatMap((id) => {
    const agent = state.agents.find((item) => item.id === id)
    return agent ? [{ ...agent, roleName: state.roles.find((role) => role.id === agent.roleId)?.name ?? agent.department }] : []
  })
  const isWideViewport = useMediaQuery('(min-width: 1280px)')
  const canFitExpandedMenu = useMediaQuery('(min-width: 960px)')
  const mainMenuLayout = resolveMainMenuLayout(
    effectiveUiPreferences.mainMenuLayout,
    isWideViewport,
    canFitExpandedMenu,
    recentAgents.length > 0,
  )
  const logoUrl = uiPreviewAssets?.logo === null ? undefined : uiPreviewAssets?.logo ?? savedAssets.logo
  const backgroundUrl = uiPreviewAssets?.background === null ? undefined : uiPreviewAssets?.background ?? savedAssets.background
  const agentMenuExpanded = mainMenuLayout === 'expanded'
  const agentMenuCompact = mainMenuLayout === 'compact'
  const issueCount = state.agents.filter((agent) => getAgentConfigStatus(state, agent).level !== 'healthy').length + state.memoryCandidates.filter((item) => item.status === '待审核').length
  const runCommand = useCallback((command: AppCommandId) => executeAppCommand(command, {
    navigate,
    dispatch,
    editor,
  }), [dispatch, editor, navigate])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    let disposed = false
    let loaded: { logo?: string; background?: string } = {}
    Promise.all([
      state.uiPreferences.logoAsset ? readUiAsset('logo') : undefined,
      state.uiPreferences.backgroundAsset ? readUiAsset('background') : undefined,
    ]).then(([logo, background]) => {
      loaded = { logo, background }
      if (disposed) {
        if (logo) URL.revokeObjectURL(logo)
        if (background) URL.revokeObjectURL(background)
      } else setSavedAssets(loaded)
    }).catch(() => undefined)
    return () => {
      disposed = true
      if (loaded.logo) URL.revokeObjectURL(loaded.logo)
      if (loaded.background) URL.revokeObjectURL(loaded.background)
    }
  }, [state.uiPreferences.backgroundAsset, state.uiPreferences.logoAsset])

  useEffect(() => {
    if (!state.notice?.duration) return
    const id = state.notice.id
    const timer = window.setTimeout(() => dispatch({ type: 'CLEAR_NOTICE', id }), state.notice.duration)
    return () => window.clearTimeout(timer)
  }, [dispatch, state.notice])

  useEffect(() => {
    const windowTitle = formatWindowTitle(title)
    document.title = windowTitle
    void setDesktopTitle(windowTitle).catch(() => undefined)
  }, [title])

  useEffect(() => {
    if (metadata.agentId) dispatch({ type: 'RECORD_RECENT_AGENT', agentId: metadata.agentId })
  }, [dispatch, location.key, metadata.agentId])

  useEffect(() => {
    let disposed = false
    let unlisten: () => void = () => undefined
    void listenForDesktopCommands((payload) => {
      if (isAppCommandId(payload)) runCommand(payload)
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    }).catch(() => undefined)
    return () => {
      disposed = true
      unlisten()
    }
  }, [runCommand])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key === ',') {
        event.preventDefault()
        runCommand('navigation.settings')
        return
      }
      if (event.key.toLowerCase() === 's' && editor?.canSave) {
        event.preventDefault()
        runCommand('editor.save')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor?.canSave, runCommand])

  return (
    <div className="relative min-h-screen text-foreground">
      {backgroundUrl && <><img src={backgroundUrl} alt="" aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" style={{ objectFit: effectiveUiPreferences.backgroundFit }} /><div className="pointer-events-none fixed inset-0 bg-background" style={{ opacity: effectiveUiPreferences.backgroundDim / 100 }} /></>}
      <div
        data-main-menu-layout={mainMenuLayout}
        className={cn(
          'relative grid min-h-screen',
          agentMenuExpanded && 'grid-cols-[56px_220px_minmax(0,1fr)] max-[1279px]:grid-cols-[56px_188px_minmax(0,1fr)]',
          agentMenuCompact && 'grid-cols-[56px_64px_minmax(0,1fr)]',
          mainMenuLayout === 'hidden' && 'grid-cols-[56px_minmax(0,1fr)]',
        )}
      >
        <aside className="sticky top-0 z-30 flex h-screen flex-col items-center border-r border-border bg-card py-3" aria-label="Bandi 配置管理">
          <div className="mb-5 grid size-10 place-items-center rounded-xl border border-border bg-background" aria-label="Bandi">
            <BrandMark theme={effectiveTheme} size={30} className="object-contain" />
          </div>
          <RailNavigation issueCount={issueCount} />
          <div className="mt-auto flex flex-col items-center gap-2">
            <Tooltip content="设置" side="right">
              <NavLink to={settingsNav[0]} aria-label="设置" className={railLinkClass}>
                <Settings size={18} aria-hidden="true" />
              </NavLink>
            </Tooltip>
            <Tooltip content={effectiveTheme === 'light' ? '切换暗色' : '切换亮色'} side="right">
              <Button variant="ghost" size="icon" onClick={() => dispatch({ type: 'THEME' })} aria-label={effectiveTheme === 'light' ? '切换暗色' : '切换亮色'}>
                {effectiveTheme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
              </Button>
            </Tooltip>
          </div>
        </aside>

        {mainMenuLayout !== 'hidden' && <aside className="sticky top-0 flex h-screen min-w-0 flex-col border-r border-border bg-card" aria-label="最近访问">
          {agentMenuCompact && logoUrl && <div className="flex h-14 items-center justify-center border-b border-border"><img src={logoUrl} alt="" aria-hidden="true" className="size-8 rounded-lg object-contain" /></div>}
          <div className={cn('flex h-14 items-center border-b border-border', agentMenuExpanded ? 'justify-between gap-2 px-3' : 'justify-center', agentMenuCompact && logoUrl && 'h-12')}>
            {agentMenuExpanded ? <>
              <div className="flex min-w-0 items-center gap-2">{logoUrl && <img src={logoUrl} alt="" aria-hidden="true" className="size-8 shrink-0 rounded-lg object-contain" />}<div className="min-w-0"><b className="text-sm font-semibold">最近访问</b>{effectiveUiPreferences.shellLabel && <p className="truncate text-xs text-muted-foreground">{effectiveUiPreferences.shellLabel}</p>}</div></div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip content="收起最近访问" side="bottom">
                  <Button variant="ghost" size="icon" className="size-8 min-h-8 p-0" aria-label="收起最近访问" onClick={() => dispatch({ type: 'SET_MAIN_MENU_LAYOUT', preference: 'compact' })}><PanelLeftClose size={16} aria-hidden="true" /></Button>
                </Tooltip>
                <ActionMenu label="最近访问更多操作">
                  {state.recentAgentIds.some((id) => id !== metadata.agentId) && <>
                    <DropdownMenu.Item className={menuItemClass} onSelect={() => dispatch({ type: 'CLEAR_RECENT_AGENTS' })}>{metadata.agentId ? '清空其他最近记录' : '清空最近记录'}</DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  </>}
                  <DropdownMenu.Item className={menuItemClass} onSelect={() => dispatch({ type: 'SET_MAIN_MENU_LAYOUT', preference: 'hidden' })}>隐藏此栏</DropdownMenu.Item>
                </ActionMenu>
              </div>
            </> : <Tooltip content="展开最近访问" side="right">
              <Button variant="ghost" size="icon" aria-label="展开最近访问" onClick={() => dispatch({ type: 'SET_MAIN_MENU_LAYOUT', preference: 'expanded' })}><PanelLeftOpen size={17} aria-hidden="true" /></Button>
            </Tooltip>}
          </div>
          <nav className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto py-2', agentMenuExpanded ? 'gap-2 px-2' : 'items-center gap-1 px-2')} aria-label="最近访问">
            {recentAgents.map((agent) => {
              const label = `${agent.name} · ${agent.roleName}`
              const link = <NavLink
                to={`/agents/${agent.id}`}
                aria-label={label}
                className={({ isActive }) => cn(
                  'relative flex shrink-0 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  agentMenuExpanded ? 'min-h-14 min-w-0 flex-1 gap-3 px-2' : 'size-11 justify-center',
                  agentMenuExpanded && 'pr-10',
                  isActive && 'bg-muted/50 text-foreground before:absolute before:left-0 before:h-6 before:w-0.5 before:rounded-full before:bg-foreground',
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-foreground">{agent.name.slice(0, 1)}</span>
                {agentMenuExpanded && <span className="min-w-0"><b className="block truncate text-sm font-medium">{agent.name}</b><span className="block truncate text-xs text-muted-foreground">{agent.roleName}</span></span>}
              </NavLink>
              return agentMenuExpanded ? <div key={agent.id} className="group relative">{link}<Tooltip content="从最近记录移除" side="right" triggerClassName="absolute right-1.5 top-1/2 -translate-y-1/2"><Button variant="ghost" size="icon" className="size-8 min-h-8 rounded-md p-0 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-background/80 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100" aria-label={`从最近访问中移除${agent.name}`} onClick={() => dispatch({ type: 'REMOVE_RECENT_AGENT', agentId: agent.id })}><X size={14} strokeWidth={1.8} aria-hidden="true" /></Button></Tooltip></div> : <Tooltip key={agent.id} content={label} side="right">{link}</Tooltip>
            })}
          </nav>
        </aside>}

        <div className="min-w-0 bg-background/90">
          <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/94 px-6 py-2 backdrop-blur max-[1280px]:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <h1 className="font-semibold">{title}</h1>
                <p className="mono max-w-[38vw] truncate text-[11px] text-muted-foreground max-[700px]:max-w-[45vw]">{workspace?.path ?? '尚未选择工作区'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground max-[700px]:hidden">
                工作区
                <select
                  aria-label="当前工作区"
                  value={workspace?.id ?? ''}
                  disabled={!state.workspaces.length}
                  onChange={(event) => dispatch({ type: 'SELECT_WORKSPACE', workspaceId: event.target.value })}
                  className="h-9 max-w-40 bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed"
                >
                  {!state.workspaces.length && <option value="">暂无工作区</option>}
                  {state.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground min-[1180px]:block">{runtimeLabel}</div>
              <AiClientHandoffAction workspaceId={workspace?.id} className="max-[700px]:px-2.5" />
            </div>
          </header>
          <main className="shell-main mx-auto max-w-[1420px]"><Outlet /></main>
        </div>
      </div>

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
