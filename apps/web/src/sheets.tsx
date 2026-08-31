import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, FileDiff, Info, ShieldAlert } from 'lucide-react'
import { AiClientIcon, supportsWorkspaceHandoff } from './components/ai-clients'
import { Button } from './components/ui/button'
import { AppDialog } from './components/ui/dialog'
import { Tooltip } from './components/ui/tooltip'
import { MonoPath, StatusBadge, toneForStatus } from './components/app/page'
import { useApp } from './state'
import { buildBackupPreview, createDemoSnapshot, describeBackupScope } from './backup-policy'
import { defaultClaudeCodeLaunchProfile, isHighRiskLaunchProfile } from './configuration-environment-model'
import type { BackupScope } from './domain'
import { isDesktopRuntime, requestLaunchWorkspace } from './desktop-bridge'
import { buildLaunchCommand, normalizeTerminalId, terminalLabel } from './terminal-model'

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[128px_1fr]"><div className="text-sm text-muted-foreground">{label}</div><div className="min-w-0 break-words text-sm">{children}</div></div>
}

function buildCollaborationPlanningPrompt(goal: string, participants: string, boundaries: string): string {
  return [
    '请先提出必要的澄清问题，并判断当前个人工作区是否已经足够；只有确有长期协作需要时，才建议建立组织。',
    '',
    `场景与目标：${goal.trim()}`,
    participants.trim() && `当前参与者与资源：${participants.trim()}`,
    boundaries.trim() && `高频协作与重要边界：${boundaries.trim()}`,
    '',
    '如确有需要，请建议 Company、Department、岗位、真人职责、长期 Agent、权限与服务授权、SOP 的最小方案。一次性工作不要直接转成长期开岗或 Agent；组织身份、岗位和关系不自动授予权限。',
    '在我明确确认前，只输出分析、选项和建议，不要创建、修改、保存或删除 Company、Department、Role、Agent、WorkspaceBinding、权限、SOP、Memory 或任何配置文件。',
  ].filter(Boolean).join('\n')
}

export function GlobalSheets() {
  const { state, dispatch } = useApp()
  const dialog = state.dialog
  const [confirmName, setConfirmName] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [impact, setImpact] = useState<'local' | 'shared'>('shared')
  const [conflicts, setConflicts] = useState<Record<string, string>>({})
  const [restoreStep, setRestoreStep] = useState<1 | 2 | 3>(1)
  const [restoreScope, setRestoreScope] = useState<BackupScope>({ kind: 'all' })
  const [restoreFiles, setRestoreFiles] = useState<string[]>([])
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>()
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const close = () => dispatch({ type: 'CLOSE_DIALOG' })
  const done = (text: string) => { close(); dispatch({ type: 'TOAST', text }) }

  useEffect(() => {
    setConfirmName('')
    setUnderstood(false)
    setImpact('shared')
    setConflicts({})
    setRestoreStep(1)
    setRestoreScope({ kind: 'all' })
    setRestoreFiles([])
    setSelectedRevisionId(undefined)
    setRestoreConfirmed(false)
  }, [dialog?.kind])

  const workspace = state.workspaces.find((item) => item.id === (dialog?.kind === 'client-guide' ? dialog.workspaceId : state.currentWorkspaceId))
  const clientId = dialog?.kind === 'client-guide' ? dialog.clientId ?? 'claude-code' : 'claude-code'
  const client = state.aiClients.find((item) => item.id === clientId)
  const agentId = dialog && 'agentId' in dialog ? dialog.agentId : undefined
  const agent = state.agents.find((item) => item.id === agentId)
  const assetId = dialog && 'assetId' in dialog ? dialog.assetId : undefined
  const asset = state.assets.find((item) => item.id === assetId)
  const path = dialog?.kind === 'diff' && dialog.path ? dialog.path : asset?.path ?? (agent ? `${agent.packagePath}instructions.md` : '未指定路径')

  if (!dialog) return null

  if (dialog.kind === 'client-guide') return client ? <ClientGuideDialog client={client} workspace={workspace} agent={agent} planning={dialog.planning} close={close} /> : <MissingDialog title="AI 编程工具不存在" close={close} />

  if (dialog.kind === 'config-history') {
    const revisions = state.configRevisions.filter((item) => item.ownerType === dialog.ownerType && item.ownerId === dialog.ownerId && item.path === dialog.path)
    const selected = revisions.find((item) => item.id === selectedRevisionId) ?? revisions[0]
    const current = revisions[0]
    const canRestore = Boolean(selected && selected.id !== current?.id && restoreConfirmed)
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`配置历史 · ${dialog.path.split('/').at(-1)}`} description="历史版本不可变；恢复会生成新的页面内存版本。" size="xl" footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={!canRestore} onClick={() => selected && dispatch({ type: 'RESTORE_CONFIG_REVISION', revisionId: selected.id })}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="配置版本">{revisions.map((revision, index) => <button key={revision.id} type="button" onClick={() => { setSelectedRevisionId(revision.id); setRestoreConfirmed(false) }} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><span className="flex items-center justify-between gap-2"><b className="text-sm">{revision.id}</b>{index === 0 && <StatusBadge tone="success">当前</StatusBadge>}</span><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small><small className="mt-1 block text-muted-foreground">{revision.evidence === 'memory-only' ? '仅当前页面内存' : '预置演示资料'}{revision.parentRevisionId ? ` · 父版本 ${revision.parentRevisionId}` : ''}</small>{revision.restoredFromRevisionId && <small className="mt-1 block text-muted-foreground">恢复自 {revision.restoredFromRevisionId}</small>}</button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">当前版本</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{current?.content}</pre></div><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selected?.id === current?.id ? '选择一个历史版本比较' : selected?.id}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{selected?.content}</pre></div></div><div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">恢复只会基于上方当前内容与目标内容生成新的 ConfigRevision；不会覆盖历史，不读取或写入文件。</div>{selected && selected.id !== current?.id && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前版本与目标版本的内容差异，确认恢复为新的页面内存版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前文件尚无演示 ConfigRevision。正式 Memory 使用独立 MemoryRevision。</p>}
    </AppDialog>
  }

  if (dialog.kind === 'source') {
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="来源与有效配置" description={`${agent?.name ?? asset?.name ?? '配置对象'} / ${dialog.section ?? asset?.kind ?? '配置'}`} size="md" footer={<Button onClick={close}>关闭</Button>}>
      <section><div className="label">有效值摘要</div><p className="mt-2 text-sm leading-6">当前有效值来自对象自有配置与显式引用；组织身份不形成隐式继承或权限授予。</p></section>
      <section className="panel mt-5 p-4"><InfoRow label="对象自有"><MonoPath>{asset?.path ?? agent?.packagePath ?? '—'}</MonoPath></InfoRow><InfoRow label="显式引用">{agent ? `${agent.ruleRefs.length} Rules · ${agent.skillRefs.length} Skills · ${agent.mcpRefs.length} MCP` : `${asset?.references.length ?? 0} 个引用对象`}</InfoRow><InfoRow label="全局强制">外部变化、共享影响和权限扩大必须确认，Agent 不可放宽。</InfoRow><InfoRow label="系统事实">Web mock 未读取文件，以上为预置演示数据。</InfoRow></section>
      {(agent?.config === '外部变化' || asset?.status.includes('外部')) && <div className="mt-5 rounded-md border border-warning/30 bg-warning/8 p-4 text-sm text-warning">演示数据标记为外部变化，尚未重新载入。</div>}
      <Button className="mt-4" variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: agent?.id, assetId: asset?.id, path: asset?.path ?? (agent ? `${agent.packagePath}instructions.md` : undefined) } })}><FileDiff size={16} />查看 Diff</Button>
    </AppDialog>
  }

  if (dialog.kind === 'diff') {
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="检测到外部修改" description={path} size="xl" footer={<><Button variant="outline" onClick={() => done(`演示复制当前编辑：${path} · 未访问剪贴板`)}>演示复制我的编辑</Button><Button onClick={() => done(`已在内存中基于外部演示版本继续编辑：${path} · 未覆盖文件`)}>基于外部版本继续</Button></>}>
      <div className="grid gap-3 md:grid-cols-3">{[['基线', '- 交付后汇报'], ['外部版本', '+ 交付后附验证证据'], ['你的编辑', '+ 交付后汇报并记录风险']].map(([title, content]) => <div className="min-w-0 rounded-lg border border-border" key={title}><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{title}</div><pre className="overflow-x-auto p-3 text-xs leading-6">{content}</pre></div>)}</div><p className="mt-5 text-sm text-muted-foreground">三方内容为预置演示数据；不会读取、覆盖或写入任何文件。</p><Button className="mt-3" variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'conflict', agentId: agent?.id, assetId: asset?.id } })}>演示真实冲突</Button>
    </AppDialog>
  }

  if (dialog.kind === 'conflict') {
    const allResolved = Boolean(conflicts.a && conflicts.b)
    const choices = (key: string) => <div className="mt-3 flex flex-wrap gap-2">{['外部版本', '我的版本', '手动合并'].map((choice) => <Button key={choice} variant={conflicts[key] === choice ? 'default' : 'outline'} size="sm" onClick={() => setConflicts((value) => ({ ...value, [key]: choice }))}>{choice}</Button>)}</div>
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="解决配置文件冲突" description="同一文本区域被同时修改，无法安全自动合并。" size="lg" footer={<><Button variant="outline" onClick={close}>取消保存</Button><Button disabled={!allResolved} onClick={() => done('2 处演示冲突已逐项解决 · 合并结果仅保存在当前页面内存')}>{allResolved ? '完成演示合并' : `请先解决 ${2 - Object.keys(conflicts).length} 处冲突`}</Button></>}>
      {[['a', '生产发布必须由董事长批准', '生产发布由部门主管批准'], ['b', '验证证据必须附在汇报中', '验证证据按需提供']].map(([key, external, mine], index) => <div key={key} className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-4"><div className="mb-3 flex items-center gap-2 text-danger"><AlertTriangle size={18} /><b>冲突 {index + 1}</b></div><pre className="overflow-x-auto text-xs leading-6">{`<<<< 外部版本\n${external}\n====\n${mine}\n>>>> 你的编辑`}</pre>{choices(key)}</div>)}
    </AppDialog>
  }

  if (dialog.kind === 'shared') {
    if (!asset) return <MissingDialog title="共享资产不存在" close={close} />
    const confirmShared = () => {
      if (impact === 'local') { done(`已返回局部定制路径 · 未修改共享资产 ${asset.name}`); return }
      if (dialog.changes) dispatch({ type: 'UPDATE_ASSET', assetId: asset.id, changes: dialog.changes, message: dialog.message ?? `已模拟保存共享资产 ${asset.name}；${asset.references.length} 个显式引用关系未变 · 未写入文件` })
      else dispatch({ type: 'TOAST', text: `已确认共享资产 ${asset.name} 的影响范围；未提交内容变更 · 未写入文件` })
      close()
    }
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="共享配置影响" description={`你正在修改 ${asset.path}`} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button onClick={confirmShared}>{impact === 'shared' ? '确认影响并保存' : '返回局部定制'}</Button></>}>
      <div className="rounded-lg bg-warning/8 p-4 text-warning"><b>影响范围：{asset.references.length} 个已登记显式引用</b></div><div className="mt-5 divide-y divide-border rounded-lg border border-border">{asset.references.map((item) => <div className="flex justify-between gap-4 p-3" key={`${item.type}-${item.id}`}><span>{item.label}</span><span className="shrink-0 text-muted-foreground">{item.type} · 显式引用</span></div>)}</div>
      <label className="mt-5 flex gap-3"><input type="radio" name="impact" checked={impact === 'local'} onChange={() => setImpact('local')} /><span>返回并为当前对象创建局部定制</span></label><label className="mt-3 flex gap-3"><input type="radio" name="impact" checked={impact === 'shared'} onChange={() => setImpact('shared')} /><span>修改共享本体并影响以上范围</span></label>
    </AppDialog>
  }

  if (dialog.kind === 'permission') {
    if (!agent) return <MissingDialog title="Agent 不存在" close={close} />
    const nextFiles = dialog.nextFiles ?? '任意目录'
    const confirm = () => { dispatch({ type: 'SAVE_AGENT_CONFIG', input: { agentId: agent.id, kind: 'permissions', value: { ...agent.permissions, files: nextFiles } }, summary: '确认扩大长期权限' }); close() }
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="确认扩大长期 Agent 权限" description={`Agent：${agent.name}`} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" disabled={confirmName !== agent.name || !understood} onClick={confirm}>确认扩大权限并保存</Button></>}>
      <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger"><ShieldAlert className="shrink-0" /><div><b>可能修改工作区外的项目或系统文件</b><p className="mt-1 text-sm">影响已绑定工作区：{agent.workspaceBindings.map((item) => state.workspaces.find((ws) => ws.id === item.workspaceId)?.name).filter(Boolean).join('、') || '无'}</p></div></div><div className="mt-5 panel p-4"><InfoRow label="变更前">{agent.permissions.files}</InfoRow><InfoRow label="变更后"><b className="text-danger">{nextFiles}</b></InfoRow><InfoRow label="全局边界">仍受不可突破的安全规则约束</InfoRow></div><label className="mt-5 block text-sm font-medium">请输入 Agent 名称“{agent.name}”确认<input className="mt-2 h-10 w-full px-3" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是权限扩大，不是普通配置更新</span></label>
    </AppDialog>
  }

  if (dialog.kind === 'memory') {
    const candidate = state.memoryCandidates.find((item) => item.id === dialog.candidateId)
    if (!candidate) return <MissingDialog title="MemoryCandidate 不存在" close={close} />
    const space = state.memorySpaces.find((item) => item.id === candidate.spaceId)
    const proposer = state.agents.find((item) => item.id === candidate.proposerAgentId)
    const reviewer = state.agents.find((item) => item.id === candidate.reviewerAgentId)
    const review = (status: '要求修改' | '已驳回' | '已写入演示 Revision') => dispatch({ type: 'REVIEW_MEMORY_CANDIDATE', candidateId: candidate.id, status })
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`审核正式记忆候选 ${candidate.id}`} description="仅处理拟写入正式 MemorySpace 的候选" size="xl" footer={<><Button variant="outline" onClick={() => review('要求修改')}>要求修改</Button><Button variant="outline" onClick={() => review('已驳回')}>驳回</Button><Button disabled={candidate.proposerAgentId === candidate.reviewerAgentId} onClick={() => review('已写入演示 Revision')}>批准并写入演示 Revision</Button></>}>
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]"><div className="panel p-4"><InfoRow label="目标空间">{space?.scopeType ?? candidate.spaceId}</InfoRow><InfoRow label="所有者">{space?.owner ?? '—'}</InfoRow><InfoRow label="归口">{space?.steward ?? '—'}</InfoRow><InfoRow label="审核">{reviewer?.name ?? candidate.reviewerAgentId}</InfoRow><InfoRow label="提议者">{proposer?.name ?? candidate.proposerAgentId}</InfoRow><InfoRow label="状态"><StatusBadge tone={toneForStatus(candidate.status)}>{candidate.status}</StatusBadge></InfoRow></div><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border max-sm:grid-cols-1"><div><div className="bg-muted px-4 py-2 text-xs font-semibold">当前 {space?.revision}</div><p className="p-4 text-sm text-muted-foreground">{candidate.current}</p></div><div className="border-l border-border max-sm:border-l-0 max-sm:border-t"><div className="bg-primary/8 px-4 py-2 text-xs font-semibold">建议写回</div><p className="p-4 text-sm">{candidate.proposed}</p></div></div></div>{candidate.proposerAgentId !== candidate.reviewerAgentId ? <div className="mt-5 flex items-center gap-2 text-sm text-success"><Check size={17} />提议者与审核者已分离。</div> : <div className="mt-5 text-sm text-danger">提议者不能自审，请先调整审核者。</div>}
    </AppDialog>
  }

  if (dialog.kind === 'workspace-responsibility') {
    const target = state.workspaces.find((item) => item.id === dialog.workspaceId)
    if (!target) return <MissingDialog title="工作区不存在" close={close} />
    return <WorkspaceResponsibilityDialog workspace={target} close={close} />
  }

  if (dialog.kind === 'remove-workspace-index') {
    const target = state.workspaces.find((item) => item.id === dialog.workspaceId)
    if (!target) return <MissingDialog title="工作区不存在" close={close} />
    const isLast = state.workspaces.length === 1
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="从演示索引移除工作区" description={`${target.name} · ${target.path}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" onClick={() => dispatch({ type: 'REMOVE_WORKSPACE_INDEX', workspaceId: target.id })}>确认从演示索引移除</Button></>}>
      <div className="rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>只移除当前页面中的演示索引</b><p className="mt-2 leading-6 text-muted-foreground">不会删除真实目录或文件，也不会删除 Agent WorkspaceBinding、MemorySpace、资产引用和历史。</p></div>
      <div className="mt-4 panel p-4"><InfoRow label="关联对象">{target.agentIds.length} Agents · {target.assetIds.length} 资产 · {target.departmentMemorySpaceIds.length + 1} MemorySpace</InfoRow><InfoRow label="移除后">{isLast ? '将进入零工作区空态，可随时重新添加。' : '将自动选择剩余的第一个工作区。'}</InfoRow></div>
    </AppDialog>
  }

  if (dialog.kind === 'backup-restore') {
    const snapshot = state.backupSnapshots.find((item) => item.id === dialog.snapshotId)
    if (!snapshot) return <MissingDialog title="快照不存在" close={close} />
    const effectiveScope: BackupScope = restoreScope.kind === 'files' ? { kind: 'files', paths: restoreFiles } : restoreScope
    const preview = buildBackupPreview(state, effectiveScope)
    const availableFiles = [...new Set(state.agents.flatMap((item) => item.files.map((file) => `${item.id}/${file.path}`)))]
    const restore = () => { if (!preview) return; dispatch({ type: 'SIMULATE_RESTORE', snapshotId: snapshot.id, beforeSnapshot: createDemoSnapshot(preview, { id: `before-${state.backupSnapshots.length + 1}`, createdAt: '刚刚', kind: '恢复前演示' }) }) }
    const chooseKind = (kind: BackupScope['kind']) => { if (kind === 'company') setRestoreScope({ kind, companyId: state.companies[0]?.id ?? '' }); else if (kind === 'agent') setRestoreScope({ kind, agentId: state.agents[0]?.id ?? '' }); else if (kind === 'files') setRestoreScope({ kind, paths: [] }); else setRestoreScope({ kind: 'all' }); setRestoreFiles([]) }
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="模拟范围恢复" description={`第 ${restoreStep} 步，共 3 步 · ${snapshot.id}`} size="lg" footer={<>{restoreStep > 1 && <Button variant="outline" onClick={() => setRestoreStep((step) => Math.max(1, step - 1) as 1 | 2 | 3)}>上一步</Button>}<Button variant="outline" onClick={close}>取消</Button>{restoreStep < 3 ? <Button disabled={restoreStep === 2 && !preview} onClick={() => setRestoreStep((step) => Math.min(3, step + 1) as 1 | 2 | 3)}>下一步</Button> : <Button variant="danger" disabled={!understood || !preview} onClick={restore}>确认模拟恢复</Button>}</>}>
      {restoreStep === 1 && <><InfoRow label="快照时间">{snapshot.createdAt}</InfoRow><InfoRow label="快照范围">{describeBackupScope(snapshot.scope, state)}</InfoRow><label className="mt-5 block text-sm font-medium">恢复层级<select className="mt-2 h-10 w-full px-3" value={restoreScope.kind} onChange={(event) => chooseKind(event.target.value as BackupScope['kind'])}><option value="all">全部配置</option><option value="company">公司</option><option value="agent">Agent</option><option value="files">指定文件</option></select></label></>}
      {restoreStep === 2 && <>{restoreScope.kind === 'company' && <label className="block text-sm font-medium">公司<select className="mt-2 h-10 w-full px-3" value={restoreScope.companyId} onChange={(event) => setRestoreScope({ kind: 'company', companyId: event.target.value })}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{restoreScope.kind === 'agent' && <label className="block text-sm font-medium">Agent<select className="mt-2 h-10 w-full px-3" value={restoreScope.agentId} onChange={(event) => setRestoreScope({ kind: 'agent', agentId: event.target.value })}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{restoreScope.kind === 'files' && <fieldset><legend className="text-sm font-medium">指定恢复文件</legend><div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg border border-border p-3">{availableFiles.map((path) => <label key={path} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreFiles.includes(path)} onChange={(event) => setRestoreFiles((items) => event.target.checked ? [...items, path] : items.filter((item) => item !== path))} />{path}</label>)}</div>{!restoreFiles.length && <p className="mt-2 text-xs text-danger">请选择至少一个文件。</p>}</fieldset>}{restoreScope.kind === 'all' && <p className="text-sm text-muted-foreground">该层级无需选择具体对象，将恢复全部演示配置范围。</p>}</>}
      {restoreStep === 3 && preview && <><InfoRow label="将恢复">{preview.label}</InfoRow><InfoRow label="包含">{preview.includes.join('、')}</InfoRow><InfoRow label="不受影响">范围外配置、Agent 引用关系和当前业务集合</InfoRow><InfoRow label="Memory 策略">本地正式 Memory 可包含；远端仍遵循单独确认</InfoRow><InfoRow label="永不包含">{preview.excludes.join('、')}</InfoRow><InfoRow label="恢复前保护">先新增“恢复前演示”快照记录</InfoRow><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是演示流程，不会读取或恢复真实文件，也不会修改 Agent、资产、公司或工作区。</span></label></>}
    </AppDialog>
  }

  if (dialog.kind === 'organization') return <OrganizationDialog dialog={dialog} close={close} />
  return null
}

function ClientGuideDialog({ client, workspace, agent, planning = false, close }: { client: ReturnType<typeof useApp>['state']['aiClients'][number]; workspace?: ReturnType<typeof useApp>['state']['workspaces'][number]; agent?: ReturnType<typeof useApp>['state']['agents'][number]; planning?: boolean; close: () => void }) {
  const { state, dispatch } = useApp()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [fallbackCommand, setFallbackCommand] = useState('')
  const [copied, setCopied] = useState('')
  const [goal, setGoal] = useState('')
  const [participants, setParticipants] = useState('')
  const [boundaries, setBoundaries] = useState('')
  const isClaudeCode = supportsWorkspaceHandoff(client)
  const desktop = isDesktopRuntime()
  const terminal = terminalLabel(state.settings.terminal)
  const environment = state.configurationEnvironments.find((item) => item.id === state.currentConfigurationEnvironmentId)
  const profile = environment?.clientLaunchProfiles?.[client.id] ?? defaultClaudeCodeLaunchProfile
  const highRisk = isHighRiskLaunchProfile(profile)
  const launchCommand = workspace ? buildLaunchCommand(workspace.path, profile.executable, profile.args, profile.enterBandiOnStart) : ''
  const planningPrompt = buildCollaborationPlanningPrompt(goal, participants, boundaries)
  const binding = agent && workspace ? agent.workspaceBindings.find((item) => item.workspaceId === workspace.id) : undefined
  const notify = (tone: 'success' | 'error', title: string, description: string) => dispatch({ type: 'SHOW_NOTICE', notice: { tone, title, description, duration: 5000 } })
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
    } catch {
      notify('error', `${label}复制失败`, '系统未允许访问剪贴板，请手动选择并复制。')
    }
  }
  const launch = async () => {
    if (!workspace || !desktop || opening) return
    setOpening(true)
    setError('')
    setFallbackCommand('')
    try {
      const result = await requestLaunchWorkspace({ requestId: crypto.randomUUID(), workspaceId: workspace.id, cwd: workspace.path, terminalId: normalizeTerminalId(state.settings.terminal), executable: profile.executable, args: profile.args, enterBandiOnStart: profile.enterBandiOnStart })
      if (result.kind === 'rejected') {
        setError(result.message)
        return
      }
      if (result.kind === 'fallback-required') {
        setFallbackCommand(buildLaunchCommand(workspace.path, result.executable, result.args, false))
        setError(result.message)
        return
      }
      close()
      notify('success', 'macOS 已接受启动请求', `已请求在 ${terminal} 中启动 Claude Code；不表示 Claude Code 或 Bandi 已成功加载。`)
    } catch {
      setError('无法请求系统启动终端，请确认正在使用 Bandi Desktop。')
    } finally {
      setOpening(false)
    }
  }
  const title = isClaudeCode ? planning ? '让 AI 帮我规划协作方式' : '在 Claude Code 中继续' : `${client.name} 配置入口`
  const description = isClaudeCode
    ? workspace ? planning ? `描述你的长期协作场景，再将规划说明复制到 ${client.name} 继续澄清。` : `在「${terminal}」中打开 ${workspace.name}，并按当前配置进入 Bandi。` : '请先选择一个工作区。'
    : '查看工具配置与参考工作区；当前没有经过验证的启动适配。'
  const copyButton = (text: string, label: string, accessibleName: string, disabled = !workspace) => <Tooltip content={copied === label ? '已复制' : accessibleName}><Button variant="outline" size="icon" disabled={disabled} onClick={() => copy(text, label)} aria-label={accessibleName}>{copied === label ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}</Button></Tooltip>
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} description={description} size="md" footer={isClaudeCode ? desktop ? <><Button variant="outline" onClick={close}>取消</Button><Button disabled={!workspace || opening} onClick={launch}>{opening ? '正在请求启动…' : `在 ${terminal} 中进入 Bandi`}</Button></> : <Button onClick={close}>关闭</Button> : undefined}>
    {isClaudeCode ? <>
      <section className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="text-sm font-semibold">{workspace?.name ?? '请先添加工作区'}</div>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3"><MonoPath>{workspace?.path ?? '—'}</MonoPath>{workspace && copyButton(workspace.path, '路径', '复制工作目录')}</div>
        {agent && <div className="mt-4 border-t border-border pt-4 text-sm"><b>{agent.name}</b><small className="mt-1 block text-muted-foreground">{binding ? '已显式关联当前工作区' : '尚未关联当前工作区'}；不表示 CLI 已自动加载。</small><MonoPath>{agent.packagePath}</MonoPath></div>}
      </section>
      {planning && <section className="mt-5 space-y-4" aria-labelledby="collaboration-planning"><div><h3 id="collaboration-planning" className="text-sm font-semibold">描述长期协作场景</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">内容只存在于当前弹窗，关闭即丢弃。不要填写 Token、密码、Cookie、私钥或客户秘密原文。</p></div><label className="block text-sm font-medium">你的场景与目标<textarea autoFocus className="mt-2 min-h-20 w-full p-3 text-sm" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：长期由内容、研发和运营协作交付产品更新" /></label><label className="block text-sm font-medium">当前参与者与资源（可选）<textarea className="mt-2 min-h-16 w-full p-3 text-sm" value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="已有真人、Agent、工具或配置" /></label><label className="block text-sm font-medium">高频协作与重要边界（可选）<textarea className="mt-2 min-h-16 w-full p-3 text-sm" value={boundaries} onChange={(event) => setBoundaries(event.target.value)} placeholder="重复协作、职责边界、禁止事项和验收要求" /></label><div><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">一次性协作规划说明</h4>{copyButton(planningPrompt, '规划说明', '复制协作规划说明', !workspace || !goal.trim())}</div><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-3 text-xs leading-6">{goal.trim() ? planningPrompt : '填写“你的场景与目标”后生成。'}</pre><p className="mt-2 text-xs text-muted-foreground">复制后打开 Claude Code 并粘贴发送；规划说明不会改变 Claude Code 的权限模式。</p></div></section>}
      <section className="mt-5" aria-labelledby="handoff-command"><h3 id="handoff-command" className="text-sm font-semibold">启动命令</h3><div className="mt-2 flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3"><code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm">{fallbackCommand || launchCommand || '—'}</code>{workspace && copyButton(fallbackCommand || launchCommand, '启动命令', '复制完整启动命令')}</div></section>
      {highRisk && <div className="mt-4 flex gap-2 rounded-md border border-warning/30 bg-warning/8 p-3 text-sm text-warning"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" /><span>当前启动设置可能跳过 Claude Code 权限确认，或使用自定义可执行程序。{planning ? '规划说明不会修改或覆盖权限模式；如需严格只读，请在 Claude Code 中确认进入 Plan mode，或先修正启动设置。' : '请仅在可信环境中启动。'}</span></div>}
      <div className="mt-4 flex gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"><Info size={18} className="shrink-0" aria-hidden="true" /><span>Bandi 只提交一次结构化启动请求，不执行 Shell，不读取终端内容，也不跟踪后续会话。</span></div>
      {!desktop && <p className="mt-3 text-sm text-muted-foreground">浏览器无法直接启动本机终端，请复制完整命令后在终端粘贴运行。</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error} 请复制上面的完整命令，在已打开的终端中运行。</p>}
    </> : <div className="rounded-lg border border-border bg-muted/30 px-4"><InfoRow label="工作区">{workspace?.name ?? '未选择'}</InfoRow><InfoRow label="工作目录"><MonoPath>{workspace?.path ?? '—'}</MonoPath></InfoRow><InfoRow label="工具配置"><span className="flex items-center gap-2"><AiClientIcon client={client} size={16} />{client.name}</span></InfoRow><InfoRow label="方案关系">已加入当前配置方案</InfoRow><InfoRow label="启动适配">仅配置；尚未定义经过验证的启动命令或 cwd 注入方式</InfoRow></div>}
  </AppDialog>
}

function WorkspaceResponsibilityDialog({ workspace, close }: { workspace: ReturnType<typeof useApp>['state']['workspaces'][number]; close: () => void }) {
  const { state, dispatch } = useApp(); const [companyId, setCompanyId] = useState(workspace.companyId ?? ''); const [primary, setPrimary] = useState(workspace.primaryDepartmentId ?? ''); const [lead, setLead] = useState(workspace.projectLeadAgentId ?? ''); const [collaborators, setCollaborators] = useState(workspace.collaboratorDepartmentIds); const [understood, setUnderstood] = useState(false); const companyDepartments = state.departments.filter((item) => item.companyId === companyId); const highImpact = companyId !== (workspace.companyId ?? '')
  useEffect(() => { if (!state.departments.some((item) => item.companyId === companyId && item.id === primary)) { setPrimary(''); setLead(''); setCollaborators([]) } }, [companyId, primary, state.departments])
  const save = () => { dispatch({ type: 'UPDATE_WORKSPACE', workspaceId: workspace.id, changes: { companyId: companyId || undefined, company: state.companies.find((item) => item.id === companyId)?.name, primaryDepartmentId: primary || undefined, department: state.departments.find((item) => item.id === primary)?.name, projectLeadAgentId: lead || undefined, collaboratorDepartmentIds: collaborators } }); close() }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="项目责任与组织关系" description={workspace.name} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={Boolean(companyId && !primary) || (highImpact && !understood)} onClick={save}>保存演示关系</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">所属公司<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">暂不关联</option>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">唯一主责部门<select className="mt-2 h-10 w-full px-3" value={primary} onChange={(e) => { setPrimary(e.target.value); setLead(state.departments.find((item) => item.id === e.target.value)?.managerAgentId ?? '') }}><option value="">请选择</option>{companyDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">默认负责人<select className="mt-2 h-10 w-full px-3" value={lead} onChange={(e) => setLead(e.target.value)}><option value="">未设置</option>{state.agents.filter((item) => item.companyId === companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset><legend className="text-sm font-medium">协作部门</legend><div className="mt-2 space-y-2 rounded-lg border border-border p-3">{companyDepartments.filter((item) => item.id !== primary).map((item) => <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={collaborators.includes(item.id)} onChange={(e) => setCollaborators((values) => e.target.checked ? [...values, item.id] : values.filter((id) => id !== item.id))} />{item.name}</label>)}</div></fieldset></div>
    {highImpact && <div className="mt-5 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>更换所属公司是高影响变更</b><p className="mt-2 text-muted-foreground">需重新核对共享引用、服务授权和 Memory 可见性；不会删除目录、历史、AgentPackage 或 WorkspaceBinding。</p><label className="mt-3 flex gap-2"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />我已了解影响并完成演示核对</label></div>}
  </AppDialog>
}

function OrganizationDialog({ dialog, close }: { dialog: Extract<NonNullable<ReturnType<typeof useApp>['state']['dialog']>, { kind: 'organization' }>; close: () => void }) {
  const { state, dispatch } = useApp(); const currentCompany = dialog.entity === 'company' ? state.companies.find((item) => item.id === dialog.id) : undefined; const currentDepartment = dialog.entity === 'department' ? state.departments.find((item) => item.id === dialog.id) : undefined
  const [name, setName] = useState(currentCompany?.name ?? currentDepartment?.name ?? ''); const [companyId, setCompanyId] = useState(currentDepartment?.companyId ?? state.companies[0]?.id ?? ''); const [parentId, setParentId] = useState(currentDepartment?.parentDepartmentId ?? ''); const [mission, setMission] = useState(currentCompany?.mission ?? currentDepartment?.mission ?? ''); const duplicate = dialog.entity === 'company' ? state.companies.some((item) => item.id !== dialog.id && item.name === name.trim()) : state.departments.some((item) => item.id !== dialog.id && item.companyId === companyId && item.name === name.trim())
  const descendantIds = useMemo(() => { const result = new Set<string>(); if (!currentDepartment) return result; const visit = (id: string) => state.departments.filter((item) => item.parentDepartmentId === id).forEach((item) => { result.add(item.id); visit(item.id) }); visit(currentDepartment.id); return result }, [currentDepartment, state.departments]); const invalidParent = Boolean(parentId && (parentId === currentDepartment?.id || descendantIds.has(parentId)))
  const save = () => { const id = dialog.id ?? `${dialog.entity}-${Date.now()}`; if (dialog.entity === 'company') { const company = { id, name: name.trim(), mission: mission.trim(), boundary: '组织身份不自动授予权限。', departmentIds: [], workspaceIds: [], sharedAssetIds: [] }; dispatch(dialog.mode === 'create' ? { type: 'CREATE_COMPANY', company } : { type: 'UPDATE_COMPANY', companyId: id, changes: { name: company.name, mission: company.mission } }) } else { const department = { id, name: name.trim(), companyId, parentDepartmentId: parentId || undefined, parent: state.departments.find((item) => item.id === parentId)?.name, mission: mission.trim(), members: 0, responsibilities: [], boundaries: ['不隐式授予权限'], delegationDepth: 1, memberAgentIds: [], ownedSopIds: [] }; dispatch(dialog.mode === 'create' ? { type: 'CREATE_DEPARTMENT', department } : { type: 'UPDATE_DEPARTMENT', departmentId: id, changes: department }) } close() }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`${dialog.mode === 'create' ? '创建' : '编辑'}${dialog.entity === 'company' ? '公司' : '部门'}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={!name.trim() || duplicate || invalidParent || (dialog.entity === 'department' && !companyId)} onClick={save}>保存演示配置</Button></>}><label className="block text-sm font-medium">名称<input className="mt-2 h-10 w-full px-3" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={duplicate} />{duplicate && <span className="mt-1 block text-xs text-danger">同一范围内名称重复。</span>}</label>{dialog.entity === 'department' && <>{dialog.mode === 'create' ? <label className="mt-4 block text-sm font-medium">所属公司<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setParentId('') }}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div className="mt-4"><div className="text-sm font-medium">所属公司</div><div className="mt-2 rounded-lg border border-border bg-muted/35 px-3 py-2.5 text-sm">{state.companies.find((item) => item.id === companyId)?.name ?? '未找到所属公司'}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">部门归属公司不能在普通编辑中更改；跨公司调整需使用独立的移动部门操作。</p></div>}<label className="mt-4 block text-sm font-medium">上级部门<select className="mt-2 h-10 w-full px-3" value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">顶级部门</option>{state.departments.filter((item) => item.companyId === companyId && item.id !== currentDepartment?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidParent && <span className="mt-1 block text-xs text-danger">不能移动到自身或后代部门，组织关系必须无环。</span>}</label></>}<label className="mt-4 block text-sm font-medium">使命<textarea className="mt-2 min-h-24 w-full p-3" value={mission} onChange={(e) => setMission(e.target.value)} /></label><p className="mt-4 text-xs text-muted-foreground">组织变更只更新当前页面内存，不移动 AgentPackage、不授予权限。</p></AppDialog>
}

function MissingDialog({ title, close }: { title: string; close: () => void }) { return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} size="sm" footer={<Button onClick={close}>关闭</Button>}><p className="text-sm text-muted-foreground">Dialog payload 指向的对象不存在，没有使用其他对象替代。</p></AppDialog> }
