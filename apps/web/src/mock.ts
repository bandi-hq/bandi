export type AgentStatus = '启用' | '停用' | '归档'
export type ConfigStatus = '配置完整' | '外部变化' | '缺少 Rules'
export type Agent = { id: string; name: string; role: string; department: string; service?: string; status: AgentStatus; workspaces: number; config: ConfigStatus; updated: string }
export type Workspace = { id: string; name: string; path: string; company?: string; department?: string; config: string }
export type Asset = { id: string; name: string; kind: string; owner: string; scope: string; refs: number; path: string; status: string }
export type Department = { id: string; name: string; parent?: string; manager?: string; mission: string; members: number }
import type { BuiltInClientId } from './client-adapters'

export type AiClientKind = BuiltInClientId | 'custom'
export type AiClient = {
  id: string
  kind: AiClientKind
  name: string
  shortName: string
  description: string
  detection: 'not-checked'
  persistence: 'initial-demo' | 'memory-only'
}

export const aiClients: AiClient[] = [
  { id:'claude-code', kind:'claude-code', name:'Claude Code', shortName:'CC', description:'Anthropic 的命令行 AI 编程工具', detection:'not-checked', persistence:'initial-demo' },
  { id:'claude-desktop', kind:'claude-desktop', name:'Claude Desktop', shortName:'CD', description:'Anthropic 的桌面 AI 助手', detection:'not-checked', persistence:'memory-only' },
  { id:'codex', kind:'codex', name:'Codex', shortName:'CX', description:'OpenAI 的 AI 编程工具', detection:'not-checked', persistence:'memory-only' },
  { id:'gemini-cli', kind:'gemini-cli', name:'Gemini CLI', shortName:'GE', description:'Google 的命令行 AI 编程工具', detection:'not-checked', persistence:'memory-only' },
  { id:'grok-build', kind:'grok-build', name:'Grok Build', shortName:'GB', description:'xAI 的 AI 编程工具', detection:'not-checked', persistence:'memory-only' },
  { id:'opencode', kind:'opencode', name:'OpenCode', shortName:'OC', description:'开源 AI 编程工具', detection:'not-checked', persistence:'memory-only' },
  { id:'openclaw', kind:'openclaw', name:'OpenClaw', shortName:'CL', description:'开源 AI 助手', detection:'not-checked', persistence:'memory-only' },
  { id:'hermes', kind:'hermes', name:'Hermes', shortName:'HE', description:'Nous Research 的 AI Agent', detection:'not-checked', persistence:'memory-only' },
  { id:'pi', kind:'pi', name:'Pi', shortName:'PI', description:'命令行 AI 编程 Agent', detection:'not-checked', persistence:'memory-only' },
]

export const agents: Agent[] = [
  { id:'zhiheng', name:'知衡', role:'董事长助理', department:'董事长办公室', status:'启用', workspaces:2, config:'配置完整', updated:'2 小时前' },
  { id:'zhouce', name:'周策', role:'软件开发部主管', department:'研发部', service:'测试部', status:'启用', workspaces:2, config:'外部变化', updated:'8 分钟前' },
  { id:'linxu', name:'林序', role:'Web 工程师', department:'研发部', service:'市场部', status:'启用', workspaces:2, config:'缺少 Rules', updated:'昨天' },
  { id:'songyan', name:'宋研', role:'代码审查', department:'研发部', status:'归档', workspaces:1, config:'配置完整', updated:'3 天前' },
]
export const workspaces: Workspace[] = [
  { id:'bandi', name:'Bandi', path:'/Volumes/wwx/org/bandi', company:'星河科技', department:'研发部', config:'外部变化 1' },
  { id:'card', name:'名片岛 Web', path:'~/Projects/card-web', company:'星河科技', department:'产品部', config:'配置缺失 2' },
  { id:'lab', name:'独立研究', path:'~/Research/lab', config:'配置完整' },
]
export const assets: Asset[] = [
  { id:'sop-delivery', name:'软件功能交付', kind:'SOP', owner:'产品与研发', scope:'部门级', refs:7, path:'.claude/sops/software-delivery.md', status:'已保存' },
  { id:'rule-common', name:'公共安全边界', kind:'Rules', owner:'星河科技', scope:'公司共享', refs:6, path:'~/.bandi/shared/rules/common.md', status:'已保存' },
  { id:'skill-review', name:'代码审查', kind:'Skill', owner:'研发部', scope:'公司共享', refs:4, path:'~/.bandi/shared/skills/code-review', status:'已保存' },
  { id:'mcp-bandi', name:'Bandi MCP', kind:'MCP', owner:'系统', scope:'用户级', refs:13, path:'.claude.json', status:'已配置' },
]
export const departments: Department[] = [
 { id:'office', name:'董事长办公室', manager:'知衡', mission:'公司目标协调、跨部门升级与决策摘要', members:1 },
 { id:'prd', name:'产品与研发中心', mission:'从产品判断到可验证的软件交付', members:9 },
 { id:'product', name:'产品部', parent:'prd', manager:'安澜', mission:'产品定义、范围与体验质量', members:3 },
 { id:'dev', name:'研发部', parent:'prd', manager:'周策', mission:'软件架构、研发交付与质量', members:6 },
 { id:'test', name:'测试部', parent:'prd', manager:'宋研', mission:'质量策略与发布验证', members:2 },
]
