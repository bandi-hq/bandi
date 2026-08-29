import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { buildAgentPackageTree, type AgentPackageNode } from '../../agent-package'
import type { AgentFile } from '../../domain'

export function AgentPackageTree({ files, selectedPath, onSelect, ariaLabel }: { files: AgentFile[]; selectedPath?: string; onSelect: (path: string) => void; ariaLabel: string }) {
  const tree = useMemo(() => buildAgentPackageTree(files), [files])
  const [expanded, setExpanded] = useState(() => new Set(['config', 'memory', 'workspaces', 'workspaces/bandi']))
  const visibleNodes = useMemo(() => flattenVisibleNodes(tree, expanded), [expanded, tree])
  const [focusedPath, setFocusedPath] = useState(selectedPath ?? visibleNodes[0]?.path)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (selectedPath && visibleNodes.some((item) => item.path === selectedPath)) setFocusedPath(selectedPath)
    else if (!visibleNodes.some((item) => item.path === focusedPath)) setFocusedPath(visibleNodes[0]?.path)
  }, [focusedPath, selectedPath, visibleNodes])

  const toggle = (path: string, open?: boolean) => setExpanded((current) => {
    const next = new Set(current)
    const shouldOpen = open ?? !next.has(path)
    if (shouldOpen) next.add(path)
    else next.delete(path)
    return next
  })
  const focusNode = (path: string) => {
    setFocusedPath(path)
    requestAnimationFrame(() => buttonRefs.current.get(path)?.focus())
  }
  const onTreeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, node: AgentPackageNode) => {
    const index = visibleNodes.findIndex((item) => item.path === node.path)
    if (event.key === 'ArrowDown' && index < visibleNodes.length - 1) focusNode(visibleNodes[index + 1].path)
    else if (event.key === 'ArrowUp' && index > 0) focusNode(visibleNodes[index - 1].path)
    else if (event.key === 'Home' && visibleNodes[0]) focusNode(visibleNodes[0].path)
    else if (event.key === 'End' && visibleNodes.at(-1)) focusNode(visibleNodes.at(-1)!.path)
    else if (event.key === 'ArrowRight' && node.kind === 'directory') {
      if (!expanded.has(node.path)) toggle(node.path, true)
      else if (node.children[0]) focusNode(node.children[0].path)
    } else if (event.key === 'ArrowLeft') {
      if (node.kind === 'directory' && expanded.has(node.path)) toggle(node.path, false)
      else {
        const parentPath = node.path.split('/').slice(0, -1).join('/')
        if (parentPath) focusNode(parentPath)
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && node.kind === 'file') onSelect(node.path)
    else return
    event.preventDefault()
  }

  if (!tree.length) return <p className="p-3 text-sm text-muted-foreground">当前 AgentPackage 没有文件记录。</p>
  return <div role="tree" aria-label={ariaLabel} className="max-h-[430px] overflow-auto p-2">{tree.map((node) => <TreeNode key={node.path} node={node} level={1} expanded={expanded} selectedPath={selectedPath} focusedPath={focusedPath} buttonRefs={buttonRefs.current} onToggle={toggle} onSelect={onSelect} onFocus={setFocusedPath} onKeyDown={onTreeKeyDown} />)}</div>
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
  return <div><button ref={(element) => { if (element) buttonRefs.set(node.path, element); else buttonRefs.delete(node.path) }} type="button" role="treeitem" aria-level={level} aria-expanded={node.kind === 'directory' ? open : undefined} aria-selected={node.kind === 'file' ? selectedPath === node.path : undefined} tabIndex={focusedPath === node.path ? 0 : -1} onFocus={() => onFocus(node.path)} onKeyDown={(event) => onKeyDown(event, node)} onClick={() => node.kind === 'directory' ? onToggle(node.path) : onSelect(node.path)} className={`flex min-h-11 w-full items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedPath === node.path ? 'bg-foreground text-background' : ''}`} style={{ paddingLeft: `${(level - 1) * 16 + 8}px` }}>{node.kind === 'directory' ? open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" /> : <span className="w-3.5" />}<Icon size={15} aria-hidden="true" /><span className="truncate">{node.name}</span></button>{node.kind === 'directory' && open && <div role="group">{node.children.map((child) => <TreeNode key={child.path} node={child} level={level + 1} expanded={expanded} selectedPath={selectedPath} focusedPath={focusedPath} buttonRefs={buttonRefs} onToggle={onToggle} onSelect={onSelect} onFocus={onFocus} onKeyDown={onKeyDown} />)}</div>}</div>
}
