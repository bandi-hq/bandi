import type { Diagnostic, DiscoveryResult, SourceAssetSummaryDto, SourceContainerDto } from './contracts'

export type DiscoveredAssetRow = {
  id: string
  nodeType: 'config' | 'shared'
  kind: string
  scope: SourceAssetSummaryDto['officialScope']
  path: string
  writable: boolean
  readOnlyReason?: string
  parseStatus: SourceAssetSummaryDto['parseStatus']
  profileVersion: string
  diagnostics: Diagnostic[]
  outgoingReferences: number
  incomingReferences: number
  unresolvedReferences: number
}

export function projectDiscoveredAssets(result: DiscoveryResult): DiscoveredAssetRow[] {
  const containers = new Map(result.containers.map((container) => [container.id, container] as const))
  const configRows = result.assets.map((asset) => {
    const outgoing = result.references.filter((reference) => reference.sourceAssetId === asset.id)
    return projectAsset(asset, containers.get(asset.containerId), result.profileVersion, outgoing.length, outgoing.filter((reference) => reference.state !== 'resolved').length)
  })
  const sharedRows: DiscoveredAssetRow[] = result.sharedAssets.map((asset) => {
    const incoming = result.references.filter((reference) => reference.targetAssetId === asset.id)
    return {
      id: asset.id,
      nodeType: 'shared',
      kind: asset.kind,
      scope: 'bandi',
      path: asset.locator.relativePath ?? asset.locator.displayPath,
      writable: false,
      readOnlyReason: '共享资产本体当前仅提供可信只读索引',
      parseStatus: asset.parseStatus,
      profileVersion: 'shared-asset-v1',
      diagnostics: asset.diagnostics,
      outgoingReferences: 0,
      incomingReferences: incoming.length,
      unresolvedReferences: incoming.filter((reference) => reference.state !== 'resolved').length,
    }
  })
  return [...configRows, ...sharedRows]
}

function projectAsset(
  asset: SourceAssetSummaryDto,
  container: SourceContainerDto | undefined,
  profileVersion: string,
  outgoingReferences: number,
  unresolvedReferences: number,
): DiscoveredAssetRow {
  const missingContainer: Diagnostic[] = container ? [] : [{
    code: 'asset_container_missing',
    severity: 'error',
    message: '资产来源容器不存在',
    field: 'containerId',
    remediation: '重新刷新受管配置索引',
  }]
  return {
    id: asset.id,
    nodeType: 'config',
    kind: asset.kind,
    scope: asset.officialScope,
    path: container?.locator.relativePath ?? container?.locator.displayPath ?? '来源容器缺失',
    writable: asset.writable && Boolean(container?.writable),
    readOnlyReason: container?.readOnlyReason,
    parseStatus: asset.parseStatus,
    profileVersion,
    diagnostics: [...asset.diagnostics, ...missingContainer],
    outgoingReferences,
    incomingReferences: 0,
    unresolvedReferences,
  }
}
