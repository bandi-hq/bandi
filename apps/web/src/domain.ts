import type { Agent, Asset, Department, Workspace } from './mock'
import type { AgentPackageSchema } from './agent-package-schema'
import type { ParameterBinding, ParameterDefinition } from './component-parameters'
import type { OrchestrationPolicy, OrchestrationPolicyOverride } from './orchestration-policy'
import type { PluginInstallation } from './plugin-installation'

export type AgentLifecycle = 'active' | 'inactive' | 'archived'

export type Role = {
  id: string
  companyId: string
  departmentId?: string
  name: string
  status: 'active' | 'archived'
  mission: string
  responsibilities: string[]
  inputs: string[]
  deliverables: string[]
  decisionBoundaries: string[]
  escalationConditions: string[]
  completionDefinition: string[]
}

export type ServiceGrant = {
  id: string
  departmentId: string
  capabilities: string[]
  workspaceIds: string[]
  prohibitions: string[]
  status: '有效' | '暂停'
}

export type EvidenceKind = 'demo-fixture' | 'memory-only'

export type ContextPolicy = {
  enabled: boolean
  triggerRatio: number
  targetRatio: number
  protectRecentTurns: number
  protectOpeningTurns: number
}

export type ContextPolicyOverride = Partial<ContextPolicy>

export type OutputProfileDefinition = {
  format: 'markdown' | 'json' | 'text'
  language: string
  requiredSections: string[]
  evidenceRequirement: string
  destination: 'response'
  parameters: ParameterDefinition[]
}

export type ComponentReference = {
  assetId: string
  parameterBindings: ParameterBinding[]
}

export type ConfigurationEnvironment = {
  id: string
  name: string
  clientIds: string[]
  evidence: EvidenceKind
}

export type WorkspaceBindingConfig = {
  workspaceId: string
  instructions: string
  ruleIds: string[]
  skillIds: string[]
  mcpIds: string[]
  contextPolicy?: ContextPolicyOverride
  outputProfileId?: string
  outputParameterBindings?: ParameterBinding[]
  orchestrationPolicy?: OrchestrationPolicyOverride
  hookRefs?: ComponentReference[]
  commandRefs?: ComponentReference[]
}

export type WorkspaceBinding = WorkspaceBindingConfig & {
  /** 正式记忆的只读派生事实，不进入普通 WorkspaceBinding 配置写入。 */
  memoryRevision: string
}

export type AgentPackageSource =
  | { kind: 'bandi-demo'; strategy: 'create-demo' }
  | { kind: 'bandi-managed'; packageId: string; strategy: 'managed'; identityBaseline?: string }
  | { kind: 'claude-agent-import'; packageId: string; strategy: 'managed-copy'; sourcePath: string; sourceBaselineHash: string; importedAt: string }
  | { kind: 'external-reference'; externalPath: string; strategy: 'reference-only' }

export type AgentFileScope =
  | { kind: 'agent-root' }
  | { kind: 'workspace'; workspaceId: string }

export type AgentFile = {
  path: string
  type: string
  status: string
  scope: AgentFileScope
  evidence?: EvidenceKind
  revision?: string
}

export type FullAgent = Omit<Agent, 'status'> & {
  roleId?: string
  status: AgentLifecycle
  packageSchema: AgentPackageSchema
  companyId?: string
  primaryDepartmentId?: string
  managerAgentId?: string
  mission: string
  responsibilities: string[]
  deliverables: string[]
  decisionBoundaries: string[]
  escalationConditions: string[]
  prohibitions: string[]
  completionDefinition: string[]
  serviceGrants: ServiceGrant[]
  packagePath: string
  packageSource: AgentPackageSource
  avatarPath?: 'avatar.png'
  instructions: string
  skillRefs: string[]
  ruleRefs: string[]
  mcpRefs: string[]
  contextPolicy: ContextPolicy
  contextWindowTokens: number
  outputProfileId?: string
  outputParameterBindings: ParameterBinding[]
  orchestrationPolicy: OrchestrationPolicy
  hookRefs: ComponentReference[]
  commandRefs: ComponentReference[]
  permissions: { files: string; commands: string; network: string; delegation: string }
  workspaceBindings: WorkspaceBinding[]
  sopRefs: string[]
  files: AgentFile[]
}

export type Company = {
  id: string
  name: string
  mission: string
  boundary: string
  assistantAgentId?: string
  departmentIds: string[]
  workspaceIds: string[]
  sharedAssetIds: string[]
}

export type FullDepartment = Department & {
  companyId: string
  parentDepartmentId?: string
  managerAgentId?: string
  responsibilities: string[]
  boundaries: string[]
  delegationDepth: number
  memberAgentIds: string[]
  ownedSopIds: string[]
}

export type WorkspaceFile = { path: string; type: string; status: string; evidence?: EvidenceKind }
export type FullWorkspace = Workspace & {
  companyId?: string
  primaryDepartmentId?: string
  projectLeadAgentId?: string
  collaboratorDepartmentIds: string[]
  health: '配置完整' | '外部变化' | '配置缺失' | '未验证'
  agentIds: string[]
  assetIds: string[]
  publicMemorySpaceId: string
  departmentMemorySpaceIds: string[]
  files: WorkspaceFile[]
  recentEdits: { label: string; target: string; time: string }[]
}

export type AssetKind = 'Skill' | 'Memory' | 'Rules' | 'MCP' | 'SOP' | 'CLAUDE.md' | 'Settings' | 'Hook' | 'Command' | 'OutputProfile' | 'Plugin'
export type AssetReference = { type: 'Agent' | 'Workspace' | 'Department'; id: string; label: string }
export type SopStep = { id: string; title: string; objective: string; input: string; output: string; owner: string; dependsOn: string[] }
export type SkillSource =
  | { kind: 'local'; path: string }
  | { kind: 'git'; repository: string; ref: string; subdirectory?: string }
  | { kind: 'marketplace'; provider: string; listingId: string; mockCatalog: true }
export type SkillInstallation = {
  status: 'available' | 'installed' | 'update-available'
  installedVersion?: string
  availableVersion: string
  previousVersions: string[]
}
export type SkillDetails = {
  source: SkillSource
  delivery: { kind: 'standalone' } | { kind: 'plugin'; pluginAssetId: string }
  installation: SkillInstallation
  review: { permissions: string[]; impact: string[]; files: string[] }
}
export type HookDefinition = {
  schemaVersion: 1
  event: string
  purpose: string
  parameters: ParameterDefinition[]
  pluginAssetId?: string
}

export type CommandDefinition = {
  schemaVersion: 1
  commandId: string
  purpose: string
  parameters: ParameterDefinition[]
  pluginAssetId?: string
}

export type PluginDetails = {
  schemaVersion: 1
  componentAssetIds: string[]
}

export type FullAsset = Asset & {
  kind: AssetKind
  companyId?: string
  sourceType: 'Bandi 自有' | '显式共享' | '跨公司授权' | '外部来源'
  summary: string
  content: string
  references: AssetReference[]
  version?: string
  objective?: string
  steps?: SopStep[]
  responsibilities?: string[]
  approvalConditions?: string[]
  escalationConditions?: string[]
  skill?: SkillDetails
  hook?: HookDefinition
  command?: CommandDefinition
  outputProfile?: OutputProfileDefinition
  plugin?: PluginDetails
}

export type ConfigRevision = {
  id: string
  ownerType: 'agent' | 'asset' | 'role' | 'configuration-environment'
  ownerId: string
  path: string
  parentRevisionId?: string
  restoredFromRevisionId?: string
  content: string
  contentHash: string
  savedAt: string
  summary: string
  evidence: EvidenceKind
  payload?: unknown
}

export type MemoryScopeType = 'Agent 长期' | 'Agent × Workspace' | 'Workspace 公共' | 'Department × Workspace'
export type MemoryReviewPrincipal =
  | { kind: 'agent'; agentId: string }
  | { kind: 'chairman_user'; companyId: string }

export type MemorySpace = {
  id: string
  scopeType: MemoryScopeType
  scopeKey:
    | { kind: 'agent_long_term'; agentId: string }
    | { kind: 'agent_workspace'; agentId: string; workspaceId: string }
    | { kind: 'workspace_shared'; workspaceId: string }
    | { kind: 'department_workspace'; departmentId: string; workspaceId: string }
  owner: string
  steward: string
  reviewer: string
  reviewPrincipal?: MemoryReviewPrincipal
  revision: string
  path: string
}
export type MemoryCandidateStatus = '待审核' | '要求修改' | '已驳回' | '已批准' | '已写入演示 Revision' | '已写入正式 Revision'
export type MemoryCandidate = {
  id: string
  spaceId: string
  proposerAgentId: string
  reviewPrincipal: MemoryReviewPrincipal
  summary: string
  current: string
  proposed: string
  status: MemoryCandidateStatus
}

export type BackupScope =
  | { kind: 'all' }
  | { kind: 'company'; companyId: string }
  | { kind: 'agent'; agentId: string }
  | { kind: 'files'; paths: string[] }

export type BackupSnapshot = {
  id: string
  createdAt: string
  kind: '手动演示' | '恢复前演示'
  scope: BackupScope
  includes: string[]
  excludes: string[]
  localPath: string
  deviceName: string
  hash: string
  integrity: 'demo-verified' | 'demo-unverified'
  remoteStatus: 'local-only' | 'private-git-not-connected' | 'private-git-demo-synced' | 'private-git-demo-failed'
  includesFormalMemory: boolean
}

const rootScope: AgentFileScope = { kind: 'agent-root' }
const defaultFiles = (id: string): AgentFile[] => [
  { path: 'agent.yaml', type: '稳定身份与状态', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope, revision: 'r1' },
  { path: 'soul.md', type: '长期行为原则', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope },
  { path: 'instructions.md', type: '主 Instructions', status: id === 'zhouce' ? '外部变化（演示）' : '预置演示资料', evidence: 'demo-fixture', scope: rootScope, revision: 'r8' },
  { path: 'config/rules.yaml', type: 'Rule 配置与引用', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope },
  { path: 'config/skills.yaml', type: 'Skill 配置与引用', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope },
  { path: 'config/context.yaml', type: '上下文与输出格式', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope },
  { path: 'config/orchestration.yaml', type: '长期协作与委派边界', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope },
  { path: 'memory/long-term.md', type: '长期正式记忆', status: '预置演示资料', evidence: 'demo-fixture', scope: rootScope, revision: 'r18' },
  { path: 'workspaces/bandi/config.yaml', type: '工作区专属配置', status: '预置演示资料', evidence: 'demo-fixture', scope: { kind: 'workspace', workspaceId: 'bandi' }, revision: 'r7' },
  { path: 'workspaces/bandi/memory.md', type: '工作区专属记忆', status: '预置演示资料', evidence: 'demo-fixture', scope: { kind: 'workspace', workspaceId: 'bandi' }, revision: 'r7' },
]

const roleIdByAgentId: Record<string, string> = {
  zhiheng: 'role-chair-assistant',
  zhouce: 'role-dev-lead',
  linxu: 'role-web-engineer',
  songyan: 'role-code-reviewer',
}

const lifecycleByStatus: Record<Agent['status'], AgentLifecycle> = {
  启用: 'active',
  停用: 'inactive',
  归档: 'archived',
}

const baseAgent = (agent: Agent, details: Partial<FullAgent>): FullAgent => {
  const { role: roleName, status, ...legacyAgent } = agent
  return {
  ...legacyAgent,
  role: roleName,
  roleId: roleIdByAgentId[agent.id] ?? 'role-unassigned',
  status: lifecycleByStatus[status],
  packageSchema: { schemaVersion: 1, compatibility: 'current' },
  companyId: 'xinghe',
  mission: '依据职责边界完成可验证的配置交付，并向直属主管汇报。',
  responsibilities: ['维护本岗位配置资产', '按明确授权服务相关工作区'],
  deliverables: ['配置变更与验证证据'],
  decisionBoundaries: ['不扩大自身权限', '不批准产品范围变化'],
  escalationConditions: ['权限不足', '目标冲突', '跨部门依赖无法解决'],
  prohibitions: ['不得写入未授权目录', '不得泄露凭据'],
  completionDefinition: ['结果可验证', '异常已升级'],
  serviceGrants: [],
  packagePath: `~/.bandi/agents/agt_${agent.id}/`,
  packageSource: { kind: 'bandi-demo', strategy: 'create-demo' },
  instructions: `你是${roleName}。负责${agent.department}相关职责，并把结果以可验证方式向直属主管汇报。\n\n不得自行扩大权限；遇到目标冲突或跨部门依赖时及时升级。`,
  skillRefs: ['skill-review'],
  ruleRefs: ['rule-common'],
  mcpRefs: ['mcp-bandi'],
  contextPolicy: { enabled: true, triggerRatio: 0.8, targetRatio: 0.5, protectRecentTurns: 6, protectOpeningTurns: 2 },
  contextWindowTokens: 200_000,
  outputProfileId: 'output-verifiable-delivery',
  outputParameterBindings: [{ parameterId: 'include-summary', type: 'boolean', value: true }],
  orchestrationPolicy: {
    enabled: true,
    maxDelegationDepth: 1,
    allowedAgentIds: [],
    allowedRoleIds: [],
    allowedDepartmentIds: [],
    requireWorkspaceBinding: true,
    requireSopMatch: true,
    requireServiceGrantForCrossDepartment: true,
    escalationAgentId: 'zhiheng',
    escalationConditions: ['无合法候选', '权限不足'],
    prohibitions: ['不得委派给停用或归档 Agent', '不得扩大权限'],
  },
  hookRefs: [],
  commandRefs: [],
  permissions: { files: '仅当前工作区', commands: '构建、测试与版本控制', network: '仅已配置 MCP', delegation: '仅明确服务授权范围' },
  workspaceBindings: [],
  sopRefs: ['sop-delivery'],
  files: defaultFiles(agent.id),
  ...details,
}}

export const initialConfigurationEnvironments: ConfigurationEnvironment[] = [
  {
    id: 'personal',
    name: '个人配置',
    clientIds: ['claude-code'],
    evidence: 'demo-fixture',
  },
  {
    id: 'team-demo',
    name: '团队配置（演示）',
    clientIds: ['claude-code', 'codex'],
    evidence: 'demo-fixture',
  },
]

export const initialCompanies: Company[] = [
  { id: 'xinghe', name: '星河科技', mission: '以清晰的产品判断和可靠的软件交付创造长期价值。', boundary: '公司身份与组织关系不自动授予文件、命令、网络或委派权限。', assistantAgentId: 'zhiheng', departmentIds: ['office', 'prd', 'product', 'dev', 'test'], workspaceIds: ['bandi', 'card'], sharedAssetIds: ['rule-common', 'skill-review', 'sop-delivery'] },
  { id: 'studio', name: '独立工作室', mission: '支持独立研究与实验性配置。', boundary: '与星河科技资产完全隔离，跨公司共享需单独注册授权。', departmentIds: ['studio-research'], workspaceIds: ['lab'], sharedAssetIds: [] },
]

export const initialRoles: Role[] = [
  { id: 'role-chair-assistant', companyId: 'xinghe', departmentId: 'office', name: '董事长助理', status: 'active', mission: '协调董事长目标并汇总跨部门结果。', responsibilities: ['目标澄清', '跨部门协调'], inputs: ['董事长目标', '主管汇报'], deliverables: ['协调摘要', '最终汇总'], decisionBoundaries: ['不代替董事长做最终决策'], escalationConditions: ['目标冲突', '权限不足'], completionDefinition: ['结果已验证并完成汇总'] },
  { id: 'role-dev-lead', companyId: 'xinghe', departmentId: 'dev', name: '软件开发部主管', status: 'active', mission: '把已确认目标交付为可验证软件。', responsibilities: ['技术方案', '研发交付'], inputs: ['确认后的产品目标'], deliverables: ['软件成果', '验证证据'], decisionBoundaries: ['不改变产品范围'], escalationConditions: ['跨部门依赖无法解决'], completionDefinition: ['实现和验证均完成'] },
  { id: 'role-web-engineer', companyId: 'xinghe', departmentId: 'dev', name: 'Web 工程师', status: 'active', mission: '实现清晰可靠的 Web 界面。', responsibilities: ['前端实现', '界面验证'], inputs: ['交互与技术方案'], deliverables: ['前端代码', '验证证据'], decisionBoundaries: ['不自行扩大权限'], escalationConditions: ['目标或交互存在冲突'], completionDefinition: ['界面通过自动与真实浏览器验证'] },
  { id: 'role-code-reviewer', companyId: 'xinghe', departmentId: 'test', name: '代码审查', status: 'active', mission: '验证代码正确性和可维护性。', responsibilities: ['代码审查', '风险识别'], inputs: ['代码变更', '验证结果'], deliverables: ['审查结论'], decisionBoundaries: ['不替代业务验收'], escalationConditions: ['发现高风险缺陷'], completionDefinition: ['结论具有可复现证据'] },
]

export const initialDepartments: FullDepartment[] = [
  { id: 'office', name: '董事长办公室', companyId: 'xinghe', manager: '知衡', managerAgentId: 'zhiheng', mission: '公司目标协调、跨部门升级与决策摘要', members: 1, responsibilities: ['目标协调', '跨部门汇总'], boundaries: ['不代替董事长做最终决策'], delegationDepth: 2, memberAgentIds: ['zhiheng'], ownedSopIds: [] },
  { id: 'prd', name: '产品与研发中心', companyId: 'xinghe', mission: '从产品判断到可验证的软件交付', members: 9, responsibilities: ['产品与研发协同'], boundaries: ['不隐式继承配置'], delegationDepth: 2, memberAgentIds: [], ownedSopIds: ['sop-delivery'] },
  { id: 'product', name: '产品部', companyId: 'xinghe', parent: 'prd', parentDepartmentId: 'prd', manager: '安澜', mission: '产品定义、范围与体验质量', members: 3, responsibilities: ['产品定义', '体验验收'], boundaries: ['不批准生产操作'], delegationDepth: 1, memberAgentIds: [], ownedSopIds: ['sop-delivery'] },
  { id: 'dev', name: '研发部', companyId: 'xinghe', parent: 'prd', parentDepartmentId: 'prd', manager: '周策', managerAgentId: 'zhouce', mission: '软件架构、研发交付与质量', members: 3, responsibilities: ['架构设计', '研发交付'], boundaries: ['不改变已确认产品范围'], delegationDepth: 2, memberAgentIds: ['zhouce', 'linxu', 'songyan'], ownedSopIds: ['sop-delivery'] },
  { id: 'test', name: '测试部', companyId: 'xinghe', parent: 'prd', parentDepartmentId: 'prd', manager: '宋研', managerAgentId: 'songyan', mission: '质量策略与发布验证', members: 2, responsibilities: ['测试策略', '发布验证'], boundaries: ['不替代业务验收'], delegationDepth: 1, memberAgentIds: ['songyan'], ownedSopIds: [] },
  { id: 'studio-research', name: '研究组', companyId: 'studio', mission: '独立研究与原型验证', members: 0, responsibilities: ['研究验证'], boundaries: ['不使用其他公司资产'], delegationDepth: 1, memberAgentIds: [], ownedSopIds: [] },
]

export const initialAgents: FullAgent[] = [
  baseAgent({ id: 'zhiheng', name: '知衡', role: '董事长助理', department: '董事长办公室', status: '启用', workspaces: 2, config: '配置完整', updated: '2 小时前' }, { primaryDepartmentId: 'office', mission: '协调董事长目标，按需委派主管并汇总结果。', responsibilities: ['目标澄清', '跨部门协调', '结果汇总'], workspaceBindings: [{ workspaceId: 'bandi', instructions: '协调 Bandi 项目目标与跨部门升级。', ruleIds: ['rule-common'], skillIds: [], mcpIds: ['mcp-bandi'], memoryRevision: 'r12' }] }),
  baseAgent({ id: 'zhouce', name: '周策', role: '软件开发部主管', department: '研发部', service: '测试部', status: '启用', workspaces: 2, config: '外部变化', updated: '8 分钟前' }, { primaryDepartmentId: 'dev', managerAgentId: 'zhiheng', mission: '把已确认产品目标交付为可验证的软件成果。', serviceGrants: [{ id: 'grant-test', departmentId: 'test', capabilities: ['代码质量', '缺陷修复'], workspaceIds: ['bandi'], prohibitions: ['不得批准生产发布'], status: '有效' }], workspaceBindings: [{ workspaceId: 'bandi', instructions: '负责 Bandi 技术方案、实现和验证。', ruleIds: ['rule-common'], skillIds: ['skill-review'], mcpIds: ['mcp-bandi'], memoryRevision: 'r7' }, { workspaceId: 'card', instructions: '负责名片岛 Web 研发交付。', ruleIds: ['rule-common'], skillIds: [], mcpIds: [], memoryRevision: 'r3' }] }),
  baseAgent({ id: 'linxu', name: '林序', role: 'Web 工程师', department: '研发部', service: '市场部', status: '启用', workspaces: 2, config: '缺少 Rules', updated: '昨天' }, { primaryDepartmentId: 'dev', managerAgentId: 'zhouce', workspaceBindings: [{ workspaceId: 'bandi', instructions: '负责前端界面实现。', ruleIds: [], skillIds: ['skill-review'], mcpIds: [], memoryRevision: 'r4' }] }),
  baseAgent({ id: 'songyan', name: '宋研', role: '代码审查', department: '研发部', status: '归档', workspaces: 1, config: '配置完整', updated: '3 天前' }, { primaryDepartmentId: 'test', managerAgentId: 'zhouce' }),
]

export const initialWorkspaces: FullWorkspace[] = [
  { id: 'bandi', name: 'Bandi', path: '/Volumes/wwx/org/bandi', company: '星河科技', department: '研发部', companyId: 'xinghe', primaryDepartmentId: 'dev', projectLeadAgentId: 'zhouce', collaboratorDepartmentIds: ['product', 'test'], config: '外部变化 1', health: '外部变化', agentIds: ['zhiheng', 'zhouce', 'linxu'], assetIds: ['sop-delivery', 'rule-common', 'skill-review', 'mcp-bandi'], publicMemorySpaceId: 'mem-ws-bandi', departmentMemorySpaceIds: ['mem-dev-bandi'], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }, { path: '.claude/settings.json', type: '项目共享设置', status: '外部变化' }, { path: '.claude/settings.local.json', type: '项目本地设置', status: '已索引' }, { path: '.mcp.json', type: '项目共享 MCP', status: '已索引' }], recentEdits: [{ label: '周策 / Instructions', target: '/agents/zhouce?tab=instructions', time: '8 分钟前' }] },
  { id: 'card', name: '名片岛 Web', path: '~/Projects/card-web', company: '星河科技', department: '产品部', companyId: 'xinghe', primaryDepartmentId: 'product', projectLeadAgentId: 'zhouce', collaboratorDepartmentIds: ['dev'], config: '配置缺失 2', health: '配置缺失', agentIds: ['zhiheng', 'zhouce'], assetIds: ['rule-common'], publicMemorySpaceId: 'mem-ws-card', departmentMemorySpaceIds: [], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }], recentEdits: [] },
  { id: 'lab', name: '独立研究', path: '~/Research/lab', companyId: 'studio', primaryDepartmentId: 'studio-research', collaboratorDepartmentIds: [], config: '配置完整', health: '配置完整', agentIds: [], assetIds: [], publicMemorySpaceId: 'mem-ws-lab', departmentMemorySpaceIds: [], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }], recentEdits: [] },
]

export const initialAssets: FullAsset[] = [
  { id: 'output-verifiable-delivery', name: '可验证交付', kind: 'OutputProfile', owner: '星河科技', companyId: 'xinghe', scope: '公司共享', refs: 4, path: '~/.bandi/shared/output-profiles/verifiable-delivery.yaml', status: '已保存', sourceType: '显式共享', summary: '统一要求响应包含结果、验证与风险证据。', content: '', references: [], outputProfile: { format: 'markdown', language: 'zh-CN', requiredSections: ['结果', '验证', '风险'], evidenceRequirement: '所有完成声明必须附带最新验证证据。', destination: 'response', parameters: [{ id: 'include-summary', label: '包含摘要', type: 'boolean' }] } },
  { id: 'hook-config-saved', name: '配置保存声明', kind: 'Hook', owner: 'Productivity Plugin', scope: '用户级', refs: 0, path: 'plugin://productivity/hooks/config-saved', status: '演示已安装', sourceType: '外部来源', summary: '声明配置保存后的长期通知用途；Web mock 不执行。', content: '', references: [], hook: { schemaVersion: 1, event: 'config-saved', purpose: '向已接入客户端声明配置变更事件。', parameters: [{ id: 'include-path', label: '包含配置路径', type: 'boolean' }], pluginAssetId: 'plugin-productivity' } },
  { id: 'command-config-audit', name: '配置审计命令', kind: 'Command', owner: 'Productivity Plugin', scope: '用户级', refs: 0, path: 'plugin://productivity/commands/config-audit', status: '演示已安装', sourceType: '外部来源', summary: '登记 Claude Code 命令定义；Web mock 不执行。', content: '', references: [], command: { schemaVersion: 1, commandId: 'config-audit', purpose: '检查长期配置引用和兼容性。', parameters: [{ id: 'scope', label: '检查范围', type: 'enum', options: ['agent', 'workspace'] }], pluginAssetId: 'plugin-productivity' } },
  { id: 'sop-delivery', name: '软件功能交付', kind: 'SOP', owner: '产品与研发', companyId: 'xinghe', scope: '部门级', refs: 7, path: '.claude/sops/software-delivery.md', status: '已保存', sourceType: '显式共享', summary: '从确认目标到附带验证证据的软件交付定义。', content: '', version: 'v4', objective: '把确认的产品目标交付为可验证软件。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }, { type: 'Department', id: 'dev', label: '研发部' }, { type: 'Workspace', id: 'bandi', label: 'Bandi' }], steps: [{ id: 'clarify', title: '澄清目标', objective: '确认范围和验收标准', input: '产品目标', output: '确认后的范围', owner: '产品部 / 产品岗位', dependsOn: [] }, { id: 'design', title: '技术方案', objective: '形成可实施方案', input: '确认后的范围', output: '技术方案', owner: '研发部 / 主管岗位', dependsOn: ['clarify'] }, { id: 'deliver', title: '实现与验证', objective: '交付带验证证据的软件', input: '技术方案', output: '软件与验证证据', owner: '研发部 / 工程岗位', dependsOn: ['design'] }], responsibilities: ['产品部定义范围', '研发部实现与验证'], approvalConditions: ['涉及既定权限边界或生产操作'], escalationConditions: ['目标、范围或验收标准需要重新确认'] },
  { id: 'rule-common', name: '公共安全边界', kind: 'Rules', owner: '星河科技', companyId: 'xinghe', scope: '公司共享', refs: 6, path: '~/.bandi/shared/rules/common.md', status: '已保存', sourceType: '显式共享', summary: '所有 Agent 不可突破的公司安全边界。', content: '禁止泄露凭据；生产发布必须确认；权限只能收紧，不能自行扩大。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }, { type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'skill-review', name: '代码审查', kind: 'Skill', owner: '研发部', companyId: 'xinghe', scope: '公司共享', refs: 4, path: '~/.bandi/shared/skills/code-review', status: '演示已安装', sourceType: '显式共享', summary: '代码正确性与可维护性审查能力。', content: '按正确性、安全性、复杂度和验证证据进行审查。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }], skill: { source: { kind: 'local', path: '~/.bandi/shared/skills/code-review' }, delivery: { kind: 'standalone' }, installation: { status: 'installed', installedVersion: '1.4.0', availableVersion: '1.4.0', previousVersions: ['1.3.0'] }, review: { permissions: ['读取当前工作区代码'], impact: ['生成审查建议，不执行修改'], files: ['SKILL.md', 'references/checklist.md'] } } },
  { id: 'skill-release', name: '发布检查', kind: 'Skill', owner: '研发部', companyId: 'xinghe', scope: '公司共享', refs: 1, path: '~/.bandi/shared/skills/release-check', status: '有演示更新', sourceType: '显式共享', summary: '发布前检查配置、测试与变更说明。', content: '预置 Git 来源 Skill。', references: [], skill: { source: { kind: 'git', repository: 'github.com/example/release-check', ref: 'v2.2.0' }, delivery: { kind: 'standalone' }, installation: { status: 'update-available', installedVersion: '2.1.0', availableVersion: '2.2.0', previousVersions: ['2.0.0'] }, review: { permissions: ['读取构建与测试结果'], impact: ['不执行发布'], files: ['SKILL.md'] } } },
  { id: 'skill-docs', name: '文档整理', kind: 'Skill', owner: '预置目录', scope: '可浏览', refs: 0, path: 'marketplace://demo/docs-organizer', status: '可演示安装', sourceType: '外部来源', summary: '整理项目文档结构和摘要。', content: '预置 Marketplace Mock 内容。', references: [], skill: { source: { kind: 'marketplace', provider: 'Bandi 预置目录', listingId: 'docs-organizer', mockCatalog: true }, delivery: { kind: 'standalone' }, installation: { status: 'available', availableVersion: '1.0.0', previousVersions: [] }, review: { permissions: ['读取显式选择的文档'], impact: ['可能生成文档修改建议'], files: ['SKILL.md'] } } },
  { id: 'plugin-productivity', name: 'Productivity Plugin', kind: 'Plugin', owner: '预置目录', scope: '用户级', refs: 0, path: 'marketplace://demo/productivity', status: '演示已安装', sourceType: '外部来源', summary: '提供一组配置辅助组件的预置 Plugin。', content: '', references: [], plugin: { schemaVersion: 1, componentAssetIds: ['skill-planning', 'hook-config-saved', 'command-config-audit'] } },
  { id: 'skill-planning', name: '方案规划', kind: 'Skill', owner: 'Productivity Plugin', scope: '用户级', refs: 0, path: 'plugin://productivity/planning', status: '演示已安装', sourceType: '外部来源', summary: '由预置 Plugin 提供的方案规划 Skill。', content: '', references: [], skill: { source: { kind: 'marketplace', provider: 'Bandi 预置目录', listingId: 'productivity/planning', mockCatalog: true }, delivery: { kind: 'plugin', pluginAssetId: 'plugin-productivity' }, installation: { status: 'installed', installedVersion: '1.1.0', availableVersion: '1.1.0', previousVersions: [] }, review: { permissions: ['读取用户提供的配置上下文'], impact: ['只生成规划建议'], files: ['skills/planning/SKILL.md'] } } },
  { id: 'mcp-bandi', name: 'Bandi MCP', kind: 'MCP', owner: '系统', scope: '用户级', refs: 13, path: '.claude.json', status: '已配置', sourceType: 'Bandi 自有', summary: '用户级 MCP 配置片段；实际位置由 Claude Code 配置根解析，当前 Web mock 未连接。', content: '{ "status": "demo-configured", "credentials": "not-read" }', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'memory-bandi', name: 'Bandi 公共记忆', kind: 'Memory', owner: 'Bandi 工作区', scope: 'Workspace 公共', refs: 3, path: '.bandi/memory/public.md', status: 'r12', sourceType: 'Bandi 自有', summary: 'Bandi 工作区的正式公共记忆。', content: '', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'claude-project', name: '项目 CLAUDE.md', kind: 'CLAUDE.md', owner: 'Bandi', scope: '项目级', refs: 1, path: 'CLAUDE.md', status: '已索引', sourceType: '外部来源', summary: '项目级 Claude Code 规则。', content: 'Bandi 项目规则（演示摘要）', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
]

export const initialConfigRevisions: ConfigRevision[] = [
  { id: 'cfg-zhouce-instructions-r8', ownerType: 'agent', ownerId: 'zhouce', path: 'instructions.md', parentRevisionId: 'cfg-zhouce-instructions-r7', content: initialAgents.find((item) => item.id === 'zhouce')?.instructions ?? '', contentHash: 'demo-instructions-r8', savedAt: '8 分钟前', summary: '补充可验证交付要求', evidence: 'demo-fixture' },
  { id: 'cfg-zhouce-instructions-r7', ownerType: 'agent', ownerId: 'zhouce', path: 'instructions.md', parentRevisionId: 'cfg-zhouce-instructions-r6', content: '你是软件开发部主管。负责研发交付，并向直属主管汇报。', contentHash: 'demo-instructions-r7', savedAt: '昨天', summary: '明确研发交付职责', evidence: 'demo-fixture' },
  { id: 'cfg-zhouce-instructions-r6', ownerType: 'agent', ownerId: 'zhouce', path: 'instructions.md', content: '你是软件开发部主管。', contentHash: 'demo-instructions-r6', savedAt: '3 天前', summary: '建立主 Instructions', evidence: 'demo-fixture' },
  { id: 'cfg-sop-delivery-r4', ownerType: 'asset', ownerId: 'sop-delivery', path: '.claude/sops/software-delivery.md', content: JSON.stringify(initialAssets.find((item) => item.id === 'sop-delivery')?.steps ?? []), contentHash: 'demo-sop-delivery-r4', savedAt: '昨天', summary: '补充实现与验证步骤', evidence: 'demo-fixture' },
  { id: 'cfg-rule-common-r3', ownerType: 'asset', ownerId: 'rule-common', path: '~/.bandi/shared/rules/common.md', content: initialAssets.find((item) => item.id === 'rule-common')?.content ?? '', contentHash: 'demo-rule-common-r3', savedAt: '3 天前', summary: '明确权限不可自行扩大', evidence: 'demo-fixture' },
]

export const initialPluginInstallations: PluginInstallation[] = [
  { pluginId: 'plugin-productivity', scope: 'user', status: 'installed', installedVersion: '1.1.0', availableVersion: '1.1.0', previousVersions: ['1.0.0'], compatible: true, componentsComplete: true, evidence: 'demo-fixture' },
]

export const initialMemorySpaces: MemorySpace[] = [
  { id: 'mem-agent-zhouce', scopeType: 'Agent 长期', scopeKey: { kind: 'agent_long_term', agentId: 'zhouce' }, owner: '周策', steward: '周策', reviewer: '知衡', reviewPrincipal: { kind: 'agent', agentId: 'zhiheng' }, revision: 'r18', path: '~/.bandi/agents/agt_zhouce/memory/long-term.md' },
  { id: 'mem-agent-ws-zhouce-bandi', scopeType: 'Agent × Workspace', scopeKey: { kind: 'agent_workspace', agentId: 'zhouce', workspaceId: 'bandi' }, owner: '周策', steward: '周策', reviewer: '知衡', reviewPrincipal: { kind: 'agent', agentId: 'zhiheng' }, revision: 'r7', path: '~/.bandi/agents/agt_zhouce/workspaces/bandi/memory.md' },
  { id: 'mem-ws-bandi', scopeType: 'Workspace 公共', scopeKey: { kind: 'workspace_shared', workspaceId: 'bandi' }, owner: 'Bandi', steward: '周策', reviewer: '知衡', reviewPrincipal: { kind: 'agent', agentId: 'zhiheng' }, revision: 'r12', path: '.bandi/memory/public.md' },
  { id: 'mem-dev-bandi', scopeType: 'Department × Workspace', scopeKey: { kind: 'department_workspace', departmentId: 'dev', workspaceId: 'bandi' }, owner: '研发部 × Bandi', steward: '周策', reviewer: '知衡', reviewPrincipal: { kind: 'agent', agentId: 'zhiheng' }, revision: 'r7', path: '.bandi/memory/departments/dev.md' },
]

export const initialMemoryCandidates: MemoryCandidate[] = [
  { id: 'MC-028', spaceId: 'mem-dev-bandi', proposerAgentId: 'zhouce', reviewPrincipal: { kind: 'agent', agentId: 'zhiheng' }, summary: '记录已确认的 API 方案', current: 'API 方案待定', proposed: 'API 方案已由董事长确认采用方案 B', status: '待审核' },
  { id: 'MC-029', spaceId: 'mem-ws-bandi', proposerAgentId: 'linxu', reviewPrincipal: { kind: 'agent', agentId: 'zhouce' }, summary: '补充前端断点约束', current: '响应式约束待整理', proposed: '应用壳断点固定为 1280 / 960', status: '待审核' },
]

export const initialBackupSnapshots: BackupSnapshot[] = [
  { id: 'snap-demo-001', createdAt: '今天 09:30', kind: '手动演示', scope: { kind: 'company', companyId: 'xinghe' }, includes: ['AgentPackage', '组织关系', '工作区索引', '共享资产', '正式 Memory'], excludes: ['凭据', 'Token', '钥匙串', '聊天与执行过程'], localPath: '~/.bandi/backups/snap-demo-001', deviceName: '当前设备（演示）', hash: 'demo-a84f2c1', integrity: 'demo-verified', remoteStatus: 'private-git-not-connected', includesFormalMemory: true },
]
