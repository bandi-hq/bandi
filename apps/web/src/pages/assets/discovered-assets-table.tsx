import { Button } from '../../components/ui/button'
import { EmptyState, MonoPath, StatusBadge } from '../../components/app/page'
import type { DiscoveryIssueGroup, DiscoveredAssetRow } from '../../discovered-assets'

const parseStatusLabels: Record<string, string> = { parsed: '已读取', invalid: '配置有误', unsupported: '版本不兼容', redacted: '已脱敏' }
const assetKindLabels: Record<string, string> = {
  instructions: '主指令', context: '上下文', rules: '规则', skills: '技能', mcp: 'MCP',
  permissions: '权限', sop: 'SOP', orchestration: '协作策略', hooks: '钩子', commands: '命令',
  workspace_binding: '工作区绑定', rule: '规则', skill: '技能', hook: '钩子', command: '命令', output_profile: '输出格式',
}
const assetKindLabel = (kind: string) => assetKindLabels[kind] ?? kind
const severityLabels = { error: '错误', warning: '警告', info: '说明' }
const referenceStateLabels: Record<string, string> = {
  resolved: '已解析', unresolved: '尚无法确认', dangling: '目标不存在', type_mismatch: '类型不匹配', out_of_scope: '超出范围', target_invalid: '目标无效',
}

export function DiscoveryIssues({ groups }: { groups: DiscoveryIssueGroup[] }) {
  const actionable = groups.filter((group) => group.severity !== 'info')
  const information = groups.filter((group) => group.severity === 'info')
  return <>
    {actionable.length > 0 && <div role={actionable.some((group) => group.severity === 'error') ? 'alert' : 'status'} className="border-b border-warning/30 bg-warning/8 px-5 py-4">
      <ul className="space-y-2">{actionable.map((group) => <IssueGroup key={group.key} group={group} />)}</ul>
    </div>}
    {information.length > 0 && <details className="border-b border-border bg-muted/30 px-5 py-3 text-sm"><summary className="cursor-pointer font-medium">说明 {information.reduce((total, group) => total + group.diagnostics.length, 0)} 项</summary><ul className="mt-3 space-y-2">{information.map((group) => <IssueGroup key={group.key} group={group} />)}</ul></details>}
  </>
}

function IssueGroup({ group }: { group: DiscoveryIssueGroup }) {
  return <li className="text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={group.severity === 'error' ? 'danger' : group.severity === 'warning' ? 'warning' : 'neutral'}>{severityLabels[group.severity]}</StatusBadge><b>{group.title}</b>{group.diagnostics.length > 1 && <span className="text-muted-foreground">{group.diagnostics.length} 项</span>}</div>{group.diagnostics.length > 1 && <details className="ml-1 mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">查看具体项目</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{group.diagnostics.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}>{item.path ?? item.message}{item.remediation ? ` · ${item.remediation}` : ''}</li>)}</ul></details>}</li>
}

export function DiscoveredAssetsTable({ rows, loading, clear }: { rows: DiscoveredAssetRow[]; loading: boolean; clear: () => void }) {
  if (loading) return <p className="p-5 text-sm text-muted-foreground">正在读取受管配置资产…</p>
  if (!rows.length) return <div className="p-5"><EmptyState title="没有匹配的本机资产" description="当前只索引受管 AgentPackage；Claude 用户根和未授权目录不会被扫描。" action={<Button variant="outline" onClick={clear}>清除筛选</Button>} /></div>
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-muted text-xs"><tr>{['资产', '来源 / 路径', '状态', '引用'].map((item) => <th key={item} className="px-5 py-3">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((asset) => <AssetRow key={asset.id} asset={asset} />)}</tbody></table></div>
}

function AssetRow({ asset }: { asset: DiscoveredAssetRow }) {
  const problemCount = asset.diagnostics.filter((item) => item.severity !== 'info').length
  const statusTone = asset.parseStatus === 'parsed' ? (problemCount ? 'warning' : 'success') : asset.parseStatus === 'invalid' ? 'danger' : 'warning'
  return <tr className="align-top hover:bg-muted/50">
    <td className="px-5 py-4"><b className="text-sm">{assetKindLabel(asset.kind)}</b><small className="mt-1 block text-muted-foreground">{asset.label}</small></td>
    <td className="max-w-80 px-5 py-4"><span className="text-sm">{asset.source}</span><span className="mt-1 block min-w-0"><MonoPath>{asset.path}</MonoPath></span></td>
    <td className="px-5 py-4"><StatusBadge tone={statusTone}>{parseStatusLabels[asset.parseStatus] ?? asset.parseStatus}</StatusBadge>{problemCount > 0 && <small className="mt-1 block text-warning">{problemCount} 项需处理</small>}{!asset.writable && <small className="mt-1 block text-muted-foreground">只读</small>}</td>
    <td className="px-5 py-4"><span className="text-sm">{asset.nodeType === 'shared' ? `${asset.incomingReferences} 个反向引用` : `${asset.outgoingReferences} 条引用`}</span>{asset.unresolvedReferences > 0 && <small className="mt-1 block text-warning">{asset.unresolvedReferences} 条需处理</small>}<AssetDetails asset={asset} /></td>
  </tr>
}

function AssetDetails({ asset }: { asset: DiscoveredAssetRow }) {
  return <details className="mt-3 min-w-56"><summary className="cursor-pointer text-xs font-medium text-foreground">查看详情</summary><div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-4 text-xs">
    <Detail label="完整标识"><MonoPath>{asset.id}</MonoPath></Detail>
    <Detail label="完整路径"><MonoPath>{asset.path}</MonoPath></Detail>
    <Detail label="配置版本">{asset.profileVersion}</Detail>
    <Detail label="访问">{asset.writable ? '允许受控写入' : `只读${asset.readOnlyReason ? ` · ${asset.readOnlyReason}` : ''}`}</Detail>
    <Detail label="诊断">{asset.diagnostics.length ? <ul className="space-y-2">{asset.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}><b>{severityLabels[item.severity]} · {item.code}</b><span className="block text-muted-foreground">{item.message}{item.source ? ` · 来源 ${item.source}` : ''}{item.path ? ` · ${item.path}` : ''}{item.remediation ? ` · ${item.remediation}` : ''}</span></li>)}</ul> : '无'}</Detail>
    <Detail label="引用">{asset.referenceSummaries.length ? <ul className="space-y-2">{asset.referenceSummaries.map((summary) => <li key={summary.key}><b>{referenceStateLabels[summary.state] ?? summary.state} · {assetKindLabel(summary.targetKind)}</b><span className="block text-muted-foreground">{summary.targetAssetId}{summary.references.length > 1 ? ` · ${summary.references.length} 条来源边` : ''}</span>{summary.references.length > 1 && <ul className="mt-1 list-disc pl-5 text-muted-foreground">{summary.references.map((item, index) => <li key={`${item.sourceAssetId}-${item.sourcePath}-${index}`}>{item.sourcePath}</li>)}</ul>}</li>)}</ul> : '无'}</Detail>
  </div></details>
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><b className="block text-muted-foreground">{label}</b><div className="mt-1 min-w-0">{children}</div></div>
}
