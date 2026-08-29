import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, FileDiff, Info, ShieldAlert } from 'lucide-react'
import { AddAiClientDialog, AiClientIcon } from './components/ai-clients'
import { Button } from './components/ui/button'
import { AppDialog } from './components/ui/dialog'
import { MonoPath, StatusBadge, toneForStatus } from './components/app/page'
import { useApp } from './state'
import { buildBackupPreview, createDemoSnapshot, describeBackupScope } from './backup-policy'
import type { BackupScope } from './domain'

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[128px_1fr]"><div className="text-sm text-muted-foreground">{label}</div><div className="min-w-0 break-words text-sm">{children}</div></div>
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
  }, [dialog?.kind])

  const workspace = state.workspaces.find((item) => item.id === (dialog?.kind === 'client-guide' ? dialog.workspaceId : state.currentWorkspaceId))
  const client = state.aiClients.find((item) => item.id === state.activeAiClientId) ?? state.aiClients[0]
  const agentId = dialog && 'agentId' in dialog ? dialog.agentId : undefined
  const agent = state.agents.find((item) => item.id === agentId)
  const assetId = dialog && 'assetId' in dialog ? dialog.assetId : undefined
  const asset = state.assets.find((item) => item.id === assetId)
  const path = dialog?.kind === 'diff' && dialog.path ? dialog.path : asset?.path ?? (agent ? `${agent.packagePath}instructions.md` : '未指定路径')

  if (!dialog) return null
  if (dialog.kind === 'add-ai-client') return <AddAiClientDialog />

  if (dialog.kind === 'client-guide') return <ClientGuideDialog client={client} workspace={workspace} close={close} done={done} />

  if (dialog.kind === 'config-history') {
    const revisions = state.configRevisions.filter((item) => item.ownerType === dialog.ownerType && item.ownerId === dialog.ownerId && item.path === dialog.path)
    const selected = revisions.find((item) => item.id === selectedRevisionId) ?? revisions[0]
    const current = revisions[0]
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`配置历史 · ${dialog.path.split('/').at(-1)}`} description="历史版本不可变；恢复会生成新的演示版本。" size="xl" footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={!selected || selected.id === current?.id} onClick={() => selected && dispatch({ type: 'RESTORE_CONFIG_REVISION', revisionId: selected.id })}>恢复为新版本</Button></>}>
      {revisions.length ? <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2" role="list" aria-label="配置版本">{revisions.map((revision, index) => <button key={revision.id} type="button" onClick={() => setSelectedRevisionId(revision.id)} className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === revision.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60'}`}><span className="flex items-center justify-between gap-2"><b className="text-sm">{revision.id}</b>{index === 0 && <StatusBadge tone="success">当前</StatusBadge>}</span><small className="mt-1 block text-muted-foreground">{revision.savedAt} · {revision.summary}</small>{revision.restoredFromRevisionId && <small className="mt-1 block text-muted-foreground">恢复自 {revision.restoredFromRevisionId}</small>}</button>)}</div><div className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">当前版本</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{current?.content}</pre></div><div className="min-w-0 rounded-lg border border-border"><div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold">{selected?.id === current?.id ? '选择一个历史版本比较' : selected?.id}</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-xs leading-6">{selected?.content}</pre></div></div><div className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">恢复会重新检查当前基线和长期配置风险；本 Web mock 只更新页面内存，不读取或写入文件。</div></div></div> : <p className="text-sm text-muted-foreground">当前文件尚无演示 ConfigRevision。正式 Memory 使用独立 MemoryRevision。</p>}
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
    const confirm = () => { dispatch({ type: 'UPDATE_AGENT', agentId: agent.id, changes: { permissions: { ...agent.permissions, files: nextFiles } }, message: `已模拟确认 ${agent.name} 权限扩大 · 仅当前页面内存 · 未写入磁盘` }); close() }
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="确认扩大长期 Agent 权限" description={`Agent：${agent.name}`} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" disabled={confirmName !== agent.name || !understood} onClick={confirm}>确认扩大权限并保存</Button></>}>
      <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger"><ShieldAlert className="shrink-0" /><div><b>可能修改 Workspace 外的项目或系统文件</b><p className="mt-1 text-sm">影响已绑定 Workspace：{agent.workspaceBindings.map((item) => state.workspaces.find((ws) => ws.id === item.workspaceId)?.name).filter(Boolean).join('、') || '无'}</p></div></div><div className="mt-5 panel p-4"><InfoRow label="变更前">{agent.permissions.files}</InfoRow><InfoRow label="变更后"><b className="text-danger">{nextFiles}</b></InfoRow><InfoRow label="全局边界">仍受不可突破的安全规则约束</InfoRow></div><label className="mt-5 block text-sm font-medium">请输入 Agent 名称“{agent.name}”确认<input className="mt-2 h-10 w-full px-3" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是权限扩大，不是普通配置更新</span></label>
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
    if (!target) return <MissingDialog title="Workspace 不存在" close={close} />
    return <WorkspaceResponsibilityDialog workspace={target} close={close} />
  }

  if (dialog.kind === 'remove-workspace-index') {
    const target = state.workspaces.find((item) => item.id === dialog.workspaceId)
    if (!target) return <MissingDialog title="Workspace 不存在" close={close} />
    const isLast = state.workspaces.length === 1
    return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="从演示索引移除 Workspace" description={`${target.name} · ${target.path}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button variant="danger" onClick={() => dispatch({ type: 'REMOVE_WORKSPACE_INDEX', workspaceId: target.id })}>确认从演示索引移除</Button></>}>
      <div className="rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>只移除当前页面中的演示索引</b><p className="mt-2 leading-6 text-muted-foreground">不会删除真实目录或文件，也不会删除 Agent WorkspaceBinding、MemorySpace、资产引用和历史。</p></div>
      <div className="mt-4 panel p-4"><InfoRow label="关联对象">{target.agentIds.length} Agents · {target.assetIds.length} 资产 · {target.departmentMemorySpaceIds.length + 1} MemorySpace</InfoRow><InfoRow label="移除后">{isLast ? '将进入零 Workspace 空态，可随时重新添加。' : '将自动选择剩余的第一个 Workspace。'}</InfoRow></div>
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
      {restoreStep === 1 && <><InfoRow label="快照时间">{snapshot.createdAt}</InfoRow><InfoRow label="快照范围">{describeBackupScope(snapshot.scope, state)}</InfoRow><label className="mt-5 block text-sm font-medium">恢复层级<select className="mt-2 h-10 w-full px-3" value={restoreScope.kind} onChange={(event) => chooseKind(event.target.value as BackupScope['kind'])}><option value="all">全部配置</option><option value="company">Company</option><option value="agent">Agent</option><option value="files">指定文件</option></select></label></>}
      {restoreStep === 2 && <>{restoreScope.kind === 'company' && <label className="block text-sm font-medium">Company<select className="mt-2 h-10 w-full px-3" value={restoreScope.companyId} onChange={(event) => setRestoreScope({ kind: 'company', companyId: event.target.value })}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{restoreScope.kind === 'agent' && <label className="block text-sm font-medium">Agent<select className="mt-2 h-10 w-full px-3" value={restoreScope.agentId} onChange={(event) => setRestoreScope({ kind: 'agent', agentId: event.target.value })}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{restoreScope.kind === 'files' && <fieldset><legend className="text-sm font-medium">指定恢复文件</legend><div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg border border-border p-3">{availableFiles.map((path) => <label key={path} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreFiles.includes(path)} onChange={(event) => setRestoreFiles((items) => event.target.checked ? [...items, path] : items.filter((item) => item !== path))} />{path}</label>)}</div>{!restoreFiles.length && <p className="mt-2 text-xs text-danger">请选择至少一个文件。</p>}</fieldset>}{restoreScope.kind === 'all' && <p className="text-sm text-muted-foreground">该层级无需选择具体对象，将恢复全部演示配置范围。</p>}</>}
      {restoreStep === 3 && preview && <><InfoRow label="将恢复">{preview.label}</InfoRow><InfoRow label="包含">{preview.includes.join('、')}</InfoRow><InfoRow label="不受影响">范围外配置、Agent 引用关系和当前业务集合</InfoRow><InfoRow label="Memory 策略">本地正式 Memory 可包含；远端仍遵循单独确认</InfoRow><InfoRow label="永不包含">{preview.excludes.join('、')}</InfoRow><InfoRow label="恢复前保护">先新增“恢复前演示”快照记录</InfoRow><label className="mt-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span>我理解这是演示流程，不会读取或恢复真实文件，也不会修改 Agent、资产、Company 或 Workspace。</span></label></>}
    </AppDialog>
  }

  if (dialog.kind === 'organization') return <OrganizationDialog dialog={dialog} close={close} />
  return null
}

function ClientGuideDialog({ client, workspace, close, done }: { client: ReturnType<typeof useApp>['state']['aiClients'][number]; workspace?: ReturnType<typeof useApp>['state']['workspaces'][number]; close: () => void; done: (text: string) => void }) {
  const { dispatch } = useApp()
  const title = '在 Claude Code 中继续'
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} description="只展示 Workspace、cwd 和标准命令，不执行或跟踪真实客户端。" size="md" footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={!workspace} onClick={() => done(`已查看 ${title} 指引 · 未打开客户端、终端或连接 Session`)}>确认已查看</Button></>}>
    <div className="rounded-lg border border-border bg-muted/40 p-4"><InfoRow label="当前客户端"><span className="flex items-center gap-2"><AiClientIcon client={client} size={16} />{client.name}</span></InfoRow><InfoRow label="Workspace">{workspace?.name ?? '请先连接项目目录'}</InfoRow><InfoRow label="工作目录"><MonoPath>{workspace?.path ?? '—'}</MonoPath></InfoRow>{client.kind === 'claude-code' && workspace && <><InfoRow label="标准命令"><MonoPath>cd &quot;{workspace.path}&quot; &amp;&amp; claude</MonoPath></InfoRow><InfoRow label="Bandi 入口"><MonoPath>/bandi:bandi</MonoPath></InfoRow></>}</div>
    <div className="mt-5 flex gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning"><Info size={18} className="shrink-0" aria-hidden="true" /><span>指引不代表客户端已安装、命令已执行、Session 已创建或配置已加载。</span></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!workspace} onClick={() => dispatch({ type: 'TOAST', text: `演示复制：${workspace?.path} · 未访问系统剪贴板` })}><Copy size={14} aria-hidden="true" />演示复制路径</Button>{client.kind === 'claude-code' && workspace && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'TOAST', text: `演示复制：cd &quot;${workspace?.path}&quot; && claude · 未访问系统剪贴板` })}><Copy size={14} aria-hidden="true" />演示复制命令</Button>}</div>
  </AppDialog>
}

function WorkspaceResponsibilityDialog({ workspace, close }: { workspace: ReturnType<typeof useApp>['state']['workspaces'][number]; close: () => void }) {
  const { state, dispatch } = useApp(); const [companyId, setCompanyId] = useState(workspace.companyId ?? ''); const [primary, setPrimary] = useState(workspace.primaryDepartmentId ?? ''); const [lead, setLead] = useState(workspace.projectLeadAgentId ?? ''); const [collaborators, setCollaborators] = useState(workspace.collaboratorDepartmentIds); const [understood, setUnderstood] = useState(false); const companyDepartments = state.departments.filter((item) => item.companyId === companyId); const highImpact = companyId !== (workspace.companyId ?? '')
  useEffect(() => { if (!state.departments.some((item) => item.companyId === companyId && item.id === primary)) { setPrimary(''); setLead(''); setCollaborators([]) } }, [companyId, primary, state.departments])
  const save = () => { dispatch({ type: 'UPDATE_WORKSPACE', workspaceId: workspace.id, changes: { companyId: companyId || undefined, company: state.companies.find((item) => item.id === companyId)?.name, primaryDepartmentId: primary || undefined, department: state.departments.find((item) => item.id === primary)?.name, projectLeadAgentId: lead || undefined, collaboratorDepartmentIds: collaborators } }); close() }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title="项目责任与组织关系" description={workspace.name} size="lg" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={Boolean(companyId && !primary) || (highImpact && !understood)} onClick={save}>保存演示关系</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Company<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">暂不关联</option>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">唯一主责部门<select className="mt-2 h-10 w-full px-3" value={primary} onChange={(e) => { setPrimary(e.target.value); setLead(state.departments.find((item) => item.id === e.target.value)?.managerAgentId ?? '') }}><option value="">请选择</option>{companyDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">默认负责人<select className="mt-2 h-10 w-full px-3" value={lead} onChange={(e) => setLead(e.target.value)}><option value="">未设置</option>{state.agents.filter((item) => item.companyId === companyId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset><legend className="text-sm font-medium">协作部门</legend><div className="mt-2 space-y-2 rounded-lg border border-border p-3">{companyDepartments.filter((item) => item.id !== primary).map((item) => <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={collaborators.includes(item.id)} onChange={(e) => setCollaborators((values) => e.target.checked ? [...values, item.id] : values.filter((id) => id !== item.id))} />{item.name}</label>)}</div></fieldset></div>
    {highImpact && <div className="mt-5 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm"><b>更换 Company 是高影响变更</b><p className="mt-2 text-muted-foreground">需重新核对共享引用、服务授权和 Memory 可见性；不会删除目录、历史、AgentPackage 或 WorkspaceBinding。</p><label className="mt-3 flex gap-2"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />我已了解影响并完成演示核对</label></div>}
  </AppDialog>
}

function OrganizationDialog({ dialog, close }: { dialog: Extract<NonNullable<ReturnType<typeof useApp>['state']['dialog']>, { kind: 'organization' }>; close: () => void }) {
  const { state, dispatch } = useApp(); const currentCompany = dialog.entity === 'company' ? state.companies.find((item) => item.id === dialog.id) : undefined; const currentDepartment = dialog.entity === 'department' ? state.departments.find((item) => item.id === dialog.id) : undefined
  const [name, setName] = useState(currentCompany?.name ?? currentDepartment?.name ?? ''); const [companyId, setCompanyId] = useState(currentDepartment?.companyId ?? state.companies[0]?.id ?? ''); const [parentId, setParentId] = useState(currentDepartment?.parentDepartmentId ?? ''); const [mission, setMission] = useState(currentCompany?.mission ?? currentDepartment?.mission ?? ''); const duplicate = dialog.entity === 'company' ? state.companies.some((item) => item.id !== dialog.id && item.name === name.trim()) : state.departments.some((item) => item.id !== dialog.id && item.companyId === companyId && item.name === name.trim())
  const descendantIds = useMemo(() => { const result = new Set<string>(); if (!currentDepartment) return result; const visit = (id: string) => state.departments.filter((item) => item.parentDepartmentId === id).forEach((item) => { result.add(item.id); visit(item.id) }); visit(currentDepartment.id); return result }, [currentDepartment, state.departments]); const invalidParent = Boolean(parentId && (parentId === currentDepartment?.id || descendantIds.has(parentId)))
  const save = () => { const id = dialog.id ?? `${dialog.entity}-${Date.now()}`; if (dialog.entity === 'company') { const company = { id, name: name.trim(), mission: mission.trim(), boundary: '组织身份不自动授予权限。', departmentIds: [], workspaceIds: [], sharedAssetIds: [] }; dispatch(dialog.mode === 'create' ? { type: 'CREATE_COMPANY', company } : { type: 'UPDATE_COMPANY', companyId: id, changes: { name: company.name, mission: company.mission } }) } else { const department = { id, name: name.trim(), companyId, parentDepartmentId: parentId || undefined, parent: state.departments.find((item) => item.id === parentId)?.name, mission: mission.trim(), members: 0, responsibilities: [], boundaries: ['不隐式授予权限'], delegationDepth: 1, memberAgentIds: [], ownedSopIds: [] }; dispatch(dialog.mode === 'create' ? { type: 'CREATE_DEPARTMENT', department } : { type: 'UPDATE_DEPARTMENT', departmentId: id, changes: department }) } close() }
  return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={`${dialog.mode === 'create' ? '创建' : '编辑'}${dialog.entity === 'company' ? '公司' : '部门'}`} size="md" footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={!name.trim() || duplicate || invalidParent || (dialog.entity === 'department' && !companyId)} onClick={save}>保存演示配置</Button></>}><label className="block text-sm font-medium">名称<input className="mt-2 h-10 w-full px-3" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={duplicate} />{duplicate && <span className="mt-1 block text-xs text-danger">同一范围内名称重复。</span>}</label>{dialog.entity === 'department' && <><label className="mt-4 block text-sm font-medium">Company<select className="mt-2 h-10 w-full px-3" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setParentId('') }}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="mt-4 block text-sm font-medium">上级部门<select className="mt-2 h-10 w-full px-3" value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">顶级部门</option>{state.departments.filter((item) => item.companyId === companyId && item.id !== currentDepartment?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invalidParent && <span className="mt-1 block text-xs text-danger">不能移动到自身或后代部门，组织关系必须无环。</span>}</label></>}<label className="mt-4 block text-sm font-medium">使命<textarea className="mt-2 min-h-24 w-full p-3" value={mission} onChange={(e) => setMission(e.target.value)} /></label><p className="mt-4 text-xs text-muted-foreground">组织变更只更新当前页面内存，不移动 AgentPackage、不授予权限。</p></AppDialog>
}

function MissingDialog({ title, close }: { title: string; close: () => void }) { return <AppDialog open onOpenChange={(open) => { if (!open) close() }} title={title} size="sm" footer={<Button onClick={close}>关闭</Button>}><p className="text-sm text-muted-foreground">Dialog payload 指向的对象不存在，没有使用其他对象替代。</p></AppDialog> }
