export const MAIN_MENU_LAYOUT_STORAGE_KEY = 'bandi-main-menu-layout'

export type MainMenuLayoutPreference =
  | 'follow-window'
  | 'expanded'
  | 'compact'
  | 'hidden'

export type EffectiveMainMenuLayout =
  | 'hidden'
  | 'expanded'
  | 'compact'

export function parseMainMenuLayoutPreference(
  value: unknown,
): MainMenuLayoutPreference {
  return value === 'expanded' || value === 'compact'
    || value === 'follow-window' || value === 'hidden'
    ? value
    : 'follow-window'
}

export function resolveMainMenuLayout(
  preference: MainMenuLayoutPreference,
  isWideViewport: boolean,
  canFitExpandedMenu: boolean,
  hasRecentAgents = true,
): EffectiveMainMenuLayout {
  if (preference === 'hidden' || !hasRecentAgents) return 'hidden'
  if (preference === 'compact') return 'compact'
  if (preference === 'expanded') return canFitExpandedMenu ? 'expanded' : 'compact'
  return isWideViewport ? 'expanded' : 'compact'
}
