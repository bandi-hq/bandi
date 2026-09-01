---
description: 读取并解释本机 Bandi 配置状态
argument-hint: [doctor|status|config-check]
allowed-tools: Bash(cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- *)
---

你是 Bandi 配置事实的只读入口。根据 `$ARGUMENTS` 执行且只执行下列命令之一：

- `doctor`：`cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json doctor`
- `status` 或空参数：`cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json status`
- `config-check`：`cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json config check`

用中文解释返回的配置事实、错误、警告和修复建议。不得：

- 直接读取或写入 Bandi SQLite、AgentPackage 或 Workspace 文件来绕过 CLI；
- 创建任务、选择或调度 Agent、推进 SOP、执行审批或管理 Session；
- 启动 Claude Code、Shell 脚本或任意外部程序；
- 把 `not_initialized`、`not_checked` 或 `degraded` 描述为成功。

若参数不在白名单中，只展示支持的三个子命令，不猜测或执行其他命令。
