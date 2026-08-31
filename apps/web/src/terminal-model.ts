export type TerminalId =
  | 'system'
  | 'terminal'
  | 'iterm2'
  | 'warp'
  | 'ghostty'
  | 'wezterm'
  | 'kitty'
  | 'alacritty'

export const terminalOptions: ReadonlyArray<{ id: Exclude<TerminalId, 'system'>; label: string }> = [
  { id: 'terminal', label: 'Terminal.app' },
  { id: 'iterm2', label: 'iTerm2' },
  { id: 'warp', label: 'Warp' },
  { id: 'ghostty', label: 'Ghostty' },
  { id: 'wezterm', label: 'WezTerm' },
  { id: 'kitty', label: 'Kitty' },
  { id: 'alacritty', label: 'Alacritty' },
]

export function normalizeTerminalId(id: TerminalId): Exclude<TerminalId, 'system'> {
  return id === 'system' ? 'terminal' : id
}

export function terminalLabel(id: TerminalId): string {
  const normalizedId = normalizeTerminalId(id)
  return terminalOptions.find((item) => item.id === normalizedId)?.label ?? normalizedId
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function buildLaunchArgs(args: string[], enterBandiOnStart: boolean): string[] {
  return enterBandiOnStart && !args.includes('/bandi:bandi') ? [...args, '/bandi:bandi'] : [...args]
}

export function buildLaunchCommand(cwd: string, executable: string, args: string[], enterBandiOnStart: boolean): string {
  const command = [executable, ...buildLaunchArgs(args, enterBandiOnStart)].map(shellQuote).join(' ')
  return `cd ${shellQuote(cwd)} && ${command}`
}

export function buildClaudeCommand(cwd: string): string {
  return buildLaunchCommand(cwd, 'claude', [], false)
}
