use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum BuiltInClientId {
    ClaudeCode,
    ClaudeDesktop,
    Codex,
    GeminiCli,
    GrokBuild,
    Opencode,
    Openclaw,
    Hermes,
    Pi,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ClientAdapterId {
    ClaudeCodeTerminalV1,
    ClaudeDesktopConfigV1,
    CodexTerminalV1,
    GeminiCliTerminalV1,
    GrokBuildConfigV1,
    OpencodeTerminalV1,
    OpenclawTerminalV1,
    HermesTerminalV1,
    PiTerminalV1,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HandoffIntent {
    ContinueWorkspace,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TerminalId {
    Terminal,
    #[serde(rename = "iterm2")]
    ITerm2,
    Warp,
    Ghostty,
    Wezterm,
    Kitty,
    Alacritty,
}

impl TerminalId {
    pub(crate) fn bundle_id(self) -> &'static str {
        match self {
            Self::Terminal => "com.apple.Terminal",
            Self::ITerm2 => "com.googlecode.iterm2",
            Self::Warp => "dev.warp.Warp-Stable",
            Self::Ghostty => "com.mitchellh.ghostty",
            Self::Wezterm => "com.github.wez.wezterm",
            Self::Kitty => "net.kovidgoyal.kitty",
            Self::Alacritty => "org.alacritty",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CapabilityStatus {
    Supported,
    Degraded,
    Unavailable,
    NotChecked,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityFact {
    pub(crate) status: CapabilityStatus,
    pub(crate) reason: String,
    pub(crate) evidence: Vec<String>,
    pub(crate) remediation: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ClientHandoffOutcome {
    Accepted,
    ManualRequired,
    Rejected,
    NotAttempted,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ClientHandoffRequest {
    pub(crate) client_id: BuiltInClientId,
    pub(crate) adapter_id: ClientAdapterId,
    pub(crate) workspace_id: String,
    pub(crate) terminal_id: TerminalId,
    pub(crate) intent: HandoffIntent,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ClientHandoffResult {
    pub(crate) client_id: BuiltInClientId,
    pub(crate) adapter_id: ClientAdapterId,
    pub(crate) workspace_id: String,
    pub(crate) terminal_id: TerminalId,
    pub(crate) intent: HandoffIntent,
    pub(crate) capability: CapabilityFact,
    pub(crate) outcome: ClientHandoffOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) accepted_at: Option<String>,
}

#[derive(Clone, Copy)]
struct AdapterDefinition {
    client_id: BuiltInClientId,
    adapter_id: ClientAdapterId,
    handoff_status: CapabilityStatus,
    reason: &'static str,
    evidence: &'static [&'static str],
    remediation: &'static [&'static str],
}

const ADAPTERS: [AdapterDefinition; 9] = [
    AdapterDefinition {
        client_id: BuiltInClientId::ClaudeCode,
        adapter_id: ClientAdapterId::ClaudeCodeTerminalV1,
        handoff_status: CapabilityStatus::Supported,
        reason: "支持通过白名单终端打开已登记 Workspace 目录",
        evidence: &["仅调用固定 /usr/bin/open", "cwd 由 Workspace Registry 重取"],
        remediation: &["目录打开后，由用户在自己的终端中启动 Claude Code"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::ClaudeDesktop,
        adapter_id: ClientAdapterId::ClaudeDesktopConfigV1,
        handoff_status: CapabilityStatus::Unavailable,
        reason: "Claude Desktop 不提供当前 Workspace 的终端交接入口",
        evidence: &["仅登记配置 Adapter，未定义 Workspace 启动协议"],
        remediation: &["在工具详情中管理受支持的长期配置"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::Codex,
        adapter_id: ClientAdapterId::CodexTerminalV1,
        handoff_status: CapabilityStatus::Supported,
        reason: "支持通过白名单终端打开已登记 Workspace 目录",
        evidence: &[
            "Codex CLI 官方提供 --cd/-C 项目目录选项",
            "Bandi 仅调用固定 /usr/bin/open，cwd 由 Workspace Registry 重取",
        ],
        remediation: &["目录打开后，由用户在自己的终端中启动 Codex"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::GeminiCli,
        adapter_id: ClientAdapterId::GeminiCliTerminalV1,
        handoff_status: CapabilityStatus::NotChecked,
        reason: "Gemini CLI Workspace 交接尚未完成本机验证",
        evidence: &["已登记独立 Adapter 身份，尚未调用外部程序"],
        remediation: &["完成官方协议核对和本机验证后再启用"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::GrokBuild,
        adapter_id: ClientAdapterId::GrokBuildConfigV1,
        handoff_status: CapabilityStatus::Unavailable,
        reason: "Grok Build 尚无已验证的安全 Workspace 交接协议",
        evidence: &["未配置 executable、argv 或通用 Shell 入口"],
        remediation: &["保留为配置目录，等待稳定公开协议"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::Opencode,
        adapter_id: ClientAdapterId::OpencodeTerminalV1,
        handoff_status: CapabilityStatus::NotChecked,
        reason: "OpenCode Workspace 交接尚未完成本机验证",
        evidence: &["已登记独立 Adapter 身份，尚未调用外部程序"],
        remediation: &["完成官方协议核对和本机验证后再启用"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::Openclaw,
        adapter_id: ClientAdapterId::OpenclawTerminalV1,
        handoff_status: CapabilityStatus::NotChecked,
        reason: "OpenClaw Workspace 交接尚未完成本机验证",
        evidence: &["已登记独立 Adapter 身份，尚未调用外部程序"],
        remediation: &["完成官方协议核对和本机验证后再启用"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::Hermes,
        adapter_id: ClientAdapterId::HermesTerminalV1,
        handoff_status: CapabilityStatus::NotChecked,
        reason: "Hermes Workspace 交接尚未完成本机验证",
        evidence: &["已登记独立 Adapter 身份，尚未调用外部程序"],
        remediation: &["完成官方协议核对和本机验证后再启用"],
    },
    AdapterDefinition {
        client_id: BuiltInClientId::Pi,
        adapter_id: ClientAdapterId::PiTerminalV1,
        handoff_status: CapabilityStatus::NotChecked,
        reason: "Pi Workspace 交接尚未完成本机验证",
        evidence: &["已登记独立 Adapter 身份，尚未调用外部程序"],
        remediation: &["完成官方协议核对和本机验证后再启用"],
    },
];

fn definition(request: &ClientHandoffRequest) -> Option<AdapterDefinition> {
    ADAPTERS
        .iter()
        .copied()
        .find(|item| item.client_id == request.client_id && item.adapter_id == request.adapter_id)
}

fn result(
    request: ClientHandoffRequest,
    capability: CapabilityFact,
    outcome: ClientHandoffOutcome,
    accepted_at: Option<String>,
) -> ClientHandoffResult {
    ClientHandoffResult {
        client_id: request.client_id,
        adapter_id: request.adapter_id,
        workspace_id: request.workspace_id,
        terminal_id: request.terminal_id,
        intent: request.intent,
        capability,
        outcome,
        accepted_at,
    }
}

fn fact(definition: AdapterDefinition) -> CapabilityFact {
    CapabilityFact {
        status: definition.handoff_status,
        reason: definition.reason.into(),
        evidence: definition
            .evidence
            .iter()
            .map(|item| (*item).into())
            .collect(),
        remediation: definition
            .remediation
            .iter()
            .map(|item| (*item).into())
            .collect(),
    }
}

pub(crate) fn request_handoff_at(
    request: ClientHandoffRequest,
    workspace_path: impl FnOnce(&str) -> Result<std::path::PathBuf, String>,
    platform_handoff_supported: bool,
    open_directory: impl FnOnce(TerminalId, &Path) -> Result<bool, String>,
) -> ClientHandoffResult {
    let Some(adapter) = definition(&request) else {
        return result(
            request,
            CapabilityFact {
                status: CapabilityStatus::NotChecked,
                reason: "客户端与 Adapter 身份不匹配".into(),
                evidence: vec!["后端静态 Adapter Registry 未找到该组合".into()],
                remediation: vec!["重新从 Bandi 工具目录选择 Adapter".into()],
            },
            ClientHandoffOutcome::NotAttempted,
            None,
        );
    };
    if !matches!(adapter.handoff_status, CapabilityStatus::Supported) {
        return result(
            request,
            fact(adapter),
            ClientHandoffOutcome::NotAttempted,
            None,
        );
    }
    if !platform_handoff_supported {
        return result(
            request,
            CapabilityFact {
                status: CapabilityStatus::NotChecked,
                reason: "当前平台尚未验证自动终端交接".into(),
                evidence: vec!["未调用任何终端、Shell 或外部进程".into()],
                remediation: vec!["复制工作区路径后在自己的终端中手动继续".into()],
            },
            ClientHandoffOutcome::ManualRequired,
            None,
        );
    }
    let cwd = match workspace_path(&request.workspace_id) {
        Ok(path) => path,
        Err(reason) => {
            return result(
                request,
                CapabilityFact {
                    status: CapabilityStatus::Unavailable,
                    reason,
                    evidence: vec!["后端未能从 Workspace Registry 解析 canonical cwd".into()],
                    remediation: vec!["先重新登记或修复该 Workspace".into()],
                },
                ClientHandoffOutcome::Rejected,
                None,
            )
        }
    };
    match open_directory(request.terminal_id, &cwd) {
        Ok(true) => result(
            request,
            fact(adapter),
            ClientHandoffOutcome::Accepted,
            Some(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
        ),
        Ok(false) => result(
            request,
            CapabilityFact {
                status: CapabilityStatus::Degraded,
                reason: "所选终端未接受目录打开请求".into(),
                evidence: vec!["固定 /usr/bin/open 返回非成功状态".into()],
                remediation: vec!["复制工作区路径后在自己的终端手动继续".into()],
            },
            ClientHandoffOutcome::ManualRequired,
            None,
        ),
        Err(_) => result(
            request,
            CapabilityFact {
                status: CapabilityStatus::Degraded,
                reason: "无法调用系统目录打开程序".into(),
                evidence: vec!["固定 /usr/bin/open 调用失败".into()],
                remediation: vec!["复制工作区路径后在自己的终端手动继续".into()],
            },
            ClientHandoffOutcome::ManualRequired,
            None,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(client_id: BuiltInClientId, adapter_id: ClientAdapterId) -> ClientHandoffRequest {
        ClientHandoffRequest {
            client_id,
            adapter_id,
            workspace_id: "bandi".into(),
            terminal_id: TerminalId::Terminal,
            intent: HandoffIntent::ContinueWorkspace,
        }
    }

    #[test]
    fn registry_covers_each_builtin_client_without_generic_process_fields() {
        assert_eq!(ADAPTERS.len(), 9);
        for adapter in ADAPTERS {
            assert!(!adapter.reason.is_empty());
            assert!(!adapter.evidence.is_empty());
            assert!(!adapter.remediation.is_empty());
        }
    }

    #[test]
    fn verified_adapters_open_registry_workspace_with_fixed_terminal() {
        for request in [
            request(
                BuiltInClientId::ClaudeCode,
                ClientAdapterId::ClaudeCodeTerminalV1,
            ),
            request(BuiltInClientId::Codex, ClientAdapterId::CodexTerminalV1),
        ] {
            let mut observed = None;
            let result = request_handoff_at(
                request,
                |id| {
                    assert_eq!(id, "bandi");
                    Ok("/tmp/bandi".into())
                },
                true,
                |terminal_id, cwd| {
                    observed = Some((terminal_id.bundle_id().to_string(), cwd.to_path_buf()));
                    Ok(true)
                },
            );
            assert!(matches!(result.outcome, ClientHandoffOutcome::Accepted));
            assert_eq!(
                observed,
                Some(("com.apple.Terminal".into(), "/tmp/bandi".into()))
            );
        }
    }

    #[test]
    fn unchecked_and_mismatched_adapters_never_open_external_process() {
        for request in [
            request(
                BuiltInClientId::Openclaw,
                ClientAdapterId::OpenclawTerminalV1,
            ),
            request(
                BuiltInClientId::Codex,
                ClientAdapterId::ClaudeCodeTerminalV1,
            ),
        ] {
            let result = request_handoff_at(
                request,
                |_| panic!("未验证 Adapter 不应读取 Workspace Registry"),
                true,
                |_, _| panic!("未验证 Adapter 不应打开外部程序"),
            );
            assert!(matches!(result.outcome, ClientHandoffOutcome::NotAttempted));
        }
    }

    #[test]
    fn unsupported_platform_never_reads_registry_or_opens_process() {
        let result = request_handoff_at(
            request(
                BuiltInClientId::ClaudeCode,
                ClientAdapterId::ClaudeCodeTerminalV1,
            ),
            |_| panic!("未支持平台不应读取 Workspace Registry"),
            false,
            |_, _| panic!("未支持平台不应打开外部程序"),
        );
        assert!(matches!(
            result.capability.status,
            CapabilityStatus::NotChecked
        ));
        assert!(matches!(
            result.outcome,
            ClientHandoffOutcome::ManualRequired
        ));
    }

    #[test]
    fn registry_failure_and_open_failure_return_explicit_status() {
        let unavailable = request_handoff_at(
            request(
                BuiltInClientId::ClaudeCode,
                ClientAdapterId::ClaudeCodeTerminalV1,
            ),
            |_| Err("Workspace 未登记".into()),
            true,
            |_, _| panic!("Registry 失败后不应打开外部程序"),
        );
        assert!(matches!(
            unavailable.capability.status,
            CapabilityStatus::Unavailable
        ));
        assert!(matches!(
            unavailable.outcome,
            ClientHandoffOutcome::Rejected
        ));

        let degraded = request_handoff_at(
            request(
                BuiltInClientId::ClaudeCode,
                ClientAdapterId::ClaudeCodeTerminalV1,
            ),
            |_| Ok("/tmp/bandi".into()),
            true,
            |_, _| Ok(false),
        );
        assert!(matches!(
            degraded.capability.status,
            CapabilityStatus::Degraded
        ));
        assert!(matches!(
            degraded.outcome,
            ClientHandoffOutcome::ManualRequired
        ));
    }
}
