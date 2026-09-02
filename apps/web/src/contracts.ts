export type Id = string
export type ContentHash = `sha256:${string}`
export type Timestamp = string

export type BaselineRefDto = {
  id: Id
  assetId: Id
  containerId: Id
  assetContentHash: ContentHash
  containerContentHash: ContentHash
  targetExists?: boolean
}

export type Diagnostic = {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  source?: string
  field?: string
  path?: string
  range?: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  remediation?: string
}

export type AgentListResult = {
  agents: import('./domain').FullAgent[]
  diagnostics: Diagnostic[]
}

export type ManagedAgentDeletionImpactDto = {
  id: Id
  label: string
  detail: string
  remediation?: string
}

export type ManagedAgentDeletionImpactsDto = {
  workspaceBindings: ManagedAgentDeletionImpactDto[]
  sharedAssetReferences: ManagedAgentDeletionImpactDto[]
  organizationRelationships: ManagedAgentDeletionImpactDto[]
  reviewResponsibilities: ManagedAgentDeletionImpactDto[]
  formalMemory: ManagedAgentDeletionImpactDto[]
  automaticCleanup: ManagedAgentDeletionImpactDto[]
  historyAndBackups: ManagedAgentDeletionImpactDto[]
  blockers: ManagedAgentDeletionImpactDto[]
}

export type PreviewManagedAgentDeletionRequest = {
  requestId: Id
  agentId: Id
}

export type ManagedAgentDeletionPreviewDto = PreviewManagedAgentDeletionRequest & {
  previewRef: Id
  confirmationText: string
  expiresAt: Timestamp
  packageFingerprint: string
  impacts: ManagedAgentDeletionImpactsDto
  canCommit: boolean
}

export type CommitManagedAgentDeletionRequest = PreviewManagedAgentDeletionRequest & {
  previewRef: Id
  confirmationText: string
}

export type ManagedAgentDeletionResultDto = PreviewManagedAgentDeletionRequest & {
  operationId: Id
  createdAt: Timestamp
  status: 'completed' | 'cleanup_pending'
  deletedConfigRevisions: number
  safeReason?: string
  pendingCleanup: string[]
}

export type CreateWorkspaceBindingRequest = {
  requestId: Id
  agentId: Id
  workspaceId: Id
  value: string
}

export type SaveConfigOwner = {
  agentId: Id
  workspaceId?: Id
}

export type SaveConfigRequest = {
  requestId: Id
  assetId: Id
  expectedOwner: SaveConfigOwner
  change:
    | { kind: 'instructions'; value: string }
    | { kind: 'context'; value: string }
    | { kind: 'rules'; value: string }
    | { kind: 'skills'; value: string }
    | { kind: 'mcp'; value: string }
    | { kind: 'permissions'; value: string }
    | { kind: 'sop'; value: string }
    | { kind: 'orchestration'; value: string }
    | { kind: 'hooks'; value: string }
    | { kind: 'commands'; value: string }
    | { kind: 'workspace_binding'; value: string }
  expectedBaseline: BaselineRefDto
  baseContent: string
  confirmationRef?: Id
}

export type WriteReceiptDto = {
  id: Id
  containerId: Id
  previousContainerHash: ContentHash
  writtenContainerHash: ContentHash
  verifiedAt: Timestamp
  atomicReplace: boolean
}

export type ConfigRevisionDto = {
  id: Id
  assetId: Id
  containerId: Id
  locator: AssetLocatorDto
  assetContentHash: ContentHash
  containerContentHash: ContentHash
  sourceAssetBaselineHash: ContentHash
  sourceContainerBaselineHash: ContentHash
  redacted: boolean
  writeReceiptId: Id
  savedAt: Timestamp
  summary: string
  confirmationRefs: Id[]
  restoredFromRevisionId?: Id
}

export type RestoreConfigRevisionRequest = {
  requestId: Id
  assetId: Id
  revisionId: Id
  expectedBaseline: BaselineRefDto
  baseContent: string
  confirmed: boolean
  confirmationRef?: Id
}

export type RecoverConfigRevisionRequest = {
  requestId: Id
  assetId: Id
  recoveryRef: Id
}

export type ConfigSide = {
  content: string
  assetContentHash: ContentHash
  containerContentHash: ContentHash
  redacted: boolean
}

export type ValidationFailed = {
  kind: 'validation_failed'
  requestId: Id
  diagnostics: Diagnostic[]
}

export type ConfirmationChallenge = {
  id: Id
  assetId: Id
  proposedContentHash: ContentHash
  expiresAt: Timestamp
  reason: string
}

export type SaveConfigResult =
  | { kind: 'saved'; requestId: Id; asset: SourceAssetSummaryDto; revision: ConfigRevisionDto; writeReceipt: WriteReceiptDto }
  | { kind: 'unchanged'; requestId: Id; asset: SourceAssetSummaryDto }
  | { kind: 'baseline_changed'; requestId: Id; assetId: Id; containerId: Id; locator: AssetLocatorDto; base: ConfigSide; current: ConfigSide; proposed: ConfigSide; diagnostics: Diagnostic[] }
  | { kind: 'confirmation_required'; requestId: Id; challenge: ConfirmationChallenge; diagnostics: Diagnostic[] }
  | ValidationFailed
  | { kind: 'save_failed'; requestId: Id; diagnostics: Diagnostic[]; retryable: boolean; fileState: 'unchanged' | 'write_not_verified' | 'verified_written_revision_pending'; recoveryRef?: Id }

export type ManagedAgentIdentityEditorResult = {
  assetId: Id
  containerId: Id
  locator: AssetLocatorDto
  canonicalContent: string
  baselineRef: BaselineRefDto
}

export type SaveManagedAgentIdentityResult =
  | { kind: 'saved'; requestId: Id; agent: import('./domain').FullAgent; baselineRef: BaselineRefDto; revision: ConfigRevisionDto; writeReceipt: WriteReceiptDto }
  | { kind: 'unchanged'; requestId: Id; agent: import('./domain').FullAgent; baselineRef: BaselineRefDto }
  | { kind: 'baseline_changed'; requestId: Id; assetId: Id; containerId: Id; locator: AssetLocatorDto; base: ConfigSide; current: ConfigSide; proposed: ConfigSide; diagnostics: Diagnostic[] }
  | ValidationFailed
  | { kind: 'save_failed'; requestId: Id; diagnostics: Diagnostic[]; retryable: boolean; fileState: 'unchanged' | 'write_not_verified' | 'verified_written_revision_pending'; recoveryRef?: Id }

export type RecoverManagedAgentIdentityRequest = {
  requestId: Id
  agentId: Id
  assetId: Id
  recoveryRef: Id
}

export type RestoreManagedAgentIdentityRequest = {
  requestId: Id
  agentId: Id
  assetId: Id
  revisionId: Id
  expectedBaseline: BaselineRefDto
  baseContent: string
  confirmed: boolean
}

export type RootKind = 'workspace' | 'claude_user' | 'managed' | 'bandi' | 'authorized_external'
export type OfficialScope = 'user' | 'project' | 'local' | 'managed' | 'bandi'

export type AssetLocatorDto = {
  rootKind: RootKind
  displayPath: string
  relativePath?: string
}

export type SourceContainerDto = {
  id: Id
  locator: AssetLocatorDto
  format: 'json' | 'jsonc' | 'yaml' | 'toml' | 'markdown' | 'directory'
  contentHash: ContentHash
  writable: boolean
  readOnlyReason?: string
}

export type SourceAssetSummaryDto = {
  id: Id
  containerId: Id
  kind: 'instructions' | 'context' | 'rules' | 'skills' | 'mcp' | 'permissions' | 'sop' | 'orchestration' | 'hooks' | 'commands' | 'workspace_binding'
  officialScope: OfficialScope
  assetContentHash: ContentHash
  containerContentHash: ContentHash
  writable: boolean
  parseStatus: 'parsed' | 'invalid' | 'unsupported' | 'redacted'
  diagnostics: Diagnostic[]
}

export type RegisterWorkspaceRequest = {
  requestId: Id
  workspaceId: Id
  selectedPath: string
}

export type WorkspaceRegistrationResult = {
  requestId: Id
  workspaceId: Id
  canonicalPath: string
  capability: {
    status: 'supported' | 'degraded' | 'unavailable' | 'not_checked'
    reason: string
    evidence: string[]
    remediation: string[]
  }
}

export type ClaudeAgentPreviewDto = {
  sourcePath: string
  sourceBaselineHash: ContentHash
  name: string
  description?: string
  instructions: string
  recognizedFields: string[]
  ignoredFields: string[]
}

export type ExternalAgentReferenceDto = {
  agentId: Id
  canonicalRoot: string
  metadata: import('./domain').FullAgent
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type AgentRecoveryStatus =
  | 'prepared'
  | 'filesystem_committed'
  | 'revision_pending'
  | 'organization_pending'
  | 'database_committed'
  | 'blocked'
  | 'completed'

export type AgentRecoveryOperationSummaryDto = {
  id: Id
  agentId: Id
  operationKind: 'create' | 'identity_update' | 'delete'
  status: AgentRecoveryStatus
  createdAt: Timestamp
  completedAt?: Timestamp
  safeReason?: string
}

export type AgentCommitResultDto = {
  operation: AgentRecoveryOperationSummaryDto
  agent?: import('./domain').FullAgent
  identityResult?: SaveManagedAgentIdentityResult
}

export type PersistedServiceGrant = {
  id: Id
  agentId: Id
  departmentId: Id
  capabilities: string[]
  workspaceIds: Id[]
  prohibitions: string[]
  status: '有效' | '暂停'
}

export type OrganizationSnapshot = {
  schemaVersion: 1
  companies: import('./domain').Company[]
  departments: import('./domain').FullDepartment[]
  roles: import('./domain').Role[]
  workspaces: import('./domain').FullWorkspace[]
  serviceGrants: PersistedServiceGrant[]
}

export type FormalMemoryScopeType =
  | 'agent_long_term'
  | 'agent_workspace'
  | 'workspace_shared'
  | 'department_workspace'

export type MemoryScopeKeyDto =
  | { kind: 'agent_long_term'; agentId: Id }
  | { kind: 'agent_workspace'; agentId: Id; workspaceId: Id }
  | { kind: 'workspace_shared'; workspaceId: Id }
  | { kind: 'department_workspace'; departmentId: Id; workspaceId: Id }

export type MemoryOwnerDto =
  | { kind: 'agent'; agentId: Id }
  | { kind: 'workspace'; workspaceId: Id }
  | { kind: 'department_workspace'; departmentId: Id; workspaceId: Id }

export type ReviewPrincipalDto =
  | { kind: 'agent'; agentId: Id }
  | { kind: 'chairman_user'; companyId: Id }

export type FormalMemoryCandidateStatus =
  | 'pending_review'
  | 'changes_requested'
  | 'rejected'
  | 'approved_pending_write'
  | 'written'
  | 'revision_pending'
export type MemoryReviewDecision = 'request_changes' | 'reject' | 'approve'

export type MemorySpaceDto = {
  id: Id
  scopeType: FormalMemoryScopeType
  scopeKey: MemoryScopeKeyDto
  owner: MemoryOwnerDto
  stewardAgentId: Id
  reviewPrincipal: ReviewPrincipalDto
  reviewPolicy: 'independent_reviewer'
  visibilityPolicy: 'agent_private' | 'workspace_shared' | 'department_workspace'
  storageProfileVersion: 'memory-v1'
  state: 'active' | 'read_only_history'
  storageLocator: AssetLocatorDto
  currentRevisionId?: Id
  contentHash: ContentHash
  updatedAt: Timestamp
}

export type DiscoverEligibleMemorySpacesRequest = {
  requestId: Id
  agentId: Id
}

export type EligibleMemorySpacesResult = {
  requestId: Id
  spaces: MemorySpaceDto[]
  diagnostics: Diagnostic[]
}

export type MemoryCandidateDto = {
  id: Id
  spaceId: Id
  proposerAgentId: Id
  reviewPrincipal: ReviewPrincipalDto
  source: { kind: 'manual' | 'import'; label: string }
  summary: string
  proposedContent: string
  proposedContentHash: ContentHash
  submittedBaseline: BaselineRefDto
  status: FormalMemoryCandidateStatus
  version: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type MemoryReviewDecisionDto = {
  id: Id
  candidateId: Id
  actorPrincipal: ReviewPrincipalDto
  decision: MemoryReviewDecision
  comment?: string
  decidedAt: Timestamp
}

export type MemoryRevisionDto = {
  id: Id
  spaceId: Id
  parentRevisionId?: Id
  candidateId: Id
  reviewDecisionId: Id
  proposerAgentId: Id
  reviewPrincipal: ReviewPrincipalDto
  sourceContentHash: ContentHash
  contentHash: ContentHash
  storageLocator: AssetLocatorDto
  writeReceiptId: Id
  writtenAt: Timestamp
}

export type CreateMemoryCandidateRequest = {
  requestId: Id
  candidateId: Id
  spaceId: Id
  proposerAgentId: Id
  source: { kind: 'manual' | 'import'; label: string }
  summary: string
  proposedContent: string
}

export type MemoryReviewBundleDto = {
  requestId: Id
  space: MemorySpaceDto
  candidate: MemoryCandidateDto
  currentContent: string
}

export type ReviewMemoryCandidateRequest = {
  requestId: Id
  candidateId: Id
  decision: MemoryReviewDecision
  expectedCandidateVersion: number
  expectedBaseline: BaselineRefDto
  expectedReviewPrincipal: ReviewPrincipalDto
  comment?: string
}

export type RecoverMemoryRevisionRequest = {
  requestId: Id
  candidateId: Id
  recoveryRef: Id
}

export type ListMemoryRevisionsRequest = {
  requestId: Id
  spaceId: Id
}

export type ReviewMemoryCandidateResult =
  | { kind: 'review_recorded'; requestId: Id; candidate: MemoryCandidateDto; decision: MemoryReviewDecisionDto }
  | { kind: 'saved'; requestId: Id; candidate: MemoryCandidateDto; decision: MemoryReviewDecisionDto; revision: MemoryRevisionDto; writeReceipt: WriteReceiptDto }
  | { kind: 'candidate_changed'; requestId: Id; candidate: MemoryCandidateDto; diagnostics: Diagnostic[] }
  | { kind: 'baseline_changed'; requestId: Id; candidateId: Id; base: ConfigSide; current: ConfigSide; proposed: ConfigSide; diagnostics: Diagnostic[] }
  | { kind: 'governance_changed' | 'self_review_forbidden' | 'validation_failed'; requestId: Id; diagnostics: Diagnostic[] }
  | { kind: 'save_failed'; requestId: Id; diagnostics: Diagnostic[]; retryable: boolean; fileState: 'unchanged' | 'write_not_verified' }
  | { kind: 'revision_pending'; requestId: Id; candidate: MemoryCandidateDto; decision: MemoryReviewDecisionDto; writeReceipt: WriteReceiptDto; recoveryRef: Id; diagnostics: Diagnostic[] }

export type CreateBackupSnapshotRequest = {
  requestId: Id
  scope: { kind: 'files'; assetIds: Id[] }
}

export type BackupSnapshotEntryDto = {
  assetId: Id
  containerId: Id
  kind: SourceAssetSummaryDto['kind']
  locator: AssetLocatorDto
  assetContentHash: ContentHash
  containerContentHash: ContentHash
  snapshotContentHash: ContentHash
  sizeBytes: number
  redacted: false
}

export type BackupSnapshotDto = {
  id: Id
  kind: 'manual' | 'pre_restore'
  scope: 'files'
  createdAt: Timestamp
  entryCount: number
  manifestHash: ContentHash
  integrity: 'verified' | 'failed'
  entries: BackupSnapshotEntryDto[]
}

export type PreviewBackupRestoreRequest = {
  requestId: Id
  snapshotId: Id
  assetIds: Id[]
}

export type BackupRestorePreviewEntryDto = {
  assetId: Id
  status: 'ready' | 'baseline_changed' | 'missing_current' | 'integrity_failed' | 'unavailable'
  snapshotContentHash: ContentHash
  currentBaseline?: BaselineRefDto
  diagnostics?: Diagnostic[]
}

export type BackupRestorePreviewDto = {
  requestId: Id
  previewRef: Id
  snapshotId: Id
  expiresAt: Timestamp
  entries: BackupRestorePreviewEntryDto[]
  canRestore: boolean
  requiresConfirmation: true
}

export type RestoreBackupSnapshotRequest = {
  requestId: Id
  snapshotId: Id
  assetIds: Id[]
  previewRef: Id
  confirmed: true
}

export type BackupRestoreEntryResultDto = {
  assetId: Id
  status: 'restored' | 'baseline_changed' | 'integrity_failed' | 'save_failed' | 'skipped'
  revisionId?: Id
  diagnostics?: Diagnostic[]
}

export type BackupRestoreResultDto = {
  kind: 'restored' | 'partial_failure' | 'restore_failed'
  requestId: Id
  snapshotId: Id
  preRestoreSnapshotId: Id
  entries: BackupRestoreEntryResultDto[]
}

export type DiscoveryRequest = {
  requestId: Id
  workspaceIds: Id[]
  includeClaudeUserRoot: boolean
}

export type SharedAssetKind = 'rule' | 'skill' | 'mcp' | 'sop' | 'hook' | 'command' | 'output_profile'

export type SharedAssetNodeDto = {
  id: Id
  kind: SharedAssetKind | 'unknown'
  companyId: Id
  departmentId?: Id
  locator: AssetLocatorDto
  contentHash: ContentHash
  parseStatus: 'parsed' | 'invalid'
  diagnostics: Diagnostic[]
}

export type AssetReferenceDto = {
  sourceAssetId: Id
  sourceContainerId: Id
  referrerKind: 'agent'
  referrerId: Id
  workspaceId?: Id
  targetAssetId: Id
  targetKind: SharedAssetKind
  state: 'resolved' | 'unresolved' | 'dangling' | 'type_mismatch' | 'out_of_scope' | 'target_invalid'
  targetLocator?: AssetLocatorDto
  targetCompanyId?: Id
  sourcePath: string
}

export type DiscoveryResult = {
  requestId: Id
  profileVersion: string
  containers: SourceContainerDto[]
  assets: SourceAssetSummaryDto[]
  sharedAssets: SharedAssetNodeDto[]
  references: AssetReferenceDto[]
  diagnostics: Diagnostic[]
}

export type LoadEditorRequest = { requestId: Id; assetId: Id }

export type LoadEditorResult = {
  requestId: Id
  asset: SourceAssetSummaryDto
  canonicalContent: string
  redacted: boolean
  baselineRef: BaselineRefDto
  diagnostics: Diagnostic[]
}

export type LocalServiceEvent =
  | { kind: 'config_invalidated'; eventId: Id; occurredAt: Timestamp; assetIds: Id[]; reason: 'external_change' | 'discovery_changed' | 'parser_changed' }
  | { kind: 'operation_progress'; eventId: Id; occurredAt: Timestamp; operationId: Id; operationKind: 'discovery' | 'backup' | 'restore'; phase: string; completed: number; total?: number; message?: string }
