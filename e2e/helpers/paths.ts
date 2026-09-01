import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const tauriRoot = path.join(repoRoot, 'apps/desktop/src-tauri')
export const e2eRoot = path.join(repoRoot, 'e2e')
export const sandboxRoot = path.join(e2eRoot, '.sandbox')
export const sandboxHome = path.join(sandboxRoot, 'home')
export const targetDir = path.join(sandboxRoot, 'target')
export const appBinaryPath = path.join(targetDir, 'release', 'bandi-desktop')
export const tauriConfigPath = path.join(tauriRoot, 'tauri.conf.json')
export const tauriE2eConfigPath = path.join(tauriRoot, 'tauri.e2e.conf.json')
