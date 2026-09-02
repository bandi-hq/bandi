import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import assetReferenceFixture from '../../../../packages/contracts/fixtures/asset-reference-graph.valid.json'
import backupFixture from '../../../../packages/contracts/fixtures/backup-local.valid.json'
import unknownHandoffRequest from '../../../../packages/contracts/fixtures/client-handoff/request.unknown-field.json'
import validHandoffRequest from '../../../../packages/contracts/fixtures/client-handoff/request.valid.json'
import degradedHandoffResult from '../../../../packages/contracts/fixtures/client-handoff/result.degraded.json'
import notCheckedHandoffResult from '../../../../packages/contracts/fixtures/client-handoff/result.not-checked.json'
import supportedHandoffResult from '../../../../packages/contracts/fixtures/client-handoff/result.supported.json'
import unavailableHandoffResult from '../../../../packages/contracts/fixtures/client-handoff/result.unavailable.json'
import memoryFixture from '../../../../packages/contracts/fixtures/memory-review.valid.json'
import organizationFixture from '../../../../packages/contracts/fixtures/organization-snapshot.valid.json'
import assetReferenceSchema from '../../../../packages/contracts/schemas/asset-reference-graph.schema.json'
import backupSchema from '../../../../packages/contracts/schemas/backup-local.schema.json'
import handoffSchema from '../../../../packages/contracts/schemas/client-handoff.schema.json'
import memorySchema from '../../../../packages/contracts/schemas/memory-review.schema.json'
import organizationSchema from '../../../../packages/contracts/schemas/organization-snapshot.schema.json'

function validator(schema: object) {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

describe('共享 JSON Schema', () => {
  it.each([
    ['共享资产引用图', assetReferenceSchema, assetReferenceFixture],
    ['本地备份', backupSchema, backupFixture],
    ['正式记忆', memorySchema, memoryFixture],
    ['组织快照', organizationSchema, organizationFixture],
  ])('%s 的有效 fixture 通过 Draft 2020-12 校验', (_name, schema, fixture) => {
    const validate = validator(schema)
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true)
  })

  it.each([
    ['请求', validHandoffRequest],
    ['supported 结果', supportedHandoffResult],
    ['degraded 结果', degradedHandoffResult],
    ['unavailable 结果', unavailableHandoffResult],
    ['not_checked 结果', notCheckedHandoffResult],
  ])('客户端交接%s通过联合 Schema 校验', (_name, fixture) => {
    const validate = validator(handoffSchema)
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true)
  })

  it('客户端交接拒绝未知字段 fixture', () => {
    const validate = validator(handoffSchema)
    expect(validate(unknownHandoffRequest)).toBe(false)
    expect(validate.errors?.some((error) => error.keyword === 'additionalProperties')).toBe(true)
  })

  it('正式记忆拒绝旧审核字段和不完整的审核主体', () => {
    const validate = validator(memorySchema)
    const oldField = structuredClone(memoryFixture)
    Object.assign(oldField.candidate, { reviewerAgentId: 'zhiheng' })
    expect(validate(oldField)).toBe(false)
    expect(validate.errors?.some((error) => error.keyword === 'additionalProperties')).toBe(true)

    const missingPrincipalId = structuredClone(memoryFixture)
    Object.assign(missingPrincipalId.reviewRequest, { expectedReviewPrincipal: { kind: 'chairman_user' } })
    expect(validate(missingPrincipalId)).toBe(false)
    expect(validate.errors?.some((error) => error.keyword === 'required')).toBe(true)
  })
})
