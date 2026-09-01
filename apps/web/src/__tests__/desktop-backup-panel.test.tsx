// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopBackupPanel } from '../pages/settings/desktop-backup-panel'
import type { BackupSnapshotDto, DiscoveryResult } from '../contracts'

const bridge = vi.hoisted(() => ({
  createBackupSnapshot: vi.fn(),
  discoverConfig: vi.fn(),
  listBackupSnapshots: vi.fn(),
  previewBackupRestore: vi.fn(),
  restoreBackupSnapshot: vi.fn(),
}))

vi.mock('../desktop-bridge', () => bridge)

const hash = `sha256:${'a'.repeat(64)}` as const
const snapshot: BackupSnapshotDto = {
  id: 'backup-snapshot-1',
  kind: 'manual',
  scope: 'files',
  createdAt: '2026-09-01T00:00:00Z',
  entryCount: 1,
  manifestHash: hash,
  integrity: 'verified',
  entries: [{
    assetId: 'asset-instructions-1',
    containerId: 'container-1',
    kind: 'instructions',
    locator: { rootKind: 'managed', displayPath: 'Agent Alpha / instructions.md', relativePath: 'agt_alpha/instructions.md' },
    assetContentHash: hash,
    containerContentHash: hash,
    snapshotContentHash: hash,
    sizeBytes: 8,
    redacted: false,
  }],
}
const discovery: DiscoveryResult = {
  requestId: 'discover',
  profileVersion: 'agent-package-v1',
  containers: [],
  assets: [{
    id: 'asset-instructions-1',
    containerId: 'container-1',
    kind: 'instructions',
    officialScope: 'managed',
    assetContentHash: hash,
    containerContentHash: hash,
    writable: true,
    parseStatus: 'parsed',
    diagnostics: [],
  }],
  sharedAssets: [],
  references: [],
  diagnostics: [],
}

beforeEach(() => {
  bridge.createBackupSnapshot.mockReset().mockResolvedValue(snapshot)
  bridge.discoverConfig.mockReset().mockResolvedValue(discovery)
  bridge.listBackupSnapshots.mockReset().mockResolvedValue([snapshot])
  bridge.previewBackupRestore.mockReset().mockResolvedValue({
    requestId: 'preview-1',
    previewRef: 'preview-ref-1',
    snapshotId: snapshot.id,
    expiresAt: '2026-09-01T00:10:00Z',
    entries: [{ assetId: 'asset-instructions-1', status: 'ready', snapshotContentHash: hash }],
    canRestore: true,
    requiresConfirmation: true,
  })
  bridge.restoreBackupSnapshot.mockReset().mockResolvedValue({
    kind: 'restored',
    requestId: 'restore-1',
    snapshotId: snapshot.id,
    preRestoreSnapshotId: 'backup-pre-1',
    entries: [{ assetId: 'asset-instructions-1', status: 'restored', revisionId: 'revision-1' }],
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Desktop Backup 面板', () => {
  it('准确说明快照只包含 Bandi 发现并选中的受管配置文件', async () => {
    render(<DesktopBackupPanel />)

    expect(await screen.findByText(/快照只包含 Bandi 当前发现并由你选中的可写受管配置文件/)).toBeInTheDocument()
    expect(screen.getByText(/不包含公司、部门、岗位、工作区注册信息、服务授权或领域数据/)).toBeInTheDocument()
    expect(screen.getByText(/当前也不提供正式记忆文件/)).toBeInTheDocument()
  })

  it('从本地服务加载历史，并只用稳定资产 ID 创建快照', async () => {
    render(<DesktopBackupPanel />)
    await screen.findByText('手动快照')

    fireEvent.click(screen.getByRole('button', { name: '创建本地快照' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /instructions/ }))
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => expect(bridge.createBackupSnapshot).toHaveBeenCalledWith({
      requestId: 'create-backup-request-1',
      scope: { kind: 'files', assetIds: ['asset-instructions-1'] },
    }))
    const request = bridge.createBackupSnapshot.mock.calls[0][0]
    expect(request).not.toHaveProperty('path')
    expect(request).not.toHaveProperty('archivePath')
  })

  it('先校验预览和独立确认，再展示安全快照与 Revision 结果', async () => {
    render(<DesktopBackupPanel />)
    await screen.findByText('手动快照')
    fireEvent.click(screen.getByRole('button', { name: '预览恢复' }))
    fireEvent.click(screen.getByRole('button', { name: '校验并预览' }))
    await screen.findByText('可恢复')

    const restoreButton = screen.getByRole('button', { name: '确认恢复' })
    expect(restoreButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /我确认恢复这些配置资产/ }))
    fireEvent.click(restoreButton)

    await screen.findByText('恢复完成')
    expect(screen.getByText(/backup-pre-1/)).toBeInTheDocument()
    expect(screen.getByText(/revision-1/)).toBeInTheDocument()
    expect(bridge.restoreBackupSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      snapshotId: snapshot.id,
      assetIds: ['asset-instructions-1'],
      previewRef: 'preview-ref-1',
      confirmed: true,
    }))
  })
})
