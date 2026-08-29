import { ArrowRight, Bot, CircleAlert, FolderPlus, Plus, ScanSearch, Settings2, Workflow } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { EmptyState, MockBoundaryNote, MonoPath, PageHeader, StatusBadge } from '../components/app/page'
import { useApp } from '../state'

export function HomePage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const workspace = state.workspaces.find((item) => item.id === state.currentWorkspaceId)
  const missingAgent = state.agents.find((item) => item.config.includes('缺少'))
  const changedAgent = state.agents.find((item) => item.config === '外部变化')
  const candidate = state.memoryCandidates.find((item) => item.status === '待审核')
  const issues = [missingAgent, changedAgent, candidate].filter(Boolean).length
  const recentEdits = workspace?.recentEdits ?? []

  return <>
    <PageHeader title="配置工作台" description="继续最近的配置工作，修复真实配置问题，再回到你自己的 Claude Code CLI 使用。" action={<Button variant="outline" onClick={() => dispatch({ type: 'TOAST', text: 'Web mock 未执行本机扫描 · 未读取文件或运行命令' })}><ScanSearch size={16} />查看扫描边界</Button>} />
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="label">最近编辑</div><h3 className="mt-1 font-semibold">从上次停下的位置继续</h3></div><span className="text-xs text-muted-foreground">演示配置记录</span></div>
        {recentEdits.length ? <div className="divide-y divide-border">{recentEdits.map((item) => <Link key={item.target} to={item.target} className="flex items-center gap-4 p-5 hover:bg-muted/50"><span className="grid size-10 place-items-center rounded-lg bg-muted"><Bot size={19} aria-hidden="true" /></span><span className="min-w-0 flex-1"><b>{item.label}</b><span className="mt-1 block truncate"><MonoPath>{workspace?.path}</MonoPath></span></span><span className="text-xs text-muted-foreground">{item.time}</span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div> : <div className="p-5"><EmptyState title={workspace ? '暂无最近编辑' : '尚未添加 Workspace'} description={workspace ? '当前 Workspace 还没有演示编辑记录。' : '添加第一个 Workspace 后，这里会显示与配置管理相关的最近编辑。'} action={!workspace ? <Button asChild><Link to="/workspaces/new"><FolderPlus size={16} aria-hidden="true" />添加 Workspace</Link></Button> : undefined} /></div>}
      </section>
      <section className="panel border-l-[3px] border-l-warning p-5"><div className="flex items-center justify-between"><div className="label">需要处理</div><StatusBadge tone={issues ? 'warning' : 'success'}>{issues} 项</StatusBadge></div>{issues ? <div className="mt-4 space-y-4">
        {missingAgent && <button onClick={() => navigate(`/agents/${missingAgent.id}?tab=rules`)} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-danger" /><span className="flex-1"><b className="block text-sm">配置缺失</b><small className="text-muted-foreground">{missingAgent.name} 缺少 Rules</small></span><ArrowRight size={16} /></button>}
        {changedAgent && <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: changedAgent.id, path: `${changedAgent.packagePath}instructions.md` } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">外部变化</b><small className="text-muted-foreground">{changedAgent.name} Instructions 在外部被修改</small></span><ArrowRight size={16} /></button>}
        {candidate && <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">待审核正式记忆</b><small className="text-muted-foreground">{candidate.id} · {candidate.summary}</small></span><ArrowRight size={16} /></button>}
      </div> : <p className="mt-4 text-sm text-success">当前演示配置已就绪。</p>}</section>
    </div>
    <section className="mt-5"><div className="label mb-3">快捷入口</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['/agents/new', '新建 Agent', Plus], ['/workspaces/new', '添加 Workspace', FolderPlus], ['/assets?kind=SOP', '管理 SOP', Workflow], ['/settings/claude-code', '集成状态', Settings2],
    ].map(([to, label, Icon]) => <Link key={String(to)} to={String(to)} className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:border-foreground/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={17} className="mb-2" />{String(label)}</Link>)}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="panel p-5"><div className="label">当前 Workspace</div><h3 className="mt-2 font-semibold">{workspace?.name ?? '未选择'}</h3><p className="mt-2"><MonoPath>{workspace?.path ?? '—'}</MonoPath></p><div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={workspace?.health === '配置完整' ? 'success' : 'warning'}>{workspace?.health ?? '未知'}</StatusBadge><span className="text-xs text-muted-foreground">{workspace?.agentIds.length ?? 0} Agents · {workspace?.assetIds.length ?? 0} 资产</span></div></section><MockBoundaryNote>Desktop 只负责 Agent 与配置资产的可视化管理；任务下达、协作、逐级汇报和验收仍在你自己的 Claude Code CLI 中完成。</MockBoundaryNote></div>
  </>
}
