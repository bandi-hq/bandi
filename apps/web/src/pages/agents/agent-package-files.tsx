import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { buildAgentPackageTree, findAgentPackageNode, getAgentPackageBreadcrumb, getDefaultAgentPackagePath, type AgentPackageNode } from '../../agent-package'
import { FieldRow, MonoPath, PathActions, StatusBadge, toneForStatus } from '../../components/app/page'
import type { FullAgent } from '../../domain'
import { useApp } from '../../state'

export function AgentPackageFiles({ agent }: { agent: FullAgent }) {
  const { state } = useApp()
  const [params, setParams] = useSearchParams()
  const tree = useMemo(() => buildAgentPackageTree(agent.files), [agent.files])
  const requestedPath = params.get('path')
  const selectedPath = requestedPath ?? getDefaultAgentPackagePath(agent.files)
  const selected = selectedPath ? findAgentPackageNode(tree, selectedPath) : undefined
  const [expanded, setExpanded] = useState(() => new Set(['config', 'memory', 'workspaces', 'workspaces/bandi']))
  const visibleNodes = useMemo(() => flattenVisibleNodes(tree, expanded), [expanded, tree])
  const [focusedPath, setFocusedPath] = useState(selectedPath ?? visibleNodes[0]?.path)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const select = (path: string) => { const next = new URLSearchParams(params); next.set('tab', 'files'); next.set('path', path); setParams(next) }
  const toggle = (path: string, open?: boolean) => setExpanded((current) => { const next = new Set(current); const shouldOpen = open ?? !next.has(path); if (shouldOpen) next.add(path); else next.delete(path); return next })
  const focusNode = (path: string) => { setFocusedPath(path); requestAnimationFrame(() => buttonRefs.current.get(path)?.focus()) }
  const onTreeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, node: AgentPackageNode) => {
    const index = visibleNodes.findIndex((item) => item.path === node.path)
    if (event.key === 'ArrowDown' && index < visibleNodes.length - 1) focusNode(visibleNodes[index + 1].path)
    else if (event.key === 'ArrowUp' && index > 0) focusNode(visibleNodes[index - 1].path)
    else if (event.key === 'ArrowRight' && node.kind === 'directory') {
      if (!expanded.has(node.path)) toggle(node.path, true)
      else if (node.children[0]) focusNode(node.children[0].path)
    } else if (event.key === 'ArrowLeft') {
      if (node.kind === 'directory' && expanded.has(node.path)) toggle(node.path, false)
      else {
        const parentPath = node.path.split('/').slice(0, -1).join('/')
        if (parentPath) focusNode(parentPath)
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && node.kind === 'file') select(node.path)
    else return
    event.preventDefault()
  }
  const workspaceId = selected?.file?.scope.kind === 'workspace' ? selected.file.scope.workspaceId : undefined
  const workspace = state.workspaces.find((item) => item.id === workspaceId)

  return <section className="panel overflow-hidden"><div className="grid min-h-[480px] lg:grid-cols-[300px_1fr]"><div className="border-b border-border bg-muted/20 p-3 lg:border-b-0 lg:border-r"><div className="label mb-3 px-2">AgentPackage</div><div role="tree" aria-label={`${agent.name} AgentPackage 目录`} className="max-h-[420px] overflow-auto">{tree.map((node) => <TreeNode key={node.path} node={node} level={1} expanded={expanded} selectedPath={selected?.path} focusedPath={focusedPath} buttonRefs={buttonRefs.current} onToggle={toggle} onSelect={select} onFocus={setFocusedPath} onKeyDown={onTreeKeyDown} />)}</div></div><div className="min-w-0 p-5">{selected?.file ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs text-muted-foreground">{getAgentPackageBreadcrumb(selected.path).join(' / ')}</div><h2 className="mt-2 text-xl font-semibold">{selected.name}</h2></div><StatusBadge tone={toneForStatus(selected.file.status)}>{selected.file.status}</StatusBadge></div><div className="mt-6"><FieldRow label="相对路径"><MonoPath>{selected.path}</MonoPath></FieldRow><FieldRow label="演示完整路径"><MonoPath>{`${agent.packagePath}${selected.path}`}</MonoPath></FieldRow><FieldRow label="类型">{selected.file.type}</FieldRow><FieldRow label="作用域">{selected.file.scope.kind === 'agent-root' ? 'Agent 根级' : `Workspace 专属 · ${workspace?.name ?? selected.file.scope.workspaceId}`}</FieldRow><FieldRow label="Revision">{selected.file.revision ?? '未设置'}</FieldRow><FieldRow label="来源">{agent.packageSource.kind === 'external-reference' ? '外部只读引用（演示登记）' : 'Bandi 演示创建'}</FieldRow></div><div className="mt-6"><PathActions path={`${agent.packagePath}${selected.path}`} /></div></> : requestedPath ? <div role="status" className="rounded-lg border border-warning/30 bg-warning/8 p-5"><b>文件不存在</b><p className="mt-2 text-sm text-muted-foreground">URL 指向的路径不在当前演示 AgentPackage 中，没有自动选择其他文件。</p></div> : <p className="text-sm text-muted-foreground">当前 AgentPackage 没有文件记录。</p>}</div></div><div className="border-t border-border p-4 text-xs text-muted-foreground">目录树由扁平演示事实派生；稳定 Agent ID 目录不会因部门移动而改变。所有路径操作均未访问系统。</div></section>
}

function flattenVisibleNodes(nodes: AgentPackageNode[], expanded: Set<string>): AgentPackageNode[] {
  return nodes.flatMap((node) => [node, ...(node.kind === 'directory' && expanded.has(node.path) ? flattenVisibleNodes(node.children, expanded) : [])])
}

type TreeNodeProps = {
  node: AgentPackageNode
  level: number
  expanded: Set<string>
  selectedPath?: string
  focusedPath?: string
  buttonRefs: Map<string, HTMLButtonElement>
  onToggle: (path: string, open?: boolean) => void
  onSelect: (path: string) => void
  onFocus: (path: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, node: AgentPackageNode) => void
}

function TreeNode({ node, level, expanded, selectedPath, focusedPath, buttonRefs, onToggle, onSelect, onFocus, onKeyDown }: TreeNodeProps) {
  const open = expanded.has(node.path)
  const Icon = node.kind === 'directory' ? Folder : File
  return <div><button ref={(element) => { if (element) buttonRefs.set(node.path, element); else buttonRefs.delete(node.path) }} type="button" role="treeitem" aria-level={level} aria-expanded={node.kind === 'directory' ? open : undefined} aria-selected={node.kind === 'file' ? selectedPath === node.path : undefined} tabIndex={focusedPath === node.path ? 0 : -1} onFocus={() => onFocus(node.path)} onKeyDown={(event) => onKeyDown(event, node)} onClick={() => node.kind === 'directory' ? onToggle(node.path) : onSelect(node.path)} className={`flex min-h-10 w-full items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedPath === node.path ? 'bg-foreground text-background' : ''}`} style={{ paddingLeft: `${(level - 1) * 16 + 8}px` }}>{node.kind === 'directory' ? open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" /> : <span className="w-3.5" />}<Icon size={15} aria-hidden="true" /><span className="truncate">{node.name}</span></button>{node.kind === 'directory' && open && <div role="group">{node.children.map((child) => <TreeNode key={child.path} node={child} level={level + 1} expanded={expanded} selectedPath={selectedPath} focusedPath={focusedPath} buttonRefs={buttonRefs} onToggle={onToggle} onSelect={onSelect} onFocus={onFocus} onKeyDown={onKeyDown} />)}</div>}</div>
}
