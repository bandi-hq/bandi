import { isSafePathSegment } from './agent-config-model'
import type { ClientLaunchProfile, ConfigurationEnvironment } from './domain'

export type ConfigurationEnvironmentErrors = Partial<Record<'id' | 'name' | 'clientIds' | 'clientLaunchProfiles', string>>

const MAX_ARGUMENTS = 32
const MAX_ARGUMENT_LENGTH = 512
const MAX_ARGUMENTS_LENGTH = 4096
const executableNamePattern = /^[A-Za-z0-9._+-]+$/

export const defaultClaudeCodeLaunchProfile: ClientLaunchProfile = {
  version: 1,
  executable: 'claude',
  args: [],
  enterBandiOnStart: true,
}

export function normalizeClientLaunchProfile(profile: ClientLaunchProfile): ClientLaunchProfile {
  return {
    version: 1,
    executable: profile.executable.trim(),
    args: profile.args.map((argument) => argument.trim()).filter(Boolean),
    enterBandiOnStart: profile.enterBandiOnStart,
  }
}

export function clientLaunchProfileError(profile: ClientLaunchProfile): string | undefined {
  if (profile.version !== 1) return '启动配置版本不受支持。'
  if (!profile.executable || /[\0\r\n]/.test(profile.executable)) return '启动程序不能为空或包含换行。'
  const absolute = profile.executable.startsWith('/')
  if ((!absolute && !executableNamePattern.test(profile.executable)) || (absolute && profile.executable.split('/').includes('..'))) {
    return '启动程序必须是普通命令名或不含路径穿越的绝对路径。'
  }
  if (profile.args.length > MAX_ARGUMENTS) return `启动参数不能超过 ${MAX_ARGUMENTS} 项。`
  if (profile.args.some((argument) => !argument || argument.length > MAX_ARGUMENT_LENGTH || /[\0\r\n]/.test(argument))) {
    return '启动参数不能为空、包含换行或超过长度限制。'
  }
  if (profile.args.reduce((total, argument) => total + argument.length, 0) > MAX_ARGUMENTS_LENGTH) return '启动参数总长度超过限制。'
  return undefined
}

export function isHighRiskLaunchProfile(profile: ClientLaunchProfile): boolean {
  return profile.args.includes('--dangerously-skip-permissions')
    || profile.args.some((argument, index) => argument === 'bypassPermissions' && profile.args[index - 1] === '--permission-mode')
    || profile.executable.startsWith('/')
}

export function normalizeConfigurationEnvironment(environment: ConfigurationEnvironment): ConfigurationEnvironment {
  const clientIds = [...new Set(environment.clientIds.map((id) => id.trim()).filter(Boolean))].sort()
  const profiles = Object.fromEntries(
    Object.entries(environment.clientLaunchProfiles ?? {})
      .filter(([clientId]) => clientIds.includes(clientId))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([clientId, profile]) => [clientId, normalizeClientLaunchProfile(profile)]),
  )
  return {
    ...environment,
    id: environment.id.trim(),
    name: environment.name.trim(),
    clientIds,
    ...(Object.keys(profiles).length ? { clientLaunchProfiles: profiles } : { clientLaunchProfiles: undefined }),
  }
}

export function validateConfigurationEnvironment(
  environment: ConfigurationEnvironment,
  availableClientIds: string[],
): ConfigurationEnvironmentErrors {
  const errors: ConfigurationEnvironmentErrors = {}
  if (!isSafePathSegment(environment.id)) errors.id = '方案 ID 只能包含字母、数字、点、下划线和连字符。'
  if (!environment.name) errors.name = '请输入方案名称。'
  if (environment.clientIds.some((id) => !availableClientIds.includes(id))) errors.clientIds = '方案引用了不存在的 AI 编程工具。'
  const profiles = Object.entries(environment.clientLaunchProfiles ?? {})
  if (profiles.some(([clientId]) => !environment.clientIds.includes(clientId) || !availableClientIds.includes(clientId))) {
    errors.clientLaunchProfiles = '启动配置引用了未加入方案的 AI 编程工具。'
  } else if (profiles.some(([, profile]) => clientLaunchProfileError(profile))) {
    errors.clientLaunchProfiles = '启动程序或参数无效。'
  }
  return errors
}

export function configurationEnvironmentPath(environment: ConfigurationEnvironment): string | undefined {
  return isSafePathSegment(environment.id) ? `configuration-environments/${environment.id}.yaml` : undefined
}

export function serializeConfigurationEnvironment(environment: ConfigurationEnvironment, availableClientIds: string[]): string | undefined {
  const normalized = normalizeConfigurationEnvironment(environment)
  if (Object.keys(validateConfigurationEnvironment(normalized, availableClientIds)).length || !configurationEnvironmentPath(normalized)) return undefined
  const profiles = Object.entries(normalized.clientLaunchProfiles ?? {})
  return [
    `id: ${JSON.stringify(normalized.id)}`,
    `name: ${JSON.stringify(normalized.name)}`,
    'clientIds:',
    ...(normalized.clientIds.length ? normalized.clientIds.map((id) => `  - ${JSON.stringify(id)}`) : ['  []']),
    ...(profiles.length ? [
      'clientLaunchProfiles:',
      ...profiles.flatMap(([clientId, profile]) => [
        `  ${JSON.stringify(clientId)}:`,
        `    version: ${profile.version}`,
        `    executable: ${JSON.stringify(profile.executable)}`,
        '    args:',
        ...(profile.args.length ? profile.args.map((argument) => `      - ${JSON.stringify(argument)}`) : ['      []']),
        `    enterBandiOnStart: ${profile.enterBandiOnStart}`,
      ]),
    ] : []),
  ].join('\n')
}

function isClientLaunchProfile(value: unknown): value is ClientLaunchProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return candidate.version === 1
    && typeof candidate.executable === 'string'
    && Array.isArray(candidate.args)
    && candidate.args.every((argument) => typeof argument === 'string')
    && typeof candidate.enterBandiOnStart === 'boolean'
}

export function isConfigurationEnvironment(value: unknown): value is ConfigurationEnvironment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const profiles = candidate.clientLaunchProfiles
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.clientIds)
    && candidate.clientIds.every((id) => typeof id === 'string')
    && (profiles === undefined || (profiles !== null && typeof profiles === 'object' && !Array.isArray(profiles)
      && Object.values(profiles).every(isClientLaunchProfile)))
    && (candidate.evidence === 'demo-fixture' || candidate.evidence === 'memory-only')
}
