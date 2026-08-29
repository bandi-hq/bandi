# Bandi（班底）

现实创业公司的本地数字孪生：在客户端中可视化管理多 Agent 配置与组织关系，在 Claude Code 中指挥班底工作。

> [!NOTE]
> Bandi 目前处于产品与页面架构确认阶段，仓库暂未包含可运行的客户端、Plugin 或 CLI 代码，不建议用于生产环境。

## 产品定位

Bandi 把一家现实创业公司的组织和协作方式映射到用户本机：

- **董事长**是真实用户，负责方向、关键审批和最终验收；
- **董事长助理 Agent**是 Claude Code 中的主要交互入口，负责公司级与跨部门协调；
- **部门主管 Agent**驱动部门级工作流并调度本部门员工；
- **专业与执行 Agent**按授权编排岗位级或任务级工作流，或执行具体步骤；
- **Workspace**对应真实项目的本地工作环境；首版“项目记忆”以 Workspace 为项目边界，不新增并列 Project 对象；Workspace 可暂不关联但最多归属一个 Company，每个已关联组织的 Workspace 只有一个主责部门和默认项目负责人，可有多个同公司协作部门；
- **Workflow**对应公司的协作制度和具体执行流程。

Bandi 支持管理多家 Company；每个 Company 表示一家现实公司的数字孪生，而不是随意生成的虚拟 AI 公司。Workspace 可以暂不关联组织，但首版最多归属一个 Company，其主责部门和协作部门必须来自该 Company，不能同时加载多家公司的组织、默认配置和安全边界。组织页通过树形 Department 管理公司、部门上下级、主管、岗位、成员和委派边界；组织或 Workspace 公司归属调整只改变关系，不隐式改写 AgentPackage 配置。

每个长期 Agent 由基于稳定 `agent-id` 的独立 `AgentPackage` 目录承载，其中可以包含灵魂、岗位职责、Instructions、Skills、Memory、Rules、MCP、权限、编排策略、工作流（SOP）和该 Agent 的 Workspace 专属配置。Agent 最多只有一个主属部门，但可以通过明确限定能力、Workspace 和边界的服务授权协助多个部门；移动主属部门不移动 AgentPackage。部门、岗位、主管或服务关系只用于组织、职责与委派判断，不形成隐式配置继承或权限授予。编排能力由明确授权决定，不由“助理”“主管”或“员工”等身份标签硬编码。

Bandi Desktop 的日常主线保持简单：

```text
选择员工 Agent
→ 查看完整配置
→ 通过表单或原始文件修改
→ 保存到对应真实配置文件
→ 回到 Claude Code 使用
```

普通 Skill、Rules、MCP、权限、Agent × Workspace 专属配置和 SOP 修改不要求统一的草稿、审批或发布流程。Company / 全局配置只提供 Claude Code 底层公共配置、普通默认、显式共享资产和不可突破的安全边界；Agent 自有设置优先于普通默认，公共 Skill、Rule、MCP 和 SOP 只有被 AgentPackage 显式引用后才生效。共享资产首版以 Company 内共享为主，跨 Company 必须单独注册并明确授权；局部定制写入 Agent 自有配置，不直接修改共享本体。组织身份不自动授予权限，Agent 可以自行收紧但不能自行扩大权限。来源关系按需解释；Diff、共享影响、冲突处理和额外确认只在用户主动查看、共享资产本体被修改、文件发生外部并发变化、存在真实冲突或扩大高风险权限时出现。

设置中提供独立的“备份与恢复”入口：首版以本地手动/自动快照、历史和按 Company、Agent 或文件恢复为主，恢复前先保存当前状态。后续 Git 远程备份只连接私有仓库；Bandi 自动创建的仓库固定为 Private，凭据、Token、钥匙串数据和 Claude Code 执行过程永不进入备份，正式记忆进入远程备份前需要用户单独确认。

Agent 暂时不用时优先停用，长期保留时归档；两种状态都保留 AgentPackage、正式记忆和历史，但不再接受新委派。永久删除 AgentPackage 是独立高风险操作，不能因移出部门或删除组织关系而隐式发生。

任务相关交互统一发生在用户自己的 Claude Code CLI 中。董事长只需与董事长助理对话；助理依据客户端维护的组织、职责、Skills、Workspace、权限和 SOP 配置，优先委派 Workspace 主责主管，并按需协调协作部门主管，各主管再选择本部门员工。主责主管汇总项目结果，协作主管只对本部门交付负责；董事长助理负责跨部门协调与升级，不接管项目台账。目标确认、跨部门分配、执行协作、阻塞处理、逐级汇报和最终验收都不在 Desktop 中另建交互界面。用户无需在客户端为每次任务手动选择参与部门或员工。

记忆按 `MemorySpace` 分层治理：

- 每个长期 Agent 拥有跨 Workspace 延续的独立长期记忆；
- 每个 Agent 在每个 Workspace 下拥有相互隔离的项目记忆；董事长助理用自己的项目记忆保存与董事长、部门主管交互形成的协调、汇报和待决策摘要；
- Workspace 公共记忆归 Workspace 所有，由唯一的项目主责部门主管归口；主责主管同时作为默认项目负责人，对总体结果、公共事实整理、跨部门进展汇总和向董事长助理汇报负责，不属于任何个人 Agent；
- 部门项目记忆归 `Department × Workspace` 边界所有；主责部门与各协作部门主管分别维护本部门的目标、计划、进展、风险、依赖、分工和交付，协作主管不接管 Workspace 公共记忆或其他部门台账；
- 董事长助理的跨 Workspace 总记忆属于其 Agent 长期记忆，不另设助理项目管理 MemorySpace。

文件是记忆载体，MemorySpace 才是所有权、作用域、审核和可见性的领域边界。运行或人工编辑只能先形成 `MemoryCandidate`，经权限校验、审核、Diff、备份和原子写入后才生成 `MemoryRevision`。

## 产品组成

```text
Bandi Desktop
    管理公司、部门、岗位及 Agent 的 Skill、Memory、Rules、MCP、权限、Agent × Workspace 专属配置和 SOP
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

- **Bandi Desktop**首先是多 Agent 配置资产与组织关系的可视化管理平面，负责查看、编辑并保存真实配置文件；它不是另一套 Claude Code，也不负责实际推理执行；
- **Rust Local Service**是 Desktop、CLI 和 Plugin 共用的事实与策略中枢；SQLite 是其持久化实现之一；
- **Bandi Plugin**是 Claude Code 侧的正式安装和能力载体，不保存另一套公司事实；
- **Bandi MCP**是 Plugin 连接 Local Service 的结构化接口，不取代 Workflow、组织关系或审批策略；
- **Hooks**用于门禁、审计和有限事件证据，但其存在不等于已经具备可靠 Runtime Connector；
- **Claude Code CLI**始终由用户自己安装和使用，实际任务执行及聊天、工具调用、Todo、日志等大量中间状态留在终端，Bandi 不接管用户账号或镜像完整执行过程。

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

## Claude Code 中的分层协作

以下交互全部发生在用户自己的 Claude Code CLI 中：

```text
董事长（真实用户）
    ↓ 向董事长助理下达目标
董事长助理 Agent
    ↓ 按需选择必要部门，复杂事项先向董事长确认简明协作方案
部门主管 Agent
    ↓ 根据职责、Skills、Workspace 绑定和权限选择本部门员工
专业或执行 Agent
    ↓ 完成具体工作，必要时按授权组织任务级子流程
部门主管 → 董事长助理 → 董事长
    逐级汇总交付物、阻塞、审批结果和最终汇报
```

低风险事项可由助理说明分配方式后直接推进；多部门复杂事项先在终端确认参与部门、目标、依赖和关键审批点；高风险动作在实际执行前再次确认。一次性协作过程默认留在终端，只有具有复用价值且董事长明确同意时，才将其整理并保存为正式 SOP。

## 当前产品原则

- **映射现实公司**：组织、岗位、Agent、Workflow 和 Workspace 服务于真实经营与交付关系；Workspace 可未关联但最多归属一个 Company，避免跨公司责任和安全边界混合。
- **多入口、单一中枢**：Desktop、CLI 和 Plugin 不分别维护公司事实。
- **董事长拥有最终决定权**：任何 Agent 都不能伪造董事长同意或替代最终验收。
- **编排能力分层授权**：董事长助理、主管和专业 Agent 都可以在授权范围内编排。
- **Agent 是配置独立的目录化长期员工**：每个 AgentPackage 以稳定 `agent-id` 独立拥有配置，不等于单个 Prompt、Plugin Agent 或某次执行；目录不随部门移动，停用和归档不删除档案。
- **公共配置不隐式继承**：部门和岗位不向 Agent 自动注入配置；全局提供普通默认、显式共享资产和强制安全边界，Agent 自有设置优先于普通默认。
- **终端负责事项协作**：目标确认、部门与员工分配、执行、阻塞、汇报和验收都在 Claude Code 中完成；Desktop 不提供第二套任务交互界面。
- **SOP 是配置定义**：SOP 描述责任部门/岗位、输入输出、依赖和审批边界，由 Claude Code 中的助理与主管解析使用；MCP 只是结构化连接层。
- **Plugin 与投影分离**：Plugin 是稳定安装基线；RuntimeProjection 是公司、Workspace 和策略的动态可重建快照。
- **快速接入不等于完整启动**：两种模式具有不同能力和证据边界。
- **四类记忆按所有权和作用域隔离**：Agent 长期、Agent × Workspace、Workspace 公共和 Department × Workspace 不能混为一体；每个 Workspace 由唯一主责主管承担总体责任和公共记忆归口，各协作主管维护本部门项目记忆，助理只沉淀交互形成的长期总记忆和协调摘要。
- **候选先审后写**：Agent、Plugin、MCP 和 Hooks 不能直接修改正式长期记忆，提议者不能自审。
- **投影保留来源**：MemoryProjection 保留作用域、所有者、版本、哈希、纳入原因和权限结果，冲突不静默覆盖。
- **普通配置直接保存**：必要校验通过后写回明确的真实文件；来源、Diff、影响和冲突只在解释或异常处理时出现，不建立通用发布生命周期。
- **正式记忆是治理例外**：任何写入正式 MemorySpace 的变化都先形成 MemoryCandidate，提议者不能自审；获批写入后生成 MemoryRevision。
- **备份独立于保存安全**：本地快照和私有 Git 远程备份用于历史恢复与容灾，不能代替基线检查、原子写入和外部变化保护。
- **远程备份默认私有**：Bandi 创建的 Git 仓库固定为 Private，不备份凭据与执行过程；正式记忆远程备份单独确认。
- **状态必须有证据**：保存成功、备份完成、远端推送、候选获批、记忆文件写入、投影重编译和 Runtime 加载是不同事实。
- **用户掌握执行过程**：不内嵌或替代 Claude Code，不复制 Agent View，不在后台隐藏或镜像完整执行过程。

## 当前有效文档

1. [产品与页面架构](./docs/产品与页面架构.md)  
   多 Agent 配置管理主线、数字孪生角色关系、四类 MemorySpace、正式记忆候选治理、Plugin 与双入口边界。
2. [页面低保真线框图](./docs/页面低保真线框图.md)  
   Agent 完整配置、直接保存、按需诊断、条件异常处理、组织与 Workspace、SOP、Claude Code 文件衔接和记忆审核线框。
3. [技术架构](./docs/技术架构.md)  
   Desktop、Rust Local Service、真实配置文件安全写回、Bandi Plugin、CLI、Memory Service 和启动投影边界。

## 历史归档

以下文档保留早期讨论和方案研究，但不再作为当前施工契约：

- [AI 组织操作系统产品设计文档 v0.9](./docs/archive/AI组织操作系统-产品设计文档-v0.9.md)
- [班底前端界面改造执行方案 v0.1](./docs/archive/班底-前端界面改造执行方案-v0.1.md)

## 当前状态

当前已确认：

1. Bandi 是现实创业公司的本地数字孪生；
2. Desktop 首先是多 Agent 配置资产与组织关系的可视化管理平面，普通配置遵循“查看—修改—保存”；
3. Local Service 是统一事实、策略与真实配置文件安全操作中枢；
4. Bandi Plugin 是正式 Claude Code 交付载体；
5. 董事长助理、部门主管和获授权 Agent 采用分层编排；
6. `attach_current` 与 `launch_new` 必须严格区分；
7. 四类 MemorySpace 的所有权、归口、审核与隔离边界固定；
8. 每个 Agent × Workspace 拥有独立项目记忆载体；
9. 所有正式 MemorySpace 变化先形成 MemoryCandidate，审核和安全写回后才生成 MemoryRevision；
10. 来源、Diff、共享影响、冲突和高风险确认按条件出现，不是普通保存的固定步骤；
11. 完整启动包含 MemoryProjection，快速接入只有有限 MemoryContext；
12. 任务执行和大量中间状态留在 Claude Code CLI，客户端不建设完整运行监控台。

后续仍需验证 Plugin 安装作用域、可选 `/bandi` 薄别名、当前会话可获得的宿主字段、最小 Hook 事件范围、具体 Claude Code CLI 参数，以及 MemorySpace 的物理目录、文件名、格式和旧记忆迁移策略。

## 计划技术方向

- Tauri 2 + React + TypeScript + Vite；
- Rust Local Service + SQLite/WAL；
- Bandi Claude Code Plugin；
- Bandi Skill 与董事长助理 Custom Agent；
- Bandi MCP Server 与最小 Hooks；
- Plugin settings 与 Agent × Workspace 专属配置；
- `bandi` 系统 CLI；
- Tailwind CSS v4 + shadcn/ui + Radix + Lucide；
- macOS 首发，Windows 后续；
- 本地优先；真实文件、编辑器、Finder、系统终端与 Claude Code 顺畅衔接；远程能力按实际需求渐进演进。

具体依赖版本、安装方式和 Claude Code 参数将在正式初始化实现时按目标版本验证。

## 参与和反馈

现阶段欢迎通过 Issue 提供：

- 对数字孪生定位、角色模型和页面线框的反馈；
- 真实创业公司、多 Agent、多 Workflow 和多 Workspace 场景；
- Plugin、CLI、快速接入和完整启动的必要衔接需求；
- AgentPackage、配置文件编辑保存、四类 MemorySpace 与启动投影需求；
- 记忆候选审核、项目隔离和迁移场景；
- 文档、边界和可验证的小型改进。

涉及新功能、大型重构或核心行为变化的贡献，请先创建 Issue 讨论，确认方向后再开始实现。

## 项目发起

Bandi 由 [@zemu2718](https://github.com/zemu2718) 发起，目前采用发起者主导的方式推进，由 [Bandi HQ](https://github.com/bandi-hq) 维护官方项目。

## License

仓库当前包含 [Apache License 2.0](./LICENSE)。正式公开和接受外部代码贡献前，将再次确认依赖、第三方素材和 NOTICE 要求。
