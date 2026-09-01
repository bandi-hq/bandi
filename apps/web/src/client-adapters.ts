import type { TerminalId } from './terminal-model'

export type BuiltInClientId =
  | 'claude-code'
  | 'claude-desktop'
  | 'codex'
  | 'gemini-cli'
  | 'grok-build'
  | 'opencode'
  | 'openclaw'
  | 'hermes'
  | 'pi'

export type ClientAdapterId =
  | 'claude-code-terminal-v1'
  | 'claude-desktop-config-v1'
  | 'codex-terminal-v1'
  | 'gemini-cli-terminal-v1'
  | 'grok-build-config-v1'
  | 'opencode-terminal-v1'
  | 'openclaw-terminal-v1'
  | 'hermes-terminal-v1'
  | 'pi-terminal-v1'

export type ClientHandoffIntent = 'continue_workspace'

export type ClientHandoffDescriptor = {
  clientId: BuiltInClientId
  adapterId: ClientAdapterId
  intent: ClientHandoffIntent
}

export type RequestClientHandoff = {
  clientId: BuiltInClientId
  adapterId: ClientAdapterId
  workspaceId: string
  terminalId: Exclude<TerminalId, 'system'>
  intent: ClientHandoffIntent
}

export const clientAdapterCatalog: Record<BuiltInClientId, {
  adapterId: ClientAdapterId
  handoff?: ClientHandoffDescriptor
}> = {
  'claude-code': {
    adapterId: 'claude-code-terminal-v1',
    handoff: { clientId: 'claude-code', adapterId: 'claude-code-terminal-v1', intent: 'continue_workspace' },
  },
  'claude-desktop': { adapterId: 'claude-desktop-config-v1' },
  codex: {
    adapterId: 'codex-terminal-v1',
    handoff: { clientId: 'codex', adapterId: 'codex-terminal-v1', intent: 'continue_workspace' },
  },
  'gemini-cli': { adapterId: 'gemini-cli-terminal-v1' },
  'grok-build': { adapterId: 'grok-build-config-v1' },
  opencode: { adapterId: 'opencode-terminal-v1' },
  openclaw: { adapterId: 'openclaw-terminal-v1' },
  hermes: { adapterId: 'hermes-terminal-v1' },
  pi: { adapterId: 'pi-terminal-v1' },
}

export function handoffDescriptor(clientId: string): ClientHandoffDescriptor | undefined {
  return clientId in clientAdapterCatalog
    ? clientAdapterCatalog[clientId as BuiltInClientId].handoff
    : undefined
}
