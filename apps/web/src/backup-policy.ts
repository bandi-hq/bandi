import type { BackupScope, BackupSnapshot, Company, FullAgent } from './domain'

export const NEVER_BACKED_UP = ['凭据', 'Token', '钥匙串', '聊天', '工具调用', 'Todo', '日志', '终端与执行过程']

export type BackupPreview = {
  scope: BackupScope
  label: string
  includes: string[]
  excludes: string[]
  includesFormalMemory: boolean
}

type BackupContext = { companies: Company[]; agents: FullAgent[] }

export function describeBackupScope(scope: BackupScope, context: BackupContext): string {
  if (scope.kind === 'all') return '全部配置'
  if (scope.kind === 'company') return `公司：${context.companies.find((item) => item.id === scope.companyId)?.name ?? '不存在'}`
  if (scope.kind === 'agent') return `Agent：${context.agents.find((item) => item.id === scope.agentId)?.name ?? '不存在'}`
  return `指定文件：${scope.paths.length} 项`
}

export function buildBackupPreview(context: BackupContext, scope: BackupScope): BackupPreview | undefined {
  if (scope.kind === 'company' && !context.companies.some((item) => item.id === scope.companyId)) return undefined
  if (scope.kind === 'agent' && !context.agents.some((item) => item.id === scope.agentId)) return undefined
  if (scope.kind === 'files' && !scope.paths.length) return undefined
  const includes = scope.kind === 'files'
    ? [...scope.paths, '正式 Memory（若选中文件包含）']
    : [
        ...(scope.kind === 'all' ? ['Bandi 配置方案元数据'] : []),
        'AgentPackage',
        '组织关系',
        '工作区索引',
        '共享资产',
        '正式 Memory',
      ]
  return { scope, label: describeBackupScope(scope, context), includes, excludes: [...NEVER_BACKED_UP], includesFormalMemory: true }
}

export function createDemoSnapshot(preview: BackupPreview, input: { id: string; createdAt: string; kind?: BackupSnapshot['kind']; remoteConnected?: boolean }): BackupSnapshot {
  return { id: input.id, createdAt: input.createdAt, kind: input.kind ?? '手动演示', scope: preview.scope, includes: preview.includes, excludes: preview.excludes, localPath: `~/.bandi/backups/${input.id}`, deviceName: '当前设备（演示）', hash: `demo-${input.id.replace(/[^a-z0-9]/gi, '').slice(-8)}`, integrity: 'demo-unverified', remoteStatus: input.remoteConnected ? 'private-git-demo-synced' : 'private-git-not-connected', includesFormalMemory: preview.includesFormalMemory }
}
