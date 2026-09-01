import type { Options } from '@wdio/types'
import type { TauriCapabilities } from '@wdio/tauri-service'
import { appBinaryPath, e2eRoot } from './helpers/paths.js'

export const config: Options.Testrunner & { capabilities: TauriCapabilities[] } = {
  runner: 'local',
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,
  logLevel: 'info',
  outputDir: `${e2eRoot}/.logs`,
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },
  services: [[
    '@wdio/tauri-service',
    {
      appBinaryPath,
      driverProvider: 'embedded',
      startTimeout: 90_000,
      captureBackendLogs: true,
      captureFrontendLogs: true,
      logDir: `${e2eRoot}/.logs`,
    },
  ]],
  capabilities: [{
    browserName: 'tauri',
    'tauri:options': {
      application: appBinaryPath,
    },
  }],
}
