import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { AppDialog } from '../../components/ui/dialog'
import {
  commitFactoryReset,
  previewFactoryReset,
  type FactoryResetPreviewDto,
} from '../../desktop-bridge'
import { MAIN_MENU_LAYOUT_STORAGE_KEY } from '../../navigation-layout'
import {
  LEGACY_THEME_STORAGE_KEY,
  UI_PREFERENCES_STORAGE_KEY,
} from '../../ui-preferences'

const preservedItems = [
  '工作区项目及其中的源码和 .bandi/memory',
  '外部 AgentPackage 与 Claude Agent 导入来源',
  'Claude Code、Codex、凭据和其他宿主配置',
]

const targetLabels: Record<string, string> = {
  database: '领域数据库',
  databaseWal: '数据库写入日志',
  databaseShm: '数据库共享状态',
  workspaceRegistry: '工作区登记索引',
  sharedAssets: '共享资产',
  backups: '配置文件快照',
  revisions: '配置历史',
  uiAssets: '本机界面图片',
  managedAgents: 'Bandi 受管 AgentPackage',
}

function clearUiPreferences() {
  try {
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY)
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
    localStorage.removeItem(MAIN_MENU_LAYOUT_STORAGE_KEY)
  } catch {
    // WebView 禁止存储时无需阻塞已提交的后端重置。
  }
}

export function FactoryResetPanel() {
  const [preview, setPreview] = useState<FactoryResetPreviewDto>()
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [committed, setCommitted] = useState(false)

  const loadPreview = async () => {
    setLoading(true)
    setError('')
    try {
      setPreview(await previewFactoryReset(crypto.randomUUID()))
      setConfirmation('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const commit = async () => {
    if (!preview) return
    setLoading(true)
    setError('')
    try {
      const result = await commitFactoryReset({
        requestId: preview.requestId,
        previewRef: preview.previewRef,
        confirmationText: confirmation,
      })
      if (!result.requiresRestart) throw new Error('后端未要求重启，恢复出厂状态未完成')
      clearUiPreferences()
      setCommitted(true)
      setPreview(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  return <>
    <section className="panel p-5">
      <b>恢复出厂状态</b>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">将 Bandi 自有的受管 Agent、组织索引、配置历史和本机设置恢复到首次启动状态。配置文件快照不能作为完整回滚点。</p>
      {committed
        ? <div role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-4 text-sm text-warning">恢复已提交。请立即重启 Bandi；当前窗口不应继续编辑。</div>
        : <Button variant="danger" className="mt-4" disabled={loading} onClick={loadPreview}>{loading ? '正在检查…' : '预览恢复范围'}</Button>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>

    <AppDialog open={Boolean(preview)} onOpenChange={(open) => { if (!open && !loading) setPreview(undefined) }} title="确认恢复出厂状态" description="此操作会隔离 Bandi 自有数据，并要求重启应用。" footer={<><Button variant="outline" disabled={loading} onClick={() => setPreview(undefined)}>取消</Button><Button variant="danger" disabled={loading || confirmation !== preview?.confirmationText || !preview?.canCommit} onClick={commit}>{loading ? '正在提交…' : '确认恢复'}</Button></>}>
      {preview && <div className="space-y-5">
        <section><b className="text-sm">会重置</b><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{preview.targets.map((target) => <li key={target.id} className="flex justify-between gap-4 rounded-md border border-border px-3 py-2"><span>{targetLabels[target.id] ?? target.id}</span><span>{target.state === 'present' ? '存在' : '无数据'}</span></li>)}</ul></section>
        <section><b className="text-sm">会保留</b><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{preservedItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <label htmlFor="factory-reset-confirmation" className="block text-sm font-medium">输入“{preview.confirmationText}”确认<input id="factory-reset-confirmation" autoFocus className="mt-2 h-10 w-full px-3" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <p className="text-xs text-muted-foreground">预览有效至 {preview.expiresAt}；目标发生变化后需要重新预览。</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>}
    </AppDialog>
  </>
}
