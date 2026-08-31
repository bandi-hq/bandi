export type ParameterDefinition =
  | { id: string; label: string; type: 'string'; required?: boolean }
  | { id: string; label: string; type: 'number'; required?: boolean; min?: number; max?: number }
  | { id: string; label: string; type: 'boolean'; required?: boolean }
  | { id: string; label: string; type: 'string-list'; required?: boolean }
  | { id: string; label: string; type: 'enum'; required?: boolean; options: string[] }

export type ParameterBinding =
  | { parameterId: string; type: 'string'; value: string }
  | { parameterId: string; type: 'number'; value: number }
  | { parameterId: string; type: 'boolean'; value: boolean }
  | { parameterId: string; type: 'string-list'; value: string[] }
  | { parameterId: string; type: 'enum'; value: string }

export type ParameterValidationIssue = {
  parameterId: string
  message: string
}

const supportedTypes = ['string', 'number', 'boolean', 'string-list', 'enum'] as const

export function isParameterDefinition(value: unknown): value is ParameterDefinition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || !candidate.id || typeof candidate.label !== 'string') return false
  if (!supportedTypes.includes(candidate.type as (typeof supportedTypes)[number])) return false
  if (candidate.required !== undefined && typeof candidate.required !== 'boolean') return false
  if (candidate.type === 'number') {
    if (candidate.min !== undefined && typeof candidate.min !== 'number') return false
    if (candidate.max !== undefined && typeof candidate.max !== 'number') return false
    if (typeof candidate.min === 'number' && typeof candidate.max === 'number' && candidate.min > candidate.max) return false
  }
  return candidate.type !== 'enum'
    || (Array.isArray(candidate.options)
      && candidate.options.length > 0
      && candidate.options.every((item) => typeof item === 'string'))
}

export function isParameterBinding(value: unknown): value is ParameterBinding {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.parameterId !== 'string' || !candidate.parameterId) return false
  switch (candidate.type) {
    case 'string':
    case 'enum':
      return typeof candidate.value === 'string'
    case 'number':
      return typeof candidate.value === 'number' && Number.isFinite(candidate.value)
    case 'boolean':
      return typeof candidate.value === 'boolean'
    case 'string-list':
      return Array.isArray(candidate.value) && candidate.value.every((item) => typeof item === 'string')
    default:
      return false
  }
}

export function validateParameterBindings(
  definitions: ParameterDefinition[],
  bindings: ParameterBinding[],
): ParameterValidationIssue[] {
  const issues: ParameterValidationIssue[] = []
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))
  const bindingById = new Map<string, ParameterBinding>()

  for (const binding of bindings) {
    if (bindingById.has(binding.parameterId)) {
      issues.push({ parameterId: binding.parameterId, message: '参数不能重复绑定。' })
      continue
    }
    bindingById.set(binding.parameterId, binding)
    const definition = definitionById.get(binding.parameterId)
    if (!definition) {
      issues.push({ parameterId: binding.parameterId, message: '参数定义不存在。' })
      continue
    }
    if (definition.type !== binding.type) {
      issues.push({ parameterId: binding.parameterId, message: '参数类型与定义不一致。' })
      continue
    }
    if (definition.type === 'number' && binding.type === 'number') {
      if (definition.min !== undefined && binding.value < definition.min) issues.push({ parameterId: binding.parameterId, message: `参数不能小于 ${definition.min}。` })
      if (definition.max !== undefined && binding.value > definition.max) issues.push({ parameterId: binding.parameterId, message: `参数不能大于 ${definition.max}。` })
    }
    if (definition.type === 'enum' && binding.type === 'enum' && !definition.options.includes(binding.value)) {
      issues.push({ parameterId: binding.parameterId, message: '参数值不在允许选项中。' })
    }
  }

  for (const definition of definitions) {
    if (definition.required && !bindingById.has(definition.id)) {
      issues.push({ parameterId: definition.id, message: '缺少必填参数。' })
    }
  }
  return issues
}
