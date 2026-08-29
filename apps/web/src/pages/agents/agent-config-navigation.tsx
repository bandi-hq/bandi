import { FileCode2, Files } from 'lucide-react'
import { agentConfigSections, type AgentConfigSection, type AgentFileAssociation } from '../../agent-config-projection'
import { StatusBadge, toneForStatus } from '../../components/app/page'

export function AgentConfigNavigation({ active, onSelect }: { active: AgentConfigSection; onSelect: (section: AgentConfigSection) => void }) {
  return <>
    <nav aria-label="Agent 配置领域" className="hidden space-y-1 xl:block">
      <div className="label mb-3 px-2">配置</div>
      {agentConfigSections.map((item) => <button key={item.id} type="button" aria-current={active === item.id ? 'page' : undefined} onClick={() => onSelect(item.id)} className={`flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === item.id ? 'bg-foreground font-medium text-background' : 'hover:bg-muted'}`}>{item.label}</button>)}
    </nav>
    <label className="block text-sm font-medium xl:hidden">配置领域<select value={active} onChange={(event) => onSelect(event.target.value as AgentConfigSection)} className="mt-2 min-h-11 w-full px-3">{agentConfigSections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
  </>
}

export function AgentConfigFilesNav({ files, selectedPath, allFiles, onStructured, onSelect, onAllFiles }: { files: AgentFileAssociation[]; selectedPath?: string; allFiles: boolean; onStructured: () => void; onSelect: (path: string) => void; onAllFiles: () => void }) {
  return <>
    <nav aria-label="当前配置关联文件" className="hidden border-t border-border pt-4 xl:block">
      <div className="label mb-3 px-2">关联文件</div>
      <button type="button" aria-current={!selectedPath && !allFiles ? 'page' : undefined} onClick={onStructured} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!selectedPath && !allFiles ? 'bg-muted font-medium' : 'hover:bg-muted'}`}><FileCode2 size={15} aria-hidden="true" />结构化配置</button>
      {files.map(({ file }) => <button key={file.path} type="button" aria-current={selectedPath === file.path ? 'page' : undefined} onClick={() => onSelect(file.path)} className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedPath === file.path ? 'bg-muted font-medium' : 'hover:bg-muted'}`}><span className="min-w-0 truncate font-mono text-xs">{file.path}</span><StatusBadge tone={toneForStatus(file.status)}>{file.status}</StatusBadge></button>)}
      {!files.length && <p className="px-3 py-2 text-xs text-muted-foreground">当前配置没有已登记的关联文件。</p>}
      <button type="button" aria-current={allFiles ? 'page' : undefined} onClick={onAllFiles} className={`mt-3 flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${allFiles ? 'bg-muted font-medium' : 'hover:bg-muted'}`}><Files size={15} aria-hidden="true" />全部 AgentPackage 文件</button>
    </nav>
    <label className="mt-4 block text-sm font-medium xl:hidden">查看内容<select value={allFiles ? '__all__' : selectedPath ?? ''} onChange={(event) => event.target.value === '__all__' ? onAllFiles() : event.target.value ? onSelect(event.target.value) : onStructured()} className="mt-2 min-h-11 w-full px-3"><option value="">结构化配置</option>{files.map(({ file }) => <option key={file.path} value={file.path}>{file.path}</option>)}<option value="__all__">全部 AgentPackage 文件</option></select></label>
  </>
}
