export type NavigationSection =
  | 'home'
  | 'agents'
  | 'organization'
  | 'workspaces'
  | 'assets'
  | 'settings'

export type RouteMetadata = {
  section: NavigationSection
  title: string
  agentId?: string
}

type NamedEntity = { id: string; name: string }

type RouteMetadataContext = {
  agents?: NamedEntity[]
  companies?: NamedEntity[]
  departments?: NamedEntity[]
  workspaces?: NamedEntity[]
  assets?: NamedEntity[]
}

const entityName = (
  pathname: string,
  prefix: string,
  entities: NamedEntity[] | undefined,
) => {
  const id = pathname.slice(prefix.length).split('/')[0]
  return entities?.find((item) => item.id === id)?.name
}

export function resolveRouteMetadata(
  location: string,
  context: RouteMetadataContext = {},
): RouteMetadata {
  const [pathname, search = ''] = location.split('?')
  if (pathname === '/') return { section: 'home', title: '配置概览' }
  if (pathname === '/agents/new') return { section: 'agents', title: '创建 Agent' }
  if (pathname.startsWith('/agents/')) {
    const agentId = pathname.slice('/agents/'.length).split('/')[0]
    const agent = context.agents?.find((item) => item.id === agentId)
    return { section: 'agents', title: agent?.name ?? 'Agent 配置', agentId: agent?.id }
  }
  if (pathname === '/agents') return { section: 'agents', title: 'Agent' }
  if (pathname.startsWith('/organization/companies/')) return { section: 'organization', title: entityName(pathname, '/organization/companies/', context.companies) ?? '公司详情' }
  if (pathname.startsWith('/organization/departments/')) return { section: 'organization', title: entityName(pathname, '/organization/departments/', context.departments) ?? '部门详情' }
  if (pathname === '/organization') {
    const departmentId = new URLSearchParams(search).get('department')
    const department = context.departments?.find((item) => item.id === departmentId)
    return { section: 'organization', title: department?.name ?? '组织' }
  }
  if (pathname.startsWith('/organization')) return { section: 'organization', title: '组织' }
  if (pathname === '/workspaces/new') return { section: 'workspaces', title: '添加工作区' }
  if (pathname.startsWith('/workspaces/')) return { section: 'workspaces', title: entityName(pathname, '/workspaces/', context.workspaces) ?? '工作区配置' }
  if (pathname === '/workspaces') return { section: 'workspaces', title: '工作区' }
  if (pathname === '/assets/skills') return { section: 'assets', title: '技能' }
  if (pathname.startsWith('/assets/')) return { section: 'assets', title: entityName(pathname, '/assets/', context.assets) ?? '资产详情' }
  if (pathname === '/assets') return { section: 'assets', title: '资产' }
  if (pathname.startsWith('/settings')) return { section: 'settings', title: '设置' }
  return { section: 'home', title: '配置管理' }
}

export function formatWindowTitle(title: string): string {
  return `${title} · Bandi`
}
