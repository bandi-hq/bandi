import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDiff, KeyRound, Plus, Save, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AiClientHandoffAction } from '../../components/ai-clients'
import { Button } from '../../components/ui/button'
import { AppDialog } from '../../components/ui/dialog'
import { useUnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'
import { EntityNotFound, EntityTabPanel, EntityTabs, FieldRow, MockBoundaryNote, MonoPath, PathActions, StatusBadge, toneForStatus } from '../../components/app/page'
import { useApp } from '../../state'
import { getEligibleMemorySpaces, resolveMemoryGovernance } from '../../memory-policy'
import type { ContextPolicy, ContextPolicyOverride, FullAgent, WorkspaceBinding } from '../../domain'
import type { ParameterBinding, ParameterDefinition } from '../../component-parameters'
import { validateParameterBindings } from '../../component-parameters'
import { validateOrchestrationOverride } from '../../orchestration-policy'
import { applyAgentConfig, mergeContextPolicy, serializeAgentConfig, validateContextPolicy, type AgentContextConfig, type AgentIdentityConfig } from '../../agent-config-model'
import { getAgentConfigStatus, getLatestRevisionForAgent } from '../../domain-selectors'
import { useRegisterEditorSession } from '../../editor-session'
import { resolveAgentConfigRoute, type AgentConfigSection, type AgentFileView } from '../../agent-config-projection'
import { getDefaultAgentPackagePath } from '../../agent-package'
import { AgentPackageBrowser } from './agent-package-files'
import { AgentConfigNavigation } from './agent-config-navigation'
import { AgentAvatar } from '../../components/agents/agent-avatar'
import { AgentAvatarPicker } from '../../components/agents/agent-avatar-picker'
import { isDesktopRuntime, saveManagedAgentIdentity } from '../../desktop-bridge'

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
  const roleName = state.roles.find((item) => item.id === agent.roleId)?.name ?? 'Role 引用缺失'
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
  if (section === 'skills') return <ReferenceTab agent={agent} kind="Skills" field="skillRefs" />
  if (section === 'memory') return <MemoryTab agent={agent} />
  if (section === 'rules') return <ReferenceTab agent={agent} kind="Rules" field="ruleRefs" />
  if (section === 'mcp') return <ReferenceTab agent={agent} kind="MCP" field="mcpRefs" />
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
  const [avatar, setAvatar] = useState<File>()
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const managedAvatar = isDesktopRuntime() && agent.packageSource.kind === 'bandi-managed' && agent.packageSchema.compatibility === 'current'
  useEffect(() => { if (!editing) { setDraft(canonical); setAvatar(undefined); setRemoveAvatar(false); setSaveError(undefined) } }, [canonical, editing])
  const dirty = editing && (JSON.stringify(draft) !== JSON.stringify(canonical) || Boolean(avatar) || removeAvatar)
  const reset = () => { setDraft(canonical); setAvatar(undefined); setRemoveAvatar(false); setSaveError(undefined); setEditing(false) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const update = <K extends keyof AgentIdentityConfig>(key: K, value: AgentIdentityConfig[K]) => setDraft((item) => ({ ...item, [key]: value }))
  const cancel = reset
  const save = async () => {
    if (!dirty) { setEditing(false); return }
    const value = { ...draft, avatarPath: avatar ? 'avatar.png' as const : removeAvatar ? undefined : draft.avatarPath }
    if (!managedAvatar) {
      dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'identity', value } })
      setEditing(false)
      return
    }
    const applied = applyAgentConfig(agent, { kind: 'identity', value })
    const manifest = serializeAgentConfig(agent, { kind: 'identity', value })
    const expectedManifest = agent.packageSource.kind === 'bandi-managed' ? agent.packageSource.identityBaseline : undefined
    if (!applied || !manifest || !expectedManifest) {
      setSaveError('缺少可验证的身份配置基线，请刷新 AgentPackage 后重试。')
      return
    }
    setSaveError(undefined)
    try {
      const result = await saveManagedAgentIdentity(
        applied,
        manifest,
        expectedManifest,
        avatar ? { kind: 'replace', file: avatar } : removeAvatar ? { kind: 'remove' } : { kind: 'keep' },
      )
      dispatch({
        type: 'UPSERT_MANAGED_AGENT',
        agent: {
          ...result.agent,
          packageSource: {
            kind: 'bandi-managed',
            packageId: agent.packageSource.kind === 'bandi-managed' ? agent.packageSource.packageId : `agt_${agent.id}`,
            strategy: 'managed',
            identityBaseline: result.baseline,
          },
        },
        message: '身份与头像已保存到 AgentPackage',
      })
      setEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:identity`, dirty, canSave: dirty, save, cancel } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title="身份与职责" description="组织身份、职责和服务授权不形成隐式权限。" editing={editing} onEdit={() => setEditing(true)} onCancel={cancel} onSave={save} />
    <div className="p-5">{editing ? <div className="grid gap-5 sm:grid-cols-2"><AgentAvatarPicker name={draft.name} file={avatar} onChange={(file) => { setAvatar(file); if (file) setRemoveAvatar(false) }} disabled={!managedAvatar} help={managedAvatar ? (removeAvatar ? '保存后将从 AgentPackage 移除头像。' : undefined) : '仅 current、可写的受管 AgentPackage 支持替换头像。'} />{agent.avatarPath && managedAvatar && !avatar && <div className="flex items-center justify-between rounded-lg border border-border p-4 sm:col-span-2"><div className="flex items-center gap-3"><AgentAvatar agent={agent} className="size-12" /><div><b className="text-sm">当前头像</b><p className="mt-1 text-xs text-muted-foreground">移除后保存会同时更新 agent.yaml。</p></div></div><Button type="button" variant="outline" size="sm" onClick={() => setRemoveAvatar((value) => !value)}>{removeAvatar ? '保留头像' : '移除头像'}</Button></div>}<Labeled label="名称"><input value={draft.name} onChange={(e) => update('name', e.target.value)} className="h-10 w-full px-3" /></Labeled><Labeled label="岗位"><select value={draft.roleId} onChange={(e) => update('roleId', e.target.value)} className="h-10 w-full px-3">{state.roles.filter((role) => role.companyId === draft.companyId && role.status === 'active').map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Labeled><Labeled label="主属部门"><select value={draft.primaryDepartmentId} onChange={(e) => { const dep = state.departments.find((item) => item.id === e.target.value); setDraft((item) => ({ ...item, primaryDepartmentId: e.target.value, managerAgentId: dep?.managerAgentId })) }} className="h-10 w-full px-3">{state.departments.filter((item) => item.companyId === draft.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="使命"><textarea value={draft.mission} onChange={(e) => update('mission', e.target.value)} className="min-h-28 w-full p-3" /></Labeled><ListEditor label="主要职责" values={draft.responsibilities} onChange={(value) => update('responsibilities', value)} /><ListEditor label="交付物" values={draft.deliverables} onChange={(value) => update('deliverables', value)} /><ListEditor label="决策边界" values={draft.decisionBoundaries} onChange={(value) => update('decisionBoundaries', value)} /><ListEditor label="升级条件" values={draft.escalationConditions} onChange={(value) => update('escalationConditions', value)} /><ListEditor label="禁止事项" values={draft.prohibitions} onChange={(value) => update('prohibitions', value)} /><ListEditor label="完成定义" values={draft.completionDefinition} onChange={(value) => update('completionDefinition', value)} /></div> : <div><FieldRow label="主属部门">{agent.department}（唯一）</FieldRow><FieldRow label="直属主管">{state.agents.find((item) => item.id === agent.managerAgentId)?.name ?? '未设置'}</FieldRow><FieldRow label="使命">{agent.mission}</FieldRow><FieldRow label="主要职责">{agent.responsibilities.join('；')}</FieldRow><FieldRow label="交付物">{agent.deliverables.join('；')}</FieldRow><FieldRow label="决策边界">{agent.decisionBoundaries.join('；')}</FieldRow><FieldRow label="升级条件">{agent.escalationConditions.join('；')}</FieldRow><FieldRow label="禁止事项">{agent.prohibitions.join('；')}</FieldRow><FieldRow label="完成定义">{agent.completionDefinition.join('；')}</FieldRow><FieldRow label="服务授权">{agent.serviceGrants.length ? agent.serviceGrants.map((grant) => `${state.departments.find((item) => item.id === grant.departmentId)?.name}：${grant.capabilities.join('、')}（${grant.status}）`).join('；') : '无跨部门服务授权'}</FieldRow></div>}
      {saveError && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{saveError}</p>}
      {!editing && <div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setLifecycleTarget(agent.status === 'inactive' ? 'active' : 'inactive')}>{agent.status === 'inactive' ? '重新启用' : '停用 Agent'}</Button><Button variant="outline" onClick={() => setLifecycleTarget('archived')}>归档</Button><Button variant="danger" onClick={() => dispatch({ type: 'TOAST', text: `永久删除仅展示影响：${agent.workspaceBindings.length} WorkspaceBinding、${agent.sopRefs.length} SOP 引用和正式记忆将保留；演示未删除对象` })}><Trash2 size={15} />预览永久删除影响</Button></div>}
    </div></section><AppDialog open={Boolean(lifecycleTarget)} onOpenChange={(open) => { if (!open) setLifecycleTarget(undefined) }} title={lifecycleTarget === 'archived' ? '归档 Agent' : lifecycleTarget === 'inactive' ? '停用 Agent' : '重新启用 Agent'} description="生命周期变更会作为完整 agent.yaml manifest 保存。" footer={<><Button variant="outline" onClick={() => setLifecycleTarget(undefined)}>取消</Button><Button variant={lifecycleTarget === 'archived' ? 'danger' : 'default'} onClick={() => { if (lifecycleTarget) dispatch({ type: 'SET_AGENT_LIFECYCLE', agentId: agent.id, status: lifecycleTarget }); setLifecycleTarget(undefined) }}>确认更新</Button></>}><div className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6"><b>保留与影响</b><p className="mt-2 text-muted-foreground">AgentPackage、{agent.workspaceBindings.length} 个 WorkspaceBinding、正式 Memory 和 ConfigRevision 全部保留。停用或归档后不可接受新委派；已有静态引用不会自动删除。</p></div></AppDialog>{unsavedDialog}</>
}

function InstructionsTab({ agent }: { agent: FullAgent }) {
  const { dispatch } = useApp(); const [editing, setEditing] = useState(false); const [text, setText] = useState(agent.instructions)
  useEffect(() => { if (!editing) setText(agent.instructions) }, [agent.instructions, editing])
  const dirty = editing && text !== agent.instructions
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: () => { setText(agent.instructions); setEditing(false) } })
  const cancel = () => { setText(agent.instructions); setEditing(false) }
  const save = () => { if (dirty) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'instructions', value: text } }); setEditing(false) }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:instructions`, dirty, canSave: dirty, save, cancel } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title="Instructions" description={`保存目标：${agent.packagePath}instructions.md`} editing={editing} onEdit={() => setEditing(true)} onCancel={cancel} onSave={save} /><div className="p-5">{editing ? <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-72 w-full resize-y p-4 text-sm leading-7" aria-label="Instructions 正文" /> : <div className="whitespace-pre-wrap rounded-lg bg-muted/40 p-5 text-sm leading-7">{agent.instructions}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>Agent 自有正文 · 显式引用 {agent.ruleRefs.length} 条 Rule</span><Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: agent.id, path: `${agent.packagePath}instructions.md` } })}><FileDiff size={14} />查看 Diff</Button></div></div></section>{unsavedDialog}</>
}

function ContextTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const canonical: AgentContextConfig = useMemo(() => ({ policy: { ...agent.contextPolicy }, outputProfileId: agent.outputProfileId, outputParameterBindings: agent.outputParameterBindings }), [agent.contextPolicy, agent.outputParameterBindings, agent.outputProfileId])
  const [draft, setDraft] = useState(canonical)
  useEffect(() => { if (!editing) setDraft(canonical) }, [canonical, editing])
  const errors = validateContextPolicy(draft.policy)
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(canonical)
  const reset = () => { setDraft(canonical); setEditing(false) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const updatePolicy = <K extends keyof ContextPolicy>(key: K, value: ContextPolicy[K]) => setDraft((item) => ({ ...item, policy: { ...item.policy, [key]: value } }))
  const save = () => { if (dirty && !errors.length) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'context', value: draft } }); setEditing(false) }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:context`, dirty, canSave: dirty && !errors.length, save, cancel: reset } : undefined)
  const outputProfiles = state.assets.filter((item) => item.kind === 'OutputProfile' && item.outputProfile)
  const outputProfileName = outputProfiles.find((item) => item.id === agent.outputProfileId)?.name ?? '未设置'
  return <><section className="panel overflow-hidden"><TabHeader title="上下文" description={`保存目标：${agent.packagePath}config/context.yaml`} editing={editing} onEdit={() => setEditing(true)} onCancel={reset} onSave={save} canSave={!errors.length} /><div className="p-5"><div className="rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">这是供 AI 编程工具构建 RuntimeProjection 时读取的长期策略。Bandi 不读取当前 Session、token 使用或压缩次数，也不执行压缩。</div>{editing ? <div className="mt-5 grid gap-5 md:grid-cols-2"><label className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium"><input type="checkbox" checked={draft.policy.enabled} onChange={(event) => updatePolicy('enabled', event.target.checked)} />启用上下文压缩策略</label><Labeled label="输出格式"><select className="h-10 w-full px-3" value={draft.outputProfileId ?? ''} onChange={(event) => { const outputProfileId = event.target.value || undefined; setDraft((item) => ({ ...item, outputProfileId, outputParameterBindings: [] })) }}><option value="">未设置</option>{outputProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Labeled><ContextNumberField id="context-trigger" label="触发比例（%）" value={draft.policy.triggerRatio * 100} min={50} max={95} onChange={(value) => updatePolicy('triggerRatio', value / 100)} help="相对于工具解析出的可用上下文预算。" /><ContextNumberField id="context-target" label="压缩后目标（%）" value={draft.policy.targetRatio * 100} min={20} max={80} onChange={(value) => updatePolicy('targetRatio', value / 100)} help="必须至少比触发比例低 10 个百分点。" /><ContextNumberField id="context-recent" label="保护最近对话轮次" value={draft.policy.protectRecentTurns} min={0} max={20} onChange={(value) => updatePolicy('protectRecentTurns', value)} help="一轮表示一次用户输入及其对应响应。" /><ContextNumberField id="context-opening" label="保护开头对话轮次" value={draft.policy.protectOpeningTurns} min={0} max={10} onChange={(value) => updatePolicy('protectOpeningTurns', value)} help="不会据此读取或修改当前 Session。" /></div> : <div className="mt-5"><FieldRow label="状态">{agent.contextPolicy.enabled ? '已启用' : '已关闭'}</FieldRow><FieldRow label="触发与目标">达到 {Math.round(agent.contextPolicy.triggerRatio * 100)}% 后压缩到 {Math.round(agent.contextPolicy.targetRatio * 100)}%</FieldRow><FieldRow label="保护最近">{agent.contextPolicy.protectRecentTurns} 轮</FieldRow><FieldRow label="保护开头">{agent.contextPolicy.protectOpeningTurns} 轮</FieldRow><FieldRow label="输出格式">{outputProfileName}</FieldRow><FieldRow label="输出参数">{agent.outputParameterBindings.length ? agent.outputParameterBindings.map((item) => item.parameterId).join('、') : '使用格式默认值'}</FieldRow></div>}{errors.length > 0 && editing && <div id="context-errors" role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}<p className="mt-4 text-xs leading-5 text-muted-foreground">压缩产生的临时摘要不会自动进入正式 Memory；长期沉淀仍需 MemoryCandidate → Review → MemoryRevision。</p></div></section>{unsavedDialog}</>
}

function ContextNumberField({ id, label, value, min, max, onChange, help }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void; help: string }) {
  return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-describedby={`${id}-help context-errors`} className="mt-2 h-10 w-full px-3" /><span id={`${id}-help`} className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">{help}</span></label>
}

function ReferenceTab({ agent, kind, field }: { agent: FullAgent; kind: 'Skills' | 'Rules' | 'MCP'; field: 'skillRefs' | 'ruleRefs' | 'mcpRefs' }) {
  const { state, dispatch } = useApp(); const [editing, setEditing] = useState(false); const [refs, setRefs] = useState<string[]>(agent[field]); const candidates = state.assets.filter((item) => item.kind === kind.slice(0, -1) || (kind === 'Rules' && item.kind === 'Rules') || (kind === 'MCP' && item.kind === 'MCP')).filter((item) => kind !== 'Skills' || item.skill?.installation.status !== 'available' || refs.includes(item.id))
  useEffect(() => { if (!editing) setRefs(agent[field]) }, [agent, editing, field])
  const dirty = editing && JSON.stringify(refs) !== JSON.stringify(agent[field])
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: () => { setRefs(agent[field]); setEditing(false) } })
  const toggle = (id: string) => setRefs((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const configKind = field === 'skillRefs' ? 'skills' : field === 'ruleRefs' ? 'rules' : 'mcp'
  const cancel = () => { setRefs(agent[field]); setEditing(false) }
  const save = () => { if (dirty) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: configKind, value: refs } }); setEditing(false) }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:${configKind}`, dirty, canSave: dirty, save, cancel } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title={kind} description="自有配置与显式共享引用；部门归属不会自动加入资产。" editing={editing} onEdit={() => setEditing(true)} onCancel={cancel} onSave={save} /><div className="divide-y divide-border">{candidates.map((asset) => <div key={asset.id} className="flex items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><Link to={`/assets/${asset.id}`} className="font-semibold hover:underline">{asset.name}</Link><p className="mt-1 text-xs text-muted-foreground">{asset.sourceType} · {asset.scope} · {asset.path}</p>{kind === 'Skills' && asset.skill?.installation.status === 'available' && <p className="mt-1 text-xs text-danger">引用失效 · Skill 本体未安装</p>}{kind === 'Skills' && asset.skill?.installation.status === 'update-available' && <p className="mt-1 text-xs text-warning">本体有可用更新</p>}</div>{editing ? <input type="checkbox" checked={refs.includes(asset.id)} onChange={() => toggle(asset.id)} aria-label={`${refs.includes(asset.id) ? '移除' : '添加'} ${asset.name}`} /> : <StatusBadge tone={refs.includes(asset.id) ? 'success' : 'neutral'}>{refs.includes(asset.id) ? '已引用' : '未引用'}</StatusBadge>}</div>)}</div>{kind === 'Skills' && <div className="border-t border-border p-4"><p className="mb-3 text-xs leading-5 text-muted-foreground">这里仅维护当前 Agent 的显式引用；Skill 本体的来源、安装、更新和回滚在资产中独立管理。</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/assets/skills">管理 Skill 本体</Link></Button><Button asChild variant="ghost"><Link to="/assets/skills?view=installed">查看已安装</Link></Button></div></div>}{editing && candidates.some((item) => item.sourceType === '显式共享' && refs.includes(item.id)) && <div className="border-t border-border p-4"><Button variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'shared', assetId: refs.find((id) => state.assets.find((item) => item.id === id)?.sourceType === '显式共享') ?? candidates[0].id } })}>查看共享影响</Button></div>}</section>{unsavedDialog}</>
}

function MemoryTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp(); const spaces = getEligibleMemorySpaces(state, agent.id); const candidates = state.memoryCandidates.filter((item) => spaces.some((space) => space.id === item.spaceId)); const [spaceId, setSpaceId] = useState(''); const governance = spaceId ? resolveMemoryGovernance(state, spaceId, agent.id) : undefined
  const create = () => { if (!spaceId || !governance?.reviewerAgentId) return; const id = `MC-${String(state.memoryCandidates.length + 30).padStart(3, '0')}`; dispatch({ type: 'CREATE_MEMORY_CANDIDATE', candidate: { id, spaceId, proposerAgentId: agent.id, reviewerAgentId: governance.reviewerAgentId, summary: `${agent.name} 提出的正式记忆修改`, current: '当前正式内容', proposed: '建议写回的新内容', status: '待审核' } }); setSpaceId('') }
  return <section className="panel overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4"><div><b>正式 MemorySpace</b><p className="mt-1 text-xs text-muted-foreground">正式修改只能创建候选并审核，不能直接保存。</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-medium">唯一目标空间<select aria-label="唯一目标 MemorySpace" className="mt-1 block h-10 max-w-72 px-3 text-sm" value={spaceId} onChange={(event) => setSpaceId(event.target.value)}><option value="">请选择</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.scopeType} · {space.owner}</option>)}</select></label><Button disabled={!governance?.canPropose} onClick={create}><Plus size={15} />提出修改</Button></div></div>{spaceId && governance?.errors.length ? <div role="alert" className="border-b border-danger/30 bg-danger/5 px-5 py-3 text-sm text-danger">{governance.errors.join(' ')}</div> : null}<div className="divide-y divide-border">{spaces.map((space) => <div key={space.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]"><div><b>{space.scopeType}</b><p className="mt-1 text-xs text-muted-foreground">{space.owner} · 归口 {space.steward} · 审核 {space.reviewer}</p><MonoPath>{space.path}</MonoPath></div><StatusBadge tone="success">{space.revision}</StatusBadge></div>)}</div><div className="border-t border-border p-5"><div className="label mb-3">候选</div>{candidates.length ? <div className="space-y-2">{candidates.map((candidate) => <button key={candidate.id} onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } })} className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted"><span><b>{candidate.id}</b><small className="ml-2 text-muted-foreground">{candidate.summary}</small></span><StatusBadge tone={candidate.status === '待审核' ? 'warning' : 'success'}>{candidate.status}</StatusBadge></button>)}</div> : <p className="text-sm text-muted-foreground">没有相关候选。</p>}</div></section>
}

function PermissionsTab({ agent }: { agent: FullAgent }) {
  const { dispatch } = useApp(); const [editing, setEditing] = useState(false); const [files, setFiles] = useState(agent.permissions.files); const [confirmOpen, setConfirmOpen] = useState(false); const [confirmName, setConfirmName] = useState(''); const [understood, setUnderstood] = useState(false)
  const dirty = editing && files !== agent.permissions.files
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: () => { setFiles(agent.permissions.files); setEditing(false) } })
  const commit = () => { if (dirty) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'permissions', value: { ...agent.permissions, files } }, summary: files.includes('任意') ? '确认扩大长期权限' : '收紧长期权限' }); setEditing(false); setConfirmOpen(false); setConfirmName(''); setUnderstood(false) }
  const cancel = () => { setFiles(agent.permissions.files); setEditing(false) }
  const save = () => { if (files.includes('任意')) { setConfirmOpen(true); return } commit() }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:permissions`, dirty, canSave: dirty, save, cancel } : undefined)
  const confirmed = confirmName.trim() === agent.name && understood
  return <><div className="grid gap-5 lg:grid-cols-2"><section className="panel p-5"><div className="flex items-center gap-2"><ShieldCheck className="text-success" /><b>当前有效边界</b></div><FieldRow label="文件写入">{agent.permissions.files}</FieldRow><FieldRow label="命令">{agent.permissions.commands}</FieldRow><FieldRow label="网络">{agent.permissions.network}</FieldRow><FieldRow label="委派">{agent.permissions.delegation}</FieldRow></section><section className="panel p-5"><div className="label">边界调整</div><p className="mt-3 text-sm leading-6 text-muted-foreground">收紧可直接模拟保存；永久扩大到 工作区外需确认长期权限变更。</p>{editing ? <><select value={files} onChange={(e) => setFiles(e.target.value)} className="mt-5 h-10 w-full px-3"><option>只读当前工作区</option><option>仅当前工作区</option><option>任意目录</option></select><div className="mt-4 flex gap-2"><Button variant="outline" onClick={cancel}>取消</Button><Button onClick={save}>保存边界</Button></div></> : <Button className="mt-5" variant="outline" onClick={() => setEditing(true)}><KeyRound size={16} />调整权限</Button>}</section></div><AppDialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) { setConfirmName(''); setUnderstood(false) } }} title="确认扩大长期 Agent 权限" description="这会把演示配置从当前工作区 扩大到任意目录；不会写入真实配置。" footer={<><Button variant="outline" onClick={() => setConfirmOpen(false)}>返回编辑</Button><Button variant="danger" disabled={!confirmed} onClick={commit}>确认扩大权限</Button></>}><div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm leading-6"><b>影响范围</b><p className="mt-2 text-muted-foreground">Agent：{agent.name}<br />文件写入：{agent.permissions.files} → 任意目录<br />仅更新当前页面内存，刷新后恢复初始状态。</p></div><label className="mt-5 block text-sm font-medium" htmlFor="permission-confirm-name">输入 Agent 名称“{agent.name}”确认<input id="permission-confirm-name" className="mt-2 h-10 w-full px-3" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" /></label><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我了解这是长期权限扩大，但当前演示不会写入真实配置。</span></label></AppDialog>{unsavedDialog}</>
}

function CollaborationTab({ agent }: { agent: FullAgent }) {
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
  return <><div className="space-y-5"><section className="panel overflow-hidden"><TabHeader title="协作与编排" description="只管理静态边界；有效委派仍取权限、组织、服务授权和此策略的交集。" editing={editing} onEdit={() => setEditing(true)} onCancel={reset} onSave={save} /><div className="p-5">{editing ? <div className="grid gap-4 md:grid-cols-2"><label className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy((value) => ({ ...value, enabled: event.target.checked }))} />允许委派（仍受其他边界约束）</label><Labeled label="最大委派深度"><input type="number" min={0} className="h-10 w-full px-3" value={policy.maxDelegationDepth} onChange={(event) => setPolicy((value) => ({ ...value, maxDelegationDepth: Number(event.target.value) }))} /></Labeled><Labeled label="允许 Agent"><select multiple className="min-h-32 w-full p-2" value={policy.allowedAgentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedAgentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许 Role"><select multiple className="min-h-32 w-full p-2" value={policy.allowedRoleIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedRoleIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.roles.filter((item) => item.companyId === agent.companyId && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="允许部门"><select multiple className="min-h-32 w-full p-2" value={policy.allowedDepartmentIds} onChange={(event) => setPolicy((value) => ({ ...value, allowedDepartmentIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{state.departments.filter((item) => item.companyId === agent.companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><div className="space-y-2 rounded-lg border border-border p-3">{([['requireWorkspaceBinding', '必须有 WorkspaceBinding'], ['requireSopMatch', '必须匹配 SOP'], ['requireServiceGrantForCrossDepartment', '跨部门必须有 ServiceGrant']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy[key]} onChange={(event) => setPolicy((value) => ({ ...value, [key]: event.target.checked }))} />{label}</label>)}</div><Labeled label="升级目标"><select className="h-10 w-full px-3" value={policy.escalationAgentId ?? ''} onChange={(event) => setPolicy((value) => ({ ...value, escalationAgentId: event.target.value || undefined }))}><option value="">未设置</option>{state.agents.filter((item) => item.id !== agent.id && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><ListEditor label="升级条件" values={policy.escalationConditions} onChange={(value) => setPolicy((item) => ({ ...item, escalationConditions: value }))} /><ListEditor label="禁止事项" values={policy.prohibitions} onChange={(value) => setPolicy((item) => ({ ...item, prohibitions: value }))} /><ComponentReferenceEditor title="Hook 引用" kind="Hook" references={hookRefs} assets={state.assets} onChange={setHookRefs} /><ComponentReferenceEditor title="Command 引用" kind="Command" references={commandRefs} assets={state.assets} onChange={setCommandRefs} /></div> : <><div className="label">OrchestrationPolicy</div><h2 className="mt-2 text-lg font-semibold">长期协作与委派边界</h2><div className="mt-5"><FieldRow label="委派状态">{agent.orchestrationPolicy.enabled ? '允许（受其他边界约束）' : '禁止'}</FieldRow><FieldRow label="最大深度">{agent.orchestrationPolicy.maxDelegationDepth}</FieldRow><FieldRow label="允许 Agent">{agentNames.join('、') || '未授权任何 Agent'}</FieldRow><FieldRow label="允许 Role">{roleNames.join('、') || '未授权任何 Role'}</FieldRow><FieldRow label="允许部门">{departmentNames.join('、') || '未授权任何部门'}</FieldRow><FieldRow label="必需条件">{[agent.orchestrationPolicy.requireWorkspaceBinding && '需要 WorkspaceBinding', agent.orchestrationPolicy.requireSopMatch && '需要 SOP 匹配', agent.orchestrationPolicy.requireServiceGrantForCrossDepartment && '跨部门需要 ServiceGrant'].filter(Boolean).join('；') || '无附加条件'}</FieldRow><FieldRow label="升级目标">{state.agents.find((item) => item.id === agent.orchestrationPolicy.escalationAgentId)?.name ?? agent.orchestrationPolicy.escalationAgentId ?? '未设置'}</FieldRow><FieldRow label="禁止事项">{agent.orchestrationPolicy.prohibitions.join('；')}</FieldRow></div></>}</div></section>{!editing && <div className="grid gap-5 lg:grid-cols-2"><ComponentReferences title="Hook 引用" references={agent.hookRefs} assets={state.assets} kind="Hook" /><ComponentReferences title="Command 引用" references={agent.commandRefs} assets={state.assets} kind="Command" /></div>}<MockBoundaryNote>存在引用不表示 Hook 已触发、Command 已执行或当前 Session 已加载；Bandi 不接受 Shell、cwd、环境变量或可执行程序。</MockBoundaryNote></div>{unsavedDialog}</>
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
  const [editingId, setEditingId] = useState<string>()
  const [draft, setDraft] = useState<WorkspaceBinding>()
  const canonical = agent.workspaceBindings.find((item) => item.workspaceId === editingId)
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(canonical))
  const reset = () => { setDraft(undefined); setEditingId(undefined) }
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  const edit = (binding: WorkspaceBinding) => { setEditingId(binding.workspaceId); setDraft({ ...binding, ruleIds: [...binding.ruleIds], skillIds: [...binding.skillIds], mcpIds: [...binding.mcpIds], contextPolicy: binding.contextPolicy ? { ...binding.contextPolicy } : undefined, orchestrationPolicy: binding.orchestrationPolicy ? { ...binding.orchestrationPolicy } : undefined, outputParameterBindings: [...(binding.outputParameterBindings ?? [])], hookRefs: (binding.hookRefs ?? []).map((reference) => ({ ...reference, parameterBindings: [...reference.parameterBindings] })), commandRefs: (binding.commandRefs ?? []).map((reference) => ({ ...reference, parameterBindings: [...reference.parameterBindings] })) }) }
  const create = () => { const workspace = state.workspaces.find((item) => !agent.workspaceBindings.some((binding) => binding.workspaceId === item.id)); if (workspace) { const binding = { workspaceId: workspace.id, instructions: '', ruleIds: [], skillIds: [], mcpIds: [], memoryRevision: '' }; setEditingId(workspace.id); setDraft(binding) } }
  const toggle = (field: 'ruleIds' | 'skillIds' | 'mcpIds', id: string) => setDraft((value) => value ? { ...value, [field]: value[field].includes(id) ? value[field].filter((item) => item !== id) : [...value[field], id] } : value)
  const updateContext = (contextPolicy?: ContextPolicyOverride) => setDraft((value) => value ? { ...value, contextPolicy } : value)
  const updateOutputProfile = (outputProfileId?: string) => setDraft((value) => value ? { ...value, outputProfileId, outputParameterBindings: [] } : value)
  const updateOutputParameters = (outputParameterBindings: ParameterBinding[]) => setDraft((value) => value ? { ...value, outputParameterBindings } : value)
  const updateOrchestration = (orchestrationPolicy?: WorkspaceBinding['orchestrationPolicy']) => setDraft((value) => value ? { ...value, orchestrationPolicy } : value)
  const updateComponentRefs = (field: 'hookRefs' | 'commandRefs', references: FullAgent['hookRefs']) => setDraft((value) => value ? { ...value, [field]: references } : value)
  const outputProfile = state.assets.find((item) => item.id === draft?.outputProfileId && item.kind === 'OutputProfile')?.outputProfile
  const draftErrors = draft ? [
    ...validateOrchestrationOverride(agent.orchestrationPolicy, draft.orchestrationPolicy ?? {}).map((issue) => issue.message),
    ...validateParameterBindings(outputProfile?.parameters ?? [], draft.outputParameterBindings ?? []).map((issue) => issue.message),
  ] : []
  const save = () => { if (draft && dirty && !draftErrors.length) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'workspace-binding', value: draft } }); reset() }
  useRegisterEditorSession(draft ? { id: `agent:${agent.id}:workspace-binding`, dirty, canSave: dirty && !draftErrors.length, save, cancel: reset } : undefined)
  const availableWorkspace = state.workspaces.some((item) => !agent.workspaceBindings.some((binding) => binding.workspaceId === item.id))
  return <><section className="panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><b>工作区专属配置</b><p className="mt-1 text-xs text-muted-foreground">保存为 workspaces/&lt;workspace-id&gt;/config.yaml；正式 Memory 不在这里编辑。</p></div><Button variant="outline" size="sm" disabled={!availableWorkspace || Boolean(draft)} onClick={create}><Plus size={15} />新建 Binding</Button></div><div className="divide-y divide-border">{agent.workspaceBindings.map((binding) => { const workspace = state.workspaces.find((item) => item.id === binding.workspaceId); const isEditing = draft?.workspaceId === binding.workspaceId; return <div key={binding.workspaceId} className="p-5">{isEditing ? <WorkspaceBindingEditor draft={draft} agentPolicy={agent.contextPolicy} agentOrchestration={agent.orchestrationPolicy} assets={state.assets} onInstructions={(instructions) => setDraft({ ...draft, instructions })} onToggle={toggle} onContext={updateContext} onOutputProfile={updateOutputProfile} onOutputParameters={updateOutputParameters} onOrchestration={updateOrchestration} onComponentRefs={updateComponentRefs} validationErrors={draftErrors} onCancel={reset} onSave={save} /> : <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"><div>{workspace ? <Link to={`/workspaces/${binding.workspaceId}?tab=agents`} className="font-semibold hover:underline">{workspace.name}</Link> : <b>{binding.workspaceId}</b>}<p className="mt-1 text-xs text-muted-foreground">{workspace ? `正式项目记忆 ${binding.memoryRevision || '未设置'}` : '工作区索引缺失 · Binding 仍保留'}</p></div><div className="text-sm text-muted-foreground">Rules {binding.ruleIds.length} · Skills {binding.skillIds.length} · MCP {binding.mcpIds.length}<p className="mt-1">上下文：{binding.contextPolicy ? `覆盖 ${Object.keys(binding.contextPolicy).length} 项` : '继承'} · 输出格式：{binding.outputProfileId ? '显式' : '继承'}</p><p className="mt-1 line-clamp-2">{binding.instructions || '未设置专属 Instructions'}</p></div><div className="flex items-center gap-2"><StatusBadge tone={!workspace || !binding.ruleIds.length ? 'warning' : 'success'}>{!workspace ? '索引缺失' : binding.ruleIds.length ? '配置完整' : '缺少 Rules'}</StatusBadge><Button variant="outline" size="sm" disabled={Boolean(draft)} onClick={() => edit(binding)}>编辑</Button></div></div>}</div>})}{draft && !canonical && <div className="p-5"><WorkspaceBindingEditor draft={draft} agentPolicy={agent.contextPolicy} agentOrchestration={agent.orchestrationPolicy} assets={state.assets} onInstructions={(instructions) => setDraft({ ...draft, instructions })} onToggle={toggle} onContext={updateContext} onOutputProfile={updateOutputProfile} onOutputParameters={updateOutputParameters} onOrchestration={updateOrchestration} onComponentRefs={updateComponentRefs} validationErrors={draftErrors} onCancel={reset} onSave={save} /></div>}{!agent.workspaceBindings.length && !draft && <div className="p-5 text-sm text-muted-foreground">尚未创建 Agent × 工作区专属配置。</div>}</div></section>{unsavedDialog}</>
}

function WorkspaceBindingEditor({ draft, agentPolicy, agentOrchestration, assets, onInstructions, onToggle, onContext, onOutputProfile, onOutputParameters, onOrchestration, onComponentRefs, validationErrors, onCancel, onSave }: { draft: WorkspaceBinding; agentPolicy: ContextPolicy; agentOrchestration: FullAgent['orchestrationPolicy']; assets: ReturnType<typeof useApp>['state']['assets']; onInstructions: (value: string) => void; onToggle: (field: 'ruleIds' | 'skillIds' | 'mcpIds', id: string) => void; onContext: (value?: ContextPolicyOverride) => void; onOutputProfile: (value?: string) => void; onOutputParameters: (value: ParameterBinding[]) => void; onOrchestration: (value?: WorkspaceBinding['orchestrationPolicy']) => void; onComponentRefs: (field: 'hookRefs' | 'commandRefs', value: FullAgent['hookRefs']) => void; validationErrors: string[]; onCancel: () => void; onSave: () => void }) {
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
  return <div className="space-y-5"><div><b>{draft.workspaceId}</b><p className="mt-1 text-xs text-muted-foreground">memoryRevision 仅展示：{draft.memoryRevision || '未设置'}</p></div><Labeled label="专属 Instructions"><textarea value={draft.instructions} onChange={(event) => onInstructions(event.target.value)} className="min-h-28 w-full p-3" /></Labeled><div className="grid gap-4 md:grid-cols-3">{groups.map((group) => <fieldset key={group.field} className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{group.label}</legend><div className="mt-2 space-y-2">{group.items.map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft[group.field].includes(item.id)} onChange={() => onToggle(group.field, item.id)} />{item.name}</label>)}{!group.items.length && <p className="text-xs text-muted-foreground">无可用资产</p>}</div></fieldset>)}</div><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">上下文与输出格式覆盖 · {draft.contextPolicy ? `覆盖 ${Object.keys(draft.contextPolicy).length} 项` : '全部继承'}</summary><div className="mt-4 space-y-4"><Labeled label="输出格式"><select className="h-10 w-full px-3" value={draft.outputProfileId ?? ''} onChange={(event) => onOutputProfile(event.target.value || undefined)}><option value="">继承 Agent 根级输出格式</option>{assets.filter((item) => item.kind === 'OutputProfile').map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Labeled>{outputProfile && <ParameterBindingEditor definitions={outputProfile.parameters} bindings={draft.outputParameterBindings ?? []} onChange={onOutputParameters} />}<div className="grid gap-3 md:grid-cols-2">{([
    ['enabled', '启用策略', 'checkbox', 0, 0],
    ['triggerRatio', '触发比例（%）', 'number', 50, 95],
    ['targetRatio', '目标比例（%）', 'number', 20, 80],
    ['protectRecentTurns', '保护最近轮次', 'number', 0, 20],
    ['protectOpeningTurns', '保护开头轮次', 'number', 0, 10],
  ] as const).map(([key, label, type, min, max]) => { const overridden = draft.contextPolicy?.[key] !== undefined; const rawValue = effectivePolicy[key]; const shownValue = key === 'triggerRatio' || key === 'targetRatio' ? Number(rawValue) * 100 : rawValue; return <div key={key} className="rounded-lg border border-border p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={overridden} onChange={(event) => toggleOverride(key, event.target.checked)} />覆盖{label}</label><div className="mt-2">{type === 'checkbox' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!overridden} checked={Boolean(rawValue)} onChange={(event) => setOverride(key, event.target.checked)} />{rawValue ? '已启用' : '已关闭'}</label> : <input aria-label={label} type="number" disabled={!overridden} min={min} max={max} className="h-9 w-full px-3" value={Number(shownValue)} onChange={(event) => setOverride(key, key === 'triggerRatio' || key === 'targetRatio' ? Number(event.target.value) / 100 : Number(event.target.value))} />}</div>{!overridden && <p className="mt-1 text-xs text-muted-foreground">继承：{String(shownValue)}{key === 'triggerRatio' || key === 'targetRatio' ? '%' : ''}</p>}</div> })}</div>{contextErrors.length > 0 && <div role="alert" className="text-sm text-danger">{contextErrors.join(' ')}</div>}<p className="text-xs leading-5 text-muted-foreground">局部覆盖仍受 Agent 网络权限和全局安全边界约束，不表示当前 Session 已应用。</p></div></details><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">协作与编排收紧 · {draft.orchestrationPolicy ? '已覆盖' : '继承根级'}</summary><div className="mt-4 space-y-4"><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(draft.orchestrationPolicy)} onChange={(event) => onOrchestration(event.target.checked ? { maxDelegationDepth: Math.max(0, agentOrchestration.maxDelegationDepth - 1) } : undefined)} /><span>为此工作区 显式收紧委派边界<span className="mt-1 block text-xs text-muted-foreground">根级最大深度：{agentOrchestration.maxDelegationDepth}</span></span></label>{draft.orchestrationPolicy && <Labeled label="工作区最大委派深度"><input type="number" min={0} max={agentOrchestration.maxDelegationDepth} value={draft.orchestrationPolicy.maxDelegationDepth ?? agentOrchestration.maxDelegationDepth} onChange={(event) => setDelegationDepth(Number(event.target.value))} aria-describedby="workspace-orchestration-help" className="h-10 w-full px-3" /></Labeled>}<p id="workspace-orchestration-help" className="text-xs text-muted-foreground">工作区只能降低深度；Agent、Role、部门范围和必需条件继续继承根级，不能在这里扩大或取消。</p></div></details><details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Hook 与 Command 局部引用 · {(draft.hookRefs?.length ?? 0) + (draft.commandRefs?.length ?? 0)} 项</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{(['Hook', 'Command'] as const).map((kind) => { const field = kind === 'Hook' ? 'hookRefs' : 'commandRefs'; const references = draft[field] ?? []; return <fieldset key={kind} className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">{kind}</legend><div className="mt-2 space-y-2">{assets.filter((item) => item.kind === kind).map((asset) => <label key={asset.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={references.some((item) => item.assetId === asset.id)} onChange={() => toggleComponent(field, asset.id)} />{asset.name}</label>)}{!assets.some((item) => item.kind === kind) && <p className="text-xs text-muted-foreground">无可用资产</p>}</div></fieldset> })}</div><p className="mt-3 text-xs text-muted-foreground">这里只维护定义引用，不执行 Hook 或 Command；引用参数在资产定义允许的非敏感类型范围内校验。</p></details>{validationErrors.length > 0 && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><b>请修复以下问题后保存：</b><ul className="mt-2 list-disc space-y-1 pl-5">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>取消</Button><Button disabled={contextErrors.length > 0 || validationErrors.length > 0} onClick={onSave}><Save size={15} />模拟保存</Button></div></div>
}

function ParameterBindingEditor({ definitions, bindings, onChange }: { definitions: ParameterDefinition[]; bindings: ParameterBinding[]; onChange: (value: ParameterBinding[]) => void }) {
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
  return <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">输出参数覆盖</legend><div className="mt-2 grid gap-3 md:grid-cols-2">{definitions.map((definition) => { const binding = bindingById.get(definition.id); return <div key={definition.id} className="rounded-lg bg-muted/30 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={Boolean(binding)} onChange={(event) => update(definition, event.target.checked)} />覆盖{definition.label}{definition.required ? '（必填）' : ''}</label>{binding && <div className="mt-2">{definition.type === 'boolean' && binding.type === 'boolean' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={binding.value} onChange={(event) => update(definition, true, event.target.checked)} />{binding.value ? '是' : '否'}</label> : definition.type === 'enum' && binding.type === 'enum' ? <select aria-label={definition.label} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, event.target.value)}>{definition.options.map((option) => <option key={option}>{option}</option>)}</select> : definition.type === 'number' && binding.type === 'number' ? <input aria-label={definition.label} type="number" min={definition.min} max={definition.max} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, Number(event.target.value))} /> : definition.type === 'string-list' && binding.type === 'string-list' ? <textarea aria-label={definition.label} className="min-h-20 w-full p-2" value={binding.value.join('\n')} onChange={(event) => update(definition, true, event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /> : binding.type === 'string' ? <input aria-label={definition.label} className="h-9 w-full px-3" value={binding.value} onChange={(event) => update(definition, true, event.target.value)} /> : null}</div>}</div> })}{!definitions.length && <p className="text-xs text-muted-foreground">此输出格式没有可覆盖参数。</p>}</div></fieldset>
}

function SopTab({ agent }: { agent: FullAgent }) {
  const { state, dispatch } = useApp(); const [editing, setEditing] = useState(false); const [refs, setRefs] = useState(agent.sopRefs)
  useEffect(() => { if (!editing) setRefs(agent.sopRefs) }, [agent.sopRefs, editing])
  const dirty = editing && JSON.stringify(refs) !== JSON.stringify(agent.sopRefs)
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: () => { setRefs(agent.sopRefs); setEditing(false) } })
  const candidates = state.assets.filter((item) => item.kind === 'SOP')
  const cancel = () => { setRefs(agent.sopRefs); setEditing(false) }
  const save = () => { if (dirty) dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'sop', value: refs } }); setEditing(false) }
  useRegisterEditorSession(editing ? { id: `agent:${agent.id}:sop`, dirty, canSave: dirty, save, cancel } : undefined)
  return <><section className="panel overflow-hidden"><TabHeader title="SOP" description="SOP 只定义工作方式，不在 Desktop 中启动或推进执行。" editing={editing} onEdit={() => setEditing(true)} onCancel={cancel} onSave={save} /><div className="divide-y divide-border">{candidates.map((asset) => <div key={asset.id} className="flex items-center justify-between gap-4 p-5"><div><Link to={`/assets/${asset.id}`} className="font-semibold hover:underline">{asset.name}</Link><p className="mt-1 text-xs text-muted-foreground">{asset.scope} · {asset.version ?? '无版本'}</p></div>{editing ? <input type="checkbox" checked={refs.includes(asset.id)} onChange={() => setRefs((items) => items.includes(asset.id) ? items.filter((id) => id !== asset.id) : [...items, asset.id])} aria-label={`${refs.includes(asset.id) ? '移除' : '添加'} ${asset.name}`} /> : <StatusBadge tone={refs.includes(asset.id) ? 'success' : 'neutral'}>{refs.includes(asset.id) ? '显式引用' : '未引用'}</StatusBadge>}</div>)}</div><MockBoundaryNote>SOP 只定义工作方式，不在 Desktop 中选择本次人员、启动或推进执行。</MockBoundaryNote></section>{unsavedDialog}</>
}
function TabHeader({ title, description, editing, onEdit, onCancel, onSave, canSave = true }: { title: string; description: string; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void; canSave?: boolean }) { return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4"><div><b>{title}</b><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{editing ? <div className="flex gap-2"><Button variant="outline" onClick={onCancel}>取消</Button><Button disabled={!canSave} onClick={onSave}><Save size={15} />模拟保存</Button></div> : <Button variant="outline" size="sm" onClick={onEdit}>编辑</Button>}</div> }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium">{label}<div className="mt-2">{children}</div></label> }
function ListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) { return <Labeled label={label}><textarea value={values.join('\n')} onChange={(event) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} className="min-h-28 w-full p-3" /></Labeled> }
