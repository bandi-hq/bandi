export type TerminalId =
  | 'system'
  | 'terminal'
  | 'iterm2'
  | 'warp'
  | 'ghostty'
  | 'wezterm'
  | 'kitty'
  | 'alacritty'

type ConcreteTerminalId = Exclude<TerminalId, 'system'>
type TerminalOption = { id: ConcreteTerminalId; label: string }

const macTerminalOptions: ReadonlyArray<TerminalOption> = [
  { id: 'terminal', label: 'Terminal.app' },
  { id: 'iterm2', label: 'iTerm2' },
  { id: 'warp', label: 'Warp' },
  { id: 'ghostty', label: 'Ghostty' },
  { id: 'wezterm', label: 'WezTerm' },
  { id: 'kitty', label: 'Kitty' },
  { id: 'alacritty', label: 'Alacritty' },
]

const manualTerminalOption: TerminalOption = { id: 'terminal', label: '系统终端（手动）' }

export function isWindowsPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
}

export function terminalOptions(): ReadonlyArray<TerminalOption> {
  return isWindowsPlatform() ? [manualTerminalOption] : macTerminalOptions
}

export function normalizeTerminalId(id: TerminalId): ConcreteTerminalId {
  const normalized = id === 'system' ? 'terminal' : id
  return terminalOptions().some((item) => item.id === normalized) ? normalized : 'terminal'
}

export function terminalLabel(id: TerminalId): string {
  const normalizedId = normalizeTerminalId(id)
  return terminalOptions().find((item) => item.id === normalizedId)?.label ?? normalizedId
}
