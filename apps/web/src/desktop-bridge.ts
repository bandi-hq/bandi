import type { AppCommandId } from './app-commands'
import type { FullAgent } from './domain'
import type { TerminalId } from './terminal-model'

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

export type LaunchWorkspaceInput = {
  requestId: string
  workspaceId: string
  cwd: string
  terminalId: TerminalId
  executable: string
  args: string[]
  enterBandiOnStart: boolean
}

export type LaunchWorkspaceResult =
  | { kind: 'accepted'; requestId: string; acceptedAt: string }
  | { kind: 'fallback-required'; requestId: string; executable: string; args: string[]; message: string }
  | { kind: 'rejected'; requestId: string; code: string; message: string }

type UiAssetPayload = { mimeType: string; bytes: number[] }

async function invokeDesktop<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) throw new Error('该系统功能仅在 Bandi Desktop 中可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function requestLaunchWorkspace(input: LaunchWorkspaceInput): Promise<LaunchWorkspaceResult> {
  return invokeDesktop<LaunchWorkspaceResult>('launch_workspace_terminal', { request: input })
}

export async function selectWorkspaceDirectory(): Promise<string | null> {
  if (!isDesktopRuntime()) throw new Error('该系统功能仅在 Bandi Desktop 中可用')
  const { open } = await import('@tauri-apps/plugin-dialog')
  return open({ directory: true, multiple: false })
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

type ManagedAgentResult = { agent: FullAgent; baseline: string }

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

export async function saveManagedAgentIdentity(
  agent: FullAgent,
  manifest: string,
  expectedManifest: string,
  avatar: { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; file: File },
): Promise<ManagedAgentResult> {
  return invokeDesktop('save_managed_agent_identity', {
    request: {
      agentId: agent.id,
      agent,
      manifest,
      expectedManifest,
      avatar: avatar.kind === 'replace'
        ? {
            kind: 'replace',
            bytes: Array.from(new Uint8Array(await avatar.file.arrayBuffer())),
          }
        : avatar,
    },
  })
}

export async function listManagedAgents(): Promise<FullAgent[]> {
  return invokeDesktop('list_managed_agents', {})
}
