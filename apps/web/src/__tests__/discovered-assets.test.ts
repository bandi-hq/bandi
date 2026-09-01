import { describe, expect, it } from 'vitest'
import { projectDiscoveredAssets } from '../discovered-assets'

const hash = `sha256:${'a'.repeat(64)}` as const

describe('真实资产发现投影', () => {
  it('连接来源容器并保留只读与诊断事实', () => {
    const rows = projectDiscoveredAssets({
      requestId: 'discover-1',
      profileVersion: 'agent-package-v1',
      containers: [{ id: 'container-1', locator: { rootKind: 'managed', displayPath: 'config/mcp.yaml', relativePath: 'config/mcp.yaml' }, format: 'yaml', contentHash: hash, writable: false, readOnlyReason: 'future schema' }],
      assets: [{ id: 'asset-1', containerId: 'container-1', kind: 'mcp', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'unsupported', diagnostics: [{ code: 'future_schema', severity: 'warning', message: '未来版本只读' }] }],
      sharedAssets: [],
      references: [{ sourceAssetId: 'asset-1', sourceContainerId: 'container-1', referrerKind: 'agent', referrerId: 'zhouce', targetAssetId: 'mcp-bandi', targetKind: 'mcp', state: 'unresolved', sourcePath: 'config/mcp.yaml' }],
      diagnostics: [],
    })

    expect(rows[0]).toMatchObject({ path: 'config/mcp.yaml', writable: false, readOnlyReason: 'future schema', parseStatus: 'unsupported', outgoingReferences: 1, unresolvedReferences: 1 })
    expect(rows[0].diagnostics[0].message).toBe('未来版本只读')
  })

  it('来源容器缺失时不伪造路径或可写能力', () => {
    const rows = projectDiscoveredAssets({
      requestId: 'discover-2',
      profileVersion: 'agent-package-v1',
      containers: [],
      assets: [{ id: 'asset-2', containerId: 'missing', kind: 'skills', officialScope: 'managed', assetContentHash: hash, containerContentHash: hash, writable: true, parseStatus: 'parsed', diagnostics: [] }],
      sharedAssets: [],
      references: [],
      diagnostics: [],
    })

    expect(rows[0]).toMatchObject({ path: '来源容器缺失', writable: false })
    expect(rows[0].diagnostics[0].code).toBe('asset_container_missing')
  })
})
