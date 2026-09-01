import fs from 'node:fs/promises'
import { appBinaryPath, repoRoot, targetDir, tauriConfigPath, tauriE2eConfigPath } from './paths.js'
import { run } from './process.js'

await fs.mkdir(targetDir, { recursive: true })
await run('pnpm', ['--filter', '@bandi/web', 'build'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_BANDI_E2E: '1' },
})
await run('pnpm', [
  'exec', 'tauri', 'build',
  '--no-bundle',
  '--features', 'e2e',
  '--config', tauriConfigPath,
  '--config', tauriE2eConfigPath,
], {
  cwd: repoRoot,
  env: { ...process.env, CARGO_TARGET_DIR: targetDir },
})
await fs.access(appBinaryPath)
console.log(`E2E binary: ${appBinaryPath}`)
