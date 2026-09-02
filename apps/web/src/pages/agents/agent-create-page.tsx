import { useMemo, useRef, useState } from 'react'
import { Check, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { MockBoundaryNote, PageHeader } from '../../components/app/page'
import type { FullAgent, ServiceGrant } from '../../domain'
import { useApp } from '../../state'
import { useUnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'
import { AgentAvatarPicker } from '../../components/agents/agent-avatar-picker'
import { commitManagedAgentCreation, importClaudeAgent, isDesktopRuntime, previewClaudeAgent, registerExternalAgent, selectClaudeAgentFile, selectDirectory } from '../../desktop-bridge'
import type { ClaudeAgentPreviewDto } from '../../contracts'
import { getAgentConfigPath, serializeAgentConfig, snapshotAgentConfig, type AgentConfigPayload } from '../../agent-config-model'

const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)

export function AgentCreatePage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialDepartment = params.get('department') ?? ''
  const importMode = params.get('mode') === 'import'
  const referenceMode = params.get('mode') === 'reference'
  const requestedWorkspaceId = params.get('workspace') ?? ''
  const [step, setStep] = useState(1)
  const [externalPath, setExternalPath] = useState('')
  const [selectingDirectory, setSelectingDirectory] = useState(false)
  const [importPreview, setImportPreview] = useState<ClaudeAgentPreviewDto>()
  const [generatedId] = useState(() => `agent-${crypto.randomUUID()}`)
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [companyId, setCompanyId] = useState(state.departments.find((item) => item.id === initialDepartment)?.companyId ?? '')
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
  const [saveError, setSaveError] = useState<string>()
  const allowNavigation = useRef(false)
  const desktop = isDesktopRuntime()
  const dirty = !committed && Boolean(name || roleId || departmentId || mission || responsibilities || deliverables || boundaries || escalations || prohibitions || completion || workspaceId || grants.length || externalPath || avatar)
  const departments = state.departments.filter((item) => item.companyId === companyId)
  const roles = state.roles.filter((item) => item.companyId === companyId && item.status === 'active' && (!item.departmentId || item.departmentId === departmentId))
  const selectedRole = state.roles.find((item) => item.id === roleId)
  const id = generatedId
  const validExternalPath = !referenceMode || (desktop ? externalPath.startsWith('/') : /^(~\/|\/).+/.test(externalPath.trim()))
  const organizationEnabled = Boolean(companyId || departmentId || roleId)
  const organizationValid = !organizationEnabled || Boolean(companyId && departmentId && selectedRole)
  const duplicate = state.agents.some((item) => item.id === id || item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  const identityValid = Boolean(name.trim() && id && validExternalPath && organizationValid && (!importMode || importPreview) && !duplicate)
  const dutiesValid = importMode || referenceMode || Boolean(mission.trim() && responsibilities.trim() && boundaries.trim() && prohibitions.trim())
  const grantDepartments = departments.filter((item) => item.id !== departmentId)
  const grantsValid = grants.every((grant) => grantDepartments.some((item) => item.id === grant.departmentId) && grant.capabilities.length > 0)
  const canContinue = step === 1 ? identityValid : step === 2 ? dutiesValid : grantsValid
  const manager = state.departments.find((item) => item.id === departmentId)?.managerAgentId
  const preview = useMemo(() => ({ name, roleId, companyId, departmentId, mission }), [name, roleId, companyId, departmentId, mission])
  const unsavedChangesDialog = useUnsavedChangesGuard({
    dirty,
    resetDraft: () => setCommitted(true),
    shouldBlock: () => dirty && !allowNavigation.current,
  })

  const chooseImportFile = async () => {
    if (selectingDirectory) return
    setSelectingDirectory(true)
    setSaveError(undefined)
    try {
      const selected = await selectClaudeAgentFile()
      if (!selected) return
      const preview = await previewClaudeAgent(selected)
      setExternalPath(preview.sourcePath)
      setImportPreview(preview)
      setName(preview.name)
      setMission(preview.description ?? '')
    } catch (error) {
      setImportPreview(undefined)
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSelectingDirectory(false)
    }
  }
  const chooseExternalDirectory = async () => {
    if (selectingDirectory) return
    setSelectingDirectory(true)
    setSaveError(undefined)
    try {
      const selected = await selectDirectory()
      if (selected) setExternalPath(selected)
    } catch {
      setSaveError('无法打开系统目录选择器，请重试。')
    } finally {
      setSelectingDirectory(false)
    }
  }
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
    const effectiveMission = mission.trim() || ((importMode || referenceMode) ? '从已有 Agent 配置建立的长期受管记录。' : '')
    const agent: FullAgent = {
      id,
      name: name.trim(),
      role: selectedRole?.name ?? roleId,
      department: department?.name ?? '',
      service: grants.map((item) => state.departments.find((dep) => dep.id === item.departmentId)?.name).filter(Boolean).join('、') || undefined,
      status: 'active',
      roleId: roleId || undefined,
      packageSchema: referenceMode ? { compatibility: 'unverified' } : { schemaVersion: 1, compatibility: 'current' },
      workspaces: workspaceBindings.length,
      config: '配置完整',
      updated: '刚刚',
      companyId: companyId || undefined,
      primaryDepartmentId: departmentId || undefined,
      managerAgentId: manager,
      mission: effectiveMission,
      responsibilities: lines(responsibilities),
      deliverables: lines(deliverables),
      decisionBoundaries: lines(boundaries),
      escalationConditions: lines(escalations),
      prohibitions: lines(prohibitions),
      completionDefinition: lines(completion),
      serviceGrants: grants,
      packagePath: referenceMode ? `${externalPath.trim().replace(/\/$/, '')}/` : `~/.bandi/agents/agt_${id}/`,
      packageSource: referenceMode ? { kind: 'external-reference', externalPath: externalPath.trim(), strategy: 'reference-only' } : importMode && importPreview ? { kind: 'claude-agent-import', packageId: `agt_${id}`, strategy: 'managed-copy', sourcePath: importPreview.sourcePath, sourceBaselineHash: importPreview.sourceBaselineHash, importedAt: new Date().toISOString() } : desktop ? { kind: 'bandi-managed', packageId: `agt_${id}`, strategy: 'managed' } : { kind: 'bandi-demo', strategy: 'create-demo' },
      avatarPath: avatar ? 'avatar.png' : undefined,
      instructions: referenceMode ? '外部主指令未读取；当前仅登记 AgentPackage 引用。' : importPreview?.instructions ?? `你是${selectedRole?.name ?? '长期 Agent'}。${effectiveMission}\n\n遇到权限不足、目标冲突或跨部门依赖时及时升级。`,
      skillRefs: [],
      ruleRefs: [],
      mcpRefs: [],
      contextPolicy: { enabled: false, triggerRatio: 0.8, targetRatio: 0.5, protectRecentTurns: 6, protectOpeningTurns: 2 },
      contextWindowTokens: 200_000,
      outputParameterBindings: [],
      orchestrationPolicy: { enabled: false, maxDelegationDepth: 0, allowedAgentIds: [], allowedRoleIds: [], allowedDepartmentIds: [], requireWorkspaceBinding: true, requireSopMatch: true, requireServiceGrantForCrossDepartment: true, escalationConditions: [], prohibitions: [] },
      hookRefs: [],
      commandRefs: [],
      permissions: { files: '未授予', commands: '未授予', network: '未授予', delegation: '未授予' },
      workspaceBindings,
      sopRefs: [],
      files: [],
    }
    setSaving(true)
    try {
      if (desktop && !referenceMode) {
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
        const result = importMode && importPreview
          ? await importClaudeAgent(importPreview.sourcePath, importPreview.sourceBaselineHash, `import-agent-${id}`, agent, files, grants)
          : await commitManagedAgentCreation(`create-agent-${id}`, agent, files, grants, avatar)
        dispatch({ type: 'SYNC_AGENT_RECOVERY', operation: result.operation, agent: result.agent })
        if (result.operation.status !== 'completed' || !result.agent) {
          throw new Error(result.operation.status === 'blocked'
            ? 'AgentPackage 内容已发生变化，系统未自动覆盖；请从首页待处理项查看。'
            : 'Agent 配置尚未完整保存，可从首页待处理项继续修复。')
        }
        dispatch({
          type: 'UPSERT_MANAGED_AGENT',
          agent: { ...result.agent, serviceGrants: grants },
          message: '已创建完整受管 AgentPackage 与组织关系',
        })
      } else if (desktop && referenceMode) {
        const reference = await registerExternalAgent(agent, externalPath.trim())
        dispatch({ type: 'UPSERT_MANAGED_AGENT', agent: { ...agent, packagePath: `${reference.canonicalRoot.replace(/\/$/, '')}/`, packageSource: { kind: 'external-reference', externalPath: reference.canonicalRoot, strategy: 'reference-only' } }, message: '外部 AgentPackage 引用已登记；重启后仍会保留，目录内容不会被扫描、读取或修改' })
      } else {
        dispatch({ type: 'CREATE_AGENT', agent })
      }
      allowNavigation.current = true
      setCommitted(true)
      navigate(`/agents/${id}?tab=overview&path=agent.yaml&view=preview`, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith('INVALID_AGENT_ID')) {
        setStep(1)
        setSaveError(`系统生成的技术标识无效，请重试创建。技术详情：${message}`)
      } else {
        setSaveError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const pageTitle = importMode
    ? '导入 Claude Agent'
    : referenceMode
      ? '仅登记外部引用'
      : '创建个人 Agent'
  const description = importMode
    ? '选择 .claude/agents 下的单个文件，预览后创建 Bandi 受管副本；原文件不会被修改。'
    : referenceMode
      ? desktop
        ? '只登记外部 AgentPackage 的位置和基本信息；不会扫描、读取、复制或修改目录内容。'
        : '只在当前页面记录外部 AgentPackage 的演示位置；刷新后恢复初始状态。'
      : desktop
        ? '创建无需组织关系的受管 AgentPackage；公司、部门和岗位可稍后按需设置。'
        : '创建个人 Agent 演示记录；不会在磁盘上生成 AgentPackage。'

  return <>
    <PageHeader title={pageTitle} description={description} backTo="/agents" backLabel="返回 Agent 列表" />
    <div className="mx-auto max-w-4xl panel overflow-hidden">
      <div className="grid grid-cols-3 border-b border-border">{['身份与组织', '职责与边界', '授权与确认'].map((label, index) => <div key={label} className={`border-b-2 px-3 py-4 text-center text-xs ${step === index + 1 ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground'}`}>{index + 1} {label}</div>)}</div>
      <div className="min-h-[420px] p-6 max-sm:p-4">
        {step === 1 && <div className="grid gap-5 sm:grid-cols-2">
          {importMode && <div className="sm:col-span-2"><label className="block text-sm font-medium">Claude Agent 文件</label><Button type="button" variant="outline" className="mt-2" disabled={!desktop || selectingDirectory} aria-busy={selectingDirectory} onClick={() => void chooseImportFile()}><FolderOpen size={16} aria-hidden="true" />{selectingDirectory ? '正在读取…' : importPreview ? '重新选择文件' : '选择 .md 文件'}</Button>{importPreview && <div className="mt-3 rounded-lg border border-border bg-muted/35 p-4 text-sm"><b>{importPreview.name}</b><p className="mt-1 text-muted-foreground">{importPreview.description || '无来源描述'}</p><p className="mt-2 text-xs text-muted-foreground">将创建受管副本；原始文件不会被修改。{importPreview.ignoredFields.length ? ` 未转换字段：${importPreview.ignoredFields.join('、')}` : ''}</p></div>}{submitted && !importPreview && <span className="mt-1 block text-xs text-danger">请选择并成功预览一个 Claude Agent 文件。</span>}</div>}
          {referenceMode && (desktop ? <div className="sm:col-span-2"><label className="block text-sm font-medium">外部 AgentPackage 目录</label><Button type="button" variant="outline" className="mt-2" disabled={selectingDirectory} aria-busy={selectingDirectory} onClick={() => void chooseExternalDirectory()}><FolderOpen size={16} aria-hidden="true" />{selectingDirectory ? '正在打开…' : externalPath ? '重新选择目录' : '选择目录'}</Button><div className="mt-2 min-h-10 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm">{externalPath || '尚未选择目录'}</div>{submitted && !validExternalPath && <span className="mt-1 block text-xs text-danger">请选择一个本机目录。</span>}</div> : <TextField label="外部 AgentPackage 演示路径" value={externalPath} onChange={setExternalPath} error={submitted && !validExternalPath ? '请输入以 / 或 ~/ 开头的演示路径。' : undefined} />)}
          {!importMode && <AgentAvatarPicker name={name} file={avatar} onChange={setAvatar} disabled={!desktop} help={desktop ? undefined : '头像上传仅在 Bandi Desktop 中可用；Web 演示使用名称首字符。'} />}
          <TextField label="Agent 名称" value={name} onChange={setName} error={submitted && !name.trim() ? '请输入名称。' : duplicate ? '名称或稳定 ID 已存在。' : undefined} />
          <SelectField label="所属公司（高级治理，可选）" value={companyId} onChange={(value) => { setCompanyId(value); setDepartmentId(''); setRoleId('') }} options={state.companies.map((item) => [item.id, item.name])} optional />
          <div><SelectField label="所属部门" value={departmentId} onChange={(value) => { setDepartmentId(value); setRoleId('') }} options={departments.map((item) => [item.id, item.name])} optional error={submitted && organizationEnabled && !departmentId ? '启用组织治理后请选择所属部门。' : undefined} /><p className="mt-2 text-xs text-muted-foreground">留空则作为个人 Agent 使用。</p></div>
          <SelectField label="岗位" value={roleId} onChange={setRoleId} options={roles.map((item) => [item.id, item.name])} optional error={submitted && organizationEnabled && !selectedRole ? '启用组织治理后请选择有效岗位。' : undefined} />
          <div className="rounded-lg bg-muted p-4 text-sm sm:col-span-2"><b>直属主管</b><p className="mt-1 text-muted-foreground">{state.agents.find((item) => item.id === manager)?.name ?? '由所选部门主管派生；当前未设置'}</p></div>
        </div>}
        {step === 2 && ((importMode || referenceMode) ? <div className="rounded-lg border border-border p-5"><b>{importMode ? '来源正文已进入受管副本' : '本次不读取外部职责与边界'}</b><p className="mt-2 text-sm leading-6 text-muted-foreground">{importMode ? '确认后只编辑 Bandi 受管副本，原始 Claude Agent 文件保持不变。' : '只登记外部位置，不读取、复制或修改目录内容。'}</p></div> : <div className="grid gap-5 sm:grid-cols-2"><TextArea label="使命" value={mission} onChange={setMission} error={submitted && !mission.trim() ? '请输入使命。' : undefined} /><TextArea label="主要职责（每行一项）" value={responsibilities} onChange={setResponsibilities} error={submitted && !responsibilities.trim() ? '至少填写一项职责。' : undefined} /><TextArea label="交付物" value={deliverables} onChange={setDeliverables} /><TextArea label="决策边界" value={boundaries} onChange={setBoundaries} error={submitted && !boundaries.trim() ? '请明确决策边界。' : undefined} /><TextArea label="升级条件" value={escalations} onChange={setEscalations} /><TextArea label="禁止事项" value={prohibitions} onChange={setProhibitions} error={submitted && !prohibitions.trim() ? '请明确禁止事项。' : undefined} /><TextArea label="完成定义" value={completion} onChange={setCompletion} /></div>)}
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
              <p className="mt-1 text-sm text-muted-foreground">所属部门：{state.departments.find((item) => item.id === preview.departmentId)?.name ?? '未选择'} · 初始工作区：{state.workspaces.find((item) => item.id === workspaceId)?.name ?? '暂不设置'} · 跨部门授权：{grants.length} 项</p>
              <p className="mt-1 text-sm text-muted-foreground">初始长期权限：文件、命令、网络与委派均未授予</p>
              <p className="mt-2 text-xs text-muted-foreground">{desktop ? '技术标识' : '演示标识'}：{id}（由系统生成，创建后不可修改）</p>
            </div></div>
          </div>
          {requestedWorkspaceId && !state.workspaces.some((item) => item.id === requestedWorkspaceId) && <p role="alert" className="text-sm text-danger">预选工作区已不存在，没有使用其他工作区替代。</p>}
          <MockBoundaryNote>{importMode ? '只复制已预览的名称、描述和 Instructions；不导入正式记忆，不自动转换技能、规则或 MCP，也不授予文件、命令、网络或委派权限。' : referenceMode ? '只登记外部位置；不扫描、读取、复制或修改目录内容，也不授予任何权限。' : undefined}</MockBoundaryNote>
        </div>}
      </div>
      {saveError && <p role="alert" className="border-t border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{saveError}</p>}
      <div className="flex justify-between border-t border-border p-4"><Button variant="outline" disabled={saving} onClick={() => step === 1 ? navigate('/agents') : setStep((value) => value - 1)}>返回</Button>{step < 3 ? <Button onClick={() => { setSubmitted(true); if (canContinue) { setSubmitted(false); setStep((value) => value + 1) } }}>继续</Button> : <Button disabled={saving} onClick={() => void submit()}>{saving ? importMode ? '正在导入…' : referenceMode ? '正在登记…' : '正在创建…' : importMode ? '导入受管副本' : referenceMode ? desktop ? '登记外部引用' : '添加页面引用' : desktop ? '创建个人 Agent' : '创建演示 Agent'}</Button>}</div>
    </div>
    {unsavedChangesDialog}
  </>
}

function TextField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function TextArea({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 min-h-28 w-full p-3" />{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
function SelectField({ label, value, onChange, options, error, optional }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; error?: string; optional?: boolean }) { const id = `field-${label}`; return <label htmlFor={id} className="block text-sm font-medium">{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-2 h-10 w-full px-3"><option value="">{optional ? '暂不设置' : '请选择'}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{error && <span id={`${id}-error`} className="mt-1 block text-xs text-danger">{error}</span>}</label> }
