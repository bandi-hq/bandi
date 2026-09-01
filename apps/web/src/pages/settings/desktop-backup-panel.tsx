import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { BackupRestorePreviewDto, BackupRestoreResultDto, BackupSnapshotDto, SourceAssetSummaryDto } from '../../contracts'
import { AppDialog } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { MonoPath, StatusBadge } from '../../components/app/page'
import {
  createBackupSnapshot,
  discoverConfig,
  listBackupSnapshots,
  previewBackupRestore,
  restoreBackupSnapshot,
} from '../../desktop-bridge'

function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

const statusLabels: Record<BackupRestorePreviewDto['entries'][number]['status'], string> = {
  ready: '可恢复',
  baseline_changed: '基线已变化',
  missing_current: '当前资产缺失',
  integrity_failed: '完整性失败',
  unavailable: '不可用',
}

const restoreStatusLabels: Record<BackupRestoreResultDto['entries'][number]['status'], string> = {
  restored: '已恢复',
  baseline_changed: '当前版本已变化',
  integrity_failed: '完整性校验失败',
  save_failed: '保存失败',
  skipped: '已跳过',
}

export function DesktopBackupPanel() {
  const [snapshots, setSnapshots] = useState<BackupSnapshotDto[]>([])
  const [assets, setAssets] = useState<SourceAssetSummaryDto[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupSnapshotDto>()
  const [restoreAssetIds, setRestoreAssetIds] = useState<string[]>([])
  const [preview, setPreview] = useState<BackupRestorePreviewDto>()
  const [result, setResult] = useState<BackupRestoreResultDto>()
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const createTriggerRef = useRef<HTMLButtonElement>(null)

  const writableAssets = useMemo(
    () => assets.filter((asset) => asset.writable && asset.parseStatus === 'parsed'),
    [assets],
  )

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [history, discovery] = await Promise.all([
        listBackupSnapshots(),
        discoverConfig({ requestId: requestId('discover-backup'), workspaceIds: [], includeClaudeUserRoot: false }),
      ])
      setSnapshots(history)
      setAssets(discovery.assets)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const closeCreate = () => {
    setCreateOpen(false)
    setSelectedAssetIds([])
    setError('')
    requestAnimationFrame(() => createTriggerRef.current?.focus())
  }

  const create = async () => {
    if (!selectedAssetIds.length || saving) return
    setSaving(true)
    setError('')
    try {
      const snapshot = await createBackupSnapshot({
        requestId: requestId('create-backup'),
        scope: { kind: 'files', assetIds: selectedAssetIds },
      })
      setSnapshots((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)])
      closeCreate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const openRestore = (snapshot: BackupSnapshotDto) => {
    setRestoreTarget(snapshot)
    setRestoreAssetIds(snapshot.entries.map((entry) => entry.assetId))
    setPreview(undefined)
    setResult(undefined)
    setConfirmed(false)
    setError('')
  }

  const closeRestore = () => {
    setRestoreTarget(undefined)
    setRestoreAssetIds([])
    setPreview(undefined)
    setResult(undefined)
    setConfirmed(false)
    setError('')
  }

  const previewRestore = async () => {
    if (!restoreTarget || !restoreAssetIds.length || saving) return
    setSaving(true)
    setError('')
    try {
      setPreview(await previewBackupRestore({
        requestId: requestId('preview-backup'),
        snapshotId: restoreTarget.id,
        assetIds: restoreAssetIds,
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const restore = async () => {
    if (!restoreTarget || !preview?.canRestore || !confirmed || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await restoreBackupSnapshot({
        requestId: requestId('restore-backup'),
        snapshotId: restoreTarget.id,
        assetIds: restoreAssetIds,
        previewRef: preview.previewRef,
        confirmed: true,
      })
      setResult(next)
      setSnapshots(await listBackupSnapshots())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-5">
    <section className="panel flex flex-wrap items-start justify-between gap-4 p-5">
      <div><b>快照与恢复</b><p className="mt-1 text-sm leading-6 text-muted-foreground">快照只包含 Bandi 当前发现并由你选中的可写受管配置文件，可按资产安全恢复。</p><p className="mt-1 text-xs leading-5 text-muted-foreground">不包含公司、部门、岗位、工作区注册信息、服务授权或领域数据；当前也不提供正式记忆文件。</p></div>
      <Button ref={createTriggerRef} disabled={loading || !writableAssets.length} onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" />创建本地快照</Button>
    </section>
    {error && <div className="rounded-lg border border-danger/30 bg-danger/8 p-4 text-sm text-danger" role="alert">{error}</div>}
    <section className="panel overflow-hidden">
      <div className="border-b border-border p-5"><b>快照历史</b><p className="mt-1 text-xs text-muted-foreground">历史保存在本机；恢复前会重新校验条目并创建安全快照。</p></div>
      {loading ? <p className="p-5 text-sm text-muted-foreground">正在加载本地快照…</p> : <div className="divide-y divide-border">
        {snapshots.map((snapshot) => <div key={snapshot.id} className="grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b>{snapshot.kind === 'pre_restore' ? '恢复前安全快照' : '手动快照'}</b><StatusBadge tone={snapshot.integrity === 'verified' ? 'success' : 'danger'}>{snapshot.integrity === 'verified' ? '清单已校验' : '清单异常'}</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">{snapshot.createdAt} · {snapshot.entryCount} 项</p><MonoPath>{snapshot.id}</MonoPath></div>
          <Button variant="outline" size="sm" disabled={snapshot.integrity !== 'verified'} onClick={() => openRestore(snapshot)}>预览恢复</Button>
        </div>)}
        {!snapshots.length && <p className="p-5 text-sm text-muted-foreground">尚未创建本地快照。</p>}
      </div>}
    </section>

    <AppDialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreate() }} title="创建本地快照" description="选择 1–256 个 Bandi 已发现且可写的受管配置文件；未选择的文件与领域数据不会加入。" size="lg" footer={<><Button variant="outline" onClick={closeCreate}>取消</Button><Button disabled={!selectedAssetIds.length || saving} onClick={create}>{saving ? '创建中…' : '确认创建'}</Button></>}>
      <AssetChecklist assets={writableAssets} selected={selectedAssetIds} onChange={setSelectedAssetIds} />
      <p className="mt-4 text-xs leading-5 text-muted-foreground">快照正文写入 Bandi Desktop 受控目录；凭据、Token、Cookie、私钥、钥匙串和执行过程不会加入快照。</p>
    </AppDialog>

    <AppDialog open={Boolean(restoreTarget)} onOpenChange={(open) => { if (!open) closeRestore() }} title="恢复本地快照" description={restoreTarget?.id} size="lg" footer={<><Button variant="outline" onClick={closeRestore}>{result ? '关闭' : '取消'}</Button>{!result && (!preview ? <Button disabled={!restoreAssetIds.length || saving} onClick={previewRestore}>{saving ? '校验中…' : '校验并预览'}</Button> : <Button variant="danger" disabled={!preview.canRestore || !confirmed || saving} onClick={restore}>{saving ? '恢复中…' : '确认恢复'}</Button>)}</>}>
      {restoreTarget && !preview && <fieldset><legend className="text-sm font-medium">选择恢复资产</legend><div className="mt-2 max-h-72 space-y-2 overflow-auto rounded-lg border border-border p-3">{restoreTarget.entries.map((entry) => <label key={entry.assetId} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={restoreAssetIds.includes(entry.assetId)} onChange={(event) => setRestoreAssetIds((current) => event.target.checked ? [...current, entry.assetId] : current.filter((id) => id !== entry.assetId))} /><span className="min-w-0"><b>{entry.kind}</b><MonoPath>{entry.locator.displayPath}</MonoPath></span></label>)}</div></fieldset>}
      {preview && !result && <div className="space-y-3">{preview.entries.map((entry) => <div key={entry.assetId} className="rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><MonoPath>{entry.assetId}</MonoPath><StatusBadge tone={entry.status === 'ready' ? 'success' : 'danger'}>{statusLabels[entry.status]}</StatusBadge></div>{entry.diagnostics?.map((item) => <p key={item.code} className="mt-2 text-xs text-danger">{item.message}</p>)}</div>)}<p className="text-xs text-muted-foreground">预览有效期至 {preview.expiresAt}。配置将逐项恢复；如果部分项目失败，可使用自动创建的恢复前安全快照回退。</p><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我确认恢复这些配置资产。恢复仍会校验当前版本、文件格式和权限变化。</span></label></div>}
      {result && <div className="space-y-3"><StatusBadge tone={result.kind === 'restored' ? 'success' : 'warning'}>{result.kind === 'restored' ? '恢复完成' : result.kind === 'partial_failure' ? '部分恢复' : '恢复失败'}</StatusBadge><p className="text-sm text-muted-foreground">恢复前安全快照：<span className="font-mono">{result.preRestoreSnapshotId}</span></p>{result.entries.map((entry) => <div key={entry.assetId} className="rounded-lg border border-border p-3 text-sm"><b>{restoreStatusLabels[entry.status]}</b><MonoPath>{entry.assetId}</MonoPath>{entry.revisionId && <p className="mt-1 text-xs text-muted-foreground">新版本：{entry.revisionId}</p>}{entry.diagnostics?.map((item) => <p key={item.code} className="mt-1 text-xs text-danger">{item.message}</p>)}</div>)}</div>}
    </AppDialog>
  </div>
}

function AssetChecklist({ assets, selected, onChange }: { assets: SourceAssetSummaryDto[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset><legend className="text-sm font-medium">配置资产（至少一项）</legend><div className="mt-2 max-h-72 space-y-2 overflow-auto rounded-lg border border-border p-3">{assets.map((asset) => <label key={asset.id} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={selected.includes(asset.id)} onChange={(event) => onChange(event.target.checked ? [...selected, asset.id] : selected.filter((id) => id !== asset.id))} /><span className="min-w-0"><b>{asset.kind}</b><MonoPath>{asset.id}</MonoPath></span></label>)}{!assets.length && <p className="text-sm text-muted-foreground">没有可加入快照的受管配置资产。</p>}</div></fieldset>
}
