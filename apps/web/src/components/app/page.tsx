import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FolderOpen, Copy, Info } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib'
import { useApp } from '../../state'

export function PageHeader({ title, description, action, backTo, backLabel = '返回' }: { title: string; description?: string; action?: ReactNode; backTo?: string; backLabel?: string }) {
  return <div className="mb-6">{backTo && <Link to={backTo} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />{backLabel}</Link>}<div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h2 className="text-2xl font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div></div>
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral'
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={cn('status text-xs', tone === 'success' && 'status-good', tone === 'warning' && 'status-warn', tone === 'danger' && 'border-danger/30 bg-danger/8 text-danger', tone === 'neutral' && 'border-border bg-muted text-muted-foreground')}>{children}</span>
}

export function toneForStatus(value: string): Tone {
  if (/完整|已保存|启用|已配置|有效|已写入/.test(value)) return 'success'
  if (/冲突|危险|失败|缺少|缺失/.test(value)) return 'danger'
  if (/外部|待|未知|暂停|未/.test(value)) return 'warning'
  return 'neutral'
}

export function MonoPath({ children }: { children: ReactNode }) {
  return <code className="mono break-all text-xs text-muted-foreground">{children}</code>
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[160px_1fr]"><div className="text-sm text-muted-foreground">{label}</div><div className="min-w-0 text-sm">{children}</div></div>
}

export function EntityTabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const activate = (index: number) => { const tab = tabs[(index + tabs.length) % tabs.length]; onChange(tab.id); requestAnimationFrame(() => refs.current[tab.id]?.focus()) }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') activate(0)
    else if (event.key === 'End') activate(tabs.length - 1)
    else activate(index + (event.key === 'ArrowRight' ? 1 : -1))
  }
  return <div className="mb-5 overflow-x-auto border-b border-border"><div className="flex min-w-max" role="tablist" aria-label="详情页签">{tabs.map((tab, index) => <button ref={(node) => { refs.current[tab.id] = node }} id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} key={tab.id} type="button" role="tab" tabIndex={active === tab.id ? 0 : -1} aria-selected={active === tab.id} onKeyDown={(event) => onKeyDown(event, index)} onClick={() => onChange(tab.id)} className={cn('min-h-11 border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', active === tab.id && 'border-foreground font-medium text-foreground')}>{tab.label}</button>)}</div></div>
}

export function EntityTabPanel({ tabId, activeTab, children }: { tabId: string; activeTab: string; children: ReactNode }) {
  if (tabId !== activeTab) return null
  return <div id={`panel-${tabId}`} role="tabpanel" aria-labelledby={`tab-${tabId}`} tabIndex={0}>{children}</div>
}

export function MockBoundaryNote({ children = '所有业务变更仅保存在当前页面内存；未访问系统、未执行命令、未写入磁盘。' }: { children?: ReactNode }) {
  return <div className="flex gap-3 rounded-lg border border-border bg-muted/45 p-4 text-sm leading-6 text-muted-foreground"><Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" /><div>{children}</div></div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center"><b>{title}</b><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function EntityNotFound({ entity, backTo }: { entity: string; backTo: string }) {
  return <div className="panel mx-auto max-w-2xl p-8 text-center"><h2 className="text-xl font-semibold">未找到{entity}</h2><p className="mt-2 text-sm text-muted-foreground">链接中的 ID 不存在。Bandi 不会用其他对象替代显示。</p><Button className="mt-5" asChild><Link to={backTo}>返回列表</Link></Button></div>
}

export function PathActions({ path }: { path: string }) {
  const { dispatch } = useApp()
  const feedback = (action: string) => dispatch({ type: 'TOAST', text: `${action}演示：${path} · 未访问系统或剪贴板` })
  return <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => feedback('编辑器打开')}><ExternalLink size={14} />演示打开</Button><Button variant="outline" size="sm" onClick={() => feedback('Finder 显示')}><FolderOpen size={14} />演示显示</Button><Button variant="outline" size="sm" onClick={() => feedback('复制路径')}><Copy size={14} />演示复制</Button></div>
}
