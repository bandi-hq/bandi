import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { MockBoundaryNote, PageHeader } from '../../components/app/page'
import { initialAgents, type FullAgent, type ServiceGrant } from '../../domain'
import { useApp } from '../../state'
import { UnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'
import { AgentAvatarPicker } from '../../components/agents/agent-avatar-picker'
import { createManagedAgent, isDesktopRuntime, saveDepartment, saveServiceGrants } from '../../desktop-bridge'
import { getAgentConfigPath, serializeAgentConfig, snapshotAgentConfig, type AgentConfigPayload } from '../../agent-config-model'

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
  const [generatedId] = useState(() => `agent-${crypto.randomUUID()}`)
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [companyId, setCompanyId] = useState(state.departments.find((item) => item.id === initialDepartment)?.companyId ?? state.companies[0]?.id ?? '')
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
  const [avatar, setAvatar] = useState<File>()
  const [saving, setSaving] = useState(false)
  const [createdPackage, setCreatedPackage] = useState<FullAgent>()
  const [saveError, setSaveError] = useState<string>()
  const [destination, setDestination] = useState('')
  const desktop = isDesktopRuntime()
  const dirty = !committed && Boolean(name || roleId || departmentId || mission || responsibilities || deliverables || boundaries || escalations || prohibitions || completion || workspaceId || grants.length || externalPath || stableId || avatar)
  const departments = state.departments.filter((item) => item.companyId === companyId)
  const roles = state.roles.filter((item) => item.companyId === companyId && item.status === 'active' && (!item.departmentId || item.departmentId === departmentId))
  const selectedRole = state.roles.find((item) => item.id === roleId)
  const id = importMode ? stableId.trim() : generatedId
  const validStableId = !importMode || /^[a-z0-9][a-z0-9_-]*$/.test(stableId.trim())
  const validExternalPath = !importMode || /^(~\/|\/).+/.test(externalPath.trim())
  const duplicate = state.agents.some((item) => item.id === id || item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  const identityValid = Boolean(name.trim() && selectedRole && companyId && departmentId && id && validStableId && validExternalPath && !duplicate)
  const dutiesValid = importMode || Boolean(mission.trim() && responsibilities.trim() && boundaries.trim() && prohibitions.trim())
  const grantDepartments = departments.filter((item) => item.id !== departmentId)
  const grantsValid = grants.every((grant) => grantDepartments.some((item) => item.id === grant.departmentId) && grant.capabilities.length > 0)
  const canContinue = step === 1 ? identityValid : step === 2 ? dutiesValid : grantsValid
  const manager = state.departments.find((item) => item.id === departmentId)?.managerAgentId
  const preview = useMemo(() => ({ name, roleId, companyId, departmentId, mission }), [name, roleId, companyId, departmentId, mission])

  useEffect(() => {
    if (committed && destination) navigate(destination)
  }, [committed, destination, navigate])

  const addGrant = () => {
    const target = grantDepartments[0]
    if (!target) return
    setGrants((items) => [...items, { id: `grant-${items.length + 1}`, departmentId: target.id, capabilities: ['配置审查'], workspaceIds: workspaceId ? [workspaceId] : [], prohibitions: ['不得扩大权限'], status: '有效' }])
  }
  const submit = async () => {
    setSubmitted(true)
    setSaveError(undefined)
    if (!identityValid || !dutiesValid || !grantsValid || saving) return
    const department = state.departments.find((item) => item.id === departmentId)
    const workspaceBindings = workspaceId ? [{ workspaceId, instructions: `${name} 在此工作区的专属配置。`, ruleIds: [], skillIds: [], mcpIds: [], memoryRevision: 'r0' }] : []
    const effectiveMission = mission.trim() || (importMode ? '沿用外部 AgentPackage 中已登记的职责定义。' : '')
    const agent: FullAgent = {
      ...initialAgents[0], id, name: name.trim(), role: selectedRole?.name ?? roleId, department: department?.name ?? '', service: grants.map((item) => state.departments.find((dep) => dep.id === item.departmentId)?.name).filter(Boolean).join('、') || undefined,
      status: 'active', roleId, packageSchema: importMode ? { compatibility: 'unverified' } : { schemaVersion: 1, compatibility: 'current' }, workspaces: workspaceBindings.length, config: '缺少 Rules', updated: '刚刚', companyId, primaryDepartmentId: departmentId, managerAgentId: manager,
      mission: effectiveMission, responsibilities: lines(responsibilities), deliverables: lines(deliverables), decisionBoundaries: lines(boundaries), escalationConditions: lines(escalations), prohibitions: lines(prohibitions), completionDefinition: lines(completion), serviceGrants: grants,
      packagePath: importMode ? `${externalPath.trim().replace(/\/$/, '')}/` : `~/.bandi/agents/agt_${id}/`, packageSource: importMode ? { kind: 'external-reference', externalPath: externalPath.trim(), strategy: 'reference-only' } : desktop ? { kind: 'bandi-managed', packageId: `agt_${id}`, strategy: 'managed' } : { kind: 'bandi-demo', strategy: 'create-demo' }, avatarPath: avatar ? 'avatar.png' : undefined, instructions: importMode ? '外部主指令未读取；当前仅登记 AgentPackage 引用。' : `你是${selectedRole?.name ?? roleId}。${effectiveMission}\n\n遇到权限不足、目标冲突或跨部门依赖时及时升级。`, skillRefs: [], ruleRefs: [], mcpRefs: [], permissions: importMode ? { files: '未授予', commands: '未授予', network: '未授予', delegation: '未授予' } : { files: '仅当前工作区', commands: '构建与测试', network: '禁止，除非显式 MCP', delegation: '仅服务授权范围' }, workspaceBindings, sopRefs: [], files: [],
    }
    setSaving(true)
    let packageCreatedThisAttempt = false
    try {
      if (desktop && !importMode) {
        const payloads: AgentConfigPayload[] = [
          snapshotAgentConfig(agent, 'identity'),
          snapshotAgentConfig(agent, 'instructions'),
          snapshotAgentConfig(agent, 'context'),
          snapshotAgentConfig(agent, 'skills'),
          snapshotAgentConfig(agent, 'rules'),
          snapshotAgentConfig(agent, 'mcp'),
          snapshotAgentConfig(agent, 'permissions'),
          snapshotAgentConfig(agent, 'sop'),
          snapshotAgentConfig(agent, 'orchestration'),
          snapshotAgentConfig(agent, 'hooks'),
          snapshotAgentConfig(agent, 'commands'),
          ...agent.workspaceBindings.map((value) => ({ kind: 'workspace-binding' as const, value })),
        ].filter((payload): payload is AgentConfigPayload => Boolean(payload))
        const files = payloads.flatMap((payload) => {
          const path = getAgentConfigPath(payload)
          const content = serializeAgentConfig(agent, payload)
          return path && content !== undefined ? [{ path, content }] : []
        })
        const result = createdPackage ? undefined : await createManagedAgent(agent, files, avatar)
        const managedAgent = result
          ? {
              ...result.agent,
              packageSource: {
                kind: 'bandi-managed' as const,
                packageId: `agt_${id}`,
                strategy: 'managed' as const,
                identityBaseline: result.baselineRef.assetContentHash,
              },
            }
          : createdPackage
        if (!managedAgent) throw new Error('无法恢复已创建的 AgentPackage')
        if (result) {
          packageCreatedThisAttempt = true
          setCreatedPackage(managedAgent)
        }
        const persistedGrants = await saveServiceGrants(id, grants)
        const persistedDepartment = department
          ? await saveDepartment({
              ...department,
              managerAgentId: department.managerAgentId,
              memberAgentIds: [...new Set([...department.memberAgentIds, id])],
              members: new Set([...department.memberAgentIds, id]).size,
            })
          : undefined
        if (persistedDepartment) {
          dispatch({ type: 'SYNC_PERSISTED_DEPARTMENTS', departments: [persistedDepartment] })
        }
        dispatch({
          type: 'UPSERT_MANAGED_AGENT',
          agent: {
            ...managedAgent,
            serviceGrants: persistedGrants.map((grant) => ({
              id: grant.id,
              departmentId: grant.departmentId,
              capabilities: grant.capabilities,
              workspaceIds: grant.workspaceIds,
              prohibitions: grant.prohibitions,
              status: grant.status,
            })),
          },
          message: '已创建完整受管 AgentPackage 与组织关系',
        })
      } else {
        dispatch({ type: 'CREATE_AGENT', agent })
      }
      setDestination(`/agents/${id}?tab=overview&path=agent.yaml&view=preview`)
      setCommitted(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith('INVALID_AGENT_ID')) {
        setStep(1)
        setSaveError(`系统生成的技术标识无效，请重试创建。技术详情：${message}`)
      } else {
        setSaveError(createdPackage || packageCreatedThisAttempt
          ? `AgentPackage 已创建，但组织关系尚未完整保存：${message}。请直接重试，本次不会重复创建 AgentPackage。`
          : message)
      }
    } finally {
      setSaving(false)
    }
  }

  const createDescription = desktop
    ? '创建受管 AgentPackage，并将组织关系保存到 Bandi Desktop。'
    : '创建长期 Agent 的浏览器演示记录；不会在磁盘上生成 AgentPackage。'

  return <>
    <PageHeader title={importMode ? '导入 AgentPackage' : '创建 Agent'} description={importMode ? '登记外部 AgentPackage 的演示来源；不会读取、验证或复制目录。' : createDescription} backTo="/agents" backLabel="返回 Agent 列表" />
    {!state.companies.length ? <div className="mx-auto max-w-4xl rounded-lg border border-warning/30 bg-warning/8 p-5"><b>请先创建公司</b><p className="mt-2 text-sm leading-6 text-muted-foreground">Agent 必须选择所属公司、唯一主属部门和有效岗位，当前没有可用组织。</p><Button asChild className="mt-4"><Link to="/organization">前往组织管理</Link></Button></div> : !state.departments.length ? <div className="mx-auto max-w-4xl rounded-lg border border-warning/30 bg-warning/8 p-5"><b>请先创建部门</b><p className="mt-2 text-sm leading-6 text-muted-foreground">当前已有公司，但还没有可作为 Agent 唯一主属部门的组织单元。</p><Button asChild className="mt-4"><Link to="/organization">前往组织管理</Link></Button></div> : <div className="mx-auto max-w-4xl panel overflow-hidden">
      <div className="grid grid-cols-3 border-b border-border">{['身份与组织', '职责与边界', '授权与确认'].map((label, index) => <div key={label} className={`border-b-2 px-3 py-4 text-center text-xs ${step === index + 1 ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground'}`}>{index + 1} {label}</div>)}</div>
      <div className="min-h-[420px] p-6 max-sm:p-4">
        {step === 1 && <div className="grid gap-5 sm:grid-cols-2">
          {importMode && <><TextField label="外部 AgentPackage 路径" value={externalPath} onChange={setExternalPath} error={submitted && !validExternalPath ? '请输入以 / 或 ~/ 开头的演示路径。' : undefined} /><TextField label="稳定 agent-id" value={stableId} onChange={setStableId} error={submitted && !validStableId ? '仅允许小写字母、数字、下划线和连字符。' : duplicate ? '稳定 ID 或名称已存在。' : undefined} /></>}
          {!importMode && <AgentAvatarPicker name={name} file={avatar} onChange={setAvatar} disabled={!desktop} help={desktop ? undefined : '头像上传仅在 Bandi Desktop 中可用；Web 演示使用名称首字符。'} />}
          <TextField label="Agent 名称" value={name} onChange={setName} error={submitted && !name.trim() ? '请输入名称。' : duplicate ? '名称或稳定 ID 已存在。' : undefined} />
          <SelectField label="所属公司" value={companyId} onChange={(value) => { setCompanyId(value); setDepartmentId(''); setRoleId('') }} options={state.companies.map((item) => [item.id, item.name])} />
          <SelectField label="唯一主属部门" value={departmentId} onChange={(value) => { setDepartmentId(value); setRoleId('') }} options={departments.map((item) => [item.id, item.name])} error={submitted && !departmentId ? '请选择当前公司内的一个主属部门。' : undefined} />
          <SelectField label="岗位" value={roleId} onChange={setRoleId} options={roles.map((item) => [item.id, item.name])} error={submitted && !selectedRole ? '请选择适用于当前公司和部门的有效岗位。' : undefined} />
          <div className="rounded-lg bg-muted p-4 text-sm sm:col-span-2"><b>直属主管</b><p className="mt-1 text-muted-foreground">{state.agents.find((item) => item.id === manager)?.name ?? '由所选部门主管派生；当前未设置'}</p></div>
        </div>}
        {step === 2 && (importMode ? <div className="rounded-lg border border-border p-5"><b>职责与边界沿用外部包</b><p className="mt-2 text-sm leading-6 text-muted-foreground">Bandi 不读取外部文件，因此本次登记不要求重复填写使命、职责和边界。导入后可在详情中按需补充演示配置。</p></div> : <div className="grid gap-5 sm:grid-cols-2"><TextArea label="使命" value={mission} onChange={setMission} error={submitted && !mission.trim() ? '请输入使命。' : undefined} /><TextArea label="主要职责（每行一项）" value={responsibilities} onChange={setResponsibilities} error={submitted && !responsibilities.trim() ? '至少填写一项职责。' : undefined} /><TextArea label="交付物" value={deliverables} onChange={setDeliverables} /><TextArea label="决策边界" value={boundaries} onChange={setBoundaries} error={submitted && !boundaries.trim() ? '请明确决策边界。' : undefined} /><TextArea label="升级条件" value={escalations} onChange={setEscalations} /><TextArea label="禁止事项" value={prohibitions} onChange={setProhibitions} error={submitted && !prohibitions.trim() ? '请明确禁止事项。' : undefined} /><TextArea label="完成定义" value={completion} onChange={setCompletion} /></div>)}
        {step === 3 && <div className="space-y-5">
          <SelectField label="初始工作区专属配置（可选）" value={workspaceId} onChange={setWorkspaceId} options={state.workspaces.map((item) => [item.id, item.name])} optional />
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div><b>跨部门服务授权</b><p className="mt-1 text-xs text-muted-foreground">组织身份本身不会授予配置或系统权限。</p></div>
              <Button variant="outline" size="sm" disabled={!grantDepartments.length} onClick={addGrant}><Plus size={14} />添加授权</Button>
            </div>
            {grants.length ? <div className="divide-y divide-border">{grants.map((grant) => <div key={grant.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <SelectField label="目标部门" value={grant.departmentId} onChange={(value) => setGrants((items) => items.map((item) => item.id === grant.id ? { ...item, departmentId: value } : item))} options={grantDepartments.map((item) => [item.id, item.name])} error={submitted && !grantDepartments.some((item) => item.id === grant.departmentId) ? '请选择当前公司内的其他部门。' : undefined} />
              <TextField label="允许能力" value={grant.capabilities.join('、')} onChange={(value) => setGrants((items) => items.map((item) => item.id === grant.id ? { ...item, capabilities: value.split('、').map((item) => item.trim()).filter(Boolean) } : item))} error={submitted && !grant.capabilities.length ? '请至少填写一项允许能力。' : undefined} />
              <Button aria-label="移除服务授权" variant="ghost" size="icon" onClick={() => setGrants((items) => items.filter((item) => item.id !== grant.id))}><Trash2 size={16} /></Button>
            </div>)}</div> : <p className="p-4 text-sm text-muted-foreground">{grantDepartments.length ? '没有跨部门服务授权。' : '当前公司没有其他可授权部门。'}</p>}
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex gap-3"><Check className="text-success" aria-hidden="true" /><div>
              <b>{preview.name || '未命名 Agent'} · {state.roles.find((item) => item.id === preview.roleId)?.name ?? '未设置岗位'}</b>
              <p className="mt-1 text-sm text-muted-foreground">主属部门：{state.departments.find((item) => item.id === preview.departmentId)?.name ?? '未选择'} · 初始工作区：{state.workspaces.find((item) => item.id === workspaceId)?.name ?? '暂不设置'} · 跨部门授权：{grants.length} 项</p>
              <p className="mt-1 text-sm text-muted-foreground">长期权限：仅当前工作区 / 构建与测试 / 默认禁止网络</p>
              <p className="mt-2 text-xs text-muted-foreground">{importMode ? '现有 agent-id' : desktop ? '技术标识' : '演示标识'}：{id}{!importMode && '（创建后不可修改）'}</p>
            </div></div>
          </div>
          {requestedWorkspaceId && !state.workspaces.some((item) => item.id === requestedWorkspaceId) && <p role="alert" className="text-sm text-danger">预选工作区已不存在，没有使用其他工作区替代。</p>}
          <MockBoundaryNote>{importMode ? '只登记外部来源引用；不读取或复制目录、不导入正式记忆、不自动识别技能、规则或 MCP，也不授予文件、命令、网络或委派权限。' : undefined}</MockBoundaryNote>
        </div>}
      </div>
      {saveError && <p role="alert" className="border-t border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{saveError}</p>}
      <div className="flex justify-between border-t border-border p-4"><Button variant="outline" disabled={saving} onClick={() => step === 1 ? navigate('/agents') : setStep((value) => value - 1)}>返回</Button>{step < 3 ? <Button onClick={() => { setSubmitted(true); if (canContinue) { setSubmitted(false); setStep((value) => value + 1) } }}>继续</Button> : <Button disabled={saving} onClick={() => void submit()}>{saving ? '正在创建…' : importMode ? '导入演示记录' : desktop ? '创建 Agent' : '创建演示 Agent'}</Button>}</div>
    </div>}
    {dirty && <UnsavedChangesGuard resetDraft={() => setCommitted(true)} />}
  </>
}

function TextField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function TextArea({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 min-h-28 w-full p-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function SelectField({ label, value, onChange, options, error, optional }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; error?: string; optional?: boolean }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3"><option value="">{optional ? '暂不设置' : '请选择'}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
