import { useRef, useState } from 'react'
import { Info, Plus } from 'lucide-react'
import type { BackupScope, ConfigurationEnvironment } from '../../domain'
import { AppDialog } from '../../components/ui/dialog'
import { Link, useSearchParams } from 'react-router-dom'
import { AiClientManagementSection } from '../../components/ai-clients'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { EntityTabPanel, EntityTabs, FieldRow, MockBoundaryNote, MonoPath, PageHeader, StatusBadge } from '../../components/app/page'
import { useApp, type NetworkProxySettings } from '../../state'
import { validateNetworkProxy } from '../../network-proxy-model'
import { createDemoSnapshot, buildBackupPreview, describeBackupScope } from '../../backup-policy'
import { configurationEnvironmentPath } from '../../configuration-environment-model'
import { pluginScopeLabels } from '../../plugin-installation'
import { PersonalizationSection } from './personalization-section'
import { normalizeTerminalId, terminalOptions } from '../../terminal-model'
import { isDesktopRuntime } from '../../desktop-bridge'
import { DesktopBackupPanel } from './desktop-backup-panel'

const sections = [['ai-clients', 'AI 编程工具'], ['network', '网络与代理'], ['terminal', '终端'], ['data', '配置与备份'], ['appearance', '个性化']]
export function SettingsPage() { const [params, setParams] = useSearchParams(); const section = sections.some(([id]) => id === params.get('section')) ? params.get('section')! : 'ai-clients'; return <><PageHeader title="设置" description="管理 AI 编程工具、网络代理、终端、配置方案与备份，以及本机个性化。" /><div className="grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"><nav className="panel h-fit p-2" aria-label="设置分类">{sections.map(([id, label]) => <button key={id} onClick={() => setParams(id === 'ai-clients' ? {} : { section: id })} className={`w-full rounded-md px-3 py-2.5 text-left text-sm ${section === id ? 'bg-foreground font-medium text-background' : 'hover:bg-muted'}`}>{label}</button>)}</nav><div className="min-w-0 space-y-5"><SettingsSection section={section} /></div></div></> }
function SettingsSection({ section }: { section: string }) { const { state, dispatch } = useApp(); if (section === 'ai-clients') return <><AiClientManagementSection /><PluginInstallationSummary /></>; if (section === 'network') return <NetworkProxyPanel />; if (section === 'terminal') return <SettingsDraftPanel key="terminal" title="终端" fields={{ terminal: normalizeTerminalId(state.settings.terminal) }} onSave={(changes) => dispatch({ type: 'UPDATE_SETTINGS', changes })}>{({ draft, update }) => <><label className="block text-sm font-medium">默认终端<select className="mt-2 h-10 w-full px-3" value={draft.terminal} onChange={(event) => update('terminal', event.target.value as typeof draft.terminal)}>{terminalOptions().map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className="mt-3 text-xs leading-5 text-muted-foreground">当前选择只保存在页面内存，刷新后恢复默认值；macOS Desktop 可请求白名单终端打开目录，Windows 与 Web 请复制路径后手动继续。</p></>}</SettingsDraftPanel>; if (section === 'data') return <ConfigurationAndBackupSection />; return <PersonalizationSection /> }

const dataTabs = [
  { id: 'profiles', label: '配置方案' },
  { id: 'storage', label: '存储位置' },
  { id: 'snapshots', label: '快照与恢复' },
  { id: 'remote', label: '远程备份' },
] as const

type DataTabId = typeof dataTabs[number]['id']

function ConfigurationAndBackupSection() {
  const { state, dispatch } = useApp()
  const [activeTab, setActiveTab] = useState<DataTabId>('profiles')
  const [agentRootDraft, setAgentRootDraft] = useState(state.settings.agentRoot)
  const [repositoryDraft, setRepositoryDraft] = useState(state.backupSettings.gitConnection.status === 'connected-demo' ? state.backupSettings.gitConnection.repository : '')
  return <div className="min-w-0 space-y-5">
    <EntityTabs tabs={[...dataTabs]} active={activeTab} onChange={(tab) => setActiveTab(tab as DataTabId)} scope="configuration-backup" ariaLabel="配置与备份分类" variant="segmented" className="w-full" tabListClassName="min-[720px]:w-full min-[720px]:min-w-0 [&>button]:min-[720px]:min-w-0 [&>button]:min-[720px]:flex-1" />
    <EntityTabPanel tabId="profiles" activeTab={activeTab} scope="configuration-backup"><ConfigurationProfilesPanel /></EntityTabPanel>
    <EntityTabPanel tabId="storage" activeTab={activeTab} scope="configuration-backup"><StorageLocationPanel value={agentRootDraft} savedValue={state.settings.agentRoot} onChange={setAgentRootDraft} onReset={() => setAgentRootDraft(state.settings.agentRoot)} onSave={() => dispatch({ type: 'UPDATE_SETTINGS', changes: { agentRoot: agentRootDraft } })} /></EntityTabPanel>
    <EntityTabPanel tabId="snapshots" activeTab={activeTab} scope="configuration-backup"><SnapshotRecoveryPanel /></EntityTabPanel>
    <EntityTabPanel tabId="remote" activeTab={activeTab} scope="configuration-backup"><RemoteBackupPanel repository={repositoryDraft} onRepositoryChange={setRepositoryDraft} /></EntityTabPanel>
  </div>
}

function StorageLocationPanel({ value, savedValue, onChange, onReset, onSave }: { value: string; savedValue: string; onChange: (value: string) => void; onReset: () => void; onSave: () => void }) {
  const { state, dispatch } = useApp()
  const dirty = value !== savedValue
  return <div className="space-y-5"><Panel title="存储位置"><label className="text-sm font-medium">Agent 根目录<input className="mt-2 h-10 w-full px-3" value={value} onChange={(event) => onChange(event.target.value)} /></label><p className="mt-3 text-xs leading-5 text-muted-foreground">所有 AgentPackage 的统一存放位置。每个 Agent 使用稳定 ID 的独立目录，不随部门或工作区变化。</p><p className="mt-2 text-xs leading-5 text-muted-foreground">保存只更新当前页面，不创建、移动或扫描真实目录。</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={!dirty} onClick={onReset}>取消</Button><Button disabled={!dirty} onClick={onSave}>保存演示设置</Button></div></Panel><Panel title="外部变化保护"><Select label="演示检查频率" value={state.settings.externalChangeInterval} values={['手动', '5 分钟', '15 分钟']} onChange={(next) => dispatch({ type: 'UPDATE_SETTINGS', changes: { externalChangeInterval: next as typeof state.settings.externalChangeInterval } })} /><p className="mt-3 text-xs leading-5 text-muted-foreground">多个终端或编辑器的并发修改统一表现为相对编辑基线的外部变化，并通过差异对比处理；Bandi 不识别或展示终端与会话状态。浏览器演示 不会执行扫描。</p></Panel></div>
}
function NetworkProxyPanel() {
  const { state, dispatch } = useApp()
  const [draft, setDraft] = useState(state.settings.networkProxy)
  const errors = validateNetworkProxy(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings.networkProxy)
  const update = <K extends keyof NetworkProxySettings>(key: K, value: NetworkProxySettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const field = (key: 'httpProxy' | 'httpsProxy' | 'socksProxy', label: string, placeholder: string) => <label className="block text-sm font-medium">{label}<input className="mt-2 h-10 w-full px-3" value={draft[key]} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(errors[key]) || undefined} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] && <span id={`${key}-error`} className="mt-1.5 block text-xs text-danger">{errors[key]}</span>}</label>
  return <Panel title="网络与代理"><label className="block text-sm font-medium">代理模式<select className="mt-2 h-10 w-full px-3" value={draft.mode} onChange={(event) => update('mode', event.target.value as NetworkProxySettings['mode'])}><option value="system">跟随系统（默认）</option><option value="none">不使用代理</option><option value="manual">手动配置</option></select></label>{draft.mode === 'manual' && <div className="mt-5 grid gap-4 sm:grid-cols-2">{field('httpProxy', 'HTTP 代理', 'http://127.0.0.1:7890')}{field('httpsProxy', 'HTTPS 代理', 'http://127.0.0.1:7890')}{field('socksProxy', 'SOCKS 代理', 'socks5://127.0.0.1:7891')}<label className="block text-sm font-medium">不走代理的地址<textarea className="mt-2 min-h-24 w-full p-3" value={draft.noProxy} onChange={(event) => update('noProxy', event.target.value)} aria-invalid={Boolean(errors.noProxy) || undefined} aria-describedby={errors.noProxy ? 'noProxy-error' : undefined} placeholder={'localhost\n127.0.0.1\n.example.com'} />{errors.noProxy && <span id="noProxy-error" className="mt-1.5 block text-xs text-danger">{errors.noProxy}</span>}</label></div>}<p className="mt-4 text-xs leading-5 text-muted-foreground">“跟随系统”只记录选择意图。当前 浏览器演示 不读取或应用系统代理，也不修改环境变量或重启进程。</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={!dirty} onClick={() => setDraft(state.settings.networkProxy)}>取消</Button><Button disabled={!dirty || Object.keys(errors).length > 0} onClick={() => dispatch({ type: 'UPDATE_SETTINGS', changes: { networkProxy: draft } })}>保存演示设置</Button></div></Panel>
}

function ConfigurationProfilesPanel() {
  const { state, dispatch } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ConfigurationEnvironment>()
  const [mode, setMode] = useState<'new' | 'copy'>('new')
  const [name, setName] = useState('')
  const [sourceId, setSourceId] = useState(state.currentConfigurationEnvironmentId)
  const normalizedName = name.trim()
  const duplicateName = state.configurationEnvironments.some((item) => item.id !== renameTarget?.id && item.name.trim().toLowerCase() === normalizedName.toLowerCase())
  const closeEditor = () => { setCreateOpen(false); setRenameTarget(undefined); setMode('new'); setName(''); setSourceId(state.currentConfigurationEnvironmentId) }
  const create = () => {
    if (!normalizedName || duplicateName || (mode === 'copy' && !sourceId)) return
    const suffix = state.configurationEnvironments.length + 1
    const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const id = slug && !state.configurationEnvironments.some((item) => item.id === slug) ? slug : `configuration-${suffix}`
    dispatch({ type: 'CREATE_CONFIGURATION_ENVIRONMENT', environment: { id, name: normalizedName, clientIds: [], evidence: 'memory-only' }, sourceEnvironmentId: mode === 'copy' ? sourceId : undefined })
    closeEditor()
  }
  const rename = () => {
    if (!renameTarget || !normalizedName || duplicateName) return
    dispatch({ type: 'SAVE_CONFIGURATION_ENVIRONMENT', environment: { ...renameTarget, name: normalizedName } })
    closeEditor()
  }
  const openRename = (environment: ConfigurationEnvironment) => { setRenameTarget(environment); setName(environment.name) }
  return <><section className="panel overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5"><div><b>配置方案</b><p className="mt-1 text-sm leading-6 text-muted-foreground">集中管理方案与版本；工具加入或移出请前往“AI 编程工具”。</p></div><Button onClick={() => setCreateOpen(true)}><Plus size={15} />新建配置方案</Button></div><div className="divide-y divide-border">{state.configurationEnvironments.map((environment) => { const path = configurationEnvironmentPath(environment); const revisions = path ? state.configRevisions.filter((item) => item.ownerType === 'configuration-environment' && item.ownerId === environment.id && item.path === path) : []; const current = environment.id === state.currentConfigurationEnvironmentId; return <div key={environment.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>{environment.name}</b>{current && <StatusBadge tone="success">当前</StatusBadge>}</div><p className="mt-1 text-xs text-muted-foreground">已加入 {environment.clientIds.length} 个工具 · {revisions.length} 个演示版本</p></div><div className="flex flex-wrap gap-2">{!current && <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'SELECT_CONFIGURATION_ENVIRONMENT', environmentId: environment.id })}>切换</Button>}<Button size="sm" variant="outline" onClick={() => openRename(environment)}>重命名</Button><Button size="sm" variant="outline" disabled={!path} onClick={() => path && dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'configuration-environment', ownerId: environment.id, path } })}>查看版本</Button></div></div> })}</div><div className="border-t border-warning/20 bg-warning/8 px-5 py-3 text-xs leading-5 text-warning">方案只保存 Bandi 的名称和工具登记元数据，不包含宿主工具真实配置，也不从公司、工作区、AgentPackage 或 Plugin 自动继承。</div></section><AppDialog open={createOpen || Boolean(renameTarget)} onOpenChange={(open) => { if (!open) closeEditor() }} title={renameTarget ? '重命名配置方案' : '新建配置方案'} description={renameTarget ? '名称变化会形成新版本，方案 ID 保持不变。' : '创建后会切换到新方案；不会初始化或复制真实工具配置。'} footer={<><Button variant="outline" onClick={closeEditor}>取消</Button><Button disabled={!normalizedName || duplicateName || (!renameTarget && mode === 'copy' && !sourceId)} onClick={renameTarget ? rename : create}>{renameTarget ? '保存演示名称' : '创建演示方案'}</Button></>}>
    {!renameTarget && <label className="block text-sm font-medium">创建方式<select className="mt-2 h-10 w-full px-3" value={mode} onChange={(event) => setMode(event.target.value as 'new' | 'copy')}><option value="new">创建空白方案</option><option value="copy">复制现有方案</option></select></label>}
    <label htmlFor="configuration-profile-name" className={`${renameTarget ? '' : 'mt-4 '}block text-sm font-medium`}>方案名称</label><input id="configuration-profile-name" autoFocus className="mt-2 h-10 w-full px-3" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={duplicateName || undefined} aria-describedby={duplicateName ? 'configuration-profile-name-error' : undefined} />{duplicateName && <p id="configuration-profile-name-error" className="mt-2 text-xs text-danger">方案名称已存在。</p>}
    {!renameTarget && mode === 'copy' && <label className="mt-4 block text-sm font-medium">复制来源<select className="mt-2 h-10 w-full px-3" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{state.configurationEnvironments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <p className="mt-4 text-xs leading-5 text-muted-foreground">空白方案不预选工具；复制方案只复制工具登记，不复制版本历史、组织关系、存储、备份策略或个性化设置。</p>
  </AppDialog></>
}

function PluginInstallationSummary() { const { state } = useApp(); return <Panel title="Plugin 安装摘要"><p className="text-sm leading-6 text-muted-foreground">这里只查看独立的插件安装记录；安装、更新、回滚和卸载统一在 Plugin 资产详情管理。</p><div className="mt-4 space-y-2">{state.pluginInstallations.map((installation) => { const plugin = state.assets.find((item) => item.id === installation.pluginId); return <Link key={installation.pluginId} to={`/assets/${installation.pluginId}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"><span><b>{plugin?.name ?? installation.pluginId}</b><small className="mt-1 block text-muted-foreground">{installation.installedVersion ?? '未安装'} · {pluginScopeLabels[installation.scope]}作用域</small></span><StatusBadge tone={installation.compatible && installation.componentsComplete ? installation.status === 'available' ? 'neutral' : 'success' : 'warning'}>{installation.status}</StatusBadge></Link> })}{!state.pluginInstallations.length && <p className="text-sm text-muted-foreground">暂无插件安装记录。</p>}</div><p className="mt-3 text-xs text-muted-foreground">不表示当前工具或会话已加载 Plugin。</p></Panel> }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel p-5"><b>{title}</b><div className="mt-5">{children}</div></section> }
function SettingsDraftPanel<T extends Record<string, string>>({ title, fields, onSave, children }: { title: string; fields: T; onSave: (changes: T) => void; children: (props: { draft: T; update: <K extends keyof T>(key: K, value: T[K]) => void }) => React.ReactNode }) { const [draft, setDraft] = useState(fields); const dirty = JSON.stringify(draft) !== JSON.stringify(fields); const reset = () => setDraft(fields); return <Panel title={title}>{children({ draft, update: (key, value) => setDraft((current) => ({ ...current, [key]: value })) })}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={!dirty} onClick={reset}>取消</Button><Button disabled={!dirty} onClick={() => onSave(draft)}>保存演示设置</Button></div></Panel> }
function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) { return <label className="block text-sm font-medium">{label}<select className="mt-2 h-10 w-full px-3" value={value} onChange={(e) => onChange(e.target.value)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label> }
function SnapshotRecoveryPanel() {
  if (isDesktopRuntime()) return <DesktopBackupPanel />
  return <DemoSnapshotRecoveryPanel />
}

function DemoSnapshotRecoveryPanel() {
  const { state, dispatch } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const createTriggerRef = useRef<HTMLButtonElement>(null)
  return <div className="space-y-5"><section className="panel flex flex-wrap items-start justify-between gap-4 p-5"><div><b>快照与恢复</b><p className="mt-1 text-sm leading-6 text-muted-foreground">管理本地演示快照策略和范围恢复；不会创建或读取真实文件。</p></div><Button ref={createTriggerRef} onClick={() => setCreateOpen(true)}><Plus size={15} />创建演示快照</Button></section><section className="panel overflow-hidden"><div className="border-b border-border p-5"><b>快照历史</b><p className="mt-1 text-xs text-muted-foreground">每条记录都明确标记为演示。</p></div><div className="divide-y divide-border">{state.backupSnapshots.map((snapshot) => <div key={snapshot.id} className="grid min-w-0 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"><div><b>{snapshot.id}</b><p className="mt-1 text-xs text-muted-foreground">{snapshot.kind} · {snapshot.createdAt}</p><MonoPath>{snapshot.localPath}</MonoPath></div><div className="text-sm text-muted-foreground">{describeBackupScope(snapshot.scope, state)}<small className="mt-1 block">{snapshot.deviceName} · {snapshot.hash} · {snapshot.integrity === 'demo-verified' ? '演示已校验' : '演示未校验'}</small><small className="mt-1 block">排除：{snapshot.excludes.join('、')}</small></div><Button variant="outline" size="sm" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'backup-restore', snapshotId: snapshot.id } })}>预览恢复</Button></div>)}</div></section><Panel title="自动快照"><div className="flex items-center justify-between gap-4"><div><b className="text-sm">启用演示策略</b><p className="mt-1 text-xs text-muted-foreground">不会启动定时任务或创建文件。</p></div><Switch aria-label="启用自动快照演示策略" checked={state.settings.autoSnapshot} onCheckedChange={(autoSnapshot) => dispatch({ type: 'UPDATE_SETTINGS', changes: { autoSnapshot } })} /></div></Panel><CreateBackupDialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) requestAnimationFrame(() => createTriggerRef.current?.focus()) }} /></div>
}

function RemoteBackupPanel({ repository, onRepositoryChange }: { repository: string; onRepositoryChange: (value: string) => void }) {
  const { state, dispatch } = useApp()
  const connect = () => { if (!repository.trim()) return; dispatch({ type: 'UPDATE_BACKUP_SETTINGS', changes: { gitConnection: { status: 'connected-demo', visibility: 'private', repository: repository.trim() } } }) }
  return <div className="space-y-5"><Panel title="Private Git 约束"><FieldRow label="仓库可见性"><StatusBadge tone="success">Private（固定）</StatusBadge></FieldRow><label className="mt-4 block text-sm font-medium">演示仓库地址<input value={repository} onChange={(event) => onRepositoryChange(event.target.value)} placeholder="github.com/org/private-config" className="mt-2 h-10 w-full px-3" /></label><Button className="mt-4" variant="outline" disabled={!repository.trim()} onClick={connect}>模拟连接 Private Git</Button><p className="mt-3 text-xs text-muted-foreground">不收集凭据、不验证仓库、不执行 Git 或上传。</p><div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-5"><div><b className="block text-sm">远程备份包含正式 Memory</b><p className="mt-1 text-xs text-muted-foreground">仅演示未来策略，当前不会上传；Desktop 本地快照也只包含 discovery 已发现并选中的配置文件，当前不含正式 Memory。</p></div><Switch aria-label="远程备份包含正式 Memory" checked={state.backupSettings.formalMemoryRemote === 'confirmed'} onCheckedChange={(checked) => dispatch({ type: 'UPDATE_BACKUP_SETTINGS', changes: { formalMemoryRemote: checked ? 'confirmed' : 'excluded' } })} /></div></Panel><div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><Info size={18} aria-hidden="true" /><span>凭据、Token、钥匙串、聊天、工具、Todo、日志和执行过程永不备份。</span></div></div>
}

function CreateBackupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [scope, setScope] = useState<BackupScope>({ kind: 'all' })
  const [filePaths, setFilePaths] = useState<string[]>([])
  const availableFiles = [...new Set(state.agents.flatMap((agent) => agent.files.map((file) => `${agent.id}/${file.path}`)))]
  const effectiveScope: BackupScope = scope.kind === 'files' ? { kind: 'files', paths: filePaths } : scope
  const preview = buildBackupPreview(state, effectiveScope)
  const chooseKind = (kind: BackupScope['kind']) => {
    if (kind === 'company') setScope({ kind, companyId: state.companies[0]?.id ?? '' })
    else if (kind === 'agent') setScope({ kind, agentId: state.agents[0]?.id ?? '' })
    else if (kind === 'files') setScope({ kind, paths: [] })
    else setScope({ kind: 'all' })
  }
  const close = () => { onOpenChange(false); setStep(1); setScope({ kind: 'all' }); setFilePaths([]) }
  const create = () => {
    if (!preview) return
    dispatch({ type: 'CREATE_DEMO_BACKUP_SNAPSHOT', snapshot: createDemoSnapshot(preview, { id: `snap-demo-${String(state.backupSnapshots.length + 1).padStart(3, '0')}`, createdAt: '刚刚', remoteConnected: state.backupSettings.gitConnection.status === 'connected-demo' }) })
    close()
  }
  return <AppDialog open={open} onOpenChange={(next) => { if (!next) close() }} title="创建演示快照" description={`第 ${step} 步，共 2 步 · ${step === 1 ? '选择范围' : '确认预览'}`} size="lg" footer={<>{step === 2 && <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>}<Button variant="outline" onClick={close}>取消</Button>{step === 1 ? <Button disabled={!preview} onClick={() => setStep(2)}>查看预览</Button> : <Button onClick={create}>确认创建演示快照</Button>}</>}>
    {step === 1 ? <><label className="block text-sm font-medium">备份范围<select className="mt-2 h-10 w-full px-3" value={scope.kind} onChange={(event) => chooseKind(event.target.value as BackupScope['kind'])}><option value="all">全部配置</option><option value="company">公司</option><option value="agent">Agent</option><option value="files">指定文件</option></select></label>{scope.kind === 'company' && <label className="mt-4 block text-sm font-medium">公司<select className="mt-2 h-10 w-full px-3" value={scope.companyId} onChange={(event) => setScope({ kind: 'company', companyId: event.target.value })}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{scope.kind === 'agent' && <label className="mt-4 block text-sm font-medium">Agent<select className="mt-2 h-10 w-full px-3" value={scope.agentId} onChange={(event) => setScope({ kind: 'agent', agentId: event.target.value })}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{scope.kind === 'files' && <fieldset className="mt-4"><legend className="text-sm font-medium">指定文件（至少一项）</legend><div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg border border-border p-3">{availableFiles.map((path) => <label key={path} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={filePaths.includes(path)} onChange={(event) => setFilePaths((current) => event.target.checked ? [...current, path] : current.filter((item) => item !== path))} /><MonoPath>{path}</MonoPath></label>)}</div>{!filePaths.length && <p className="mt-2 text-xs text-danger">请选择至少一个文件。</p>}</fieldset>}</> : preview && <><FieldRow label="范围">{preview.label}</FieldRow><FieldRow label="将包含">{preview.includes.join('、')}</FieldRow><FieldRow label="正式 Memory">当前 Web 演示记录可展示该策略，但不会读取或打包任何真实 Memory 文件</FieldRow><FieldRow label="永不包含">{preview.excludes.join('、')}</FieldRow><FieldRow label="本地演示路径"><MonoPath>~/.bandi/backups/snap-demo-...</MonoPath></FieldRow><FieldRow label="远端状态">{state.backupSettings.gitConnection.status === 'connected-demo' ? 'Private Git 演示连接' : '仅本地 · Private Git 未连接'}</FieldRow><MockBoundaryNote>确认后只新增当前页面中的演示记录，不读取、打包、上传或写入文件。</MockBoundaryNote></>}
  </AppDialog>
}
