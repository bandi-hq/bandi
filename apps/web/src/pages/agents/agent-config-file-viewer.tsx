import { ArrowLeft } from 'lucide-react'
import { getAgentFileAssociation, projectAgentFilePreview, type AgentFileView, type AgentProjectionContext } from '../../agent-config-projection'
import { projectAgentFileSource } from '../../agent-file-source'
import { getAgentPackageBreadcrumb } from '../../agent-package'
import { Button } from '../../components/ui/button'
import { FieldRow, MockBoundaryNote, MonoPath, PathActions, StatusBadge, toneForStatus } from '../../components/app/page'
import type { FullAgent } from '../../domain'
import { useApp } from '../../state'

export function AgentConfigFileViewer({ agent, context, path, view, onView, onBack }: { agent: FullAgent; context: AgentProjectionContext; path: string; view: AgentFileView; onView: (view: AgentFileView) => void; onBack: () => void }) {
  const { state } = useApp()
  const association = getAgentFileAssociation(agent, path)
  if (!association) return <div role="status" className="panel border-warning/30 p-5"><b>文件不存在</b><p className="mt-2 text-sm text-muted-foreground">URL 指向的文件不在当前 AgentPackage 演示记录中。</p><Button className="mt-4" variant="outline" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />返回结构化配置</Button></div>
  const workspaceId = association.file.scope.kind === 'workspace' ? association.file.scope.workspaceId : undefined
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  const preview = projectAgentFilePreview(agent, context, path)
  const source = projectAgentFileSource(agent, context, path)

  return <section className="panel min-w-0 overflow-hidden"><header className="border-b border-border p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{getAgentPackageBreadcrumb(path).join(' / ')}</p><h2 className="mt-2 text-xl font-semibold">{path.split('/').at(-1)}</h2><MonoPath>{path}</MonoPath></div><StatusBadge tone={toneForStatus(association.file.status)}>{association.file.status}</StatusBadge></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />返回结构化配置</Button><div className="inline-flex rounded-md border border-border p-1" aria-label="文件查看模式"><button type="button" aria-pressed={view === 'preview'} onClick={() => onView('preview')} className={`min-h-9 rounded px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === 'preview' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>结构化预览</button><button type="button" aria-pressed={view === 'source'} onClick={() => onView('source')} className={`min-h-9 rounded px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === 'source' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>只读源码</button></div></div></header>
    <div className="min-w-0 p-5">
      {view === 'preview' ? preview ? <div><h3 className="font-semibold">{preview.title}</h3><p className="mt-1 text-sm text-muted-foreground">{preview.description}</p>{preview.notice && <div role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm">{preview.notice}</div>}<div className="mt-5">{preview.fields.map((field) => <FieldRow key={field.label} label={field.label}>{Array.isArray(field.value) ? field.value.length ? field.value.join('；') : '无' : field.value || '无'}</FieldRow>)}</div></div> : <p className="text-sm text-muted-foreground">当前文件没有结构化预览。</p> : source.status === 'available' ? <><MockBoundaryNote>演示源码投影由当前页面内存中的结构化配置即时生成；未读取或写入磁盘。</MockBoundaryNote><div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-muted/35"><div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{source.language} · 只读</div><pre className="max-w-full overflow-x-auto p-4 text-[13px] leading-6"><code>{source.content}</code></pre></div></> : <div role="status" className="rounded-lg border border-warning/30 bg-warning/8 p-5"><b>源码不可用</b><p className="mt-2 text-sm text-muted-foreground">{source.message}</p></div>}
      <div className="mt-6 border-t border-border pt-5"><FieldRow label="演示完整路径"><MonoPath>{`${agent.packagePath}${path}`}</MonoPath></FieldRow><FieldRow label="类型">{association.file.type}</FieldRow><FieldRow label="作用域">{association.file.scope.kind === 'agent-root' ? 'Agent 根级' : `Workspace 专属 · ${workspace?.name ?? workspaceId}`}</FieldRow><FieldRow label="Revision">{association.file.revision ?? '未设置'}</FieldRow><FieldRow label="来源">{agent.packageSource.kind === 'external-reference' ? '外部只读引用（演示登记）' : 'Bandi 演示创建'}</FieldRow><div className="mt-5"><PathActions path={`${agent.packagePath}${path}`} /></div></div>
    </div>
  </section>
}
