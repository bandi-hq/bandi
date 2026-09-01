# Bandi（班底）

现实创业公司的本地数字孪生与长期 Agent 配置管理平面：在 Desktop 中可视化管理多 Agent 配置、组织关系和版本历史，在用户自己的 Claude Code CLI 中指挥班底工作。

> [!NOTE]
> 仓库当前包含 React Web Mock、Tauri Desktop、本地 Rust 领域服务、SQLite/WAL、Workspace Registry、AI Adapter Registry、RestrictedConfigWriter、`bandi` CLI 与 Bandi Plugin；仍不建议用于生产环境。纯 Web 继续使用明确标识的页面内存演示，Desktop 已接入的真实能力以本地服务回执、受管文件事实和共享合同为准。

## 核心边界

Bandi Desktop 管理“下次及以后如何工作”的长期配置：

- 基于稳定 `agent-id` 的 AgentPackage；
- Instructions、Skills、正式 Memory、Rules、MCP、长期权限和 SOP；
- Agent × Workspace 专属配置；
- 多 Company、树形 Department、岗位、成员与明确服务授权；
- 配置保存版本、文件历史、版本 Diff 与恢复；
- 外部文件变化、配置文件冲突、共享配置影响和高风险长期变更确认；
- 正式 `MemoryCandidate → Review → MemoryRevision` 治理；
- 独立的本地快照与私有 Git 备份策略。

用户自己的 Claude Code CLI 管理“这一次正在如何工作”：

- 目标与方案确认；
- 部门和员工分配；
- 执行、阻塞与调整；
- 某次工具调用的一次性权限授权；
- 任务冲突、任务审批、逐级汇报与最终验收；
- 聊天、工具调用、Todo、日志、Agent View、Session 和执行状态。

Desktop 不建立任务中心、审批中心、运行监控台或 Session 镜像，也不为每次任务要求用户选人。界面中的**工作区**是一个本地项目及其长期配置作用域，**本地目录**是该工作区登记的路径，只有进入外部 CLI 的指引才将这个路径称为**工作目录（cwd）**。当前工作区交接契约只接受 `clientId / adapterId / workspaceId / terminalId / intent`，由后端从 Workspace Registry 重取 canonical cwd，并仅通过固定 `/usr/bin/open` 请求白名单终端打开目录。通用 `executable`、`argv`、Shell、自动执行 `/bandi:bandi` 和 fallback 命令回传均不属于产品能力。交接被系统接受也不代表客户端已安装、连接、运行或创建了 Session。

首版内置 AI 编程工具目录固定为 Claude Code、Claude Desktop、Codex、Gemini CLI、Grok Build、OpenCode、OpenClaw、Hermes 和 Pi；完整稳定 ID 与逐项能力状态见[首版能力矩阵](./docs/首版能力矩阵.md)。目录身份只表示 Bandi 能稳定识别该工具，不证明本机安装、配置、连接、交接或 Bandi 集成可用。用户可以同时在 Claude Code、Codex、OpenClaw 等宿主工具中打开多个终端；DeepSeek 等通常是宿主工具中的 Model / Provider，不单独视为终端客户端。Bandi 不跟踪这些终端或会话，多个外部程序对配置文件的影响统一通过“编辑基线 → 保存前复核 → 三方 Diff → 解决冲突后重新保存”处理，也不猜测修改来自哪个终端。

## 日常主线

```text
选择 Agent
→ 查看配置
→ 修改
→ 保存并记录 ConfigRevision
→ 按需查看历史、比较或恢复
→ 回到 Claude Code 使用
```

普通配置直接保存，不经过通用草稿、审批或发布流程。只有三类场景打断主线：

1. 数据安全异常，例如外部并发变化或配置文件冲突；
2. 用户正在发起的高风险长期变更，例如扩大 AgentPackage 权限、恢复或永久删除；
3. 正式记忆治理。

权限收紧可以普通保存；永久扩大文件、命令、网络、MCP、数据或委派边界时需要长期权限变更确认。当前任务的一次性授权只在 Claude Code 对话中处理，不自动长期化。

## 配置版本、正式记忆与备份

- **ConfigRevision**：普通配置每次成功写后验证产生的不可变单资产版本；可比较和恢复，恢复产生新 revision，旧历史不变。
- **MemoryRevision**：正式 MemoryCandidate 获批并安全写入后产生的版本；不能绕过审核走普通配置保存。
- **BackupSnapshot**：跨 Agent、Company 或文件的容灾快照；不替代日常版本、基线检查或原子写入。
- **RuntimeProjection**：CLI / Plugin 按需从当前配置重建的运行时产物；不是 Desktop 的发布对象、配置主源或 Session 状态。

远程 Git 备份只允许私有仓库。凭据、Token、钥匙串数据以及 Claude Code 的聊天与执行过程永不备份；正式 Memory 是否进入远程备份需用户单独确认。

## SOP

SOP 是供 Claude Code 中的董事长助理和部门主管解析的长期配置定义，描述目标、步骤、责任部门/岗位、输入输出、依赖、确认条件、升级条件和验收标准。Desktop 只负责查看、编辑、保存和版本追溯；不运行 SOP、不产生任务待办或审批队列。

## 当前已接入

- **React Web Mock**：配置管理界面与页面内存演示事实；`demo-fixture` 表示预置演示资料，`memory-only` 表示本次页面内存操作。
- **Tauri Desktop 与本地服务**：受限配置发现与编辑器加载、受管 AgentPackage、Workspace Registry、Organization SQLite、全配置族安全保存、ConfigRevision、四类正式 Memory、本地 Backup/Restore、共享资产只读索引与显式引用图。
- **安全写入链**：稳定资产身份、双哈希基线、外部变化保护、受限原子写入、重读验证和 Revision；恢复与扩大长期权限保留独立确认。
- **AI 工具目录与交接**：9 个稳定工具/Adapter 身份；当前只有经验证组合可以请求白名单终端打开 Registry 中的 canonical cwd，不启动 AI 工具或管理 Session。
- **CLI 与 Plugin**：`bandi doctor`、`bandi status`、`bandi config check` 复用本地配置事实；Plugin 提供白名单只读入口，不绕过服务写配置或正式 Memory。
- **本机个性化窄能力**：固定 `logo` / `background` 槽位和受管 Agent PNG 头像；不接受任意目标路径或远程 URL。
- **正交状态证据**：数据来源使用 `real / memory-only / demo-fixture / read-only`，系统能力使用 `supported / degraded / unavailable / not_checked`。配置目录项、客户端条目、文件存在或按钮可见性都不能证明已安装、已连接、已保存、已启动或已加载 Session。

共享资产本体当前只提供受限根内的可信只读 discovery、组织归属校验和反向引用诊断，不提供创建、编辑、删除、安装或执行事务。跨 Company 独立共享授权尚未建模，越界引用明确标记为 `out_of_scope`。

## 系统组成

```text
Bandi Desktop
    多 Agent 配置、组织关系、版本历史与正式记忆治理
        ↓
Rust Local Service
    配置发现、有效配置解析、RestrictedConfigWriter、版本与审计
    Workspace Registry、AI Adapter Registry、SQLite/WAL
        ↑
Bandi Plugin / bandi CLI
    Claude Code 侧配置读取、边界校验与受限终端交接
        ↓
用户自己的 Claude Code CLI
    任务交互、分层委派、执行、授权、汇报与验收
```

Local Service 是本机领域服务和唯一受控配置写入边界；SQLite/WAL 保存组织、注册表、策略、版本元数据、正式记忆治理与本地快照元数据，不取代真实配置资产。Workspace Registry 保存经用户登记和验证的工作区身份与 canonical path；AI Adapter Registry 保存受支持客户端的稳定 adapter ID、能力声明和验证证据，不接受任意可执行程序或参数模板。各能力的真实、降级、不可用与未检查状态以[首版能力矩阵](./docs/首版能力矩阵.md)为准。

## 当前有效文档

1. [产品与页面架构](./docs/产品与页面架构.md) — 产品边界、领域模型、页面架构与首版验收。
2. [页面低保真线框图](./docs/页面低保真线框图.md) — 配置工作台、Agent 配置、版本历史、条件 Dialog 与正式记忆审核。
3. [技术架构](./docs/技术架构.md) — 安全写回、ConfigRevision、MemoryRevision、BackupSnapshot 与 Plugin / CLI 边界。
4. [本地服务与前端联调契约](./docs/本地服务与前端联调契约.md) — Rust / TypeScript 跨进程 DTO、结果与事件契约。
5. [首版能力矩阵](./docs/首版能力矩阵.md) — 当前真实、降级、不可用与未检查能力证据。
6. [首版验收报告](./docs/首版验收报告.md) — 自动化、Chromium、故障场景、迁移回滚与用户验收脚本。

`docs/archive/**` 为历史讨论，不作为当前施工契约。

## 技术方向

- Tauri 2 + React 19 + TypeScript + Vite；
- Rust Local Service + SQLite/WAL；
- Tailwind CSS v4 + Radix + Lucide；
- Bandi Claude Code Plugin、MCP 与 `bandi` CLI；
- macOS 首发，Windows 后续；
- 本地优先，远程能力按真实需求渐进演进。

## License

仓库当前包含 [Apache License 2.0](./LICENSE)。
