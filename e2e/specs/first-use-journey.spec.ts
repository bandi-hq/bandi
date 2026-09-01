import fs from 'node:fs/promises'
import path from 'node:path'
import { expect } from '@wdio/globals'
import {
  agentFiles,
  appDataPath,
  company,
  companyId,
  companyName,
  department,
  departmentId,
  departmentName,
  managedAgent,
  managedAgentsPath,
  managerAgentId,
  managerAgentName,
  role,
  workerAgentId,
  workerAgentName,
  workspace,
  workspaceId,
  workspaceName,
  workspacePath,
} from '../helpers/first-use-fixtures.js'

type JsonRecord = Record<string, unknown>
type SourceAsset = { id: string; kind: string; containerId: string }
type Discovery = {
  containers: Array<{ id: string; locator: { rootKind: string; relativePath?: string } }>
  assets: SourceAsset[]
  diagnostics: Array<{ severity: string; message: string }>
}
type Editor = { canonicalContent: string; baselineRef: JsonRecord }
type SaveResult = { kind: string; revision?: { id: string } }
type MemorySpace = { id: string; reviewerAgentId: string }
type EligibleSpaces = { spaces: MemorySpace[]; diagnostics: Array<{ severity: string; message: string }> }
type MemoryBundle = { candidate: { id: string; version: number; submittedBaseline: JsonRecord } }
type MemoryResult = { kind: string; revision?: { id: string } }
type Backup = { id: string; entryCount: number; entries: Array<{ assetId: string }> }
type OrganizationSnapshot = {
  companies: Array<{ id: string }>
  departments: Array<{ id: string; managerAgentId?: string }>
  roles: Array<{ id: string }>
  workspaces: Array<{ id: string }>
}
type ProjectedAgent = {
  id: string
  instructions: string
  permissions: { files: string; commands: string; network: string; delegation: string }
  workspaceBindings: Array<{ workspaceId: string }>
}

const invoke = <T>(session: WebdriverIO.Browser, command: string, args: JsonRecord = {}) => session.tauri.execute(
  (tauri, commandName: string, payload: JsonRecord) => tauri.core.invoke(commandName, payload) as Promise<T>,
  command,
  args,
)

async function createAgent(session: WebdriverIO.Browser, id: string, name: string, managerAgentId?: string) {
  const options = { id, name, managerAgentId }
  return invoke(session, 'create_managed_agent', {
    request: {
      agentId: id,
      agent: managedAgent(options),
      files: agentFiles(options),
      avatarBytes: null,
    },
  })
}

async function assetEditor(session: WebdriverIO.Browser, kind: string) {
  const discovery = await invoke<Discovery>(session, 'discover_config', {
    request: { requestId: `discover-${kind}`, workspaceIds: [workspaceId], includeClaudeUserRoot: false },
  })
  expect(discovery.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)
  const relativePath = kind === 'instructions' ? 'instructions.md' : `config/${kind}.yaml`
  const container = discovery.containers.filter((item) =>
    item.locator.rootKind === 'managed'
    && item.locator.relativePath === `agt_${workerAgentId}/${relativePath}`,
  )
  expect(container).toHaveLength(1)
  const matches = discovery.assets.filter((asset) => asset.kind === kind && asset.containerId === container[0].id)
  expect(matches).toHaveLength(1)
  const editor = await invoke<Editor>(session, 'load_config_editor', {
    request: { requestId: `load-${kind}`, assetId: matches[0].id },
  })
  return { asset: matches[0], editor }
}

async function saveConfig(session: WebdriverIO.Browser, kind: 'instructions' | 'permissions', value: string) {
  const { asset, editor } = await assetEditor(session, kind)
  const result = await invoke<SaveResult>(session, 'save_config', {
    request: {
      requestId: `save-${kind}`,
      assetId: asset.id,
      expectedOwner: { agentId: workerAgentId },
      change: { kind, value },
      expectedBaseline: editor.baselineRef,
      baseContent: editor.canonicalContent,
    },
  })
  expect(result.kind).toBe('saved')
  expect(result.revision?.id).toBeTruthy()
  return asset.id
}

async function assertPersistedFacts(session: WebdriverIO.Browser) {
  const snapshot = await invoke<OrganizationSnapshot>(session, 'load_organization_snapshot')
  expect(snapshot.companies.map((item) => item.id)).toContain(companyId)
  expect(snapshot.departments).toContainEqual(expect.objectContaining({ id: departmentId, managerAgentId }))
  expect(snapshot.roles.map((item) => item.id)).toContain(role.id)
  expect(snapshot.workspaces.map((item) => item.id)).toContain(workspaceId)

  const agents = await invoke<ProjectedAgent[]>(session, 'list_managed_agents')
  expect(agents).toHaveLength(2)
  const worker = agents.find((item) => item.id === workerAgentId)
  expect(worker?.instructions).toBe('首次旅程已保存的 Instructions')
  expect(worker?.permissions).toEqual({ files: '未授予', commands: '构建与测试', network: '禁止', delegation: '禁止' })
  expect(worker?.workspaceBindings.map((item) => item.workspaceId)).toContain(workspaceId)

  const revisions = await invoke<Array<{ id: string }>>(session, 'list_memory_revisions', {
    request: { requestId: 'list-memory-revisions', spaceId: `memory-agent-${workerAgentId}` },
  })
  expect(revisions).toHaveLength(1)

  const backups = await invoke<Backup[]>(session, 'list_backup_snapshots')
  expect(backups).toHaveLength(1)
  expect(backups[0].entryCount).toBe(1)

  await session.execute(() => { window.location.hash = '#/workspaces' })
  await expect(session.$('h1=工作区')).toBeDisplayed()
  await session.waitUntil(
    async () => (await session.$('body').getText()).includes(workspaceName),
    {
      timeoutMsg: `重启后的工作区页面未恢复 ${workspaceName}：${await session.$('body').getText()}`,
    },
  )
  await expect(session.$(`//a[normalize-space()="${workspaceName}"]`)).toBeDisplayed()
  await expect(session.$(`//*[contains(normalize-space(), "${companyName}")]`)).toBeDisplayed()
  await expect(session.$(`//small[normalize-space()="${departmentName}"]`)).toBeDisplayed()
  await expect(session.$('h1=先建立你的个人工作区')).not.toExist()
  expect(await session.$('body').getText()).not.toContain('知衡')

  await session.execute(() => { window.location.hash = '#/agents' })
  await expect(session.$('h1=Agents')).toBeDisplayed()
  await session.waitUntil(
    async () => {
      const text = await session.$('body').getText()
      return text.includes(managerAgentName) && text.includes(workerAgentName)
    },
    {
      timeoutMsg: `重启后的 Agent 页面未恢复两个 Agent：${await session.$('body').getText()}`,
    },
  )
  await expect(session.$(`//*[normalize-space()="${managerAgentName}"]`)).toBeDisplayed()
  await expect(session.$(`//*[normalize-space()="${workerAgentName}"]`)).toBeDisplayed()
}

describe('Desktop 首次使用真实闭环', () => {
  it(process.env.BANDI_E2E_VERIFY_ONLY === '1'
    ? '以相同数据目录启动新进程后恢复全部持久化事实'
    : '通过真实 IPC 创建、保存、审核和备份', async () => {
    if (process.env.BANDI_E2E_VERIFY_ONLY === '1') {
      await assertPersistedFacts(browser)
      return
    }

    await expect(browser.$('h1=先建立你的个人工作区')).toBeDisplayed()

    const persistedWorkspace = await invoke<typeof workspace>(browser, 'create_workspace', {
      request: { requestId: 'create-workspace', selectedPath: workspacePath, workspace },
    })
    expect(persistedWorkspace.path).toBe(workspacePath)

    await invoke(browser, 'save_company', { request: { company } })
    await invoke(browser, 'save_department', { request: { department } })
    await invoke(browser, 'save_role', { request: { role } })
    await createAgent(browser, managerAgentId, managerAgentName)
    await createAgent(browser, workerAgentId, workerAgentName, managerAgentId)

    const governedDepartment = {
      ...department,
      managerAgentId,
      manager: managerAgentName,
      members: 2,
      memberAgentIds: [managerAgentId, workerAgentId],
    }
    await invoke(browser, 'save_department', { request: { department: governedDepartment } })
    await invoke(browser, 'save_company', {
      request: { company: { ...company, assistantAgentId: managerAgentId, departmentIds: [departmentId] } },
    })
    await invoke(browser, 'save_workspace', {
      request: {
        workspace: {
          ...workspace,
          company: companyName,
          department: departmentName,
          companyId,
          primaryDepartmentId: departmentId,
          projectLeadAgentId: managerAgentId,
          agentIds: [managerAgentId, workerAgentId],
          departmentMemorySpaceIds: [`mem-${departmentId}-${workspaceId}`],
        },
      },
    })

    const bindingValue = `schemaVersion: 1\nworkspaceBinding: ${JSON.stringify({ workspaceId, instructions: '首次工作区专属配置', ruleIds: [], skillIds: [], mcpIds: [] })}`
    const binding = await invoke<SaveResult>(browser, 'create_workspace_binding', {
      request: { requestId: 'create-binding', agentId: workerAgentId, workspaceId, value: bindingValue },
    })
    expect(binding.kind).toBe('saved')

    const instructionsAssetId = await saveConfig(browser, 'instructions', '首次旅程已保存的 Instructions')
    await saveConfig(browser, 'permissions', 'schemaVersion: 1\npermissions:\n  files: "未授予"\n  commands: "构建与测试"\n  network: "禁止"\n  delegation: "禁止"')

    const eligible = await invoke<EligibleSpaces>(browser, 'discover_eligible_memory_spaces', {
      request: { requestId: 'discover-memory', agentId: workerAgentId },
    })
    expect(eligible.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)
    const agentMemory = eligible.spaces.find((item) => item.id === `memory-agent-${workerAgentId}`)
    expect(agentMemory?.reviewerAgentId).toBe(managerAgentId)

    const candidate = await invoke<MemoryBundle>(browser, 'create_memory_candidate', {
      request: {
        requestId: 'create-memory-candidate',
        candidateId: 'candidate-first-use',
        spaceId: agentMemory?.id,
        proposerAgentId: workerAgentId,
        source: { kind: 'manual', label: '真实首次旅程' },
        summary: '记录首次闭环',
        proposedContent: '首次旅程正式长期记忆',
      },
    })
    const reviewed = await invoke<MemoryResult>(browser, 'review_memory_candidate', {
      request: {
        requestId: 'approve-memory-candidate',
        candidateId: candidate.candidate.id,
        decision: 'approve',
        expectedCandidateVersion: candidate.candidate.version,
        expectedBaseline: candidate.candidate.submittedBaseline,
        comment: '由独立主管审核通过',
      },
    })
    expect(reviewed.kind).toBe('saved')
    expect(reviewed.revision?.id).toBeTruthy()

    const backup = await invoke<Backup>(browser, 'create_backup_snapshot', {
      request: { requestId: 'create-backup', scope: { kind: 'files', assetIds: [instructionsAssetId] } },
    })
    expect(backup.entryCount).toBe(1)
    expect(backup.entries[0].assetId).toBe(instructionsAssetId)

    expect(await fs.readFile(path.join(managedAgentsPath, `agt_${workerAgentId}`, 'instructions.md'), 'utf8')).toBe('首次旅程已保存的 Instructions')
    expect(await fs.readFile(path.join(managedAgentsPath, `agt_${workerAgentId}`, 'memory', 'long-term.md'), 'utf8')).toBe('首次旅程正式长期记忆')
    expect(JSON.parse(await fs.readFile(path.join(appDataPath, 'workspaces', `${workspaceId}.json`), 'utf8'))).toMatchObject({ workspaceId, canonicalPath: workspacePath })
    await expect(fs.stat(path.join(appDataPath, 'bandi.db'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(appDataPath, 'revisions'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(appDataPath, 'backups', backup.id))).resolves.toBeDefined()

  })
})
