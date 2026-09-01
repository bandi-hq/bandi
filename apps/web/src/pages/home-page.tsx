import { ArrowRight, Bot, CircleAlert, FolderPlus, Plus, ScanSearch, Workflow } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { EmptyState, MockBoundaryNote, MonoPath, PageHeader, StatusBadge } from '../components/app/page'
import { useApp } from '../state'

export function HomePage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  if (state.runtime === 'desktop' && state.hydration.organization === 'loading') return <HomeHydrationPending />
  if (state.onboarding.status === 'active' || !state.workspaces.length) return <FirstWorkspaceWelcome />
  const workspace = state.workspaces.find((item) => item.id === state.currentWorkspaceId)
  const missingAgent = state.agents.find((item) => item.config.includes('缺少'))
  const changedAgent = state.agents.find((item) => item.config === '外部变化')
  const candidate = state.memoryCandidates.find((item) => item.status === '待审核')
  const issues = [missingAgent, changedAgent, candidate].filter(Boolean).length
  const recentEdits = workspace?.recentEdits ?? []

  return <>
    <PageHeader title="配置概览" description="查看最近配置、待处理事项与当前工作区，再回到已加入的 AI 编程工具使用。" action={<Button variant="outline" onClick={() => dispatch({ type: 'TOAST', text: '浏览器演示未执行本机扫描 · 未读取文件或运行命令' })}><ScanSearch size={16} />查看扫描边界</Button>} />
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="label">最近编辑</div><h3 className="mt-1 font-semibold">从上次停下的位置继续</h3></div><span className="text-xs text-muted-foreground">演示配置记录</span></div>
        {recentEdits.length ? <div className="divide-y divide-border">{recentEdits.map((item) => <Link key={item.target} to={item.target} className="flex items-center gap-4 p-5 hover:bg-muted/50"><span className="grid size-10 place-items-center rounded-lg bg-muted"><Bot size={19} aria-hidden="true" /></span><span className="min-w-0 flex-1"><b>{item.label}</b><span className="mt-1 block truncate"><MonoPath>{workspace?.path}</MonoPath></span></span><span className="text-xs text-muted-foreground">{item.time}</span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div> : <div className="p-5"><EmptyState title={workspace ? '暂无最近编辑' : '尚未添加工作区'} description={workspace ? '当前工作区还没有演示编辑记录。' : '添加第一个工作区后，这里会显示与配置管理相关的最近编辑。'} action={!workspace ? <Button asChild><Link to="/workspaces/new"><FolderPlus size={16} aria-hidden="true" />添加 Workspace</Link></Button> : undefined} /></div>}
      </section>
      <section id="pending-config" className="panel scroll-mt-24 border-l-[3px] border-l-warning p-5"><div className="flex items-center justify-between"><div className="label">待处理</div><StatusBadge tone={issues ? 'warning' : 'success'}>{issues} 项</StatusBadge></div>{issues ? <div className="mt-4 space-y-4">
        {missingAgent && <button onClick={() => navigate(`/agents/${missingAgent.id}?tab=rules`)} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-danger" /><span className="flex-1"><b className="block text-sm">配置缺失</b><small className="text-muted-foreground">{missingAgent.name} 缺少 Rules</small></span><ArrowRight size={16} /></button>}
        {changedAgent && <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: changedAgent.id, path: `${changedAgent.packagePath}instructions.md` } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">外部变化</b><small className="text-muted-foreground">{changedAgent.name} Instructions 在外部被修改</small></span><ArrowRight size={16} /></button>}
        {candidate && <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">待审核正式记忆</b><small className="text-muted-foreground">{candidate.id} · {candidate.summary}</small></span><ArrowRight size={16} /></button>}
      </div> : <p className="mt-4 text-sm text-success">当前演示配置已就绪。</p>}</section>
    </div>
    <section className="mt-5"><div className="label mb-3">快捷入口</div><div className="grid gap-3 sm:grid-cols-3">{[
      ['/workspaces/new', '添加工作区', FolderPlus], ['/agents/new', '按需新建 Agent', Plus], ['/assets?kind=SOP', '管理 SOP', Workflow],
    ].map(([to, label, Icon]) => <Link key={String(to)} to={String(to)} className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:border-foreground/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={17} className="mb-2" />{String(label)}</Link>)}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="panel p-5"><div className="label">当前工作区</div><h3 className="mt-2 font-semibold">{workspace?.name ?? '未选择'}</h3><p className="mt-2"><MonoPath>{workspace?.path ?? '—'}</MonoPath></p><div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={workspace?.health === '配置完整' ? 'success' : 'warning'}>{workspace?.health ?? '未知'}</StatusBadge><span className="text-xs text-muted-foreground">{workspace?.agentIds.length ?? 0} Agents · {workspace?.assetIds.length ?? 0} 资产</span></div></section><MockBoundaryNote>Desktop 只负责 Agent 与配置资产的可视化管理；任务下达、协作、逐级汇报和验收仍在你自己的 Claude Code CLI 中完成。</MockBoundaryNote></div>
  </>
}

function HomeHydrationPending() {
  return <div className="mx-auto max-w-5xl py-8 sm:py-14"><section className="panel p-6 sm:p-10" aria-busy="true"><div className="label">正在读取本机配置</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">恢复你的工作区</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Bandi 正在读取已登记的 Workspace 与组织配置，完成前不会展示演示数据或误判首次使用状态。</p></section></div>
}

function FirstWorkspaceWelcome() {
  const { state, dispatch } = useApp()
  return <div className="mx-auto max-w-5xl py-8 sm:py-14"><section className="panel overflow-hidden"><div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.15fr_.85fr]"><div><div className="label">欢迎使用 Bandi</div><h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">先建立你的个人工作区</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">从现有项目目录开始，先获得一个可独立使用的个人配置空间；需要长期多人或多 Agent 协作时，再让 AI 帮你规划组织、岗位和边界。</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/workspaces/new?onboarding=1"><FolderPlus size={16} aria-hidden="true" />选择目录开始</Link></Button>{state.workspaces.length > 0 && <Button variant="outline" onClick={() => dispatch({ type: 'COMPLETE_ONBOARDING' })}>查看预置演示</Button>}</div><p className="mt-4 text-xs text-muted-foreground">无需先创建 AgentPackage、安装 Bandi Plugin 或建立公司。</p></div><ol className="space-y-3" aria-label="首次使用步骤">{[['01', '登记个人工作区', '选择本地项目目录'], ['02', '按需规划协作方式', '让 AI 先澄清场景，再建议组织与长期 Agent'], ['03', '回到 Claude Code 使用', '确认方案后再按需保存长期配置']].map(([number, title, text]) => <li key={number} className="flex gap-4 rounded-lg border border-border p-4"><span className="font-mono text-xs text-muted-foreground">{number}</span><span><b className="block text-sm">{title}</b><small className="mt-1 block text-muted-foreground">{text}</small></span></li>)}</ol></div><MockBoundaryNote>浏览器演示不会打开系统目录选择器，不读取目录或探测工具安装状态，也不会创建、复制、安装或执行任何文件和命令。当前只有 Claude Code 提供经过验证的终端交接；其他工具仅提供配置入口。</MockBoundaryNote></section></div>
}
