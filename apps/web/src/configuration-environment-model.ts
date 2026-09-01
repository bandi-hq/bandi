import { isSafePathSegment } from './agent-config-model'
import type { ConfigurationEnvironment } from './domain'

export type ConfigurationEnvironmentErrors = Partial<Record<'id' | 'name' | 'clientIds', string>>

export function normalizeConfigurationEnvironment(environment: ConfigurationEnvironment): ConfigurationEnvironment {
  return {
    ...environment,
    id: environment.id.trim(),
    name: environment.name.trim(),
    clientIds: [...new Set(environment.clientIds.map((id) => id.trim()).filter(Boolean))].sort(),
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
  return errors
}

export function configurationEnvironmentPath(environment: ConfigurationEnvironment): string | undefined {
  return isSafePathSegment(environment.id) ? `configuration-environments/${environment.id}.yaml` : undefined
}

export function serializeConfigurationEnvironment(environment: ConfigurationEnvironment, availableClientIds: string[]): string | undefined {
  const normalized = normalizeConfigurationEnvironment(environment)
  if (Object.keys(validateConfigurationEnvironment(normalized, availableClientIds)).length || !configurationEnvironmentPath(normalized)) return undefined
  return [
    `id: ${JSON.stringify(normalized.id)}`,
    `name: ${JSON.stringify(normalized.name)}`,
    'clientIds:',
    ...(normalized.clientIds.length ? normalized.clientIds.map((id) => `  - ${JSON.stringify(id)}`) : ['  []']),
  ].join('\n')
}

export function isConfigurationEnvironment(value: unknown): value is ConfigurationEnvironment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.clientIds)
    && candidate.clientIds.every((id) => typeof id === 'string')
    && (candidate.evidence === 'demo-fixture' || candidate.evidence === 'memory-only')
}
