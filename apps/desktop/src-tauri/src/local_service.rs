use std::{
    collections::HashSet,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use crate::{
    config_fs::restricted_atomic_write,
    domain_store::OrganizationSnapshotDto,
    shared_assets::{self, SharedAssetNodeDto},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const PROFILE_VERSION: &str = "agent-package-v1";
const CURRENT_SCHEMA_VERSION: u64 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiagnosticDto {
    pub(crate) code: String,
    pub(crate) severity: String,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) remediation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RootKind {
    Workspace,
    Managed,
    Bandi,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AssetLocatorDto {
    pub(crate) root_kind: RootKind,
    pub(crate) display_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) relative_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceContainerDto {
    pub(crate) id: String,
    pub(crate) locator: AssetLocatorDto,
    pub(crate) format: String,
    pub(crate) content_hash: String,
    pub(crate) writable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) read_only_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceAssetSummaryDto {
    pub(crate) id: String,
    pub(crate) container_id: String,
    pub(crate) kind: String,
    pub(crate) official_scope: String,
    pub(crate) asset_content_hash: String,
    pub(crate) container_content_hash: String,
    pub(crate) writable: bool,
    pub(crate) parse_status: String,
    pub(crate) diagnostics: Vec<DiagnosticDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BaselineRefDto {
    pub(crate) id: String,
    pub(crate) asset_id: String,
    pub(crate) container_id: String,
    pub(crate) asset_content_hash: String,
    pub(crate) container_content_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RegisterWorkspaceRequest {
    pub(crate) request_id: String,
    pub(crate) workspace_id: String,
    pub(crate) selected_path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkspaceRegistrationResult {
    pub(crate) request_id: String,
    pub(crate) workspace_id: String,
    pub(crate) canonical_path: String,
    pub(crate) capability: CapabilityFactDto,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityFactDto {
    pub(crate) status: String,
    pub(crate) reason: String,
    pub(crate) evidence: Vec<String>,
    pub(crate) remediation: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscoveryRequest {
    pub(crate) request_id: String,
    pub(crate) workspace_ids: Vec<String>,
    pub(crate) include_claude_user_root: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscoveryResult {
    pub(crate) request_id: String,
    pub(crate) profile_version: String,
    pub(crate) containers: Vec<SourceContainerDto>,
    pub(crate) assets: Vec<SourceAssetSummaryDto>,
    pub(crate) shared_assets: Vec<SharedAssetNodeDto>,
    pub(crate) references: Vec<AssetReferenceDto>,
    pub(crate) diagnostics: Vec<DiagnosticDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AssetReferenceDto {
    pub(crate) source_asset_id: String,
    pub(crate) source_container_id: String,
    pub(crate) referrer_kind: String,
    pub(crate) referrer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) workspace_id: Option<String>,
    pub(crate) target_asset_id: String,
    pub(crate) target_kind: String,
    pub(crate) state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) target_locator: Option<AssetLocatorDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) target_company_id: Option<String>,
    pub(crate) source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LoadEditorRequest {
    pub(crate) request_id: String,
    pub(crate) asset_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LoadEditorResult {
    pub(crate) request_id: String,
    pub(crate) asset: SourceAssetSummaryDto,
    pub(crate) canonical_content: String,
    pub(crate) redacted: bool,
    pub(crate) baseline_ref: BaselineRefDto,
    pub(crate) diagnostics: Vec<DiagnosticDto>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CreateWorkspaceBindingRequest {
    pub(crate) request_id: String,
    pub(crate) agent_id: String,
    pub(crate) workspace_id: String,
    pub(crate) value: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum ConfigChangeDto {
    Instructions { value: String },
    Context { value: String },
    Rules { value: String },
    Skills { value: String },
    Mcp { value: String },
    Permissions { value: String },
    Sop { value: String },
    Orchestration { value: String },
    Hooks { value: String },
    Commands { value: String },
    WorkspaceBinding { value: String },
}

impl ConfigChangeDto {
    fn kind(&self) -> &'static str {
        match self {
            Self::Instructions { .. } => "instructions",
            Self::Context { .. } => "context",
            Self::Rules { .. } => "rules",
            Self::Skills { .. } => "skills",
            Self::Mcp { .. } => "mcp",
            Self::Permissions { .. } => "permissions",
            Self::Sop { .. } => "sop",
            Self::Orchestration { .. } => "orchestration",
            Self::Hooks { .. } => "hooks",
            Self::Commands { .. } => "commands",
            Self::WorkspaceBinding { .. } => "workspace_binding",
        }
    }

    fn value(self) -> String {
        match self {
            Self::Instructions { value }
            | Self::Context { value }
            | Self::Rules { value }
            | Self::Skills { value }
            | Self::Mcp { value }
            | Self::Permissions { value }
            | Self::Sop { value }
            | Self::Orchestration { value }
            | Self::Hooks { value }
            | Self::Commands { value }
            | Self::WorkspaceBinding { value } => value,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextPolicyDocument {
    schema_version: u64,
    context_policy: ContextPolicyDto,
    #[serde(default = "default_context_window_tokens")]
    context_window_tokens: u64,
    output_profile_id: String,
    output_parameter_bindings: Vec<ParameterBindingDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextPolicyDto {
    enabled: bool,
    trigger_ratio: f64,
    target_ratio: f64,
    protect_recent_turns: u64,
    protect_opening_turns: u64,
}

const fn default_context_window_tokens() -> u64 {
    200_000
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RulesDocument {
    schema_version: u64,
    rules: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SkillsDocument {
    schema_version: u64,
    skills: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct McpDocument {
    schema_version: u64,
    mcp: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SopDocument {
    schema_version: u64,
    sop: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OrchestrationDocument {
    schema_version: u64,
    orchestration: OrchestrationPolicyDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HookReferencesDocument {
    schema_version: u64,
    hooks: Vec<ComponentReferenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandReferencesDocument {
    schema_version: u64,
    commands: Vec<ComponentReferenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceBindingDocument {
    schema_version: u64,
    workspace_binding: WorkspaceBindingDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceBindingDto {
    workspace_id: String,
    instructions: String,
    rule_ids: Vec<String>,
    skill_ids: Vec<String>,
    mcp_ids: Vec<String>,
    #[serde(default)]
    context_policy: Option<ContextPolicyOverrideDto>,
    #[serde(default)]
    output_profile_id: Option<String>,
    #[serde(default)]
    output_parameter_bindings: Vec<ParameterBindingDto>,
    #[serde(default)]
    orchestration_policy: Option<OrchestrationPolicyOverrideDto>,
    #[serde(default)]
    hook_refs: Option<Vec<ComponentReferenceDto>>,
    #[serde(default)]
    command_refs: Option<Vec<ComponentReferenceDto>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContextPolicyOverrideDto {
    enabled: Option<bool>,
    trigger_ratio: Option<f64>,
    target_ratio: Option<f64>,
    protect_recent_turns: Option<u64>,
    protect_opening_turns: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OrchestrationPolicyOverrideDto {
    enabled: Option<bool>,
    max_delegation_depth: Option<u64>,
    allowed_agent_ids: Option<Vec<String>>,
    allowed_role_ids: Option<Vec<String>>,
    allowed_department_ids: Option<Vec<String>>,
    require_workspace_binding: Option<bool>,
    require_sop_match: Option<bool>,
    require_service_grant_for_cross_department: Option<bool>,
    escalation_agent_id: Option<String>,
    escalation_conditions: Option<Vec<String>>,
    prohibitions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComponentReferenceDto {
    asset_id: String,
    parameter_bindings: Vec<ParameterBindingDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OrchestrationPolicyDto {
    enabled: bool,
    max_delegation_depth: u64,
    allowed_agent_ids: Vec<String>,
    allowed_role_ids: Vec<String>,
    allowed_department_ids: Vec<String>,
    require_workspace_binding: bool,
    require_sop_match: bool,
    require_service_grant_for_cross_department: bool,
    #[serde(default)]
    escalation_agent_id: Option<String>,
    escalation_conditions: Vec<String>,
    prohibitions: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PermissionsDocument {
    schema_version: u64,
    permissions: PermissionsDto,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PermissionsDto {
    files: String,
    commands: String,
    network: String,
    delegation: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum ParameterBindingDto {
    String {
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: String,
    },
    Number {
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: f64,
    },
    Boolean {
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: bool,
    },
    StringList {
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: Vec<String>,
    },
    Enum {
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveConfigOwnerDto {
    pub(crate) agent_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) workspace_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveConfigRequest {
    pub(crate) request_id: String,
    pub(crate) asset_id: String,
    pub(crate) expected_owner: SaveConfigOwnerDto,
    pub(crate) change: ConfigChangeDto,
    pub(crate) expected_baseline: BaselineRefDto,
    pub(crate) base_content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) confirmation_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConfirmationChallengeDto {
    pub(crate) id: String,
    pub(crate) asset_id: String,
    pub(crate) proposed_content_hash: String,
    pub(crate) expires_at: String,
    pub(crate) reason: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfirmationRecord {
    id: String,
    asset_id: String,
    proposed_content_hash: String,
    baseline_asset_hash: String,
    expires_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WriteReceiptDto {
    pub(crate) id: String,
    pub(crate) container_id: String,
    pub(crate) previous_container_hash: String,
    pub(crate) written_container_hash: String,
    pub(crate) verified_at: String,
    pub(crate) atomic_replace: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConfigRevisionDto {
    pub(crate) id: String,
    pub(crate) asset_id: String,
    pub(crate) container_id: String,
    pub(crate) locator: AssetLocatorDto,
    pub(crate) asset_content_hash: String,
    pub(crate) container_content_hash: String,
    pub(crate) source_asset_baseline_hash: String,
    pub(crate) source_container_baseline_hash: String,
    pub(crate) redacted: bool,
    pub(crate) write_receipt_id: String,
    pub(crate) saved_at: String,
    pub(crate) summary: String,
    pub(crate) confirmation_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) restored_from_revision_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RestoreConfigRevisionRequest {
    pub(crate) request_id: String,
    pub(crate) asset_id: String,
    pub(crate) revision_id: String,
    pub(crate) expected_baseline: BaselineRefDto,
    pub(crate) base_content: String,
    pub(crate) confirmed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) confirmation_ref: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecoverConfigRevisionRequest {
    pub(crate) request_id: String,
    pub(crate) asset_id: String,
    pub(crate) recovery_ref: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SaveConfigResult {
    Saved {
        #[serde(rename = "requestId")]
        request_id: String,
        asset: SourceAssetSummaryDto,
        revision: Box<ConfigRevisionDto>,
        #[serde(rename = "writeReceipt")]
        write_receipt: WriteReceiptDto,
    },
    Unchanged {
        #[serde(rename = "requestId")]
        request_id: String,
        asset: SourceAssetSummaryDto,
    },
    BaselineChanged {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "assetId")]
        asset_id: String,
        #[serde(rename = "containerId")]
        container_id: String,
        locator: AssetLocatorDto,
        base: ConfigSideDto,
        current: ConfigSideDto,
        proposed: ConfigSideDto,
        diagnostics: Vec<DiagnosticDto>,
    },
    ConfirmationRequired {
        #[serde(rename = "requestId")]
        request_id: String,
        challenge: ConfirmationChallengeDto,
        diagnostics: Vec<DiagnosticDto>,
    },
    ValidationFailed {
        #[serde(rename = "requestId")]
        request_id: String,
        diagnostics: Vec<DiagnosticDto>,
    },
    SaveFailed {
        #[serde(rename = "requestId")]
        request_id: String,
        diagnostics: Vec<DiagnosticDto>,
        retryable: bool,
        #[serde(rename = "fileState")]
        file_state: String,
        #[serde(rename = "recoveryRef", skip_serializing_if = "Option::is_none")]
        recovery_ref: Option<String>,
    },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConfigSideDto {
    pub(crate) content: String,
    pub(crate) asset_content_hash: String,
    pub(crate) container_content_hash: String,
    pub(crate) redacted: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceRecord {
    workspace_id: String,
    canonical_path: String,
}

struct DiscoveredAsset {
    summary: SourceAssetSummaryDto,
    container: SourceContainerDto,
    content: String,
    target: PathBuf,
}

pub(crate) fn diagnostic(
    code: &str,
    severity: &str,
    message: &str,
    path: Option<String>,
    remediation: Option<&str>,
) -> DiagnosticDto {
    DiagnosticDto {
        code: code.into(),
        severity: severity.into(),
        message: message.into(),
        field: None,
        path,
        remediation: remediation.map(str::to_owned),
    }
}

pub(crate) fn hash_bytes(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

pub(crate) fn stable_id(prefix: &str, value: &str) -> String {
    format!("{prefix}-{:x}", Sha256::digest(value.as_bytes()))
}

fn validate_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && value != "."
        && value != ".."
}

pub(crate) fn ensure_registered_workspace_path(path: &Path) -> Result<PathBuf, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "工作区目录不存在或不可访问".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("工作区授权根不能是符号链接".into());
    }
    let canonical = fs::canonicalize(path).map_err(|_| "工作区目录无法规范化".to_string())?;
    if !canonical.is_dir() {
        return Err("工作区路径不是目录".into());
    }
    Ok(canonical)
}

fn write_record_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    restricted_atomic_write(target, bytes, false, "本地记录")
}

pub(crate) struct WorkspaceRegistrationOutcome {
    pub(crate) result: WorkspaceRegistrationResult,
    pub(crate) created: bool,
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn register_workspace_at(
    registry_root: &Path,
    request: RegisterWorkspaceRequest,
) -> Result<WorkspaceRegistrationResult, String> {
    register_workspace_with_status_at(registry_root, request).map(|outcome| outcome.result)
}

pub(crate) fn register_workspace_with_status_at(
    registry_root: &Path,
    request: RegisterWorkspaceRequest,
) -> Result<WorkspaceRegistrationOutcome, String> {
    if !validate_identifier(&request.request_id) || !validate_identifier(&request.workspace_id) {
        return Err("工作区请求或标识无效".into());
    }
    let selected = Path::new(&request.selected_path);
    if !selected.is_absolute() {
        return Err("工作区必须使用绝对路径登记".into());
    }
    let canonical = ensure_registered_workspace_path(selected)?;
    let canonical_path = canonical.to_string_lossy().into_owned();
    let record_path = registry_root.join(format!("{}.json", request.workspace_id));
    let mut created = true;
    if let Ok(metadata) = fs::symlink_metadata(&record_path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Workspace Registry 记录必须是普通文件".into());
        }
        let record: WorkspaceRecord = serde_json::from_slice(
            &fs::read(&record_path).map_err(|_| "Workspace Registry 记录不可访问".to_string())?,
        )
        .map_err(|_| "Workspace Registry 记录无效".to_string())?;
        if record.workspace_id != request.workspace_id {
            return Err("Workspace Registry 标识不一致".into());
        }
        if record.canonical_path != canonical_path {
            return Err("同一工作区标识已登记到其他规范化目录".into());
        }
        created = false;
    }
    if let Ok(existing) = fs::read_dir(registry_root) {
        for entry in existing.flatten() {
            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if file_name == format!("{}.json", request.workspace_id)
                || !file_name.ends_with(".json")
            {
                continue;
            }
            let bytes = fs::read(entry.path())
                .map_err(|_| "Workspace Registry 包含不可访问记录".to_string())?;
            let record: WorkspaceRecord = serde_json::from_slice(&bytes)
                .map_err(|_| "Workspace Registry 包含无效记录".to_string())?;
            if record.canonical_path == canonical_path {
                return Err("该规范化目录已由其他工作区登记".into());
            }
        }
    }
    if created {
        let record = WorkspaceRecord {
            workspace_id: request.workspace_id.clone(),
            canonical_path: canonical_path.clone(),
        };
        let bytes = serde_json::to_vec(&record)
            .map_err(|_| "Workspace Registry 记录无法序列化".to_string())?;
        write_record_atomic(&record_path, &bytes)?;
    }
    Ok(WorkspaceRegistrationOutcome {
        created,
        result: WorkspaceRegistrationResult {
            request_id: request.request_id,
            workspace_id: request.workspace_id,
            canonical_path,
            capability: CapabilityFactDto {
                status: "supported".into(),
                reason: "工作区授权根已由本地服务规范化并登记".into(),
                evidence: vec!["canonical path 已重新读取验证".into()],
                remediation: Vec::new(),
            },
        },
    })
}

pub(crate) fn unregister_workspace_at(
    registry_root: &Path,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    if !validate_identifier(workspace_id) {
        return Err("工作区标识无效".into());
    }
    let record_path = registry_root.join(format!("{workspace_id}.json"));
    let metadata = fs::symlink_metadata(&record_path)
        .map_err(|_| "工作区尚未登记或记录不可访问".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Workspace Registry 记录必须是普通文件".into());
    }
    let record: WorkspaceRecord = serde_json::from_slice(
        &fs::read(&record_path).map_err(|_| "Workspace Registry 记录不可访问".to_string())?,
    )
    .map_err(|_| "Workspace Registry 记录无效".to_string())?;
    if record.workspace_id != workspace_id {
        return Err("Workspace Registry 标识不一致".into());
    }
    fs::remove_file(&record_path).map_err(|_| "无法撤销 Workspace Registry 记录".to_string())?;
    if let Ok(directory) = fs::File::open(registry_root) {
        let _ = directory.sync_all();
    }
    Ok(PathBuf::from(record.canonical_path))
}

pub(crate) fn workspace_path_from_registry_at(
    registry_root: &Path,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    if !validate_identifier(workspace_id) {
        return Err("工作区标识无效".into());
    }
    let record_path = registry_root.join(format!("{workspace_id}.json"));
    if fs::symlink_metadata(&record_path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err("Workspace Registry 记录不能是符号链接".into());
    }
    let record: WorkspaceRecord = serde_json::from_slice(
        &fs::read(record_path).map_err(|_| "工作区尚未登记或记录不可访问".to_string())?,
    )
    .map_err(|_| "Workspace Registry 记录无效".to_string())?;
    if record.workspace_id != workspace_id {
        return Err("Workspace Registry 标识不一致".into());
    }
    ensure_registered_workspace_path(Path::new(&record.canonical_path))
}

pub(crate) fn manifest_facts(path: &Path) -> Result<(String, u64), Box<DiagnosticDto>> {
    let content = fs::read_to_string(path).map_err(|_| {
        Box::new(diagnostic(
            "manifest_unreadable",
            "error",
            "无法读取 agent.yaml",
            Some("agent.yaml".into()),
            Some("检查文件权限和 AgentPackage 完整性"),
        ))
    })?;
    let manifest: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|_| {
        Box::new(diagnostic(
            "manifest_invalid",
            "error",
            "agent.yaml 不是有效 YAML",
            Some("agent.yaml".into()),
            Some("修正 manifest 后重新发现"),
        ))
    })?;
    let id = manifest
        .get("id")
        .and_then(serde_yaml::Value::as_str)
        .filter(|id| validate_identifier(id))
        .ok_or_else(|| {
            Box::new(diagnostic(
                "manifest_id_invalid",
                "error",
                "agent.yaml 缺少有效稳定 id",
                Some("agent.yaml".into()),
                Some("补充与目录身份一致的稳定 id"),
            ))
        })?;
    let version = manifest
        .get("schemaVersion")
        .and_then(serde_yaml::Value::as_u64)
        .ok_or_else(|| {
            Box::new(diagnostic(
                "package_unverified",
                "warning",
                "AgentPackage 缺少可验证的 schemaVersion",
                Some("agent.yaml".into()),
                Some("使用受支持的 AgentPackage v1 manifest"),
            ))
        })?;
    Ok((id.into(), version))
}

fn validate_context_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: ContextPolicyDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "context_invalid",
            "error",
            "config/context.yaml 不符合冻结的 ContextPolicy schema",
            Some("config/context.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let policy = document.context_policy;
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || !policy.trigger_ratio.is_finite()
        || !(0.5..=0.95).contains(&policy.trigger_ratio)
        || !policy.target_ratio.is_finite()
        || !(0.2..=0.8).contains(&policy.target_ratio)
        || policy.target_ratio > policy.trigger_ratio - 0.1
        || policy.protect_recent_turns > 20
        || policy.protect_opening_turns > 10
        || !(1_000..=2_000_000).contains(&document.context_window_tokens)
        || document.output_profile_id.len() > 160
        || (!document.output_profile_id.is_empty()
            && !validate_identifier(&document.output_profile_id))
        || document.output_parameter_bindings.len() > 100
    {
        return Err(Box::new(diagnostic(
            "context_policy_invalid",
            "error",
            "上下文窗口、策略比例、轮次、版本或 OutputProfile 引用无效",
            Some("config/context.yaml".into()),
            Some("按页面允许范围修正 ContextPolicy 与 OutputProfile 引用"),
        )));
    }
    let mut ids = HashSet::new();
    for binding in document.output_parameter_bindings {
        let (parameter_id, valid_value) = match binding {
            ParameterBindingDto::String {
                parameter_id,
                value,
            }
            | ParameterBindingDto::Enum {
                parameter_id,
                value,
            } => {
                let valid = value.len() <= 16 * 1024 && !value.contains('\0');
                (parameter_id, valid)
            }
            ParameterBindingDto::Number {
                parameter_id,
                value,
            } => (parameter_id, value.is_finite()),
            ParameterBindingDto::Boolean {
                parameter_id,
                value,
            } => {
                let _ = value;
                (parameter_id, true)
            }
            ParameterBindingDto::StringList {
                parameter_id,
                value,
            } => {
                let valid = value.len() <= 100
                    && value
                        .iter()
                        .all(|item| item.len() <= 16 * 1024 && !item.contains('\0'));
                (parameter_id, valid)
            }
        };
        if !validate_identifier(&parameter_id) || !ids.insert(parameter_id) || !valid_value {
            return Err(Box::new(diagnostic(
                "output_parameter_binding_invalid",
                "error",
                "OutputProfile 参数绑定包含重复、非法标识或无效值",
                Some("config/context.yaml".into()),
                Some("修正参数绑定后重试"),
            )));
        }
    }
    let _ = policy.enabled;
    Ok(())
}

fn validate_rules_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: RulesDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "rules_invalid",
            "error",
            "config/rules.yaml 不符合冻结的 Rule 引用 schema",
            Some("config/rules.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let mut ids = HashSet::new();
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || document.rules.len() > 500
        || document
            .rules
            .iter()
            .any(|id| !validate_identifier(id) || !ids.insert(id.clone()))
    {
        return Err(Box::new(diagnostic(
            "rules_invalid",
            "error",
            "Rule 引用版本、数量、稳定标识或唯一性无效",
            Some("config/rules.yaml".into()),
            Some("只保留不重复的稳定 Rule 资产标识"),
        )));
    }
    Ok(())
}

fn validate_skills_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: SkillsDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "skills_invalid",
            "error",
            "config/skills.yaml 不符合冻结的 Skill 引用 schema",
            Some("config/skills.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let mut ids = HashSet::new();
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || document.skills.len() > 500
        || document
            .skills
            .iter()
            .any(|id| !validate_identifier(id) || !ids.insert(id.clone()))
    {
        return Err(Box::new(diagnostic(
            "skills_invalid",
            "error",
            "Skill 引用版本、数量、稳定标识或唯一性无效",
            Some("config/skills.yaml".into()),
            Some("只保留不重复的稳定 Skill 资产标识"),
        )));
    }
    Ok(())
}

fn validate_mcp_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: McpDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "mcp_invalid",
            "error",
            "config/mcp.yaml 不符合冻结的 MCP 引用 schema",
            Some("config/mcp.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let mut ids = HashSet::new();
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || document.mcp.len() > 500
        || document
            .mcp
            .iter()
            .any(|id| !validate_identifier(id) || !ids.insert(id.clone()))
    {
        return Err(Box::new(diagnostic(
            "mcp_invalid",
            "error",
            "MCP 引用版本、数量、稳定标识或唯一性无效",
            Some("config/mcp.yaml".into()),
            Some("只保留不重复的稳定 MCP 资产标识"),
        )));
    }
    Ok(())
}

fn validate_sop_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: SopDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "sop_invalid",
            "error",
            "config/sop.yaml 不符合冻结的 SOP 引用 schema",
            Some("config/sop.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let mut ids = HashSet::new();
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || document.sop.len() > 500
        || document
            .sop
            .iter()
            .any(|id| !validate_identifier(id) || !ids.insert(id.clone()))
    {
        return Err(Box::new(diagnostic(
            "sop_invalid",
            "error",
            "SOP 引用版本、数量、稳定标识或唯一性无效",
            Some("config/sop.yaml".into()),
            Some("只保留不重复的稳定 SOP 资产标识"),
        )));
    }
    Ok(())
}

fn validate_parameter_binding(binding: &ParameterBindingDto) -> bool {
    let (parameter_id, valid_value) = match binding {
        ParameterBindingDto::String {
            parameter_id,
            value,
        }
        | ParameterBindingDto::Enum {
            parameter_id,
            value,
        } => (parameter_id, value.len() <= 4096 && !value.contains('\0')),
        ParameterBindingDto::Number {
            parameter_id,
            value,
        } => (parameter_id, value.is_finite()),
        ParameterBindingDto::Boolean {
            parameter_id,
            value,
        } => {
            let _ = value;
            (parameter_id, true)
        }
        ParameterBindingDto::StringList {
            parameter_id,
            value,
        } => (
            parameter_id,
            value.len() <= 100
                && value
                    .iter()
                    .all(|item| item.len() <= 4096 && !item.contains('\0')),
        ),
    };
    validate_identifier(parameter_id) && valid_value
}

fn validate_hooks_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: HookReferencesDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "hooks_invalid",
            "error",
            "config/hooks.yaml 不符合冻结的 Hook 引用 schema",
            Some("config/hooks.yaml".into()),
            Some("只使用稳定 Hook 资产 ID 和受支持的非敏感参数绑定"),
        ))
    })?;
    let mut asset_ids = HashSet::new();
    let invalid = document.hooks.len() > 500
        || document.hooks.iter().any(|reference| {
            let mut parameter_ids = HashSet::new();
            !validate_identifier(&reference.asset_id)
                || !asset_ids.insert(reference.asset_id.clone())
                || reference.parameter_bindings.len() > 100
                || reference.parameter_bindings.iter().any(|binding| {
                    let parameter_id = match binding {
                        ParameterBindingDto::String { parameter_id, .. }
                        | ParameterBindingDto::Number { parameter_id, .. }
                        | ParameterBindingDto::Boolean { parameter_id, .. }
                        | ParameterBindingDto::StringList { parameter_id, .. }
                        | ParameterBindingDto::Enum { parameter_id, .. } => parameter_id,
                    };
                    !validate_parameter_binding(binding)
                        || !parameter_ids.insert(parameter_id.clone())
                })
        });
    if document.schema_version != CURRENT_SCHEMA_VERSION || invalid {
        return Err(Box::new(diagnostic(
            "hooks_invalid",
            "error",
            "Hook 引用版本、稳定标识、唯一性、数量或参数值无效",
            Some("config/hooks.yaml".into()),
            Some("引用最多 500 项；每项最多 100 个不重复的非敏感参数绑定"),
        )));
    }
    Ok(())
}

fn validate_component_references(references: &[ComponentReferenceDto]) -> bool {
    let mut asset_ids = HashSet::new();
    references.len() <= 500
        && !references.iter().any(|reference| {
            let mut parameter_ids = HashSet::new();
            !validate_identifier(&reference.asset_id)
                || !asset_ids.insert(reference.asset_id.clone())
                || reference.parameter_bindings.len() > 100
                || reference.parameter_bindings.iter().any(|binding| {
                    let parameter_id = match binding {
                        ParameterBindingDto::String { parameter_id, .. }
                        | ParameterBindingDto::Number { parameter_id, .. }
                        | ParameterBindingDto::Boolean { parameter_id, .. }
                        | ParameterBindingDto::StringList { parameter_id, .. }
                        | ParameterBindingDto::Enum { parameter_id, .. } => parameter_id,
                    };
                    !validate_parameter_binding(binding)
                        || !parameter_ids.insert(parameter_id.clone())
                })
        })
}

fn validate_commands_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: CommandReferencesDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "commands_invalid",
            "error",
            "config/commands.yaml 不符合冻结的 Command 引用 schema",
            Some("config/commands.yaml".into()),
            Some("只使用稳定 Command 资产 ID 和受支持的非敏感参数绑定"),
        ))
    })?;
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || !validate_component_references(&document.commands)
    {
        return Err(Box::new(diagnostic(
            "commands_invalid",
            "error",
            "Command 引用版本、稳定标识、唯一性、数量或参数值无效",
            Some("config/commands.yaml".into()),
            Some("引用最多 500 项；每项最多 100 个不重复的非敏感参数绑定"),
        )));
    }
    Ok(())
}

fn validate_unique_ids(values: &[String]) -> bool {
    let mut ids = HashSet::new();
    values.len() <= 500
        && values
            .iter()
            .all(|id| validate_identifier(id) && ids.insert(id.clone()))
}

fn validate_statements(values: &[String]) -> bool {
    values.len() <= 100
        && values.iter().all(|value| {
            !value.trim().is_empty() && value.chars().count() <= 512 && !value.contains('\0')
        })
}

fn parse_workspace_binding_document(
    content: &str,
) -> Result<WorkspaceBindingDocument, Box<DiagnosticDto>> {
    serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "workspace_binding_invalid",
            "error",
            "WorkspaceBinding 不符合冻结 schema，或包含 MemoryRevision/未知字段",
            None,
            Some("只提交普通专属配置；正式记忆修订由 Memory 流程维护"),
        ))
    })
}

fn is_subset(candidate: &[String], root: &[String]) -> bool {
    let allowed: HashSet<&str> = root.iter().map(String::as_str).collect();
    candidate
        .iter()
        .all(|value| allowed.contains(value.as_str()))
}

fn validate_workspace_binding_boundaries(
    package_path: &Path,
    binding: &WorkspaceBindingDto,
) -> Result<(), Box<DiagnosticDto>> {
    let context: ContextPolicyDocument = serde_yaml::from_str(
        &fs::read_to_string(package_path.join("config/context.yaml")).map_err(|_| {
            Box::new(diagnostic(
                "workspace_binding_root_context_unavailable",
                "error",
                "无法读取 Agent 根级 ContextPolicy",
                Some("config/context.yaml".into()),
                Some("修复根级上下文策略后重试"),
            ))
        })?,
    )
    .map_err(|_| {
        Box::new(diagnostic(
            "workspace_binding_root_context_invalid",
            "error",
            "Agent 根级 ContextPolicy 无法验证",
            Some("config/context.yaml".into()),
            Some("修复根级上下文策略后重试"),
        ))
    })?;
    if let Some(override_policy) = &binding.context_policy {
        let root = context.context_policy;
        if override_policy.enabled == Some(true) && !root.enabled
            || override_policy
                .trigger_ratio
                .is_some_and(|value| value > root.trigger_ratio)
            || override_policy
                .target_ratio
                .is_some_and(|value| value > root.target_ratio)
            || override_policy
                .protect_recent_turns
                .is_some_and(|value| value < root.protect_recent_turns)
            || override_policy
                .protect_opening_turns
                .is_some_and(|value| value < root.protect_opening_turns)
        {
            return Err(Box::new(diagnostic(
                "workspace_binding_context_expanded",
                "error",
                "WorkspaceBinding 上下文覆盖扩大了 Agent 根级策略",
                Some("workspaceBinding.contextPolicy".into()),
                Some("局部覆盖只能关闭、降低比例或增加保护轮次"),
            )));
        }
    }

    let orchestration: OrchestrationDocument = serde_yaml::from_str(
        &fs::read_to_string(package_path.join("config/orchestration.yaml")).map_err(|_| {
            Box::new(diagnostic(
                "workspace_binding_root_orchestration_unavailable",
                "error",
                "无法读取 Agent 根级静态编排策略",
                Some("config/orchestration.yaml".into()),
                Some("修复根级静态编排策略后重试"),
            ))
        })?,
    )
    .map_err(|_| {
        Box::new(diagnostic(
            "workspace_binding_root_orchestration_invalid",
            "error",
            "Agent 根级静态编排策略无法验证",
            Some("config/orchestration.yaml".into()),
            Some("修复根级静态编排策略后重试"),
        ))
    })?;
    if let Some(override_policy) = &binding.orchestration_policy {
        let root = orchestration.orchestration;
        let expands = override_policy.enabled == Some(true) && !root.enabled
            || override_policy
                .max_delegation_depth
                .is_some_and(|value| value > root.max_delegation_depth)
            || override_policy
                .allowed_agent_ids
                .as_deref()
                .is_some_and(|values| !is_subset(values, &root.allowed_agent_ids))
            || override_policy
                .allowed_role_ids
                .as_deref()
                .is_some_and(|values| !is_subset(values, &root.allowed_role_ids))
            || override_policy
                .allowed_department_ids
                .as_deref()
                .is_some_and(|values| !is_subset(values, &root.allowed_department_ids))
            || root.require_workspace_binding
                && override_policy.require_workspace_binding == Some(false)
            || root.require_sop_match && override_policy.require_sop_match == Some(false)
            || root.require_service_grant_for_cross_department
                && override_policy.require_service_grant_for_cross_department == Some(false)
            || override_policy
                .prohibitions
                .as_deref()
                .is_some_and(|values| !is_subset(&root.prohibitions, values));
        if expands {
            return Err(Box::new(diagnostic(
                "workspace_binding_orchestration_expanded",
                "error",
                "WorkspaceBinding 静态编排覆盖扩大了 Agent 根级策略",
                Some("workspaceBinding.orchestrationPolicy".into()),
                Some("局部覆盖只能降低深度、缩小范围、增加必需条件或禁止事项"),
            )));
        }
    }
    Ok(())
}

fn validate_workspace_binding_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document = parse_workspace_binding_document(content)?;
    let binding = document.workspace_binding;
    let context_valid = binding.context_policy.as_ref().is_none_or(|policy| {
        policy
            .trigger_ratio
            .is_none_or(|value| value.is_finite() && (0.5..=0.95).contains(&value))
            && policy
                .target_ratio
                .is_none_or(|value| value.is_finite() && (0.2..=0.8).contains(&value))
            && policy.protect_recent_turns.is_none_or(|value| value <= 20)
            && policy.protect_opening_turns.is_none_or(|value| value <= 10)
    });
    let orchestration_valid = binding.orchestration_policy.as_ref().is_none_or(|policy| {
        policy.max_delegation_depth.is_none_or(|value| value <= 32)
            && policy
                .allowed_agent_ids
                .as_ref()
                .is_none_or(|values| validate_unique_ids(values))
            && policy
                .allowed_role_ids
                .as_ref()
                .is_none_or(|values| validate_unique_ids(values))
            && policy
                .allowed_department_ids
                .as_ref()
                .is_none_or(|values| validate_unique_ids(values))
            && policy
                .escalation_agent_id
                .as_deref()
                .is_none_or(validate_identifier)
            && policy
                .escalation_conditions
                .as_ref()
                .is_none_or(|values| validate_statements(values))
            && policy
                .prohibitions
                .as_ref()
                .is_none_or(|values| validate_statements(values))
    });
    let _static_boundaries = binding.orchestration_policy.as_ref().map(|policy| {
        (
            policy.enabled,
            policy.require_workspace_binding,
            policy.require_sop_match,
            policy.require_service_grant_for_cross_department,
        )
    });
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || !validate_identifier(&binding.workspace_id)
        || binding.instructions.len() > 64 * 1024
        || binding.instructions.contains('\0')
        || !validate_unique_ids(&binding.rule_ids)
        || !validate_unique_ids(&binding.skill_ids)
        || !validate_unique_ids(&binding.mcp_ids)
        || !context_valid
        || binding
            .output_profile_id
            .as_deref()
            .is_some_and(|id| !validate_identifier(id))
        || binding.output_parameter_bindings.len() > 100
        || !validate_component_references(binding.hook_refs.as_deref().unwrap_or_default())
        || !validate_component_references(binding.command_refs.as_deref().unwrap_or_default())
        || !orchestration_valid
    {
        return Err(Box::new(diagnostic(
            "workspace_binding_invalid",
            "error",
            "WorkspaceBinding 版本、稳定引用、局部覆盖或非敏感参数无效",
            None,
            Some("修正专属配置后重试；服务还会结合 Agent 根配置验证只能收紧"),
        )));
    }
    let mut parameter_ids = HashSet::new();
    if binding.output_parameter_bindings.iter().any(|binding| {
        let parameter_id = match binding {
            ParameterBindingDto::String { parameter_id, .. }
            | ParameterBindingDto::Number { parameter_id, .. }
            | ParameterBindingDto::Boolean { parameter_id, .. }
            | ParameterBindingDto::StringList { parameter_id, .. }
            | ParameterBindingDto::Enum { parameter_id, .. } => parameter_id,
        };
        !validate_parameter_binding(binding) || !parameter_ids.insert(parameter_id.clone())
    }) {
        return Err(Box::new(diagnostic(
            "workspace_binding_invalid",
            "error",
            "WorkspaceBinding 输出参数包含重复、敏感或无效值",
            None,
            Some("只保留不重复的非敏感参数绑定"),
        )));
    }
    Ok(())
}

fn validate_orchestration_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    let document: OrchestrationDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "orchestration_invalid",
            "error",
            "config/orchestration.yaml 不符合冻结的静态编排策略 schema",
            Some("config/orchestration.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let policy = document.orchestration;
    let mut agent_ids = HashSet::new();
    let mut role_ids = HashSet::new();
    let mut department_ids = HashSet::new();
    let invalid_ids = policy.allowed_agent_ids.len() > 500
        || policy.allowed_role_ids.len() > 500
        || policy.allowed_department_ids.len() > 500
        || policy
            .allowed_agent_ids
            .iter()
            .any(|id| !validate_identifier(id) || !agent_ids.insert(id.clone()))
        || policy
            .allowed_role_ids
            .iter()
            .any(|id| !validate_identifier(id) || !role_ids.insert(id.clone()))
        || policy
            .allowed_department_ids
            .iter()
            .any(|id| !validate_identifier(id) || !department_ids.insert(id.clone()))
        || policy
            .escalation_agent_id
            .as_deref()
            .is_some_and(|id| !validate_identifier(id));
    let invalid_statements = policy.escalation_conditions.len() > 100
        || policy.prohibitions.len() > 100
        || policy
            .escalation_conditions
            .iter()
            .chain(policy.prohibitions.iter())
            .any(|value| {
                value.trim().is_empty() || value.chars().count() > 512 || value.contains('\0')
            });
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || policy.max_delegation_depth > 32
        || invalid_ids
        || invalid_statements
    {
        return Err(Box::new(diagnostic(
            "orchestration_invalid",
            "error",
            "静态编排策略版本、委派深度、稳定标识或边界文本无效",
            Some("config/orchestration.yaml".into()),
            Some("深度使用 0 到 32；范围使用不重复稳定标识；条件与禁止事项每类最多 100 项"),
        )));
    }
    let _static_boundaries = (
        policy.enabled,
        policy.require_workspace_binding,
        policy.require_sop_match,
        policy.require_service_grant_for_cross_department,
    );
    Ok(())
}

fn parse_permissions_document(content: &str) -> Result<PermissionsDocument, Box<DiagnosticDto>> {
    let document: PermissionsDocument = serde_yaml::from_str(content).map_err(|_| {
        Box::new(diagnostic(
            "permissions_invalid",
            "error",
            "config/permissions.yaml 不符合冻结的长期权限 schema",
            Some("config/permissions.yaml".into()),
            Some("修正 YAML 字段、类型和未知字段后重试"),
        ))
    })?;
    let values = [
        &document.permissions.files,
        &document.permissions.commands,
        &document.permissions.network,
        &document.permissions.delegation,
    ];
    if document.schema_version != CURRENT_SCHEMA_VERSION
        || values
            .iter()
            .any(|value| value.is_empty() || value.len() > 256 || value.contains('\0'))
    {
        return Err(Box::new(diagnostic(
            "permissions_invalid",
            "error",
            "长期权限版本或边界值无效",
            Some("config/permissions.yaml".into()),
            Some("每项使用 1 到 256 字节的非空权限边界说明"),
        )));
    }
    Ok(document)
}

fn validate_permissions_document(content: &str) -> Result<(), Box<DiagnosticDto>> {
    parse_permissions_document(content).map(|_| ())
}

fn validate_yaml_asset(kind: &str, content: &str) -> Result<(), Box<DiagnosticDto>> {
    match kind {
        "context" => validate_context_document(content),
        "rules" => validate_rules_document(content),
        "skills" => validate_skills_document(content),
        "mcp" => validate_mcp_document(content),
        "permissions" => validate_permissions_document(content),
        "sop" => validate_sop_document(content),
        "orchestration" => validate_orchestration_document(content),
        "hooks" => validate_hooks_document(content),
        "commands" => validate_commands_document(content),
        "workspace_binding" => validate_workspace_binding_document(content),
        _ => serde_yaml::from_str::<serde_yaml::Value>(content)
            .map(|_| ())
            .map_err(|_| {
                Box::new(diagnostic(
                    &format!("{kind}_invalid"),
                    "error",
                    "配置文件不是有效 YAML",
                    None,
                    Some("修正 YAML 后重试"),
                ))
            }),
    }
}

#[allow(clippy::too_many_arguments)]
fn discover_managed_yaml_asset(
    discovered: &mut Vec<DiscoveredAsset>,
    diagnostics: &mut Vec<DiagnosticDto>,
    package_path: &Path,
    agent_id: &str,
    relative_path: &str,
    kind: &str,
    current: bool,
    compatibility_reason: Option<&str>,
) {
    let target = package_path.join(relative_path);
    let metadata = match fs::symlink_metadata(&target) {
        Ok(value) => value,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            diagnostics.push(diagnostic(
                &format!("{kind}_missing"),
                "warning",
                &format!("AgentPackage 缺少 {relative_path}"),
                Some(relative_path.into()),
                Some("补充 canonical 配置文件"),
            ));
            return;
        }
        Err(_) => {
            diagnostics.push(diagnostic(
                &format!("{kind}_unreadable"),
                "error",
                &format!("无法检查 {relative_path}"),
                Some(relative_path.into()),
                Some("检查文件权限"),
            ));
            return;
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        diagnostics.push(diagnostic(
            &format!("{kind}_target_rejected"),
            "error",
            &format!("{relative_path} 必须是 package 内普通文件"),
            Some(relative_path.into()),
            Some("移除符号链接或非文件目标"),
        ));
        return;
    }
    let content = match fs::read_to_string(&target) {
        Ok(value) => value,
        Err(_) => {
            diagnostics.push(diagnostic(
                &format!("{kind}_unreadable"),
                "error",
                &format!("无法读取 {relative_path}"),
                Some(relative_path.into()),
                Some("确认文件为 UTF-8 且可读"),
            ));
            return;
        }
    };
    let validation = validate_yaml_asset(kind, &content);
    let parsed = validation.is_ok();
    let hash = hash_bytes(content.as_bytes());
    let container_id = stable_id("container", &format!("managed:{agent_id}:{relative_path}"));
    let asset_identity = if kind == "workspace_binding" {
        format!("managed:{agent_id}:{kind}:{relative_path}")
    } else {
        format!("managed:{agent_id}:{kind}")
    };
    let asset_id = stable_id("asset", &asset_identity);
    let writable = current && parsed && !metadata.permissions().readonly();
    let mut asset_diagnostics = compatibility_reason
        .map(|message| {
            vec![diagnostic(
                "package_schema_unsupported",
                "warning",
                message,
                Some("agent.yaml".into()),
                Some("使用兼容版本的 Bandi 处理该 package"),
            )]
        })
        .unwrap_or_default();
    if let Err(issue) = validation {
        asset_diagnostics.push(*issue);
    }
    let locator = AssetLocatorDto {
        root_kind: RootKind::Managed,
        display_path: target.to_string_lossy().into_owned(),
        relative_path: Some(format!("agt_{agent_id}/{relative_path}")),
    };
    let summary = SourceAssetSummaryDto {
        id: asset_id,
        container_id: container_id.clone(),
        kind: kind.into(),
        official_scope: "managed".into(),
        asset_content_hash: hash.clone(),
        container_content_hash: hash.clone(),
        writable,
        parse_status: if !current {
            "unsupported"
        } else if parsed {
            "parsed"
        } else {
            "invalid"
        }
        .into(),
        diagnostics: asset_diagnostics,
    };
    discovered.push(DiscoveredAsset {
        container: SourceContainerDto {
            id: container_id,
            locator,
            format: "yaml".into(),
            content_hash: hash,
            writable,
            read_only_reason: compatibility_reason.map(str::to_owned),
        },
        summary,
        content,
        target,
    });
}

fn discover_workspace_bindings(
    discovered: &mut Vec<DiscoveredAsset>,
    diagnostics: &mut Vec<DiagnosticDto>,
    package_path: &Path,
    agent_id: &str,
    current: bool,
    compatibility_reason: Option<&str>,
) {
    let root = package_path.join("workspaces");
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return,
        Err(_) => {
            diagnostics.push(diagnostic(
                "workspace_bindings_unreadable",
                "error",
                "无法读取 AgentPackage 的 WorkspaceBinding 目录",
                Some("workspaces".into()),
                Some("检查目录权限与结构"),
            ));
            return;
        }
    };
    for entry in entries.flatten() {
        let workspace_id = entry.file_name().to_string_lossy().into_owned();
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !validate_identifier(&workspace_id)
            || metadata.file_type().is_symlink()
            || !metadata.is_dir()
        {
            diagnostics.push(diagnostic(
                "workspace_binding_directory_rejected",
                "error",
                "WorkspaceBinding 必须位于稳定 Workspace ID 命名的普通目录",
                Some(format!("workspaces/{workspace_id}")),
                Some("移除非法目录、路径穿越或符号链接"),
            ));
            continue;
        }
        let relative_path = format!("workspaces/{workspace_id}/config.yaml");
        let before = discovered.len();
        discover_managed_yaml_asset(
            discovered,
            diagnostics,
            package_path,
            agent_id,
            &relative_path,
            "workspace_binding",
            current,
            compatibility_reason,
        );
        if let Some(asset) = discovered.get_mut(before) {
            match parse_workspace_binding_document(&asset.content) {
                Ok(document) if document.workspace_binding.workspace_id != workspace_id => {
                    asset.summary.writable = false;
                    asset.summary.parse_status = "invalid".into();
                    asset.container.writable = false;
                    asset.summary.diagnostics.push(diagnostic(
                        "workspace_binding_identity_mismatch",
                        "error",
                        "WorkspaceBinding 内 workspaceId 与目录身份不一致",
                        Some(relative_path.clone()),
                        Some("保持目录名与 workspaceBinding.workspaceId 完全一致"),
                    ));
                }
                Ok(document) => {
                    if let Err(issue) = validate_workspace_binding_boundaries(
                        package_path,
                        &document.workspace_binding,
                    ) {
                        asset.summary.writable = false;
                        asset.summary.parse_status = "invalid".into();
                        asset.container.writable = false;
                        asset.summary.diagnostics.push(*issue);
                    }
                }
                Err(_) => {}
            }
        }
    }
}

fn canonical_package_text(package_path: &Path, relative_path: &str) -> Result<String, String> {
    let target = package_path.join(relative_path);
    let metadata = fs::symlink_metadata(&target).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            format!("AGENT_CANONICAL_MISSING: AgentPackage 缺少 {relative_path}")
        } else {
            format!("AGENT_CANONICAL_UNREADABLE: 无法检查 {relative_path}")
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "AGENT_CANONICAL_REJECTED: {relative_path} 必须是 package 内普通文件"
        ));
    }
    fs::read_to_string(target)
        .map_err(|_| format!("AGENT_CANONICAL_UNREADABLE: 无法读取 {relative_path}"))
}

fn canonical_yaml_object(
    package_path: &Path,
    relative_path: &str,
    kind: &str,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let content = canonical_package_text(package_path, relative_path)?;
    validate_yaml_asset(kind, &content).map_err(|issue| {
        format!(
            "AGENT_CANONICAL_INVALID: {} ({relative_path})",
            issue.message
        )
    })?;
    let value: serde_json::Value = serde_yaml::from_str(&content)
        .map_err(|_| format!("AGENT_CANONICAL_INVALID: 无法解析 {relative_path}"))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| format!("AGENT_CANONICAL_INVALID: {relative_path} 必须是对象"))
}

fn replace_projection_field(
    agent: &mut serde_json::Map<String, serde_json::Value>,
    document: &serde_json::Map<String, serde_json::Value>,
    source: &str,
    target: &str,
    relative_path: &str,
) -> Result<(), String> {
    let value = document
        .get(source)
        .cloned()
        .ok_or_else(|| format!("AGENT_CANONICAL_INVALID: {relative_path} 缺少 {source}"))?;
    agent.insert(target.into(), value);
    Ok(())
}

fn project_workspace_bindings(
    package_path: &Path,
    previous: Option<&serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let root = package_path.join("workspaces");
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => {
            return Err(
                "AGENT_CANONICAL_UNREADABLE: 无法读取 AgentPackage 的 workspaces 目录".into(),
            )
        }
    };
    let previous = previous
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut bindings = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| {
            "AGENT_CANONICAL_UNREADABLE: 无法枚举 AgentPackage 的 workspaces 目录".to_string()
        })?;
        let workspace_id = entry.file_name().to_string_lossy().into_owned();
        let metadata = fs::symlink_metadata(entry.path()).map_err(|_| {
            format!("AGENT_CANONICAL_UNREADABLE: 无法检查 workspaces/{workspace_id}")
        })?;
        if !validate_identifier(&workspace_id)
            || metadata.file_type().is_symlink()
            || !metadata.is_dir()
        {
            return Err(format!(
                "AGENT_CANONICAL_REJECTED: workspaces/{workspace_id} 必须是稳定 ID 命名的普通目录"
            ));
        }
        let relative_path = format!("workspaces/{workspace_id}/config.yaml");
        let document = canonical_yaml_object(package_path, &relative_path, "workspace_binding")?;
        let mut binding = document
            .get("workspaceBinding")
            .and_then(serde_json::Value::as_object)
            .cloned()
            .ok_or_else(|| {
                format!("AGENT_CANONICAL_INVALID: {relative_path} 缺少 workspaceBinding")
            })?;
        if binding
            .get("workspaceId")
            .and_then(serde_json::Value::as_str)
            != Some(workspace_id.as_str())
        {
            return Err(format!(
                "AGENT_CANONICAL_INVALID: {relative_path} 的 workspaceId 与目录身份不一致"
            ));
        }
        let memory_revision = previous
            .iter()
            .find(|item| {
                item.get("workspaceId").and_then(serde_json::Value::as_str) == Some(&workspace_id)
            })
            .and_then(|item| item.get("memoryRevision"))
            .cloned()
            .unwrap_or_else(|| serde_json::Value::String(String::new()));
        binding.insert("memoryRevision".into(), memory_revision);
        bindings.push(serde_json::Value::Object(binding));
    }
    bindings.sort_by(|left, right| {
        left.get("workspaceId")
            .and_then(serde_json::Value::as_str)
            .cmp(&right.get("workspaceId").and_then(serde_json::Value::as_str))
    });
    Ok(bindings)
}

pub(crate) fn project_managed_agent_at(
    package_path: &Path,
    agent_id: &str,
) -> Result<serde_json::Value, String> {
    if !validate_identifier(agent_id) {
        return Err("AGENT_CANONICAL_INVALID: Agent 目录标识无效".into());
    }
    let index_path = package_path.join(".bandi-agent.json");
    let index = fs::read(&index_path).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            "AGENT_INDEX_MISSING: 缺少 Agent 非配置身份索引，无法完整重建 FullAgent".to_string()
        } else {
            "AGENT_INDEX_UNREADABLE: 无法读取 Agent 非配置身份索引".to_string()
        }
    })?;
    let mut agent: serde_json::Value = serde_json::from_slice(&index)
        .map_err(|_| "AGENT_INDEX_INVALID: Agent 非配置身份索引已损坏".to_string())?;
    let agent = agent
        .as_object_mut()
        .ok_or_else(|| "AGENT_INDEX_INVALID: Agent 非配置身份索引必须是对象".to_string())?;
    if agent.get("id").and_then(serde_json::Value::as_str) != Some(agent_id) {
        return Err("AGENT_INDEX_INVALID: Agent 非配置身份索引与目录身份不一致".into());
    }

    let manifest_path = package_path.join("agent.yaml");
    let (manifest_id, schema_version) = manifest_facts(&manifest_path)
        .map_err(|issue| format!("AGENT_CANONICAL_INVALID: {}", issue.message))?;
    if manifest_id != agent_id || schema_version != CURRENT_SCHEMA_VERSION {
        return Err("AGENT_CANONICAL_INVALID: agent.yaml 身份不一致或版本不受支持".into());
    }
    let manifest: serde_json::Value =
        serde_yaml::from_str(&canonical_package_text(package_path, "agent.yaml")?)
            .map_err(|_| "AGENT_CANONICAL_INVALID: agent.yaml 不是有效 YAML".to_string())?;
    let manifest = manifest
        .as_object()
        .ok_or_else(|| "AGENT_CANONICAL_INVALID: agent.yaml 必须是对象".to_string())?;
    const IDENTITY_FIELDS: &[&str] = &[
        "id",
        "name",
        "roleId",
        "status",
        "companyId",
        "primaryDepartmentId",
        "managerAgentId",
        "avatarPath",
        "mission",
        "responsibilities",
        "deliverables",
        "decisionBoundaries",
        "escalationConditions",
        "prohibitions",
        "completionDefinition",
    ];
    for field in IDENTITY_FIELDS {
        if let Some(value) = manifest.get(*field) {
            agent.insert((*field).into(), value.clone());
        } else {
            agent.remove(*field);
        }
    }
    agent.insert(
        "packageSchema".into(),
        serde_json::json!({ "schemaVersion": schema_version, "compatibility": "current" }),
    );
    agent.insert(
        "instructions".into(),
        serde_json::Value::String(canonical_package_text(package_path, "instructions.md")?),
    );

    for (path, kind, source, target) in [
        ("config/rules.yaml", "rules", "rules", "ruleRefs"),
        ("config/skills.yaml", "skills", "skills", "skillRefs"),
        ("config/mcp.yaml", "mcp", "mcp", "mcpRefs"),
        ("config/sop.yaml", "sop", "sop", "sopRefs"),
        (
            "config/permissions.yaml",
            "permissions",
            "permissions",
            "permissions",
        ),
        (
            "config/orchestration.yaml",
            "orchestration",
            "orchestration",
            "orchestrationPolicy",
        ),
        ("config/hooks.yaml", "hooks", "hooks", "hookRefs"),
        (
            "config/commands.yaml",
            "commands",
            "commands",
            "commandRefs",
        ),
    ] {
        let document = canonical_yaml_object(package_path, path, kind)?;
        replace_projection_field(agent, &document, source, target, path)?;
    }
    let context = canonical_yaml_object(package_path, "config/context.yaml", "context")?;
    for field in [
        "contextPolicy",
        "contextWindowTokens",
        "outputProfileId",
        "outputParameterBindings",
    ] {
        replace_projection_field(agent, &context, field, field, "config/context.yaml")?;
    }

    let bindings = project_workspace_bindings(package_path, agent.get("workspaceBindings"))?;
    agent.insert("workspaces".into(), serde_json::json!(bindings.len()));
    agent.insert(
        "workspaceBindings".into(),
        serde_json::Value::Array(bindings),
    );
    Ok(serde_json::Value::Object(agent.clone()))
}

fn discover_managed_assets(managed_root: &Path) -> (Vec<DiscoveredAsset>, Vec<DiagnosticDto>) {
    let entries = match fs::read_dir(managed_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return (Vec::new(), Vec::new()),
        Err(_) => {
            return (
                Vec::new(),
                vec![diagnostic(
                    "managed_root_unreadable",
                    "error",
                    "无法读取受管 Agent 根目录",
                    None,
                    Some("检查 ~/.bandi/agents 权限"),
                )],
            )
        }
    };
    let mut discovered = Vec::new();
    let mut diagnostics = Vec::new();
    let mut ids = HashSet::new();
    for entry in entries.flatten() {
        let package_path = entry.path();
        let package_metadata = match fs::symlink_metadata(&package_path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if package_metadata.file_type().is_symlink() || !package_metadata.is_dir() {
            if entry.file_name().to_string_lossy().starts_with("agt_") {
                diagnostics.push(diagnostic(
                    "package_symlink_rejected",
                    "error",
                    "受管 AgentPackage 不能是符号链接",
                    None,
                    Some("将 package 移回受管根内的普通目录"),
                ));
            }
            continue;
        }
        let (agent_id, schema_version) = match manifest_facts(&package_path.join("agent.yaml")) {
            Ok(value) => value,
            Err(error) => {
                diagnostics.push(*error);
                continue;
            }
        };
        let expected_directory = format!("agt_{agent_id}");
        if entry.file_name().to_string_lossy() != expected_directory {
            diagnostics.push(diagnostic(
                "stable_id_directory_mismatch",
                "error",
                "Agent 稳定 id 与受管目录身份不一致",
                Some("agent.yaml".into()),
                Some("将 package 放回与稳定 id 对应的目录"),
            ));
            continue;
        }
        if !ids.insert(agent_id.clone()) {
            diagnostics.push(diagnostic(
                "stable_id_conflict",
                "error",
                "发现重复的 Agent 稳定 id",
                Some("agent.yaml".into()),
                Some("为冲突 package 修复稳定 id"),
            ));
            continue;
        }
        let current = schema_version == CURRENT_SCHEMA_VERSION;
        let compatibility_reason = if schema_version < CURRENT_SCHEMA_VERSION {
            Some("legacy AgentPackage 只读")
        } else if schema_version > CURRENT_SCHEMA_VERSION {
            Some("future AgentPackage 只读")
        } else {
            None
        };
        let instructions_path = package_path.join("instructions.md");
        let metadata = match fs::symlink_metadata(&instructions_path) {
            Ok(value) => value,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                diagnostics.push(diagnostic(
                    "instructions_missing",
                    "warning",
                    "AgentPackage 缺少 instructions.md",
                    Some("instructions.md".into()),
                    Some("补充 canonical Instructions 文件"),
                ));
                continue;
            }
            Err(_) => {
                diagnostics.push(diagnostic(
                    "instructions_unreadable",
                    "error",
                    "无法检查 instructions.md",
                    Some("instructions.md".into()),
                    Some("检查文件权限"),
                ));
                continue;
            }
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            diagnostics.push(diagnostic(
                "instructions_target_rejected",
                "error",
                "instructions.md 必须是 package 内普通文件",
                Some("instructions.md".into()),
                Some("移除符号链接或非文件目标"),
            ));
            continue;
        }
        let content = match fs::read_to_string(&instructions_path) {
            Ok(value) => value,
            Err(_) => {
                diagnostics.push(diagnostic(
                    "instructions_unreadable",
                    "error",
                    "无法读取 instructions.md",
                    Some("instructions.md".into()),
                    Some("确认文件为 UTF-8 且可读"),
                ));
                continue;
            }
        };
        let hash = hash_bytes(content.as_bytes());
        let container_id = stable_id("container", &format!("managed:{agent_id}:instructions.md"));
        let asset_id = stable_id("asset", &format!("managed:{agent_id}:instructions"));
        let asset_diagnostics = compatibility_reason
            .map(|message| {
                vec![diagnostic(
                    "package_schema_unsupported",
                    "warning",
                    message,
                    Some("agent.yaml".into()),
                    Some("使用兼容版本的 Bandi 处理该 package"),
                )]
            })
            .unwrap_or_default();
        let locator = AssetLocatorDto {
            root_kind: RootKind::Managed,
            display_path: instructions_path.to_string_lossy().into_owned(),
            relative_path: Some(format!("agt_{agent_id}/instructions.md")),
        };
        let summary = SourceAssetSummaryDto {
            id: asset_id,
            container_id: container_id.clone(),
            kind: "instructions".into(),
            official_scope: "managed".into(),
            asset_content_hash: hash.clone(),
            container_content_hash: hash.clone(),
            writable: current && !metadata.permissions().readonly(),
            parse_status: if current {
                "parsed".into()
            } else {
                "unsupported".into()
            },
            diagnostics: asset_diagnostics,
        };
        let container = SourceContainerDto {
            id: container_id,
            locator,
            format: "markdown".into(),
            content_hash: hash,
            writable: summary.writable,
            read_only_reason: compatibility_reason.map(str::to_owned),
        };
        discovered.push(DiscoveredAsset {
            summary,
            container,
            content,
            target: instructions_path,
        });
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/context.yaml",
            "context",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/rules.yaml",
            "rules",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/skills.yaml",
            "skills",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/mcp.yaml",
            "mcp",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/permissions.yaml",
            "permissions",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/sop.yaml",
            "sop",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/orchestration.yaml",
            "orchestration",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/hooks.yaml",
            "hooks",
            current,
            compatibility_reason,
        );
        discover_managed_yaml_asset(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            "config/commands.yaml",
            "commands",
            current,
            compatibility_reason,
        );
        discover_workspace_bindings(
            &mut discovered,
            &mut diagnostics,
            &package_path,
            &agent_id,
            current,
            compatibility_reason,
        );
    }
    (discovered, diagnostics)
}

fn referenced_assets(asset: &DiscoveredAsset) -> Vec<(String, &'static str, Option<String>)> {
    let plain = |ids: Vec<String>, kind| ids.into_iter().map(|id| (id, kind, None)).collect();
    match asset.summary.kind.as_str() {
        "context" => serde_yaml::from_str::<ContextPolicyDocument>(&asset.content)
            .ok()
            .filter(|document| !document.output_profile_id.is_empty())
            .map(|document| vec![(document.output_profile_id, "output_profile", None)])
            .unwrap_or_default(),
        "rules" => serde_yaml::from_str::<RulesDocument>(&asset.content)
            .map(|document| plain(document.rules, "rule"))
            .unwrap_or_default(),
        "skills" => serde_yaml::from_str::<SkillsDocument>(&asset.content)
            .map(|document| plain(document.skills, "skill"))
            .unwrap_or_default(),
        "mcp" => serde_yaml::from_str::<McpDocument>(&asset.content)
            .map(|document| plain(document.mcp, "mcp"))
            .unwrap_or_default(),
        "sop" => serde_yaml::from_str::<SopDocument>(&asset.content)
            .map(|document| plain(document.sop, "sop"))
            .unwrap_or_default(),
        "hooks" => serde_yaml::from_str::<HookReferencesDocument>(&asset.content)
            .map(|document| {
                plain(
                    document
                        .hooks
                        .into_iter()
                        .map(|item| item.asset_id)
                        .collect(),
                    "hook",
                )
            })
            .unwrap_or_default(),
        "commands" => serde_yaml::from_str::<CommandReferencesDocument>(&asset.content)
            .map(|document| {
                plain(
                    document
                        .commands
                        .into_iter()
                        .map(|item| item.asset_id)
                        .collect(),
                    "command",
                )
            })
            .unwrap_or_default(),
        "workspace_binding" => parse_workspace_binding_document(&asset.content)
            .map(|document| {
                let binding = document.workspace_binding;
                let workspace_id = Some(binding.workspace_id.clone());
                let mut items = Vec::new();
                items.extend(
                    binding
                        .rule_ids
                        .into_iter()
                        .map(|id| (id, "rule", workspace_id.clone())),
                );
                items.extend(
                    binding
                        .skill_ids
                        .into_iter()
                        .map(|id| (id, "skill", workspace_id.clone())),
                );
                items.extend(
                    binding
                        .mcp_ids
                        .into_iter()
                        .map(|id| (id, "mcp", workspace_id.clone())),
                );
                if let Some(id) = binding.output_profile_id.filter(|id| !id.is_empty()) {
                    items.push((id, "output_profile", workspace_id.clone()));
                }
                items.extend(
                    binding
                        .hook_refs
                        .unwrap_or_default()
                        .into_iter()
                        .map(|item| (item.asset_id, "hook", workspace_id.clone())),
                );
                items.extend(
                    binding
                        .command_refs
                        .unwrap_or_default()
                        .into_iter()
                        .map(|item| (item.asset_id, "command", workspace_id.clone())),
                );
                items
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn reference_state(
    target: Option<&SharedAssetNodeDto>,
    target_kind: &str,
    referrer_company: Option<&str>,
    root_available: bool,
) -> &'static str {
    match target {
        Some(target) if target.parse_status != "parsed" => "target_invalid",
        Some(target) if target.kind != target_kind => "type_mismatch",
        Some(_) if referrer_company.is_none() => "unresolved",
        Some(target) if referrer_company != Some(target.company_id.as_str()) => "out_of_scope",
        Some(_) => "resolved",
        None if root_available => "dangling",
        None => "unresolved",
    }
}

fn reference_diagnostic(state: &str, target_asset_id: &str) -> Option<DiagnosticDto> {
    let (code, message, remediation) = match state {
        "dangling" => (
            "asset_reference_dangling",
            format!("显式引用的共享资产 {target_asset_id} 不存在"),
            "恢复目标本体或移除该显式引用",
        ),
        "type_mismatch" => (
            "asset_reference_type_mismatch",
            format!("显式引用的共享资产 {target_asset_id} 类型不匹配"),
            "改用目标真实类型或替换引用",
        ),
        "out_of_scope" => (
            "asset_reference_out_of_scope",
            format!("显式引用的共享资产 {target_asset_id} 超出 Agent 所属 Company 范围"),
            "移除跨 Company 引用或完成独立授权登记",
        ),
        "target_invalid" => (
            "asset_reference_target_invalid",
            format!("显式引用的共享资产 {target_asset_id} 本体无效"),
            "修复目标 manifest、归属或正文后刷新索引",
        ),
        "unresolved" => (
            "asset_reference_unresolved",
            format!("显式引用的共享资产 {target_asset_id} 尚无法确认本体"),
            "初始化共享资产根后刷新索引",
        ),
        _ => return None,
    };
    Some(diagnostic(
        code,
        "warning",
        &message,
        Some("targetAssetId".into()),
        Some(remediation),
    ))
}

fn reference_graph(
    assets: &[DiscoveredAsset],
    targets: &[SharedAssetNodeDto],
    snapshot: &OrganizationSnapshotDto,
    root_available: bool,
) -> (Vec<AssetReferenceDto>, Vec<DiagnosticDto>) {
    let target_index = targets
        .iter()
        .map(|target| (target.id.as_str(), target))
        .collect::<std::collections::HashMap<_, _>>();
    let companies = shared_assets::agent_companies(snapshot);
    let mut references = Vec::new();
    let mut diagnostics = Vec::new();
    for asset in assets
        .iter()
        .filter(|asset| asset.summary.parse_status == "parsed")
    {
        let source_path = asset
            .container
            .locator
            .relative_path
            .clone()
            .unwrap_or_else(|| asset.container.locator.display_path.clone());
        let referrer_id = source_path
            .strip_prefix("agt_")
            .and_then(|path| path.split('/').next())
            .unwrap_or("unknown")
            .to_string();
        let referrer_company = companies.get(&referrer_id).map(String::as_str);
        for (target_asset_id, target_kind, workspace_id) in referenced_assets(asset) {
            let target = target_index.get(target_asset_id.as_str()).copied();
            let state = reference_state(target, target_kind, referrer_company, root_available);
            references.push(AssetReferenceDto {
                source_asset_id: asset.summary.id.clone(),
                source_container_id: asset.summary.container_id.clone(),
                referrer_kind: "agent".into(),
                referrer_id: referrer_id.clone(),
                workspace_id,
                target_asset_id: target_asset_id.clone(),
                target_kind: target_kind.into(),
                state: state.into(),
                target_locator: target.map(|target| target.locator.clone()),
                target_company_id: target.map(|target| target.company_id.clone()),
                source_path: source_path.clone(),
            });
            if let Some(issue) = reference_diagnostic(state, &target_asset_id) {
                diagnostics.push(issue);
            }
        }
    }
    references.sort_by(|left, right| {
        (
            &left.target_asset_id,
            &left.source_asset_id,
            &left.workspace_id,
        )
            .cmp(&(
                &right.target_asset_id,
                &right.source_asset_id,
                &right.workspace_id,
            ))
    });
    (references, diagnostics)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn discover_at(
    registry_root: &Path,
    managed_root: &Path,
    request: DiscoveryRequest,
) -> DiscoveryResult {
    discover_with_shared_at(
        registry_root,
        managed_root,
        Path::new(""),
        &OrganizationSnapshotDto {
            schema_version: 1,
            companies: Vec::new(),
            departments: Vec::new(),
            roles: Vec::new(),
            workspaces: Vec::new(),
            service_grants: Vec::new(),
        },
        false,
        request,
    )
}

pub(crate) fn discover_with_shared_at(
    registry_root: &Path,
    managed_root: &Path,
    shared_root: &Path,
    snapshot: &OrganizationSnapshotDto,
    discover_shared: bool,
    request: DiscoveryRequest,
) -> DiscoveryResult {
    let mut diagnostics = Vec::new();
    let mut seen_workspaces = HashSet::new();
    for workspace_id in &request.workspace_ids {
        if !seen_workspaces.insert(workspace_id) {
            diagnostics.push(diagnostic(
                "workspace_duplicate",
                "warning",
                "发现请求包含重复工作区",
                None,
                None,
            ));
            continue;
        }
        if let Err(message) = workspace_path_from_registry_at(registry_root, workspace_id) {
            diagnostics.push(diagnostic(
                "workspace_unavailable",
                "error",
                &message,
                None,
                Some("重新登记该工作区"),
            ));
        }
    }
    if request.include_claude_user_root {
        diagnostics.push(diagnostic(
            "claude_user_root_not_checked",
            "info",
            "Claude 用户配置根尚未进入 Instructions 首切片",
            None,
            Some("当前仅发现受管 AgentPackage"),
        ));
    }
    let (assets, mut asset_diagnostics) = discover_managed_assets(managed_root);
    diagnostics.append(&mut asset_diagnostics);
    let shared_index = if discover_shared {
        shared_assets::discover(shared_root, snapshot)
    } else {
        shared_assets::SharedAssetIndex {
            nodes: Vec::new(),
            root_available: false,
            diagnostics: Vec::new(),
        }
    };
    diagnostics.extend(shared_index.diagnostics);
    let (references, mut reference_diagnostics) = reference_graph(
        &assets,
        &shared_index.nodes,
        snapshot,
        shared_index.root_available,
    );
    diagnostics.append(&mut reference_diagnostics);
    DiscoveryResult {
        request_id: request.request_id,
        profile_version: PROFILE_VERSION.into(),
        containers: assets.iter().map(|item| item.container.clone()).collect(),
        assets: assets.into_iter().map(|item| item.summary).collect(),
        shared_assets: shared_index.nodes,
        references,
        diagnostics,
    }
}

pub(crate) fn current_side(content: String) -> ConfigSideDto {
    let hash = hash_bytes(content.as_bytes());
    ConfigSideDto {
        content,
        asset_content_hash: hash.clone(),
        container_content_hash: hash,
        redacted: false,
    }
}

pub(crate) fn append_revision(
    revisions_root: &Path,
    revision: &ConfigRevisionDto,
    content: &str,
) -> Result<(), String> {
    fs::create_dir_all(revisions_root).map_err(|_| "无法创建 ConfigRevision 目录".to_string())?;
    let record_path = revisions_root.join(format!("{}.json", revision.id));
    let content_path = revisions_root.join(format!("{}.content", revision.id));
    let bytes =
        serde_json::to_vec(revision).map_err(|_| "ConfigRevision 无法序列化".to_string())?;
    write_record_atomic(&content_path, content.as_bytes())?;
    if let Err(error) = write_record_atomic(&record_path, &bytes) {
        let _ = fs::remove_file(content_path);
        return Err(error);
    }
    Ok(())
}

pub(crate) fn list_revisions_at(
    revisions_root: &Path,
    asset_id: &str,
) -> Result<Vec<ConfigRevisionDto>, String> {
    if asset_id.is_empty() || asset_id.len() > 160 {
        return Err("ConfigRevision 资产标识无效".into());
    }
    let entries = match fs::read_dir(revisions_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("无法读取 ConfigRevision 目录".into()),
    };
    let mut revisions = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
            _ => continue,
        };
        if metadata.len() > 1024 * 1024 {
            continue;
        }
        let revision: ConfigRevisionDto = match fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        {
            Some(revision) => revision,
            None => continue,
        };
        if revision.asset_id == asset_id {
            revisions.push(revision);
        }
    }
    revisions.sort_by(|left, right| right.saved_at.cmp(&left.saved_at));
    Ok(revisions)
}

pub(crate) fn read_revision_content_at(
    revisions_root: &Path,
    revision_id: &str,
) -> Result<String, String> {
    if !validate_identifier(revision_id) {
        return Err("ConfigRevision 标识无效".into());
    }
    let record_path = revisions_root.join(format!("{revision_id}.json"));
    let content_path = revisions_root.join(format!("{revision_id}.content"));
    for path in [&record_path, &content_path] {
        let metadata =
            fs::symlink_metadata(path).map_err(|_| "ConfigRevision 不存在或不完整".to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("ConfigRevision 记录必须是普通文件".into());
        }
    }
    let revision: ConfigRevisionDto = serde_json::from_slice(
        &fs::read(record_path).map_err(|_| "无法读取 ConfigRevision".to_string())?,
    )
    .map_err(|_| "ConfigRevision 记录无效".to_string())?;
    if revision.id != revision_id {
        return Err("ConfigRevision 身份不一致".into());
    }
    let content = fs::read_to_string(content_path)
        .map_err(|_| "无法读取 ConfigRevision 历史内容".to_string())?;
    if hash_bytes(content.as_bytes()) != revision.asset_content_hash {
        return Err("ConfigRevision 历史内容校验失败".into());
    }
    Ok(content)
}

pub(crate) fn create_workspace_binding_at(
    registry_root: &Path,
    managed_root: &Path,
    revisions_root: &Path,
    request: CreateWorkspaceBindingRequest,
) -> SaveConfigResult {
    let request_id = request.request_id.clone();
    if !validate_identifier(&request.request_id)
        || !validate_identifier(&request.agent_id)
        || !validate_identifier(&request.workspace_id)
        || request.value.len() > 1024 * 1024
        || request.value.contains('\0')
    {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_create_invalid",
                "error",
                "WorkspaceBinding 创建请求无效",
                None,
                Some("刷新页面并重新选择已登记 Workspace"),
            )],
        };
    }
    if let Err(message) = workspace_path_from_registry_at(registry_root, &request.workspace_id) {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_workspace_unavailable",
                "error",
                &message,
                Some("workspaceId".into()),
                Some("先登记或修复该 Workspace"),
            )],
        };
    }
    let binding = match parse_workspace_binding_document(&request.value) {
        Ok(document) if document.workspace_binding.workspace_id == request.workspace_id => {
            document.workspace_binding
        }
        Ok(_) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_identity_mismatch",
                    "error",
                    "WorkspaceBinding 正文身份与创建请求不一致",
                    Some("workspaceBinding.workspaceId".into()),
                    Some("重新选择目标 Workspace"),
                )],
            }
        }
        Err(issue) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![*issue],
            }
        }
    };
    if let Err(issue) = validate_workspace_binding_document(&request.value) {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![*issue],
        };
    }
    let package_path = managed_root.join(format!("agt_{}", request.agent_id));
    let package_metadata = match fs::symlink_metadata(&package_path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => metadata,
        _ => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_package_unavailable",
                    "error",
                    "目标受管 AgentPackage 不存在或不是普通目录",
                    None,
                    Some("重新发现目标 AgentPackage"),
                )],
            }
        }
    };
    let _ = package_metadata;
    match manifest_facts(&package_path.join("agent.yaml")) {
        Ok((agent_id, schema_version))
            if agent_id == request.agent_id && schema_version == CURRENT_SCHEMA_VERSION => {}
        _ => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_package_incompatible",
                    "error",
                    "目标 AgentPackage 身份不一致或不是 current v1",
                    None,
                    Some("使用可写的 current v1 受管 AgentPackage"),
                )],
            }
        }
    }
    if let Err(issue) = validate_workspace_binding_boundaries(&package_path, &binding) {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![*issue],
        };
    }
    let workspaces_path = package_path.join("workspaces");
    if let Ok(metadata) = fs::symlink_metadata(&workspaces_path) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_parent_rejected",
                    "error",
                    "AgentPackage 的 workspaces 入口必须是普通目录",
                    Some("workspaces".into()),
                    Some("修复 AgentPackage 目录后重试"),
                )],
            };
        }
    } else if fs::create_dir(&workspaces_path).is_err() {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_parent_create_failed",
                "error",
                "无法创建 AgentPackage 的 workspaces 目录",
                Some("workspaces".into()),
                Some("检查 AgentPackage 目录权限"),
            )],
            retryable: true,
            file_state: "unchanged".into(),
            recovery_ref: None,
        };
    }
    let binding_dir = workspaces_path.join(&request.workspace_id);
    match fs::symlink_metadata(&binding_dir) {
        Ok(_) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_already_exists",
                    "error",
                    "目标 WorkspaceBinding 已存在或目录身份冲突",
                    Some(format!("workspaces/{}", request.workspace_id)),
                    Some("重新发现并编辑现有 Binding"),
                )],
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(_) => {
            return SaveConfigResult::SaveFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_target_unavailable",
                    "error",
                    "无法确认 WorkspaceBinding 目标状态",
                    None,
                    Some("检查 AgentPackage 目录权限"),
                )],
                retryable: true,
                file_state: "unchanged".into(),
                recovery_ref: None,
            }
        }
    }
    if fs::create_dir(&binding_dir).is_err() {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_directory_create_failed",
                "error",
                "无法安全创建 WorkspaceBinding 目录",
                Some(format!("workspaces/{}", request.workspace_id)),
                Some("检查 AgentPackage 目录权限"),
            )],
            retryable: true,
            file_state: "unchanged".into(),
            recovery_ref: None,
        };
    }
    let target = binding_dir.join("config.yaml");
    if let Err(message) =
        restricted_atomic_write(&target, request.value.as_bytes(), false, "WorkspaceBinding")
    {
        let _ = fs::remove_dir(&binding_dir);
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_create_failed",
                "error",
                &message,
                Some(format!("workspaces/{}/config.yaml", request.workspace_id)),
                Some("检查 AgentPackage 目录权限后重试"),
            )],
            retryable: true,
            file_state: "unchanged".into(),
            recovery_ref: None,
        };
    }
    let (assets, _) = discover_managed_assets(managed_root);
    let relative_path = format!(
        "agt_{}/workspaces/{}/config.yaml",
        request.agent_id, request.workspace_id
    );
    let Some(item) = assets.into_iter().find(|item| {
        item.summary.kind == "workspace_binding"
            && item.container.locator.relative_path.as_deref() == Some(relative_path.as_str())
    }) else {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "workspace_binding_create_not_verified",
                "error",
                "WorkspaceBinding 已写入但无法通过重新发现验证",
                Some(relative_path),
                Some("重新发现 AgentPackage 并检查诊断"),
            )],
            retryable: false,
            file_state: "write_not_verified".into(),
            recovery_ref: None,
        };
    };
    let written_hash = item.summary.asset_content_hash.clone();
    let empty_hash = hash_bytes(b"");
    let saved_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
    let receipt_id = stable_id(
        "receipt",
        &format!("{}:{empty_hash}:{written_hash}:{saved_at}", item.summary.id),
    );
    let revision_id = stable_id(
        "revision",
        &format!("{}:{empty_hash}:{written_hash}:{saved_at}", item.summary.id),
    );
    let receipt = WriteReceiptDto {
        id: receipt_id.clone(),
        container_id: item.summary.container_id.clone(),
        previous_container_hash: empty_hash.clone(),
        written_container_hash: written_hash.clone(),
        verified_at: saved_at.clone(),
        atomic_replace: true,
    };
    let revision = ConfigRevisionDto {
        id: revision_id,
        asset_id: item.summary.id.clone(),
        container_id: item.summary.container_id.clone(),
        locator: item.container.locator,
        asset_content_hash: written_hash.clone(),
        container_content_hash: written_hash,
        source_asset_baseline_hash: empty_hash.clone(),
        source_container_baseline_hash: empty_hash,
        redacted: false,
        write_receipt_id: receipt_id,
        saved_at,
        summary: "创建 WorkspaceBinding".into(),
        confirmation_refs: Vec::new(),
        restored_from_revision_id: None,
    };
    if append_revision(revisions_root, &revision, &request.value).is_err() {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "revision_pending",
                "error",
                "WorkspaceBinding 已验证创建，但 ConfigRevision 记录失败",
                Some(format!("workspaces/{}/config.yaml", request.workspace_id)),
                Some("保留 recovery 状态并修复本地版本存储"),
            )],
            retryable: false,
            file_state: "verified_written_revision_pending".into(),
            recovery_ref: Some(revision.id),
        };
    }
    SaveConfigResult::Saved {
        request_id,
        asset: item.summary,
        revision: Box::new(revision),
        write_receipt: receipt,
    }
}

#[cfg(test)]
pub(crate) fn save_config_at(
    managed_root: &Path,
    revisions_root: &Path,
    request: SaveConfigRequest,
) -> SaveConfigResult {
    save_config_with_revision_source(managed_root, revisions_root, None, request, None)
}

pub(crate) fn save_config_registered_at(
    registry_root: &Path,
    managed_root: &Path,
    revisions_root: &Path,
    request: SaveConfigRequest,
) -> SaveConfigResult {
    save_config_with_revision_source(
        managed_root,
        revisions_root,
        Some(registry_root),
        request,
        None,
    )
}

fn confirmation_root(revisions_root: &Path) -> PathBuf {
    revisions_root.join("confirmations")
}

fn permission_rank(value: &str) -> Option<u8> {
    match value {
        "未授予" => Some(0),
        "只读当前工作区" => Some(1),
        "仅当前工作区" => Some(2),
        "任意目录" => Some(3),
        _ => None,
    }
}

fn permissions_expand(current: &PermissionsDocument, proposed: &PermissionsDocument) -> bool {
    permission_rank(&proposed.permissions.files)
        .zip(permission_rank(&current.permissions.files))
        .is_some_and(|(next, previous)| next > previous)
        || proposed.permissions.commands != current.permissions.commands
        || proposed.permissions.network != current.permissions.network
        || proposed.permissions.delegation != current.permissions.delegation
}

fn issue_confirmation(
    revisions_root: &Path,
    asset_id: &str,
    proposed_content_hash: &str,
    baseline_asset_hash: &str,
) -> Result<ConfirmationChallengeDto, String> {
    let expires = chrono::Utc::now() + chrono::Duration::minutes(10);
    let expires_at = expires.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let id = stable_id(
        "confirmation",
        &format!("{asset_id}:{proposed_content_hash}:{baseline_asset_hash}:{expires_at}"),
    );
    let record = ConfirmationRecord {
        id: id.clone(),
        asset_id: asset_id.into(),
        proposed_content_hash: proposed_content_hash.into(),
        baseline_asset_hash: baseline_asset_hash.into(),
        expires_at: expires_at.clone(),
    };
    let bytes = serde_json::to_vec(&record).map_err(|_| "无法序列化权限确认 challenge")?;
    restricted_atomic_write(
        &confirmation_root(revisions_root).join(format!("{id}.json")),
        &bytes,
        false,
        "权限确认 challenge",
    )?;
    Ok(ConfirmationChallengeDto {
        id,
        asset_id: asset_id.into(),
        proposed_content_hash: proposed_content_hash.into(),
        expires_at,
        reason: "扩大 Agent 长期权限边界".into(),
    })
}

fn consume_confirmation(
    revisions_root: &Path,
    confirmation_ref: &str,
    asset_id: &str,
    proposed_content_hash: &str,
    baseline_asset_hash: &str,
) -> Result<(), String> {
    if !validate_identifier(confirmation_ref) {
        return Err("权限确认引用无效".into());
    }
    let target = confirmation_root(revisions_root).join(format!("{confirmation_ref}.json"));
    let bytes = fs::read(&target).map_err(|_| "权限确认 challenge 不存在或已使用")?;
    let record: ConfirmationRecord =
        serde_json::from_slice(&bytes).map_err(|_| "权限确认 challenge 已损坏")?;
    let expires_at = chrono::DateTime::parse_from_rfc3339(&record.expires_at)
        .map_err(|_| "权限确认 challenge 过期时间无效")?;
    if record.id != confirmation_ref
        || record.asset_id != asset_id
        || record.proposed_content_hash != proposed_content_hash
        || record.baseline_asset_hash != baseline_asset_hash
        || expires_at < chrono::Utc::now()
    {
        return Err("权限确认 challenge 已过期或与本次变更不匹配".into());
    }
    fs::remove_file(target).map_err(|_| "无法消费权限确认 challenge".to_string())
}

pub(crate) fn owner_from_locator(
    locator: &AssetLocatorDto,
    change_kind: &str,
) -> Option<SaveConfigOwnerDto> {
    let relative_path = locator.relative_path.as_deref()?;
    let (package, package_relative_path) = relative_path.split_once('/')?;
    let agent_id = package.strip_prefix("agt_")?;
    if !validate_identifier(agent_id) {
        return None;
    }
    let workspace_id = if change_kind == "workspace_binding" {
        let parts = package_relative_path.split('/').collect::<Vec<_>>();
        match parts.as_slice() {
            ["workspaces", workspace_id, "config.yaml"] if validate_identifier(workspace_id) => {
                Some((*workspace_id).to_string())
            }
            _ => return None,
        }
    } else {
        None
    };
    Some(SaveConfigOwnerDto {
        agent_id: agent_id.to_string(),
        workspace_id,
    })
}

fn owner_matches_locator(
    owner: &SaveConfigOwnerDto,
    locator: &AssetLocatorDto,
    change_kind: &str,
) -> bool {
    let Some(relative_path) = locator.relative_path.as_deref() else {
        return false;
    };
    let expected_package_prefix = format!("agt_{}/", owner.agent_id);
    if !relative_path.starts_with(&expected_package_prefix) {
        return false;
    }
    match owner.workspace_id.as_deref() {
        Some(workspace_id) => {
            change_kind == "workspace_binding"
                && relative_path
                    == format!(
                        "agt_{}/workspaces/{workspace_id}/config.yaml",
                        owner.agent_id
                    )
        }
        None => change_kind != "workspace_binding",
    }
}

fn save_config_with_revision_source(
    managed_root: &Path,
    revisions_root: &Path,
    registry_root: Option<&Path>,
    request: SaveConfigRequest,
    restored_from_revision_id: Option<String>,
) -> SaveConfigResult {
    let request_id = request.request_id.clone();
    if !validate_identifier(&request.request_id)
        || request.asset_id.len() > 160
        || !validate_identifier(&request.expected_owner.agent_id)
        || request
            .expected_owner
            .workspace_id
            .as_deref()
            .is_some_and(|value| !validate_identifier(value))
        || request.base_content.len() > 1024 * 1024
        || request
            .confirmation_ref
            .as_deref()
            .is_some_and(|value| !validate_identifier(value))
    {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "save_request_invalid",
                "error",
                "配置保存请求无效",
                None,
                Some("刷新编辑器后重试"),
            )],
        };
    }
    let change_kind = request.change.kind();
    let value = request.change.value();
    let workspace_binding = if change_kind == "workspace_binding" {
        match parse_workspace_binding_document(&value) {
            Ok(document) => Some(document.workspace_binding),
            Err(issue) => {
                return SaveConfigResult::ValidationFailed {
                    request_id,
                    diagnostics: vec![*issue],
                }
            }
        }
    } else {
        None
    };
    if let (Some(registry_root), Some(binding)) = (registry_root, workspace_binding.as_ref()) {
        if let Err(message) = workspace_path_from_registry_at(registry_root, &binding.workspace_id)
        {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_workspace_unavailable",
                    "error",
                    &message,
                    Some("workspaceBinding.workspaceId".into()),
                    Some("先登记或修复该 Workspace，再保存 WorkspaceBinding"),
                )],
            };
        }
    }
    let workspace_relative_path = workspace_binding
        .as_ref()
        .map(|binding| format!("workspaces/{}/config.yaml", binding.workspace_id));
    let (relative_path, label, summary) = match change_kind {
        "instructions" => ("instructions.md", "Instructions", "保存 Instructions"),
        "context" => (
            "config/context.yaml",
            "上下文策略",
            "保存上下文策略与输出格式",
        ),
        "rules" => ("config/rules.yaml", "Rule 引用", "保存 Rule 引用"),
        "skills" => ("config/skills.yaml", "Skill 引用", "保存 Skill 引用"),
        "mcp" => ("config/mcp.yaml", "MCP 引用", "保存 MCP 引用"),
        "permissions" => (
            "config/permissions.yaml",
            "长期权限边界",
            "保存长期权限边界",
        ),
        "sop" => ("config/sop.yaml", "SOP 引用", "保存 SOP 引用"),
        "orchestration" => (
            "config/orchestration.yaml",
            "静态编排策略",
            "保存静态编排策略",
        ),
        "hooks" => ("config/hooks.yaml", "Hook 引用", "保存 Hook 引用"),
        "commands" => ("config/commands.yaml", "Command 引用", "保存 Command 引用"),
        "workspace_binding" => (
            workspace_relative_path
                .as_deref()
                .unwrap_or("workspaces/<workspace-id>/config.yaml"),
            "WorkspaceBinding",
            "保存 WorkspaceBinding",
        ),
        _ => unreachable!("ConfigChangeDto 已穷尽"),
    };
    if value.len() > 1024 * 1024 || value.contains('\0') {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                &format!("{change_kind}_invalid"),
                "error",
                &format!("{label} 包含空字符或超过 1 MiB"),
                Some(relative_path.into()),
                Some("修正内容后重试"),
            )],
        };
    }
    if let Err(issue) = match change_kind {
        "context" => validate_context_document(&value),
        "rules" => validate_rules_document(&value),
        "skills" => validate_skills_document(&value),
        "mcp" => validate_mcp_document(&value),
        "permissions" => validate_permissions_document(&value),
        "sop" => validate_sop_document(&value),
        "orchestration" => validate_orchestration_document(&value),
        "hooks" => validate_hooks_document(&value),
        "commands" => validate_commands_document(&value),
        "workspace_binding" => validate_workspace_binding_document(&value),
        _ => Ok(()),
    } {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![*issue],
        };
    }
    let (assets, _) = discover_managed_assets(managed_root);
    let Some(item) = assets
        .into_iter()
        .find(|item| item.summary.id == request.asset_id)
    else {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "asset_not_found",
                "error",
                "配置资产不存在或身份已变化",
                None,
                Some("重新发现并加载编辑器"),
            )],
        };
    };
    if !owner_matches_locator(
        &request.expected_owner,
        &item.container.locator,
        change_kind,
    ) {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "asset_owner_mismatch",
                "error",
                "目标配置资产不属于请求声明的 Agent 或 WorkspaceBinding",
                Some("expectedOwner".into()),
                Some("重新发现并从目标 Agent 配置页加载资产"),
            )],
        };
    }
    if item.summary.kind != change_kind {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "asset_kind_mismatch",
                "error",
                "保存分支与目标配置资产类型不一致",
                Some(relative_path.into()),
                Some("重新发现并加载对应配置编辑器"),
            )],
        };
    }
    if change_kind == "workspace_binding" {
        let Some(binding) = workspace_binding.as_ref() else {
            unreachable!("WorkspaceBinding 已在前置步骤解析")
        };
        let expected_suffix = format!("/{relative_path}");
        if !item
            .container
            .locator
            .relative_path
            .as_deref()
            .is_some_and(|path| path.ends_with(&expected_suffix))
        {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_asset_mismatch",
                    "error",
                    "WorkspaceBinding 的 workspaceId 与目标资产身份不一致",
                    Some(relative_path.into()),
                    Some("重新发现并加载对应 WorkspaceBinding"),
                )],
            };
        }
        let Some(package_path) = item
            .target
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
        else {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "workspace_binding_package_invalid",
                    "error",
                    "WorkspaceBinding 不在合法 AgentPackage 路径内",
                    Some(relative_path.into()),
                    Some("重新发现受管 AgentPackage"),
                )],
            };
        };
        if let Err(issue) = validate_workspace_binding_boundaries(package_path, binding) {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![*issue],
            };
        }
    }
    if !item.summary.writable || item.summary.parse_status != "parsed" {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "asset_read_only",
                "error",
                &format!("该 {label} 资产当前只读"),
                Some(relative_path.into()),
                Some("使用 current v1 可写受管 AgentPackage"),
            )],
        };
    }
    let baseline = request.expected_baseline;
    let base_hash = hash_bytes(request.base_content.as_bytes());
    if baseline.asset_content_hash != base_hash || baseline.container_content_hash != base_hash {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "baseline_content_mismatch",
                "error",
                "编辑器原始内容与服务签发基线不一致",
                Some(relative_path.into()),
                Some("重新加载编辑器后重试"),
            )],
        };
    }
    if baseline.asset_id != item.summary.id
        || baseline.container_id != item.summary.container_id
        || baseline.asset_content_hash != item.summary.asset_content_hash
        || baseline.container_content_hash != item.summary.container_content_hash
    {
        return SaveConfigResult::BaselineChanged {
            request_id,
            asset_id: item.summary.id,
            container_id: item.summary.container_id,
            locator: item.container.locator,
            base: current_side(request.base_content),
            current: current_side(item.content),
            proposed: current_side(value),
            diagnostics: vec![diagnostic(
                "baseline_changed",
                "warning",
                &format!("{label} 已在编辑期间发生变化"),
                Some(relative_path.into()),
                Some("比较当前内容后重新应用编辑"),
            )],
        };
    }
    if item.content == value {
        return SaveConfigResult::Unchanged {
            request_id,
            asset: item.summary,
        };
    }
    let mut confirmation_refs = Vec::new();
    if change_kind == "permissions" {
        let current_permissions = match parse_permissions_document(&item.content) {
            Ok(document) => document,
            Err(issue) => {
                return SaveConfigResult::ValidationFailed {
                    request_id,
                    diagnostics: vec![*issue],
                }
            }
        };
        let proposed_permissions = match parse_permissions_document(&value) {
            Ok(document) => document,
            Err(issue) => {
                return SaveConfigResult::ValidationFailed {
                    request_id,
                    diagnostics: vec![*issue],
                }
            }
        };
        let expands = permissions_expand(&current_permissions, &proposed_permissions);
        match (expands, request.confirmation_ref.as_deref()) {
            (true, None) => {
                let proposed_hash = hash_bytes(value.as_bytes());
                let challenge = match issue_confirmation(
                    revisions_root,
                    &item.summary.id,
                    &proposed_hash,
                    &baseline.asset_content_hash,
                ) {
                    Ok(challenge) => challenge,
                    Err(message) => {
                        return SaveConfigResult::SaveFailed {
                            request_id,
                            diagnostics: vec![diagnostic(
                                "confirmation_issue_failed",
                                "error",
                                &message,
                                Some(relative_path.into()),
                                Some("修复本地确认存储后重试"),
                            )],
                            retryable: true,
                            file_state: "unchanged".into(),
                            recovery_ref: None,
                        }
                    }
                };
                return SaveConfigResult::ConfirmationRequired {
                    request_id,
                    challenge,
                    diagnostics: vec![diagnostic(
                        "permission_expansion_confirmation_required",
                        "warning",
                        "扩大 Agent 长期权限必须独立确认",
                        Some(relative_path.into()),
                        Some("核对影响范围后确认本次 challenge"),
                    )],
                };
            }
            (true, Some(confirmation_ref)) => {
                let proposed_hash = hash_bytes(value.as_bytes());
                if let Err(message) = consume_confirmation(
                    revisions_root,
                    confirmation_ref,
                    &item.summary.id,
                    &proposed_hash,
                    &baseline.asset_content_hash,
                ) {
                    return SaveConfigResult::ValidationFailed {
                        request_id,
                        diagnostics: vec![diagnostic(
                            "permission_confirmation_invalid",
                            "error",
                            &message,
                            Some(relative_path.into()),
                            Some("重新发起保存并获取新的确认 challenge"),
                        )],
                    };
                }
                confirmation_refs.push(confirmation_ref.into());
            }
            (false, Some(_)) => {
                return SaveConfigResult::ValidationFailed {
                    request_id,
                    diagnostics: vec![diagnostic(
                        "permission_confirmation_unexpected",
                        "error",
                        "收紧或不变的长期权限不能携带确认引用",
                        Some(relative_path.into()),
                        Some("移除 confirmationRef 后重试"),
                    )],
                }
            }
            (false, None) => {}
        }
    } else if request.confirmation_ref.is_some() {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "confirmation_not_supported",
                "error",
                "该配置分支不接受确认引用",
                Some(relative_path.into()),
                Some("移除 confirmationRef 后重试"),
            )],
        };
    }
    let previous_hash = item.summary.container_content_hash.clone();
    if let Err(message) = restricted_atomic_write(&item.target, value.as_bytes(), true, label) {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "save_failed",
                "error",
                &message,
                Some(relative_path.into()),
                Some("检查目录权限后重试"),
            )],
            retryable: true,
            file_state: "unchanged".into(),
            recovery_ref: None,
        };
    }
    let verified = match fs::read_to_string(&item.target) {
        Ok(content) if content == value => content,
        _ => {
            return SaveConfigResult::SaveFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "write_not_verified",
                    "error",
                    &format!("{label} 写后重读验证失败"),
                    Some(relative_path.into()),
                    Some("重新发现文件状态"),
                )],
                retryable: false,
                file_state: "write_not_verified".into(),
                recovery_ref: None,
            }
        }
    };
    let written_hash = hash_bytes(verified.as_bytes());
    let saved_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
    let receipt_id = stable_id(
        "receipt",
        &format!(
            "{}:{previous_hash}:{written_hash}:{saved_at}",
            item.summary.id
        ),
    );
    let revision_id = stable_id(
        "revision",
        &format!(
            "{}:{previous_hash}:{written_hash}:{saved_at}",
            item.summary.id
        ),
    );
    let receipt = WriteReceiptDto {
        id: receipt_id.clone(),
        container_id: item.summary.container_id.clone(),
        previous_container_hash: previous_hash.clone(),
        written_container_hash: written_hash.clone(),
        verified_at: saved_at.clone(),
        atomic_replace: true,
    };
    let revision = ConfigRevisionDto {
        id: revision_id,
        asset_id: item.summary.id.clone(),
        container_id: item.summary.container_id.clone(),
        locator: item.container.locator.clone(),
        asset_content_hash: written_hash.clone(),
        container_content_hash: written_hash.clone(),
        source_asset_baseline_hash: baseline.asset_content_hash,
        source_container_baseline_hash: baseline.container_content_hash,
        redacted: false,
        write_receipt_id: receipt_id,
        saved_at,
        summary: restored_from_revision_id
            .as_ref()
            .map_or_else(|| summary.into(), |id| format!("恢复自 {id}")),
        confirmation_refs,
        restored_from_revision_id,
    };
    if append_revision(revisions_root, &revision, &verified).is_err() {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "revision_pending",
                "error",
                &format!("{label} 已验证写入，但 ConfigRevision 记录失败"),
                Some(relative_path.into()),
                Some("保留 recovery 状态并修复本地存储"),
            )],
            retryable: false,
            file_state: "verified_written_revision_pending".into(),
            recovery_ref: Some(revision.id),
        };
    }
    let mut asset = item.summary;
    asset.asset_content_hash = written_hash.clone();
    asset.container_content_hash = written_hash;
    SaveConfigResult::Saved {
        request_id,
        asset,
        revision: Box::new(revision),
        write_receipt: receipt,
    }
}

pub(crate) fn recover_config_revision_registered_at(
    registry_root: &Path,
    managed_root: &Path,
    revisions_root: &Path,
    request: RecoverConfigRevisionRequest,
) -> SaveConfigResult {
    recover_config_revision_with_registry(
        Some(registry_root),
        managed_root,
        revisions_root,
        request,
    )
}

#[cfg(test)]
pub(crate) fn recover_config_revision_at(
    managed_root: &Path,
    revisions_root: &Path,
    request: RecoverConfigRevisionRequest,
) -> SaveConfigResult {
    recover_config_revision_with_registry(None, managed_root, revisions_root, request)
}

fn recover_config_revision_with_registry(
    registry_root: Option<&Path>,
    managed_root: &Path,
    revisions_root: &Path,
    request: RecoverConfigRevisionRequest,
) -> SaveConfigResult {
    let request_id = request.request_id.clone();
    if !validate_identifier(&request.request_id)
        || request.asset_id.len() > 160
        || !validate_identifier(&request.recovery_ref)
    {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "recovery_request_invalid",
                "error",
                "ConfigRevision 恢复引用无效",
                None,
                Some("重新加载当前 Instructions 后重试"),
            )],
        };
    }
    if list_revisions_at(revisions_root, &request.asset_id)
        .is_ok_and(|items| items.iter().any(|item| item.id == request.recovery_ref))
    {
        let loaded = match load_editor_at(
            managed_root,
            LoadEditorRequest {
                request_id: request.request_id,
                asset_id: request.asset_id,
            },
        ) {
            Ok(loaded) => loaded,
            Err(message) => {
                return SaveConfigResult::ValidationFailed {
                    request_id,
                    diagnostics: vec![diagnostic(
                        "recovery_asset_unavailable",
                        "error",
                        &message,
                        None,
                        Some("重新发现目标配置资产"),
                    )],
                }
            }
        };
        return SaveConfigResult::Unchanged {
            request_id,
            asset: loaded.asset,
        };
    }
    let loaded = match load_editor_at(
        managed_root,
        LoadEditorRequest {
            request_id: request.request_id,
            asset_id: request.asset_id,
        },
    ) {
        Ok(loaded) => loaded,
        Err(message) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "recovery_asset_unavailable",
                    "error",
                    &message,
                    None,
                    Some("重新发现目标配置资产"),
                )],
            }
        }
    };
    let saved_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
    let workspace_binding_path = if loaded.asset.kind == "workspace_binding" {
        match parse_workspace_binding_document(&loaded.canonical_content) {
            Ok(document) => {
                if let Some(registry_root) = registry_root {
                    if let Err(message) = workspace_path_from_registry_at(
                        registry_root,
                        &document.workspace_binding.workspace_id,
                    ) {
                        return SaveConfigResult::ValidationFailed {
                            request_id,
                            diagnostics: vec![diagnostic(
                                "workspace_binding_workspace_unavailable",
                                "error",
                                &message,
                                Some("workspaceBinding.workspaceId".into()),
                                Some("先登记或修复该 Workspace，再补记 ConfigRevision"),
                            )],
                        };
                    }
                }
                Some(format!(
                    "workspaces/{}/config.yaml",
                    document.workspace_binding.workspace_id
                ))
            }
            Err(_) => None,
        }
    } else {
        None
    };
    let (relative_path, label) = match loaded.asset.kind.as_str() {
        "instructions" => ("instructions.md", "Instructions"),
        "context" => ("config/context.yaml", "上下文策略"),
        "rules" => ("config/rules.yaml", "Rule 引用"),
        "skills" => ("config/skills.yaml", "Skill 引用"),
        "mcp" => ("config/mcp.yaml", "MCP 引用"),
        "permissions" => ("config/permissions.yaml", "长期权限边界"),
        "sop" => ("config/sop.yaml", "SOP 引用"),
        "orchestration" => ("config/orchestration.yaml", "静态编排策略"),
        "hooks" => ("config/hooks.yaml", "Hook 引用"),
        "commands" => ("config/commands.yaml", "Command 引用"),
        "workspace_binding" => (
            workspace_binding_path
                .as_deref()
                .unwrap_or("workspaces/<workspace-id>/config.yaml"),
            "WorkspaceBinding",
        ),
        _ => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "recovery_kind_unsupported",
                    "error",
                    "目标配置资产类型尚不支持补记",
                    None,
                    Some("重新选择已冻结的配置资产"),
                )],
            }
        }
    };
    let revision = ConfigRevisionDto {
        id: request.recovery_ref,
        asset_id: loaded.asset.id.clone(),
        container_id: loaded.asset.container_id.clone(),
        locator: AssetLocatorDto {
            root_kind: RootKind::Managed,
            display_path: format!("受管 AgentPackage / {relative_path}"),
            relative_path: None,
        },
        asset_content_hash: loaded.asset.asset_content_hash.clone(),
        container_content_hash: loaded.asset.container_content_hash.clone(),
        source_asset_baseline_hash: loaded.baseline_ref.asset_content_hash,
        source_container_baseline_hash: loaded.baseline_ref.container_content_hash,
        redacted: false,
        write_receipt_id: stable_id(
            "receipt-recovery",
            &format!("{}:{saved_at}", loaded.asset.id),
        ),
        saved_at,
        summary: format!("补记已验证写入的 {label}"),
        confirmation_refs: Vec::new(),
        restored_from_revision_id: None,
    };
    if append_revision(revisions_root, &revision, &loaded.canonical_content).is_err() {
        return SaveConfigResult::SaveFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "revision_pending",
                "error",
                &format!("ConfigRevision 仍无法补记，{label} 文件未再次写入"),
                Some(relative_path.into()),
                Some("修复本地版本存储后重试恢复引用"),
            )],
            retryable: true,
            file_state: "verified_written_revision_pending".into(),
            recovery_ref: Some(revision.id),
        };
    }
    let receipt = WriteReceiptDto {
        id: revision.write_receipt_id.clone(),
        container_id: revision.container_id.clone(),
        previous_container_hash: revision.container_content_hash.clone(),
        written_container_hash: revision.container_content_hash.clone(),
        verified_at: revision.saved_at.clone(),
        atomic_replace: true,
    };
    SaveConfigResult::Saved {
        request_id,
        asset: loaded.asset,
        revision: Box::new(revision),
        write_receipt: receipt,
    }
}

pub(crate) fn restore_config_revision_registered_at(
    registry_root: &Path,
    managed_root: &Path,
    revisions_root: &Path,
    request: RestoreConfigRevisionRequest,
) -> SaveConfigResult {
    restore_config_revision_with_registry(
        Some(registry_root),
        managed_root,
        revisions_root,
        request,
    )
}

#[cfg(test)]
pub(crate) fn restore_config_revision_at(
    managed_root: &Path,
    revisions_root: &Path,
    request: RestoreConfigRevisionRequest,
) -> SaveConfigResult {
    restore_config_revision_with_registry(None, managed_root, revisions_root, request)
}

fn restore_config_revision_with_registry(
    registry_root: Option<&Path>,
    managed_root: &Path,
    revisions_root: &Path,
    request: RestoreConfigRevisionRequest,
) -> SaveConfigResult {
    let request_id = request.request_id.clone();
    if !validate_identifier(&request.request_id)
        || request.asset_id.len() > 160
        || !validate_identifier(&request.revision_id)
        || request.base_content.len() > 1024 * 1024
        || !request.confirmed
    {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "restore_request_invalid",
                "error",
                "ConfigRevision 恢复请求无效或尚未确认",
                None,
                Some("重新核对历史版本差异并确认恢复"),
            )],
        };
    }
    let revisions = match list_revisions_at(revisions_root, &request.asset_id) {
        Ok(revisions) => revisions,
        Err(message) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "revision_unavailable",
                    "error",
                    &message,
                    None,
                    Some("重新加载配置历史后重试"),
                )],
            }
        }
    };
    if !revisions
        .iter()
        .any(|revision| revision.id == request.revision_id)
    {
        return SaveConfigResult::ValidationFailed {
            request_id,
            diagnostics: vec![diagnostic(
                "revision_asset_mismatch",
                "error",
                "目标 ConfigRevision 不属于当前配置资产",
                None,
                Some("重新选择该资产的历史版本"),
            )],
        };
    }
    let content = match read_revision_content_at(revisions_root, &request.revision_id) {
        Ok(content) => content,
        Err(message) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "revision_content_invalid",
                    "error",
                    &message,
                    None,
                    Some("修复本地版本记录后重试"),
                )],
            }
        }
    };
    let loaded_asset = match load_editor_at(
        managed_root,
        LoadEditorRequest {
            request_id: format!("{}-kind", request.request_id),
            asset_id: request.asset_id.clone(),
        },
    ) {
        Ok(loaded) => loaded.asset,
        Err(message) => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "restore_asset_unavailable",
                    "error",
                    &message,
                    None,
                    Some("重新发现并加载目标配置资产"),
                )],
            }
        }
    };
    let asset_kind = loaded_asset.kind;
    let owner = match load_asset_locator_at(managed_root, &request.asset_id)
        .ok()
        .and_then(|locator| owner_from_locator(&locator, &asset_kind))
    {
        Some(owner) => owner,
        None => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "restore_owner_unavailable",
                    "error",
                    "无法从目标配置资产定位信息确认 owner",
                    None,
                    Some("重新发现并加载目标配置资产"),
                )],
            }
        }
    };
    let change = match asset_kind.as_str() {
        "instructions" => ConfigChangeDto::Instructions { value: content },
        "context" => ConfigChangeDto::Context { value: content },
        "rules" => ConfigChangeDto::Rules { value: content },
        "skills" => ConfigChangeDto::Skills { value: content },
        "mcp" => ConfigChangeDto::Mcp { value: content },
        "permissions" => ConfigChangeDto::Permissions { value: content },
        "sop" => ConfigChangeDto::Sop { value: content },
        "orchestration" => ConfigChangeDto::Orchestration { value: content },
        "hooks" => ConfigChangeDto::Hooks { value: content },
        "commands" => ConfigChangeDto::Commands { value: content },
        "workspace_binding" => ConfigChangeDto::WorkspaceBinding { value: content },
        _ => {
            return SaveConfigResult::ValidationFailed {
                request_id,
                diagnostics: vec![diagnostic(
                    "restore_kind_unsupported",
                    "error",
                    "目标配置资产类型尚不支持恢复",
                    None,
                    Some("选择已冻结的 Instructions、ContextPolicy、Rule 或 Skill 引用资产"),
                )],
            }
        }
    };
    let revision_id = request.revision_id;
    save_config_with_revision_source(
        managed_root,
        revisions_root,
        registry_root,
        SaveConfigRequest {
            request_id: request.request_id,
            asset_id: request.asset_id,
            expected_owner: owner,
            change,
            expected_baseline: request.expected_baseline,
            base_content: request.base_content,
            confirmation_ref: request.confirmation_ref,
        },
        Some(revision_id),
    )
}

pub(crate) fn load_asset_locator_at(
    managed_root: &Path,
    asset_id: &str,
) -> Result<AssetLocatorDto, String> {
    let (assets, _) = discover_managed_assets(managed_root);
    assets
        .into_iter()
        .find(|item| item.summary.id == asset_id)
        .map(|item| item.container.locator)
        .ok_or_else(|| "配置资产不存在、不可用或身份已变化".to_string())
}

pub(crate) fn load_editor_at(
    managed_root: &Path,
    request: LoadEditorRequest,
) -> Result<LoadEditorResult, String> {
    if !validate_identifier(&request.request_id) || request.asset_id.len() > 160 {
        return Err("编辑器加载请求无效".into());
    }
    let (assets, _) = discover_managed_assets(managed_root);
    let item = assets
        .into_iter()
        .find(|item| item.summary.id == request.asset_id)
        .ok_or_else(|| "配置资产不存在、不可用或身份已变化".to_string())?;
    if item.summary.parse_status != "parsed" {
        return Err("配置资产当前不支持结构化编辑".into());
    }
    let baseline_id = stable_id(
        "baseline",
        &format!(
            "{}:{}:{}",
            item.summary.id, item.summary.asset_content_hash, item.summary.container_content_hash
        ),
    );
    Ok(LoadEditorResult {
        request_id: request.request_id,
        baseline_ref: BaselineRefDto {
            id: baseline_id,
            asset_id: item.summary.id.clone(),
            container_id: item.summary.container_id.clone(),
            asset_content_hash: item.summary.asset_content_hash.clone(),
            container_content_hash: item.summary.container_content_hash.clone(),
        },
        diagnostics: item.summary.diagnostics.clone(),
        asset: item.summary,
        canonical_content: item.content,
        redacted: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("bandi-local-service-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reference_states_distinguish_resolution_failures() {
        let locator = AssetLocatorDto {
            root_kind: RootKind::Bandi,
            display_path: "skill-review/SKILL.md".into(),
            relative_path: Some("skill-review/SKILL.md".into()),
        };
        let parsed = SharedAssetNodeDto {
            id: "skill-review".into(),
            kind: "skill".into(),
            company_id: "xinghe".into(),
            department_id: None,
            locator: locator.clone(),
            content_hash: hash_bytes(b"skill"),
            parse_status: "parsed".into(),
            diagnostics: Vec::new(),
        };
        let mut invalid = parsed.clone();
        invalid.parse_status = "invalid".into();

        assert_eq!(
            reference_state(Some(&parsed), "skill", Some("xinghe"), true),
            "resolved"
        );
        assert_eq!(
            reference_state(Some(&parsed), "mcp", Some("xinghe"), true),
            "type_mismatch"
        );
        assert_eq!(
            reference_state(Some(&parsed), "skill", Some("studio"), true),
            "out_of_scope"
        );
        assert_eq!(
            reference_state(Some(&parsed), "skill", None, true),
            "unresolved"
        );
        assert_eq!(
            reference_state(Some(&invalid), "skill", Some("xinghe"), true),
            "target_invalid"
        );
        assert_eq!(
            reference_state(None, "skill", Some("xinghe"), true),
            "dangling"
        );
        assert_eq!(
            reference_state(None, "skill", Some("xinghe"), false),
            "unresolved"
        );
    }

    #[test]
    fn workspace_registry_round_trips_canonical_root() {
        let root = temp_root("registry");
        let workspace = root.join("workspace");
        let registry = root.join("records");
        fs::create_dir(&workspace).unwrap();
        let result = register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-1".into(),
                workspace_id: "ws-1".into(),
                selected_path: workspace.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        assert_eq!(
            PathBuf::from(result.canonical_path),
            fs::canonicalize(&workspace).unwrap()
        );
        assert_eq!(
            workspace_path_from_registry_at(&registry, "ws-1").unwrap(),
            fs::canonicalize(&workspace).unwrap()
        );
        assert!(register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-2".into(),
                workspace_id: "ws-2".into(),
                selected_path: workspace.to_string_lossy().into_owned(),
            }
        )
        .is_err());
        let other = root.join("other");
        fs::create_dir(&other).unwrap();
        let conflict = register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-3".into(),
                workspace_id: "ws-1".into(),
                selected_path: other.to_string_lossy().into_owned(),
            },
        )
        .unwrap_err();
        assert_eq!(conflict, "同一工作区标识已登记到其他规范化目录");
        assert_eq!(
            workspace_path_from_registry_at(&registry, "ws-1").unwrap(),
            fs::canonicalize(&workspace).unwrap()
        );
        let retry = register_workspace_with_status_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-4".into(),
                workspace_id: "ws-1".into(),
                selected_path: workspace.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        assert!(!retry.created);
        let removed = unregister_workspace_at(&registry, "ws-1").unwrap();
        assert_eq!(removed, fs::canonicalize(&workspace).unwrap());
        assert!(workspace_path_from_registry_at(&registry, "ws-1").is_err());
        let readded = register_workspace_with_status_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-5".into(),
                workspace_id: "ws-1".into(),
                selected_path: other.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        assert!(readded.created);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn workspace_registry_rejects_symlink_root_and_record() {
        use std::os::unix::fs::symlink;
        let root = temp_root("registry-symlink");
        let workspace = root.join("workspace");
        let linked = root.join("linked");
        let registry = root.join("records");
        fs::create_dir(&workspace).unwrap();
        symlink(&workspace, &linked).unwrap();
        assert!(register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "req-1".into(),
                workspace_id: "ws-1".into(),
                selected_path: linked.to_string_lossy().into_owned()
            }
        )
        .is_err());
        fs::create_dir_all(&registry).unwrap();
        symlink(root.join("missing"), registry.join("ws-2.json")).unwrap();
        assert!(workspace_path_from_registry_at(&registry, "ws-2").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovery_and_editor_use_stable_ids_and_dual_hashes() {
        let root = temp_root("discovery");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        let result = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "req-1".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        assert_eq!(result.assets.len(), 1);
        assert_eq!(
            result.assets[0].asset_content_hash,
            result.assets[0].container_content_hash
        );
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "req-2".into(),
                asset_id: result.assets[0].id.clone(),
            },
        )
        .unwrap();
        assert_eq!(loaded.canonical_content, "# Alpha\n");
        assert!(loaded.baseline_ref.id.starts_with("baseline-"));
        let again = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "req-3".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        assert_eq!(again.assets[0].id, result.assets[0].id);
        let _ = fs::remove_dir_all(root);
    }

    const CONTEXT_SOURCE: &str = "schemaVersion: 1\ncontextPolicy:\n  enabled: true\n  triggerRatio: 0.8\n  targetRatio: 0.5\n  protectRecentTurns: 6\n  protectOpeningTurns: 2\noutputProfileId: \"\"\noutputParameterBindings: []\n";

    fn instructions_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load".into(),
                asset_id: discovery.assets[0].id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn save_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Instructions {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    fn context_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/context.yaml"), CONTEXT_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-context".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "context")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-context".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn context_save_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-context".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Context {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    const RULES_SOURCE: &str = "schemaVersion: 1\nrules:\n  - \"rule-common\"\n";

    fn rules_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/rules.yaml"), RULES_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-rules".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "rules")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-rules".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn rules_save_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-rules".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Rules {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    #[test]
    fn rules_discovery_save_and_validation_use_frozen_schema() {
        let (root, managed, loaded) = rules_fixture("rules-save");
        assert_eq!(loaded.asset.kind, "rules");
        let updated = "schemaVersion: 1\nrules:\n  - \"rule-common\"\n  - \"rule-review\"\n";
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, rules_save_request(&loaded, updated));
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("Rules 保存应返回 saved");
        };
        assert_eq!(asset.kind, "rules");
        assert_eq!(revision.summary, "保存 Rule 引用");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/rules.yaml")).unwrap(),
            updated
        );
        let reloaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-rules".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                rules_save_request(
                    &reloaded,
                    "schemaVersion: 1\nrules:\n  - \"rule-common\"\n  - \"rule-common\"\n",
                ),
            ),
            SaveConfigResult::ValidationFailed { .. }
        ));
        for invalid in [
            "schemaVersion: 2\nrules:\n  []\n",
            "schemaVersion: 1\nrules:\n  - \"../rule\"\n",
            "schemaVersion: 1\nrules:\n  []\nunknown: true\n",
        ] {
            assert!(validate_rules_document(invalid).is_err());
        }
        let unchanged = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "unchanged-rules".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                rules_save_request(&unchanged, updated),
            ),
            SaveConfigResult::Unchanged { .. }
        ));
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rules_revision_recovery_and_restore_preserve_history() {
        let (root, managed, loaded) = rules_fixture("rules-revisions");
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let first = "schemaVersion: 1\nrules:\n  - \"rule-first\"\n";
        let failed = save_config_at(&managed, &blocker, rules_save_request(&loaded, first));
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("Rules revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-rules".into(),
                asset_id: loaded.asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("Rules 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 Rule 引用");
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-rules-second".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let second = "schemaVersion: 1\nrules:\n  - \"rule-second\"\n";
        assert!(matches!(
            save_config_at(&managed, &revisions, rules_save_request(&current, second),),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-rules-restore".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-rules".into(),
                asset_id: loaded.asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("Rules 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/rules.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(
            list_revisions_at(&revisions, &loaded.asset.id)
                .unwrap()
                .len(),
            3
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rules_save_rejects_kind_mismatch_and_external_change() {
        let (root, managed, loaded) = rules_fixture("rules-guards");
        let mismatch = SaveConfigRequest {
            request_id: "rules-mismatch".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Context {
                value: CONTEXT_SOURCE.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(
            managed.join("agt_alpha/config/rules.yaml"),
            "schemaVersion: 1\nrules:\n  - \"rule-external\"\n",
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                rules_save_request(&loaded, "schemaVersion: 1\nrules:\n  - \"rule-proposed\"\n",),
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    const SKILLS_SOURCE: &str = "schemaVersion: 1\nskills:\n  - \"skill-common\"\n";

    fn skills_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/skills.yaml"), SKILLS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-skills".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "skills")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-skills".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn skills_save_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-skills".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Skills {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    #[test]
    fn skills_discovery_save_and_validation_use_frozen_schema() {
        let (root, managed, loaded) = skills_fixture("skills-save");
        assert_eq!(loaded.asset.kind, "skills");
        let updated = "schemaVersion: 1\nskills:\n  - \"skill-common\"\n  - \"skill-review\"\n";
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, skills_save_request(&loaded, updated));
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("Skills 保存应返回 saved");
        };
        assert_eq!(asset.kind, "skills");
        assert_eq!(revision.summary, "保存 Skill 引用");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/skills.yaml")).unwrap(),
            updated
        );
        let reloaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-skills".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                skills_save_request(
                    &reloaded,
                    "schemaVersion: 1\nskills:\n  - \"skill-common\"\n  - \"skill-common\"\n",
                ),
            ),
            SaveConfigResult::ValidationFailed { .. }
        ));
        for invalid in [
            "schemaVersion: 2\nskills:\n  []\n",
            "schemaVersion: 1\nskills:\n  - \"../skill\"\n",
            "schemaVersion: 1\nskills:\n  []\nunknown: true\n",
        ] {
            assert!(validate_skills_document(invalid).is_err());
        }
        let unchanged = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "unchanged-skills".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                skills_save_request(&unchanged, updated),
            ),
            SaveConfigResult::Unchanged { .. }
        ));
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn skills_save_rejects_kind_mismatch_and_external_change() {
        let (root, managed, loaded) = skills_fixture("skills-guards");
        let mismatch = SaveConfigRequest {
            request_id: "skills-mismatch".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Rules {
                value: RULES_SOURCE.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(
            managed.join("agt_alpha/config/skills.yaml"),
            "schemaVersion: 1\nskills:\n  - \"skill-external\"\n",
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                skills_save_request(
                    &loaded,
                    "schemaVersion: 1\nskills:\n  - \"skill-proposed\"\n",
                ),
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn skills_revision_recovery_and_restore_preserve_history() {
        let (root, managed, loaded) = skills_fixture("skills-revisions");
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let first = "schemaVersion: 1\nskills:\n  - \"skill-first\"\n";
        let failed = save_config_at(&managed, &blocker, skills_save_request(&loaded, first));
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("Skills revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-skills".into(),
                asset_id: loaded.asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("Skills 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 Skill 引用");
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-skills-second".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let second = "schemaVersion: 1\nskills:\n  - \"skill-second\"\n";
        assert!(matches!(
            save_config_at(&managed, &revisions, skills_save_request(&current, second)),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-skills-restore".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-skills".into(),
                asset_id: loaded.asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("Skills 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/skills.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(
            list_revisions_at(&revisions, &loaded.asset.id)
                .unwrap()
                .len(),
            3
        );
        let _ = fs::remove_dir_all(root);
    }

    const SOP_SOURCE: &str = "schemaVersion: 1\nsop:\n  - \"sop-delivery\"\n";

    #[test]
    fn sop_discovery_save_and_validation_use_frozen_schema() {
        let root = temp_root("sop-save");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/sop.yaml"), SOP_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-sop".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "sop")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-sop".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let updated = "schemaVersion: 1\nsop:\n  - \"sop-delivery\"\n  - \"sop-review\"\n";
        let request = |value: &str| SaveConfigRequest {
            request_id: "save-sop".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Sop {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        };
        let SaveConfigResult::Saved { revision, .. } =
            save_config_at(&managed, &root.join("revisions"), request(updated))
        else {
            panic!("SOP 保存应返回 saved");
        };
        assert_eq!(revision.summary, "保存 SOP 引用");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/sop.yaml")).unwrap(),
            updated
        );
        for invalid in [
            "schemaVersion: 2\nsop:\n  []\n",
            "schemaVersion: 1\nsop:\n  - \"../sop\"\n",
            "schemaVersion: 1\nsop:\n  - \"sop-a\"\n  - \"sop-a\"\n",
            "schemaVersion: 1\nsop:\n  []\nunknown: true\n",
        ] {
            assert!(validate_sop_document(invalid).is_err());
        }
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-sop-current".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let mismatch = SaveConfigRequest {
            request_id: "sop-mismatch".into(),
            asset_id: current.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Mcp {
                value: MCP_SOURCE.into(),
            },
            expected_baseline: current.baseline_ref.clone(),
            base_content: current.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(
            managed.join("agt_alpha/config/sop.yaml"),
            "schemaVersion: 1\nsop:\n  - \"sop-external\"\n",
        )
        .unwrap();
        let stale = SaveConfigRequest {
            request_id: "save-sop-stale".into(),
            asset_id: current.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Sop {
                value: "schemaVersion: 1\nsop:\n  - \"sop-proposed\"\n".into(),
            },
            expected_baseline: current.baseline_ref,
            base_content: current.canonical_content,
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), stale),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    const ORCHESTRATION_SOURCE: &str = "schemaVersion: 1\norchestration: {\"enabled\":true,\"maxDelegationDepth\":2,\"allowedAgentIds\":[\"agent-review\"],\"allowedRoleIds\":[\"role-review\"],\"allowedDepartmentIds\":[\"department-engineering\"],\"requireWorkspaceBinding\":true,\"requireSopMatch\":true,\"requireServiceGrantForCrossDepartment\":true,\"escalationAgentId\":\"agent-lead\",\"escalationConditions\":[\"没有合法候选\"],\"prohibitions\":[\"禁止跨公司\"]}\n";

    #[test]
    fn orchestration_discovery_save_and_validation_use_frozen_schema() {
        let root = temp_root("orchestration-save");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(
            package.join("config/orchestration.yaml"),
            ORCHESTRATION_SOURCE,
        )
        .unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-orchestration".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "orchestration")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-orchestration".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let updated =
            ORCHESTRATION_SOURCE.replace("maxDelegationDepth\":2", "maxDelegationDepth\":1");
        let result = save_config_at(
            &managed,
            &root.join("revisions"),
            SaveConfigRequest {
                request_id: "save-orchestration".into(),
                asset_id: loaded.asset.id.clone(),
                expected_owner: SaveConfigOwnerDto {
                    agent_id: "alpha".into(),
                    workspace_id: None,
                },
                change: ConfigChangeDto::Orchestration {
                    value: updated.clone(),
                },
                expected_baseline: loaded.baseline_ref.clone(),
                base_content: loaded.canonical_content.clone(),
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = result else {
            panic!("Orchestration 保存应返回 saved");
        };
        assert_eq!(revision.summary, "保存静态编排策略");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/orchestration.yaml")).unwrap(),
            updated
        );
        for invalid in [
            ORCHESTRATION_SOURCE.replace("schemaVersion: 1", "schemaVersion: 2"),
            ORCHESTRATION_SOURCE.replace("maxDelegationDepth\":2", "maxDelegationDepth\":33"),
            ORCHESTRATION_SOURCE.replace("agent-review", "../agent-review"),
            ORCHESTRATION_SOURCE.replace("agent-review\"]", "agent-review\",\"agent-review\"]"),
            ORCHESTRATION_SOURCE.replace("}\n", ",\"unknown\":true}\n"),
        ] {
            assert!(validate_orchestration_document(&invalid).is_err());
        }
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-orchestration-current".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        fs::write(
            managed.join("agt_alpha/config/orchestration.yaml"),
            ORCHESTRATION_SOURCE.replace("maxDelegationDepth\":2", "maxDelegationDepth\":0"),
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                SaveConfigRequest {
                    request_id: "save-orchestration-stale".into(),
                    asset_id: current.asset.id,
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Orchestration {
                        value: ORCHESTRATION_SOURCE.into(),
                    },
                    expected_baseline: current.baseline_ref,
                    base_content: current.canonical_content,
                    confirmation_ref: None,
                },
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    const HOOKS_SOURCE: &str = "schemaVersion: 1\nhooks: [{\"assetId\":\"hook-config-saved\",\"parameterBindings\":[{\"parameterId\":\"include-path\",\"type\":\"boolean\",\"value\":true}]}]\n";
    const COMMANDS_SOURCE: &str = "schemaVersion: 1\ncommands: [{\"assetId\":\"command-config-audit\",\"parameterBindings\":[{\"parameterId\":\"scope\",\"type\":\"enum\",\"value\":\"agent\"}]}]\n";

    #[test]
    fn hooks_discovery_save_and_validation_use_frozen_schema() {
        let root = temp_root("hooks-save");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/hooks.yaml"), HOOKS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-hooks".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "hooks")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-hooks".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let updated = "schemaVersion: 1\nhooks: []\n";
        let result = save_config_at(
            &managed,
            &root.join("revisions"),
            SaveConfigRequest {
                request_id: "save-hooks".into(),
                asset_id: asset.id.clone(),
                expected_owner: SaveConfigOwnerDto {
                    agent_id: "alpha".into(),
                    workspace_id: None,
                },
                change: ConfigChangeDto::Hooks {
                    value: updated.into(),
                },
                expected_baseline: loaded.baseline_ref,
                base_content: loaded.canonical_content,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = result else {
            panic!("Hook 引用保存应返回 saved");
        };
        assert_eq!(revision.summary, "保存 Hook 引用");
        assert_eq!(
            fs::read_to_string(package.join("config/hooks.yaml")).unwrap(),
            updated
        );
        for invalid in [
            HOOKS_SOURCE.replace("schemaVersion: 1", "schemaVersion: 2"),
            HOOKS_SOURCE.replace("hook-config-saved", "../hook"),
            HOOKS_SOURCE.replace("include-path", "../parameter"),
            HOOKS_SOURCE.replace(
                "true}]",
                "true},{\"parameterId\":\"include-path\",\"type\":\"boolean\",\"value\":false}]",
            ),
            HOOKS_SOURCE.replace("true}]}]\n", "true}],\"unknown\":true}]\n"),
        ] {
            assert!(validate_hooks_document(&invalid).is_err());
        }
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-hooks-current".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let mismatch = SaveConfigRequest {
            request_id: "save-hooks-mismatch".into(),
            asset_id: asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Rules {
                value: updated.into(),
            },
            expected_baseline: current.baseline_ref.clone(),
            base_content: current.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(package.join("config/hooks.yaml"), HOOKS_SOURCE).unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                SaveConfigRequest {
                    request_id: "save-hooks-stale".into(),
                    asset_id: asset.id.clone(),
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Hooks {
                        value: updated.into()
                    },
                    expected_baseline: current.baseline_ref,
                    base_content: current.canonical_content,
                    confirmation_ref: None,
                },
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn hooks_revision_recovery_and_restore_preserve_history() {
        let root = temp_root("hooks-revisions");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/hooks.yaml"), HOOKS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-hooks-revisions".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "hooks")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-hooks-revisions".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let first = "schemaVersion: 1\nhooks: []\n";
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let failed = save_config_at(
            &managed,
            &blocker,
            SaveConfigRequest {
                request_id: "save-hooks-pending".into(),
                asset_id: asset.id.clone(),
                expected_owner: SaveConfigOwnerDto {
                    agent_id: "alpha".into(),
                    workspace_id: None,
                },
                change: ConfigChangeDto::Hooks {
                    value: first.into(),
                },
                expected_baseline: loaded.baseline_ref,
                base_content: loaded.canonical_content,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("Hook revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-hooks".into(),
                asset_id: asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("Hook 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 Hook 引用");
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-hooks-second".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                SaveConfigRequest {
                    request_id: "save-hooks-second".into(),
                    asset_id: asset.id.clone(),
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Hooks {
                        value: HOOKS_SOURCE.into()
                    },
                    expected_baseline: current.baseline_ref,
                    base_content: current.canonical_content,
                    confirmation_ref: None
                }
            ),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-hooks-restore".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-hooks".into(),
                asset_id: asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("Hook 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(package.join("config/hooks.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 3);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn commands_discovery_save_and_validation_use_frozen_schema() {
        let root = temp_root("commands-save");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/commands.yaml"), COMMANDS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-commands".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "commands")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-commands".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let updated = "schemaVersion: 1\ncommands: []\n";
        let result = save_config_at(
            &managed,
            &root.join("revisions"),
            SaveConfigRequest {
                request_id: "save-commands".into(),
                asset_id: asset.id.clone(),
                expected_owner: SaveConfigOwnerDto {
                    agent_id: "alpha".into(),
                    workspace_id: None,
                },
                change: ConfigChangeDto::Commands {
                    value: updated.into(),
                },
                expected_baseline: loaded.baseline_ref,
                base_content: loaded.canonical_content,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = result else {
            panic!("Command 引用保存应返回 saved");
        };
        assert_eq!(revision.summary, "保存 Command 引用");
        assert_eq!(
            fs::read_to_string(package.join("config/commands.yaml")).unwrap(),
            updated
        );
        for invalid in [
            COMMANDS_SOURCE.replace("schemaVersion: 1", "schemaVersion: 2"),
            COMMANDS_SOURCE.replace("command-config-audit", "../command"),
            COMMANDS_SOURCE.replace("scope", "../parameter"),
            COMMANDS_SOURCE.replace(
                "\"agent\"}]",
                "\"agent\"},{\"parameterId\":\"scope\",\"type\":\"enum\",\"value\":\"workspace\"}]",
            ),
            COMMANDS_SOURCE.replace("\"agent\"}]}]\n", "\"agent\"}],\"unknown\":true}]\n"),
        ] {
            assert!(validate_commands_document(&invalid).is_err());
        }
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-commands-current".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                SaveConfigRequest {
                    request_id: "save-commands-mismatch".into(),
                    asset_id: asset.id.clone(),
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Hooks {
                        value: updated.into(),
                    },
                    expected_baseline: current.baseline_ref.clone(),
                    base_content: current.canonical_content.clone(),
                    confirmation_ref: None,
                },
            ),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(package.join("config/commands.yaml"), COMMANDS_SOURCE).unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                SaveConfigRequest {
                    request_id: "save-commands-stale".into(),
                    asset_id: asset.id.clone(),
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Commands {
                        value: updated.into(),
                    },
                    expected_baseline: current.baseline_ref,
                    base_content: current.canonical_content,
                    confirmation_ref: None,
                },
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn commands_revision_recovery_and_restore_preserve_history() {
        let root = temp_root("commands-revisions");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/commands.yaml"), COMMANDS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-commands-revisions".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "commands")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-commands-revisions".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let first = "schemaVersion: 1\ncommands: []\n";
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let failed = save_config_at(
            &managed,
            &blocker,
            SaveConfigRequest {
                request_id: "save-commands-pending".into(),
                asset_id: asset.id.clone(),
                expected_owner: SaveConfigOwnerDto {
                    agent_id: "alpha".into(),
                    workspace_id: None,
                },
                change: ConfigChangeDto::Commands {
                    value: first.into(),
                },
                expected_baseline: loaded.baseline_ref,
                base_content: loaded.canonical_content,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("Command revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-commands".into(),
                asset_id: asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("Command 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 Command 引用");
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-commands-second".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                SaveConfigRequest {
                    request_id: "save-commands-second".into(),
                    asset_id: asset.id.clone(),
                    expected_owner: SaveConfigOwnerDto {
                        agent_id: "alpha".into(),
                        workspace_id: None,
                    },
                    change: ConfigChangeDto::Commands {
                        value: COMMANDS_SOURCE.into(),
                    },
                    expected_baseline: current.baseline_ref,
                    base_content: current.canonical_content,
                    confirmation_ref: None,
                },
            ),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-commands-restore".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-commands".into(),
                asset_id: asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("Command 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(package.join("config/commands.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 3);
        let _ = fs::remove_dir_all(root);
    }

    const MCP_SOURCE: &str = "schemaVersion: 1\nmcp:\n  - \"mcp-common\"\n";

    fn mcp_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/mcp.yaml"), MCP_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-mcp".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "mcp")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-mcp".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn mcp_save_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-mcp".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Mcp {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    #[test]
    fn mcp_discovery_save_and_validation_use_frozen_schema() {
        let (root, managed, loaded) = mcp_fixture("mcp-save");
        assert_eq!(loaded.asset.kind, "mcp");
        let updated = "schemaVersion: 1\nmcp:\n  - \"mcp-common\"\n  - \"mcp-review\"\n";
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, mcp_save_request(&loaded, updated));
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("MCP 保存应返回 saved");
        };
        assert_eq!(revision.summary, "保存 MCP 引用");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/mcp.yaml")).unwrap(),
            updated
        );
        let reloaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-mcp".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                mcp_save_request(
                    &reloaded,
                    "schemaVersion: 1\nmcp:\n  - \"mcp-common\"\n  - \"mcp-common\"\n"
                )
            ),
            SaveConfigResult::ValidationFailed { .. }
        ));
        for invalid in [
            "schemaVersion: 2\nmcp:\n  []\n",
            "schemaVersion: 1\nmcp:\n  - \"../mcp\"\n",
            "schemaVersion: 1\nmcp:\n  []\nunknown: true\n",
        ] {
            assert!(validate_mcp_document(invalid).is_err());
        }
        let unchanged = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "unchanged-mcp".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(&managed, &revisions, mcp_save_request(&unchanged, updated)),
            SaveConfigResult::Unchanged { .. }
        ));
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mcp_save_rejects_kind_mismatch_and_external_change() {
        let (root, managed, loaded) = mcp_fixture("mcp-guards");
        let mismatch = SaveConfigRequest {
            request_id: "mcp-mismatch".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Skills {
                value: SKILLS_SOURCE.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        fs::write(
            managed.join("agt_alpha/config/mcp.yaml"),
            "schemaVersion: 1\nmcp:\n  - \"mcp-external\"\n",
        )
        .unwrap();
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                mcp_save_request(&loaded, "schemaVersion: 1\nmcp:\n  - \"mcp-proposed\"\n")
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mcp_revision_recovery_and_restore_preserve_history() {
        let (root, managed, loaded) = mcp_fixture("mcp-revisions");
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let first = "schemaVersion: 1\nmcp:\n  - \"mcp-first\"\n";
        let failed = save_config_at(&managed, &blocker, mcp_save_request(&loaded, first));
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("MCP revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-mcp".into(),
                asset_id: loaded.asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("MCP 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 MCP 引用");
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-mcp-second".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let second = "schemaVersion: 1\nmcp:\n  - \"mcp-second\"\n";
        assert!(matches!(
            save_config_at(&managed, &revisions, mcp_save_request(&current, second)),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-mcp-restore".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-mcp".into(),
                asset_id: loaded.asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("MCP 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/mcp.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(
            list_revisions_at(&revisions, &loaded.asset.id)
                .unwrap()
                .len(),
            3
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn context_discovery_save_and_validation_use_frozen_schema() {
        let (root, managed, loaded) = context_fixture("context-save");
        assert_eq!(loaded.asset.kind, "context");
        // 旧 v1 文件缺少规划窗口时仍可读取；规范保存会补写新字段。
        let updated = CONTEXT_SOURCE
            .replace("triggerRatio: 0.8", "triggerRatio: 0.85")
            .replace(
                "outputProfileId:",
                "contextWindowTokens: 256000\noutputProfileId:",
            );
        let saved = save_config_at(
            &managed,
            &root.join("revisions"),
            context_save_request(&loaded, &updated),
        );
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("Context 保存应返回 saved");
        };
        assert_eq!(asset.kind, "context");
        assert_eq!(revision.summary, "保存上下文策略与输出格式");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/context.yaml")).unwrap(),
            updated
        );
        let reloaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-context".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let invalid = updated.replace("contextWindowTokens: 256000", "contextWindowTokens: 999");
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                context_save_request(&reloaded, &invalid),
            ),
            SaveConfigResult::ValidationFailed { .. }
        ));
        assert_eq!(
            list_revisions_at(&root.join("revisions"), &asset.id)
                .unwrap()
                .len(),
            1
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn context_revision_recovery_and_restore_preserve_history() {
        let (root, managed, loaded) = context_fixture("context-revisions");
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let first = CONTEXT_SOURCE.replace("triggerRatio: 0.8", "triggerRatio: 0.85");
        let failed = save_config_at(&managed, &blocker, context_save_request(&loaded, &first));
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("Context revision 失败应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover-context".into(),
                asset_id: loaded.asset.id.clone(),
                recovery_ref,
            },
        );
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = recovered
        else {
            panic!("Context 补记应返回 saved");
        };
        assert_eq!(first_revision.summary, "补记已验证写入的 上下文策略");
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );

        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-context-second".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let second = first.replace("triggerRatio: 0.85", "triggerRatio: 0.9");
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                context_save_request(&current, &second),
            ),
            SaveConfigResult::Saved { .. }
        ));
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-context-restore".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore-context".into(),
                asset_id: loaded.asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("Context 恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/context.yaml")).unwrap(),
            first
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            first
        );
        assert_eq!(
            list_revisions_at(&revisions, &loaded.asset.id)
                .unwrap()
                .len(),
            3
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn context_save_rejects_kind_mismatch_and_external_change() {
        let (root, managed, loaded) = context_fixture("context-guards");
        let mismatch = SaveConfigRequest {
            request_id: "context-mismatch".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Instructions {
                value: "# Wrong\n".into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        };
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), mismatch),
            SaveConfigResult::ValidationFailed { .. }
        ));
        let external = CONTEXT_SOURCE.replace("enabled: true", "enabled: false");
        fs::write(managed.join("agt_alpha/config/context.yaml"), external).unwrap();
        let proposed = CONTEXT_SOURCE.replace("triggerRatio: 0.8", "triggerRatio: 0.9");
        assert!(matches!(
            save_config_at(
                &managed,
                &root.join("revisions"),
                context_save_request(&loaded, &proposed),
            ),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn instructions_save_returns_saved_and_unchanged() {
        let (root, managed, loaded) = instructions_fixture("save");
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, save_request(&loaded, "# Updated\n"));
        let SaveConfigResult::Saved {
            asset,
            revision,
            write_receipt,
            ..
        } = saved
        else {
            panic!("应返回 saved");
        };
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# Updated\n"
        );
        assert_eq!(asset.asset_content_hash, hash_bytes(b"# Updated\n"));
        assert_eq!(revision.write_receipt_id, write_receipt.id);
        assert!(revisions.join(format!("{}.json", revision.id)).is_file());
        assert!(revisions.join(format!("{}.content", revision.id)).is_file());
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 1);
        assert_eq!(
            read_revision_content_at(&revisions, &revision.id).unwrap(),
            "# Updated\n"
        );

        let reloaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload".into(),
                asset_id: asset.id,
            },
        )
        .unwrap();
        assert!(matches!(
            save_config_at(&managed, &revisions, save_request(&reloaded, "# Updated\n")),
            SaveConfigResult::Unchanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn instructions_save_rejects_wrong_owner_without_write_or_revision() {
        let (root, managed, loaded) = instructions_fixture("owner-mismatch");
        let revisions = root.join("revisions");
        let mut request = save_request(&loaded, "# Rejected\n");
        request.expected_owner.agent_id = "other-agent".into();

        let result = save_config_at(&managed, &revisions, request);
        let SaveConfigResult::ValidationFailed { diagnostics, .. } = result else {
            panic!("合法 assetId 与错误 owner 必须 validation_failed");
        };
        assert_eq!(diagnostics[0].code, "asset_owner_mismatch");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# Alpha\n"
        );
        assert!(!revisions.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn instructions_save_reports_real_three_way_baseline() {
        let (root, managed, loaded) = instructions_fixture("baseline");
        fs::write(managed.join("agt_alpha/instructions.md"), "# External\n").unwrap();
        let result = save_config_at(
            &managed,
            &root.join("revisions"),
            save_request(&loaded, "# Proposed\n"),
        );
        let SaveConfigResult::BaselineChanged {
            base,
            current,
            proposed,
            ..
        } = result
        else {
            panic!("应返回 baseline_changed");
        };
        assert_eq!(base.content, "# Alpha\n");
        assert_eq!(current.content, "# External\n");
        assert_eq!(proposed.content, "# Proposed\n");
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# External\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn instructions_save_rejects_tampered_base_and_revision_failure_is_explicit() {
        let (root, managed, loaded) = instructions_fixture("save-failures");
        let mut tampered = save_request(&loaded, "# Proposed\n");
        tampered.base_content = "# Forged\n".into();
        assert!(matches!(
            save_config_at(&managed, &root.join("revisions"), tampered),
            SaveConfigResult::ValidationFailed { .. }
        ));
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# Alpha\n"
        );

        let revision_blocker = root.join("revision-blocker");
        fs::write(&revision_blocker, b"not a directory").unwrap();
        let result = save_config_at(
            &managed,
            &revision_blocker,
            save_request(&loaded, "# Written\n"),
        );
        assert!(matches!(
            result,
            SaveConfigResult::SaveFailed { ref file_state, .. }
                if file_state == "verified_written_revision_pending"
        ));
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# Written\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn revision_history_survives_restart_and_rejects_corruption() {
        let (root, managed, loaded) = instructions_fixture("revision-history");
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, save_request(&loaded, "# First\n"));
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("应返回 saved");
        };

        let restarted = list_revisions_at(&revisions, &asset.id).unwrap();
        assert_eq!(restarted.len(), 1);
        assert_eq!(restarted[0].id, revision.id);

        fs::write(
            revisions.join(format!("{}.content", revision.id)),
            "# Tampered\n",
        )
        .unwrap();
        assert!(read_revision_content_at(&revisions, &revision.id).is_err());

        fs::write(revisions.join("invalid.json"), b"not-json").unwrap();
        fs::write(
            revisions.join("oversized.json"),
            vec![b'x'; 1024 * 1024 + 1],
        )
        .unwrap();
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn revision_pending_recovery_records_current_verified_content() {
        let (root, managed, loaded) = instructions_fixture("revision-recovery");
        let blocker = root.join("revision-blocker");
        fs::write(&blocker, b"not a directory").unwrap();
        let failed = save_config_at(&managed, &blocker, save_request(&loaded, "# Written\n"));
        let SaveConfigResult::SaveFailed {
            recovery_ref: Some(recovery_ref),
            ..
        } = failed
        else {
            panic!("应返回 recoveryRef");
        };
        fs::remove_file(&blocker).unwrap();
        let revisions = root.join("revisions");
        let recovered = recover_config_revision_at(
            &managed,
            &revisions,
            RecoverConfigRevisionRequest {
                request_id: "recover".into(),
                asset_id: loaded.asset.id.clone(),
                recovery_ref: recovery_ref.clone(),
            },
        );
        let SaveConfigResult::Saved { revision, .. } = recovered else {
            panic!("补记应返回 saved");
        };
        assert_eq!(revision.id, recovery_ref);
        assert_eq!(
            read_revision_content_at(&revisions, &revision.id).unwrap(),
            "# Written\n"
        );
        assert!(matches!(
            recover_config_revision_at(
                &managed,
                &revisions,
                RecoverConfigRevisionRequest {
                    request_id: "recover-again".into(),
                    asset_id: loaded.asset.id,
                    recovery_ref: revision.id,
                },
            ),
            SaveConfigResult::Unchanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn revision_restore_creates_new_revision_without_overwriting_history() {
        let (root, managed, loaded) = instructions_fixture("revision-restore");
        let revisions = root.join("revisions");
        let first = save_config_at(&managed, &revisions, save_request(&loaded, "# First\n"));
        let SaveConfigResult::Saved {
            revision: first_revision,
            ..
        } = first
        else {
            panic!("应返回首次 saved");
        };
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-current".into(),
                asset_id: first_revision.asset_id.clone(),
            },
        )
        .unwrap();
        let second = save_config_at(&managed, &revisions, save_request(&current, "# Second\n"));
        let SaveConfigResult::Saved { asset, .. } = second else {
            panic!("应返回第二次 saved");
        };
        let before_restore = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-restore".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let restored = restore_config_revision_at(
            &managed,
            &revisions,
            RestoreConfigRevisionRequest {
                request_id: "restore".into(),
                asset_id: asset.id.clone(),
                revision_id: first_revision.id.clone(),
                expected_baseline: before_restore.baseline_ref,
                base_content: before_restore.canonical_content,
                confirmed: true,
                confirmation_ref: None,
            },
        );
        let SaveConfigResult::Saved { revision, .. } = restored else {
            panic!("恢复应返回 saved");
        };
        assert_eq!(
            revision.restored_from_revision_id,
            Some(first_revision.id.clone())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/instructions.md")).unwrap(),
            "# First\n"
        );
        assert_eq!(
            read_revision_content_at(&revisions, &first_revision.id).unwrap(),
            "# First\n"
        );
        assert_eq!(list_revisions_at(&revisions, &asset.id).unwrap().len(), 3);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn revision_restore_requires_confirmation_and_current_baseline() {
        let (root, managed, loaded) = instructions_fixture("revision-restore-guards");
        let revisions = root.join("revisions");
        let saved = save_config_at(&managed, &revisions, save_request(&loaded, "# Saved\n"));
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = saved
        else {
            panic!("应返回 saved");
        };
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-guard".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        let mut request = RestoreConfigRevisionRequest {
            request_id: "restore-guard".into(),
            asset_id: asset.id,
            revision_id: revision.id.clone(),
            expected_baseline: current.baseline_ref,
            base_content: current.canonical_content,
            confirmed: false,
            confirmation_ref: None,
        };
        assert!(matches!(
            restore_config_revision_at(&managed, &revisions, request),
            SaveConfigResult::ValidationFailed { .. }
        ));
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-external".into(),
                asset_id: revision.asset_id,
            },
        )
        .unwrap();
        request = RestoreConfigRevisionRequest {
            request_id: "restore-external".into(),
            asset_id: current.asset.id,
            revision_id: revision.id,
            expected_baseline: current.baseline_ref,
            base_content: current.canonical_content,
            confirmed: true,
            confirmation_ref: None,
        };
        fs::write(managed.join("agt_alpha/instructions.md"), "# External\n").unwrap();
        assert!(matches!(
            restore_config_revision_at(&managed, &revisions, request),
            SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    const PERMISSIONS_SOURCE: &str = "schemaVersion: 1\npermissions:\n  files: \"仅当前工作区\"\n  commands: \"构建、测试与版本控制\"\n  network: \"仅已配置 MCP\"\n  delegation: \"仅明确服务授权范围\"\n";

    fn permissions_fixture(name: &str) -> (PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/permissions.yaml"), PERMISSIONS_SOURCE).unwrap();
        let discovery = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "discover-permissions".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|asset| asset.kind == "permissions")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-permissions".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, loaded)
    }

    fn permissions_request(
        loaded: &LoadEditorResult,
        value: &str,
        confirmation_ref: Option<String>,
    ) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-permissions".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: None,
            },
            change: ConfigChangeDto::Permissions {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref,
        }
    }

    #[test]
    fn permissions_expansion_requires_bound_one_time_confirmation() {
        let (root, managed, loaded) = permissions_fixture("permissions-confirmation");
        let revisions = root.join("revisions");
        let expanded = PERMISSIONS_SOURCE.replace("仅当前工作区", "任意目录");
        let first = save_config_at(
            &managed,
            &revisions,
            permissions_request(&loaded, &expanded, None),
        );
        let SaveConfigResult::ConfirmationRequired { challenge, .. } = first else {
            panic!("扩大权限应要求确认");
        };
        assert_eq!(challenge.asset_id, loaded.asset.id);
        assert_eq!(
            challenge.proposed_content_hash,
            hash_bytes(expanded.as_bytes())
        );
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/permissions.yaml")).unwrap(),
            PERMISSIONS_SOURCE
        );
        let saved = save_config_at(
            &managed,
            &revisions,
            permissions_request(&loaded, &expanded, Some(challenge.id.clone())),
        );
        let SaveConfigResult::Saved { revision, .. } = saved else {
            panic!("有效确认应完成保存");
        };
        assert_eq!(revision.confirmation_refs, vec![challenge.id.clone()]);
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                permissions_request(&loaded, &expanded, Some(challenge.id)),
            ),
            SaveConfigResult::ValidationFailed { .. } | SaveConfigResult::BaselineChanged { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn permissions_confirmation_rejects_mismatched_and_expired_challenges() {
        let (root, managed, loaded) = permissions_fixture("permissions-invalid-confirmation");
        let revisions = root.join("revisions");
        let expanded = PERMISSIONS_SOURCE.replace("仅当前工作区", "任意目录");
        let proposed_hash = hash_bytes(expanded.as_bytes());
        let baseline_hash = loaded.baseline_ref.asset_content_hash.clone();

        for (asset_id, content_hash, baseline) in [
            (
                "wrong-asset",
                proposed_hash.as_str(),
                baseline_hash.as_str(),
            ),
            (
                loaded.asset.id.as_str(),
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                baseline_hash.as_str(),
            ),
            (
                loaded.asset.id.as_str(),
                proposed_hash.as_str(),
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            ),
        ] {
            let challenge =
                issue_confirmation(&revisions, &loaded.asset.id, &proposed_hash, &baseline_hash)
                    .unwrap();
            assert!(consume_confirmation(
                &revisions,
                &challenge.id,
                asset_id,
                content_hash,
                baseline,
            )
            .is_err());
        }

        let expired =
            issue_confirmation(&revisions, &loaded.asset.id, &proposed_hash, &baseline_hash)
                .unwrap();
        let expired_target = confirmation_root(&revisions).join(format!("{}.json", expired.id));
        let mut record: ConfirmationRecord =
            serde_json::from_slice(&fs::read(&expired_target).unwrap()).unwrap();
        record.expires_at = (chrono::Utc::now() - chrono::Duration::minutes(1))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        fs::write(&expired_target, serde_json::to_vec(&record).unwrap()).unwrap();
        assert!(consume_confirmation(
            &revisions,
            &expired.id,
            &loaded.asset.id,
            &proposed_hash,
            &baseline_hash,
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(managed.join("agt_alpha/config/permissions.yaml")).unwrap(),
            PERMISSIONS_SOURCE
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn permissions_restore_to_wider_boundary_requires_confirmation() {
        let (root, managed, loaded) = permissions_fixture("permissions-restore-confirmation");
        let revisions = root.join("revisions");
        let expanded = PERMISSIONS_SOURCE.replace("仅当前工作区", "任意目录");
        let SaveConfigResult::ConfirmationRequired { challenge, .. } = save_config_at(
            &managed,
            &revisions,
            permissions_request(&loaded, &expanded, None),
        ) else {
            panic!("首次扩大权限应要求确认");
        };
        let SaveConfigResult::Saved {
            revision: expanded_revision,
            ..
        } = save_config_at(
            &managed,
            &revisions,
            permissions_request(&loaded, &expanded, Some(challenge.id)),
        )
        else {
            panic!("确认后应保存扩大后的权限版本");
        };
        let expanded_current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-expanded-permissions".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let tightened = expanded.replace("任意目录", "只读当前工作区");
        assert!(matches!(
            save_config_at(
                &managed,
                &revisions,
                permissions_request(&expanded_current, &tightened, None),
            ),
            SaveConfigResult::Saved { .. }
        ));
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-tightened-permissions".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let restore_request = |confirmation_ref| RestoreConfigRevisionRequest {
            request_id: "restore-expanded-permissions".into(),
            asset_id: current.asset.id.clone(),
            revision_id: expanded_revision.id.clone(),
            expected_baseline: current.baseline_ref.clone(),
            base_content: current.canonical_content.clone(),
            confirmed: true,
            confirmation_ref,
        };
        let SaveConfigResult::ConfirmationRequired { challenge, .. } =
            restore_config_revision_at(&managed, &revisions, restore_request(None))
        else {
            panic!("恢复到更宽权限应要求一次性确认");
        };
        let SaveConfigResult::Saved { revision, .. } = restore_config_revision_at(
            &managed,
            &revisions,
            restore_request(Some(challenge.id.clone())),
        ) else {
            panic!("确认后应恢复为新版本");
        };
        assert_eq!(revision.confirmation_refs, vec![challenge.id]);
        assert_eq!(
            revision.restored_from_revision_id,
            Some(expanded_revision.id)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn permissions_tightening_saves_without_confirmation_and_validates_schema() {
        let (root, managed, loaded) = permissions_fixture("permissions-tightening");
        let revisions = root.join("revisions");
        let tightened = PERMISSIONS_SOURCE.replace("仅当前工作区", "只读当前工作区");
        let saved = save_config_at(
            &managed,
            &revisions,
            permissions_request(&loaded, &tightened, None),
        );
        let SaveConfigResult::Saved { revision, .. } = saved else {
            panic!("收紧权限应直接保存");
        };
        assert!(revision.confirmation_refs.is_empty());
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-permissions".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        let invalid = permissions_request(
            &current,
            &tightened.replace("delegation:", "unknown:"),
            None,
        );
        assert!(matches!(
            save_config_at(&managed, &revisions, invalid),
            SaveConfigResult::ValidationFailed { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    const WORKSPACE_BINDING_SOURCE: &str = "schemaVersion: 1\nworkspaceBinding: {\"workspaceId\":\"ws-1\",\"instructions\":\"专属配置\",\"ruleIds\":[\"rule-common\"],\"skillIds\":[],\"mcpIds\":[],\"contextPolicy\":{\"triggerRatio\":0.7},\"orchestrationPolicy\":{\"maxDelegationDepth\":1}}\n";
    const WORKSPACE_ORCHESTRATION_ROOT: &str = "schemaVersion: 1\norchestration: {\"enabled\":true,\"maxDelegationDepth\":2,\"allowedAgentIds\":[\"agent-review\"],\"allowedRoleIds\":[\"role-review\"],\"allowedDepartmentIds\":[\"department-engineering\"],\"requireWorkspaceBinding\":true,\"requireSopMatch\":true,\"requireServiceGrantForCrossDepartment\":true,\"escalationAgentId\":\"agent-lead\",\"escalationConditions\":[\"没有合法候选\"],\"prohibitions\":[\"禁止跨公司\"]}\n";

    fn workspace_binding_fixture(name: &str) -> (PathBuf, PathBuf, PathBuf, LoadEditorResult) {
        let root = temp_root(name);
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::create_dir_all(package.join("workspaces/ws-1")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/context.yaml"), CONTEXT_SOURCE).unwrap();
        fs::write(
            package.join("config/orchestration.yaml"),
            WORKSPACE_ORCHESTRATION_ROOT,
        )
        .unwrap();
        fs::write(
            package.join("workspaces/ws-1/config.yaml"),
            WORKSPACE_BINDING_SOURCE,
        )
        .unwrap();
        let workspace = root.join("workspace");
        let registry = root.join("registry");
        fs::create_dir(&workspace).unwrap();
        register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "register-ws-1".into(),
                workspace_id: "ws-1".into(),
                selected_path: workspace.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        let discovery = discover_at(
            &registry,
            &managed,
            DiscoveryRequest {
                request_id: "discover-workspace-binding".into(),
                workspace_ids: vec!["ws-1".into()],
                include_claude_user_root: false,
            },
        );
        let asset = discovery
            .assets
            .iter()
            .find(|item| item.kind == "workspace_binding")
            .unwrap();
        let loaded = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "load-workspace-binding".into(),
                asset_id: asset.id.clone(),
            },
        )
        .unwrap();
        (root, managed, registry, loaded)
    }

    fn workspace_binding_request(loaded: &LoadEditorResult, value: &str) -> SaveConfigRequest {
        SaveConfigRequest {
            request_id: "save-workspace-binding".into(),
            asset_id: loaded.asset.id.clone(),
            expected_owner: SaveConfigOwnerDto {
                agent_id: "alpha".into(),
                workspace_id: Some("ws-1".into()),
            },
            change: ConfigChangeDto::WorkspaceBinding {
                value: value.into(),
            },
            expected_baseline: loaded.baseline_ref.clone(),
            base_content: loaded.canonical_content.clone(),
            confirmation_ref: None,
        }
    }

    #[test]
    fn workspace_binding_discovery_save_and_boundaries_are_enforced() {
        let (root, managed, registry, loaded) = workspace_binding_fixture("workspace-binding");
        assert_eq!(loaded.asset.kind, "workspace_binding");
        assert!(loaded.asset.id.starts_with("asset-"));
        let updated = WORKSPACE_BINDING_SOURCE.replace("专属配置", "已更新");
        assert!(matches!(
            save_config_registered_at(
                &registry,
                &managed,
                &root.join("revisions"),
                workspace_binding_request(&loaded, &updated),
            ),
            SaveConfigResult::Saved { .. }
        ));
        let discovery = discover_at(
            &registry,
            &managed,
            DiscoveryRequest {
                request_id: "rediscover-workspace-binding".into(),
                workspace_ids: vec!["ws-1".into()],
                include_claude_user_root: false,
            },
        );
        assert_eq!(
            discovery
                .assets
                .iter()
                .find(|item| item.kind == "workspace_binding")
                .unwrap()
                .id,
            loaded.asset.id
        );
        for invalid in [
            updated.replace("0.7", "0.9"),
            updated.replace("\"maxDelegationDepth\":1", "\"maxDelegationDepth\":3"),
            updated.replace("}\n", ",\"memoryRevision\":\"MR-1\"}\n"),
        ] {
            let current = load_editor_at(
                &managed,
                LoadEditorRequest {
                    request_id: "reload-workspace-binding".into(),
                    asset_id: loaded.asset.id.clone(),
                },
            )
            .unwrap();
            assert!(matches!(
                save_config_registered_at(
                    &registry,
                    &managed,
                    &root.join("revisions"),
                    workspace_binding_request(&current, &invalid),
                ),
                SaveConfigResult::ValidationFailed { .. }
            ));
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_binding_registered_save_recovery_and_restore_require_registry() {
        let (root, managed, registry, loaded) =
            workspace_binding_fixture("workspace-binding-registry-guards");
        let revisions = root.join("revisions");
        let updated = WORKSPACE_BINDING_SOURCE.replace("专属配置", "已更新");
        let SaveConfigResult::Saved { revision, .. } = save_config_registered_at(
            &registry,
            &managed,
            &revisions,
            workspace_binding_request(&loaded, &updated),
        ) else {
            panic!("已登记 Workspace 应可保存并生成 ConfigRevision");
        };
        let current = load_editor_at(
            &managed,
            LoadEditorRequest {
                request_id: "reload-workspace-binding-registry".into(),
                asset_id: loaded.asset.id.clone(),
            },
        )
        .unwrap();
        fs::remove_dir_all(&registry).unwrap();

        for result in [
            save_config_registered_at(
                &registry,
                &managed,
                &revisions,
                workspace_binding_request(&current, WORKSPACE_BINDING_SOURCE),
            ),
            recover_config_revision_registered_at(
                &registry,
                &managed,
                &revisions,
                RecoverConfigRevisionRequest {
                    request_id: "recover-workspace-binding-registry".into(),
                    asset_id: current.asset.id.clone(),
                    recovery_ref: "revision-workspace-binding-recovery".into(),
                },
            ),
            restore_config_revision_registered_at(
                &registry,
                &managed,
                &revisions,
                RestoreConfigRevisionRequest {
                    request_id: "restore-workspace-binding-registry".into(),
                    asset_id: current.asset.id.clone(),
                    revision_id: revision.id.clone(),
                    expected_baseline: current.baseline_ref.clone(),
                    base_content: current.canonical_content.clone(),
                    confirmed: true,
                    confirmation_ref: None,
                },
            ),
        ] {
            let SaveConfigResult::ValidationFailed { diagnostics, .. } = result else {
                panic!("Registry 缺失时 WorkspaceBinding 写入链必须拒绝");
            };
            assert!(diagnostics
                .iter()
                .any(|issue| issue.code == "workspace_binding_workspace_unavailable"));
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_binding_save_rejects_missing_or_invalid_root_boundaries() {
        let (root, managed, registry, loaded) =
            workspace_binding_fixture("workspace-binding-root-boundaries");
        let context_path = managed.join("agt_alpha/config/context.yaml");
        fs::remove_file(&context_path).unwrap();
        let result = save_config_registered_at(
            &registry,
            &managed,
            &root.join("revisions"),
            workspace_binding_request(
                &loaded,
                &WORKSPACE_BINDING_SOURCE.replace("专属配置", "更新"),
            ),
        );
        let SaveConfigResult::ValidationFailed { diagnostics, .. } = result else {
            panic!("根 Context 缺失时必须拒绝 WorkspaceBinding 保存");
        };
        assert!(diagnostics
            .iter()
            .any(|issue| issue.code == "workspace_binding_root_context_unavailable"));

        fs::write(&context_path, "schemaVersion: 1\ncontextPolicy: invalid\n").unwrap();
        let result = save_config_registered_at(
            &registry,
            &managed,
            &root.join("revisions"),
            workspace_binding_request(
                &loaded,
                &WORKSPACE_BINDING_SOURCE.replace("专属配置", "更新"),
            ),
        );
        let SaveConfigResult::ValidationFailed { diagnostics, .. } = result else {
            panic!("根 Context 损坏时必须拒绝 WorkspaceBinding 保存");
        };
        assert!(diagnostics
            .iter()
            .any(|issue| issue.code == "workspace_binding_root_context_invalid"));

        fs::write(&context_path, CONTEXT_SOURCE).unwrap();
        fs::remove_file(managed.join("agt_alpha/config/orchestration.yaml")).unwrap();
        let result = save_config_registered_at(
            &registry,
            &managed,
            &root.join("revisions"),
            workspace_binding_request(
                &loaded,
                &WORKSPACE_BINDING_SOURCE.replace("专属配置", "更新"),
            ),
        );
        let SaveConfigResult::ValidationFailed { diagnostics, .. } = result else {
            panic!("根 Orchestration 缺失时必须拒绝 WorkspaceBinding 保存");
        };
        assert!(diagnostics
            .iter()
            .any(|issue| { issue.code == "workspace_binding_root_orchestration_unavailable" }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_binding_create_requires_registry_and_current_package() {
        let root = temp_root("workspace-binding-create");
        let managed = root.join("agents");
        let package = managed.join("agt_alpha");
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(package.join("agent.yaml"), "schemaVersion: 1\nid: alpha\n").unwrap();
        fs::write(package.join("instructions.md"), "# Alpha\n").unwrap();
        fs::write(package.join("config/context.yaml"), CONTEXT_SOURCE).unwrap();
        fs::write(
            package.join("config/orchestration.yaml"),
            WORKSPACE_ORCHESTRATION_ROOT,
        )
        .unwrap();
        let registry = root.join("registry");
        let request = || CreateWorkspaceBindingRequest {
            request_id: "create-workspace-binding".into(),
            agent_id: "alpha".into(),
            workspace_id: "ws-1".into(),
            value: WORKSPACE_BINDING_SOURCE.into(),
        };
        assert!(matches!(
            create_workspace_binding_at(&registry, &managed, &root.join("revisions"), request(),),
            SaveConfigResult::ValidationFailed { .. }
        ));
        let workspace = root.join("workspace");
        fs::create_dir(&workspace).unwrap();
        register_workspace_at(
            &registry,
            RegisterWorkspaceRequest {
                request_id: "register-create-ws".into(),
                workspace_id: "ws-1".into(),
                selected_path: workspace.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        let SaveConfigResult::Saved {
            asset, revision, ..
        } = create_workspace_binding_at(&registry, &managed, &root.join("revisions"), request())
        else {
            panic!("已登记 Workspace 应安全创建 Binding");
        };
        assert_eq!(asset.kind, "workspace_binding");
        assert_eq!(revision.summary, "创建 WorkspaceBinding");
        assert_eq!(
            fs::read_to_string(package.join("workspaces/ws-1/config.yaml")).unwrap(),
            WORKSPACE_BINDING_SOURCE
        );
        assert!(matches!(
            create_workspace_binding_at(&registry, &managed, &root.join("revisions"), request(),),
            SaveConfigResult::ValidationFailed { .. }
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_binding_discovery_rejects_identity_mismatch_and_symlink() {
        let (root, managed, registry, _) = workspace_binding_fixture("workspace-binding-guards");
        fs::write(
            managed.join("agt_alpha/workspaces/ws-1/config.yaml"),
            WORKSPACE_BINDING_SOURCE.replace("ws-1", "ws-other"),
        )
        .unwrap();
        let discovery = discover_at(
            &registry,
            &managed,
            DiscoveryRequest {
                request_id: "discover-mismatch".into(),
                workspace_ids: vec!["ws-1".into()],
                include_claude_user_root: false,
            },
        );
        assert!(discovery.assets.iter().any(|asset| {
            asset.kind == "workspace_binding"
                && asset
                    .diagnostics
                    .iter()
                    .any(|issue| issue.code == "workspace_binding_identity_mismatch")
        }));
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            fs::remove_dir_all(managed.join("agt_alpha/workspaces/ws-1")).unwrap();
            symlink(
                root.join("workspace"),
                managed.join("agt_alpha/workspaces/ws-1"),
            )
            .unwrap();
            let discovery = discover_at(
                &registry,
                &managed,
                DiscoveryRequest {
                    request_id: "discover-symlink".into(),
                    workspace_ids: vec!["ws-1".into()],
                    include_claude_user_root: false,
                },
            );
            assert!(discovery
                .diagnostics
                .iter()
                .any(|issue| { issue.code == "workspace_binding_directory_rejected" }));

            fs::remove_file(managed.join("agt_alpha/workspaces/ws-1")).unwrap();
            fs::create_dir(managed.join("agt_alpha/workspaces/ws-1")).unwrap();
            symlink(
                root.join("workspace/missing-config.yaml"),
                managed.join("agt_alpha/workspaces/ws-1/config.yaml"),
            )
            .unwrap();
            let discovery = discover_at(
                &registry,
                &managed,
                DiscoveryRequest {
                    request_id: "discover-config-symlink".into(),
                    workspace_ids: vec!["ws-1".into()],
                    include_claude_user_root: false,
                },
            );
            assert!(discovery
                .assets
                .iter()
                .all(|asset| { asset.kind != "workspace_binding" }));
            assert!(discovery.diagnostics.iter().any(|issue| {
                issue.code == "workspace_binding_target_rejected"
                    || issue.code == "workspace_binding_unreadable"
            }));
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discovery_reports_future_missing_and_duplicate_packages() {
        let root = temp_root("diagnostics");
        let managed = root.join("agents");
        for name in ["agt_duplicate", "agt_wrong"] {
            let package = managed.join(name);
            fs::create_dir_all(&package).unwrap();
            fs::write(
                package.join("agent.yaml"),
                "schemaVersion: 2\nid: duplicate\n",
            )
            .unwrap();
            if name == "agt_duplicate" {
                fs::write(package.join("instructions.md"), "text").unwrap();
            }
        }
        let result = discover_at(
            &root.join("records"),
            &managed,
            DiscoveryRequest {
                request_id: "req".into(),
                workspace_ids: vec![],
                include_claude_user_root: false,
            },
        );
        assert_eq!(result.assets.len(), 1);
        assert_eq!(result.assets[0].parse_status, "unsupported");
        assert!(result
            .diagnostics
            .iter()
            .any(|item| item.code == "stable_id_directory_mismatch"
                || item.code == "instructions_missing"));
        let _ = fs::remove_dir_all(root);
    }
}
