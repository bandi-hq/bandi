import { describe, expect, it } from 'vitest'
import { getFilesForAgentSection, getPrimarySectionForAgentFile, projectAgentFilePreview, resolveAgentConfigRoute } from '../agent-config-projection'
import { initialAgents, initialAssets, initialMemorySpaces, initialWorkspaces } from '../domain'

const agent = initialAgents.find((item) => item.id === 'zhouce')!
const context = { assets: initialAssets, workspaces: initialWorkspaces, memorySpaces: initialMemorySpaces }

describe('Agent 配置文件投影', () => {
  it('支持同一 Workspace 配置关联多个领域', () => {
    expect(getFilesForAgentSection(agent, 'instructions').map((item) => item.file.path)).toContain('workspaces/bandi/config.yaml')
    expect(getFilesForAgentSection(agent, 'rules').map((item) => item.file.path)).toContain('workspaces/bandi/config.yaml')
    expect(getFilesForAgentSection(agent, 'mcp').map((item) => item.file.path)).toContain('workspaces/bandi/config.yaml')
    expect(getPrimarySectionForAgentFile(agent, 'workspaces/bandi/config.yaml')).toBe('workspaces')
  })

  it('只投影已登记文件，不为缺失的 Workspace 虚构文件', () => {
    expect(getFilesForAgentSection(agent, 'workspaces').map((item) => item.file.path)).not.toContain('workspaces/card/config.yaml')
  })

  it('结构化预览随当前内存事实更新', () => {
    const changed = { ...agent, instructions: '新的演示正文' }
    expect(projectAgentFilePreview(changed, context, 'instructions.md')?.fields[0].value).toBe('新的演示正文')
  })

  it('AgentPackage 包含全部已登记文件', () => {
    expect(getFilesForAgentSection(agent, 'package').map((item) => item.file.path)).toEqual(
      expect.arrayContaining(['agent.yaml', 'instructions.md', 'workspaces/bandi/config.yaml']),
    )
  })

  it('AgentPackage 无路径时选择默认文件并规范 URL', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=package'))
    expect(route.section).toBe('package')
    expect(route.path).toBe('agent.yaml')
    expect(route.view).toBe('preview')
    expect(route.canonicalParams.toString()).toBe('tab=package&path=agent.yaml&view=preview')
  })

  it('AgentPackage 保留源码深链', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=package&path=config/rules.yaml&view=source'))
    expect(route.section).toBe('package')
    expect(route.path).toBe('config/rules.yaml')
    expect(route.view).toBe('source')
    expect(route.needsReplace).toBe(false)
  })

  it('兼容旧 files 深链并规范到 AgentPackage', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=files&path=config/rules.yaml'))
    expect(route.section).toBe('package')
    expect(route.path).toBe('config/rules.yaml')
    expect(route.canonicalParams.toString()).toBe('tab=package&path=config%2Frules.yaml&view=preview')
    expect(route.needsReplace).toBe(true)
  })

  it('非法路径不会回退冒充其他文件', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=instructions&path=../secret&view=source'))
    expect(route.path).toBeUndefined()
    expect(route.section).toBe('instructions')
    expect(route.notice).toContain('文件不存在或路径无效')
    expect(route.canonicalParams.toString()).toBe('tab=instructions')
  })

  it('AgentPackage 不存在路径返回目录模式且不冒充默认文件', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=package&path=missing.yaml&view=source'))
    expect(route.section).toBe('package')
    expect(route.path).toBeUndefined()
    expect(route.notice).toContain('文件不存在或路径无效')
    expect(route.canonicalParams.toString()).toBe('tab=package')
  })
})
