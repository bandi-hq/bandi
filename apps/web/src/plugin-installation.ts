export type PluginInstallationStatus =
  | 'available'
  | 'installed'
  | 'update-available'
  | 'incompatible'

export type PluginScope = 'user' | 'project' | 'local' | 'managed'

export const pluginScopeLabels: Record<PluginScope, string> = {
  user: '用户',
  project: '项目',
  local: '本地',
  managed: '受管',
}

export const pluginInstallationStatusLabels: Record<PluginInstallationStatus, string> = {
  available: '未安装',
  installed: '已安装',
  'update-available': '可更新',
  incompatible: '不兼容',
}

export type PluginInstallation = {
  pluginId: string
  scope: PluginScope
  status: PluginInstallationStatus
  installedVersion?: string
  availableVersion: string
  previousVersions: string[]
  compatible: boolean
  componentsComplete: boolean
  evidence: 'demo-fixture' | 'memory-only'
}

export type PluginAction = 'install' | 'update' | 'rollback' | 'uninstall'

export function applyPluginAction(
  installation: PluginInstallation,
  action: PluginAction,
  version?: string,
): PluginInstallation | undefined {
  if (!installation.compatible || !installation.componentsComplete) return undefined
  if (action === 'install' && installation.status === 'available') {
    return { ...installation, status: 'installed', installedVersion: installation.availableVersion, evidence: 'memory-only' }
  }
  if (action === 'update' && installation.status === 'update-available' && installation.installedVersion) {
    return {
      ...installation,
      status: 'installed',
      previousVersions: [installation.installedVersion, ...installation.previousVersions.filter((item) => item !== installation.installedVersion)],
      installedVersion: installation.availableVersion,
      evidence: 'memory-only',
    }
  }
  if (action === 'rollback' && version && installation.installedVersion && installation.previousVersions.includes(version)) {
    return {
      ...installation,
      status: installation.availableVersion === version ? 'installed' : 'update-available',
      previousVersions: [installation.installedVersion, ...installation.previousVersions.filter((item) => item !== version && item !== installation.installedVersion)],
      installedVersion: version,
      evidence: 'memory-only',
    }
  }
  if (action === 'uninstall' && installation.status !== 'available') {
    return { ...installation, status: 'available', installedVersion: undefined, evidence: 'memory-only' }
  }
  return undefined
}
