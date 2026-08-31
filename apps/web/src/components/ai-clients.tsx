import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AlertTriangle, ChevronDown, Plus, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import claudeLogo from '../assets/ai-clients/claude.svg'
import openClawLogo from '../assets/ai-clients/openclaw.svg'
import openCodeLogo from '../assets/ai-clients/opencode.svg'
import piLogo from '../assets/ai-clients/pi.svg'
import { cn } from '../lib'
import { clientLaunchProfileError, defaultClaudeCodeLaunchProfile, isHighRiskLaunchProfile, normalizeClientLaunchProfile } from '../configuration-environment-model'
import type { ClientLaunchProfile } from '../domain'
import type { AiClient, AiClientKind } from '../mock'
import { buildLaunchArgs, shellQuote } from '../terminal-model'
import { useApp } from '../state'
import { Button } from './ui/button'
import { AppDialog } from './ui/dialog'
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
  if (!logo || failed) return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center border border-current/20 bg-current/8 font-semibold leading-none', tile ? 'rounded-[22%]' : 'rounded-[5px]')} style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.36)) }}>{client.shortName}</span>
  return <img src={logo} alt="" aria-hidden="true" width={size} height={size} onError={() => setFailed(true)} className={cn('shrink-0 object-cover', tile && 'rounded-[22%]')} />
}

export function supportsWorkspaceHandoff(client: AiClient): boolean {
  return client.kind === 'claude-code'
}

const handoffMenuContentClass = 'z-[60] min-w-72 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-card p-1.5 text-card-foreground shadow-xl'
const handoffMenuItemClass = 'flex min-h-12 cursor-default items-center gap-3 rounded-md px-2.5 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-muted'

export function AiClientHandoffAction({ workspaceId, agentId, planning = false, className }: { workspaceId?: string; agentId?: string; planning?: boolean; className?: string }) {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const environment = state.configurationEnvironments.find((item) => item.id === state.currentConfigurationEnvironmentId)
  const clients = (environment?.clientIds ?? []).map((id) => state.aiClients.find((client) => client.id === id)).filter((client): client is AiClient => Boolean(client))
  const openClient = (client: AiClient) => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'client-guide', workspaceId, clientId: client.id, agentId, planning: planning || undefined } })
  if (!clients.length) return <Button className={className} onClick={() => navigate('/settings?section=ai-clients')}><Plus size={16} aria-hidden="true" /><span>添加 AI 编程工具</span></Button>
  if (clients.length === 1) {
    const client = clients[0]
    const handoff = supportsWorkspaceHandoff(client)
    return <Button className={className} disabled={handoff && !workspaceId} onClick={() => openClient(client)} aria-label={handoff && !workspaceId ? '请先添加工作区' : undefined}><AiClientIcon client={client} size={16} /><span>{handoff ? planning ? '让 AI 帮我规划协作方式' : `在 ${client.name} 中继续` : `查看 ${client.name} 配置`}</span></Button>
  }
  const handoffClients = clients.filter(supportsWorkspaceHandoff)
  const configClients = clients.filter((client) => !supportsWorkspaceHandoff(client))
  const item = (client: AiClient) => {
    const handoff = supportsWorkspaceHandoff(client)
    return <DropdownMenu.Item key={client.id} disabled={handoff && !workspaceId} className={handoffMenuItemClass} onSelect={() => openClient(client)}><AiClientIcon client={client} size={22} /><span className="min-w-0"><b className="block text-sm">{client.name}</b><small className="block text-muted-foreground">{handoff ? workspaceId ? '打开工作区交接说明' : '请先添加工作区' : '仅配置 · 尚未定义启动适配'}</small></span></DropdownMenu.Item>
  }
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button className={className}><span>{planning ? '选择工具规划协作方式' : '选择 AI 编程工具'}</span><ChevronDown size={15} aria-hidden="true" /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className={handoffMenuContentClass}>{handoffClients.length > 0 && <><DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">可继续使用</DropdownMenu.Label>{handoffClients.map(item)}</>}{configClients.length > 0 && <>{handoffClients.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-border" />}<DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">仅配置</DropdownMenu.Label>{configClients.map(item)}</>}<DropdownMenu.Separator className="my-1 h-px bg-border" /><DropdownMenu.Item className={handoffMenuItemClass} onSelect={() => navigate('/settings?section=ai-clients')}><Settings size={18} aria-hidden="true" /><span className="text-sm font-medium">管理 AI 编程工具</span></DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}

function addCustomClient(name: string, clients: AiClient[], dispatch: ReturnType<typeof useApp>['dispatch']) {
  const normalizedName = name.trim()
  const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  dispatch({ type: 'ADD_CUSTOM_AI_CLIENT', client: { id: `custom-${slug || 'client'}-${clients.filter((client) => client.kind === 'custom').length + 1}`, kind: 'custom', name: normalizedName, shortName: normalizedName.slice(0, 2).toUpperCase(), description: '用户添加的自定义演示工具', detection: 'not-checked', persistence: 'memory-only' } })
}

function CustomClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useApp()
  const [name, setName] = useState('')
  const normalizedName = name.trim()
  const duplicate = state.aiClients.some((client) => client.name.toLowerCase() === normalizedName.toLowerCase())
  const close = () => { setName(''); onOpenChange(false) }
  const submit = () => { if (!normalizedName || duplicate) return; addCustomClient(normalizedName, state.aiClients, dispatch); close() }
  return <Dialog.Root open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]" /><Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl outline-none"><div className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-lg font-semibold">添加 AI 编程工具</Dialog.Title><Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">只登记工具目录，不探测、安装或连接工具。</Dialog.Description></div><Tooltip content="关闭" side="left"><Dialog.Close className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="关闭"><X size={18} /></Dialog.Close></Tooltip></div><label htmlFor="custom-client-name" className="mt-5 block text-sm font-medium">工具名称</label><input id="custom-client-name" autoFocus className="mt-2 h-10 w-full px-3" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} aria-invalid={duplicate || undefined} aria-describedby={duplicate ? 'custom-client-error' : undefined} />{duplicate && normalizedName && <p id="custom-client-error" className="mt-2 text-xs text-danger">该工具名称已存在。</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!normalizedName || duplicate} onClick={submit}>添加</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
}

function LaunchProfileDialog({ environmentId, client, profile, onClose }: { environmentId: string; client: AiClient; profile: ClientLaunchProfile; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const [executable, setExecutable] = useState(profile.executable)
  const [argumentsText, setArgumentsText] = useState(profile.args.join('\n'))
  const [enterBandiOnStart, setEnterBandiOnStart] = useState(profile.enterBandiOnStart)
  const [confirmed, setConfirmed] = useState(false)
  const draft = normalizeClientLaunchProfile({ version: 1, executable, args: argumentsText.split('\n'), enterBandiOnStart })
  const error = clientLaunchProfileError(draft)
  const highRisk = isHighRiskLaunchProfile(draft)
  const preview = [draft.executable, ...buildLaunchArgs(draft.args, draft.enterBandiOnStart)].map(shellQuote).join(' ')
  const save = () => {
    const environment = state.configurationEnvironments.find((item) => item.id === environmentId)
    if (!environment || error || (highRisk && !confirmed)) return
    dispatch({ type: 'SAVE_CONFIGURATION_ENVIRONMENT', environment: { ...environment, clientLaunchProfiles: { ...(environment.clientLaunchProfiles ?? {}), [client.id]: draft } } })
    onClose()
  }
  return <AppDialog open onOpenChange={(open) => { if (!open) onClose() }} title={`${client.name} 启动设置`} description="设置启动程序和独立参数；Bandi 不执行 Shell 语法。" size="md" footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={Boolean(error) || (highRisk && !confirmed)} onClick={save}>保存启动设置</Button></>}>
    <label className="block text-sm font-medium">启动程序<input className="mt-2 h-10 w-full px-3 font-mono text-sm" value={executable} onChange={(event) => { setExecutable(event.target.value); setConfirmed(false) }} /></label>
    <label className="mt-4 block text-sm font-medium">参数（每行一个）<textarea className="mt-2 min-h-28 w-full p-3 font-mono text-sm" value={argumentsText} onChange={(event) => { setArgumentsText(event.target.value); setConfirmed(false) }} placeholder="--dangerously-skip-permissions" /></label>
    <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={enterBandiOnStart} onChange={(event) => setEnterBandiOnStart(event.target.checked)} /><span>启动后进入 <code>/bandi:bandi</code><small className="mt-1 block text-muted-foreground">该入口由 Bandi 固定追加，不需要写入参数。</small></span></label>
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3"><div className="text-xs font-semibold text-muted-foreground">最终命令预览</div><code className="mt-2 block overflow-x-auto whitespace-nowrap text-sm">{preview}</code></div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {highRisk && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger"><div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" /><div><b>这是高风险启动配置</b><p className="mt-1 leading-6">可能跳过 Claude Code 权限确认，或改用自定义可执行程序。仅在可信环境中使用。</p></div></div><label className="mt-3 flex items-start gap-2 text-foreground"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我了解影响，并确认参数中不包含 Token、密码等凭据。</label></div>}
    <p className="mt-4 text-xs leading-5 text-muted-foreground">不支持 alias、管道、重定向、变量展开或复合 Shell 命令。绝对路径 wrapper 必须能转发后续参数。</p>
  </AppDialog>
}

export function AiClientManagementSection() {
  const { state, dispatch } = useApp()
  const [customOpen, setCustomOpen] = useState(false)
  const [launchClient, setLaunchClient] = useState<AiClient>()
  const environment = state.configurationEnvironments.find((item) => item.id === state.currentConfigurationEnvironmentId) ?? state.configurationEnvironments[0]
  const launchProfile = launchClient && environment ? environment.clientLaunchProfiles?.[launchClient.id] ?? defaultClaudeCodeLaunchProfile : undefined
  return <><section className="panel overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-4"><div><b>AI 编程工具</b><p className="mt-1 text-xs text-muted-foreground">当前方案记录已加入工具及其非敏感启动设置，不表示工具已安装或已探测。</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-medium">当前配置方案<select aria-label="当前配置方案" className="mt-1 block h-9 min-w-40 px-3 text-sm" value={environment?.id ?? ''} onChange={(event) => dispatch({ type: 'SELECT_CONFIGURATION_ENVIRONMENT', environmentId: event.target.value })}>{state.configurationEnvironments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button size="sm" onClick={() => setCustomOpen(true)}><Plus size={15} />添加工具</Button></div></div><div className="border-b border-warning/20 bg-warning/8 px-5 py-3 text-xs text-warning">当前未探测本机工具；配置方案、加入状态与启动设置只记录在当前页面内存。</div><div className="divide-y divide-border">{state.aiClients.map((client) => { const registered = environment?.clientIds.includes(client.id) ?? false; const handoff = supportsWorkspaceHandoff(client); return <div key={client.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] sm:items-center"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center"><AiClientIcon client={client} size={40} tile /></span><div><b className="block">{client.name}</b><span className="text-xs text-muted-foreground">{handoff ? '支持结构化终端交接 · 未探测安装状态' : '仅配置 · 尚未定义启动适配'}</span></div></div><div className="text-xs leading-5 text-muted-foreground"><div>{client.description}</div><div>{registered ? `已加入“${environment?.name}”` : `未加入“${environment?.name}”`}</div></div><div className="flex flex-wrap justify-end gap-2">{registered && handoff && <Button variant="outline" size="sm" onClick={() => setLaunchClient(client)}>启动设置</Button>}<Button variant="outline" size="sm" onClick={() => environment && dispatch({ type: 'SET_ENVIRONMENT_CLIENT_REGISTRATION', environmentId: environment.id, clientId: client.id, registered: !registered })}>{registered ? '移出' : '加入当前方案'}</Button></div></div> })}</div><CustomClientDialog open={customOpen} onOpenChange={setCustomOpen} /></section>{launchClient && environment && launchProfile && <LaunchProfileDialog environmentId={environment.id} client={launchClient} profile={launchProfile} onClose={() => setLaunchClient(undefined)} />}</>
}
