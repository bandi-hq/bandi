import { describe, expect, it } from 'vitest'
import request from '../../../../packages/contracts/fixtures/client-handoff/request.valid.json'
import supported from '../../../../packages/contracts/fixtures/client-handoff/result.supported.json'
import notChecked from '../../../../packages/contracts/fixtures/client-handoff/result.not-checked.json'
import degraded from '../../../../packages/contracts/fixtures/client-handoff/result.degraded.json'
import unavailable from '../../../../packages/contracts/fixtures/client-handoff/result.unavailable.json'
import { clientAdapterCatalog } from '../client-adapters'
import type { ClientHandoffResult, RequestClientHandoff } from '../desktop-bridge'

function assertRequestShape(value: RequestClientHandoff) {
  expect(Object.keys(value).sort()).toEqual(['adapterId', 'clientId', 'intent', 'terminalId', 'workspaceId'])
}

function assertRequest(value: RequestClientHandoff) {
  assertRequestShape(value)
  expect(value).toEqual(request)
}

function assertResult(value: ClientHandoffResult) {
  assertRequestShape({ clientId: value.clientId, adapterId: value.adapterId, workspaceId: value.workspaceId, terminalId: value.terminalId, intent: value.intent })
  expect(['supported', 'degraded', 'unavailable', 'not_checked']).toContain(value.capability.status)
  expect(value.capability.reason).not.toBe('')
  expect(value.capability.evidence.every(Boolean)).toBe(true)
  expect(value.capability.remediation.every(Boolean)).toBe(true)
  expect(['accepted', 'manual_required', 'rejected', 'not_attempted']).toContain(value.outcome)
}

describe('客户端交接共享合同', () => {
  it('请求 fixture 恰好包含冻结五字段', () => assertRequest(request as RequestClientHandoff))

  it('结果 fixtures 覆盖四种能力状态', () => {
    for (const value of [supported, degraded, unavailable, notChecked]) {
      assertResult(value as ClientHandoffResult)
    }
    expect(supported.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect('acceptedAt' in notChecked).toBe(false)
  })

  it('静态 Adapter 目录覆盖九个内置工具且只启用已验证交接', () => {
    expect(Object.keys(clientAdapterCatalog)).toHaveLength(9)
    expect(clientAdapterCatalog['claude-code'].handoff).toEqual({
      clientId: 'claude-code',
      adapterId: 'claude-code-terminal-v1',
      intent: 'continue_workspace',
    })
    expect(clientAdapterCatalog.codex.handoff).toEqual({
      clientId: 'codex',
      adapterId: 'codex-terminal-v1',
      intent: 'continue_workspace',
    })
    expect(Object.values(clientAdapterCatalog).filter((item) => item.handoff)).toHaveLength(2)
  })
})
