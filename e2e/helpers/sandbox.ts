import fs from 'node:fs/promises'
import { workspacePath } from './first-use-fixtures.js'
import { sandboxHome } from './paths.js'

export async function resetSandbox() {
  await fs.rm(sandboxHome, { force: true, recursive: true })
  await fs.mkdir(sandboxHome, { recursive: true })
  await fs.mkdir(workspacePath, { recursive: true })
}

export function sandboxEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: sandboxHome,
    XDG_CONFIG_HOME: `${sandboxHome}/.config`,
    XDG_DATA_HOME: `${sandboxHome}/.local/share`,
    XDG_CACHE_HOME: `${sandboxHome}/.cache`,
  }
}
