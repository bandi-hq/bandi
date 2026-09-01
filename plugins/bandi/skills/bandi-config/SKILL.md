---
name: bandi-config
description: 当用户要求查看 Bandi 配置状态、诊断本地配置或检查 AgentPackage 配置有效性时使用。只通过 bandi CLI 读取事实，不执行任务或直接写入配置。
allowed-tools: Bash(cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- *)
---

# Bandi 配置事实

通过与 Desktop 共用 Rust Local Service 的 `bandi` CLI 获取事实：

```text
cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json doctor
cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json status
cargo run --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml --bin bandi -- --json config check
```

## 边界

- 只读取配置事实、诊断与能力状态。
- 不直接访问 SQLite、受管配置文件或 Workspace 文件以绕过 Local Service。
- 不创建、调度、审批、推进或监控任务，不管理 Claude Code Session。
- 不把 RuntimeProjection 持久化为主事实。
- 持久化变更只能形成明确提议，并由 Desktop/Local Service 的受限保存、MemoryCandidate 或专用高风险流程处理；本 Skill 不执行这些写入。
- 凭据、Token、Cookie、私钥和钥匙串内容不得进入回复、命令参数或日志。

## 输出

按“状态 → 证据 → 影响 → 修复建议”说明结果。`degraded`、`not_initialized`、`not_checked` 必须原样表达，不得推断为可用。
