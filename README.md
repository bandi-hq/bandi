# Bandi（班底）

现实创业公司的本地数字孪生与长期 Agent 配置管理平面：在 Desktop 中可视化管理多 Agent 配置、组织关系和版本历史，在用户自己的 Claude Code CLI 中指挥班底工作。

> [!NOTE]
> 仓库当前包含 React Web Mock；Desktop、Rust Local Service、CLI 与 Plugin 的真实系统能力仍在设计和实现中，不建议用于生产环境。Web Mock 不读取或写入真实配置文件，业务变化只保存在当前页面内存。

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

Desktop 不建立任务中心、审批中心、运行监控台或 Session 镜像，也不为每次任务要求用户选人。它只展示 Workspace、cwd 和标准命令，帮助用户回到自己的 Claude Code；命令已复制或终端已请求打开，不代表 Session 已创建、已连接或已加载配置。

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

## 产品组成

```text
Bandi Desktop
    多 Agent 配置、组织关系、版本历史与正式记忆治理
        ↓
Rust Local Service
    配置发现、有效配置解析、安全写回、版本、备份与审计
        ↑
Bandi Plugin / bandi CLI
    Claude Code 侧配置读取、边界校验与 cwd / 命令衔接
        ↓
用户自己的 Claude Code CLI
    任务交互、分层委派、执行、授权、汇报与验收
```

## 当前有效文档

1. [产品与页面架构](./docs/产品与页面架构.md) — 产品边界、领域模型、页面架构与首版验收。
2. [页面低保真线框图](./docs/页面低保真线框图.md) — 配置工作台、Agent 配置、版本历史、条件 Dialog 与正式记忆审核。
3. [技术架构](./docs/技术架构.md) — 安全写回、ConfigRevision、MemoryRevision、BackupSnapshot 与 Plugin / CLI 边界。

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
