import { describe, expect, it } from 'vitest'
import {
  isParameterBinding,
  isParameterDefinition,
  validateParameterBindings,
  type ParameterDefinition,
} from '../component-parameters'

const definitions: ParameterDefinition[] = [
  { id: 'title', label: '标题', type: 'string', required: true },
  { id: 'count', label: '数量', type: 'number', min: 1, max: 5 },
  { id: 'enabled', label: '启用', type: 'boolean' },
  { id: 'tags', label: '标签', type: 'string-list' },
  { id: 'tone', label: '语气', type: 'enum', options: ['brief', 'detailed'] },
]

describe('类型化非敏感参数', () => {
  it('接受五种支持类型并拒绝 secret/object 等类型', () => {
    expect(definitions.every(isParameterDefinition)).toBe(true)
    expect(isParameterDefinition({ id: 'secret', label: '密钥', type: 'secret' })).toBe(false)
    expect(isParameterDefinition({ id: 'payload', label: '对象', type: 'object' })).toBe(false)
    expect(isParameterBinding({ parameterId: 'enabled', type: 'boolean', value: true })).toBe(true)
    expect(isParameterBinding({ parameterId: 'cwd', type: 'string-list', value: [1] })).toBe(false)
  })

  it('校验必填、重复、未知、类型、范围和 enum', () => {
    const issues = validateParameterBindings(definitions, [
      { parameterId: 'count', type: 'number', value: 6 },
      { parameterId: 'count', type: 'number', value: 2 },
      { parameterId: 'tone', type: 'enum', value: 'unknown' },
      { parameterId: 'enabled', type: 'string', value: 'yes' },
      { parameterId: 'missing', type: 'string', value: 'x' },
    ])
    expect(issues.map((issue) => issue.message)).toEqual([
      '参数不能大于 5。',
      '参数不能重复绑定。',
      '参数值不在允许选项中。',
      '参数类型与定义不一致。',
      '参数定义不存在。',
      '缺少必填参数。',
    ])
  })
})
