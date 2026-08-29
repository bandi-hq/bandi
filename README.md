# Bandi（班底）

现实创业公司的本地数字孪生：在客户端中管理公司，在 Claude Code 中指挥班底工作。

> [!NOTE]
> Bandi 目前处于产品与页面架构确认阶段，仓库暂未包含可运行的客户端、Plugin 或 CLI 代码，不建议用于生产环境。

## 产品定位

Bandi 把一家现实创业公司的组织和协作方式映射到用户本机：

- **董事长**是真实用户，负责方向、关键审批和最终验收；
- **董事长助理 Agent**是 Claude Code 中的主要交互入口，负责公司级与跨部门协调；
- **部门主管 Agent**驱动部门级工作流并调度本部门员工；
- **专业与执行 Agent**按授权编排岗位级或任务级工作流，或执行具体步骤；
- **Workspace**对应真实项目的本地工作环境；首版“项目记忆”以 Workspace 为项目边界，不新增并列 Project 对象；
- **Workflow**对应公司的协作制度和具体执行流程。

Bandi 支持管理多家 Company；每个 Company 表示一家现实公司的数字孪生，而不是随意生成的虚拟 AI 公司。

每个长期 Agent 由独立的 `AgentPackage` 目录承载，其中可以包含灵魂、岗位职责、规则、长期记忆、能力、权限、编排策略和 Workspace 覆盖。编排能力由明确授权决定，不由“助理”“主管”或“员工”等身份标签硬编码。

记忆按 `MemorySpace` 分层治理：

- 每个长期 Agent 拥有跨 Workspace 延续的独立长期记忆；
- 每个 Agent 在每个 Workspace 下拥有相互隔离的项目记忆；
- 董事长助理在每个 Workspace 下另有项目管理记忆，用于协调、风险、依赖、汇报和待决策事项；
- Workspace 公共记忆归 Workspace 所有，由董事长助理归口维护，不属于助理个人；
- 部门项目记忆归 `Department × Workspace` 边界所有，由部门主管归口，不属于主管个人。

文件是记忆载体，MemorySpace 才是所有权、作用域、审核和可见性的领域边界。运行或人工编辑只能先形成 `MemoryCandidate`，经权限校验、审核、Diff、备份和原子写入后才生成 `MemoryRevision`。

## 产品组成

```text
Bandi Desktop
    管理公司、部门、岗位、Agent、Workflow、Workspace、权限和证据
    ↓
Rust Local Service
    统一保存和裁决事实、策略、投影、审计及受限本地操作
    ↑                         ↑
bandi CLI                Bandi Claude Code Plugin
系统 Shell 入口           Skill + 董事长助理 Agent + Bandi MCP + Hooks + settings
                              ↓
                      用户自己的 Claude Code CLI
```

职责边界：

- **Bandi Desktop**是管理与关系可视化平面，不是另一套 Claude Code，也不负责实际推理执行；
- **Rust Local Service**是 Desktop、CLI 和 Plugin 共用的事实与策略中枢；SQLite 是其持久化实现之一；
- **Bandi Plugin**是 Claude Code 侧的正式安装和能力载体，不保存另一套公司事实；
- **Bandi MCP**是 Plugin 连接 Local Service 的结构化接口，不取代 Workflow、组织关系或审批策略；
- **Hooks**用于门禁、审计和有限事件证据，但其存在不等于已经具备可靠 Runtime Connector；
- **Claude Code CLI**始终由用户自己安装和使用，Bandi 不接管用户账号。

## 进入 Bandi

Bandi 提供多个入口，但所有入口都读取同一个 Local Service：

| 入口 | 用途 | 说明 |
| --- | --- | --- |
| `bandi` | 系统 Shell 入口 | 查看状态、快速接入指引或完整启动新会话 |
| `/bandi:bandi` | Claude Code Plugin 标准入口 | Plugin Skill 使用命名空间后的确定性调用方式 |
| `/bandi` | 可选短别名 | 需要额外安装 standalone Skill/Command，只做薄转发，不复制业务逻辑 |
| “小班”“班底”“董事长助理”等自然语言 | 语义触发候选 | 是否触发取决于上下文和模型判断，不是确定性唤醒词 |
| Bandi Desktop | 可视化入口 | 管理公司关系，并引导快速接入或完整启动 |

需要确定性行为时，应使用 `bandi` CLI 或 `/bandi:bandi`。自然语言触发在意图不明确、存在多个公司或涉及实际操作时仍须确认。

## 两种进入模式

### 快速接入当前会话（`attach_current`）

```text
用户已经位于 Claude Code 会话
→ 调用 /bandi:bandi attach-current，或表达并确认 Bandi 意图
→ Plugin 获取当前 cwd 和可证明的会话上下文
→ Local Service 匹配 Workspace、Company、董事长助理与策略
→ 有歧义时由董事长选择
→ 将 AttachmentContext 提供给当前会话
```

它不创建新 Claude Session、不打开新终端，也不能保证重建当前会话启动时的全部 Agent、settings、权限或模型配置。

### 完整启动新会话（`launch_new`）

```text
从 Bandi Desktop、bandi CLI 或 Plugin 发起
→ 选择或确认 Company 与 Workspace
→ 解析董事长助理、可委派 Agent、Workflow 和编排策略
→ 编译并校验完整 RuntimeProjection（含权限过滤、保留来源和版本的 MemoryProjection）
→ 董事长确认启动摘要
→ 创建新的董事长助理 Claude Code 会话上下文
```

这是完整、可审计的启动路径。命令已生成、命令已复制或终端已请求打开，都不等于新 Session 已可靠关联。

| 差异 | `attach_current` | `launch_new` |
| --- | --- | --- |
| 新建 Claude 会话 | 否 | 是 |
| 打开新终端 | 否 | 视启动方式而定 |
| 完整编译 RuntimeProjection | 否，只解析接入上下文 | 是 |
| 记忆上下文 | 权限过滤后的有限 MemoryContext，不保证完整加载 | 完整、版本化 MemoryProjection |
| 保留当前会话已有上下文 | 是 | 新会话隔离 |
| 适用场景 | 已在 Claude Code 中，希望立即接入公司 | 需要完整董事长助理身份、权限和配置 |

## 分层协作关系

```text
董事长（真实用户）
    ↓ 下达目标、关键审批、最终验收
董事长助理 Agent
    ↓ 公司级 / 跨部门 Workflow，委派部门目标
部门主管 Agent
    ↓ 部门级 Workflow，调度本部门员工
专业或执行 Agent
    ↓ 获授权的岗位/任务级子工作流，或具体步骤
部门主管 → 董事长助理 → 董事长
    逐级汇总交付物、证据、阻塞和审批结果
```

## 当前产品原则

- **映射现实公司**：组织、岗位、Agent、Workflow 和 Workspace 服务于真实经营与交付关系。
- **多入口、单一中枢**：Desktop、CLI 和 Plugin 不分别维护公司事实。
- **董事长拥有最终决定权**：任何 Agent 都不能伪造董事长同意或替代最终验收。
- **编排能力分层授权**：董事长助理、主管和专业 Agent 都可以在授权范围内编排。
- **Agent 是目录化长期员工**：AgentPackage 不等于单个 Prompt、Plugin Agent 或某次执行。
- **Workflow 负责协作**：MCP 只是访问工作流服务的连接层。
- **Plugin 与投影分离**：Plugin 是稳定安装基线；RuntimeProjection 是公司、Workspace 和策略的动态可重建快照。
- **快速接入不等于完整启动**：两种模式具有不同能力和证据边界。
- **记忆按所有权和作用域隔离**：Agent 长期、Agent 项目、助理项目管理、Workspace 公共和部门项目记忆不能混为一体。
- **候选先审后写**：Agent、Plugin、MCP 和 Hooks 不能直接修改正式长期记忆，提议者不能自审。
- **投影保留来源**：MemoryProjection 保留作用域、所有者、版本、哈希、纳入原因和权限结果，冲突不静默覆盖。
- **状态必须有证据**：候选获批、文件写入、投影重编译、Runtime 加载、Session 关联和任务完成是不同事实。
- **用户掌握执行过程**：不内嵌或替代 Claude Code，不在后台隐藏执行。

## 当前有效文档

1. [产品与页面架构](./docs/产品与页面架构.md)  
   数字孪生定位、角色关系、五类 MemorySpace、记忆候选治理、Plugin 与双入口模型、页面职责和首版范围。
2. [页面低保真线框图](./docs/页面低保真线框图.md)  
   公司关系管理、AgentPackage、分层记忆、候选审核、Workflow、Claude Code 集成、快速接入、完整启动和运行证据线框。
3. [技术架构](./docs/技术架构.md)  
   Desktop、Rust Local Service、Bandi Plugin、CLI、Memory Service、双入口契约、MemoryProjection 和证据边界。

## 历史归档

以下文档保留早期讨论和方案研究，但不再作为当前施工契约：

- [AI 组织操作系统产品设计文档 v0.9](./docs/archive/AI组织操作系统-产品设计文档-v0.9.md)
- [班底前端界面改造执行方案 v0.1](./docs/archive/班底-前端界面改造执行方案-v0.1.md)

## 当前状态

当前已确认：

1. Bandi 是现实创业公司的本地数字孪生；
2. Desktop 是管理与关系可视化平面；
3. Local Service 是统一事实与策略中枢；
4. Bandi Plugin 是正式 Claude Code 交付载体；
5. 董事长助理、部门主管和获授权 Agent 采用分层编排；
6. `attach_current` 与 `launch_new` 必须严格区分；
7. 五类 MemorySpace 的所有权、归口、审核与隔离边界固定；
8. 每个 Agent × Workspace 拥有独立项目记忆载体；
9. 运行记忆先形成 MemoryCandidate，审核和安全写回后才生成 MemoryRevision；
10. 完整启动包含 MemoryProjection，快速接入只有有限 MemoryContext；
11. MCP/Hooks 首版存在，但可靠 Runtime Connector 后续演进。

后续仍需验证 Plugin 安装作用域、可选 `/bandi` 薄别名、当前会话可获得的宿主字段、最小 Hook 事件范围、具体 Claude Code CLI 参数，以及 MemorySpace 的物理目录、文件名、格式和旧记忆迁移策略。

## 计划技术方向

- Tauri 2 + React + TypeScript + Vite；
- Rust Local Service + SQLite/WAL；
- Bandi Claude Code Plugin；
- Bandi Skill 与董事长助理 Custom Agent；
- Bandi MCP Server 与最小 Hooks；
- Plugin settings 与 Workspace 覆盖；
- `bandi` 系统 CLI；
- Tailwind CSS v4 + shadcn/ui + Radix + Lucide；
- macOS 首发，Windows 后续；
- 本地优先，可靠 Runtime Connector 和远程能力渐进演进。

具体依赖版本、安装方式和 Claude Code 参数将在正式初始化实现时按目标版本验证。

## 参与和反馈

现阶段欢迎通过 Issue 提供：

- 对数字孪生定位、角色模型和页面线框的反馈；
- 真实创业公司、多 Agent、多 Workflow 和多 Workspace 场景；
- Plugin、CLI、快速接入和完整启动需求；
- AgentPackage、五类 MemorySpace 与 Claude Code 运行投影需求；
- 记忆候选审核、项目隔离和迁移场景；
- 文档、边界和可验证的小型改进。

涉及新功能、大型重构或核心行为变化的贡献，请先创建 Issue 讨论，确认方向后再开始实现。

## 项目发起

Bandi 由 [@zemu2718](https://github.com/zemu2718) 发起，目前采用发起者主导的方式推进，由 [Bandi HQ](https://github.com/bandi-hq) 维护官方项目。

## License

仓库当前包含 [Apache License 2.0](./LICENSE)。正式公开和接受外部代码贡献前，将再次确认依赖、第三方素材和 NOTICE 要求。
