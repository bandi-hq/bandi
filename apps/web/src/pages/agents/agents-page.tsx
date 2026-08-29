import { Plus, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState, PageHeader, StatusBadge, toneForStatus } from '../../components/app/page'
import { useApp } from '../../state'

const filterKeys = ['q', 'company', 'department', 'role', 'workspace', 'health', 'lifecycle'] as const

export function AgentsPage() {
  const { state } = useApp()
  const [params, setParams] = useSearchParams()
  const value = (key: typeof filterKeys[number]) => params.get(key) ?? ''
  const set = (key: typeof filterKeys[number], next: string) => { const copy = new URLSearchParams(params); if (next) copy.set(key, next); else copy.delete(key); setParams(copy) }
  const rows = state.agents.filter((agent) => {
    const q = value('q').toLocaleLowerCase()
    const workspaceMatch = !value('workspace') || agent.workspaceBindings.some((binding) => binding.workspaceId === value('workspace'))
    return (!q || `${agent.name} ${agent.role} ${agent.department} ${agent.service ?? ''}`.toLocaleLowerCase().includes(q))
      && (!value('company') || agent.companyId === value('company'))
      && (!value('department') || agent.primaryDepartmentId === value('department'))
      && (!value('role') || agent.role === value('role'))
      && workspaceMatch
      && (!value('health') || agent.config === value('health'))
      && (!value('lifecycle') || agent.status === value('lifecycle'))
  })
  const clear = () => setParams({})
  const roles = [...new Set(state.agents.map((item) => item.role))]

  return <>
    <PageHeader title="Agents" description="长期 AgentPackage 及其组织归属、服务授权和配置健康度；此处不是进程或会话列表。" action={<Button asChild><Link to="/agents/new"><Plus size={16} />创建 Agent</Link></Button>} />
    <section className="panel overflow-hidden">
      <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative md:col-span-2"><span className="sr-only">搜索 Agents</span><Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} /><input value={value('q')} onChange={(event) => set('q', event.target.value)} className="h-9 w-full pl-9 pr-3" placeholder="搜索名称、岗位、部门或服务范围…" /></label>
        <Filter label="公司" value={value('company')} onChange={(next) => set('company', next)} options={state.companies.map((item) => [item.id, item.name])} />
        <Filter label="部门" value={value('department')} onChange={(next) => set('department', next)} options={state.departments.map((item) => [item.id, item.name])} />
        <Filter label="岗位" value={value('role')} onChange={(next) => set('role', next)} options={roles.map((item) => [item, item])} />
        <Filter label="Workspace" value={value('workspace')} onChange={(next) => set('workspace', next)} options={state.workspaces.map((item) => [item.id, item.name])} />
        <Filter label="配置状态" value={value('health')} onChange={(next) => set('health', next)} options={['配置完整', '外部变化', '缺少 Rules'].map((item) => [item, item])} />
        <Filter label="生命周期" value={value('lifecycle')} onChange={(next) => set('lifecycle', next)} options={['启用', '停用', '归档'].map((item) => [item, item])} />
      </div>
      {filterKeys.some((key) => value(key)) && <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2 text-xs"><span>已应用组合筛选</span><button onClick={clear} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><X size={13} />清除全部</button></div>}
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{['Agent', '岗位', '主属 / 服务', '生命周期', 'Workspaces', '配置状态', '最近编辑'].map((heading) => <th className="px-5 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((agent) => <tr key={agent.id} className="hover:bg-muted/40"><td><Link className="flex items-center gap-3 px-5 py-4 font-semibold" to={`/agents/${agent.id}`}><span className="grid size-8 place-items-center rounded-lg bg-muted">{agent.name[0]}</span>{agent.name}</Link></td><td className="px-5 py-4">{agent.role}</td><td className="px-5 py-4 text-sm">{agent.department}{agent.service && <small className="block text-muted-foreground">显式服务 {agent.service}</small>}</td><td className="px-5 py-4"><StatusBadge tone={toneForStatus(agent.status)}>{agent.status}</StatusBadge></td><td className="px-5 py-4">{agent.workspaceBindings.length}</td><td className="px-5 py-4"><StatusBadge tone={toneForStatus(agent.config)}>{agent.config}</StatusBadge></td><td className="px-5 py-4 text-muted-foreground">{agent.updated}</td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="没有匹配的 Agent" description="请清除部分筛选条件，或创建一个新的长期 AgentPackage 演示记录。" action={<Button variant="outline" onClick={clear}>清除筛选</Button>} /></div>}
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{rows.length} / {state.agents.length} 个 Agent</div>
    </section>
  </>
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="text-xs text-muted-foreground"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full px-3 text-sm text-foreground"><option value="">全部{label}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}
