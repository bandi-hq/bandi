import type { NavigateFunction } from 'react-router-dom'
import type { Dispatch } from 'react'
import type { Action } from './state'
import type { EditorSession } from './editor-session'

export const appCommandIds = [
  'navigation.home',
  'navigation.agents',
  'navigation.organization',
  'navigation.workspaces',
  'navigation.assets',
  'navigation.settings',
  'theme.toggle',
  'editor.save',
  'editor.cancel',
] as const

export type AppCommandId = typeof appCommandIds[number]

const navigationTargets: Partial<Record<AppCommandId, string>> = {
  'navigation.home': '/',
  'navigation.agents': '/agents',
  'navigation.organization': '/organization',
  'navigation.workspaces': '/workspaces',
  'navigation.assets': '/assets',
  'navigation.settings': '/settings',
}

export function isAppCommandId(value: unknown): value is AppCommandId {
  return typeof value === 'string' && appCommandIds.includes(value as AppCommandId)
}

export function executeAppCommand(
  command: AppCommandId,
  context: {
    navigate: NavigateFunction
    dispatch: Dispatch<Action>
    editor?: EditorSession
  },
): boolean {
  const target = navigationTargets[command]
  if (target) {
    context.navigate(target)
    return true
  }
  if (command === 'theme.toggle') {
    context.dispatch({ type: 'THEME' })
    return true
  }
  if (command === 'editor.save' && context.editor?.canSave) {
    context.editor.save()
    return true
  }
  if (command === 'editor.cancel' && context.editor) {
    context.editor.cancel()
    return true
  }
  return false
}
