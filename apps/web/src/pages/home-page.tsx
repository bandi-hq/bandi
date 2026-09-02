import { useState } from 'react'
import { ArrowRight, Bot, CircleAlert, FolderPlus, Plus, RefreshCw, ScanSearch } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { continueAgentRecovery } from '../desktop-bridge'
import { Button } from '../components/ui/button'
import { EmptyState, MockBoundaryNote, MonoPath, PageHeader, StatusBadge } from '../components/app/page'
import { useApp } from '../state'

export function HomePage() {
  const { state, dispatch, hydrateDesktop } = useApp()
  const navigate = useNavigate()
  const [recovering, setRecovering] = useState<string>()
  if (state.runtime === 'desktop' && Object.values(state.hydration).some((status) => status === 'failed')) return <HomeHydrationFailed onRetry={hydrateDesktop} />
  if (state.runtime === 'desktop' && Object.values(state.hydration).some((status) => status === 'loading')) return <HomeHydrationPending />
  if (state.onboarding.status === 'active' || !state.agents.length) return <FirstAgentWelcome />
  const desktop = state.runtime === 'desktop'
  const workspace = state.workspaces.find((item) => item.id === state.currentWorkspaceId)
  const missingAgent = state.agents.find((item) => item.config.includes('缺少'))
  const changedAgent = state.agents.find((item) => item.config === '外部变化')
  const candidate = state.memoryCandidates.find((item) => item.status === '待审核')
  const recoveries = state.agentRecoveryOperations
  const issues = [missingAgent, changedAgent, candidate].filter(Boolean).length + recoveries.length
  const recentEdits = workspace?.recentEdits ?? []
  const recover = async (operationId: string) => {
    if (recovering) return
    setRecovering(operationId)
    try {
      const result = await continueAgentRecovery(operationId)
      dispatch({ type: 'SYNC_AGENT_RECOVERY', operation: result.operation, agent: result.agent })
      dispatch({
        type: 'SHOW_NOTICE',
        notice: result.operation.status === 'completed'
          ? { tone: 'success', title: 'Agent 配置已修复', description: '文件、配置版本与组织关系已完成保存。' }
          : { tone: 'warning', title: 'Agent 配置仍需处理', description: result.operation.safeReason ?? '请查看当前恢复阶段。' },
      })
    } catch (error) {
      dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'error', title: '无法继续修复 Agent 配置', description: error instanceof Error ? error.message : String(error) } })
    } finally {
      setRecovering(undefined)
    }
  }

  return <>
    <PageHeader title="配置概览" description={desktop ? '查看待处理配置与当前工作区，再回到 Claude Code 使用。' : '查看最近演示配置、待处理事项与当前工作区。'} action={!desktop ? <Button variant="outline" onClick={() => dispatch({ type: 'TOAST', text: '浏览器演示未执行本机扫描 · 未读取文件或运行命令' })}><ScanSearch size={16} />查看扫描边界</Button> : undefined} />
    <div className={`grid gap-5 ${desktop ? '' : 'xl:grid-cols-[1.35fr_.65fr]'}`}>
      {!desktop && <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="label">最近编辑</div><h3 className="mt-1 font-semibold">从上次停下的位置继续</h3></div><span className="text-xs text-muted-foreground">演示配置记录</span></div>
        {recentEdits.length ? <div className="divide-y divide-border">{recentEdits.map((item) => <Link key={item.target} to={item.target} className="flex items-center gap-4 p-5 hover:bg-muted/50"><span className="grid size-10 place-items-center rounded-lg bg-muted"><Bot size={19} aria-hidden="true" /></span><span className="min-w-0 flex-1"><b>{item.label}</b><span className="mt-1 block truncate"><MonoPath>{workspace?.path}</MonoPath></span></span><span className="text-xs text-muted-foreground">{item.time}</span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div> : <div className="p-5"><EmptyState title={workspace ? '暂无最近编辑' : '尚未添加工作区'} description={workspace ? '当前工作区还没有演示编辑记录。' : '添加第一个工作区后，这里会显示与配置管理相关的最近编辑。'} action={!workspace ? <Button asChild><Link to="/workspaces/new"><FolderPlus size={16} aria-hidden="true" />添加工作区</Link></Button> : undefined} /></div>}
      </section>}
      <section id="pending-config" className="panel scroll-mt-24 border-l-[3px] border-l-warning p-5"><div className="flex items-center justify-between"><div className="label">待处理</div><StatusBadge tone={issues ? 'warning' : 'success'}>{issues} 项</StatusBadge></div>{issues ? <div className="mt-4 space-y-4">
        {missingAgent && <button onClick={() => navigate(`/agents/${missingAgent.id}?tab=rules`)} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-danger" /><span className="flex-1"><b className="block text-sm">配置缺失</b><small className="text-muted-foreground">{missingAgent.name} 尚未配置规则</small></span><ArrowRight size={16} /></button>}
        {changedAgent && <button onClick={() => desktop ? navigate(`/agents/${changedAgent.id}?tab=instructions`) : dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: changedAgent.id, path: `${changedAgent.packagePath}instructions.md` } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">外部变化</b><small className="text-muted-foreground">{changedAgent.name} 的主指令在外部被修改</small></span><ArrowRight size={16} /></button>}
        {candidate && <button onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'memory', candidateId: candidate.id } })} className="flex w-full items-start gap-3 text-left"><CircleAlert size={18} className="mt-0.5 text-warning" /><span className="flex-1"><b className="block text-sm">待审核正式记忆</b><small className="text-muted-foreground">{candidate.id} · {candidate.summary}</small></span><ArrowRight size={16} /></button>}
        {recoveries.map((operation) => <div key={operation.id} className="flex items-start gap-3"><CircleAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /><span className="min-w-0 flex-1"><b className="block text-sm">Agent 配置尚未完整保存</b><small className="block text-muted-foreground">{state.agents.find((item) => item.id === operation.agentId)?.name ?? operation.agentId} · {operation.status === 'blocked' ? '内容已变化，不会自动覆盖' : '可安全继续未完成阶段'}</small></span>{operation.status === 'blocked' ? <Button asChild variant="outline" size="sm"><Link to={`/agents/${operation.agentId}`}>查看 Agent</Link></Button> : <Button variant="outline" size="sm" disabled={Boolean(recovering)} aria-busy={recovering === operation.id} onClick={() => void recover(operation.id)}>{recovering === operation.id ? '修复中…' : '继续修复'}</Button>}</div>)}
      </div> : <p className="mt-4 text-sm text-success">{desktop ? '当前没有待处理配置。' : '当前演示配置已就绪。'}</p>}</section>
    </div>
    <section className="mt-5"><div className="label mb-3">快捷入口</div><div className="grid gap-3 sm:grid-cols-3">{[
      ['/agents/new?mode=import', '导入 Claude Agent', Bot], ['/agents/new', '创建个人 Agent', Plus], ['/workspaces/new', '添加工作区', FolderPlus],
    ].map(([to, label, Icon]) => <Link key={String(to)} to={String(to)} className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:border-foreground/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={17} className="mb-2" />{String(label)}</Link>)}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="panel p-5"><div className="label">当前工作区</div><h3 className="mt-2 font-semibold">{workspace?.name ?? '未选择'}</h3><p className="mt-2"><MonoPath>{workspace?.path ?? '—'}</MonoPath></p><div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={workspace?.health === '配置完整' ? 'success' : 'warning'}>{workspace?.health ?? '未知'}</StatusBadge><span className="text-xs text-muted-foreground">{workspace?.agentIds.length ?? 0} 个 Agent · {workspace?.assetIds.length ?? 0} 资产</span></div></section><MockBoundaryNote>{state.runtime === 'desktop' ? 'Bandi Desktop 用于查看和管理 Agent 配置，并支持受管配置的保存、版本恢复和本机快照。任务执行、协作和验收仍在 Claude Code 中完成。' : '浏览器演示中的更改只保存在当前页面，刷新后恢复初始状态；不会读取或写入本机配置。任务执行、协作和验收仍在 Claude Code 中完成。'}</MockBoundaryNote></div>
  </>
}

function HomeHydrationPending() {
  return <div className="mx-auto max-w-5xl py-8 sm:py-14"><section className="panel p-6 sm:p-10" aria-busy="true"><div className="label">正在读取本机配置</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">恢复你的 Agent 配置</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Bandi 正在读取 Agent、工作区和组织配置；完成前不会展示演示数据，也不会误判为首次使用。</p></section></div>
}

const hydrationLabels = {
  managedAgents: 'Agent 配置',
  organization: '组织与工作区配置',
  agentRecovery: '待恢复的 Agent 配置',
} as const

function HomeHydrationFailed({ onRetry }: { onRetry: () => void }) {
  const { state } = useApp()
  return <div className="mx-auto max-w-5xl py-8 sm:py-14">
    <section className="panel p-6 sm:p-10" role="alert">
      <div className="label text-danger">读取未完成</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">无法完整读取本机配置</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Bandi 不会把读取失败当作首次使用，也不会用演示数据替代本机事实。请查看具体失败项后重新读取。</p>
      <ul className="mt-6 space-y-3">
        {(Object.keys(hydrationLabels) as Array<keyof typeof hydrationLabels>).map((key) => {
          const status = state.hydration[key]
          return <li key={key} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{hydrationLabels[key]}</b><StatusBadge tone={status === 'failed' ? 'danger' : status === 'succeeded' ? 'success' : 'neutral'}>{status === 'failed' ? '读取失败' : status === 'succeeded' ? '读取成功' : '仍在读取'}</StatusBadge></div>
            {state.hydrationErrors[key] && <p className="mt-2 text-sm leading-6 text-danger">{state.hydrationErrors[key]}</p>}
          </li>
        })}
      </ul>
      <div className="mt-6"><Button onClick={onRetry} disabled={Object.values(state.hydration).every((status) => status === 'loading')}><RefreshCw size={16} aria-hidden="true" />重新读取</Button></div>
    </section>
  </div>
}

function FirstAgentWelcome() {
  const { state, dispatch } = useApp()
  return <div className="mx-auto max-w-5xl py-8 sm:py-14"><section className="panel overflow-hidden"><div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.15fr_.85fr]"><div><div className="label">欢迎使用 Bandi</div><h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">先导入或创建一个长期 Agent</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">把已有 Claude Agent 导入为受管副本，或直接创建个人 Agent；之后即可安全编辑配置、查看版本并按需恢复。</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/agents/new?mode=import"><Bot size={16} aria-hidden="true" />导入已有 Agent</Link></Button><Button asChild variant="outline"><Link to="/agents/new"><Plus size={16} aria-hidden="true" />创建个人 Agent</Link></Button>{state.agents.length > 0 && <Button variant="ghost" onClick={() => dispatch({ type: 'COMPLETE_ONBOARDING' })}>查看配置概览</Button>}</div><p className="mt-4 text-xs text-muted-foreground">无需预先创建工作区、公司、部门或岗位。</p></div><ol className="space-y-3" aria-label="首次使用步骤">{[['01', '导入或创建 Agent', '建立独立、稳定的受管配置'], ['02', '查看并安全修改', '保存时检查外部变化并生成配置版本'], ['03', '回到 Claude Code 使用', '任务执行、协作与验收仍在 CLI 中完成']].map(([number, title, text]) => <li key={number} className="flex gap-4 rounded-lg border border-border p-4"><span className="font-mono text-xs text-muted-foreground">{number}</span><span><b className="block text-sm">{title}</b><small className="mt-1 block text-muted-foreground">{text}</small></span></li>)}</ol></div><MockBoundaryNote>{state.runtime === 'desktop' ? 'Bandi 首次启动不会扫描电脑或申请宽泛磁盘访问。只有你发起导入、登记工作区等操作并通过系统选择器选择目标后，才会处理对应文件或目录；单文件导入创建独立受管副本，不修改来源。已登记边界可在“设置 → 配置与备份 → 存储位置”查看。' : '浏览器演示不会读取或写入本机文件，也不会申请本地访问；页面更改仅保留在当前会话。'}</MockBoundaryNote></section></div>
}
