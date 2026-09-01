import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDiff, History, KeyRound, Plus, Save, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AiClientHandoffAction } from '../../components/ai-clients'
import { Button } from '../../components/ui/button'
import { AppDialog } from '../../components/ui/dialog'
import { useUnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'
import { EntityNotFound, EntityTabPanel, EntityTabs, FieldRow, MockBoundaryNote, MonoPath, PathActions, StatusBadge, toneForStatus } from '../../components/app/page'
import { useApp } from '../../state'
import { getEligibleMemorySpaces, resolveMemoryGovernance } from '../../memory-policy'
import type { ContextPolicy, ContextPolicyOverride, FullAgent, ServiceGrant, WorkspaceBinding, WorkspaceBindingConfig } from '../../domain'
import type { ParameterBinding, ParameterDefinition } from '../../component-parameters'
import { validateParameterBindings } from '../../component-parameters'
import { validateOrchestrationOverride, validateOrchestrationPolicy } from '../../orchestration-policy'
import { applyAgentConfig, mergeContextPolicy, parseAgentComponentRefs, parseAgentContextConfig, parseAgentMcpRefs, parseAgentOrchestrationPolicy, parseAgentPermissions, parseAgentRuleRefs, parseAgentSkillRefs, parseAgentSopRefs, parseWorkspaceBindingConfig, serializeAgentConfig, validateContextPolicy, validateContextWindowTokens, validateWorkspaceBindingConfig, type AgentContextConfig, type AgentIdentityConfig } from '../../agent-config-model'
import { getAgentConfigStatus, getLatestRevisionForAgent } from '../../domain-selectors'
import { useRegisterEditorSession } from '../../editor-session'
import { resolveAgentConfigRoute, type AgentConfigSection, type AgentFileView } from '../../agent-config-projection'
import { getDefaultAgentPackagePath } from '../../agent-package'
import { AgentPackageBrowser } from './agent-package-files'
import { AgentConfigNavigation } from './agent-config-navigation'
import { AgentAvatar } from '../../components/agents/agent-avatar'
import { AgentAvatarPicker } from '../../components/agents/agent-avatar-picker'
import { MemoryRevisionHistory } from './memory-revision-history'
import { createMemoryCandidate, createWorkspaceBinding, discoverConfig, discoverEligibleMemorySpaces, isDesktopRuntime, listConfigRevisions, listMemoryReviews, loadConfigEditor, loadManagedAgentIdentity, readConfigRevisionContent, recoverConfigRevision, recoverManagedAgentIdentity, restoreConfigRevision, restoreManagedAgentIdentity, saveConfig, saveDepartment, saveManagedAgentIdentity, saveServiceGrants } from '../../desktop-bridge'
import type { ConfigRevisionDto, DiscoveryResult, LoadEditorResult, MemorySpaceDto, SaveConfigResult, SaveManagedAgentIdentityResult, SourceAssetSummaryDto } from '../../contracts'

function findManagedAgentAsset(
  discovery: DiscoveryResult,
  agent: FullAgent,
  relativePath: string,
  kind: SourceAssetSummaryDto['kind'],
  label: string,
) {
  const packageId = agent.packageSource.kind === 'bandi-managed' ? agent.packageSource.packageId : `agt_${agent.id}`
  const expectedPath = `${packageId}/${relativePath}`
  const containers = discovery.containers.filter((item) => item.locator.rootKind === 'managed' && item.locator.relativePath === expectedPath)
  if (containers.length === 0) throw new Error(`未发现该 Agent 的可编辑 ${label}（${expectedPath}）`)
  if (containers.length > 1) throw new Error(`该 Agent 的 ${label} 定位存在歧义：${expectedPath} 匹配到 ${containers.length} 个容器`)
  const assets = discovery.assets.filter((item) => item.kind === kind && item.containerId === containers[0].id)
  if (assets.length === 0) throw new Error(`未发现该 Agent 的可编辑 ${label}（${expectedPath}）`)
  if (assets.length > 1) throw new Error(`该 Agent 的 ${label} 定位存在歧义：${expectedPath} 匹配到 ${assets.length} 个资产`)
  return assets[0]
}

async function loadManagedAgentAssetEditor(
  agent: FullAgent,
  requestId: string,
  relativePath: string,
  kind: SourceAssetSummaryDto['kind'],
  label: string,
  workspaceIds: string[] = [],
) {
  const discovery = await discoverConfig({ requestId: `discover-${requestId}`, workspaceIds, includeClaudeUserRoot: false })
  const asset = findManagedAgentAsset(discovery, agent, relativePath, kind, label)
  return loadConfigEditor({ requestId: `load-${requestId}`, assetId: asset.id })
}

export function AgentDetailPage() {
  const { id } = useParams()
  const { state, dispatch } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const agent = state.agents.find((item) => item.id === id)
  const [routeNotice, setRouteNotice] = useState<string>()
  const route = useMemo(() => agent ? resolveAgentConfigRoute(agent, params) : undefined, [agent, params])
  const projectionContext = useMemo(() => ({ assets: state.assets, workspaces: state.workspaces, memorySpaces: state.memorySpaces, roles: state.roles }), [state.assets, state.memorySpaces, state.roles, state.workspaces])
  const configStatus = agent ? getAgentConfigStatus(state, agent) : undefined

  const routeSearch = route?.canonicalParams.toString()
  const currentSearch = params.toString()
  useEffect(() => {
    if (!route || routeSearch === currentSearch) return
    setRouteNotice(route.notice)
    setParams(route.canonicalParams, { replace: true })
  }, [currentSearch, route, routeSearch, setParams])
  if (!agent || !route) return <EntityNotFound entity="Agent" backTo="/agents" />
  const roleName = state.roles.find((item) => item.id === agent.roleId)?.name ?? '岗位引用缺失'
  const packageMode = route.section === 'package'
  const lifecycleLabel = { active: '已启用', inactive: '已停用', archived: '已归档' }[agent.status]
  const updateParams = (update: (next: URLSearchParams) => void) => { const next = new URLSearchParams(location.search); update(next); navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : '' }) }
  const changeSection = (section: AgentConfigSection) => updateParams((next) => { if (section === 'overview') next.delete('tab'); else next.set('tab', section); if (section === 'package') { const path = getDefaultAgentPackagePath(agent.files); if (path) next.set('path', path); next.set('view', 'preview') } else { next.delete('path'); next.delete('view') } })
  const showFile = (path: string) => updateParams((next) => { next.set('tab', 'package'); next.set('path', path); next.set('view', 'preview') })
  const changeView = (view: AgentFileView) => updateParams((next) => next.set('view', view))
  const activeMode = packageMode ? 'package' : 'management'

  return <>
    <header className="mb-5">
      <Link to="/agents" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={16} aria-hidden="true" />返回 Agents</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={agent} className="size-12 text-lg" /><div className="min-w-0"><h2 className="text-2xl font-semibold tracking-tight">{agent.name}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{roleName} · {agent.department}</p></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'source', agentId: agent.id, section: route.section } })}><Search size={16} aria-hidden="true" />诊断来源</Button><AiClientHandoffAction workspaceId={state.currentWorkspaceId ?? undefined} agentId={agent.id} /></div>
      </div>
    </header>
    <section aria-label="Agent 状态与视图" className="panel mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-3xl"><div className="flex flex-wrap gap-2"><StatusBadge tone={toneForStatus(agent.status)}>{lifecycleLabel}</StatusBadge><StatusBadge tone={configStatus?.level === 'healthy' ? 'success' : configStatus?.level === 'warning' ? 'warning' : configStatus?.level === 'unknown' ? 'neutral' : 'danger'}>{configStatus?.label}</StatusBadge></div><p className="mt-3 leading-7">{agent.mission}</p><div className="mt-2"><MonoPath>{agent.packagePath}</MonoPath></div></div>
        <EntityTabs tabs={[{ id: 'management', label: '管理视图' }, { id: 'package', label: 'AgentPackage' }]} active={activeMode} onChange={(mode) => changeSection(mode === 'package' ? 'package' : 'overview')} scope="agent-mode" ariaLabel="Agent 配置视图" variant="segmented" />
      </div>
    </section>
    {routeNotice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm"><span>{routeNotice}</span><button type="button" className="min-h-11 rounded px-3 text-xs font-medium hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setRouteNotice(undefined)}>知道了</button></div>}
    <EntityTabPanel tabId="management" activeTab={activeMode} scope="agent-mode"><div className="grid min-w-0 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]"><aside className="panel h-fit p-3"><AgentConfigNavigation active={route.section === 'package' ? 'overview' : route.section} onSelect={changeSection} /></aside><section aria-label={`${route.section} 配置`} className="min-w-0"><AgentConfigContent section={route.section} agent={agent} /></section></div></EntityTabPanel>
    <EntityTabPanel tabId="package" activeTab={activeMode} scope="agent-mode"><section aria-label="AgentPackage 配置"><AgentPackageBrowser agent={agent} context={projectionContext} path={route.path} view={route.view} onSelect={showFile} onView={changeView} /></section></EntityTabPanel>
  </>
}

function AgentConfigContent({ section, agent }: { section: AgentConfigSection; agent: FullAgent }) {
  if (section === 'overview') return <Overview agent={agent} />
  if (section === 'identity') return <IdentityTab agent={agent} />
  if (section === 'instructions') return <InstructionsTab agent={agent} />
  if (section === 'context') return <ContextTab agent={agent} />
  if (section === 'skills') return <SkillReferencesTab agent={agent} />
  if (section === 'memory') return <MemoryTab agent={agent} />
  if (section === 'rules') return <RulesTab agent={agent} />
  if (section === 'mcp') return <RulesTab agent={agent} mode="mcp" />
  if (section === 'permissions') return <PermissionsTab agent={agent} />
  if (section === 'collaboration') return <CollaborationTab agent={agent} />
  if (section === 'workspaces') return <WorkspacesTab agent={agent} />
  return <SopTab agent={agent} />
}

function Overview({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const status = getAgentConfigStatus(state, agent)
  const latest = getLatestRevisionForAgent(state, agent.id)
  const externalChange = status.issues.some((issue) => issue.code === 'external-change')
  const memoryCount = state.memorySpaces.filter((item) => item.owner.includes(agent.name)).length
  const configAreas: Array<{ label: string; value: string; state: 'healthy' | 'optional' | 'issue' }> = [
    { label: '身份与职责', value: '完整', state: 'healthy' },
    { label: '主指令', value: agent.instructions ? '完整' : '需要处理', state: agent.instructions ? 'healthy' : 'issue' },
    { label: '上下文', value: agent.contextPolicy.enabled ? '已启用' : '可选 · 已关闭', state: agent.contextPolicy.enabled ? 'healthy' : 'optional' },
    { label: '技能', value: agent.skillRefs.length ? `已引用 ${agent.skillRefs.length} 项` : '可选 · 未配置', state: agent.skillRefs.length ? 'healthy' : 'optional' },
    { label: '长期记忆', value: memoryCount ? `已关联 ${memoryCount} 个空间` : '可选 · 未配置', state: memoryCount ? 'healthy' : 'optional' },
    { label: '规则', value: agent.ruleRefs.length ? `已引用 ${agent.ruleRefs.length} 项` : '需要处理', state: agent.ruleRefs.length ? 'healthy' : 'issue' },
    { label: '工具连接', value: agent.mcpRefs.length ? `已引用 ${agent.mcpRefs.length} 项` : '可选 · 未配置', state: agent.mcpRefs.length ? 'healthy' : 'optional' },
    { label: '工作区', value: agent.workspaceBindings.length ? `已配置 ${agent.workspaceBindings.length} 项` : '可选 · 未配置', state: agent.workspaceBindings.length ? 'healthy' : 'optional' },
    { label: '标准流程', value: agent.sopRefs.length ? `已引用 ${agent.sopRefs.length} 项` : '可选 · 未配置', state: agent.sopRefs.length ? 'healthy' : 'optional' },
  ]
  return <section className="panel overflow-hidden"><div className="border-b border-border px-5 py-4">{status.issues.length ? <><div className="label">需要处理</div><ul className="mt-3 space-y-2 text-sm">{status.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{issue.label}</span></li>)}</ul></> : <p className="text-sm font-medium text-success">配置完整 · 当前未发现配置缺口</p>}{externalChange && <Button className="mt-4" variant="outline" size="sm" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: agent.id, path: `${agent.packagePath}instructions.md` } })}><FileDiff size={14} aria-hidden="true" />查看 Diff</Button>}</div><div className="border-b border-border p-5"><div className="label">配置状态</div><dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">{configAreas.map((area) => <div key={area.label} className="min-w-0"><dt className="text-sm font-medium">{area.label}</dt><dd className={`mt-1 text-sm ${area.state === 'issue' ? 'text-danger' : 'text-muted-foreground'}`}>{area.value}</dd></div>)}</dl></div><div className="grid gap-6 p-5 lg:grid-cols-2"><div><div className="label">最近保存</div>{latest ? <><p className="mt-3 text-sm font-medium">最近一次配置版本保存于 {latest.savedAt}</p><p className="mt-2"><MonoPath>{latest.path}</MonoPath></p></> : <p className="mt-3 text-sm leading-6 text-muted-foreground">首次保存配置后，可在 AgentPackage 文件详情中查看和恢复历史版本。</p>}</div><div><div className="label">AgentPackage 路径</div><p className="mt-3"><MonoPath>{agent.packagePath}</MonoPath></p><div className="mt-4"><PathActions path={agent.packagePath} /></div></div></div></section>
}

function IdentityTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [lifecycleTarget, setLifecycleTarget] = useState<FullAgent['status']>()
  const canonical: AgentIdentityConfig = useMemo(() => ({ schemaVersion: 1, id: agent.id, name: agent.name, roleId: agent.roleId, status: agent.status, companyId: agent.companyId, primaryDepartmentId: agent.primaryDepartmentId, managerAgentId: agent.managerAgentId, avatarPath: agent.avatarPath, mission: agent.mission, responsibilities: agent.responsibilities, deliverables: agent.deliverables, decisionBoundaries: agent.decisionBoundaries, escalationConditions: agent.escalationConditions, prohibitions: agent.prohibitions, completionDefinition: agent.completionDefinition }), [agent])
  const [draft, setDraft] = useState(canonical)
  const [serviceGrants, setServiceGrants] = useState<ServiceGrant[]>(agent.serviceGrants)
  const [avatar, setAvatar] = useState<File>()
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [identityEditor, setIdentityEditor] = useState<Awaited<ReturnType<typeof loadManagedAgentIdentity>>>()
  const [identityConflict, setIdentityConflict] = useState<Extract<SaveManagedAgentIdentityResult, { kind: 'baseline_changed' }>>()
  const [pendingOrganizationIdentity, setPendingOrganizationIdentity] = useState<Extract<SaveManagedAgentIdentityResult, { kind: 'saved' | 'unchanged' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [lifecycleSaving, setLifecycleSaving] = useState(false)
  const managedAvatar = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  useEffect(() => { if (!editing) { setDraft(canonical); setServiceGrants(agent.serviceGrants); setAvatar(undefined); setRemoveAvatar(false); setIdentityConflict(undefined); setPendingOrganizationIdentity(undefined) } }, [agent.serviceGrants, canonical, editing])
  const dirty = editing && (JSON.stringify(draft) !== JSON.stringify(canonical) || JSON.stringify(serviceGrants) !== JSON.stringify(agent.serviceGrants) || Boolean(avatar) || removeAvatar)
  const reset = () => { setDraft(canonical); setServiceGrants(agent.serviceGrants); setAvatar(undefined); setRemoveAvatar(false); setSaveError(undefined); setIdentityConflict(undefined); setIdentityEditor(undefined); setEditing(false) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const update = <K extends keyof AgentIdentityConfig>(key: K, value: AgentIdentityConfig[K]) => setDraft((item) => ({ ...item, [key]: value }))
  const cancel = reset
  const beginEdit = async () => {
    setSaveError(undefined)
    if (managedAvatar) {
      try {
        setIdentityEditor(await loadManagedAgentIdentity(agent.id))
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error))
        return
      }
    }
    setEditing(true)
  }
  const updateManagedAgent = (result: Extract<SaveManagedAgentIdentityResult, { kind: 'saved' | 'unchanged' }>, message: string) => {
    dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...result.agent, packageSource: { kind: 'bandi-managed', packageId: agent.packageSource.kind === 'bandi-managed' ? agent.packageSource.packageId : `agt_${agent.id}`, strategy: 'managed', identityBaseline: result.baselineRef.assetContentHash } }, message })
  }
  const reloadIdentityConflict = async () => {
    if (!identityConflict) return
    try { setIdentityEditor(await loadManagedAgentIdentity(agent.id)); setIdentityConflict(undefined); setSaveError(undefined) }
    catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
  }
  const openIdentityHistory = async () => {
    if (!managedAvatar) return
    setHistoryLoading(true); setSaveError(undefined)
    try {
      const loaded = await loadManagedAgentIdentity(agent.id); const items = await listConfigRevisions(loaded.assetId)
      setIdentityEditor(loaded); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true)
    } catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
    finally { setHistoryLoading(false) }
  }
  const selectIdentityRevision = async (revision: ConfigRevisionDto) => {
    setHistoryLoading(true); setSaveError(undefined)
    try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) }
    catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
    finally { setHistoryLoading(false) }
  }
  const restoreIdentityRevision = async () => {
    if (!identityEditor || !selectedRevision || !restoreConfirmed) return
    setHistoryLoading(true); setSaveError(undefined)
    try {
      const result = await restoreManagedAgentIdentity({ requestId: `restore-identity-${agent.id}`, agentId: agent.id, assetId: identityEditor.assetId, revisionId: selectedRevision.id, expectedBaseline: identityEditor.baselineRef, baseContent: identityEditor.canonicalContent, confirmed: true })
      if (result.kind === 'saved' || result.kind === 'unchanged') { updateManagedAgent(result, result.kind === 'saved' ? '身份与职责已恢复为新的 ConfigRevision' : '身份与职责已是目标版本'); setHistoryOpen(false); setSelectedRevision(undefined); setRevisions([]); setIdentityEditor(undefined) }
      else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setIdentityConflict(result); setSaveError('agent.yaml 已在恢复确认后发生变化。请基于磁盘当前内容重新核对。') }
      else setSaveError(result.diagnostics.map((item) => item.message).join('；') || '身份版本恢复失败')
    } catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
    finally { setHistoryLoading(false) }
  }
  const recoverIdentityRevision = async () => {
    if (!identityEditor || !recoveryRef) return
    try {
      const result = await recoverManagedAgentIdentity({ requestId: `recover-identity-${agent.id}`, agentId: agent.id, assetId: identityEditor.assetId, recoveryRef })
      if (result.kind === 'saved' || result.kind === 'unchanged') { updateManagedAgent(result, '身份与职责 ConfigRevision 已补记'); setRecoveryRef(undefined); setIdentityEditor(undefined); setEditing(false) }
      else setSaveError(result.diagnostics.map((item) => item.message).join('；') || 'ConfigRevision 补记失败')
    } catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
  }
  const saveLifecycle = async () => {
    if (!lifecycleTarget) return
    if (!managedAvatar) { dispatch({ type: 'SET_AGENT_LIFECYCLE', agentId: agent.id, status: lifecycleTarget }); setLifecycleTarget(undefined); return }
    setLifecycleSaving(true); setSaveError(undefined)
    try {
      const value = { ...canonical, status: lifecycleTarget }; const applied = applyAgentConfig(agent, { kind: 'identity', value }); const manifest = serializeAgentConfig(agent, { kind: 'identity', value })
      if (!applied || !manifest) throw new Error('生命周期配置无法序列化')
      const loaded = await loadManagedAgentIdentity(agent.id); const result = await saveManagedAgentIdentity(applied, manifest, loaded.baselineRef, loaded.canonicalContent, { kind: 'keep' })
      if (result.kind === 'saved' || result.kind === 'unchanged') { updateManagedAgent(result, lifecycleTarget === 'archived' ? 'Agent 已归档' : lifecycleTarget === 'inactive' ? 'Agent 已停用' : 'Agent 已重新启用'); setLifecycleTarget(undefined) }
      else if (result.kind === 'baseline_changed') { setDraft(value); setIdentityEditor(loaded); setIdentityConflict(result); setEditing(true); setLifecycleTarget(undefined); setSaveError('agent.yaml 已在生命周期确认期间发生变化。请基于磁盘当前内容重新核对。') }
      else { if (result.kind === 'save_failed' && result.recoveryRef) { setIdentityEditor(loaded); setRecoveryRef(result.recoveryRef) }; setSaveError(result.diagnostics.map((item) => item.message).join('；') || '生命周期保存失败') }
    } catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
    finally { setLifecycleSaving(false) }
  }
  const save = async () => {
    if (!dirty && !pendingOrganizationIdentity) { setEditing(false); return }
    const value = { ...draft, avatarPath: avatar ? 'avatar.png' as const : removeAvatar ? undefined : draft.avatarPath }
    if (!managedAvatar) {
      dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'identity', value } })
      dispatch({ type: 'UPDATE_AGENT', agentId: agent.id, changes: { serviceGrants }, message: '服务授权仅更新到当前页面' })
      setEditing(false)
      return
    }
    const applied = applyAgentConfig(agent, { kind: 'identity', value })
    const manifest = serializeAgentConfig(agent, { kind: 'identity', value })
    if (!applied || !manifest) {
      setSaveError('身份配置无法序列化，请修正字段后重试。')
      return
    }
    setSaveError(undefined)
    let identitySavedThisAttempt = false
    try {
      const loaded = pendingOrganizationIdentity ? identityEditor : identityEditor ?? await loadManagedAgentIdentity(agent.id)
      if (!pendingOrganizationIdentity && !loaded) throw new Error('缺少服务签发的身份配置基线')
      if (loaded) setIdentityEditor(loaded)
      const result = pendingOrganizationIdentity ?? await saveManagedAgentIdentity(
        applied,
        manifest,
        loaded!.baselineRef,
        loaded!.canonicalContent,
        avatar ? { kind: 'replace', file: avatar } : removeAvatar ? { kind: 'remove' } : { kind: 'keep' },
      )
      if (result.kind === 'baseline_changed') {
        setIdentityConflict(result)
        setSaveError('agent.yaml 已在编辑期间发生变化。请比较原始、当前和拟议内容后重新编辑。')
        return
      }
      if (result.kind === 'validation_failed' || result.kind === 'save_failed') {
        if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef)
        setSaveError(result.diagnostics.map((item) => item.message).join('；'))
        return
      }
      if (!pendingOrganizationIdentity) identitySavedThisAttempt = true
      setPendingOrganizationIdentity(result)
      const previousDepartment = state.departments.find((item) => item.id === agent.primaryDepartmentId)
      const nextDepartment = state.departments.find((item) => item.id === result.agent.primaryDepartmentId)
      const persistedDepartments = []
      if (previousDepartment && previousDepartment.id !== nextDepartment?.id) {
        const memberAgentIds = previousDepartment.memberAgentIds.filter((id) => id !== agent.id)
        persistedDepartments.push(await saveDepartment({
          ...previousDepartment,
          managerAgentId: previousDepartment.managerAgentId === agent.id ? undefined : previousDepartment.managerAgentId,
          memberAgentIds,
          members: memberAgentIds.length,
        }))
      }
      if (nextDepartment) {
        const memberAgentIds = [...new Set([...nextDepartment.memberAgentIds, agent.id])]
        persistedDepartments.push(await saveDepartment({ ...nextDepartment, memberAgentIds, members: memberAgentIds.length }))
      }
      const persistedGrants = await saveServiceGrants(agent.id, serviceGrants)
      if (persistedDepartments.length) {
        dispatch({ type: 'SYNC_PERSISTED_DEPARTMENTS', departments: persistedDepartments })
      }
      setPendingOrganizationIdentity(undefined)
      updateManagedAgent({
        ...result,
        agent: {
          ...result.agent,
          serviceGrants: persistedGrants.map((grant) => ({
            id: grant.id,
            departmentId: grant.departmentId,
            capabilities: grant.capabilities,
            workspaceIds: grant.workspaceIds,
            prohibitions: grant.prohibitions,
            status: grant.status,
          })),
        },
      }, result.kind === 'saved' ? '身份、职责、部门成员与服务授权已保存' : '组织关系与服务授权已保存')
      setEditing(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveError(
        pendingOrganizationIdentity || identitySavedThisAttempt
          ? `身份与职责已保存到 AgentPackage，但组织关系尚未完整保存：${message}。请直接重试，本次不会重复写入 agent.yaml。`
          : message,
      )
    }
  }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:identity`, dirty, canSave: (dirty || Boolean(pendingOrganizationIdentity)), save, cancel } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title="身份与职责" description="组织身份、职责和服务授权不形成隐式权限。" editing={editing} onEdit={beginEdit} onCancel={cancel} onSave={save} saveLabel={managedAvatar ? '保存' : '模拟保存'} />
    <div className="p-5">{editing ? <div className="grid gap-5 sm:grid-cols-2"><AgentAvatarPicker name={draft.name} file={avatar} onChange={(file) => { setAvatar(file); if (file) setRemoveAvatar(false) }} disabled={!managedAvatar} help={managedAvatar ? (removeAvatar ? '保存后将从 AgentPackage 移除头像。' : undefined) : '仅 current、可写的受管 AgentPackage 支持替换头像。'} />{agent.avatarPath && managedAvatar && !avatar && <div className="flex items-center justify-between rounded-lg border border-border p-4 sm:col-span-2"><div className="flex items-center gap-3"><AgentAvatar agent={agent} className="size-12" /><div><b className="text-sm">当前头像</b><p className="mt-1 text-xs text-muted-foreground">移除后保存会同时更新 agent.yaml。</p></div></div><Button type="button" variant="outline" size="sm" onClick={() => setRemoveAvatar((value) => !value)}>{removeAvatar ? '保留头像' : '移除头像'}</Button></div>}<Labeled label="名称"><input value={draft.name} onChange={(e) => update('name', e.target.value)} className="h-10 w-full px-3" /></Labeled><Labeled label="岗位"><select value={draft.roleId} onChange={(e) => update('roleId', e.target.value)} className="h-10 w-full px-3">{state.roles.filter((role) => role.companyId === draft.companyId && role.status === 'active').map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Labeled><Labeled label="主属部门"><select value={draft.primaryDepartmentId} onChange={(e) => { const dep = state.departments.find((item) => item.id === e.target.value); setDraft((item) => ({ ...item, primaryDepartmentId: e.target.value, managerAgentId: dep?.managerAgentId })) }} className="h-10 w-full px-3">{state.departments.filter((item) => item.companyId === draft.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><ServiceGrantEditor agent={agent} grants={serviceGrants} onChange={setServiceGrants} /><Labeled label="使命"><textarea value={draft.mission} onChange={(e) => update('mission', e.target.value)} className="min-h-28 w-full p-3" /></Labeled><ListEditor label="主要职责" values={draft.responsibilities} onChange={(value) => update('responsibilities', value)} /><ListEditor label="交付物" values={draft.deliverables} onChange={(value) => update('deliverables', value)} /><ListEditor label="决策边界" values={draft.decisionBoundaries} onChange={(value) => update('decisionBoundaries', value)} /><ListEditor label="升级条件" values={draft.escalationConditions} onChange={(value) => update('escalationConditions', value)} /><ListEditor label="禁止事项" values={draft.prohibitions} onChange={(value) => update('prohibitions', value)} /><ListEditor label="完成定义" values={draft.completionDefinition} onChange={(value) => update('completionDefinition', value)} /></div> : <div><FieldRow label="主属部门">{agent.department}（唯一）</FieldRow><FieldRow label="直属主管">{state.agents.find((item) => item.id === agent.managerAgentId)?.name ?? '未设置'}</FieldRow><FieldRow label="使命">{agent.mission}</FieldRow><FieldRow label="主要职责">{agent.responsibilities.join('；')}</FieldRow><FieldRow label="交付物">{agent.deliverables.join('；')}</FieldRow><FieldRow label="决策边界">{agent.decisionBoundaries.join('；')}</FieldRow><FieldRow label="升级条件">{agent.escalationConditions.join('；')}</FieldRow><FieldRow label="禁止事项">{agent.prohibitions.join('；')}</FieldRow><FieldRow label="完成定义">{agent.completionDefinition.join('；')}</FieldRow><FieldRow label="服务授权">{agent.serviceGrants.length ? agent.serviceGrants.map((grant) => `${state.departments.find((item) => item.id === grant.departmentId)?.name}：${grant.capabilities.join('、')}（${grant.status}）`).join('；') : '无跨部门服务授权'}</FieldRow></div>}
      {saveError && <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><p>{saveError}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" onClick={recoverIdentityRevision}>补记 ConfigRevision</Button>}</div>}
      {identityConflict && <div className="mt-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="身份配置外部变化比较">{([{ label: '开始编辑时', side: identityConflict.base }, { label: '磁盘当前内容', side: identityConflict.current }, { label: '你的拟议内容', side: identityConflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" onClick={reloadIdentityConflict}>基于当前内容重新编辑</Button></div></div>}
      {!editing && <div className="mt-6 flex flex-wrap gap-2"><Button variant="ghost" disabled={historyLoading} onClick={openIdentityHistory}><History size={15} aria-hidden="true" />{historyLoading ? '加载历史中…' : '版本历史'}</Button><Button variant="outline" onClick={() => setLifecycleTarget(agent.status === 'inactive' ? 'active' : 'inactive')}>{agent.status === 'inactive' ? '重新启用' : '停用 Agent'}</Button><Button variant="outline" onClick={() => setLifecycleTarget('archived')}>归档</Button><Button variant="danger" onClick={() => dispatch({ type: 'TOAST', text: `永久删除仅展示影响：${agent.workspaceBindings.length} WorkspaceBinding、${agent.sopRefs.length} SOP 引用和正式记忆将保留；演示未删除对象` })}><Trash2 size={15} />预览永久删除影响</Button></div>}
    </div></section><AppDialog open={Boolean(lifecycleTarget)} onOpenChange={(open) => { if (!open) setLifecycleTarget(undefined) }} title={lifecycleTarget === 'archived' ? '归档 Agent' : lifecycleTarget === 'inactive' ? '停用 Agent' : '重新启用 Agent'} description="生命周期变更会作为完整 agent.yaml manifest 保存。" footer={<><Button variant="outline" onClick={() => setLifecycleTarget(undefined)}>取消</Button><Button variant={lifecycleTarget === 'archived' ? 'danger' : 'default'} disabled={lifecycleSaving} onClick={saveLifecycle}>{lifecycleSaving ? '保存中…' : '确认更新'}</Button></>}><div className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6"><b>保留与影响</b><p className="mt-2 text-muted-foreground">AgentPackage、{agent.workspaceBindings.length} 个 WorkspaceBinding、正式 Memory 和 ConfigRevision 全部保留。停用或归档后不可接受新委派；已有静态引用不会自动删除。</p></div></AppDialog><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title="身份与职责版本历史" description="历史版本不可变；恢复仅写入完整 agent.yaml，并生成新的 ConfigRevision。头像字节不在历史中。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === identityEditor?.canonicalContent || !restoreConfirmed || historyLoading} onClick={restoreIdentityRevision}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="身份配置版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectIdentityRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前 manifest</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{identityEditor?.canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div><div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">恢复前会再次验证当前 baseline；历史中的 avatarPath 必须与当前固定 avatar.png 状态一致，否则不会写入。</div>{selectedRevision && selectedContent !== identityEditor?.canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前 manifest 与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前身份与职责暂无真实 ConfigRevision。</p>}
    </AppDialog>{unsavedDialog}</>
}

function ServiceGrantEditor({ agent, grants, onChange }: { agent: FullAgent; grants: ServiceGrant[]; onChange: (grants: ServiceGrant[]) => void }) {
  const { state } = useApp()
  const departments = state.departments.filter((department) => department.companyId === agent.companyId && department.id !== agent.primaryDepartmentId)
  const addGrant = () => {
    const department = departments.find((item) => !grants.some((grant) => grant.departmentId === item.id))
    if (!department) return
    onChange([...grants, {
      id: `grant-${agent.id}-${department.id}`,
      departmentId: department.id,
      capabilities: ['配置审查'],
      workspaceIds: [],
      prohibitions: ['不得扩大权限'],
      status: '有效',
    }])
  }
  return <section className="rounded-lg border border-border sm:col-span-2">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><b className="text-sm">跨部门服务授权</b><p className="mt-1 text-xs text-muted-foreground">只声明服务边界，不授予文件、命令、网络或委派权限。</p></div><Button type="button" variant="outline" size="sm" disabled={!departments.some((item) => !grants.some((grant) => grant.departmentId === item.id))} onClick={addGrant}><Plus size={14} aria-hidden="true" />添加授权</Button></div>
    {grants.length ? <div className="divide-y divide-border">{grants.map((grant) => <div key={grant.id} className="grid gap-3 p-4 md:grid-cols-[1fr_1.4fr_1fr_auto]">
      <Labeled label="目标部门"><select value={grant.departmentId} onChange={(event) => onChange(grants.map((item) => item.id === grant.id ? { ...item, departmentId: event.target.value } : item))} className="h-10 w-full px-3">{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Labeled>
      <Labeled label="允许能力"><input value={grant.capabilities.join('、')} onChange={(event) => onChange(grants.map((item) => item.id === grant.id ? { ...item, capabilities: event.target.value.split('、').map((value) => value.trim()).filter(Boolean) } : item))} className="h-10 w-full px-3" /></Labeled>
      <Labeled label="状态"><select value={grant.status} onChange={(event) => onChange(grants.map((item) => item.id === grant.id ? { ...item, status: event.target.value as ServiceGrant['status'] } : item))} className="h-10 w-full px-3"><option value="有效">有效</option><option value="暂停">暂停</option></select></Labeled>
      <Button type="button" variant="ghost" size="icon" aria-label={`移除 ${state.departments.find((item) => item.id === grant.departmentId)?.name ?? grant.departmentId} 服务授权`} onClick={() => onChange(grants.filter((item) => item.id !== grant.id))}><Trash2 size={16} aria-hidden="true" /></Button>
    </div>)}</div> : <p className="p-4 text-sm text-muted-foreground">没有跨部门服务授权。</p>}
  </section>
}

function InstructionsTab({ agent }: { agent: FullAgent }) {
  const { dispatch } = useApp()
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  const [editing, setEditing] = useState(false)
  const [canonical, setCanonical] = useState(agent.instructions)
  const [text, setText] = useState(agent.instructions)
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [recoveryRef, setRecoveryRef] = useState<string>()
  useEffect(() => { if (!editing) { setCanonical(agent.instructions); setText(agent.instructions); setEditor(undefined); setConflict(undefined); setError(undefined) } }, [agent.instructions, editing])
  const dirty = editing && text !== canonical
  const reset = () => { setText(canonical); setEditing(false); setEditor(undefined); setConflict(undefined); setError(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const beginEditing = async () => {
    if (!desktopManaged) { setEditing(true); return }
    setLoading(true); setError(undefined); setConflict(undefined)
    try {
      const loaded = await loadManagedAgentAssetEditor(agent, agent.id, 'instructions.md', 'instructions', 'Instructions 资产')
      setEditor(loaded); setCanonical(loaded.canonicalContent); setText(loaded.canonicalContent); setEditing(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setLoading(false) }
  }
  const reloadConflictBaseline = async () => {
    if (!editor || !conflict) return
    setLoading(true); setError(undefined)
    try {
      const loaded = await loadConfigEditor({ requestId: `reload-${agent.id}`, assetId: editor.asset.id })
      const proposed = text
      setEditor(loaded); setCanonical(loaded.canonicalContent); setText(proposed); setConflict(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setLoading(false) }
  }
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, 'instructions.md', 'instructions', 'Instructions 资产')
  const openHistory = async () => {
    if (!desktopManaged) {
      dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'agent', ownerId: agent.id, path: 'instructions.md' } })
      return
    }
    setHistoryLoading(true); setError(undefined)
    try {
      const loaded = await loadDesktopEditor(`history-${agent.id}`)
      const items = await listConfigRevisions(loaded.asset.id)
      setEditor(loaded); setCanonical(loaded.canonicalContent); setText(loaded.canonicalContent)
      setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : '')
      setRestoreConfirmed(false); setHistoryOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setHistoryLoading(false) }
  }
  const selectRevision = async (revision: ConfigRevisionDto) => {
    setHistoryLoading(true); setError(undefined)
    try {
      setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setHistoryLoading(false) }
  }
  const restoreRevision = async () => {
    if (!editor || !selectedRevision || !restoreConfirmed) return
    setHistoryLoading(true); setError(undefined)
    try {
      const result = await restoreConfigRevision({ requestId: `restore-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonical, confirmed: true })
      if (result.kind === 'saved' || result.kind === 'unchanged') {
        dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, instructions: selectedContent }, message: result.kind === 'saved' ? 'Instructions 已恢复为新的 ConfigRevision' : 'Instructions 已是目标版本' })
        setCanonical(selectedContent); setText(selectedContent); setHistoryOpen(false); setRevisions([]); setSelectedRevision(undefined)
      } else if (result.kind === 'baseline_changed') {
        setHistoryOpen(false); setEditing(true); setText(selectedContent); setConflict(result); setError('Instructions 已在恢复确认后发生变化。请基于磁盘当前内容重新核对。')
      } else {
        setError(result.diagnostics.map((item) => item.message).join('；') || 'ConfigRevision 恢复失败')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setHistoryLoading(false) }
  }
  const save = async () => {
    if (!dirty) { setEditing(false); return }
    if (!desktopManaged) {
      dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'instructions', value: text } })
      setEditing(false)
      return
    }
    if (!editor) { setError('缺少服务签发的 Instructions 基线，请重新加载编辑器。'); return }
    setSaving(true); setError(undefined); setConflict(undefined)
    try {
      const result = await saveConfig({ requestId: `save-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: 'instructions', value: text }, expectedBaseline: editor.baselineRef, baseContent: canonical })
      if (result.kind === 'saved' || result.kind === 'unchanged') {
        dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, instructions: text }, message: result.kind === 'saved' ? 'Instructions 已保存到 AgentPackage' : 'Instructions 无变化' })
        setCanonical(text); setEditing(false); setEditor(undefined); setRecoveryRef(undefined)
      } else if (result.kind === 'baseline_changed') {
        setConflict(result); setError('Instructions 已在编辑期间发生变化。请比较原始、当前和拟议内容后重新编辑。')
      } else {
        const message = result.diagnostics.map((item) => item.message).join('；') || 'Instructions 保存失败'
        if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef)
        setError(result.kind === 'save_failed' && result.recoveryRef ? `${message}（恢复引用：${result.recoveryRef}）` : message)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setSaving(false) }
  }
  const recoverRevision = async () => {
    if (!editor || !recoveryRef) return
    setSaving(true); setError(undefined)
    try {
      const result = await recoverConfigRevision({ requestId: `recover-${agent.id}`, assetId: editor.asset.id, recoveryRef })
      if (result.kind === 'saved' || result.kind === 'unchanged') {
        dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, instructions: text }, message: 'Instructions ConfigRevision 已补记' })
        setCanonical(text); setEditing(false); setEditor(undefined); setRecoveryRef(undefined)
      } else {
        setError(result.diagnostics.map((item) => item.message).join('；') || 'ConfigRevision 补记失败')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setSaving(false) }
  }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:instructions`, dirty, canSave: dirty && !saving, save, cancel: reset } : undefined)
  const description = desktopManaged ? `真实保存目标：${agent.packagePath}instructions.md` : `演示保存目标：${agent.packagePath}instructions.md`
  return <><section className="panel overflow-hidden"><TabHeader title="Instructions" description={description} editing={editing} onEdit={beginEditing} onCancel={reset} onSave={save} canSave={!saving} saveLabel={desktopManaged ? (saving ? '保存中…' : '保存') : '模拟保存'} editDisabled={loading} /><div className="p-5">{loading && <p role="status" className="mb-4 text-sm text-muted-foreground">正在从 AgentPackage 加载 Instructions…</p>}{editing ? <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-72 w-full resize-y p-4 text-sm leading-7" aria-label="Instructions 正文" aria-describedby={error ? 'instructions-save-error' : undefined} /> : <div className="whitespace-pre-wrap rounded-lg bg-muted/40 p-5 text-sm leading-7">{canonical}</div>}{error && <div id="instructions-save-error" role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={saving} onClick={recoverRevision}>{saving ? '补记中…' : '补记 ConfigRevision'}</Button>}</div>}{conflict && <div className="mt-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="Instructions 外部变化比较">{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={loading} onClick={reloadConflictBaseline}>{loading ? '重新加载中…' : '基于当前内容重新编辑'}</Button></div></div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>Agent 自有正文 · 显式引用 {agent.ruleRefs.length} 条 Rule{desktopManaged ? ' · Desktop 真实文件' : ' · 仅当前页面'}</span><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={historyLoading || editing} onClick={openHistory}><History size={14} aria-hidden="true" />{historyLoading ? '加载历史中…' : '版本历史'}</Button><Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: agent.id, path: `${agent.packagePath}instructions.md` } })}><FileDiff size={14} aria-hidden="true" />查看 Diff</Button></div></div></div></section><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title="Instructions 版本历史" description="历史版本不可变；恢复会基于磁盘当前内容生成新的 ConfigRevision。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonical || !restoreConfirmed || historyLoading} onClick={restoreRevision}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="Instructions 配置版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small>{revision.restoredFromRevisionId && <small className="mt-1 block text-muted-foreground">恢复自 {revision.restoredFromRevisionId}</small>}</button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonical}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div><div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">恢复前会再次验证当前 baseline；若磁盘发生变化，不会强制覆盖，草稿和历史均保留。</div>{selectedRevision && selectedContent !== canonical && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对磁盘当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前 Instructions 暂无真实 ConfigRevision。</p>}
    </AppDialog>{unsavedDialog}</>
}

function ContextTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  const stateConfig: AgentContextConfig = useMemo(() => ({ policy: { ...agent.contextPolicy }, contextWindowTokens: agent.contextWindowTokens, outputProfileId: agent.outputProfileId, outputParameterBindings: agent.outputParameterBindings }), [agent.contextPolicy, agent.contextWindowTokens, agent.outputParameterBindings, agent.outputProfileId])
  const [canonical, setCanonical] = useState(stateConfig)
  const [canonicalContent, setCanonicalContent] = useState(() => serializeAgentConfig(agent, { kind: 'context', value: stateConfig }) ?? '')
  const [draft, setDraft] = useState(stateConfig)
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  useEffect(() => { if (!editing && !historyOpen) { const content = serializeAgentConfig(agent, { kind: 'context', value: stateConfig }) ?? ''; setCanonical(stateConfig); setCanonicalContent(content); setDraft(stateConfig); setEditor(undefined); setConflict(undefined); setError(undefined) } }, [agent, editing, historyOpen, stateConfig])
  const errors = [...validateContextPolicy(draft.policy), ...validateContextWindowTokens(draft.contextWindowTokens)]
  const proposedContent = serializeAgentConfig(agent, { kind: 'context', value: draft }) ?? ''
  const dirty = editing && proposedContent !== canonicalContent
  const reset = () => { setDraft(canonical); setEditing(false); setEditor(undefined); setConflict(undefined); setError(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const updatePolicy = <K extends keyof ContextPolicy>(key: K, value: ContextPolicy[K]) => setDraft((item) => ({ ...item, policy: { ...item.policy, [key]: value } }))
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, 'config/context.yaml', 'context', 'ContextPolicy 资产')
  const applyLoaded = (loaded: LoadEditorResult) => {
    const parsed = parseAgentContextConfig(loaded.canonicalContent)
    if (!parsed) throw new Error('磁盘 context.yaml 无法转换为当前页面模型')
    setEditor(loaded); setCanonical(parsed); setCanonicalContent(loaded.canonicalContent); setDraft(parsed)
  }
  const beginEditing = async () => {
    if (!desktopManaged) { setEditing(true); return }
    setBusy(true); setError(undefined)
    try { const loaded = await loadDesktopEditor(`context-${agent.id}`); applyLoaded(loaded); setEditing(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const commitCanonical = (value: AgentContextConfig, message: string) => {
    dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, contextPolicy: value.policy, contextWindowTokens: value.contextWindowTokens, outputProfileId: value.outputProfileId, outputParameterBindings: value.outputParameterBindings ?? [] }, message })
    setCanonical(value); setCanonicalContent(serializeAgentConfig(agent, { kind: 'context', value }) ?? ''); setDraft(value); setEditing(false); setEditor(undefined); setConflict(undefined); setRecoveryRef(undefined)
  }
  const save = async () => {
    if (!dirty || errors.length) { if (!dirty) setEditing(false); return }
    if (!desktopManaged) { dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'context', value: draft } }); setEditing(false); return }
    if (!editor) { setError('缺少服务签发的 ContextPolicy 基线，请重新加载编辑器。'); return }
    setBusy(true); setError(undefined); setConflict(undefined)
    try {
      const result = await saveConfig({ requestId: `save-context-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: 'context', value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent })
      if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(draft, result.kind === 'saved' ? '上下文策略已保存到 AgentPackage' : '上下文策略无变化')
      else if (result.kind === 'baseline_changed') { setConflict(result); setError('context.yaml 已在编辑期间发生变化。请比较三方内容后重新编辑。') }
      else { if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef); setError(result.diagnostics.map((item) => item.message).join('；')) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const reloadConflict = async () => { if (!editor) return; setBusy(true); try { const loaded = await loadConfigEditor({ requestId: `reload-context-${agent.id}`, assetId: editor.asset.id }); const proposed = draft; applyLoaded(loaded); setDraft(proposed); setConflict(undefined); setError(undefined) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const recoverRevision = async () => { if (!editor || !recoveryRef) return; setBusy(true); try { const result = await recoverConfigRevision({ requestId: `recover-context-${agent.id}`, assetId: editor.asset.id, recoveryRef }); if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(draft, '上下文策略 ConfigRevision 已补记'); else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const openHistory = async () => { if (!desktopManaged) { dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'agent', ownerId: agent.id, path: 'config/context.yaml' } }); return } setBusy(true); setError(undefined); try { const loaded = await loadDesktopEditor(`context-history-${agent.id}`); applyLoaded(loaded); const items = await listConfigRevisions(loaded.asset.id); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const selectRevision = async (revision: ConfigRevisionDto) => { setBusy(true); try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const restoreRevision = async () => { if (!editor || !selectedRevision || !restoreConfirmed) return; const parsed = parseAgentContextConfig(selectedContent); if (!parsed) { setError('目标历史版本无法转换为当前页面模型'); return } setBusy(true); try { const result = await restoreConfigRevision({ requestId: `restore-context-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true }); if (result.kind === 'saved' || result.kind === 'unchanged') { commitCanonical(parsed, result.kind === 'saved' ? '上下文策略已恢复为新的 ConfigRevision' : '上下文策略已是目标版本'); setHistoryOpen(false) } else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setDraft(parsed); setConflict(result); setError('context.yaml 已在恢复确认后发生变化。请重新核对。') } else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:context`, dirty, canSave: dirty && !errors.length && !busy, save, cancel: reset } : undefined)
  const outputProfiles = state.assets.filter((item) => item.kind === 'OutputProfile' && item.outputProfile)
  const outputProfileName = outputProfiles.find((item) => item.id === canonical.outputProfileId)?.name ?? '未设置'
  const description = `${desktopManaged ? '真实' : '演示'}保存目标：${agent.packagePath}config/context.yaml`
  const formatTokens = (value: number) => Math.round(value).toLocaleString('zh-CN')
  const triggerTokens = Math.round((editing ? draft.contextWindowTokens : canonical.contextWindowTokens) * (editing ? draft.policy.triggerRatio : canonical.policy.triggerRatio))
  const targetTokens = Math.round((editing ? draft.contextWindowTokens : canonical.contextWindowTokens) * (editing ? draft.policy.targetRatio : canonical.policy.targetRatio))
  return <><section className="panel overflow-hidden"><TabHeader title="上下文" description={description} editing={editing} onEdit={beginEditing} onCancel={reset} onSave={save} canSave={!errors.length && !busy} saveLabel={desktopManaged ? (busy ? '保存中…' : '保存') : '模拟保存'} editDisabled={busy} /><div className="p-5"><div className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">这是供 AI 编程工具构建 RuntimeProjection 时读取的长期策略。Bandi 不读取当前会话、token 使用或压缩次数，也不执行压缩。</div>{editing ? <div className="mt-5 grid gap-5 md:grid-cols-2"><label className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium"><input type="checkbox" checked={draft.policy.enabled} onChange={(event) => updatePolicy('enabled', event.target.checked)} />启用上下文压缩策略</label><ContextNumberField id="context-window" label="规划上下文窗口（Token）" value={draft.contextWindowTokens} min={1000} max={2000000} onChange={(contextWindowTokens) => setDraft((item) => ({ ...item, contextWindowTokens }))} help="用于估算压缩阈值，不代表模型实际上限或当前会话 用量。" /><Labeled label="输出格式"><select className="h-10 w-full px-3" value={draft.outputProfileId ?? ''} onChange={(event) => { const outputProfileId = event.target.value || undefined; setDraft((item) => ({ ...item, outputProfileId, outputParameterBindings: [] })) }}><option value="">未设置</option>{outputProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Labeled><ContextNumberField id="context-trigger" label="触发比例（%）" value={draft.policy.triggerRatio * 100} min={50} max={95} onChange={(value) => updatePolicy('triggerRatio', value / 100)} help="相对于工具解析出的可用上下文预算。" /><ContextNumberField id="context-target" label="压缩后目标（%）" value={draft.policy.targetRatio * 100} min={20} max={80} onChange={(value) => updatePolicy('targetRatio', value / 100)} help="必须至少比触发比例低 10 个百分点。" /><ContextNumberField id="context-recent" label="保护最近对话轮次" value={draft.policy.protectRecentTurns} min={0} max={20} onChange={(value) => updatePolicy('protectRecentTurns', value)} help="一轮表示一次用户输入及其对应响应。" /><ContextNumberField id="context-opening" label="保护开头对话轮次" value={draft.policy.protectOpeningTurns} min={0} max={10} onChange={(value) => updatePolicy('protectOpeningTurns', value)} help="不会据此读取或修改当前会话。" /><div className="rounded-lg border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground md:col-span-2">{draft.policy.enabled ? `预计约在 ${formatTokens(triggerTokens)} Token（${Math.round(draft.policy.triggerRatio * 100)}%）触发，压缩后目标约 ${formatTokens(targetTokens)} Token。` : '策略已关闭，不会按此规划窗口触发。'} Claude Code 映射当前未应用；未来 RuntimeProjection 可映射为 CLAUDE_CODE_AUTO_COMPACT_WINDOW 和 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE。</div></div> : <div className="mt-5"><FieldRow label="状态">{canonical.policy.enabled ? '已启用' : '已关闭'}</FieldRow><FieldRow label="规划窗口">{formatTokens(canonical.contextWindowTokens)} Token</FieldRow><FieldRow label="预计触发与目标">{canonical.policy.enabled ? `约 ${formatTokens(triggerTokens)} Token（${Math.round(canonical.policy.triggerRatio * 100)}%）→ 约 ${formatTokens(targetTokens)} Token（${Math.round(canonical.policy.targetRatio * 100)}%）` : '策略已关闭'}</FieldRow><FieldRow label="保护最近">{canonical.policy.protectRecentTurns} 轮</FieldRow><FieldRow label="保护开头">{canonical.policy.protectOpeningTurns} 轮</FieldRow><FieldRow label="输出格式">{outputProfileName}</FieldRow><FieldRow label="输出参数">{canonical.outputParameterBindings?.length ? canonical.outputParameterBindings.map((item) => item.parameterId).join('、') : '使用格式默认值'}</FieldRow></div>}{errors.length > 0 && editing && <div id="context-errors" role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><ul className="list-disc space-y-1 pl-5">{errors.map((item) => <li key={item}>{item}</li>)}</ul></div>}{error && <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}{conflict && <div className="mt-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="ContextPolicy 外部变化比较">{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>基于当前内容重新编辑</Button></div></div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-muted-foreground">压缩产生的临时摘要不会自动进入正式 Memory；长期沉淀仍需 MemoryCandidate → Review → MemoryRevision。</p><Button variant="ghost" size="sm" disabled={busy || editing} onClick={openHistory}><History size={14} aria-hidden="true" />版本历史</Button></div></div></section><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title="上下文策略版本历史" description="历史版本不可变；恢复会生成新的 ConfigRevision，不表示当前会话 已应用。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={restoreRevision}>恢复为新版本</Button></>}>
    {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="上下文策略配置版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前上下文策略暂无真实 ConfigRevision。</p>}
  </AppDialog>{unsavedDialog}</>
}

function ContextNumberField({ id, label, value, min, max, onChange, help }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void; help: string }) {
  return <div className="block text-sm font-medium"><label htmlFor={id}>{label}</label><input id={id} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-describedby={`${id}-help context-errors`} className="mt-2 h-10 w-full px-3" /><span id={`${id}-help`} className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">{help}</span></div>
}

function SkillReferencesTab({ agent }: { agent: FullAgent }) {
  return <RulesTab agent={agent} mode="skills" />
}

function RulesTab({ agent, mode = 'rules' }: { agent: FullAgent; mode?: 'rules' | 'skills' | 'mcp' | 'sop' }) {
  const { state, dispatch } = useApp()
  const config = mode === 'rules'
    ? { field: 'ruleRefs' as const, label: 'Rule', assetKind: 'Rules', parseRefs: parseAgentRuleRefs }
    : mode === 'skills'
      ? { field: 'skillRefs' as const, label: 'Skill', assetKind: 'Skill', parseRefs: parseAgentSkillRefs }
      : mode === 'mcp'
        ? { field: 'mcpRefs' as const, label: 'MCP', assetKind: 'MCP', parseRefs: parseAgentMcpRefs }
        : { field: 'sopRefs' as const, label: 'SOP', assetKind: 'SOP', parseRefs: parseAgentSopRefs }
  const { field, label, assetKind, parseRefs } = config
  const relativeConfigPath = `config/${mode}.yaml`
  const agentRefs = agent[field]
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  const [canonical, setCanonical] = useState([...agentRefs])
  const [canonicalContent, setCanonicalContent] = useState(() => serializeAgentConfig(agent, { kind: mode, value: agentRefs }) ?? '')
  const [refs, setRefs] = useState([...agentRefs])
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const candidates = state.assets.filter((item) => item.kind === assetKind).filter((item) => mode !== 'skills' || item.skill?.installation.status !== 'available' || refs.includes(item.id))
  const proposedContent = serializeAgentConfig(agent, { kind: mode, value: refs }) ?? ''
  const dirty = editing && proposedContent !== canonicalContent
  useEffect(() => { if (!editing && !historyOpen) { const content = serializeAgentConfig(agent, { kind: mode, value: agentRefs }) ?? ''; setCanonical([...agentRefs]); setCanonicalContent(content); setRefs([...agentRefs]); setEditor(undefined); setConflict(undefined); setError(undefined) } }, [agent, agentRefs, editing, historyOpen, mode])
  const reset = () => { setRefs([...canonical]); setEditing(false); setEditor(undefined); setConflict(undefined); setError(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const toggle = (id: string) => setRefs((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, relativeConfigPath, mode, `${label} 引用资产`)
  const applyLoaded = (loaded: LoadEditorResult) => { const parsed = parseRefs(loaded.canonicalContent); if (!parsed) throw new Error(`磁盘 ${mode}.yaml 无法转换为当前页面模型`); setEditor(loaded); setCanonical(parsed); setCanonicalContent(loaded.canonicalContent); setRefs(parsed) }
  const beginEditing = async () => { if (!desktopManaged) { setEditing(true); return }; setBusy(true); setError(undefined); try { const loaded = await loadDesktopEditor(`${mode}-${agent.id}`); applyLoaded(loaded); setEditing(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const commitCanonical = (value: string[], content: string, message: string) => { dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, [field]: [...value] }, message }); setCanonical([...value]); setCanonicalContent(content); setRefs([...value]); setEditing(false); setEditor(undefined); setConflict(undefined); setRecoveryRef(undefined) }
  const save = async () => {
    if (!dirty) { setEditing(false); return }
    if (!desktopManaged) { dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: mode, value: refs } }); setEditing(false); return }
    if (!editor) { setError(`缺少服务签发的 ${label} 引用基线，请重新加载编辑器。`); return }
    setBusy(true); setError(undefined); setConflict(undefined)
    try { const result = await saveConfig({ requestId: `save-${mode}-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: mode, value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent }); if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(refs, proposedContent, result.kind === 'saved' ? `${label} 引用已保存到 AgentPackage` : `${label} 引用无变化`); else if (result.kind === 'baseline_changed') { setConflict(result); setError(`${mode}.yaml 已在编辑期间发生变化。请比较三方内容后重新编辑。`) } else { if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef); setError(result.diagnostics.map((item) => item.message).join('；')) } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const reloadConflict = async () => { if (!editor) return; setBusy(true); try { const loaded = await loadConfigEditor({ requestId: `reload-${mode}-${agent.id}`, assetId: editor.asset.id }); const proposed = refs; applyLoaded(loaded); setRefs(proposed); setConflict(undefined); setError(undefined) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const recoverRevision = async () => { if (!editor || !recoveryRef) return; setBusy(true); try { const result = await recoverConfigRevision({ requestId: `recover-${mode}-${agent.id}`, assetId: editor.asset.id, recoveryRef }); if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(refs, proposedContent, `${label} 引用 ConfigRevision 已补记`); else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const openHistory = async () => { if (!desktopManaged) { dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'agent', ownerId: agent.id, path: relativeConfigPath } }); return }; setBusy(true); setError(undefined); try { const loaded = await loadDesktopEditor(`${mode}-history-${agent.id}`); applyLoaded(loaded); const items = await listConfigRevisions(loaded.asset.id); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const selectRevision = async (revision: ConfigRevisionDto) => { setBusy(true); try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const restoreRevision = async () => { if (!editor || !selectedRevision || !restoreConfirmed) return; const parsed = parseRefs(selectedContent); if (!parsed) { setError('目标历史版本无法转换为当前页面模型'); return }; setBusy(true); try { const result = await restoreConfigRevision({ requestId: `restore-${mode}-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true }); if (result.kind === 'saved' || result.kind === 'unchanged') { commitCanonical(parsed, selectedContent, result.kind === 'saved' ? `${label} 引用已恢复为新的 ConfigRevision` : `${label} 引用已是目标版本`); setHistoryOpen(false) } else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setRefs(parsed); setConflict(result); setError(`${mode}.yaml 已在恢复确认后发生变化。请重新核对。`) } else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:${mode}`, dirty, canSave: dirty && !busy, save, cancel: reset } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title={mode === 'rules' ? 'Rules' : mode === 'skills' ? 'Skills' : mode === 'mcp' ? 'MCP' : 'SOP'} description={`${desktopManaged ? '真实' : '演示'}保存目标：${agent.packagePath}${relativeConfigPath}`} editing={editing} onEdit={beginEditing} onCancel={reset} onSave={save} canSave={!busy} saveLabel={desktopManaged ? (busy ? '保存中…' : '保存') : '模拟保存'} editDisabled={busy} /><div className="divide-y divide-border">{candidates.map((asset) => <div key={asset.id} className="flex items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><Link to={`/assets/${asset.id}`} className="font-semibold hover:underline">{asset.name}</Link><p className="mt-1 text-xs text-muted-foreground">{asset.sourceType} · {asset.scope} · {asset.path}</p></div>{editing ? <input type="checkbox" checked={refs.includes(asset.id)} onChange={() => toggle(asset.id)} aria-label={`${refs.includes(asset.id) ? '移除' : '添加'} ${asset.name}`} /> : <StatusBadge tone={canonical.includes(asset.id) ? 'success' : 'neutral'}>{canonical.includes(asset.id) ? '已引用' : '未引用'}</StatusBadge>}</div>)}</div>{error && <div role="alert" className="border-t border-danger/30 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}{conflict && <div className="border-t border-border p-4"><div className="grid gap-3 lg:grid-cols-3" aria-label={`${label} 引用外部变化比较`}>{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>基于当前内容重新编辑</Button></div></div>}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><p className="text-xs leading-5 text-muted-foreground">这里只保存显式引用关系，不表示 {label} 已安装、被宿主加载或执行。</p><Button variant="ghost" size="sm" disabled={busy || editing} onClick={openHistory}><History size={14} aria-hidden="true" />版本历史</Button></div></section><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title={`${label} 引用版本历史`} description={`历史版本不可变；恢复会生成新的 ConfigRevision，不会加载或执行 ${label}。`} size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={restoreRevision}>恢复为新版本</Button></>}>
    {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label={`${label} 引用配置版本`}>{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前 {label} 引用暂无真实 ConfigRevision。</p>}
  </AppDialog>{unsavedDialog}</>
}

function MemoryTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const desktop = isDesktopRuntime()
  const demoSpaces = getEligibleMemorySpaces(state, agent.id)
  const [eligibleFormalSpaces, setEligibleFormalSpaces] = useState<MemorySpaceDto[]>([])
  const spaces = desktop ? eligibleFormalSpaces : demoSpaces
  const candidates = state.memoryCandidates.filter((item) => spaces.some((space) => space.id === item.spaceId))
  const [spaceId, setSpaceId] = useState('')
  const [proposedContent, setProposedContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [formalSpaces, setFormalSpaces] = useState<Record<string, MemorySpaceDto>>({})
  const governance = !desktop && spaceId ? resolveMemoryGovernance(state, spaceId, agent.id) : undefined
  const selectedFormalSpace = spaceId ? formalSpaces[spaceId] : undefined
  const selectedReadOnly = selectedFormalSpace?.state === 'read_only_history'
  const scopeLabel = (space: MemorySpaceDto | (typeof demoSpaces)[number]) => {
    if (!desktop) return (space as (typeof demoSpaces)[number]).scopeType
    return { agent_long_term: 'Agent 长期', agent_workspace: 'Agent × Workspace', workspace_shared: 'Workspace 公共', department_workspace: 'Department × Workspace' }[(space as MemorySpaceDto).scopeType]
  }
  const ownerLabel = (space: MemorySpaceDto | (typeof demoSpaces)[number]) => {
    if (!desktop) return (space as (typeof demoSpaces)[number]).owner
    const owner = (space as MemorySpaceDto).owner
    if (owner.kind === 'agent') return owner.agentId
    if (owner.kind === 'workspace') return owner.workspaceId
    return `${owner.departmentId} × ${owner.workspaceId}`
  }
  const reviewerFor = (space: MemorySpaceDto | (typeof demoSpaces)[number]) => desktop ? (space as MemorySpaceDto).reviewerAgentId : (space as (typeof demoSpaces)[number]).reviewer
  const stewardFor = (space: MemorySpaceDto | (typeof demoSpaces)[number]) => desktop ? (space as MemorySpaceDto).stewardAgentId : (space as (typeof demoSpaces)[number]).steward
  const pathFor = (space: MemorySpaceDto | (typeof demoSpaces)[number]) => desktop ? (space as MemorySpaceDto).storageLocator.displayPath : (space as (typeof demoSpaces)[number]).path
  const canPropose = desktop ? Boolean(selectedFormalSpace?.reviewerAgentId && !selectedReadOnly) : Boolean(governance?.canPropose)

  useEffect(() => {
    if (!desktop || agent.packageSource.kind !== 'bandi-managed') return
    let active = true
    Promise.all([
      discoverEligibleMemorySpaces({ requestId: `discover-memory-${agent.id}`, agentId: agent.id }),
      listMemoryReviews(`list-memory-${agent.id}`, agent.id),
    ])
      .then(([discovery, bundles]) => {
        if (!active) return
        setEligibleFormalSpaces(discovery.spaces)
        setFormalSpaces(Object.fromEntries(discovery.spaces.map((space) => [space.id, space])))
        dispatch({ type: 'HYDRATE_FORMAL_MEMORY_REVIEWS', bundles })
        if (discovery.diagnostics.length) setError(discovery.diagnostics.map((item) => item.message).join('；'))
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { active = false }
  }, [agent.id, agent.packageSource.kind, desktop, dispatch])

  const create = async () => {
    const reviewerAgentId = desktop ? selectedFormalSpace?.reviewerAgentId : governance?.reviewerAgentId
    if (!spaceId || !reviewerAgentId || selectedReadOnly || !proposedContent.trim() || creating) return
    const id = `memory-candidate-${agent.id}-${Date.now()}`
    const summary = `${agent.name} 提出的正式记忆修改`
    if (!desktop) {
      dispatch({ type: 'CREATE_MEMORY_CANDIDATE', candidate: { id, spaceId, proposerAgentId: agent.id, reviewerAgentId, summary, current: '当前正式内容', proposed: proposedContent, status: '待审核' } })
      setSpaceId('')
      setProposedContent('')
      return
    }
    setCreating(true)
    setError('')
    try {
      const bundle = await createMemoryCandidate({ requestId: `create-${id}`, candidateId: id, spaceId, proposerAgentId: agent.id, source: { kind: 'manual', label: 'Agent 详情页' }, summary, proposedContent })
      setFormalSpaces((current) => ({ ...current, [bundle.space.id]: bundle.space }))
      dispatch({ type: 'SYNC_FORMAL_MEMORY_CANDIDATE', bundle })
      setSpaceId('')
      setProposedContent('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }

  return <section className="panel overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4"><div><b>正式 MemorySpace</b><p className="mt-1 text-xs text-muted-foreground">正式修改只能创建候选并审核，不能直接保存。</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-medium">唯一目标空间<select aria-label="唯一目标 MemorySpace" className="mt-1 block h-10 max-w-72 px-3 text-sm" value={spaceId} onChange={(event) => { setSpaceId(event.target.value); setError('') }}><option value="">请选择</option>{spaces.map((space) => <option key={space.id} value={space.id}>{scopeLabel(space)} · {ownerLabel(space)}</option>)}</select></label></div></div>{spaceId && <div className="border-b border-border p-5"><label className="block text-sm font-medium">建议写回的完整内容<textarea className="mt-2 min-h-36 w-full p-3 font-mono text-sm" value={proposedContent} onChange={(event) => setProposedContent(event.target.value)} placeholder={selectedReadOnly ? '该空间仅保留历史，不能再提交候选' : '填写审核通过后写入正式 Memory 的完整内容'} disabled={selectedReadOnly} /></label>{selectedReadOnly && <p role="status" className="mt-2 text-sm text-muted-foreground">该 Department × Workspace 关系已失效；历史版本仍可查看，但不能创建新候选。</p>}<div className="mt-3 flex justify-end"><Button disabled={!canPropose || !proposedContent.trim() || creating} onClick={create}><Plus size={15} aria-hidden="true" />{creating ? '正在创建…' : desktop ? '创建正式候选' : '创建演示候选'}</Button></div></div>}{spaceId && governance?.errors.length ? <div role="alert" className="border-b border-danger/30 bg-danger/5 px-5 py-3 text-sm text-danger">{governance.errors.join(' ')}</div> : null}{error && <div role="alert" className="border-b border-danger/30 bg-danger/5 px-5 py-3 text-sm text-danger">{error}</div>}<div className="divide-y divide-border">{spaces.map((space) => <div key={space.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]"><div><b>{scopeLabel(space)}</b><p className="mt-1 text-xs text-muted-foreground">{ownerLabel(space)} · 归口 {stewardFor(space)} · 审核 {reviewerFor(space)}</p><MonoPath>{pathFor(space)}</MonoPath></div><div className="flex flex-wrap items-center justify-end gap-2">{formalSpaces[space.id]?.state === 'read_only_history' && <StatusBadge tone="neutral">只读历史</StatusBadge>}<StatusBadge tone="success">{desktop ? ((space as MemorySpaceDto).currentRevisionId ?? '尚无正式 Revision') : (space as (typeof demoSpaces)[number]).revision}</StatusBadge>{desktop && formalSpaces[space.id]?.id && <MemoryRevisionHistory spaceId={formalSpaces[space.id].id} currentRevisionId={formalSpaces[space.id].currentRevisionId} />}</div></div>)}</div><div className="border-t border-border p-5"><div className="label mb-3">候选</div>{candidates.length ? <div className="space-y-2">{candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } })} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted"><span><b>{candidate.id}</b><small className="ml-2 text-muted-foreground">{candidate.summary}</small></span><StatusBadge tone={candidate.status === '待审核' ? 'warning' : 'success'}>{candidate.status}</StatusBadge></button>)}</div> : <p className="text-sm text-muted-foreground">没有相关候选。</p>}</div></section>
}

function PermissionsTab({ agent }: { agent: FullAgent }) {
  const { dispatch } = useApp()
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  const [editing, setEditing] = useState(false)
  const [canonical, setCanonical] = useState(agent.permissions)
  const [draft, setDraft] = useState(agent.permissions)
  const [canonicalContent, setCanonicalContent] = useState(() => serializeAgentConfig(agent, { kind: 'permissions', value: agent.permissions }) ?? '')
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [challengeRef, setChallengeRef] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [confirmationAction, setConfirmationAction] = useState<'save' | 'restore'>('save')
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(canonical)
  const proposedContent = serializeAgentConfig(agent, { kind: 'permissions', value: draft }) ?? ''
  useEffect(() => {
    if (editing || historyOpen) return
    const content = serializeAgentConfig(agent, { kind: 'permissions', value: agent.permissions }) ?? ''
    setCanonical(agent.permissions); setDraft(agent.permissions); setCanonicalContent(content); setEditor(undefined); setError(undefined); setConflict(undefined)
  }, [agent, editing, historyOpen])
  const reset = () => { setDraft(canonical); setEditing(false); setEditor(undefined); setChallengeRef(undefined); setConfirmOpen(false); setError(undefined); setConflict(undefined); setRecoveryRef(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, 'config/permissions.yaml', 'permissions', 'Permissions 资产')
  const applyLoaded = (loaded: LoadEditorResult) => {
    const parsed = parseAgentPermissions(loaded.canonicalContent)
    if (!parsed) throw new Error('磁盘 permissions.yaml 无法转换为当前页面模型')
    setEditor(loaded); setCanonical(parsed); setDraft(parsed); setCanonicalContent(loaded.canonicalContent)
  }
  const beginEditing = async () => {
    if (!desktopManaged) { setEditing(true); return }
    setBusy(true); setError(undefined)
    try { applyLoaded(await loadDesktopEditor(`permissions-${agent.id}`)); setEditing(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const commitValue = (value: FullAgent['permissions'], content: string, message: string, updateManagedAgent = true) => {
    if (updateManagedAgent) dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, permissions: { ...value } }, message })
    setCanonical({ ...value }); setDraft({ ...value }); setCanonicalContent(content); setEditing(false); setEditor(undefined); setChallengeRef(undefined); setConfirmOpen(false); setConfirmName(''); setUnderstood(false); setConflict(undefined); setRecoveryRef(undefined)
  }
  const commit = (message: string, updateManagedAgent = true) => commitValue(draft, proposedContent, message, updateManagedAgent)
  const handleResult = (result: SaveConfigResult) => {
    if (result.kind === 'saved' || result.kind === 'unchanged') { commit(result.kind === 'saved' ? '长期权限边界已保存到 AgentPackage' : '长期权限边界无变化'); return }
    if (result.kind === 'confirmation_required') { setChallengeRef(result.challenge.id); setConfirmationAction('save'); setConfirmOpen(true); return }
    if (result.kind === 'baseline_changed') { setConflict(result); setError('permissions.yaml 已在编辑期间发生变化。请基于磁盘当前内容重新编辑。'); return }
    if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef)
    setError(result.diagnostics.map((item) => item.message).join('；'))
  }
  const saveDesktop = async (confirmationRef?: string) => {
    if (!editor) { setError('缺少服务签发的 Permissions 基线，请重新加载编辑器。'); return }
    setBusy(true); setError(undefined); setConflict(undefined)
    try { handleResult(await saveConfig({ requestId: `save-permissions-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: 'permissions', value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmationRef })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const save = () => {
    if (!dirty) { setEditing(false); return }
    if (desktopManaged) { void saveDesktop(); return }
    if (draft.files === '任意目录') { setConfirmOpen(true); return }
    dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'permissions', value: draft }, summary: '收紧长期权限' }); commit('已模拟保存长期权限边界', false)
  }
  const restoreRevision = async (confirmationRef?: string) => {
    if (!editor || !selectedRevision) return
    const parsed = parseAgentPermissions(selectedContent)
    if (!parsed) { setError('目标历史版本无法转换为当前页面模型'); return }
    setBusy(true); setError(undefined)
    try {
      const result = await restoreConfigRevision({ requestId: `restore-permissions-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true, confirmationRef })
      if (result.kind === 'saved' || result.kind === 'unchanged') { commitValue(parsed, selectedContent, result.kind === 'saved' ? '长期权限边界已恢复为新的 ConfigRevision' : '长期权限边界已是目标版本'); setHistoryOpen(false); return }
      if (result.kind === 'confirmation_required') { setChallengeRef(result.challenge.id); setConfirmationAction('restore'); setConfirmOpen(true); return }
      if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setDraft(parsed); setConflict(result); setError('permissions.yaml 已在恢复确认后发生变化。请重新核对。'); return }
      if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef)
      setError(result.diagnostics.map((item) => item.message).join('；'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (desktopManaged) { if (challengeRef) { if (confirmationAction === 'restore') await restoreRevision(challengeRef); else await saveDesktop(challengeRef) }; return }
    dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'permissions', value: draft }, summary: '确认扩大长期权限' }); commit('已模拟扩大长期权限边界', false)
  }
  const openHistory = async () => {
    if (!desktopManaged) { dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'agent', ownerId: agent.id, path: 'config/permissions.yaml' } }); return }
    setBusy(true); setError(undefined)
    try { const loaded = await loadDesktopEditor(`permissions-history-${agent.id}`); applyLoaded(loaded); const items = await listConfigRevisions(loaded.asset.id); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const selectRevision = async (revision: ConfigRevisionDto) => { setBusy(true); try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const recoverRevision = async () => { if (!editor || !recoveryRef) return; setBusy(true); try { const result = await recoverConfigRevision({ requestId: `recover-permissions-${agent.id}`, assetId: editor.asset.id, recoveryRef }); if (result.kind === 'saved' || result.kind === 'unchanged') commit('长期权限边界 ConfigRevision 已补记'); else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const reloadConflict = async () => {
    if (!editor) return
    setBusy(true)
    try { applyLoaded(await loadConfigEditor({ requestId: `reload-permissions-${agent.id}`, assetId: editor.asset.id })); setConflict(undefined); setError(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:permissions`, dirty, canSave: dirty && !busy, save, cancel: reset } : undefined)
  const confirmed = confirmName.trim() === agent.name && understood
  return <><div className="grid gap-5 lg:grid-cols-2"><section className="panel p-5"><div className="flex items-center gap-2"><ShieldCheck className="text-success" aria-hidden="true" /><b>当前有效边界</b></div><FieldRow label="文件写入">{canonical.files}</FieldRow><FieldRow label="命令">{canonical.commands}</FieldRow><FieldRow label="网络">{canonical.network}</FieldRow><FieldRow label="委派">{canonical.delegation}</FieldRow></section><section className="panel p-5"><div className="label">边界调整</div><p className="mt-3 text-sm leading-6 text-muted-foreground">{desktopManaged ? '收紧可直接保存；扩大长期权限时，本地服务会签发一次性确认 challenge。' : '当前 Web 模式只模拟保存；扩大到工作区外仍需独立确认。'}</p>{editing ? <><label className="mt-5 block text-sm font-medium">文件写入<select value={draft.files} onChange={(event) => setDraft((value) => ({ ...value, files: event.target.value }))} className="mt-2 h-10 w-full px-3"><option>未授予</option><option>只读当前工作区</option><option>仅当前工作区</option><option>任意目录</option></select></label><div className="mt-4 flex gap-2"><Button variant="outline" disabled={busy} onClick={reset}>取消</Button><Button disabled={!dirty || busy} onClick={save}>{busy ? '保存中…' : desktopManaged ? '保存边界' : '模拟保存'}</Button></div></> : <Button className="mt-5" variant="outline" disabled={busy} onClick={beginEditing}><KeyRound size={16} aria-hidden="true" />{busy ? '加载中…' : '调整权限'}</Button>}</section></div><div className="mt-4 flex justify-end"><Button variant="ghost" size="sm" disabled={busy || editing} onClick={openHistory}><History size={14} aria-hidden="true" />版本历史</Button></div>{error && <div role="alert" className="mt-5 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}{conflict && <div className="mt-5 panel p-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="长期权限外部变化比较">{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>加载磁盘当前内容</Button></div></div>}<AppDialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) { setConfirmName(''); setUnderstood(false) } }} title="确认扩大长期 Agent 权限" description={desktopManaged ? '本次确认只绑定当前资产、拟议内容和短期 challenge；成功后 challenge 立即失效。' : '仅在当前页面更新，不会写入真实配置。'} footer={<><Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>返回编辑</Button><Button variant="danger" disabled={!confirmed || busy || (desktopManaged && !challengeRef)} onClick={confirm}>{busy ? '保存中…' : '确认扩大权限'}</Button></>}><div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm leading-6"><b>影响范围</b><p className="mt-2 text-muted-foreground">Agent：{agent.name}<br />文件写入：{canonical.files} → {draft.files}<br />{desktopManaged ? '只修改长期配置，不表示当前会话 或进程权限已变化。' : '仅更新当前页面，刷新后恢复初始状态。'}</p></div><label className="mt-5 block text-sm font-medium" htmlFor="permission-confirm-name">输入 Agent 名称“{agent.name}”确认<input id="permission-confirm-name" className="mt-2 h-10 w-full px-3" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" /></label><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是长期权限扩大，不是普通配置更新，也不会自动影响当前运行期。</span></label></AppDialog><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title="长期权限版本历史" description="历史版本不可变；恢复会生成新的 ConfigRevision。恢复到更宽边界仍需一次性确认，且不影响当前运行期。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={() => void restoreRevision()}>恢复为新版本</Button></>}>
    {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="长期权限配置版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前长期权限暂无真实 ConfigRevision。</p>}
  </AppDialog>{unsavedDialog}</>
}

function CollaborationTab({ agent }: { agent: FullAgent }) {
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  return desktopManaged ? <ManagedOrchestrationTab agent={agent} /> : <CollaborationMemoryTab agent={agent} />
}

function ManagedOrchestrationTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const [canonical, setCanonical] = useState(agent.orchestrationPolicy)
  const [canonicalContent, setCanonicalContent] = useState(() => serializeAgentConfig(agent, { kind: 'orchestration', value: agent.orchestrationPolicy }) ?? '')
  const [policy, setPolicy] = useState(agent.orchestrationPolicy)
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const proposedContent = serializeAgentConfig(agent, { kind: 'orchestration', value: policy }) ?? ''
  const validationErrors = validateOrchestrationPolicy(policy).map((issue) => issue.message)
  const dirty = editing && proposedContent !== canonicalContent
  const reset = () => { setPolicy(canonical); setEditing(false); setEditor(undefined); setConflict(undefined); setError(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, 'config/orchestration.yaml', 'orchestration', '静态编排策略资产')
  const applyLoaded = (loaded: LoadEditorResult) => { const parsed = parseAgentOrchestrationPolicy(loaded.canonicalContent); if (!parsed) throw new Error('磁盘 orchestration.yaml 无法转换为当前页面模型'); setEditor(loaded); setCanonical(parsed); setCanonicalContent(loaded.canonicalContent); setPolicy(parsed) }
  const beginEditing = async () => { setBusy(true); setError(undefined); try { applyLoaded(await loadDesktopEditor(`orchestration-${agent.id}`)); setEditing(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const commitCanonical = (value: typeof policy, content: string, message: string) => { dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, orchestrationPolicy: value }, message }); setCanonical(value); setCanonicalContent(content); setPolicy(value); setEditing(false); setEditor(undefined); setConflict(undefined); setRecoveryRef(undefined) }
  const save = async () => { if (!dirty) { setEditing(false); return }; if (!editor) { setError('缺少服务签发的静态编排策略基线，请重新加载编辑器。'); return }; setBusy(true); setError(undefined); setConflict(undefined); try { const result = await saveConfig({ requestId: `save-orchestration-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: 'orchestration', value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent }); if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(policy, proposedContent, result.kind === 'saved' ? '静态编排策略已保存到 AgentPackage' : '静态编排策略无变化'); else if (result.kind === 'baseline_changed') { setConflict(result); setError('orchestration.yaml 已在编辑期间发生变化。请比较三方内容后重新编辑。') } else { if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef); setError(result.diagnostics.map((item) => item.message).join('；')) } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const reloadConflict = async () => { if (!editor) return; setBusy(true); try { const proposed = policy; applyLoaded(await loadConfigEditor({ requestId: `reload-orchestration-${agent.id}`, assetId: editor.asset.id })); setPolicy(proposed); setConflict(undefined); setError(undefined) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const recoverRevision = async () => { if (!editor || !recoveryRef) return; setBusy(true); try { const result = await recoverConfigRevision({ requestId: `recover-orchestration-${agent.id}`, assetId: editor.asset.id, recoveryRef }); if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(policy, proposedContent, '静态编排策略 ConfigRevision 已补记'); else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const openHistory = async () => { setBusy(true); setError(undefined); try { const loaded = await loadDesktopEditor(`orchestration-history-${agent.id}`); applyLoaded(loaded); const items = await listConfigRevisions(loaded.asset.id); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const selectRevision = async (revision: ConfigRevisionDto) => { setBusy(true); try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const restoreRevision = async () => { if (!editor || !selectedRevision || !restoreConfirmed) return; const parsed = parseAgentOrchestrationPolicy(selectedContent); if (!parsed) { setError('目标历史版本无法转换为当前页面模型'); return }; setBusy(true); try { const result = await restoreConfigRevision({ requestId: `restore-orchestration-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true }); if (result.kind === 'saved' || result.kind === 'unchanged') { commitCanonical(parsed, selectedContent, result.kind === 'saved' ? '静态编排策略已恢复为新的 ConfigRevision' : '静态编排策略已是目标版本'); setHistoryOpen(false) } else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setPolicy(parsed); setConflict(result); setError('orchestration.yaml 已在恢复确认后发生变化。请重新核对。') } else setError(result.diagnostics.map((item) => item.message).join('；')) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:orchestration`, dirty, canSave: dirty && !busy && !validationErrors.length, save, cancel: reset } : undefined)
  const agentNames = canonical.allowedAgentIds.map((id) => state.agents.find((item) => item.id === id)?.name ?? id)
  const roleNames = canonical.allowedRoleIds.map((id) => state.roles.find((item) => item.id === id)?.name ?? id)
  const departmentNames = canonical.allowedDepartmentIds.map((id) => state.departments.find((item) => item.id === id)?.name ?? id)
  return <><div className="space-y-5"><section className="panel overflow-hidden"><TabHeader title="协作与编排" description={`真实保存目标：${agent.packagePath}config/orchestration.yaml`} editing={editing} onEdit={beginEditing} onCancel={reset} onSave={save} canSave={!busy && !validationErrors.length} saveLabel={busy ? '保存中…' : '保存'} editDisabled={busy} /><div className="p-5">{editing ? <div className="grid gap-4 md:grid-cols-2"><label className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy((value) => ({ ...value, enabled: event.target.checked }))} />允许委派（仍受其他边界约束）</label><Labeled label="最大委派深度"><input type="number" min={0} max={32} className="h-10 w-full px-3" value={policy.maxDelegationDepth} onChange={(event) => setPolicy((value) => ({ ...value, maxDelegationDepth: Number(event.target.value) }))} /></Labeled><Labeled label="允许 Agent"><select multiple className="min-h-32 w-full p-2" value={policy.allowedAgentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedAgentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许岗位"><select multiple className="min-h-32 w-full p-2" value={policy.allowedRoleIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedRoleIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.roles.filter((item) => item.companyId === agent.companyId && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许部门"><select multiple className="min-h-32 w-full p-2" value={policy.allowedDepartmentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedDepartmentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.departments.filter((item) => item.companyId === agent.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><div className="space-y-2 rounded-lg border border-border p-3">{([['requireWorkspaceBinding', '必须有 WorkspaceBinding'], ['requireSopMatch', '必须匹配 SOP'], ['requireServiceGrantForCrossDepartment', '跨部门必须有 ServiceGrant']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy[key]} onChange={(event) => setPolicy((value) => ({ ...value, [key]: event.target.checked }))} />{label}</label>)}</div><Labeled label="升级目标"><select className="h-10 w-full px-3" value={policy.escalationAgentId ?? ''} onChange={(event) => setPolicy((value) => ({ ...value, escalationAgentId: event.target.value || undefined }))}><option value="">未设置</option>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><ListEditor label="升级条件" values={policy.escalationConditions} onChange={(value) => setPolicy((item) => ({ ...item, escalationConditions: value }))} /><ListEditor label="禁止事项" values={policy.prohibitions} onChange={(value) => setPolicy((item) => ({ ...item, prohibitions: value }))} />{validationErrors.length > 0 && <div role="alert" className="text-sm text-danger md:col-span-2">{validationErrors.join(' ')}</div>}</div> : <><div className="label">OrchestrationPolicy</div><h2 className="mt-2 text-lg font-semibold">长期协作与委派边界</h2><div className="mt-5"><FieldRow label="委派状态">{canonical.enabled ? '允许（受其他边界约束）' : '禁止'}</FieldRow><FieldRow label="最大深度">{canonical.maxDelegationDepth}</FieldRow><FieldRow label="允许 Agent">{agentNames.join('、') || '未授权任何 Agent'}</FieldRow><FieldRow label="允许岗位">{roleNames.join('、') || '未授权任何岗位'}</FieldRow><FieldRow label="允许部门">{departmentNames.join('、') || '未授权任何部门'}</FieldRow><FieldRow label="必需条件">{[canonical.requireWorkspaceBinding && '需要 WorkspaceBinding', canonical.requireSopMatch && '需要 SOP 匹配', canonical.requireServiceGrantForCrossDepartment && '跨部门需要 ServiceGrant'].filter(Boolean).join('；') || '无附加条件'}</FieldRow><FieldRow label="升级目标">{state.agents.find((item) => item.id === canonical.escalationAgentId)?.name ?? canonical.escalationAgentId ?? '未设置'}</FieldRow><FieldRow label="禁止事项">{canonical.prohibitions.join('；')}</FieldRow></div></>}</div>{error && <div role="alert" className="border-t border-danger/30 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}{conflict && <div className="border-t border-border p-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="静态编排策略外部变化比较">{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>基于当前内容重新编辑</Button></div></div>}<div className="flex justify-end border-t border-border p-4"><Button variant="ghost" size="sm" disabled={busy || editing} onClick={openHistory}><History size={14} aria-hidden="true" />版本历史</Button></div></section><div className="grid gap-5 lg:grid-cols-2"><ManagedComponentReferences agent={agent} componentKind="Hook" /><ManagedComponentReferences agent={agent} componentKind="Command" /></div><MockBoundaryNote>OrchestrationPolicy、Hook 与 Command 引用分别保存到独立资产，不伪装跨文件原子事务。引用只维护长期定义和非敏感参数，不表示已触发、执行或被当前会话 加载。</MockBoundaryNote></div><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title="静态编排策略版本历史" description="历史版本不可变；恢复会生成新的 ConfigRevision，不会创建任务、选择人员或推进流程。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={restoreRevision}>恢复为新版本</Button></>}>
    {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="静态编排策略版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前静态编排策略暂无真实 ConfigRevision。</p>}
  </AppDialog>{unsavedDialog}</>
}

function ManagedComponentReferences({ agent, componentKind }: { agent: FullAgent; componentKind: 'Hook' | 'Command' }) {
  const { state, dispatch } = useApp()
  const key = componentKind === 'Hook' ? 'hooks' : 'commands'
  const field = componentKind === 'Hook' ? 'hookRefs' : 'commandRefs'
  const initialReferences = agent[field]
  const label = `${componentKind} 引用`
  const fileName = `${key}.yaml`
  const [canonical, setCanonical] = useState(initialReferences)
  const [canonicalContent, setCanonicalContent] = useState(() => serializeAgentConfig(agent, { kind: key, value: initialReferences }) ?? '')
  const [references, setReferences] = useState(initialReferences)
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const candidates = state.assets.filter((item) => item.kind === componentKind)
  const proposedContent = serializeAgentConfig(agent, { kind: key, value: references }) ?? ''
  const validationErrors = references.flatMap((reference) => {
    const asset = candidates.find((item) => item.id === reference.assetId)
    const definition = componentKind === 'Hook' ? asset?.hook : asset?.command
    if (!asset || !definition) return [`${componentKind} ${reference.assetId} 的定义不存在或类型不匹配。`]
    return validateParameterBindings(definition.parameters, reference.parameterBindings).map((issue) => `${asset.name}：${issue.message}`)
  })
  const dirty = editing && proposedContent !== canonicalContent
  const reset = () => { setReferences(canonical); setEditing(false); setEditor(undefined); setConflict(undefined); setRecoveryRef(undefined); setError(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const loadDesktopEditor = (requestId: string) => loadManagedAgentAssetEditor(agent, requestId, `config/${fileName}`, key, `${label}资产`)
  const applyLoaded = (loaded: LoadEditorResult) => {
    const parsed = parseAgentComponentRefs(loaded.canonicalContent, key)
    if (!parsed) throw new Error(`磁盘 ${fileName} 无法转换为当前页面模型`)
    setEditor(loaded); setCanonical(parsed); setCanonicalContent(loaded.canonicalContent); setReferences(parsed)
  }
  const beginEditing = async () => {
    setBusy(true); setError(undefined)
    try { applyLoaded(await loadDesktopEditor(`${key}-${agent.id}`)); setEditing(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const toggle = (assetId: string) => setReferences((items) => items.some((item) => item.assetId === assetId) ? items.filter((item) => item.assetId !== assetId) : [...items, { assetId, parameterBindings: [] }])
  const updateBindings = (assetId: string, parameterBindings: ParameterBinding[]) => setReferences((items) => items.map((item) => item.assetId === assetId ? { ...item, parameterBindings } : item))
  const commitCanonical = (value: FullAgent['hookRefs'], content: string, message: string) => {
    dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, [field]: value }, message })
    setCanonical(value); setCanonicalContent(content); setReferences(value); setEditing(false); setEditor(undefined); setConflict(undefined); setRecoveryRef(undefined)
  }
  const save = async () => {
    if (!dirty) { setEditing(false); return }
    if (!editor) { setError(`缺少服务签发的 ${label}基线，请重新加载。`); return }
    if (validationErrors.length) { setError(validationErrors.join('；')); return }
    setBusy(true); setError(undefined); setConflict(undefined)
    try {
      const result = await saveConfig({ requestId: `save-${key}-${agent.id}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id }, change: { kind: key, value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent })
      if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(references, proposedContent, result.kind === 'saved' ? `${label}已保存到 AgentPackage` : `${label}无变化`)
      else if (result.kind === 'baseline_changed') { setConflict(result); setError(`${fileName} 已在编辑期间发生变化。请比较三方内容后重新编辑。`) }
      else { if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef); setError(result.diagnostics.map((item) => item.message).join('；')) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const reloadConflict = async () => {
    if (!editor) return
    const proposed = references
    setBusy(true)
    try { applyLoaded(await loadConfigEditor({ requestId: `reload-${key}-${agent.id}`, assetId: editor.asset.id })); setReferences(proposed); setConflict(undefined); setError(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const recoverRevision = async () => {
    if (!editor || !recoveryRef) return
    setBusy(true)
    try {
      const result = await recoverConfigRevision({ requestId: `recover-${key}-${agent.id}`, assetId: editor.asset.id, recoveryRef })
      if (result.kind === 'saved' || result.kind === 'unchanged') commitCanonical(references, proposedContent, `${label} ConfigRevision 已补记`)
      else setError(result.diagnostics.map((item) => item.message).join('；'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const openHistory = async () => {
    setBusy(true); setError(undefined)
    try {
      const loaded = await loadDesktopEditor(`${key}-history-${agent.id}`)
      applyLoaded(loaded)
      const items = await listConfigRevisions(loaded.asset.id)
      setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const selectRevision = async (revision: ConfigRevisionDto) => {
    setBusy(true)
    try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const restoreRevision = async () => {
    if (!editor || !selectedRevision || !restoreConfirmed) return
    const parsed = parseAgentComponentRefs(selectedContent, key)
    if (!parsed) { setError(`目标 ${componentKind} 历史版本无法转换为当前页面模型`); return }
    setBusy(true)
    try {
      const result = await restoreConfigRevision({ requestId: `restore-${key}-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true })
      if (result.kind === 'saved' || result.kind === 'unchanged') { commitCanonical(parsed, selectedContent, result.kind === 'saved' ? `${label}已恢复为新的 ConfigRevision` : `${label}已是目标版本`); setHistoryOpen(false) }
      else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setEditing(true); setReferences(parsed); setConflict(result); setError(`${fileName} 已在恢复确认后发生变化。请重新核对。`) }
      else setError(result.diagnostics.map((item) => item.message).join('；'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:${key}`, dirty, canSave: dirty && !busy && !validationErrors.length, save, cancel: reset } : undefined)
  return <>
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3"><div><b>{label}</b><p className="mt-1 text-xs text-muted-foreground">独立保存到 config/{fileName}，只维护定义引用和非敏感参数，不{componentKind === 'Hook' ? '触发 Hook' : '执行 Command'}。</p></div>{editing ? <div className="flex gap-2"><Button variant="outline" size="sm" onClick={reset}>取消</Button><Button size="sm" disabled={!dirty || busy || Boolean(validationErrors.length)} onClick={save}>{busy ? '保存中…' : '保存'}</Button></div> : <Button variant="outline" size="sm" disabled={busy} onClick={beginEditing}>{busy ? '加载中…' : '编辑'}</Button>}</div>
      <div className="mt-4 space-y-3">{candidates.map((asset) => { const reference = references.find((item) => item.assetId === asset.id); const definition = componentKind === 'Hook' ? asset.hook : asset.command; return <div key={asset.id} className="rounded-lg border border-border p-3"><label className="flex items-start gap-2 text-sm font-medium"><input className="mt-1" type="checkbox" disabled={!editing} checked={Boolean(reference)} onChange={() => toggle(asset.id)} />{asset.name}</label>{editing && reference && definition && <div className="mt-3"><ParameterBindingEditor legend={`${componentKind} 参数`} definitions={definition.parameters} bindings={reference.parameterBindings} onChange={(value) => updateBindings(asset.id, value)} /></div>}</div> })}{!candidates.length && <p className="text-sm text-muted-foreground">没有可引用的 {componentKind} 资产。</p>}</div>
      {validationErrors.length > 0 && editing && <div role="alert" className="mt-3 text-sm text-danger">{validationErrors.join('；')}</div>}
      {error && <div role="alert" className="mt-3 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}
      {conflict && <div className="mt-4"><div className="grid gap-3 lg:grid-cols-3" aria-label={`${label}外部变化比较`}>{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>基于当前内容重新编辑</Button></div></div>}
      <div className="mt-4 flex justify-end"><Button variant="ghost" size="sm" disabled={busy || editing} onClick={openHistory}><History size={14} aria-hidden="true" />版本历史</Button></div>
    </section>
    <AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false) } }} title={`${label}版本历史`} description={`历史版本不可变；恢复会生成新的 ConfigRevision，不会${componentKind === 'Hook' ? '触发 Hook' : '执行 Command'}。`} size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={restoreRevision}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label={`${label}版本`}>{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前内容与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前{label}暂无真实 ConfigRevision。</p>}
    </AppDialog>
    {unsavedDialog}
  </>
}

function CollaborationMemoryTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [policy, setPolicy] = useState(agent.orchestrationPolicy)
  const [hookRefs, setHookRefs] = useState(agent.hookRefs)
  const [commandRefs, setCommandRefs] = useState(agent.commandRefs)
  useEffect(() => { if (!editing) { setPolicy(agent.orchestrationPolicy); setHookRefs(agent.hookRefs); setCommandRefs(agent.commandRefs) } }, [agent.commandRefs, agent.hookRefs, agent.orchestrationPolicy, editing])
  const dirty = editing && (JSON.stringify(policy) !== JSON.stringify(agent.orchestrationPolicy) || JSON.stringify(hookRefs) !== JSON.stringify(agent.hookRefs) || JSON.stringify(commandRefs) !== JSON.stringify(agent.commandRefs))
  const reset = () => { setPolicy(agent.orchestrationPolicy); setHookRefs(agent.hookRefs); setCommandRefs(agent.commandRefs); setEditing(false) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const save = () => { if (!dirty) { setEditing(false); return }; if (JSON.stringify(policy) !== JSON.stringify(agent.orchestrationPolicy)) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'orchestration', value: policy } }); if (JSON.stringify(hookRefs) !== JSON.stringify(agent.hookRefs)) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'hooks', value: hookRefs } }); if (JSON.stringify(commandRefs) !== JSON.stringify(agent.commandRefs)) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'commands', value: commandRefs } }); setEditing(false) }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:collaboration`, dirty, canSave: dirty, save, cancel: reset } : undefined)
  const agentNames = agent.orchestrationPolicy.allowedAgentIds.map((id) => state.agents.find((item) => item.id === id)?.name ?? id)
  const roleNames = agent.orchestrationPolicy.allowedRoleIds.map((id) => state.roles.find((item) => item.id === id)?.name ?? id)
  const departmentNames = agent.orchestrationPolicy.allowedDepartmentIds.map((id) => state.departments.find((item) => item.id === id)?.name ?? id)
  return <><div className="space-y-5"><section className="panel overflow-hidden"><TabHeader title="协作与编排" description="只管理静态边界；有效委派仍取权限、组织、服务授权和此策略的交集。" editing={editing} onEdit={() => setEditing(true)} onCancel={reset} onSave={save} /><div className="p-5">{editing ? <div className="grid gap-4 md:grid-cols-2"><label className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy((value) => ({ ...value, enabled: event.target.checked }))} />允许委派（仍受其他边界约束）</label><Labeled label="最大委派深度"><input type="number" min={0} className="h-10 w-full px-3" value={policy.maxDelegationDepth} onChange={(event) => setPolicy((value) => ({ ...value, maxDelegationDepth: Number(event.target.value) }))} /></Labeled><Labeled label="允许 Agent"><select multiple className="min-h-32 w-full p-2" value={policy.allowedAgentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedAgentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许岗位"><select multiple className="min-h-32 w-full p-2" value={policy.allowedRoleIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedRoleIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.roles.filter((item) => item.companyId === agent.companyId && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许部门"><select multiple className="min-h-32 w-full p-2" value={policy.allowedDepartmentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedDepartmentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.departments.filter((item) => item.companyId === agent.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><div className="space-y-2 rounded-lg border border-border p-3">{([['requireWorkspaceBinding', '必须有 WorkspaceBinding'], ['requireSopMatch', '必须匹配 SOP'], ['requireServiceGrantForCrossDepartment', '跨部门必须有 ServiceGrant']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy[key]} onChange={(event) => setPolicy((value) => ({ ...value, [key]: event.target.checked }))} />{label}</label>)}</div><Labeled label="升级目标"><select className="h-10 w-full px-3" value={policy.escalationAgentId ?? ''} onChange={(event) => setPolicy((value) => ({ ...value, escalationAgentId: event.target.value || undefined }))}><option value="">未设置</option>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><ListEditor label="升级条件" values={policy.escalationConditions} onChange={(value) => setPolicy((item) => ({ ...item, escalationConditions: value }))} /><ListEditor label="禁止事项" values={policy.prohibitions} onChange={(value) => setPolicy((item) => ({ ...item, prohibitions: value }))} /><ComponentReferenceEditor title="Hook 引用" kind="Hook" references={hookRefs} assets={state.assets} onChange={setHookRefs} /><ComponentReferenceEditor title="Command 引用" kind="Command" references={commandRefs} assets={state.assets} onChange={setCommandRefs} /></div> : <><div className="label">OrchestrationPolicy</div><h2 className="mt-2 text-lg font-semibold">长期协作与委派边界</h2><div className="mt-5"><FieldRow label="委派状态">{agent.orchestrationPolicy.enabled ? '允许（受其他边界约束）' : '禁止'}</FieldRow><FieldRow label="最大深度">{agent.orchestrationPolicy.maxDelegationDepth}</FieldRow><FieldRow label="允许 Agent">{agentNames.join('、') || '未授权任何 Agent'}</FieldRow><FieldRow label="允许岗位">{roleNames.join('、') || '未授权任何岗位'}</FieldRow><FieldRow label="允许部门">{departmentNames.join('、') || '未授权任何部门'}</FieldRow><FieldRow label="必需条件">{[agent.orchestrationPolicy.requireWorkspaceBinding && '需要 WorkspaceBinding', agent.orchestrationPolicy.requireSopMatch && '需要 SOP 匹配', agent.orchestrationPolicy.requireServiceGrantForCrossDepartment && '跨部门需要 ServiceGrant'].filter(Boolean).join('；') || '无附加条件'}</FieldRow><FieldRow label="升级目标">{state.agents.find((item) => item.id === agent.orchestrationPolicy.escalationAgentId)?.name ?? agent.orchestrationPolicy.escalationAgentId ?? '未设置'}</FieldRow><FieldRow label="禁止事项">{agent.orchestrationPolicy.prohibitions.join('；')}</FieldRow></div></>}</div></section>{!editing && <div className="grid gap-5 lg:grid-cols-2"><ComponentReferences title="Hook 引用" references={agent.hookRefs} assets={state.assets} kind="Hook" /><ComponentReferences title="Command 引用" references={agent.commandRefs} assets={state.assets} kind="Command" /></div>}<MockBoundaryNote>存在引用不表示 Hook 已触发、Command 已执行或当前会话已加载；Bandi 不接受 Shell、cwd、环境变量或可执行程序。</MockBoundaryNote></div>{unsavedDialog}</>
}

function ComponentReferenceEditor({ title, kind, references, assets, onChange }: { title: string; kind: 'Hook' | 'Command'; references: FullAgent['hookRefs']; assets: ReturnType<typeof useApp>['state']['assets']; onChange: (value: FullAgent['hookRefs']) => void }) {
  const candidates = assets.filter((item) => item.kind === kind)
  return <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{title}</legend><div className="mt-2 space-y-2">{candidates.map((asset) => <label key={asset.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={references.some((item) => item.assetId === asset.id)} onChange={() => onChange(references.some((item) => item.assetId === asset.id) ? references.filter((item) => item.assetId !== asset.id) : [...references, { assetId: asset.id, parameterBindings: [] }])} />{asset.name}</label>)}{!candidates.length && <p className="text-xs text-muted-foreground">无可用资产</p>}</div></fieldset>
}

function ComponentReferences({ title, references, assets, kind }: { title: string; references: FullAgent['hookRefs']; assets: ReturnType<typeof useApp>['state']['assets']; kind: 'Hook' | 'Command' }) {
  return <section className="panel p-5"><div className="flex items-center justify-between gap-3"><b>{title}</b><StatusBadge tone="neutral">{references.length}</StatusBadge></div><div className="mt-4 space-y-3">{references.map((reference) => { const asset = assets.find((item) => item.id === reference.assetId); return <div key={reference.assetId} className="rounded-lg border border-border p-3"><Link to={`/assets/${reference.assetId}`} className="font-medium hover:underline">{asset?.name ?? reference.assetId}</Link><p className="mt-1 text-xs text-muted-foreground">{asset?.kind === kind ? `${reference.parameterBindings.length} 个参数绑定` : `引用类型异常，应为 ${kind}`}</p></div> })}{!references.length && <p className="text-sm text-muted-foreground">没有显式引用。</p>}</div></section>
}

function WorkspacesTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const desktopManaged = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  const [editingId, setEditingId] = useState<string>()
  const [draft, setDraft] = useState<WorkspaceBindingConfig>()
  const [canonicalContent, setCanonicalContent] = useState('')
  const [editor, setEditor] = useState<LoadEditorResult>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<Extract<SaveConfigResult, { kind: 'baseline_changed' }>>()
  const [recoveryRef, setRecoveryRef] = useState<string>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<ConfigRevisionDto[]>([])
  const [selectedRevision, setSelectedRevision] = useState<ConfigRevisionDto>()
  const [selectedContent, setSelectedContent] = useState('')
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const canonicalBinding = agent.workspaceBindings.find((item) => item.workspaceId === editingId)
  const memoryRevision = canonicalBinding?.memoryRevision ?? ''
  const proposedContent = draft ? serializeAgentConfig(agent, { kind: 'workspace-binding', value: draft }) ?? '' : ''
  const dirty = Boolean(draft && proposedContent !== canonicalContent)
  const reset = () => { setDraft(undefined); setCanonicalContent(''); setEditingId(undefined); setEditor(undefined); setError(undefined); setConflict(undefined); setRecoveryRef(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const cloneConfig = (binding: WorkspaceBinding): WorkspaceBindingConfig => ({ workspaceId: binding.workspaceId, instructions: binding.instructions, ruleIds: [...binding.ruleIds], skillIds: [...binding.skillIds], mcpIds: [...binding.mcpIds], contextPolicy: binding.contextPolicy ? { ...binding.contextPolicy } : undefined, outputProfileId: binding.outputProfileId, outputParameterBindings: [...(binding.outputParameterBindings ?? [])], orchestrationPolicy: binding.orchestrationPolicy ? { ...binding.orchestrationPolicy } : undefined, hookRefs: (binding.hookRefs ?? []).map((reference) => ({ ...reference, parameterBindings: [...reference.parameterBindings] })), commandRefs: (binding.commandRefs ?? []).map((reference) => ({ ...reference, parameterBindings: [...reference.parameterBindings] })) })
  const loadDesktopEditor = (workspaceId: string, requestId: string) => loadManagedAgentAssetEditor(agent, requestId, `workspaces/${workspaceId}/config.yaml`, 'workspace_binding', 'WorkspaceBinding', [workspaceId])
  const applyLoaded = (loaded: LoadEditorResult) => {
    const value = parseWorkspaceBindingConfig(loaded.canonicalContent, agent)
    if (!value) throw new Error('WorkspaceBinding 正文不符合当前 schema 或扩大了 Agent 根级边界')
    setEditingId(value.workspaceId); setCanonicalContent(loaded.canonicalContent); setDraft(value); setEditor(loaded)
  }
  const edit = async (binding: WorkspaceBinding) => {
    setError(undefined); setConflict(undefined)
    if (!desktopManaged) { const config = cloneConfig(binding); setEditingId(binding.workspaceId); setCanonicalContent(serializeAgentConfig(agent, { kind: 'workspace-binding', value: config }) ?? ''); setDraft(config); return }
    setBusy(true)
    try { applyLoaded(await loadDesktopEditor(binding.workspaceId, `workspace-binding-${agent.id}-${binding.workspaceId}`)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const availableWorkspaces = state.workspaces.filter((item) => !agent.workspaceBindings.some((binding) => binding.workspaceId === item.id))
  const openCreate = () => { setSelectedWorkspaceId(''); setCreateOpen(true) }
  const confirmCreate = () => {
    if (!selectedWorkspaceId || !availableWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)) return
    const binding: WorkspaceBindingConfig = { workspaceId: selectedWorkspaceId, instructions: '', ruleIds: [], skillIds: [], mcpIds: [] }
    setEditingId(selectedWorkspaceId); setCanonicalContent(''); setDraft(binding); setEditor(undefined); setError(undefined); setConflict(undefined); setCreateOpen(false); setSelectedWorkspaceId('')
  }
  const toggle = (field: 'ruleIds' | 'skillIds' | 'mcpIds', id: string) => setDraft((value) => value ? { ...value, [field]: value[field].includes(id) ? value[field].filter((item) => item !== id) : [...value[field], id] } : value)
  const updateContext = (contextPolicy?: ContextPolicyOverride) => setDraft((value) => value ? { ...value, contextPolicy } : value)
  const updateOutputProfile = (outputProfileId?: string) => setDraft((value) => value ? { ...value, outputProfileId, outputParameterBindings: [] } : value)
  const updateOutputParameters = (outputParameterBindings: ParameterBinding[]) => setDraft((value) => value ? { ...value, outputParameterBindings } : value)
  const updateOrchestration = (orchestrationPolicy?: WorkspaceBinding['orchestrationPolicy']) => setDraft((value) => value ? { ...value, orchestrationPolicy } : value)
  const updateComponentRefs = (field: 'hookRefs' | 'commandRefs', references: FullAgent['hookRefs']) => setDraft((value) => value ? { ...value, [field]: references } : value)
  const outputProfile = state.assets.find((item) => item.id === draft?.outputProfileId && item.kind === 'OutputProfile')?.outputProfile
  const draftErrors = draft ? [...validateWorkspaceBindingConfig(agent, draft), ...validateOrchestrationOverride(agent.orchestrationPolicy, draft.orchestrationPolicy ?? {}).map((issue) => issue.message), ...validateParameterBindings(outputProfile?.parameters ?? [], draft.outputParameterBindings ?? []).map((issue) => issue.message)] : []
  const commit = (value: WorkspaceBindingConfig, message: string) => {
    const next = applyAgentConfig(agent, { kind: 'workspace-binding', value })
    if (!next) throw new Error('WorkspaceBinding 保存结果无法应用到当前 Agent')
    dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: next, message })
  }
  const save = async () => {
    if (!draft || !dirty || draftErrors.length) return
    if (!desktopManaged) { dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'workspace-binding', value: draft } }); reset(); return }
    if (!proposedContent) { setError('WorkspaceBinding 无法序列化，请修复配置后重试。'); return }
    setBusy(true); setError(undefined); setConflict(undefined)
    try {
      const result = editor
        ? await saveConfig({ requestId: `save-workspace-binding-${agent.id}-${draft.workspaceId}`, assetId: editor.asset.id, expectedOwner: { agentId: agent.id, workspaceId: draft.workspaceId }, change: { kind: 'workspace_binding', value: proposedContent }, expectedBaseline: editor.baselineRef, baseContent: canonicalContent })
        : await createWorkspaceBinding({ requestId: `create-workspace-binding-${agent.id}-${draft.workspaceId}`, agentId: agent.id, workspaceId: draft.workspaceId, value: proposedContent })
      if (result.kind === 'saved' || result.kind === 'unchanged') { commit(draft, result.kind === 'saved' ? 'WorkspaceBinding 已保存到 AgentPackage' : 'WorkspaceBinding 无变化'); reset() }
      else if (result.kind === 'baseline_changed') { setConflict(result); setError('WorkspaceBinding 已在编辑期间发生变化。请比较后基于磁盘当前内容重新编辑。') }
      else { const message = result.diagnostics.map((item) => item.message).join('；') || 'WorkspaceBinding 保存失败'; if (result.kind === 'save_failed' && result.recoveryRef) setRecoveryRef(result.recoveryRef); setError(message) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const reloadConflict = async () => { if (!draft) return; setBusy(true); try { const proposed = draft; applyLoaded(await loadDesktopEditor(draft.workspaceId, `reload-workspace-binding-${agent.id}`)); setDraft(proposed); setConflict(undefined); setError(undefined) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const recoverRevision = async () => { if (!draft || !recoveryRef) return; setBusy(true); setError(undefined); try { const loaded = editor ?? await loadDesktopEditor(draft.workspaceId, `recover-workspace-binding-${agent.id}`); const result = await recoverConfigRevision({ requestId: `recover-workspace-binding-${agent.id}`, assetId: loaded.asset.id, recoveryRef }); if (result.kind === 'saved' || result.kind === 'unchanged') { commit(draft, 'WorkspaceBinding ConfigRevision 已补记'); reset() } else setError(result.diagnostics.map((item) => item.message).join('；') || 'ConfigRevision 补记失败') } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const openHistory = async (workspaceId: string) => { if (!desktopManaged) { dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'config-history', ownerType: 'agent', ownerId: agent.id, path: `workspaces/${workspaceId}/config.yaml` } }); return } setBusy(true); setError(undefined); try { const loaded = await loadDesktopEditor(workspaceId, `workspace-binding-history-${agent.id}`); const items = await listConfigRevisions(loaded.asset.id); setEditor(loaded); setEditingId(workspaceId); setCanonicalContent(loaded.canonicalContent); setRevisions(items); setSelectedRevision(items[0]); setSelectedContent(items[0] ? await readConfigRevisionContent(items[0].id) : ''); setRestoreConfirmed(false); setHistoryOpen(true) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const selectRevision = async (revision: ConfigRevisionDto) => { setBusy(true); try { setSelectedRevision(revision); setSelectedContent(await readConfigRevisionContent(revision.id)); setRestoreConfirmed(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const restoreRevision = async () => { if (!editor || !selectedRevision || !restoreConfirmed) return; const value = parseWorkspaceBindingConfig(selectedContent, agent); if (!value) { setError('目标历史版本不符合当前 WorkspaceBinding 边界，无法恢复。'); return } setBusy(true); setError(undefined); try { const result = await restoreConfigRevision({ requestId: `restore-workspace-binding-${agent.id}`, assetId: editor.asset.id, revisionId: selectedRevision.id, expectedBaseline: editor.baselineRef, baseContent: canonicalContent, confirmed: true }); if (result.kind === 'saved' || result.kind === 'unchanged') { commit(value, result.kind === 'saved' ? 'WorkspaceBinding 已恢复为新的 ConfigRevision' : 'WorkspaceBinding 已是目标版本'); setHistoryOpen(false); reset() } else if (result.kind === 'baseline_changed') { setHistoryOpen(false); setDraft(value); setConflict(result); setError('WorkspaceBinding 已在恢复确认后发生变化，请重新核对。') } else setError(result.diagnostics.map((item) => item.message).join('；') || 'WorkspaceBinding 恢复失败') } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  useRegisterEditorSession(draft ? { id: `agent:${agent.id}:workspace-binding`, dirty, canSave: dirty && !draftErrors.length && !busy, save, cancel: reset } : undefined)
  const availableWorkspace = availableWorkspaces.length > 0
  const editorNode = draft ? <WorkspaceBindingEditor draft={draft} memoryRevision={memoryRevision} agentPolicy={agent.contextPolicy} agentOrchestration={agent.orchestrationPolicy} assets={state.assets} onInstructions={(instructions) => setDraft({ ...draft, instructions })} onToggle={toggle} onContext={updateContext} onOutputProfile={updateOutputProfile} onOutputParameters={updateOutputParameters} onOrchestration={updateOrchestration} onComponentRefs={updateComponentRefs} validationErrors={draftErrors} onCancel={reset} onSave={save} busy={busy} saveLabel={desktopManaged ? (busy ? '保存中…' : '保存') : '模拟保存'} /> : null
  return <><section className="panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><b>工作区专属配置</b><p className="mt-1 text-xs text-muted-foreground">保存为 workspaces/&lt;workspace-id&gt;/config.yaml；正式 Memory 不在这里编辑。{desktopManaged ? ' Desktop 使用真实 AgentPackage。' : ' 当前仅保存到页面内存。'}</p></div><Button variant="outline" size="sm" disabled={!availableWorkspace || Boolean(draft) || busy} onClick={openCreate}><Plus size={15} aria-hidden="true" />新建 Binding</Button></div>{busy && <p role="status" className="border-b border-border px-5 py-3 text-sm text-muted-foreground">正在处理 WorkspaceBinding…</p>}{error && <div role="alert" className="border-b border-danger/30 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p>{recoveryRef && <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={recoverRevision}>补记 ConfigRevision</Button>}</div>}{conflict && <div className="border-b border-border p-4"><div className="grid gap-3 lg:grid-cols-3" aria-label="WorkspaceBinding 外部变化比较">{([{ label: '开始编辑时', side: conflict.base }, { label: '磁盘当前内容', side: conflict.current }, { label: '你的拟议内容', side: conflict.proposed }] as const).map(({ label, side }) => <section key={label} className="min-w-0 rounded-lg border border-border p-3"><b className="text-xs">{label}</b><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{side.content}</pre></section>)}</div><div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={reloadConflict}>基于当前内容重新编辑</Button></div></div>}<div className="divide-y divide-border">{agent.workspaceBindings.map((binding) => { const workspace = state.workspaces.find((item) => item.id === binding.workspaceId); const isEditing = draft?.workspaceId === binding.workspaceId; return <div key={binding.workspaceId} className="p-5">{isEditing ? editorNode : <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"><div>{workspace ? <Link to={`/workspaces/${binding.workspaceId}?tab=agents`} className="font-semibold hover:underline">{workspace.name}</Link> : <b>{binding.workspaceId}</b>}<p className="mt-1 text-xs text-muted-foreground">{workspace ? `正式项目记忆 ${binding.memoryRevision || '未设置'}` : '工作区索引缺失 · Binding 仍保留'}</p></div><div className="text-sm text-muted-foreground">Rules {binding.ruleIds.length} · Skills {binding.skillIds.length} · MCP {binding.mcpIds.length}<p className="mt-1">上下文：{binding.contextPolicy ? `覆盖 ${Object.keys(binding.contextPolicy).length} 项` : '继承'} · 输出格式：{binding.outputProfileId ? '显式' : '继承'}</p><p className="mt-1 line-clamp-2">{binding.instructions || '未设置专属 Instructions'}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={!workspace || !binding.ruleIds.length ? 'warning' : 'success'}>{!workspace ? '索引缺失' : binding.ruleIds.length ? '配置完整' : '缺少 Rules'}</StatusBadge><Button variant="ghost" size="sm" disabled={Boolean(draft) || busy} onClick={() => openHistory(binding.workspaceId)}><History size={14} aria-hidden="true" />历史</Button><Button variant="outline" size="sm" disabled={Boolean(draft) || busy} onClick={() => edit(binding)}>编辑</Button></div></div>}</div>})}{draft && !canonicalBinding && <div className="p-5">{editorNode}</div>}{!agent.workspaceBindings.length && !draft && <div className="p-5 text-sm text-muted-foreground">尚未创建 Agent × 工作区专属配置。</div>}</div></section><AppDialog open={historyOpen} onOpenChange={(open) => { setHistoryOpen(open); if (!open) { setSelectedRevision(undefined); setRestoreConfirmed(false); setEditingId(undefined); setEditor(undefined) } }} title="WorkspaceBinding 版本历史" description="历史版本不可变；恢复会重新验证 Workspace Registry 和当前 baseline，并生成新的 ConfigRevision。" size="xl" footer={<><Button variant="outline" onClick={() => setHistoryOpen(false)}>关闭</Button><Button disabled={!selectedRevision || selectedContent === canonicalContent || !restoreConfirmed || busy} onClick={restoreRevision}>恢复为新版本</Button></>}>{revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="WorkspaceBinding 配置版本">{revisions.map((revision) => <button key={revision.id} type="button" onClick={() => selectRevision(revision)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedRevision?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><b className="block truncate text-sm">{revision.id}</b><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small></button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">磁盘当前内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{canonicalContent}</pre></section><section className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selectedRevision?.id ?? '选择历史版本'}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-6">{selectedContent}</pre></section></div>{selectedRevision && selectedContent !== canonicalContent && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前配置与目标历史内容，确认恢复并生成新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前 WorkspaceBinding 暂无真实 ConfigRevision。</p>}</AppDialog><AppDialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setSelectedWorkspaceId('') }} title="新建 WorkspaceBinding" description="选择一个尚未绑定的 Workspace。取消不会创建草稿或写入任何配置。" footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button disabled={!selectedWorkspaceId} onClick={confirmCreate}>确认选择</Button></>}><Labeled label="Workspace"><select className="h-10 w-full px-3" value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}><option value="">请选择未绑定 Workspace</option>{availableWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}（{workspace.id}）</option>)}</select></Labeled></AppDialog>{unsavedDialog}</>
}
function WorkspaceBindingEditor({ draft, memoryRevision, agentPolicy, agentOrchestration, assets, onInstructions, onToggle, onContext, onOutputProfile, onOutputParameters, onOrchestration, onComponentRefs, validationErrors, onCancel, onSave, busy, saveLabel }: { draft: WorkspaceBindingConfig; memoryRevision: string; agentPolicy: ContextPolicy; agentOrchestration: FullAgent['orchestrationPolicy']; assets: ReturnType<typeof useApp>['state']['assets']; onInstructions: (value: string) => void; onToggle: (field: 'ruleIds' | 'skillIds' | 'mcpIds', id: string) => void; onContext: (value?: ContextPolicyOverride) => void; onOutputProfile: (value?: string) => void; onOutputParameters: (value: ParameterBinding[]) => void; onOrchestration: (value?: WorkspaceBindingConfig['orchestrationPolicy']) => void; onComponentRefs: (field: 'hookRefs' | 'commandRefs', value: FullAgent['hookRefs']) => void; validationErrors: string[]; onCancel: () => void; onSave: () => void; busy: boolean; saveLabel: string }) {
  const groups = [{ label: 'Rules', field: 'ruleIds' as const, items: assets.filter((item) => item.kind === 'Rules') }, { label: 'Skills', field: 'skillIds' as const, items: assets.filter((item) => item.kind === 'Skill' && item.skill?.installation.status !== 'available') }, { label: 'MCP', field: 'mcpIds' as const, items: assets.filter((item) => item.kind === 'MCP') }]
  const effectivePolicy = mergeContextPolicy(agentPolicy, draft.contextPolicy)
  const contextErrors = validateContextPolicy(effectivePolicy)
  const toggleOverride = (key: keyof ContextPolicy, checked: boolean) => {
    if (!checked) {
      const next = { ...draft.contextPolicy }
      delete next[key]
      onContext(Object.keys(next).length ? next : undefined)
      return
    }
    onContext({ ...draft.contextPolicy, [key]: agentPolicy[key] })
  }
  const setOverride = (key: keyof ContextPolicy, value: boolean | number) => onContext({ ...draft.contextPolicy, [key]: value })
  const outputProfile = assets.find((item) => item.id === draft.outputProfileId && item.kind === 'OutputProfile')?.outputProfile
  const setDelegationDepth = (maxDelegationDepth: number) => onOrchestration({ ...draft.orchestrationPolicy, maxDelegationDepth })
  const toggleComponent = (field: 'hookRefs' | 'commandRefs', assetId: string) => {
    const references = draft[field] ?? []
    onComponentRefs(field, references.some((item) => item.assetId === assetId)
      ? references.filter((item) => item.assetId !== assetId)
      : [...references, { assetId, parameterBindings: [] }])
  }
  return <div className="space-y-5"><div><b>{draft.workspaceId}</b><p className="mt-1 text-xs text-muted-foreground">memoryRevision 仅展示：{memoryRevision || '未设置'}</p></div><Labeled label="专属 Instructions"><textarea value={draft.instructions} onChange={(event) => onInstructions(event.target.value)} className="min-h-28 w-full p-3" /></Labeled><div className="grid gap-4 md:grid-cols-3">{groups.map((group) => <fieldset key={group.field} className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{group.label}</legend><div className="mt-2 space-y-2">{group.items.map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft[group.field].includes(item.id)} onChange={() => onToggle(group.field, item.id)} />{item.name}</label>)}{!group.items.length && <p className="text-xs text-muted-foreground">无可用资产</p>}</div></fieldset>)}</div><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">上下文与输出格式覆盖 · {draft.contextPolicy ? `覆盖 ${Object.keys(draft.contextPolicy).length} 项` : '全部继承'}</summary><div className="mt-4 space-y-4"><Labeled label="输出格式"><select className="h-10 w-full px-3" value={draft.outputProfileId ?? ''} onChange={(event) => onOutputProfile(event.target.value || undefined)}><option value="">继承 Agent 根级输出格式</option>{assets.filter((item) => item.kind === 'OutputProfile').map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Labeled>{outputProfile && <ParameterBindingEditor definitions={outputProfile.parameters} bindings={draft.outputParameterBindings ?? []} onChange={onOutputParameters} />}<div className="grid gap-3 md:grid-cols-2">{([
    ['enabled', '启用策略', 'checkbox', 0, 0],
    ['triggerRatio', '触发比例（%）', 'number', 50, 95],
    ['targetRatio', '目标比例（%）', 'number', 20, 80],
    ['protectRecentTurns', '保护最近轮次', 'number', 0, 20],
    ['protectOpeningTurns', '保护开头轮次', 'number', 0, 10],
  ] as const).map(([key, label, type, min, max]) => { const overridden = draft.contextPolicy?.[key] !== undefined; const rawValue = effectivePolicy[key]; const shownValue = key === 'triggerRatio' || key === 'targetRatio' ? Number(rawValue) * 100 : rawValue; return <div key={key} className="rounded-lg border border-border p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={overridden} onChange={(event) => toggleOverride(key, event.target.checked)} />覆盖{label}</label><div className="mt-2">{type === 'checkbox' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!overridden} checked={Boolean(rawValue)} onChange={(event) => setOverride(key, event.target.checked)} />{rawValue ? '已启用' : '已关闭'}</label> : <input aria-label={label} type="number" disabled={!overridden} min={min} max={max} className="h-9 w-full px-3" value={Number(shownValue)} onChange={(event) => setOverride(key, key === 'triggerRatio' || key === 'targetRatio' ? Number(event.target.value) / 100 : Number(event.target.value))} />}</div>{!overridden && <p className="mt-1 text-xs text-muted-foreground">继承：{String(shownValue)}{key === 'triggerRatio' || key === 'targetRatio' ? '%' : ''}</p>}</div> })}</div>{contextErrors.length > 0 && <div role="alert" className="text-sm text-danger">{contextErrors.join(' ')}</div>}<p className="text-xs leading-5 text-muted-foreground">局部覆盖仍受 Agent 网络权限和全局安全边界约束，不表示当前会话 已应用。</p></div></details><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">协作与编排收紧 · {draft.orchestrationPolicy ? '已覆盖' : '继承根级'}</summary><div className="mt-4 space-y-4"><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(draft.orchestrationPolicy)} onChange={(event) => onOrchestration(event.target.checked ? { maxDelegationDepth: Math.max(0, agentOrchestration.maxDelegationDepth - 1) } : undefined)} /><span>为此工作区 显式收紧委派边界<span className="mt-1 block text-xs text-muted-foreground">根级最大深度：{agentOrchestration.maxDelegationDepth}</span></span></label>{draft.orchestrationPolicy && <Labeled label="工作区最大委派深度"><input type="number" min={0} max={agentOrchestration.maxDelegationDepth} value={draft.orchestrationPolicy.maxDelegationDepth ?? agentOrchestration.maxDelegationDepth} onChange={(event) => setDelegationDepth(Number(event.target.value))} aria-describedby="workspace-orchestration-help" className="h-10 w-full px-3" /></Labeled>}<p id="workspace-orchestration-help" className="text-xs text-muted-foreground">工作区只能降低深度；Agent、岗位、部门范围和必需条件继续继承根级，不能在这里扩大或取消。</p></div></details><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Hook 与 Command 局部引用 · {(draft.hookRefs?.length ?? 0) + (draft.commandRefs?.length ?? 0)} 项</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{(['Hook', 'Command'] as const).map((kind) => { const field = kind === 'Hook' ? 'hookRefs' : 'commandRefs'; const references = draft[field] ?? []; return <fieldset key={kind} className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{kind}</legend><div className="mt-2 space-y-2">{assets.filter((item) => item.kind === kind).map((asset) => <label key={asset.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={references.some((item) => item.assetId === asset.id)} onChange={() => toggleComponent(field, asset.id)} />{asset.name}</label>)}{!assets.some((item) => item.kind === kind) && <p className="text-xs text-muted-foreground">无可用资产</p>}</div></fieldset> })}</div><p className="mt-3 text-xs text-muted-foreground">这里只维护定义引用，不执行 Hook 或 Command；引用参数在资产定义允许的非敏感类型范围内校验。</p></details>{validationErrors.length > 0 && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><b>请修复以下问题后保存：</b><ul className="mt-2 list-disc space-y-1 pl-5">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onCancel}>取消</Button><Button disabled={busy || contextErrors.length > 0 || validationErrors.length > 0} onClick={onSave}><Save size={15} aria-hidden="true" />{saveLabel}</Button></div></div>
}

function ParameterBindingEditor({ definitions, bindings, onChange, legend = '输出参数覆盖' }: { definitions: ParameterDefinition[]; bindings: ParameterBinding[]; onChange: (value: ParameterBinding[]) => void; legend?: string }) {
  const bindingById = new Map(bindings.map((binding) => [binding.parameterId, binding]))
  const update = (definition: ParameterDefinition, enabled: boolean, value?: ParameterBinding['value']) => {
    const remaining = bindings.filter((binding) => binding.parameterId !== definition.id)
    if (!enabled) { onChange(remaining); return }
    const next = definition.type === 'string-list'
      ? { parameterId: definition.id, type: 'string-list' as const, value: Array.isArray(value) ? value : [] }
      : definition.type === 'number'
        ? { parameterId: definition.id, type: 'number' as const, value: typeof value === 'number' ? value : definition.min ?? 0 }
        : definition.type === 'boolean'
          ? { parameterId: definition.id, type: 'boolean' as const, value: typeof value === 'boolean' ? value : false }
          : definition.type === 'enum'
            ? { parameterId: definition.id, type: 'enum' as const, value: typeof value === 'string' ? value : definition.options[0] }
            : { parameterId: definition.id, type: 'string' as const, value: typeof value === 'string' ? value : '' }
    onChange([...remaining, next])
  }
  return <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{legend}</legend><div className="mt-2 grid gap-3 md:grid-cols-2">{definitions.map((definition) => { const binding = bindingById.get(definition.id); return <div key={definition.id} className="rounded-lg bg-muted/30 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={Boolean(binding)} onChange={(event) => update(definition, event.target.checked)} />覆盖{definition.label}{definition.required ? '（必填）' : ''}</label>{binding && <div className="mt-2">{definition.type === 'boolean' && binding.type === 'boolean' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={binding.value} onChange={(event) => update(definition, true, event.target.checked)} />{binding.value ? '是' : '否'}</label> : definition.type === 'enum' && binding.type === 'enum' ? <select aria-label={definition.label} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, event.target.value)}>{definition.options.map((option) => <option key={option}>{option}</option>)}</select> : definition.type === 'number' && binding.type === 'number' ? <input aria-label={definition.label} type="number" min={definition.min} max={definition.max} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, Number(event.target.value))} /> : definition.type === 'string-list' && binding.type === 'string-list' ? <textarea aria-label={definition.label} className="min-h-20 w-full p-2" value={binding.value.join('\n')} onChange={(event) => update(definition, true, event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /> : binding.type === 'string' ? <input aria-label={definition.label} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, event.target.value)} /> : null}</div>}</div> })}{!definitions.length && <p className="text-xs text-muted-foreground">此输出格式没有可覆盖参数。</p>}</div></fieldset>
}

function SopTab({ agent }: { agent: FullAgent }) {
  return <RulesTab agent={agent} mode="sop" />
}
function TabHeader({ title, description, editing, onEdit, onCancel, onSave, canSave = true, saveLabel = '模拟保存', editDisabled = false }: { title: string; description: string; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void; canSave?: boolean; saveLabel?: string; editDisabled?: boolean }) { return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4"><div><b>{title}</b><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{editing ? <div className="flex gap-2"><Button variant="outline" onClick={onCancel}>取消</Button><Button disabled={!canSave} onClick={onSave}><Save size={15} />{saveLabel}</Button></div> : <Button variant="outline" size="sm" disabled={editDisabled} onClick={onEdit}>{editDisabled ? '加载中…' : '编辑'}</Button>}</div> }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium">{label}<div className="mt-2">{children}</div></label> }
function ListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) { return <Labeled label={label}><textarea value={values.join('\n')} onChange={(event) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} className="min-h-28 w-full p-3" /></Labeled> }
