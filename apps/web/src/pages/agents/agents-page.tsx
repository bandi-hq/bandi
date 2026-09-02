import { Plus, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState, PageHeader, StatusBadge, toneForStatus } from '../../components/app/page'
import { AgentAvatar } from '../../components/agents/agent-avatar'
import { useApp } from '../../state'
import type { FullAgent } from '../../domain'
import { getAgentConfigStatus } from '../../domain-selectors'
import { groupDiscoveryDiagnostics } from '../../discovered-assets'
import { DiscoveryIssues } from '../assets/discovered-assets-table'

const filterKeys = ['q', 'company', 'department', 'role', 'workspace', 'health', 'lifecycle'] as const

export function getAgentListTarget(agent: FullAgent, status: string = agent.config) {
  if (status === '配置缺口') return `/agents/${agent.id}?tab=rules`
  if (status !== '外部变化') return `/agents/${agent.id}`
  const params = new URLSearchParams({ tab: 'package' })
  const changedFile = agent.files.find((file) => file.status.includes('外部变化'))
  if (changedFile) {
    params.set('path', changedFile.path)
    params.set('view', 'preview')
  }
  return `/agents/${agent.id}?${params}`
}

export function AgentsPage() {
  const { state } = useApp()
  const [params, setParams] = useSearchParams()
  const value = (key: typeof filterKeys[number]) => params.get(key) ?? ''
  const set = (key: typeof filterKeys[number], next: string) => { const copy = new URLSearchParams(params); if (next) copy.set(key, next); else copy.delete(key); setParams(copy) }
  const roleName = (roleId?: string) => roleId ? state.roles.find((role) => role.id === roleId)?.name ?? '岗位引用缺失' : '未关联组织'
  const agentStatus = (agent: FullAgent) => getAgentConfigStatus(state, agent)
  const rows = state.agents.filter((agent) => {
    const q = value('q').toLocaleLowerCase()
    const workspaceMatch = !value('workspace') || agent.workspaceBindings.some((binding) => binding.workspaceId === value('workspace'))
    return (!q || `${agent.name} ${roleName(agent.roleId)} ${agent.department} ${agent.service ?? ''}`.toLocaleLowerCase().includes(q))
      && (!value('company') || agent.companyId === value('company'))
      && (!value('department') || agent.primaryDepartmentId === value('department'))
      && (!value('role') || agent.roleId === value('role'))
      && workspaceMatch
      && (!value('health') || agentStatus(agent).level === value('health'))
      && (!value('lifecycle') || agent.status === value('lifecycle'))
  })
  const clear = () => setParams({})
  const roles = state.roles.filter((role) => state.agents.some((agent) => agent.roleId === role.id))

  return <>
    <PageHeader title="Agent" description="导入或创建长期 Agent，安全管理配置与版本；组织关系可按需设置。" action={<div className="flex flex-wrap gap-2"><Button asChild><Link to="/agents/new?mode=import"><Plus size={16} />导入 Claude Agent</Link></Button><Button variant="outline" asChild><Link to="/agents/new">创建个人 Agent</Link></Button><Button variant="ghost" asChild><Link to="/agents/new?mode=reference">仅登记外部引用</Link></Button></div>} />
    <section className="panel overflow-hidden">
      {state.agentDiagnostics.length > 0 && <DiscoveryIssues groups={groupDiscoveryDiagnostics(state.agentDiagnostics)} />}
      <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative md:col-span-2"><span className="sr-only">搜索 Agent</span><Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} /><input value={value('q')} onChange={(event) => set('q', event.target.value)} className="h-9 w-full pl-9 pr-3" placeholder="搜索名称、岗位、部门或服务范围…" /></label>
        <Filter label="公司" value={value('company')} onChange={(next) => set('company', next)} options={state.companies.map((item) => [item.id, item.name])} />
        <Filter label="部门" value={value('department')} onChange={(next) => set('department', next)} options={state.departments.map((item) => [item.id, item.name])} />
        <Filter label="岗位" value={value('role')} onChange={(next) => set('role', next)} options={roles.map((item) => [item.id, item.name])} />
        <Filter label="工作区" value={value('workspace')} onChange={(next) => set('workspace', next)} options={state.workspaces.map((item) => [item.id, item.name])} />
        <Filter label="配置状态" value={value('health')} onChange={(next) => set('health', next)} options={[['healthy', '配置完整'], ['warning', '需要注意'], ['error', '配置缺口']]} />
        <Filter label="使用状态" value={value('lifecycle')} onChange={(next) => set('lifecycle', next)} options={([['active', '启用'], ['inactive', '停用'], ['archived', '归档']] as const).map(([id, label]) => [id, label])} />
      </div>
      {filterKeys.some((key) => value(key)) && <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2 text-xs"><span>已应用组合筛选</span><button onClick={clear} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><X size={13} />清除全部</button></div>}
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{['Agent', '岗位', '所属部门 / 服务范围', '使用状态', '关联工作区', '配置状态', '最近编辑'].map((heading) => <th className="px-5 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((agent) => <tr key={agent.id} className="group relative hover:bg-muted/40 focus-within:bg-muted/40"><td className="px-5 py-4"><Link className="absolute inset-0 z-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" to={getAgentListTarget(agent, agentStatus(agent).label)} aria-label={`查看 ${agent.name} Agent 详情${agentStatus(agent).level === 'healthy' ? '' : `，${agentStatus(agent).label}`}`}><span className="sr-only">{agent.name}</span></Link><div className="flex items-center gap-3 font-semibold"><AgentAvatar agent={agent} />{agent.name}</div></td><td className="px-5 py-4">{roleName(agent.roleId)}</td><td className="px-5 py-4 text-sm">{agent.department}{agent.service && <small className="block text-muted-foreground">显式服务 {agent.service}</small>}</td><td className="px-5 py-4"><StatusBadge tone={toneForStatus(agent.status)}>{agent.status}</StatusBadge></td><td className="px-5 py-4">{agent.workspaceBindings.length}</td><td className="px-5 py-4"><StatusBadge tone={agentStatus(agent).level === 'healthy' ? 'success' : agentStatus(agent).level === 'warning' ? 'warning' : 'danger'}>{agentStatus(agent).label}</StatusBadge></td><td className="px-5 py-4 text-muted-foreground">{agent.updated}</td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title={state.agentDiagnostics.length && !state.agents.length ? `发现 ${state.agentDiagnostics.length} 项 Agent 配置问题` : '没有匹配的 Agent'} description={state.agentDiagnostics.length && !state.agents.length ? '请按上方说明处理配置文件，然后重新读取。' : '请清除部分筛选条件，或创建一个新的 Agent。'} action={state.agents.length ? <Button variant="outline" onClick={clear}>清除筛选</Button> : undefined} /></div>}
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{rows.length} / {state.agents.length} 个 Agent</div>
    </section>
  </>
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="text-xs text-muted-foreground"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full px-3 text-sm text-foreground"><option value="">全部{label}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}
