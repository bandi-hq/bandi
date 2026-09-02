import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Copy, FileDiff, Info, ShieldAlert } from 'lucide-react'
import { AiClientIcon, supportsWorkspaceHandoff } from './components/ai-clients'
import { Button } from './components/ui/button'
import { AppDialog } from './components/ui/dialog'
import { Tooltip } from './components/ui/tooltip'
import { MonoPath, StatusBadge, toneForStatus } from './components/app/page'
import { useApp } from './state'
import { buildBackupPreview, createDemoSnapshot, describeBackupScope } from './backup-policy'
import { handoffDescriptor } from './client-adapters'
import type { BackupScope } from './domain'
import type { CapabilityFactDto } from './desktop-bridge'
import { generateEntityId, isDesktopRuntime, loadMemoryReview, recoverMemoryRevision, removeWorkspace, requestClientHandoff, reviewMemoryCandidate, saveCompany, saveDepartment, saveWorkspace } from './desktop-bridge'
import type { MemoryReviewBundleDto, ReviewMemoryCandidateResult } from './contracts'
import { normalizeTerminalId, terminalLabel } from './terminal-model'

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
    '如确有需要，请按最小治理顺序建议方案：先建立公司、部门与岗位，再创建或登记董事长助理及其他 Agent，随后补充董事长助理、部门主管等治理关系，最后配置工作区关联、SOP、长期权限与服务授权。一次性工作不要直接转成长期开岗或 Agent；组织身份、岗位和关系不自动授予权限。',
    '在我明确确认前，只输出分析、选项和建议，不要创建、修改、保存或删除公司、部门、岗位、Agent、工作区关联、权限、SOP、记忆或任何配置文件。',
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
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`配置历史 · ${dialog.path.split('/').at(-1)}`} description="历史版本不可变；恢复会生成一个新版本。" size="xl" footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={!canRestore} onClick={() => selected && dispatch({ type: 'RESTORE_CONFIG_REVISION', revisionId: selected.id })}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="配置版本">{revisions.map((revision, index) => <button key={revision.id} type="button" onClick={() => { setSelectedRevisionId(revision.id); setRestoreConfirmed(false) }} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><span className="flex items-center justify-between gap-2"><b className="text-sm">{revision.id}</b>{index === 0 && <StatusBadge tone="success">当前</StatusBadge>}</span><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small><small className="mt-1 block text-muted-foreground">{revision.evidence === 'memory-only' ? '仅在当前页面有效' : '初始演示版本'}{revision.parentRevisionId ? ` · 基于版本 ${revision.parentRevisionId}` : ''}</small>{revision.restoredFromRevisionId && <small className="mt-1 block text-muted-foreground">恢复自 {revision.restoredFromRevisionId}</small>}</button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">当前版本</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{current?.content}</pre></div><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selected?.id === current?.id ? '选择一个历史版本比较' : selected?.id}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{selected?.content}</pre></div></div><div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">恢复只会基于上方当前内容与目标内容生成新的配置版本；不会覆盖历史，也不会读取或写入文件。</div>{selected && selected.id !== current?.id && <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreConfirmed} onChange={(event) => setRestoreConfirmed(event.target.checked)} /><span>我已核对当前版本与目标版本的内容差异，确认恢复为新版本。</span></label>}</div></div> : <p className="text-sm text-muted-foreground">当前文件暂无演示配置版本。正式记忆使用独立的记忆版本。</p>}
    </AppDialog>
  }

  if (dialog.kind === 'source') {
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="来源与有效配置" description={`${agent?.name ?? asset?.name ?? '配置对象'} / ${dialog.section ?? asset?.kind ?? '配置'}`} size="md" footer={<Button onClick={close}>关闭</Button>}>
      <section><div className="label">有效值摘要</div><p className="mt-2 text-sm leading-6">当前有效值来自自身配置与显式引用；组织身份不形成隐式继承或权限授予。</p></section>
      <section className="panel mt-5 p-4"><InfoRow label="自身配置"><MonoPath>{asset?.path ?? agent?.packagePath ?? '—'}</MonoPath></InfoRow><InfoRow label="显式引用">{agent ? `${agent.ruleRefs.length} 项规则 · ${agent.skillRefs.length} 项技能 · ${agent.mcpRefs.length} 项 MCP` : `${asset?.references.length ?? 0} 个引用`}</InfoRow><InfoRow label="安全边界">外部变化、共享影响和权限扩大必须确认，Agent 不可放宽。</InfoRow><InfoRow label="系统事实">{isDesktopRuntime() ? 'Bandi Desktop 根据已加载的本机配置显示以上信息。' : '浏览器演示不读取本机文件，以上为预置数据。'}</InfoRow></section>
      {(agent?.config === '外部变化' || asset?.status.includes('外部')) && <div className="mt-5 rounded-md border border-warning/30 bg-warning/8 p-4 text-sm text-warning">演示数据标记为外部变化，尚未重新载入。</div>}
      <Button className="mt-4" variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'diff', agentId: agent?.id, assetId: asset?.id, path: asset?.path ?? (agent ? `${agent.packagePath}instructions.md` : undefined) } })}><FileDiff size={16} />查看差异</Button>
    </AppDialog>
  }

  if (dialog.kind === 'diff') {
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="检测到外部修改" description={path} size="xl" footer={<><Button variant="outline" onClick={() => done(`当前弹窗已显示待复制的编辑内容：${path} · 未访问剪贴板`)}>查看待复制内容</Button><Button onClick={() => done(`已在当前页面基于外部演示版本继续编辑：${path} · 未覆盖文件`)}>基于外部版本继续</Button></>}>
      <div className="grid gap-3 md:grid-cols-3">{[['编辑起点', '- 交付后汇报'], ['外部版本', '+ 交付后附验证证据'], ['你的编辑', '+ 交付后汇报并记录风险']].map(([title, content]) => <div className="min-w-0 rounded-lg border border-border" key={title}><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{title}</div><pre className="overflow-x-auto p-3 text-xs leading-6">{content}</pre></div>)}</div><p className="mt-5 text-sm text-muted-foreground">三方内容为预置演示数据；不会读取、覆盖或写入任何文件。</p><Button className="mt-3" variant="outline" onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: { kind: 'conflict', agentId: agent?.id, assetId: asset?.id } })}>查看冲突演示</Button>
    </AppDialog>
  }

  if (dialog.kind === 'conflict') {
    const allResolved = Boolean(conflicts.a && conflicts.b)
    const choices = (key: string) => <div className="mt-3 flex flex-wrap gap-2">{['外部版本', '我的版本', '手动合并'].map((choice) => <Button key={choice} variant={conflicts[key] === choice ? 'default' : 'outline'} size="sm" onClick={() => setConflicts((value) => ({ ...value, [key]: choice }))}>{choice}</Button>)}</div>
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="解决配置文件冲突" description="同一文本区域被同时修改，无法安全自动合并。" size="lg" footer={<><Button variant="outline" onClick={close}>取消保存</Button><Button disabled={!allResolved} onClick={() => done('2 处示例冲突已逐项处理 · 结果仅在当前页面有效')}>{allResolved ? '完成演示' : `请先解决 ${2 - Object.keys(conflicts).length} 处冲突`}</Button></>}>
      {[['a', '生产发布必须由董事长批准', '生产发布由部门主管批准'], ['b', '验证证据必须附在汇报中', '验证证据按需提供']].map(([key, external, mine], index) => <div key={key} className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-4"><div className="mb-3 flex items-center gap-2 text-danger"><AlertTriangle size={18} /><b>冲突 {index + 1}</b></div><pre className="overflow-x-auto text-xs leading-6">{`<<<< 外部版本\n${external}\n====\n${mine}\n>>>> 你的编辑`}</pre>{choices(key)}</div>)}
    </AppDialog>
  }

  if (dialog.kind === 'shared') {
    if (!asset) return <MissingDialog title="共享资产不存在" close={close} />
    const confirmShared = () => {
      if (impact === 'local') { done(`已返回局部定制路径 · 未修改共享资产 ${asset.name}`); return }
      if (dialog.changes) dispatch({ type: 'UPDATE_ASSET', assetId: asset.id, changes: dialog.changes, message: dialog.message ?? `共享资产 ${asset.name} 已保存到当前页面；${asset.references.length} 个显式引用关系未变 · 未写入文件` })
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
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="确认扩大 Agent 长期权限" description={`Agent：${agent.name}`} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" disabled={confirmName !== agent.name || !understood} onClick={confirm}>确认扩大权限并保存</Button></>}>
      <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger"><ShieldAlert className="shrink-0" /><div><b>可能修改工作区外的项目或系统文件</b><p className="mt-1 text-sm">影响已绑定工作区：{agent.workspaceBindings.map((item) => state.workspaces.find((ws) => ws.id === item.workspaceId)?.name).filter(Boolean).join('、') || '无'}</p></div></div><div className="mt-5 panel p-4"><InfoRow label="变更前">{agent.permissions.files}</InfoRow><InfoRow label="变更后"><b className="text-danger">{nextFiles}</b></InfoRow><InfoRow label="全局边界">仍受不可突破的安全规则约束</InfoRow></div><label className="mt-5 block text-sm font-medium">请输入 Agent 名称“{agent.name}”确认<input className="mt-2 h-10 w-full px-3" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是权限扩大，不是普通配置更新</span></label>
    </AppDialog>
  }

  if (dialog.kind === 'memory') {
    const candidate = state.memoryCandidates.find((item) => item.id === dialog.candidateId)
    if (!candidate) return <MissingDialog title="记忆修改建议不存在" close={close} />
    return <MemoryReviewDialog candidate={candidate} close={close} />
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
    const desktop = isDesktopRuntime()
    const remove = async () => { if (desktop) { try { await removeWorkspace(target.id) } catch (cause) { dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'error', title: '无法移除工作区索引', description: cause instanceof Error ? cause.message : String(cause) } }); return } } dispatch({ type: 'REMOVE_WORKSPACE_INDEX', workspaceId: target.id }) }
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={desktop ? '从本机索引移除工作区' : '从演示索引移除工作区'} description={`${target.name} · ${target.path}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" onClick={remove}>确认从索引移除</Button></>}>
      <div className="rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>{desktop ? '只移除 Bandi 的本机工作区索引' : '只移除当前页面中的演示索引'}</b><p className="mt-2 leading-6 text-muted-foreground">不会删除真实目录或文件，也不会删除 Agent 工作区专属配置、记忆范围、资产引用和历史；存在服务授权引用时本地服务会拒绝移除。</p></div>
      <div className="mt-4 panel p-4"><InfoRow label="关联对象">{target.agentIds.length} 个 Agent · {target.assetIds.length} 资产 · {target.departmentMemorySpaceIds.length + 1} 个记忆范围</InfoRow><InfoRow label="移除后">{isLast ? '将进入零工作区空态，可随时重新添加。' : '将自动选择剩余的第一个工作区。'}</InfoRow></div>
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
      {restoreStep === 3 && preview && <><InfoRow label="将恢复">{preview.label}</InfoRow><InfoRow label="包含">{preview.includes.join('、')}</InfoRow><InfoRow label="不受影响">范围外配置、Agent 引用关系和当前业务集合</InfoRow><InfoRow label="Memory 策略">本地正式记忆可包含；远端仍需单独确认</InfoRow><InfoRow label="永不包含">{preview.excludes.join('、')}</InfoRow><InfoRow label="恢复前保护">先新增“恢复前演示”快照记录</InfoRow><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是演示流程，不会读取或恢复真实文件，也不会修改 Agent、资产、公司或工作区。</span></label></>}
    </AppDialog>
  }

  if (dialog.kind === 'organization') return <OrganizationDialog dialog={dialog} close={close} />
  return null
}

function MemoryReviewDialog({ candidate, close }: { candidate: ReturnType<typeof useApp>['state']['memoryCandidates'][number]; close: () => void }) {
  const { state, dispatch } = useApp()
  const [bundle, setBundle] = useState<MemoryReviewBundleDto>()
  const [result, setResult] = useState<ReviewMemoryCandidateResult>()
  const [loading, setLoading] = useState(isDesktopRuntime())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const desktop = isDesktopRuntime()
  const demoSpace = state.memorySpaces.find((item) => item.id === candidate.spaceId)
  const proposer = state.agents.find((item) => item.id === candidate.proposerAgentId)
  const principal = bundle?.space.reviewPrincipal ?? candidate.reviewPrincipal
  const reviewerLabel = principal.kind === 'agent'
    ? state.agents.find((item) => item.id === principal.agentId)?.name ?? principal.agentId
    : `董事长（${state.companies.find((item) => item.id === principal.companyId)?.name ?? principal.companyId}）`
  const selfReview = principal.kind === 'agent' && principal.agentId === candidate.proposerAgentId

  useEffect(() => {
    if (!desktop) return
    let active = true
    loadMemoryReview(`load-memory-${candidate.id}`, candidate.id)
      .then((value) => { if (active) setBundle(value) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [candidate.id, desktop])

  const reviewDemo = (status: '要求修改' | '已驳回' | '已写入演示 Revision') => {
    dispatch({ type: 'REVIEW_MEMORY_CANDIDATE', candidateId: candidate.id, status })
    close()
  }
  const reviewDesktop = async (decision: 'request_changes' | 'reject' | 'approve') => {
    if (!bundle || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await reviewMemoryCandidate({
        requestId: `review-memory-${candidate.id}-${decision}`,
        candidateId: bundle.candidate.id,
        decision,
        expectedCandidateVersion: bundle.candidate.version,
        expectedBaseline: bundle.candidate.submittedBaseline,
        expectedReviewPrincipal: bundle.candidate.reviewPrincipal,
      })
      setResult(next)
      dispatch({ type: 'SYNC_FORMAL_MEMORY_REVIEW', result: next })
      if (next.kind === 'saved' || next.kind === 'review_recorded') {
        dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: next.kind === 'saved' ? '正式记忆已写入' : '审核决定已记录', description: next.kind === 'saved' ? `已生成记忆版本 ${next.revision.id}` : '正式记忆文件未发生变化。' } })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  const recoverRevision = async () => {
    if (result?.kind !== 'revision_pending' || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await recoverMemoryRevision({ requestId: `recover-memory-${candidate.id}`, candidateId: result.candidate.id, recoveryRef: result.recoveryRef })
      setResult(next)
      dispatch({ type: 'SYNC_FORMAL_MEMORY_REVIEW', result: next })
      if (next.kind === 'saved') dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: '记忆版本已补记', description: `已生成正式版本 ${next.revision.id}，未重复写入文件。` } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  const displayCandidate = bundle?.candidate
  const current = bundle?.currentContent ?? candidate.current
  const proposed = displayCandidate?.proposedContent ?? candidate.proposed
  const status = result && 'candidate' in result ? result.candidate.status : displayCandidate?.status ?? candidate.status
  const diagnostic = result && 'diagnostics' in result ? result.diagnostics.map((item) => item.message).join('；') : ''
  const formalOwner = bundle?.space.owner
  const ownerLabel = formalOwner?.kind === 'agent'
    ? state.agents.find((item) => item.id === formalOwner.agentId)?.name ?? formalOwner.agentId
    : demoSpace?.owner ?? '—'

  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`审核正式记忆修改建议 ${candidate.id}`} description={desktop ? '审核关系、内容起点和写入结果由本地服务重新确认。' : '当前为浏览器演示，不会写入文件。'} size="xl" footer={<><Button variant="outline" disabled={loading || saving} onClick={() => desktop ? reviewDesktop('request_changes') : reviewDemo('要求修改')}>要求修改</Button><Button variant="outline" disabled={loading || saving} onClick={() => desktop ? reviewDesktop('reject') : reviewDemo('已驳回')}>驳回</Button><Button disabled={loading || saving || selfReview || Boolean(result && (result.kind === 'saved' || result.kind === 'review_recorded'))} onClick={() => desktop ? reviewDesktop('approve') : reviewDemo('已写入演示 Revision')}>{saving ? '正在处理…' : desktop ? '批准并写入正式记忆' : '批准并写入演示版本'}</Button></>}>
    {loading ? <p className="text-sm text-muted-foreground">正在读取正式记忆与审核起点…</p> : <><div className="grid gap-5 lg:grid-cols-[300px_1fr]"><div className="panel p-4"><InfoRow label="记忆范围">{bundle?.space.scopeType ?? demoSpace?.scopeType ?? candidate.spaceId}</InfoRow><InfoRow label="所有者">{ownerLabel}</InfoRow><InfoRow label="归口">{state.agents.find((item) => item.id === bundle?.space.stewardAgentId)?.name ?? demoSpace?.steward ?? '—'}</InfoRow><InfoRow label="审核">{reviewerLabel}</InfoRow><InfoRow label="提议者">{proposer?.name ?? candidate.proposerAgentId}</InfoRow><InfoRow label="状态"><StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge></InfoRow>{result?.kind === 'saved' && <InfoRow label="正式版本">{result.revision.id}</InfoRow>}</div><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border max-sm:grid-cols-1"><div><div className="bg-muted px-4 py-2 text-xs font-semibold">当前正式内容</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-sm text-muted-foreground">{current || '（空）'}</pre></div><div className="border-l border-border max-sm:border-l-0 max-sm:border-t"><div className="bg-primary/8 px-4 py-2 text-xs font-semibold">建议写回</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-sm">{proposed}</pre></div></div></div>{!selfReview ? <div className="mt-5 flex items-center gap-2 text-sm text-success"><Check size={17} aria-hidden="true" />提议者与审核者已分离。</div> : <div className="mt-5 text-sm text-danger">提议者不能自审，请先调整审核者。</div>}{result?.kind === 'baseline_changed' && <div className="mt-5 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm text-warning">正式内容已在审核期间变化，请关闭后基于当前内容重新提交修改建议。</div>}{result?.kind === 'revision_pending' && <div className="mt-5 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm text-warning"><p>文件已写入，但记忆版本尚待补记。请勿重复批准或重复写入。</p><Button className="mt-3" variant="outline" size="sm" disabled={saving} onClick={recoverRevision}>{saving ? '正在补记…' : '补记记忆版本'}</Button></div>}{diagnostic && <p role="alert" className="mt-4 text-sm text-danger">{diagnostic}</p>}{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}</>}
  </AppDialog>
}

function ClientGuideDialog({ client, workspace, agent, planning = false, close }: { client: ReturnType<typeof useApp>['state']['aiClients'][number]; workspace?: ReturnType<typeof useApp>['state']['workspaces'][number]; agent?: ReturnType<typeof useApp>['state']['agents'][number]; planning?: boolean; close: () => void }) {
  const { state, dispatch } = useApp()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [capability, setCapability] = useState<CapabilityFactDto>()
  const [copied, setCopied] = useState('')
  const [goal, setGoal] = useState('')
  const [participants, setParticipants] = useState('')
  const [boundaries, setBoundaries] = useState('')
  const descriptor = handoffDescriptor(client.id)
  const supportsHandoff = supportsWorkspaceHandoff(client)
  const desktop = isDesktopRuntime()
  const terminalId = state.runtime === 'desktop' ? state.uiPreferences.terminal : state.settings.terminal
  const terminal = terminalLabel(terminalId)
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
    if (!workspace || !desktop || !descriptor || opening) return
    setOpening(true)
    setError('')
    setCapability(undefined)
    try {
      const result = await requestClientHandoff({ clientId: descriptor.clientId, adapterId: descriptor.adapterId, workspaceId: workspace.id, terminalId: normalizeTerminalId(terminalId), intent: descriptor.intent })
      setCapability(result.capability)
      if (result.outcome !== 'accepted') {
        setError(result.capability.reason)
        return
      }
      close()
      notify('success', '已向系统请求打开工作区目录', `是否成功打开取决于系统设置；Bandi 不会自动启动或跟踪 ${client.name} 会话。`)
    } catch {
      setError('无法请求系统启动终端，请确认正在使用 Bandi Desktop。')
    } finally {
      setOpening(false)
    }
  }
  const title = supportsHandoff ? planning ? '让 AI 帮我规划协作方式' : `在 ${client.name} 中继续` : `${client.name} 配置入口`
  const description = supportsHandoff
    ? workspace ? planning ? `描述你的长期协作场景，再将规划说明复制到 ${client.name} 继续澄清。` : `在「${terminal}」中打开 ${workspace.name} 的目录，再由你手动启动 ${client.name}。` : '请先选择一个工作区。'
    : '查看工具配置与参考工作区；当前没有经过验证的启动方式。'
  const copyButton = (text: string, label: string, accessibleName: string, disabled = !workspace) => <Tooltip content={copied === label ? '已复制' : accessibleName}><Button variant="outline" size="icon" disabled={disabled} onClick={() => copy(text, label)} aria-label={accessibleName}>{copied === label ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}</Button></Tooltip>
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} description={description} size="md" footer={supportsHandoff ? desktop ? <><Button variant="outline" onClick={close}>取消</Button><Button disabled={!workspace || opening} onClick={launch}>{opening ? '正在请求打开…' : `在 ${terminal} 中打开目录`}</Button></> : <Button onClick={close}>关闭</Button> : undefined}>
    {supportsHandoff ? <>
      <section className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="text-sm font-semibold">{workspace?.name ?? '请先添加工作区'}</div>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3"><MonoPath>{workspace?.path ?? '—'}</MonoPath>{workspace && copyButton(workspace.path, '路径', '复制工作目录')}</div>
        {agent && <div className="mt-4 border-t border-border pt-4 text-sm"><b>{agent.name}</b><small className="mt-1 block leading-5 text-muted-foreground">董事长可直接联系此 Agent；复杂或跨部门事项仍建议由董事长助理协调。{binding ? '已显式关联当前工作区' : '尚未关联当前工作区'}；不表示 CLI 已自动加载。</small><MonoPath>{agent.packagePath}</MonoPath></div>}
      </section>
      {planning && <section className="mt-5 space-y-4" aria-labelledby="collaboration-planning"><div><h3 id="collaboration-planning" className="text-sm font-semibold">描述长期协作场景</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">内容只存在于当前弹窗，关闭即丢弃。不要填写 Token、密码、Cookie、私钥或客户秘密原文。</p></div><label className="block text-sm font-medium">你的场景与目标<textarea autoFocus className="mt-2 min-h-20 w-full p-3 text-sm" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：长期由内容、研发和运营协作交付产品更新" /></label><label className="block text-sm font-medium">当前参与者与资源（可选）<textarea className="mt-2 min-h-16 w-full p-3 text-sm" value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="已有真人、Agent、工具或配置" /></label><label className="block text-sm font-medium">高频协作与重要边界（可选）<textarea className="mt-2 min-h-16 w-full p-3 text-sm" value={boundaries} onChange={(event) => setBoundaries(event.target.value)} placeholder="重复协作、职责边界、禁止事项和验收要求" /></label><div><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">一次性协作规划说明</h4>{copyButton(planningPrompt, '规划说明', '复制协作规划说明', !workspace || !goal.trim())}</div><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-3 text-xs leading-6">{goal.trim() ? planningPrompt : '填写“你的场景与目标”后生成。'}</pre><p className="mt-2 text-xs text-muted-foreground">复制后打开 Claude Code 并粘贴发送；规划说明不会改变 Claude Code 的权限模式。</p></div></section>}
      <section className="mt-5" aria-labelledby="manual-handoff"><h3 id="manual-handoff" className="text-sm font-semibold">手动继续</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">目录打开后，由你在自己的终端中启动 {client.name}；Bandi 不生成、执行或回传命令。</p></section>
      <div className="mt-4 flex gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"><Info size={18} className="shrink-0" aria-hidden="true" /><span>Bandi 只请求系统用已登记的终端打开工作区目录，不会自动加载 Agent、扩大权限、绕过高风险确认或正式记忆审核，也不会读取、启动或跟踪后续会话。</span></div>
      {!desktop && <p className="mt-3 text-sm text-muted-foreground">浏览器无法请求本机终端打开目录，请复制上方工作目录后手动继续。</p>}
      {capability && <div className="mt-3 rounded-md border border-border p-3 text-sm"><b>{capability.status}</b><p className="mt-1 text-muted-foreground">{capability.reason}</p>{capability.remediation.map((item) => <p key={item} className="mt-1 text-xs text-muted-foreground">{item}</p>)}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error} 请复制上方工作目录后手动继续。</p>}
    </> : <div className="rounded-lg border border-border bg-muted/30 px-4"><InfoRow label="工作区">{workspace?.name ?? '未选择'}</InfoRow><InfoRow label="工作目录"><MonoPath>{workspace?.path ?? '—'}</MonoPath></InfoRow><InfoRow label="工具配置"><span className="flex items-center gap-2"><AiClientIcon client={client} size={16} />{client.name}</span></InfoRow><InfoRow label="方案关系">已加入当前配置方案</InfoRow><InfoRow label="启动方式">仅配置；尚未定义经过验证的启动命令或工作目录传递方式</InfoRow></div>}
  </AppDialog>
}

function WorkspaceResponsibilityDialog({ workspace, close }: { workspace: ReturnType<typeof useApp>['state']['workspaces'][number]; close: () => void }) {
  const { state, dispatch } = useApp(); const [companyId, setCompanyId] = useState(workspace.companyId ?? ''); const [primary, setPrimary] = useState(workspace.primaryDepartmentId ?? ''); const [lead, setLead] = useState(workspace.projectLeadAgentId ?? ''); const [collaborators, setCollaborators] = useState(workspace.collaboratorDepartmentIds); const [understood, setUnderstood] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const desktop = isDesktopRuntime(); const companyDepartments = state.departments.filter((item) => item.companyId === companyId); const eligibleLeads = state.agents.filter((item) => item.companyId === companyId && item.status === 'active'); const invalidLead = Boolean(lead && !eligibleLeads.some((item) => item.id === lead)); const highImpact = companyId !== (workspace.companyId ?? '')
  useEffect(() => { if (!state.departments.some((item) => item.companyId === companyId && item.id === primary)) { setPrimary(''); setLead(''); setCollaborators([]) } }, [companyId, primary, state.departments])
  const save = async () => { const changes = { companyId: companyId || undefined, company: state.companies.find((item) => item.id === companyId)?.name, primaryDepartmentId: primary || undefined, department: state.departments.find((item) => item.id === primary)?.name, projectLeadAgentId: lead || undefined, collaboratorDepartmentIds: collaborators }; if (desktop) { setSaving(true); setError(''); try { const persisted = await saveWorkspace({ ...workspace, ...changes }); dispatch({ type: 'SYNC_PERSISTED_WORKSPACES', workspaces: [persisted] }) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); return } setSaving(false) } else dispatch({ type: 'UPDATE_WORKSPACE', workspaceId: workspace.id, changes }); close(); dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: '项目责任已保存', description: `${workspace.name} 的组织关系与默认负责人已更新。` } }) }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="项目责任与组织关系" description={workspace.name} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={saving || Boolean(companyId && !primary) || invalidLead || (highImpact && !understood)} onClick={save}>{saving ? '正在保存…' : desktop ? '保存关系' : '保存演示关系'}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">所属公司<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">暂不关联</option>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">唯一主责部门<select className="mt-2 h-10 w-full px-3" value={primary} onChange={(e) => { setPrimary(e.target.value); setLead(state.departments.find((item) => item.id === e.target.value)?.managerAgentId ?? '') }}><option value="">请选择</option>{companyDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">默认负责人<select className="mt-2 h-10 w-full px-3" value={lead} onChange={(e) => setLead(e.target.value)}><option value="">未设置</option>{eligibleLeads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidLead && <span className="mt-1 block text-xs text-danger">当前负责人已停用、归档或不属于所选公司，请清空或重新选择。</span>}</label><fieldset><legend className="text-sm font-medium">协作部门</legend><div className="mt-2 space-y-2 rounded-lg border border-border p-3">{companyDepartments.filter((item) => item.id !== primary).map((item) => <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={collaborators.includes(item.id)} onChange={(e) => setCollaborators((values) => e.target.checked ? [...values, item.id] : values.filter((id) => id !== item.id))} />{item.name}</label>)}</div></fieldset></div>
    {highImpact && <div className="mt-5 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>更换所属公司是高影响变更</b><p className="mt-2 text-muted-foreground">需重新核对共享引用、服务授权和 记忆可见性；不会删除目录、历史、AgentPackage 或工作区专属配置。</p><label className="mt-3 flex gap-2"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />我已了解影响并完成核对</label></div>}
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
  </AppDialog>
}

function OrganizationDialog({ dialog, close }: { dialog: Extract<NonNullable<ReturnType<typeof useApp>['state']['dialog']>, { kind: 'organization' }>; close: () => void }) {
  const { state, dispatch } = useApp(); const navigate = useNavigate(); const currentCompany = dialog.entity === 'company' ? state.companies.find((item) => item.id === dialog.id) : undefined; const currentDepartment = dialog.entity === 'department' ? state.departments.find((item) => item.id === dialog.id) : undefined
  const [name, setName] = useState(currentCompany?.name ?? currentDepartment?.name ?? ''); const [companyId, setCompanyId] = useState(currentDepartment?.companyId ?? state.companies[0]?.id ?? ''); const [parentId, setParentId] = useState(currentDepartment?.parentDepartmentId ?? ''); const [mission, setMission] = useState(currentCompany?.mission ?? currentDepartment?.mission ?? ''); const [assistantAgentId, setAssistantAgentId] = useState(currentCompany?.assistantAgentId ?? ''); const [managerAgentId, setManagerAgentId] = useState(currentDepartment?.managerAgentId ?? ''); const [generatedId, setGeneratedId] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const desktop = isDesktopRuntime(); const duplicate = dialog.entity === 'company' ? state.companies.some((item) => item.id !== dialog.id && item.name === name.trim()) : state.departments.some((item) => item.id !== dialog.id && item.companyId === companyId && item.name === name.trim())
  const companyAgents = state.agents.filter((item) => item.companyId === currentCompany?.id && item.status === 'active')
  const departmentMembers = state.agents.filter((item) => currentDepartment?.memberAgentIds.includes(item.id) && item.companyId === currentDepartment.companyId && item.status === 'active')
  const invalidGovernanceAgent = dialog.entity === 'company' ? Boolean(assistantAgentId && !companyAgents.some((item) => item.id === assistantAgentId)) : Boolean(managerAgentId && !departmentMembers.some((item) => item.id === managerAgentId))
  const descendantIds = useMemo(() => { const result = new Set<string>(); if (!currentDepartment) return result; const visit = (id: string) => state.departments.filter((item) => item.parentDepartmentId === id).forEach((item) => { result.add(item.id); visit(item.id) }); visit(currentDepartment.id); return result }, [currentDepartment, state.departments]); const invalidParent = Boolean(parentId && (parentId === currentDepartment?.id || descendantIds.has(parentId)))
  const save = async () => { setSaving(true); setError(''); try { const id = dialog.id ?? (generatedId || (desktop ? await generateEntityId(dialog.entity, name) : `${dialog.entity}-${crypto.randomUUID()}`)); if (!dialog.id && !generatedId) setGeneratedId(id); if (dialog.entity === 'company') { const company = { id, name: name.trim(), mission: mission.trim(), boundary: currentCompany?.boundary ?? '组织身份不自动授予权限。', assistantAgentId: assistantAgentId || undefined, departmentIds: currentCompany?.departmentIds ?? [], workspaceIds: currentCompany?.workspaceIds ?? [], sharedAssetIds: currentCompany?.sharedAssetIds ?? [] }; if (desktop) { const persisted = await saveCompany(company); dispatch({ type: 'SYNC_PERSISTED_COMPANIES', companies: [persisted] }) } else dispatch(dialog.mode === 'create' ? { type: 'CREATE_COMPANY', company } : { type: 'UPDATE_COMPANY', companyId: id, changes: company }); close(); dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: dialog.mode === 'create' ? '公司已创建' : '公司配置已保存', description: `${company.name} 的组织配置已更新。` } }); if (dialog.mode === 'create') navigate(`/organization?company=${encodeURIComponent(id)}`, { replace: true }) } else { const department = { id, name: name.trim(), companyId, parentDepartmentId: parentId || undefined, parent: state.departments.find((item) => item.id === parentId)?.name, managerAgentId: managerAgentId || undefined, manager: state.agents.find((item) => item.id === managerAgentId)?.name, mission: mission.trim(), members: currentDepartment?.members ?? 0, responsibilities: currentDepartment?.responsibilities ?? [], boundaries: currentDepartment?.boundaries ?? ['不隐式授予权限'], delegationDepth: currentDepartment?.delegationDepth ?? 1, memberAgentIds: currentDepartment?.memberAgentIds ?? [], ownedSopIds: currentDepartment?.ownedSopIds ?? [] }; if (desktop) { const persisted = await saveDepartment(department); dispatch({ type: 'SYNC_PERSISTED_DEPARTMENTS', departments: [persisted] }) } else dispatch(dialog.mode === 'create' ? { type: 'CREATE_DEPARTMENT', department } : { type: 'UPDATE_DEPARTMENT', departmentId: id, changes: department }); close(); dispatch({ type: 'SHOW_NOTICE', notice: { tone: 'success', title: dialog.mode === 'create' ? '部门已创建' : '部门配置已保存', description: `${department.name} 的组织配置已更新。` } }); if (dialog.mode === 'create') navigate(`/organization?company=${encodeURIComponent(companyId)}&department=${encodeURIComponent(id)}`, { replace: true }) } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) } }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`${dialog.mode === 'create' ? '创建' : '编辑'}${dialog.entity === 'company' ? '公司' : '部门'}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={saving || !name.trim() || duplicate || invalidParent || invalidGovernanceAgent || (dialog.entity === 'department' && !companyId)} onClick={save}>{saving ? '正在保存…' : desktop ? '保存配置' : '保存演示配置'}</Button></>}><label className="block text-sm font-medium">名称<input className="mt-2 h-10 w-full px-3" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={duplicate} />{duplicate && <span className="mt-1 block text-xs text-danger">同一范围内名称重复。</span>}</label>{dialog.entity === 'department' && <>{dialog.mode === 'create' ? <label className="mt-4 block text-sm font-medium">所属公司<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setParentId('') }}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div className="mt-4"><div className="text-sm font-medium">所属公司</div><div className="mt-2 rounded-lg border border-border bg-muted/35 px-3 py-2.5 text-sm">{state.companies.find((item) => item.id === companyId)?.name ?? '未找到所属公司'}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">部门归属公司不能在普通编辑中更改；跨公司调整需使用独立的移动部门操作。</p></div>}<label className="mt-4 block text-sm font-medium">上级部门<select className="mt-2 h-10 w-full px-3" value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">顶级部门</option>{state.departments.filter((item) => item.companyId === companyId && item.id !== currentDepartment?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidParent && <span className="mt-1 block text-xs text-danger">不能移动到自身或后代部门，组织关系必须无环。</span>}</label></>}{dialog.entity === 'company' && dialog.mode === 'edit' && <label className="mt-4 block text-sm font-medium">董事长助理<select aria-label="董事长助理" className="mt-2 h-10 w-full px-3" value={assistantAgentId} onChange={(event) => setAssistantAgentId(event.target.value)}><option value="">未设置</option>{companyAgents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidGovernanceAgent && <span className="mt-1 block text-xs text-danger">当前助理已停用、归档或不属于本公司，请清空或重新选择。</span>}<span className="mt-1 block text-xs leading-5 text-muted-foreground">仅可选择本公司已启用 Agent；设置治理关系不会授予文件、命令、网络或委派权限。</span></label>}{dialog.entity === 'department' && dialog.mode === 'edit' && <label className="mt-4 block text-sm font-medium">部门主管<select aria-label="部门主管" className="mt-2 h-10 w-full px-3" value={managerAgentId} onChange={(event) => setManagerAgentId(event.target.value)}><option value="">未设置</option>{departmentMembers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidGovernanceAgent && <span className="mt-1 block text-xs text-danger">当前主管已停用、归档或不再属于本部门，请清空或重新选择。</span>}<span className="mt-1 block text-xs leading-5 text-muted-foreground">仅可选择本部门已启用成员；设置主管关系不会授予文件、命令、网络或委派权限。</span></label>}<label className="mt-4 block text-sm font-medium">使命<textarea className="mt-2 min-h-24 w-full p-3" value={mission} onChange={(e) => setMission(e.target.value)} /></label>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}<p className="mt-4 text-xs text-muted-foreground">{desktop ? '组织关系保存到 Bandi 本机数据；不会移动 AgentPackage、授予权限或修改外部配置。' : '组织变更仅在当前页面更新，不移动 AgentPackage、不授予权限。'}</p></AppDialog>
}

function MissingDialog({ title, close }: { title: string; close: () => void }) { return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} size="sm" footer={<Button onClick={close}>关闭</Button>}><p className="text-sm text-muted-foreground">要查看的内容已不存在，请关闭后重新选择。</p></AppDialog> }
