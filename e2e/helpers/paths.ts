import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const tauriRoot = path.join(repoRoot, 'apps/desktop/src-tauri')
export const e2eRoot = path.join(repoRoot, 'e2e')
export const sandboxRoot = path.join(e2eRoot, '.sandbox')
export const sandboxHome = path.join(sandboxRoot, 'home')
export const sandboxRoamingData = path.join(sandboxRoot, 'appdata', 'roaming')
export const sandboxLocalData = path.join(sandboxRoot, 'appdata', 'local')
export const targetDir = path.join(sandboxRoot, 'target')
export const appBinaryPath = path.join(targetDir, 'release', process.platform === 'win32' ? 'bandi-desktop.exe' : 'bandi-desktop')
export const appDataPath = process.platform === 'win32'
  ? path.join(sandboxRoamingData, 'com.bandi.desktop.e2e')
  : process.platform === 'darwin'
    ? path.join(sandboxHome, 'Library', 'Application Support', 'com.bandi.desktop.e2e')
    : path.join(sandboxHome, '.local', 'share', 'com.bandi.desktop.e2e')
export const tauriConfigPath = path.join(tauriRoot, 'tauri.conf.json')
export const tauriE2eConfigPath = path.join(tauriRoot, 'tauri.e2e.conf.json')
