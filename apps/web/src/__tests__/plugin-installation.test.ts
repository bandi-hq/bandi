import { describe, expect, it } from 'vitest'
import { applyPluginAction, pluginInstallationStatusLabels, pluginScopeLabels, type PluginInstallation, type PluginScope } from '../plugin-installation'

const available: PluginInstallation = {
  pluginId: 'plugin-demo',
  scope: 'user',
  status: 'available',
  availableVersion: '2.0.0',
  previousVersions: [],
  compatible: true,
  componentsComplete: true,
  evidence: 'demo-fixture',
}

describe('PluginInstallation', () => {
  it.each(Object.keys(pluginScopeLabels) as PluginScope[])('在 %s 作用域安装、更新、回滚和卸载时只转换 Installation 事实', (scope) => {
    const installed = applyPluginAction({ ...available, scope }, 'install')!
    expect(installed).toMatchObject({ scope, status: 'installed', installedVersion: '2.0.0', evidence: 'memory-only' })

    const updateAvailable = { ...installed, status: 'update-available' as const, availableVersion: '3.0.0' }
    const updated = applyPluginAction(updateAvailable, 'update')!
    expect(updated).toMatchObject({ scope, status: 'installed', installedVersion: '3.0.0', previousVersions: ['2.0.0'] })

    const rolledBack = applyPluginAction({ ...updated, availableVersion: '3.0.0' }, 'rollback', '2.0.0')!
    expect(rolledBack).toMatchObject({ scope, status: 'update-available', installedVersion: '2.0.0', previousVersions: ['3.0.0'] })

    expect(applyPluginAction(rolledBack, 'uninstall')).toMatchObject({ scope, status: 'available', installedVersion: undefined })
  })

  it('定义完整的中文安装范围和状态标签', () => {
    expect(pluginScopeLabels).toEqual({ user: '用户', project: '项目', local: '本地', managed: '受管' })
    expect(pluginInstallationStatusLabels).toEqual({
      available: '未安装',
      installed: '已安装',
      'update-available': '可更新',
      incompatible: '不兼容',
    })
  })

  it('拒绝不兼容、不完整和不适用的动作', () => {
    expect(applyPluginAction({ ...available, compatible: false }, 'install')).toBeUndefined()
    expect(applyPluginAction({ ...available, componentsComplete: false }, 'install')).toBeUndefined()
    expect(applyPluginAction(available, 'update')).toBeUndefined()
    expect(applyPluginAction(available, 'rollback', '1.0.0')).toBeUndefined()
  })
})
