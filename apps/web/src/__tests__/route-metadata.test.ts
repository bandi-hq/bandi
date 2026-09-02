import { describe, expect, it } from 'vitest'
import { formatWindowTitle, resolveRouteMetadata } from '../route-metadata'

describe('route metadata', () => {
  it('统一配置概览标题并排除新建页的最近 Agent 身份', () => {
    expect(resolveRouteMetadata('/')).toEqual({ section: 'home', title: '配置概览' })
    expect(formatWindowTitle('配置概览')).toBe('配置概览 · Bandi')
    expect(resolveRouteMetadata('/agents/new')).toEqual({ section: 'agents', title: '创建个人 Agent' })
    expect(resolveRouteMetadata('/agents/new?mode=import')).toEqual({ section: 'agents', title: '导入 Claude Agent' })
    expect(resolveRouteMetadata('/agents/new?mode=reference')).toEqual({ section: 'agents', title: '仅登记外部引用' })
  })

  it('解析实体名称和主导航归属', () => {
    expect(resolveRouteMetadata('/agents/agent-a', {
      agents: [{ id: 'agent-a', name: '设计主管' }],
    })).toEqual({ section: 'agents', title: '设计主管', agentId: 'agent-a' })
  })

  it('根据组织页选择的部门解析标题', () => {
    const context = { departments: [{ id: 'dev', name: '研发部' }] }
    expect(resolveRouteMetadata('/organization?company=xinghe&department=dev', context)).toEqual({
      section: 'organization',
      title: '研发部',
    })
    expect(resolveRouteMetadata('/organization?department=missing', context)).toEqual({
      section: 'organization',
      title: '组织',
    })
  })

  it('统一工作区相关窗口标题', () => {
    const context = { workspaces: [{ id: 'bandi', name: 'Bandi' }] }
    expect(resolveRouteMetadata('/workspaces')).toEqual({ section: 'workspaces', title: '工作区' })
    expect(resolveRouteMetadata('/workspaces/new')).toEqual({ section: 'workspaces', title: '添加工作区' })
    expect(resolveRouteMetadata('/workspaces/bandi', context)).toEqual({ section: 'workspaces', title: 'Bandi' })
    expect(resolveRouteMetadata('/workspaces/missing', context)).toEqual({ section: 'workspaces', title: '工作区配置' })
  })

  it('将旧备份兼容路径归入设置', () => {
    expect(resolveRouteMetadata('/settings/backup')).toEqual({
      section: 'settings',
      title: '设置',
    })
    expect(formatWindowTitle('设置')).toBe('设置 · Bandi')
  })
})
