import { useMemo, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { MockBoundaryNote, PageHeader } from '../../components/app/page'
import { initialAgents, type FullAgent, type ServiceGrant } from '../../domain'
import { useApp } from '../../state'
import { useUnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'

const slugify = (value: string) => value.trim().toLocaleLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/(^-|-$)/g, '')
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)

export function AgentCreatePage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialDepartment = params.get('department') ?? ''
  const importMode = params.get('mode') === 'import'
  const requestedWorkspaceId = params.get('workspace') ?? ''
  const [step, setStep] = useState(1)
  const [externalPath, setExternalPath] = useState('')
  const [stableId, setStableId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [companyId, setCompanyId] = useState(state.departments.find((item) => item.id === initialDepartment)?.companyId ?? 'xinghe')
  const [departmentId, setDepartmentId] = useState(initialDepartment)
  const [mission, setMission] = useState('')
  const [responsibilities, setResponsibilities] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [boundaries, setBoundaries] = useState('')
  const [escalations, setEscalations] = useState('')
  const [prohibitions, setProhibitions] = useState('')
  const [completion, setCompletion] = useState('')
  const [workspaceId, setWorkspaceId] = useState(state.workspaces.some((item) => item.id === requestedWorkspaceId) ? requestedWorkspaceId : '')
  const [grants, setGrants] = useState<ServiceGrant[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [committed, setCommitted] = useState(false)
  const dirty = !committed && Boolean(name || role || departmentId || mission || responsibilities || deliverables || boundaries || escalations || prohibitions || completion || workspaceId || grants.length || externalPath || stableId)
  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: () => setCommitted(true) })
  const departments = state.departments.filter((item) => item.companyId === companyId)
  const id = importMode ? stableId.trim() : slugify(name) || `agent-${state.agents.length + 1}`
  const validStableId = !importMode || /^[a-z0-9][a-z0-9_-]*$/.test(stableId.trim())
  const validExternalPath = !importMode || /^(~\/|\/).+/.test(externalPath.trim())
  const duplicate = state.agents.some((item) => item.id === id || item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  const identityValid = Boolean(name.trim() && role.trim() && companyId && departmentId && id && validStableId && validExternalPath && !duplicate)
  const dutiesValid = importMode || Boolean(mission.trim() && responsibilities.trim() && boundaries.trim() && prohibitions.trim())
  const canContinue = step === 1 ? identityValid : step === 2 ? dutiesValid : true
  const manager = state.departments.find((item) => item.id === departmentId)?.managerAgentId
  const preview = useMemo(() => ({ name, role, companyId, departmentId, mission }), [name, role, companyId, departmentId, mission])

  const addGrant = () => setGrants((items) => [...items, { id: `grant-${items.length + 1}`, departmentId: departments.find((item) => item.id !== departmentId)?.id ?? departmentId, capabilities: ['配置审查'], workspaceIds: workspaceId ? [workspaceId] : [], prohibitions: ['不得扩大权限'], status: '有效' }])
  const submit = () => {
    setSubmitted(true)
    if (!identityValid || !dutiesValid) return
    const department = state.departments.find((item) => item.id === departmentId)
    const workspaceBindings = workspaceId ? [{ workspaceId, instructions: `${name} 在此 Workspace 的专属配置。`, ruleIds: [], skillIds: [], mcpIds: [], memoryRevision: 'r0' }] : []
    const effectiveMission = mission.trim() || (importMode ? '沿用外部 AgentPackage 中已登记的职责定义。' : '')
    const agent: FullAgent = {
      ...initialAgents[0], id, name: name.trim(), role: role.trim(), department: department?.name ?? '', service: grants.map((item) => state.departments.find((dep) => dep.id === item.departmentId)?.name).filter(Boolean).join('、') || undefined,
      status: '启用', workspaces: workspaceBindings.length, config: '缺少 Rules', updated: '刚刚', companyId, primaryDepartmentId: departmentId, managerAgentId: manager,
      mission: effectiveMission, responsibilities: lines(responsibilities), deliverables: lines(deliverables), decisionBoundaries: lines(boundaries), escalationConditions: lines(escalations), prohibitions: lines(prohibitions), completionDefinition: lines(completion), serviceGrants: grants,
      packagePath: importMode ? `${externalPath.trim().replace(/\/$/, '')}/` : `~/.bandi/agents/agt_${id}/`, packageSource: importMode ? { kind: 'external-reference', externalPath: externalPath.trim(), strategy: 'reference-only' } : { kind: 'bandi-demo', strategy: 'create-demo' }, instructions: importMode ? '外部 Instructions 未读取；当前仅登记 AgentPackage 引用。' : `你是${role.trim()}。${effectiveMission}\n\n遇到权限不足、目标冲突或跨部门依赖时及时升级。`, skillRefs: [], ruleRefs: [], mcpRefs: [], permissions: importMode ? { files: '未授予', commands: '未授予', network: '未授予', delegation: '未授予' } : { files: '仅当前 Workspace', commands: '构建与测试', network: '禁止，除非显式 MCP', delegation: '仅服务授权范围' }, workspaceBindings, sopRefs: [], files: [{ path: 'agent.yaml', type: '稳定身份与状态', status: '演示未写盘', scope: { kind: 'agent-root' } }, { path: 'instructions.md', type: '主 Instructions', status: '演示未写盘', scope: { kind: 'agent-root' } }],
    }
    dispatch({ type: 'CREATE_AGENT', agent })
    setCommitted(true)
    navigate(`/agents/${id}?tab=overview&path=agent.yaml&view=preview`)
  }

  return <>
    <PageHeader title={importMode ? '导入 AgentPackage' : '创建 Agent'} description={importMode ? '登记外部 AgentPackage 的演示来源；不会读取、验证或复制目录。' : '创建完整的长期 Agent 演示配置；实际 AgentPackage 不会在磁盘上生成。'} backTo="/agents" backLabel="返回 Agents" />
    <div className="mx-auto max-w-4xl panel overflow-hidden">
      <div className="grid grid-cols-3 border-b border-border">{['身份与组织', '职责与边界', '授权与确认'].map((label, index) => <div key={label} className={`border-b-2 px-3 py-4 text-center text-xs ${step === index + 1 ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground'}`}>{index + 1} {label}</div>)}</div>
      <div className="min-h-[420px] p-6 max-sm:p-4">
        {step === 1 && <div className="grid gap-5 sm:grid-cols-2">
          {importMode && <><TextField label="外部 AgentPackage 路径" value={externalPath} onChange={setExternalPath} error={submitted && !validExternalPath ? '请输入以 / 或 ~/ 开头的演示路径。' : undefined} /><TextField label="稳定 agent-id" value={stableId} onChange={setStableId} error={submitted && !validStableId ? '仅允许小写字母、数字、下划线和连字符。' : duplicate ? '稳定 ID 或名称已存在。' : undefined} /></>}
          <TextField label="Agent 名称" value={name} onChange={setName} error={submitted && !name.trim() ? '请输入名称。' : duplicate ? '名称或稳定 ID 已存在。' : undefined} />
          <TextField label="岗位" value={role} onChange={setRole} error={submitted && !role.trim() ? '请输入岗位。' : undefined} />
          <SelectField label="Company" value={companyId} onChange={(value) => { setCompanyId(value); setDepartmentId('') }} options={state.companies.map((item) => [item.id, item.name])} />
          <SelectField label="唯一主属部门" value={departmentId} onChange={setDepartmentId} options={departments.map((item) => [item.id, item.name])} error={submitted && !departmentId ? '请选择当前 Company 内的一个主属部门。' : undefined} />
          <div className="rounded-lg bg-muted p-4 text-sm sm:col-span-2"><b>直属主管</b><p className="mt-1 text-muted-foreground">{state.agents.find((item) => item.id === manager)?.name ?? '由所选部门主管派生；当前未设置'}</p></div>
        </div>}
        {step === 2 && (importMode ? <div className="rounded-lg border border-border p-5"><b>职责与边界沿用外部包</b><p className="mt-2 text-sm leading-6 text-muted-foreground">Bandi 不读取外部文件，因此本次登记不要求重复填写使命、职责和边界。导入后可在详情中按需补充演示配置。</p></div> : <div className="grid gap-5 sm:grid-cols-2"><TextArea label="使命" value={mission} onChange={setMission} error={submitted && !mission.trim() ? '请输入使命。' : undefined} /><TextArea label="主要职责（每行一项）" value={responsibilities} onChange={setResponsibilities} error={submitted && !responsibilities.trim() ? '至少填写一项职责。' : undefined} /><TextArea label="交付物" value={deliverables} onChange={setDeliverables} /><TextArea label="决策边界" value={boundaries} onChange={setBoundaries} error={submitted && !boundaries.trim() ? '请明确决策边界。' : undefined} /><TextArea label="升级条件" value={escalations} onChange={setEscalations} /><TextArea label="禁止事项" value={prohibitions} onChange={setProhibitions} error={submitted && !prohibitions.trim() ? '请明确禁止事项。' : undefined} /><TextArea label="完成定义" value={completion} onChange={setCompletion} /></div>)}
        {step === 3 && <div className="space-y-5"><SelectField label="初始 WorkspaceBinding（可选）" value={workspaceId} onChange={setWorkspaceId} options={state.workspaces.map((item) => [item.id, item.name])} optional /><div className="rounded-lg border border-border"><div className="flex items-center justify-between border-b border-border p-4"><div><b>跨部门服务授权</b><p className="mt-1 text-xs text-muted-foreground">组织身份本身不会授予配置或系统权限。</p></div><Button variant="outline" size="sm" onClick={addGrant}><Plus size={14} />添加授权</Button></div>{grants.length ? <div className="divide-y divide-border">{grants.map((grant) => <div key={grant.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]"><SelectField label="目标部门" value={grant.departmentId} onChange={(value) => setGrants((items) => items.map((item) => item.id === grant.id ? { ...item, departmentId: value } : item))} options={departments.filter((item) => item.id !== departmentId).map((item) => [item.id, item.name])} /><TextField label="允许能力" value={grant.capabilities.join('、')} onChange={(value) => setGrants((items) => items.map((item) => item.id === grant.id ? { ...item, capabilities: value.split('、').filter(Boolean) } : item))} /><Button aria-label="移除服务授权" variant="ghost" size="icon" onClick={() => setGrants((items) => items.filter((item) => item.id !== grant.id))}><Trash2 size={16} /></Button></div>)}</div> : <p className="p-4 text-sm text-muted-foreground">没有跨部门服务授权。</p>}</div><div className="rounded-lg border border-success/30 bg-success/5 p-4"><div className="flex gap-3"><Check className="text-success" /><div><b>{preview.name || '未命名 Agent'} · {preview.role || '未设置岗位'}</b><p className="mt-1 text-sm text-muted-foreground">稳定演示 ID：{id} · 主属部门：{state.departments.find((item) => item.id === preview.departmentId)?.name ?? '未选择'}</p></div></div></div>{requestedWorkspaceId && !state.workspaces.some((item) => item.id === requestedWorkspaceId) && <p role="alert" className="text-sm text-danger">预选 Workspace 已不存在，没有使用其他 Workspace 替代。</p>}<MockBoundaryNote>{importMode ? '只登记外部来源引用；不读取或复制目录、不导入正式 Memory、不自动识别 Skill/Rules/MCP，也不授予文件、命令、网络或委派权限。' : undefined}</MockBoundaryNote></div>}
      </div>
      <div className="flex justify-between border-t border-border p-4"><Button variant="outline" onClick={() => step === 1 ? navigate('/agents') : setStep((value) => value - 1)}>返回</Button>{step < 3 ? <Button onClick={() => { setSubmitted(true); if (canContinue) { setSubmitted(false); setStep((value) => value + 1) } }}>继续</Button> : <Button onClick={submit}>{importMode ? '导入演示记录' : '创建演示 Agent'}</Button>}</div>
    </div>
    {unsavedDialog}
  </>
}

function TextField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function TextArea({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 min-h-28 w-full p-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function SelectField({ label, value, onChange, options, error, optional }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; error?: string; optional?: boolean }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3"><option value="">{optional ? '暂不设置' : '请选择'}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
