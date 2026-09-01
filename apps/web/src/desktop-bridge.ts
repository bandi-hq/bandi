import type { AppCommandId } from './app-commands'
import type { RequestClientHandoff } from './client-adapters'
import type { FullAgent } from './domain'
import type { BackupRestorePreviewDto, BackupRestoreResultDto, BackupSnapshotDto, BaselineRefDto, ConfigRevisionDto, CreateBackupSnapshotRequest, CreateMemoryCandidateRequest, CreateWorkspaceBindingRequest, DiscoveryRequest, DiscoveryResult, DiscoverEligibleMemorySpacesRequest, EligibleMemorySpacesResult, ListMemoryRevisionsRequest, LoadEditorRequest, LoadEditorResult, ManagedAgentIdentityEditorResult, MemoryRevisionDto, MemoryReviewBundleDto, OrganizationSnapshot, PersistedServiceGrant, PreviewBackupRestoreRequest, RecoverConfigRevisionRequest, RecoverManagedAgentIdentityRequest, RecoverMemoryRevisionRequest, RegisterWorkspaceRequest, RestoreBackupSnapshotRequest, RestoreConfigRevisionRequest, RestoreManagedAgentIdentityRequest, ReviewMemoryCandidateRequest, ReviewMemoryCandidateResult, SaveConfigRequest, SaveConfigResult, SaveManagedAgentIdentityResult, WorkspaceRegistrationResult } from './contracts'
import type { Company, FullDepartment, FullWorkspace, Role, ServiceGrant } from './domain'

const commandEvent = 'bandi://app-command'

export function isDesktopRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function listenForDesktopCommands(
  handler: (command: unknown) => void,
): Promise<() => void> {
  if (!isDesktopRuntime()) return () => undefined
  const { listen } = await import('@tauri-apps/api/event')
  return listen<unknown>(commandEvent, (event) => handler(event.payload))
}

export async function setDesktopTitle(title: string): Promise<void> {
  if (!isDesktopRuntime()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().setTitle(title)
}

export function desktopCommandEventName(): string {
  return commandEvent
}

export type DesktopCommand = AppCommandId
export type UiAssetSlot = 'logo' | 'background'

export type CapabilityStatus = 'supported' | 'degraded' | 'unavailable' | 'not_checked'
export type ClientHandoffOutcome = 'accepted' | 'manual_required' | 'rejected' | 'not_attempted'

export type CapabilityFactDto = {
  status: CapabilityStatus
  reason: string
  evidence: string[]
  remediation: string[]
}

export type { RequestClientHandoff } from './client-adapters'

export type ClientHandoffResult = RequestClientHandoff & {
  capability: CapabilityFactDto
  outcome: ClientHandoffOutcome
  acceptedAt?: string
}

type UiAssetPayload = { mimeType: string; bytes: number[] }

async function invokeDesktop<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) throw new Error('该系统功能仅在 Bandi Desktop 中可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function requestClientHandoff(input: RequestClientHandoff): Promise<ClientHandoffResult> {
  return invokeDesktop<ClientHandoffResult>('request_client_handoff', { request: input })
}

export async function selectWorkspaceDirectory(): Promise<string | null> {
  if (!isDesktopRuntime()) throw new Error('该系统功能仅在 Bandi Desktop 中可用')
  const { open } = await import('@tauri-apps/plugin-dialog')
  return open({ directory: true, multiple: false })
}

export async function registerWorkspace(input: RegisterWorkspaceRequest): Promise<WorkspaceRegistrationResult> {
  return invokeDesktop('register_workspace', { request: input })
}

export async function createWorkspace(requestId: string, selectedPath: string, workspace: FullWorkspace): Promise<FullWorkspace> {
  return invokeDesktop('create_workspace', { request: { requestId, selectedPath, workspace } })
}

export async function loadOrganizationSnapshot(): Promise<OrganizationSnapshot> {
  return invokeDesktop('load_organization_snapshot', {})
}

export async function saveCompany(company: Company): Promise<Company> {
  return invokeDesktop('save_company', { request: { company } })
}

export async function saveDepartment(department: FullDepartment): Promise<FullDepartment> {
  return invokeDesktop('save_department', { request: { department } })
}

export async function saveRole(role: Role): Promise<Role> {
  return invokeDesktop('save_role', { request: { role } })
}

export async function saveWorkspace(workspace: FullWorkspace): Promise<FullWorkspace> {
  return invokeDesktop('save_workspace', { request: { workspace } })
}

export async function removeWorkspace(workspaceId: string): Promise<void> {
  return invokeDesktop('remove_workspace', { request: { workspaceId } })
}

export async function saveServiceGrants(agentId: string, grants: ServiceGrant[]): Promise<PersistedServiceGrant[]> {
  return invokeDesktop('save_service_grants', {
    request: { agentId, grants: grants.map((grant) => ({ ...grant, agentId })) },
  })
}

export async function generateEntityId(prefix: 'company' | 'department' | 'role' | 'workspace', name: string): Promise<string> {
  return invokeDesktop('generate_entity_id', { prefix, name })
}

export async function discoverEligibleMemorySpaces(input: DiscoverEligibleMemorySpacesRequest): Promise<EligibleMemorySpacesResult> {
  return invokeDesktop('discover_eligible_memory_spaces', { request: input })
}

export async function createMemoryCandidate(input: CreateMemoryCandidateRequest): Promise<MemoryReviewBundleDto> {
  return invokeDesktop('create_memory_candidate', { request: input })
}

export async function listMemoryReviews(requestId: string, agentId: string): Promise<MemoryReviewBundleDto[]> {
  return invokeDesktop('list_memory_reviews', { requestId, agentId })
}

export async function loadMemoryReview(requestId: string, candidateId: string): Promise<MemoryReviewBundleDto> {
  return invokeDesktop('load_memory_review', { requestId, candidateId })
}

export async function reviewMemoryCandidate(input: ReviewMemoryCandidateRequest): Promise<ReviewMemoryCandidateResult> {
  return invokeDesktop('review_memory_candidate', { request: input })
}

export async function recoverMemoryRevision(input: RecoverMemoryRevisionRequest): Promise<ReviewMemoryCandidateResult> {
  return invokeDesktop('recover_memory_revision', { request: input })
}

export async function listMemoryRevisions(input: ListMemoryRevisionsRequest): Promise<MemoryRevisionDto[]> {
  return invokeDesktop('list_memory_revisions', { request: input })
}

export async function discoverConfig(input: DiscoveryRequest): Promise<DiscoveryResult> {
  return invokeDesktop('discover_config', { request: input })
}

export async function createBackupSnapshot(input: CreateBackupSnapshotRequest): Promise<BackupSnapshotDto> {
  return invokeDesktop('create_backup_snapshot', { request: input })
}

export async function listBackupSnapshots(): Promise<BackupSnapshotDto[]> {
  return invokeDesktop('list_backup_snapshots', {})
}

export async function previewBackupRestore(input: PreviewBackupRestoreRequest): Promise<BackupRestorePreviewDto> {
  return invokeDesktop('preview_backup_restore', { request: input })
}

export async function restoreBackupSnapshot(input: RestoreBackupSnapshotRequest): Promise<BackupRestoreResultDto> {
  return invokeDesktop('restore_backup_snapshot', { request: input })
}

export async function loadConfigEditor(input: LoadEditorRequest): Promise<LoadEditorResult> {
  return invokeDesktop('load_config_editor', { request: input })
}

export async function listConfigRevisions(assetId: string): Promise<ConfigRevisionDto[]> {
  return invokeDesktop('list_config_revisions', { assetId })
}

export async function readConfigRevisionContent(revisionId: string): Promise<string> {
  return invokeDesktop('read_config_revision_content', { revisionId })
}

export async function createWorkspaceBinding(input: CreateWorkspaceBindingRequest): Promise<SaveConfigResult> {
  return invokeDesktop('create_workspace_binding', { request: input })
}

export async function saveConfig(input: SaveConfigRequest): Promise<SaveConfigResult> {
  return invokeDesktop('save_config', { request: input })
}

export async function recoverConfigRevision(input: RecoverConfigRevisionRequest): Promise<SaveConfigResult> {
  return invokeDesktop('recover_config_revision', { request: input })
}

export async function restoreConfigRevision(input: RestoreConfigRevisionRequest): Promise<SaveConfigResult> {
  return invokeDesktop('restore_config_revision', { request: input })
}

export async function importUiAsset(slot: UiAssetSlot, file: File): Promise<void> {
  await invokeDesktop('import_ui_asset', { slot, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) })
}

export async function readUiAsset(slot: UiAssetSlot): Promise<string | undefined> {
  const asset = await invokeDesktop<UiAssetPayload | null>('read_ui_asset', { slot })
  if (!asset) return undefined
  return URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }))
}

export async function deleteUiAsset(slot: UiAssetSlot): Promise<void> {
  await invokeDesktop('delete_ui_asset', { slot })
}

export async function readAgentAvatar(agentId: string): Promise<string | undefined> {
  const asset = await invokeDesktop<UiAssetPayload | null>('read_agent_avatar', { agentId })
  if (!asset) return undefined
  return URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }))
}

type ManagedAgentResult = { agent: FullAgent; baselineRef: BaselineRefDto }

export type AgentPackageFileInput = { path: string; content: string }

export async function createManagedAgent(
  agent: FullAgent,
  files: AgentPackageFileInput[],
  avatar?: File,
): Promise<ManagedAgentResult> {
  return invokeDesktop('create_managed_agent', {
    request: {
      agentId: agent.id,
      agent,
      files,
      avatarBytes: avatar
        ? Array.from(new Uint8Array(await avatar.arrayBuffer()))
        : undefined,
    },
  })
}

export async function loadManagedAgentIdentity(agentId: string): Promise<ManagedAgentIdentityEditorResult> {
  return invokeDesktop('load_managed_agent_identity', { agentId })
}

export async function saveManagedAgentIdentity(
  agent: FullAgent,
  manifest: string,
  expectedBaseline: BaselineRefDto,
  baseContent: string,
  avatar: { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; file: File },
): Promise<SaveManagedAgentIdentityResult> {
  return invokeDesktop('save_managed_agent_identity', {
    request: {
      requestId: `save-identity-${agent.id}`,
      agentId: agent.id,
      agent,
      manifest,
      expectedBaseline,
      baseContent,
      avatar: avatar.kind === 'replace'
        ? {
            kind: 'replace',
            bytes: Array.from(new Uint8Array(await avatar.file.arrayBuffer())),
          }
        : avatar,
    },
  })
}

export async function recoverManagedAgentIdentity(
  input: RecoverManagedAgentIdentityRequest,
): Promise<SaveManagedAgentIdentityResult> {
  return invokeDesktop('recover_managed_agent_identity', { request: input })
}

export async function restoreManagedAgentIdentity(
  input: RestoreManagedAgentIdentityRequest,
): Promise<SaveManagedAgentIdentityResult> {
  return invokeDesktop('restore_managed_agent_identity', { request: input })
}

export async function listManagedAgents(): Promise<FullAgent[]> {
  return invokeDesktop('list_managed_agents', {})
}
