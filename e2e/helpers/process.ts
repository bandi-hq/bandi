import { spawn } from 'node:child_process'

export function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} 失败：code=${code ?? 'null'} signal=${signal ?? 'none'}`))
    })
  })
}
