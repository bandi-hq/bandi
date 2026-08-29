import { describe, expect, it } from 'vitest'
import { projectAgentFileSource } from '../agent-file-source'
import { initialAgents, initialAssets, initialMemorySpaces, initialWorkspaces } from '../domain'

const agent = initialAgents.find((item) => item.id === 'zhouce')!
const context = { assets: initialAssets, workspaces: initialWorkspaces, memorySpaces: initialMemorySpaces }

describe('Agent 文件源码投影', () => {
  it('从结构化事实即时生成 Instructions', () => {
    const result = projectAgentFileSource({ ...agent, instructions: '当前内存正文' }, context, 'instructions.md')
    expect(result).toMatchObject({ status: 'available', provenance: 'demo-projection', language: 'markdown' })
    if (result.status === 'available') expect(result.content).toBe('当前内存正文')
  })

  it('稳定生成 Workspace 配置', () => {
    const result = projectAgentFileSource(agent, context, 'workspaces/bandi/config.yaml')
    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.content).toContain('workspaceId: "bandi"')
      expect(result.content).toContain('rules:')
      expect(result.content).not.toContain('刚刚')
    }
  })

  it('外部只读引用不伪造源码', () => {
    const external = { ...agent, packageSource: { kind: 'external-reference', externalPath: '/demo/agent', strategy: 'reference-only' } as const, instructions: '外部 Instructions 未读取；当前仅登记 AgentPackage 引用。' }
    const result = projectAgentFileSource(external, context, 'instructions.md')
    expect(result).toMatchObject({ status: 'unavailable', reason: 'external-reference' })
    if (result.status === 'unavailable') expect(result.message).not.toContain(external.instructions)
  })
})
