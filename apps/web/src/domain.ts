import type { Agent, Asset, Department, Workspace } from './mock'

export type ServiceGrant = {
  id: string
  departmentId: string
  capabilities: string[]
  workspaceIds: string[]
  prohibitions: string[]
  status: '有效' | '暂停'
}

export type WorkspaceBinding = {
  workspaceId: string
  instructions: string
  ruleIds: string[]
  skillIds: string[]
  mcpIds: string[]
  memoryRevision: string
}

export type AgentFile = { path: string; type: string; status: string }

export type FullAgent = Agent & {
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
  instructions: string
  skillRefs: string[]
  ruleRefs: string[]
  mcpRefs: string[]
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

export type WorkspaceFile = { path: string; type: string; status: string }
export type FullWorkspace = Workspace & {
  companyId?: string
  primaryDepartmentId?: string
  projectLeadAgentId?: string
  collaboratorDepartmentIds: string[]
  health: '配置完整' | '外部变化' | '配置缺失'
  agentIds: string[]
  assetIds: string[]
  publicMemorySpaceId: string
  departmentMemorySpaceIds: string[]
  files: WorkspaceFile[]
  recentEdits: { label: string; target: string; time: string }[]
}

export type AssetKind = 'Skill' | 'Memory' | 'Rules' | 'MCP' | 'SOP' | 'CLAUDE.md' | 'Settings' | 'Hooks / Commands' | 'Plugin'
export type AssetReference = { type: 'Agent' | 'Workspace' | 'Department'; id: string; label: string }
export type SopStep = { id: string; title: string; objective: string; input: string; output: string; owner: string; dependsOn: string[] }
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
}

export type MemoryScopeType = 'Agent 长期' | 'Agent × Workspace' | 'Workspace 公共' | 'Department × Workspace'
export type MemorySpace = {
  id: string
  scopeType: MemoryScopeType
  owner: string
  steward: string
  reviewer: string
  reviewerAgentId?: string
  revision: string
  path: string
}
export type MemoryCandidateStatus = '待审核' | '要求修改' | '已驳回' | '已批准' | '已写入演示 Revision'
export type MemoryCandidate = {
  id: string
  spaceId: string
  proposerAgentId: string
  reviewerAgentId: string
  summary: string
  current: string
  proposed: string
  status: MemoryCandidateStatus
}

export type BackupSnapshot = {
  id: string
  createdAt: string
  kind: '手动演示' | '恢复前演示'
  scope: string
  includes: string[]
  excludes: string[]
}

const defaultFiles = (id: string): AgentFile[] => [
  { path: 'agent.yaml', type: '稳定身份与状态', status: '已保存' },
  { path: 'soul.md', type: '长期行为原则', status: '已保存' },
  { path: 'instructions.md', type: '主 Instructions', status: id === 'zhouce' ? '外部变化' : '已保存' },
  { path: 'config/rules.yaml', type: 'Rule 配置与引用', status: '已保存' },
  { path: 'memory/long-term.md', type: '长期正式记忆', status: 'r18' },
  { path: 'workspaces/bandi/config.yaml', type: 'Workspace 专属', status: '已保存' },
]

const baseAgent = (agent: Agent, details: Partial<FullAgent>): FullAgent => ({
  ...agent,
  companyId: 'xinghe',
  mission: '依据职责边界完成可验证的配置交付，并向直属主管汇报。',
  responsibilities: ['维护本岗位配置资产', '按明确授权服务相关 Workspace'],
  deliverables: ['配置变更与验证证据'],
  decisionBoundaries: ['不扩大自身权限', '不批准产品范围变化'],
  escalationConditions: ['权限不足', '目标冲突', '跨部门依赖无法解决'],
  prohibitions: ['不得写入未授权目录', '不得泄露凭据'],
  completionDefinition: ['结果可验证', '异常已升级'],
  serviceGrants: [],
  packagePath: `~/.bandi/agents/agt_${agent.id}/`,
  instructions: `你是${agent.role}。负责${agent.department}相关职责，并把结果以可验证方式向直属主管汇报。\n\n不得自行扩大权限；遇到目标冲突或跨部门依赖时及时升级。`,
  skillRefs: ['skill-review'],
  ruleRefs: ['rule-common'],
  mcpRefs: ['mcp-bandi'],
  permissions: { files: '仅当前 Workspace', commands: '构建、测试与版本控制', network: '仅已配置 MCP', delegation: '仅明确服务授权范围' },
  workspaceBindings: [],
  sopRefs: ['sop-delivery'],
  files: defaultFiles(agent.id),
  ...details,
})

export const initialCompanies: Company[] = [
  { id: 'xinghe', name: '星河科技', mission: '以清晰的产品判断和可靠的软件交付创造长期价值。', boundary: '公司身份与组织关系不自动授予文件、命令、网络或委派权限。', assistantAgentId: 'zhiheng', departmentIds: ['office', 'prd', 'product', 'dev', 'test'], workspaceIds: ['bandi', 'card'], sharedAssetIds: ['rule-common', 'skill-review', 'sop-delivery'] },
  { id: 'studio', name: '独立工作室', mission: '支持独立研究与实验性配置。', boundary: '与星河科技资产完全隔离，跨公司共享需单独注册授权。', departmentIds: ['studio-research'], workspaceIds: ['lab'], sharedAssetIds: [] },
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
  { id: 'bandi', name: 'Bandi', path: '/Volumes/wwx/org/bandi', company: '星河科技', department: '研发部', companyId: 'xinghe', primaryDepartmentId: 'dev', projectLeadAgentId: 'zhouce', collaboratorDepartmentIds: ['product', 'test'], config: '外部变化 1', health: '外部变化', agentIds: ['zhiheng', 'zhouce', 'linxu'], assetIds: ['sop-delivery', 'rule-common', 'skill-review', 'mcp-bandi'], publicMemorySpaceId: 'mem-ws-bandi', departmentMemorySpaceIds: ['mem-dev-bandi'], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }, { path: '.claude/settings.json', type: '项目设置', status: '外部变化' }], recentEdits: [{ label: '周策 / Instructions', target: '/agents/zhouce?tab=instructions', time: '8 分钟前' }] },
  { id: 'card', name: '名片岛 Web', path: '~/Projects/card-web', company: '星河科技', department: '产品部', companyId: 'xinghe', primaryDepartmentId: 'product', projectLeadAgentId: 'zhouce', collaboratorDepartmentIds: ['dev'], config: '配置缺失 2', health: '配置缺失', agentIds: ['zhiheng', 'zhouce'], assetIds: ['rule-common'], publicMemorySpaceId: 'mem-ws-card', departmentMemorySpaceIds: [], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }], recentEdits: [] },
  { id: 'lab', name: '独立研究', path: '~/Research/lab', companyId: 'studio', primaryDepartmentId: 'studio-research', collaboratorDepartmentIds: [], config: '配置完整', health: '配置完整', agentIds: [], assetIds: [], publicMemorySpaceId: 'mem-ws-lab', departmentMemorySpaceIds: [], files: [{ path: 'CLAUDE.md', type: '项目规则', status: '已索引' }], recentEdits: [] },
]

export const initialAssets: FullAsset[] = [
  { id: 'sop-delivery', name: '软件功能交付', kind: 'SOP', owner: '产品与研发', companyId: 'xinghe', scope: '部门级', refs: 7, path: '.claude/sops/software-delivery.md', status: '已保存', sourceType: '显式共享', summary: '从确认目标到附带验证证据的软件交付定义。', content: '', version: 'v4', objective: '把确认的产品目标交付为可验证软件。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }, { type: 'Department', id: 'dev', label: '研发部' }, { type: 'Workspace', id: 'bandi', label: 'Bandi' }], steps: [{ id: 'clarify', title: '澄清目标', objective: '确认范围和验收标准', input: '产品目标', output: '确认后的范围', owner: '产品部 / 产品岗位', dependsOn: [] }, { id: 'design', title: '技术方案', objective: '形成可实施方案', input: '确认后的范围', output: '技术方案', owner: '研发部 / 主管岗位', dependsOn: ['clarify'] }, { id: 'deliver', title: '实现与验证', objective: '交付带验证证据的软件', input: '技术方案', output: '软件与验证证据', owner: '研发部 / 工程岗位', dependsOn: ['design'] }], responsibilities: ['产品部定义范围', '研发部实现与验证'], approvalConditions: ['涉及既定权限边界或生产操作'], escalationConditions: ['目标、范围或验收标准需要重新确认'] },
  { id: 'rule-common', name: '公共安全边界', kind: 'Rules', owner: '星河科技', companyId: 'xinghe', scope: '公司共享', refs: 6, path: '~/.bandi/shared/rules/common.md', status: '已保存', sourceType: '显式共享', summary: '所有 Agent 不可突破的公司安全边界。', content: '禁止泄露凭据；生产发布必须确认；权限只能收紧，不能自行扩大。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }, { type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'skill-review', name: '代码审查', kind: 'Skill', owner: '研发部', companyId: 'xinghe', scope: '公司共享', refs: 4, path: '~/.bandi/shared/skills/code-review', status: '已保存', sourceType: '显式共享', summary: '代码正确性与可维护性审查能力。', content: '按正确性、安全性、复杂度和验证证据进行审查。', references: [{ type: 'Agent', id: 'zhouce', label: '周策' }] },
  { id: 'mcp-bandi', name: 'Bandi MCP', kind: 'MCP', owner: '系统', scope: '用户级', refs: 13, path: '~/.claude/settings.json', status: '已配置', sourceType: 'Bandi 自有', summary: 'Bandi 配置上下文接口；当前 Web mock 未连接。', content: '{ "status": "demo-configured", "credentials": "not-read" }', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'memory-bandi', name: 'Bandi 公共记忆', kind: 'Memory', owner: 'Bandi Workspace', scope: 'Workspace 公共', refs: 3, path: '.bandi/memory/public.md', status: 'r12', sourceType: 'Bandi 自有', summary: 'Bandi Workspace 的正式公共记忆。', content: '', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
  { id: 'claude-project', name: '项目 CLAUDE.md', kind: 'CLAUDE.md', owner: 'Bandi', scope: '项目级', refs: 1, path: 'CLAUDE.md', status: '已索引', sourceType: '外部来源', summary: '项目级 Claude Code 规则。', content: 'Bandi 项目规则（演示摘要）', references: [{ type: 'Workspace', id: 'bandi', label: 'Bandi' }] },
]

export const initialMemorySpaces: MemorySpace[] = [
  { id: 'mem-agent-zhouce', scopeType: 'Agent 长期', owner: '周策', steward: '周策', reviewer: '知衡', reviewerAgentId: 'zhiheng', revision: 'r18', path: '~/.bandi/agents/agt_zhouce/memory/long-term.md' },
  { id: 'mem-agent-ws-zhouce-bandi', scopeType: 'Agent × Workspace', owner: '周策', steward: '周策', reviewer: '周策', reviewerAgentId: 'zhouce', revision: 'r7', path: '~/.bandi/agents/agt_zhouce/workspaces/bandi/memory.md' },
  { id: 'mem-ws-bandi', scopeType: 'Workspace 公共', owner: 'Bandi', steward: '周策', reviewer: '知衡', reviewerAgentId: 'zhiheng', revision: 'r12', path: '.bandi/memory/public.md' },
  { id: 'mem-dev-bandi', scopeType: 'Department × Workspace', owner: '研发部 × Bandi', steward: '周策', reviewer: '知衡', reviewerAgentId: 'zhiheng', revision: 'r7', path: '.bandi/memory/departments/dev.md' },
]

export const initialMemoryCandidates: MemoryCandidate[] = [
  { id: 'MC-028', spaceId: 'mem-dev-bandi', proposerAgentId: 'zhouce', reviewerAgentId: 'zhiheng', summary: '记录已确认的 API 方案', current: 'API 方案待定', proposed: 'API 方案已由董事长确认采用方案 B', status: '待审核' },
  { id: 'MC-029', spaceId: 'mem-ws-bandi', proposerAgentId: 'linxu', reviewerAgentId: 'zhouce', summary: '补充前端断点约束', current: '响应式约束待整理', proposed: '应用壳断点固定为 1280 / 960', status: '待审核' },
]

export const initialBackupSnapshots: BackupSnapshot[] = [
  { id: 'snap-demo-001', createdAt: '今天 09:30', kind: '手动演示', scope: '星河科技 / 全部配置', includes: ['AgentPackage', '组织关系', 'Workspace 索引', '共享资产'], excludes: ['凭据', 'Token', '钥匙串', '聊天与执行过程'] },
]
