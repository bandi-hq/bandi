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

  it('兼容旧 files 深链并使用规范 URL', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=files&path=config/rules.yaml'))
    expect(route.section).toBe('rules')
    expect(route.path).toBe('config/rules.yaml')
    expect(route.canonicalParams.toString()).toBe('tab=rules&path=config%2Frules.yaml&view=preview')
    expect(route.needsReplace).toBe(true)
  })

  it('非法路径不会回退冒充其他文件', () => {
    const route = resolveAgentConfigRoute(agent, new URLSearchParams('tab=instructions&path=../secret&view=source'))
    expect(route.path).toBeUndefined()
    expect(route.section).toBe('instructions')
    expect(route.notice).toContain('文件不存在或路径无效')
    expect(route.canonicalParams.toString()).toBe('tab=instructions')
  })
})
