import { useState } from 'react'
import { Building2, ChevronDown, ChevronRight, Plus, Users } from 'lucide-react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { AppDialog } from '../../components/ui/dialog'
import { EmptyState, EntityNotFound, EntityTabs, FieldRow, PageHeader, StatusBadge } from '../../components/app/page'
import { useApp } from '../../state'
import type { FullDepartment, Role } from '../../domain'
import { generateEntityId, isDesktopRuntime, saveRole } from '../../desktop-bridge'

export function OrganizationPage() {
  const { state, dispatch } = useApp()
  const [params, setParams] = useSearchParams()
  const company = state.companies.find((item) => item.id === params.get('company')) ?? state.companies[0]
  const selectedDepartment = state.departments.find((item) => item.id === params.get('department') && item.companyId === company?.id)
  const roots = state.departments.filter((item) => item.companyId === company?.id && !item.parentDepartmentId)
  const ancestorIds = selectedDepartment ? departmentAncestorIds(selectedDepartment, state.departments) : []
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<Set<string>>(() => new Set([...roots.map((item) => item.id), ...ancestorIds]))
  const createCompany = () => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'organization', entity: 'company', mode: 'create' } })
  const selectDepartment = (department: FullDepartment) => {
    setExpandedDepartmentIds((current) => new Set([...current, ...departmentAncestorIds(department, state.departments)]))
    setParams({ company: department.companyId, department: department.id })
  }
  const changeCompany = (companyId: string) => {
    const nextRoots = state.departments.filter((item) => item.companyId === companyId && !item.parentDepartmentId)
    setExpandedDepartmentIds(new Set(nextRoots.map((item) => item.id)))
    setParams({ company: companyId })
  }
  const toggleDepartment = (departmentId: string) => setExpandedDepartmentIds((current) => {
    const next = new Set(current)
    if (next.has(departmentId)) next.delete(departmentId)
    else next.add(departmentId)
    return next
  })

  if (!state.companies.length) return <><PageHeader title="组织" description="需要部门、岗位、共享资产或委派边界时再建立组织；普通工作区与 Claude Code 配置可独立使用。" /><section className="panel p-6"><EmptyState title="尚未建立组织" description="这不会影响你登记工作区、管理现有配置或继续使用 Claude Code。" action={<Button onClick={createCompany}><Plus size={15} />创建公司</Button>} /></section></>
  return <><PageHeader title="组织" description="管理多个公司、无环部门树、主管、成员与明确委派边界；关系本身不授予权限。" action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={createCompany}><Plus size={15} />创建公司</Button><Button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'organization', entity: 'department', mode: 'create' } })}><Plus size={15} />创建部门</Button></div>} />
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="panel overflow-hidden"><div className="border-b border-border p-3"><select aria-label="当前公司" value={company?.id} onChange={(event) => changeCompany(event.target.value)} className="h-10 w-full px-3">{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><nav aria-label={`${company?.name}部门`} className="p-2">{roots.map((root) => <DepartmentNode key={root.id} department={root} depth={0} companyId={company!.id} selectedDepartmentId={selectedDepartment?.id} expandedDepartmentIds={expandedDepartmentIds} onToggle={toggleDepartment} onSelect={selectDepartment} />)}</nav></aside>
      {selectedDepartment ? <DepartmentDetails department={selectedDepartment} /> : company ? <CompanyOverview company={company} /> : <EntityNotFound entity="公司" backTo="/organization" />}
    </div></>
}

function departmentAncestorIds(department: FullDepartment, departments: FullDepartment[]) {
  const ids: string[] = []
  let parentId = department.parentDepartmentId
  while (parentId) {
    const parent = departments.find((item) => item.id === parentId && item.companyId === department.companyId)
    if (!parent || ids.includes(parent.id)) break
    ids.push(parent.id)
    parentId = parent.parentDepartmentId
  }
  return ids
}

function DepartmentNode({ department, depth, companyId, selectedDepartmentId, expandedDepartmentIds, onToggle, onSelect }: { department: FullDepartment; depth: number; companyId: string; selectedDepartmentId?: string; expandedDepartmentIds: Set<string>; onToggle: (departmentId: string) => void; onSelect: (department: FullDepartment) => void }) {
  const { state } = useApp()
  const children = state.departments.filter((item) => item.companyId === companyId && item.parentDepartmentId === department.id)
  const expanded = expandedDepartmentIds.has(department.id)
  const childrenId = `department-children-${department.id}`
  const selected = selectedDepartmentId === department.id
  return <div><div style={{ paddingLeft: `${depth * 18}px` }} className={`flex min-h-11 items-center rounded-md pr-2 text-sm ${selected ? 'bg-foreground font-medium text-background' : 'hover:bg-muted'}`}>{children.length ? <button type="button" aria-label={`${expanded ? '收起' : '展开'}${department.name}`} aria-expanded={expanded} aria-controls={childrenId} onClick={() => onToggle(department.id)} className="grid min-h-11 min-w-11 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button> : <span className="w-11" aria-hidden="true" />}<button type="button" aria-label={department.name} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(department)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Building2 size={14} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{department.name}</span><small className={selected ? 'text-background/75' : 'text-muted-foreground'}>{department.memberAgentIds.length}</small></button></div>{children.length > 0 && expanded && <div id={childrenId}>{children.map((item) => <DepartmentNode key={item.id} department={item} depth={depth + 1} companyId={companyId} selectedDepartmentId={selectedDepartmentId} expandedDepartmentIds={expandedDepartmentIds} onToggle={onToggle} onSelect={onSelect} />)}</div>}</div>
}

function CompanyOverview({ company }: { company: ReturnType<typeof useApp>['state']['companies'][number] }) { const { state, dispatch } = useApp(); return <section className="panel p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="label">公司</div><h3 className="mt-2 text-xl font-semibold">{company.name}</h3></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'organization', entity: 'company', id: company.id, mode: 'edit' } })}>编辑公司</Button><Button asChild variant="outline"><Link to={`/organization/companies/${company.id}`}>查看公司详情</Link></Button></div></div><p className="mt-5 max-w-3xl leading-7">{company.mission}</p><div className="mt-7 grid gap-3 sm:grid-cols-3"><Metric label="部门" value={state.departments.filter((item) => item.companyId === company.id).length} /><Metric label="工作区" value={state.workspaces.filter((item) => item.companyId === company.id).length} /><Metric label="共享资产" value={state.assets.filter((item) => item.companyId === company.id && item.sourceType === '显式共享').length} /></div><div className="mt-7 rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6"><b>边界</b><p className="mt-2 text-muted-foreground">{company.boundary}</p></div></section> }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-muted p-4"><b className="text-xl">{value}</b><p className="mt-1 text-xs text-muted-foreground">{label}</p></div> }

const companyTabs = [['overview', '概览'], ['organization', '组织'], ['workspaces', '工作区'], ['shared', '共享资产'], ['permissions', '权限']].map(([id, label]) => ({ id, label }))
export function CompanyDetailPage() { const { id } = useParams(); const { state, dispatch } = useApp(); const [params, setParams] = useSearchParams(); const company = state.companies.find((item) => item.id === id); if (!company) return <EntityNotFound entity="公司" backTo="/organization" />; const tab = companyTabs.some((item) => item.id === params.get('tab')) ? params.get('tab')! : 'overview'; const deps = state.departments.filter((item) => item.companyId === company.id); const workspaces = state.workspaces.filter((item) => item.companyId === company.id); const shared = state.assets.filter((item) => item.companyId === company.id && item.sourceType === '显式共享'); return <><PageHeader backTo="/organization" title={company.name} description="公司公共配置只承载普通默认、显式共享资产和不可突破的安全边界。" action={<Button variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'organization', entity: 'company', id: company.id, mode: 'edit' } })}>编辑公司</Button>} /><EntityTabs tabs={companyTabs} active={tab} onChange={(next) => setParams(next === 'overview' ? {} : { tab: next })} />{tab === 'overview' && <section className="panel p-5"><FieldRow label="使命">{company.mission}</FieldRow><FieldRow label="董事长助理">{state.agents.find((item) => item.id === company.assistantAgentId)?.name ?? '未设置'}</FieldRow><FieldRow label="部门">{deps.length}</FieldRow><FieldRow label="工作区">{workspaces.length}</FieldRow><FieldRow label="边界">{company.boundary}</FieldRow></section>}{tab === 'organization' && <Rows items={deps.map((item) => ({ id: item.id, title: item.name, meta: `${item.parentDepartmentId ? '下级部门' : '顶级部门'} · ${item.memberAgentIds.length} 个 Agent`, to: `/organization?company=${company.id}&department=${item.id}` }))} />}{tab === 'workspaces' && <Rows items={workspaces.map((item) => ({ id: item.id, title: item.name, meta: `${item.department ?? '未设置主责'} · ${item.health}`, to: `/workspaces/${item.id}` }))} />}{tab === 'shared' && <Rows items={shared.map((item) => ({ id: item.id, title: item.name, meta: `${item.kind} · ${item.references.length} 个引用`, to: `/assets/${item.id}` }))} />}{tab === 'permissions' && <section className="panel p-5"><b>不可突破的安全边界</b><div className="mt-4 space-y-3">{['权限只能收紧，不能由 Agent 自行扩大', '跨公司共享必须单独注册并授权', '生产和外部发布必须确认', '凭据、Token 与钥匙串数据不可备份'].map((item) => <div key={item} className="flex gap-3 rounded-lg border border-border p-3"><StatusBadge tone="success">固定</StatusBadge><span>{item}</span></div>)}</div></section>}</> }

function DepartmentDetails({ department: dep }: { department: FullDepartment }) {
  const { state, dispatch } = useApp()
  const [roleDialog, setRoleDialog] = useState<{ mode: 'create' | 'edit'; role?: Role }>()
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const company = state.companies.find((item) => item.id === dep.companyId)
  const parent = state.departments.find((item) => item.id === dep.parentDepartmentId)
  const manager = state.agents.find((item) => item.id === dep.managerAgentId)?.name ?? dep.manager ?? '未设置'
  const departmentRoles = state.roles.filter((role) => role.companyId === dep.companyId && role.departmentId === dep.id)
  const members = state.agents.filter((item) => dep.memberAgentIds.includes(item.id))
  const visibleMembers = members.slice(0, 5)
  const grants = state.agents.flatMap((agent) => agent.serviceGrants.filter((grant) => grant.departmentId === dep.id).map((grant) => ({ agent, grant })))
  const memory = state.memorySpaces.filter((item) => item.scopeType === 'Department × Workspace' && item.owner.startsWith(dep.name))
  const memberRow = (agent: typeof members[number]) => <Link key={agent.id} to={`/agents/${agent.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 truncate">{agent.name}</span><small className="shrink-0 text-muted-foreground">{state.roles.find((role) => role.id === agent.roleId)?.name ?? '岗位引用缺失'}</small></Link>

  return <div className="min-w-0 space-y-4">
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="label">部门</div>
          <h3 className="mt-1 text-xl font-semibold">{dep.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{company?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'organization', entity: 'department', id: dep.id, mode: 'edit' } })}>编辑部门</Button>
          <Button asChild><Link to={`/agents/new?department=${dep.id}`}><Plus size={15} />添加 Agent</Link></Button>
        </div>
      </div>
    </section>

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <b>部门职责</b>
            <span className="text-xs text-muted-foreground">委派深度 {dep.delegationDepth}</span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">上级</div><p className="mt-1 text-sm">{parent?.name ?? '公司直属'}</p></div>
            <div><div className="text-xs text-muted-foreground">主管</div><p className="mt-1 text-sm">{manager}</p></div>
            <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">使命</div><p className="mt-1 text-sm leading-6">{dep.mission}</p></div>
            <div><div className="text-xs text-muted-foreground">职责</div><p className="mt-1 text-sm leading-6">{dep.responsibilities.join('；') || '未设置'}</p></div>
            <div><div className="text-xs text-muted-foreground">边界</div><p className="mt-1 text-sm leading-6">{dep.boundaries.join('；') || '未设置'}</p></div>
            <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">拥有 SOP</div><p className="mt-1 text-sm leading-6">{dep.ownedSopIds.map((assetId) => state.assets.find((item) => item.id === assetId)?.name).filter(Boolean).join('、') || '无'}</p></div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div><b>岗位设置</b><p className="mt-1 text-xs text-muted-foreground">定义本部门可分配给 Agent 的职责与边界，不自动授予权限。</p></div>
            <Button variant="outline" size="sm" onClick={() => setRoleDialog({ mode: 'create' })}><Plus size={14} />添加岗位</Button>
          </div>
          <div className="mt-4 space-y-2">{departmentRoles.map((role) => {
            const referenceCount = state.agents.filter((agent) => agent.roleId === role.id).length
            return <button key={role.id} type="button" onClick={() => setRoleDialog({ mode: 'edit', role })} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0"><b>{role.name}</b><small className="mt-1 block truncate text-muted-foreground">{role.mission}</small></span><span className="shrink-0 text-xs text-muted-foreground">{role.status === 'archived' ? <StatusBadge tone="neutral">已归档</StatusBadge> : `${referenceCount} 位成员`}</span></button>
          })}{!departmentRoles.length && <p className="text-sm text-muted-foreground">当前部门还没有专属岗位；公司范围岗位仍可用于 Agent。</p>}</div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users size={17} aria-hidden="true" /><b>部门成员</b></div><span className="text-sm text-muted-foreground" aria-label={`共 ${members.length} 位成员`}>{members.length}</span></div>
          <div className="mt-4 space-y-2">{visibleMembers.map(memberRow)}{!members.length && <p className="text-sm text-muted-foreground">暂无 Agent 成员。</p>}{members.length > visibleMembers.length && <Button className="w-full" variant="outline" onClick={() => setMembersDialogOpen(true)}>查看全部 {members.length} 位成员</Button>}</div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3"><b>服务授权</b><span className="text-sm text-muted-foreground" aria-label={`共 ${grants.length} 项服务授权`}>{grants.length}</span></div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">{grants.map(({ agent, grant }) => <p key={grant.id}>{agent.name}：{grant.capabilities.join('、')} · {grant.status}</p>)}{!grants.length && <p>暂无其他 Agent 获得本部门的服务授权。</p>}</div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3"><b>部门项目记忆</b><span className="text-sm text-muted-foreground" aria-label={`共 ${memory.length} 项部门项目记忆`}>{memory.length}</span></div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">按工作区沉淀的长期约定与项目经验。</p>
          <div className="mt-4 space-y-2">{memory.map((item) => {
            const workspace = state.workspaces.find((candidate) => candidate.departmentMemorySpaceIds.includes(item.id))
            const revision = item.revision.replace(/^r(?=\d+$)/, '第 ') + (item.revision.match(/^r\d+$/) ? ' 版' : '')
            return workspace ? <Link key={item.id} to={`/workspaces/${workspace.id}?tab=memory`} aria-label={`查看 ${workspace.name} 的部门项目记忆，${revision}`} className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 flex-1"><b className="block truncate text-sm">{workspace.name}</b><small className="mt-1 block text-muted-foreground">{revision}</small></span><ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" /></Link> : <div key={item.id} className="rounded-lg border border-border p-3"><b className="text-sm">未关联工作区</b><small className="mt-1 block text-muted-foreground">{revision}</small></div>
          })}{!memory.length && <p className="text-sm leading-6 text-muted-foreground">当前部门还没有正式项目记忆。记忆候选经审核后会沉淀到这里。</p>}</div>
        </section>
      </aside>
    </div>
    {roleDialog && <RoleDialog department={dep} current={roleDialog.role} onClose={() => setRoleDialog(undefined)} />}
    {membersDialogOpen && <DepartmentMembersDialog department={dep} members={members} onClose={() => setMembersDialogOpen(false)} />}
  </div>
}

function DepartmentMembersDialog({ department, members, onClose }: { department: FullDepartment; members: ReturnType<typeof useApp>['state']['agents']; onClose: () => void }) {
  const { state } = useApp()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredMembers = members.filter((agent) => {
    const roleName = state.roles.find((role) => role.id === agent.roleId)?.name ?? '岗位引用缺失'
    return `${agent.name} ${roleName}`.toLocaleLowerCase().includes(normalizedQuery)
  })

  return <AppDialog open onOpenChange={(open) => { if (!open) onClose() }} title={`${department.name}成员`} description={`共 ${members.length} 位 Agent 成员`} size="md"><label className="block text-sm font-medium">搜索成员<input autoFocus className="mt-2 h-10 w-full px-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入姓名或岗位" /></label><div className="mt-4 space-y-2">{filteredMembers.map((agent) => <Link key={agent.id} to={`/agents/${agent.id}`} onClick={onClose} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 truncate">{agent.name}</span><small className="shrink-0 text-muted-foreground">{state.roles.find((role) => role.id === agent.roleId)?.name ?? '岗位引用缺失'}</small></Link>)}{!filteredMembers.length && <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的成员。</p>}</div></AppDialog>
}

export function LegacyDepartmentRedirect() { const { id } = useParams(); const { state } = useApp(); const department = state.departments.find((item) => item.id === id); if (!department) return <EntityNotFound entity="Department" backTo="/organization" />; return <Navigate replace to={`/organization?company=${encodeURIComponent(department.companyId)}&department=${encodeURIComponent(department.id)}`} /> }

function RoleDialog({ department, current, onClose }: { department: FullDepartment; current?: Role; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const [name, setName] = useState(current?.name ?? '')
  const [mission, setMission] = useState(current?.mission ?? '')
  const [responsibilities, setResponsibilities] = useState((current?.responsibilities ?? []).join('\n'))
  const [boundaries, setBoundaries] = useState((current?.decisionBoundaries ?? []).join('\n'))
  const referencedAgents = current ? state.agents.filter((agent) => agent.roleId === current.id) : []
  const duplicate = state.roles.some((role) => role.id !== current?.id && role.companyId === department.companyId && role.name.trim() === name.trim())
  const [generatedId, setGeneratedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const desktop = isDesktopRuntime()
  const toLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
  const save = async (status: Role['status'] = current?.status ?? 'active') => {
    if (saving) return
    setSaving(true)
    setError(undefined)
    try {
      const id = current?.id ?? (generatedId || (desktop ? await generateEntityId('role', `${department.id}-${name}`) : `role-${department.id}-${crypto.randomUUID()}`))
      if (!current && !generatedId) setGeneratedId(id)
      const role: Role = {
        id,
        companyId: department.companyId,
        departmentId: department.id,
        name: name.trim(),
        status,
        mission: mission.trim(),
        responsibilities: toLines(responsibilities),
        inputs: current?.inputs ?? [],
        deliverables: current?.deliverables ?? [],
        decisionBoundaries: toLines(boundaries),
        escalationConditions: current?.escalationConditions ?? [],
        completionDefinition: current?.completionDefinition ?? [],
      }
      const persisted = desktop ? await saveRole(role) : role
      dispatch(desktop
        ? { type: 'SYNC_PERSISTED_ROLES', roles: [persisted] }
        : current
          ? { type: 'UPDATE_ROLE', roleId: current.id, changes: persisted }
          : { type: 'CREATE_ROLE', role: persisted })
      onClose()
      dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: current ? '岗位已保存' : '岗位已创建', description: `${persisted.name} 的职责与边界已更新。` } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  return <AppDialog open onOpenChange={(open) => { if (!open && !saving) onClose() }} title={current ? '编辑岗位' : '添加岗位'} description={`${department.name} · 岗位只定义职责与边界，不授予权限或资产`} size="md" footer={<><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button>{current?.status === 'active' && <Button variant="outline" disabled={saving} onClick={() => save('archived')}>{saving ? '保存中…' : '归档'}</Button>}<Button disabled={!name.trim() || !mission.trim() || duplicate || saving} onClick={() => save()}>{saving ? '保存中…' : desktop ? '保存岗位' : '保存演示配置'}</Button></>}><label className="block text-sm font-medium">岗位名称<input className="mt-2 h-10 w-full px-3" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={duplicate} aria-describedby={duplicate ? 'role-name-error' : undefined} />{duplicate && <span id="role-name-error" className="mt-1 block text-xs text-danger">同一公司内岗位名称不能重复。</span>}</label><label className="mt-4 block text-sm font-medium">岗位使命<textarea className="mt-2 min-h-20 w-full p-3" value={mission} onChange={(event) => setMission(event.target.value)} /></label><label className="mt-4 block text-sm font-medium">职责（每行一项）<textarea className="mt-2 min-h-24 w-full p-3" value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label><label className="mt-4 block text-sm font-medium">决策边界（每行一项）<textarea className="mt-2 min-h-24 w-full p-3" value={boundaries} onChange={(event) => setBoundaries(event.target.value)} /></label>{error && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}{current && <div className="mt-4 rounded-lg border border-border bg-muted/35 p-3 text-sm"><b>引用影响</b><p className="mt-1 text-muted-foreground">{referencedAgents.length ? `${referencedAgents.map((agent) => agent.name).join('、')} 正在使用该岗位；归档后保留引用并产生配置诊断。` : '当前没有 Agent 使用该岗位。'}</p></div>}<p className="mt-4 text-xs text-muted-foreground">{desktop ? '岗位保存到 Bandi 本机数据；不修改 AgentPackage、权限或委派。' : '仅更新当前页面；不修改 AgentPackage、权限或委派。'}</p></AppDialog>
}

function Rows({ items }: { items: { id: string; title: string; meta: string; to: string }[] }) { return <section className="panel divide-y divide-border">{items.map((item) => <Link key={item.id} to={item.to} className="flex items-center justify-between gap-4 p-5 hover:bg-muted"><b>{item.title}</b><span className="text-sm text-muted-foreground">{item.meta}</span></Link>)}{!items.length && <p className="p-5 text-sm text-muted-foreground">暂无关联对象。</p>}</section> }
