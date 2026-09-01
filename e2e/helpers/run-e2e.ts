import { repoRoot } from './paths.js'
import { run } from './process.js'
import { resetSandbox, sandboxEnv } from './sandbox.js'

await run('pnpm', ['--filter', '@bandi/desktop-e2e', 'build:app'], { cwd: repoRoot })

const baseEnv = {
  ...sandboxEnv(),
  // WebdriverIO 9 的 Undici dispatcher 与 Node 26 不兼容；原生 fetch 在受支持版本上行为一致。
  WDIO_USE_NATIVE_FETCH: '1',
}

await resetSandbox()
await run(
  'pnpm',
  ['--filter', '@bandi/desktop-e2e', 'exec', 'wdio', 'run', 'wdio.conf.ts', '--spec', 'specs/first-use-journey.spec.ts'],
  { cwd: repoRoot, env: baseEnv },
)
await run(
  'pnpm',
  ['--filter', '@bandi/desktop-e2e', 'exec', 'wdio', 'run', 'wdio.conf.ts', '--spec', 'specs/first-use-journey.spec.ts'],
  { cwd: repoRoot, env: { ...baseEnv, BANDI_E2E_VERIFY_ONLY: '1' } },
)

await resetSandbox()
await run(
  'pnpm',
  ['--filter', '@bandi/desktop-e2e', 'exec', 'wdio', 'run', 'wdio.conf.ts', '--spec', 'specs/fresh-restart.spec.ts'],
  { cwd: repoRoot, env: baseEnv },
)
