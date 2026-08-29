import type { SopStep } from './domain'

export function validateSopSteps(steps: SopStep[]) {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const [index, step] of steps.entries()) {
    const label = `步骤 ${index + 1}`
    if (!step.id.trim()) errors.push(`${label}缺少 ID。`)
    else if (ids.has(step.id)) errors.push(`步骤 ID“${step.id}”重复。`)
    ids.add(step.id)
    if (!step.title.trim()) errors.push(`${label}缺少标题。`)
    if (!step.owner.trim()) errors.push(`${label}缺少责任主体。`)
  }
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (dependency === step.id) errors.push(`步骤“${step.id}”不能依赖自身。`)
      else if (!ids.has(dependency)) errors.push(`步骤“${step.id}”依赖了不存在的“${dependency}”。`)
    }
  }
  const graph = new Map(steps.map((step) => [step.id, step.dependsOn.filter((id) => ids.has(id))]))
  const active = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    active.add(id)
    const cyclic = (graph.get(id) ?? []).some(visit)
    active.delete(id)
    visited.add(id)
    return cyclic
  }
  if (steps.some((step) => visit(step.id))) errors.push('步骤依赖存在循环引用。')
  return [...new Set(errors)]
}
