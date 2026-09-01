use std::{fs, path::Path};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{
    config_fs::restricted_atomic_write,
    domain_store, local_service,
    memory_target::{self, ResolvedMemoryTarget},
};

const MEMORY_PROFILE_VERSION: &str = memory_target::PROFILE_VERSION;
#[cfg(test)]
const MEMORY_RELATIVE_PATH: &str = "memory/long-term.md";
const MAX_MEMORY_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemorySourceDto {
    pub(crate) kind: String,
    pub(crate) label: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemorySpaceDto {
    pub(crate) id: String,
    pub(crate) scope_type: String,
    pub(crate) scope_key: MemoryScopeKeyDto,
    pub(crate) owner: MemoryOwnerDto,
    pub(crate) steward_agent_id: String,
    pub(crate) reviewer_agent_id: String,
    pub(crate) review_policy: String,
    pub(crate) visibility_policy: String,
    pub(crate) storage_profile_version: String,
    pub(crate) state: String,
    pub(crate) storage_locator: local_service::AssetLocatorDto,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) current_revision_id: Option<String>,
    pub(crate) content_hash: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum MemoryScopeKeyDto {
    AgentLongTerm {
        agent_id: String,
    },
    AgentWorkspace {
        agent_id: String,
        workspace_id: String,
    },
    WorkspaceShared {
        workspace_id: String,
    },
    DepartmentWorkspace {
        department_id: String,
        workspace_id: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum MemoryOwnerDto {
    Agent {
        agent_id: String,
    },
    Workspace {
        workspace_id: String,
    },
    DepartmentWorkspace {
        department_id: String,
        workspace_id: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemoryCandidateDto {
    pub(crate) id: String,
    pub(crate) space_id: String,
    pub(crate) proposer_agent_id: String,
    pub(crate) reviewer_agent_id: String,
    pub(crate) source: MemorySourceDto,
    pub(crate) summary: String,
    pub(crate) proposed_content: String,
    pub(crate) proposed_content_hash: String,
    pub(crate) submitted_baseline: local_service::BaselineRefDto,
    #[serde(skip)]
    submitted_base_content: String,
    pub(crate) status: String,
    pub(crate) version: u64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemoryReviewDecisionDto {
    pub(crate) id: String,
    pub(crate) candidate_id: String,
    pub(crate) actor_agent_id: String,
    pub(crate) decision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) comment: Option<String>,
    pub(crate) decided_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemoryRevisionDto {
    pub(crate) id: String,
    pub(crate) space_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent_revision_id: Option<String>,
    pub(crate) candidate_id: String,
    pub(crate) review_decision_id: String,
    pub(crate) proposer_agent_id: String,
    pub(crate) reviewer_agent_id: String,
    pub(crate) source_content_hash: String,
    pub(crate) content_hash: String,
    pub(crate) storage_locator: local_service::AssetLocatorDto,
    pub(crate) write_receipt_id: String,
    pub(crate) written_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscoverEligibleMemorySpacesRequest {
    pub(crate) request_id: String,
    pub(crate) agent_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EligibleMemorySpacesResult {
    pub(crate) request_id: String,
    pub(crate) spaces: Vec<MemorySpaceDto>,
    pub(crate) diagnostics: Vec<local_service::DiagnosticDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CreateMemoryCandidateRequest {
    pub(crate) request_id: String,
    pub(crate) candidate_id: String,
    pub(crate) space_id: String,
    pub(crate) proposer_agent_id: String,
    pub(crate) source: MemorySourceDto,
    pub(crate) summary: String,
    pub(crate) proposed_content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemoryReviewBundleDto {
    pub(crate) request_id: String,
    pub(crate) space: MemorySpaceDto,
    pub(crate) candidate: MemoryCandidateDto,
    pub(crate) current_content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ReviewMemoryCandidateRequest {
    pub(crate) request_id: String,
    pub(crate) candidate_id: String,
    pub(crate) decision: String,
    pub(crate) expected_candidate_version: u64,
    pub(crate) expected_baseline: local_service::BaselineRefDto,
    pub(crate) comment: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecoverMemoryRevisionRequest {
    pub(crate) request_id: String,
    pub(crate) candidate_id: String,
    pub(crate) recovery_ref: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListMemoryRevisionsRequest {
    pub(crate) request_id: String,
    pub(crate) space_id: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub(crate) enum ReviewMemoryCandidateResult {
    ReviewRecorded {
        request_id: String,
        candidate: MemoryCandidateDto,
        decision: MemoryReviewDecisionDto,
    },
    Saved {
        request_id: String,
        candidate: MemoryCandidateDto,
        decision: MemoryReviewDecisionDto,
        revision: MemoryRevisionDto,
        write_receipt: local_service::WriteReceiptDto,
    },
    CandidateChanged {
        request_id: String,
        candidate: MemoryCandidateDto,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
    BaselineChanged {
        request_id: String,
        candidate_id: String,
        base: local_service::ConfigSideDto,
        current: local_service::ConfigSideDto,
        proposed: local_service::ConfigSideDto,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
    ReviewerMismatch {
        request_id: String,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
    SelfReviewForbidden {
        request_id: String,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
    ValidationFailed {
        request_id: String,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
    SaveFailed {
        request_id: String,
        diagnostics: Vec<local_service::DiagnosticDto>,
        retryable: bool,
        file_state: String,
    },
    RevisionPending {
        request_id: String,
        candidate: MemoryCandidateDto,
        decision: MemoryReviewDecisionDto,
        write_receipt: local_service::WriteReceiptDto,
        recovery_ref: String,
        diagnostics: Vec<local_service::DiagnosticDto>,
    },
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && value != "."
        && value != ".."
}

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    if valid_id(value) {
        Ok(())
    } else {
        Err(format!("{label}无效"))
    }
}

fn locator(target: &ResolvedMemoryTarget) -> local_service::AssetLocatorDto {
    local_service::AssetLocatorDto {
        root_kind: target.root_kind.clone(),
        display_path: target.relative_path.clone(),
        relative_path: Some(target.relative_path.clone()),
    }
}

fn memory_facts(
    target: &ResolvedMemoryTarget,
    content: &str,
) -> (
    local_service::AssetLocatorDto,
    local_service::BaselineRefDto,
) {
    let content_hash = local_service::hash_bytes(content.as_bytes());
    let baseline = local_service::BaselineRefDto {
        id: local_service::stable_id(
            "memory-baseline",
            &format!("{}:{content_hash}", target.space_id),
        ),
        asset_id: target.space_id.clone(),
        container_id: target.space_id.clone(),
        asset_content_hash: content_hash.clone(),
        container_content_hash: content_hash,
    };
    (locator(target), baseline)
}

fn scope_key(target: &ResolvedMemoryTarget) -> MemoryScopeKeyDto {
    match &target.scope_key {
        memory_target::ScopeKey::AgentLongTerm { agent_id } => MemoryScopeKeyDto::AgentLongTerm {
            agent_id: agent_id.clone(),
        },
        memory_target::ScopeKey::AgentWorkspace {
            agent_id,
            workspace_id,
        } => MemoryScopeKeyDto::AgentWorkspace {
            agent_id: agent_id.clone(),
            workspace_id: workspace_id.clone(),
        },
        memory_target::ScopeKey::WorkspaceShared { workspace_id } => {
            MemoryScopeKeyDto::WorkspaceShared {
                workspace_id: workspace_id.clone(),
            }
        }
        memory_target::ScopeKey::DepartmentWorkspace {
            department_id,
            workspace_id,
        } => MemoryScopeKeyDto::DepartmentWorkspace {
            department_id: department_id.clone(),
            workspace_id: workspace_id.clone(),
        },
    }
}

fn owner(target: &ResolvedMemoryTarget) -> MemoryOwnerDto {
    match &target.owner {
        memory_target::Owner::Agent { agent_id } => MemoryOwnerDto::Agent {
            agent_id: agent_id.clone(),
        },
        memory_target::Owner::Workspace { workspace_id } => MemoryOwnerDto::Workspace {
            workspace_id: workspace_id.clone(),
        },
        memory_target::Owner::DepartmentWorkspace {
            department_id,
            workspace_id,
        } => MemoryOwnerDto::DepartmentWorkspace {
            department_id: department_id.clone(),
            workspace_id: workspace_id.clone(),
        },
    }
}

fn space_dto(
    target: &ResolvedMemoryTarget,
    current_revision_id: Option<String>,
    content_hash: String,
    updated_at: String,
) -> MemorySpaceDto {
    MemorySpaceDto {
        id: target.space_id.clone(),
        scope_type: target.scope_type.into(),
        scope_key: scope_key(target),
        owner: owner(target),
        steward_agent_id: target.steward_agent_id.clone(),
        reviewer_agent_id: target.reviewer_agent_id.clone(),
        review_policy: "independent_reviewer".into(),
        visibility_policy: target.visibility_policy.into(),
        storage_profile_version: MEMORY_PROFILE_VERSION.into(),
        state: target.state.into(),
        storage_locator: locator(target),
        current_revision_id,
        content_hash,
        updated_at,
    }
}

fn candidate_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryCandidateDto> {
    let baseline: String = row.get(8)?;
    Ok(MemoryCandidateDto {
        id: row.get(0)?,
        space_id: row.get(1)?,
        proposer_agent_id: row.get(2)?,
        reviewer_agent_id: row.get(3)?,
        source: MemorySourceDto {
            kind: row.get(4)?,
            label: row.get(5)?,
        },
        summary: row.get(6)?,
        proposed_content: row.get(7)?,
        proposed_content_hash: row.get(9)?,
        submitted_baseline: serde_json::from_str(&baseline).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                baseline.len(),
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        submitted_base_content: row.get(14)?,
        status: row.get(10)?,
        version: row.get::<_, i64>(11)? as u64,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn load_candidate(
    connection: &rusqlite::Connection,
    candidate_id: &str,
) -> Result<MemoryCandidateDto, String> {
    connection.query_row("SELECT id, space_id, proposer_agent_id, reviewer_agent_id, source_kind, source_label, summary, proposed_content, submitted_baseline_json, proposed_content_hash, status, version, created_at, updated_at, submitted_base_content FROM memory_candidates WHERE id = ?1", [candidate_id], candidate_from_row)
        .optional().map_err(|_| "无法读取 MemoryCandidate".to_string())?.ok_or_else(|| "MemoryCandidate 不存在".to_string())
}

fn load_space(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    connection: &rusqlite::Connection,
    space_id: &str,
) -> Result<(MemorySpaceDto, ResolvedMemoryTarget), String> {
    let row = connection
        .query_row(
            "SELECT id, scope_type, agent_id, workspace_id, department_id,
                    steward_agent_id, reviewer_agent_id, current_revision_id,
                    content_hash, updated_at, storage_profile_version, state
             FROM memory_spaces WHERE id = ?1",
            [space_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "无法读取 MemorySpace".to_string())?
        .ok_or_else(|| "MemorySpace 不存在".to_string())?;
    if row.10 != MEMORY_PROFILE_VERSION {
        return Err("MemorySpace 存储版本不受支持".into());
    }
    let resolve = |state: &str| {
        memory_target::resolve_stored(
            database,
            agents_root,
            registry_root,
            &row.1,
            row.2.as_deref(),
            row.3.as_deref(),
            row.4.as_deref(),
            &row.0,
            row.5.clone(),
            row.6.clone(),
            state,
        )
    };
    let target = match resolve(&row.11) {
        Ok(target) => target,
        Err(message)
            if row.1 == "department_workspace"
                && row.11 == "active"
                && message == "Department × Workspace 关系已失效" =>
        {
            connection
                .execute(
                    "UPDATE memory_spaces SET state = 'read_only_history' WHERE id = ?1",
                    [&row.0],
                )
                .map_err(|_| "无法冻结失效的 Department MemorySpace".to_string())?;
            resolve("read_only_history")?
        }
        Err(message) => return Err(message),
    };
    let space = space_dto(&target, row.7, row.8, row.9);
    Ok((space, target))
}

fn revision_space_facts(
    connection: &rusqlite::Connection,
    space_id: &str,
) -> Result<(Option<String>, local_service::AssetLocatorDto), String> {
    connection
        .query_row(
            "SELECT scope_type, workspace_id, department_id, current_revision_id
             FROM memory_spaces WHERE id = ?1",
            [space_id],
            |row| {
                let scope_type: String = row.get(0)?;
                let workspace_id: Option<String> = row.get(1)?;
                let department_id: Option<String> = row.get(2)?;
                let (root_kind, relative_path) = match scope_type.as_str() {
                    "agent_long_term" => (
                        local_service::RootKind::Managed,
                        "memory/long-term.md".to_string(),
                    ),
                    "agent_workspace" => (
                        local_service::RootKind::Managed,
                        format!(
                            "workspaces/{}/memory.md",
                            workspace_id.as_deref().unwrap_or_default()
                        ),
                    ),
                    "workspace_shared" => (
                        local_service::RootKind::Workspace,
                        ".bandi/memory/public.md".to_string(),
                    ),
                    "department_workspace" => (
                        local_service::RootKind::Workspace,
                        format!(
                            ".bandi/memory/departments/{}.md",
                            department_id.as_deref().unwrap_or_default()
                        ),
                    ),
                    _ => return Err(rusqlite::Error::InvalidQuery),
                };
                if relative_path.contains("//") || relative_path.ends_with("/.md") {
                    return Err(rusqlite::Error::InvalidQuery);
                }
                Ok((
                    row.get(3)?,
                    local_service::AssetLocatorDto {
                        root_kind,
                        display_path: relative_path.clone(),
                        relative_path: Some(relative_path),
                    },
                ))
            },
        )
        .optional()
        .map_err(|_| "无法读取 MemorySpace".to_string())?
        .ok_or_else(|| "MemorySpace 不存在".to_string())
}

pub(crate) fn list_revisions_at(
    database: &Path,
    request: ListMemoryRevisionsRequest,
) -> Result<Vec<MemoryRevisionDto>, String> {
    validate_id(&request.request_id, "请求标识")?;
    validate_id(&request.space_id, "MemorySpace 标识")?;
    let connection = domain_store::open_at(database)?;
    let (current_revision_id, storage_locator) =
        revision_space_facts(&connection, &request.space_id)?;
    let mut statement = connection
        .prepare(
            "SELECT id, space_id, parent_revision_id, candidate_id, review_decision_id,
                    proposer_agent_id, reviewer_agent_id, source_content_hash, content_hash,
                    write_receipt_id, written_at
             FROM memory_revisions
             WHERE space_id = ?1
             ORDER BY written_at DESC, id DESC",
        )
        .map_err(|_| "无法读取 MemoryRevision 历史".to_string())?;
    let revisions = statement
        .query_map([&request.space_id], |row| {
            Ok(MemoryRevisionDto {
                id: row.get(0)?,
                space_id: row.get(1)?,
                parent_revision_id: row.get(2)?,
                candidate_id: row.get(3)?,
                review_decision_id: row.get(4)?,
                proposer_agent_id: row.get(5)?,
                reviewer_agent_id: row.get(6)?,
                source_content_hash: row.get(7)?,
                content_hash: row.get(8)?,
                storage_locator: storage_locator.clone(),
                write_receipt_id: row.get(9)?,
                written_at: row.get(10)?,
            })
        })
        .map_err(|_| "无法读取 MemoryRevision 历史".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "MemoryRevision 历史已损坏".to_string())?;
    drop(statement);

    let invalid_parent: Option<String> = connection
        .query_row(
            "SELECT child.id
             FROM memory_revisions child
             JOIN memory_revisions parent ON parent.id = child.parent_revision_id
             WHERE child.space_id = ?1 AND parent.space_id <> child.space_id
             LIMIT 1",
            [&request.space_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法校验 MemoryRevision 父版本".to_string())?;
    if invalid_parent.is_some() {
        return Err("MemoryRevision 父版本属于其他 MemorySpace".into());
    }
    if let Some(current_revision_id) = current_revision_id {
        let current_space_id = connection
            .query_row(
                "SELECT space_id FROM memory_revisions WHERE id = ?1",
                [&current_revision_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "无法校验 MemorySpace 当前版本".to_string())?
            .ok_or_else(|| "MemorySpace 当前版本不存在".to_string())?;
        if current_space_id != request.space_id {
            return Err("MemorySpace 当前版本属于其他 MemorySpace".into());
        }
    }
    Ok(revisions)
}

pub(crate) fn discover_eligible_spaces_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request: DiscoverEligibleMemorySpacesRequest,
) -> Result<EligibleMemorySpacesResult, String> {
    validate_id(&request.request_id, "请求标识")?;
    validate_id(&request.agent_id, "Agent 标识")?;
    let (targets, messages) =
        memory_target::discover_requested(database, agents_root, registry_root, &request.agent_id)?;
    let mut spaces = Vec::with_capacity(targets.len());
    let mut diagnostics = messages
        .into_iter()
        .map(|message| {
            local_service::diagnostic(
                "memory_space_ineligible",
                "warning",
                &message,
                None,
                Some("检查 WorkspaceBinding 与组织审核关系"),
            )
        })
        .collect::<Vec<_>>();
    for target in targets {
        match memory_target::read(&target) {
            Ok(content) => spaces.push(space_dto(
                &target,
                None,
                local_service::hash_bytes(content.as_bytes()),
                now(),
            )),
            Err(message) => diagnostics.push(local_service::diagnostic(
                "memory_space_read_failed",
                "warning",
                &format!("MemorySpace {}：{message}", target.space_id),
                None,
                Some("修复正式 Memory 路径后重新发现"),
            )),
        }
    }
    Ok(EligibleMemorySpacesResult {
        request_id: request.request_id,
        spaces,
        diagnostics,
    })
}

pub(crate) fn create_candidate_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request: CreateMemoryCandidateRequest,
) -> Result<MemoryReviewBundleDto, String> {
    for (value, label) in [
        (&request.request_id, "请求标识"),
        (&request.candidate_id, "候选标识"),
        (&request.space_id, "MemorySpace 标识"),
        (&request.proposer_agent_id, "提议者标识"),
    ] {
        validate_id(value, label)?;
    }
    if !matches!(request.source.kind.as_str(), "manual" | "import") {
        return Err("候选来源无效".into());
    }
    if request.summary.trim().is_empty() || request.summary.chars().count() > 16_384 {
        return Err("候选摘要无效".into());
    }
    if request.proposed_content.len() > MAX_MEMORY_BYTES || request.proposed_content.contains('\0')
    {
        return Err("候选内容无效或过大".into());
    }
    let target = memory_target::resolve_requested(
        database,
        agents_root,
        registry_root,
        &request.space_id,
        &request.proposer_agent_id,
    )?;
    if target.state != "active" {
        return Err("MemorySpace 仅保留历史，不允许创建新候选".into());
    }
    let current = memory_target::read(&target)?;
    let (_, baseline) = memory_facts(&target, &current);
    let timestamp = now();
    let proposed_hash = local_service::hash_bytes(request.proposed_content.as_bytes());
    let (agent_id, workspace_id, department_id, owner_kind, owner_agent_id) =
        match &target.scope_key {
            memory_target::ScopeKey::AgentLongTerm { agent_id } => (
                Some(agent_id.as_str()),
                None,
                None,
                "agent",
                Some(agent_id.as_str()),
            ),
            memory_target::ScopeKey::AgentWorkspace {
                agent_id,
                workspace_id,
            } => (
                Some(agent_id.as_str()),
                Some(workspace_id.as_str()),
                None,
                "agent",
                Some(agent_id.as_str()),
            ),
            memory_target::ScopeKey::WorkspaceShared { workspace_id } => {
                (None, Some(workspace_id.as_str()), None, "workspace", None)
            }
            memory_target::ScopeKey::DepartmentWorkspace {
                department_id,
                workspace_id,
            } => (
                None,
                Some(workspace_id.as_str()),
                Some(department_id.as_str()),
                "department_workspace",
                None,
            ),
        };
    let mut connection = domain_store::open_at(database)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始 MemoryCandidate 事务".to_string())?;
    transaction
        .execute(
            "INSERT INTO memory_spaces (
            id, scope_type, agent_id, workspace_id, department_id,
            owner_kind, owner_agent_id, steward_agent_id, reviewer_agent_id,
            review_policy, visibility_policy, storage_profile_version, state,
            current_revision_id, content_hash, updated_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
            'independent_reviewer', ?10, ?11, 'active', NULL, ?12, ?13
         )
         ON CONFLICT(id) DO UPDATE SET
            steward_agent_id = excluded.steward_agent_id,
            reviewer_agent_id = excluded.reviewer_agent_id,
            storage_profile_version = excluded.storage_profile_version,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at",
            params![
                target.space_id,
                target.scope_type,
                agent_id,
                workspace_id,
                department_id,
                owner_kind,
                owner_agent_id,
                target.steward_agent_id,
                target.reviewer_agent_id,
                target.visibility_policy,
                MEMORY_PROFILE_VERSION,
                baseline.asset_content_hash,
                timestamp,
            ],
        )
        .map_err(|error| format!("无法保存 MemorySpace：{error}"))?;
    transaction.execute("INSERT INTO memory_candidates (id, space_id, proposer_agent_id, reviewer_agent_id, source_kind, source_label, summary, proposed_content, proposed_content_hash, submitted_baseline_json, submitted_base_content, status, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending_review', 1, ?12, ?12)", params![request.candidate_id, target.space_id, request.proposer_agent_id, target.reviewer_agent_id, request.source.kind, request.source.label, request.summary, request.proposed_content, proposed_hash, serde_json::to_string(&baseline).map_err(|_| "无法序列化 Memory baseline".to_string())?, current, timestamp]).map_err(|_| "无法保存 MemoryCandidate".to_string())?;
    transaction
        .commit()
        .map_err(|_| "无法提交 MemoryCandidate".to_string())?;
    let candidate = load_candidate(&connection, &request.candidate_id)?;
    let space = space_dto(&target, None, baseline.asset_content_hash, timestamp);
    Ok(MemoryReviewBundleDto {
        request_id: request.request_id,
        space,
        candidate,
        current_content: current,
    })
}

pub(crate) fn list_reviews_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request_id: String,
    agent_id: String,
) -> Result<Vec<MemoryReviewBundleDto>, String> {
    validate_id(&request_id, "请求标识")?;
    validate_id(&agent_id, "Agent 标识")?;
    let connection = domain_store::open_at(database)?;
    let mut statement = connection
        .prepare(
            "SELECT id FROM memory_candidates
             WHERE proposer_agent_id = ?1 OR reviewer_agent_id = ?1
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|_| "无法读取正式 Memory 候选列表".to_string())?;
    let candidate_ids = statement
        .query_map([agent_id], |row| row.get::<_, String>(0))
        .map_err(|_| "无法读取正式 Memory 候选列表".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "无法读取正式 Memory 候选列表".to_string())?;
    drop(statement);
    drop(connection);
    candidate_ids
        .into_iter()
        .map(|candidate_id| {
            load_review_at(
                database,
                agents_root,
                registry_root,
                request_id.clone(),
                candidate_id,
            )
        })
        .collect()
}

pub(crate) fn load_review_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request_id: String,
    candidate_id: String,
) -> Result<MemoryReviewBundleDto, String> {
    validate_id(&request_id, "请求标识")?;
    validate_id(&candidate_id, "候选标识")?;
    let connection = domain_store::open_at(database)?;
    let candidate = load_candidate(&connection, &candidate_id)?;
    let (mut space, target) = load_space(
        database,
        agents_root,
        registry_root,
        &connection,
        &candidate.space_id,
    )?;
    let current = memory_target::read(&target)?;
    space.content_hash = local_service::hash_bytes(current.as_bytes());
    Ok(MemoryReviewBundleDto {
        request_id,
        space,
        candidate,
        current_content: current,
    })
}

fn issue(request_id: String, code: &str, message: &str) -> ReviewMemoryCandidateResult {
    ReviewMemoryCandidateResult::ValidationFailed {
        request_id,
        diagnostics: vec![local_service::diagnostic(
            code, "error", message, None, None,
        )],
    }
}

pub(crate) fn review_candidate_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request: ReviewMemoryCandidateRequest,
) -> Result<ReviewMemoryCandidateResult, String> {
    for (value, label) in [
        (&request.request_id, "请求标识"),
        (&request.candidate_id, "候选标识"),
    ] {
        validate_id(value, label)?;
    }
    if !matches!(
        request.decision.as_str(),
        "request_changes" | "reject" | "approve"
    ) {
        return Ok(issue(
            request.request_id,
            "memory_decision_invalid",
            "审核决定无效",
        ));
    }
    let mut connection = domain_store::open_at(database)?;
    let mut candidate = load_candidate(&connection, &request.candidate_id)?;
    if candidate.version != request.expected_candidate_version {
        return Ok(ReviewMemoryCandidateResult::CandidateChanged {
            request_id: request.request_id,
            candidate,
            diagnostics: vec![local_service::diagnostic(
                "memory_candidate_changed",
                "warning",
                "候选已发生变化，请重新载入",
                None,
                Some("重新打开审核窗口后重试"),
            )],
        });
    }
    let actor_agent_id = candidate.reviewer_agent_id.clone();
    if candidate.proposer_agent_id == actor_agent_id {
        return Ok(ReviewMemoryCandidateResult::SelfReviewForbidden {
            request_id: request.request_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_self_review_forbidden",
                "error",
                "提议者不能审核自己的候选",
                None,
                None,
            )],
        });
    }
    if candidate.reviewer_agent_id != actor_agent_id {
        return Ok(ReviewMemoryCandidateResult::ReviewerMismatch {
            request_id: request.request_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_reviewer_mismatch",
                "error",
                "当前操作人不是候选审核者",
                None,
                Some("由当前审核者处理或重新计算治理关系"),
            )],
        });
    }
    if !matches!(
        candidate.status.as_str(),
        "pending_review" | "approved_pending_write"
    ) {
        return Ok(issue(
            request.request_id,
            "memory_candidate_not_reviewable",
            "当前候选状态不可再次审核",
        ));
    }
    if candidate.status == "approved_pending_write" && request.decision != "approve" {
        return Ok(issue(
            request.request_id,
            "memory_candidate_already_approved",
            "候选已批准，只能重试尚未完成的正式写入",
        ));
    }
    let (space, target) = load_space(
        database,
        agents_root,
        registry_root,
        &connection,
        &candidate.space_id,
    )?;
    if space.state != "active" {
        return Ok(issue(
            request.request_id,
            "memory_space_read_only",
            "MemorySpace 仅保留历史，不允许继续审核写入",
        ));
    }
    if space.reviewer_agent_id != actor_agent_id {
        return Ok(ReviewMemoryCandidateResult::ReviewerMismatch {
            request_id: request.request_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_governance_changed",
                "error",
                "MemorySpace 审核关系已变化",
                None,
                Some("重新载入审核关系"),
            )],
        });
    }
    let current = memory_target::read(&target)?;
    let (_, actual_baseline) = memory_facts(&target, &current);
    if actual_baseline.asset_content_hash != request.expected_baseline.asset_content_hash
        || actual_baseline.asset_content_hash != candidate.submitted_baseline.asset_content_hash
    {
        let side = |content: String| {
            let hash = local_service::hash_bytes(content.as_bytes());
            local_service::ConfigSideDto {
                content,
                asset_content_hash: hash.clone(),
                container_content_hash: hash,
                redacted: false,
            }
        };
        return Ok(ReviewMemoryCandidateResult::BaselineChanged {
            request_id: request.request_id,
            candidate_id: candidate.id,
            base: side(candidate.submitted_base_content.clone()),
            current: side(current),
            proposed: side(candidate.proposed_content),
            diagnostics: vec![local_service::diagnostic(
                "memory_baseline_changed",
                "warning",
                "正式 Memory 已在审核期间变化",
                None,
                Some("基于当前内容重新提交候选"),
            )],
        });
    }
    let (decision_id, decision) = if candidate.status == "approved_pending_write" {
        let decision = connection
            .query_row("SELECT id, candidate_id, actor_agent_id, decision, comment, decided_at FROM memory_review_decisions WHERE candidate_id = ?1 AND decision = 'approve' ORDER BY rowid DESC LIMIT 1", [&candidate.id], |row| Ok(MemoryReviewDecisionDto { id: row.get(0)?, candidate_id: row.get(1)?, actor_agent_id: row.get(2)?, decision: row.get(3)?, comment: row.get(4)?, decided_at: row.get(5)? }))
            .optional().map_err(|_| "无法读取正式 Memory 批准决定".to_string())?.ok_or_else(|| "候选批准决定不存在".to_string())?;
        (decision.id.clone(), decision)
    } else {
        let decision_id = local_service::stable_id(
            "memory-decision",
            &format!(
                "{}:{}:{}:{}",
                candidate.id, actor_agent_id, request.decision, candidate.version
            ),
        );
        let decided_at = now();
        let decision = MemoryReviewDecisionDto {
            id: decision_id.clone(),
            candidate_id: candidate.id.clone(),
            actor_agent_id: actor_agent_id.clone(),
            decision: request.decision.clone(),
            comment: request.comment.clone(),
            decided_at: decided_at.clone(),
        };
        let next_status = match request.decision.as_str() {
            "request_changes" => "changes_requested",
            "reject" => "rejected",
            _ => "approved_pending_write",
        };
        let transaction = connection
            .transaction()
            .map_err(|_| "无法开始正式 Memory 审核事务".to_string())?;
        transaction.execute("INSERT INTO memory_review_decisions (id, candidate_id, actor_agent_id, decision, comment, decided_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![decision.id, decision.candidate_id, decision.actor_agent_id, decision.decision, decision.comment, decision.decided_at]).map_err(|_| "无法记录正式 Memory 审核决定".to_string())?;
        transaction.execute("UPDATE memory_candidates SET status = ?1, version = version + 1, updated_at = ?2 WHERE id = ?3 AND version = ?4", params![next_status, decided_at, candidate.id, candidate.version as i64]).map_err(|_| "无法更新 MemoryCandidate 状态".to_string())?;
        transaction
            .commit()
            .map_err(|_| "无法提交正式 Memory 审核决定".to_string())?;
        candidate = load_candidate(&connection, &request.candidate_id)?;
        (decision_id, decision)
    };
    if request.decision != "approve" {
        return Ok(ReviewMemoryCandidateResult::ReviewRecorded {
            request_id: request.request_id,
            candidate,
            decision,
        });
    }
    if let Err(message) =
        memory_target::ensure_safe_chain(&target.root, &target.relative_path, true).and_then(|_| {
            restricted_atomic_write(
                &target.target,
                candidate.proposed_content.as_bytes(),
                target.target.exists(),
                "正式 Memory",
            )
        })
    {
        return Ok(ReviewMemoryCandidateResult::SaveFailed {
            request_id: request.request_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_write_failed",
                "error",
                &message,
                None,
                Some("确认目标可写后重试"),
            )],
            retryable: true,
            file_state: "unchanged".into(),
        });
    }
    let verified =
        fs::read_to_string(&target.target).map_err(|_| "正式 Memory 写后无法重读".to_string())?;
    let written_hash = local_service::hash_bytes(verified.as_bytes());
    if written_hash != candidate.proposed_content_hash {
        return Ok(issue(
            request.request_id,
            "memory_write_not_verified",
            "正式 Memory 写后验证失败",
        ));
    }
    let written_at = now();
    let receipt_id =
        local_service::stable_id("memory-write", &format!("{}:{written_hash}", candidate.id));
    let receipt = local_service::WriteReceiptDto {
        id: receipt_id.clone(),
        container_id: candidate.space_id.clone(),
        previous_container_hash: actual_baseline.asset_content_hash.clone(),
        written_container_hash: written_hash.clone(),
        verified_at: written_at.clone(),
        atomic_replace: true,
    };
    let revision_id = local_service::stable_id(
        "memory-revision",
        &format!("{}:{written_hash}", candidate.id),
    );
    let revision = MemoryRevisionDto {
        id: revision_id.clone(),
        space_id: candidate.space_id.clone(),
        parent_revision_id: space.current_revision_id,
        candidate_id: candidate.id.clone(),
        review_decision_id: decision_id,
        proposer_agent_id: candidate.proposer_agent_id.clone(),
        reviewer_agent_id: candidate.reviewer_agent_id.clone(),
        source_content_hash: actual_baseline.asset_content_hash,
        content_hash: written_hash.clone(),
        storage_locator: space.storage_locator,
        write_receipt_id: receipt_id,
        written_at: written_at.clone(),
    };
    let recovery_payload = serde_json::to_string(&revision)
        .map_err(|_| "无法序列化 MemoryRevision 恢复数据".to_string())?;
    let receipt_payload =
        serde_json::to_string(&receipt).map_err(|_| "无法序列化 Memory 写入凭据".to_string())?;
    connection.execute("INSERT INTO memory_revision_recovery (recovery_ref, candidate_id, review_decision_id, revision_json, write_receipt_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![revision_id, candidate.id, decision.id, recovery_payload, receipt_payload, written_at])
        .map_err(|_| "无法记录 MemoryRevision 恢复数据".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始 MemoryRevision 事务".to_string())?;
    let recorded = transaction.execute("INSERT INTO memory_revisions (id, space_id, parent_revision_id, candidate_id, review_decision_id, proposer_agent_id, reviewer_agent_id, source_content_hash, content_hash, write_receipt_id, written_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)", params![revision.id, revision.space_id, revision.parent_revision_id, revision.candidate_id, revision.review_decision_id, revision.proposer_agent_id, revision.reviewer_agent_id, revision.source_content_hash, revision.content_hash, revision.write_receipt_id, revision.written_at])
        .and_then(|_| transaction.execute("UPDATE memory_spaces SET current_revision_id = ?1, content_hash = ?2, updated_at = ?3 WHERE id = ?4", params![revision_id, written_hash, written_at, candidate.space_id]))
        .and_then(|_| transaction.execute("UPDATE memory_candidates SET status = 'written', version = version + 1, updated_at = ?1 WHERE id = ?2", params![written_at, candidate.id]));
    let committed = match recorded {
        Ok(_) => transaction.commit().is_ok(),
        Err(_) => {
            let _ = transaction.rollback();
            false
        }
    };
    if !committed {
        let _ = connection.execute("UPDATE memory_candidates SET status = 'revision_pending', updated_at = ?1 WHERE id = ?2", params![written_at, candidate.id]);
        candidate = load_candidate(&connection, &request.candidate_id)?;
        return Ok(ReviewMemoryCandidateResult::RevisionPending {
            request_id: request.request_id,
            candidate,
            decision,
            write_receipt: receipt,
            recovery_ref: revision_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_revision_pending",
                "warning",
                "正式文件已写入，但 MemoryRevision 尚未完整记录",
                None,
                Some("使用补记操作恢复版本元数据，不要重复写入文件"),
            )],
        });
    }
    let _ = connection.execute(
        "DELETE FROM memory_revision_recovery WHERE recovery_ref = ?1",
        [&revision_id],
    );
    candidate = load_candidate(&connection, &request.candidate_id)?;
    Ok(ReviewMemoryCandidateResult::Saved {
        request_id: request.request_id,
        candidate,
        decision,
        revision,
        write_receipt: receipt,
    })
}

pub(crate) fn recover_revision_at(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    request: RecoverMemoryRevisionRequest,
) -> Result<ReviewMemoryCandidateResult, String> {
    for (value, label) in [
        (&request.request_id, "请求标识"),
        (&request.candidate_id, "候选标识"),
        (&request.recovery_ref, "恢复标识"),
    ] {
        validate_id(value, label)?;
    }
    let mut connection = domain_store::open_at(database)?;
    let candidate = load_candidate(&connection, &request.candidate_id)?;
    if candidate.status != "revision_pending" {
        return Ok(issue(
            request.request_id,
            "memory_revision_not_pending",
            "当前候选没有待补记的 MemoryRevision",
        ));
    }
    let (revision_json, receipt_json): (String, String) = connection
        .query_row(
            "SELECT revision_json, write_receipt_json FROM memory_revision_recovery WHERE recovery_ref = ?1 AND candidate_id = ?2",
            params![request.recovery_ref, request.candidate_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "无法读取 MemoryRevision 恢复数据".to_string())?
        .ok_or_else(|| "MemoryRevision 恢复数据不存在".to_string())?;
    let revision: MemoryRevisionDto = serde_json::from_str(&revision_json)
        .map_err(|_| "MemoryRevision 恢复数据损坏".to_string())?;
    let receipt: local_service::WriteReceiptDto =
        serde_json::from_str(&receipt_json).map_err(|_| "Memory 写入凭据损坏".to_string())?;
    if revision.id != request.recovery_ref || revision.candidate_id != candidate.id {
        return Err("MemoryRevision 恢复数据不匹配".into());
    }
    let (space, target) = load_space(
        database,
        agents_root,
        registry_root,
        &connection,
        &candidate.space_id,
    )?;
    let current = memory_target::read(&target)?;
    if local_service::hash_bytes(current.as_bytes()) != revision.content_hash {
        return Ok(ReviewMemoryCandidateResult::SaveFailed {
            request_id: request.request_id,
            diagnostics: vec![local_service::diagnostic(
                "memory_recovery_file_changed",
                "error",
                "正式 Memory 文件已在补记前发生变化",
                None,
                Some("停止补记并重新核对正式文件"),
            )],
            retryable: false,
            file_state: "write_not_verified".into(),
        });
    }
    let decision = connection
        .query_row("SELECT id, candidate_id, actor_agent_id, decision, comment, decided_at FROM memory_review_decisions WHERE id = ?1", [&revision.review_decision_id], |row| Ok(MemoryReviewDecisionDto { id: row.get(0)?, candidate_id: row.get(1)?, actor_agent_id: row.get(2)?, decision: row.get(3)?, comment: row.get(4)?, decided_at: row.get(5)? }))
        .optional().map_err(|_| "无法读取正式 Memory 审核决定".to_string())?.ok_or_else(|| "正式 Memory 审核决定不存在".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始 MemoryRevision 补记事务".to_string())?;
    transaction.execute("INSERT INTO memory_revisions (id, space_id, parent_revision_id, candidate_id, review_decision_id, proposer_agent_id, reviewer_agent_id, source_content_hash, content_hash, write_receipt_id, written_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)", params![revision.id, revision.space_id, revision.parent_revision_id, revision.candidate_id, revision.review_decision_id, revision.proposer_agent_id, revision.reviewer_agent_id, revision.source_content_hash, revision.content_hash, revision.write_receipt_id, revision.written_at]).map_err(|_| "无法补记 MemoryRevision".to_string())?;
    transaction.execute("UPDATE memory_spaces SET current_revision_id = ?1, content_hash = ?2, updated_at = ?3 WHERE id = ?4", params![revision.id, revision.content_hash, revision.written_at, revision.space_id]).map_err(|_| "无法更新 MemorySpace 正式版本".to_string())?;
    transaction.execute("UPDATE memory_candidates SET status = 'written', version = version + 1, updated_at = ?1 WHERE id = ?2", params![revision.written_at, candidate.id]).map_err(|_| "无法更新 MemoryCandidate 正式状态".to_string())?;
    transaction
        .execute(
            "DELETE FROM memory_revision_recovery WHERE recovery_ref = ?1",
            [&request.recovery_ref],
        )
        .map_err(|_| "无法清理 MemoryRevision 恢复数据".to_string())?;
    transaction
        .commit()
        .map_err(|_| "无法提交 MemoryRevision 补记事务".to_string())?;
    let candidate = load_candidate(&connection, &request.candidate_id)?;
    Ok(ReviewMemoryCandidateResult::Saved {
        request_id: request.request_id,
        candidate,
        decision,
        revision: MemoryRevisionDto {
            storage_locator: space.storage_locator,
            ..revision
        },
        write_receipt: receipt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry_root(database: &Path) -> std::path::PathBuf {
        database
            .parent()
            .expect("测试数据库必须有父目录")
            .join("workspaces")
    }

    fn create_candidate_at(
        database: &Path,
        agents_root: &Path,
        request: CreateMemoryCandidateRequest,
    ) -> Result<MemoryReviewBundleDto, String> {
        super::create_candidate_at(database, agents_root, &registry_root(database), request)
    }

    fn list_reviews_at(
        database: &Path,
        agents_root: &Path,
        request_id: String,
        agent_id: String,
    ) -> Result<Vec<MemoryReviewBundleDto>, String> {
        super::list_reviews_at(
            database,
            agents_root,
            &registry_root(database),
            request_id,
            agent_id,
        )
    }

    fn review_candidate_at(
        database: &Path,
        agents_root: &Path,
        request: ReviewMemoryCandidateRequest,
    ) -> Result<ReviewMemoryCandidateResult, String> {
        super::review_candidate_at(database, agents_root, &registry_root(database), request)
    }

    fn recover_revision_at(
        database: &Path,
        agents_root: &Path,
        request: RecoverMemoryRevisionRequest,
    ) -> Result<ReviewMemoryCandidateResult, String> {
        super::recover_revision_at(database, agents_root, &registry_root(database), request)
    }

    fn write_agent_record(package: &Path, agent_id: &str, manager_agent_id: &str) {
        fs::write(
            package.join(".bandi-agent.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": agent_id,
                "managerAgentId": manager_agent_id
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn write_department_agent_record(
        package: &Path,
        agent_id: &str,
        manager_agent_id: &str,
        department_id: &str,
    ) {
        fs::write(
            package.join(".bandi-agent.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": agent_id,
                "managerAgentId": manager_agent_id,
                "primaryDepartmentId": department_id
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn save_memory_organization(database: &Path, workspace_root: &Path) {
        domain_store::save_company_at(
            database,
            domain_store::SaveCompanyRequest {
                company: domain_store::CompanyDto {
                    id: "company".into(),
                    name: "公司".into(),
                    mission: "管理配置资产".into(),
                    boundary: "不参与任务执行".into(),
                    assistant_agent_id: Some("assistant".into()),
                    department_ids: Vec::new(),
                    workspace_ids: Vec::new(),
                    shared_asset_ids: Vec::new(),
                },
            },
        )
        .unwrap();
        for (id, manager) in [("dev", "dev-manager"), ("design", "design-manager")] {
            domain_store::save_department_at(
                database,
                domain_store::SaveDepartmentRequest {
                    department: domain_store::DepartmentDto {
                        id: id.into(),
                        name: id.into(),
                        company_id: "company".into(),
                        parent_department_id: None,
                        parent: None,
                        manager_agent_id: Some(manager.into()),
                        manager: None,
                        mission: "维护部门配置".into(),
                        members: 1,
                        responsibilities: vec!["维护配置".into()],
                        boundaries: vec!["不执行任务".into()],
                        delegation_depth: 1,
                        member_agent_ids: vec![manager.into()],
                        owned_sop_ids: Vec::new(),
                    },
                },
            )
            .unwrap();
        }
        domain_store::save_workspace_at(
            database,
            domain_store::SaveWorkspaceRequest {
                workspace: domain_store::WorkspaceDto {
                    id: "bandi".into(),
                    name: "Bandi".into(),
                    path: workspace_root.to_string_lossy().into_owned(),
                    company: Some("公司".into()),
                    department: Some("dev".into()),
                    company_id: Some("company".into()),
                    primary_department_id: Some("dev".into()),
                    project_lead_agent_id: Some("dev-manager".into()),
                    collaborator_department_ids: vec!["design".into()],
                    config: "已登记".into(),
                    health: "可用".into(),
                    agent_ids: vec!["worker".into()],
                    asset_ids: Vec::new(),
                    public_memory_space_id: "mem-ws-bandi".into(),
                    department_memory_space_ids: vec![
                        "mem-dev-bandi".into(),
                        "mem-design-bandi".into(),
                    ],
                    files: Vec::new(),
                    recent_edits: Vec::new(),
                },
            },
        )
        .unwrap();
    }

    fn write_workspace_binding(package: &Path) {
        let directory = package.join("workspaces/bandi");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("config.yaml"),
            "schemaVersion: 1\nworkspaceBinding: {\"workspaceId\":\"bandi\"}\n",
        )
        .unwrap();
    }

    fn revision_pending_fixture() -> (
        tempfile::TempDir,
        std::path::PathBuf,
        std::path::PathBuf,
        String,
        String,
    ) {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        fs::create_dir_all(package.join("memory")).unwrap();
        write_agent_record(&package, "worker", "manager");
        fs::write(package.join(MEMORY_RELATIVE_PATH), "old").unwrap();
        let database = root.path().join("bandi.db");
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-recovery".into(),
                candidate_id: "candidate-recovery".into(),
                space_id: "memory-agent-worker".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "恢复".into(),
                proposed_content: "new".into(),
            },
        )
        .unwrap();
        fs::write(package.join(MEMORY_RELATIVE_PATH), "new").unwrap();
        let written_hash = local_service::hash_bytes(b"new");
        let decision = MemoryReviewDecisionDto {
            id: "decision-recovery".into(),
            candidate_id: bundle.candidate.id.clone(),
            actor_agent_id: "manager".into(),
            decision: "approve".into(),
            comment: None,
            decided_at: now(),
        };
        let recovery_ref = "revision-recovery".to_string();
        let revision = MemoryRevisionDto {
            id: recovery_ref.clone(),
            space_id: bundle.space.id.clone(),
            parent_revision_id: None,
            candidate_id: bundle.candidate.id.clone(),
            review_decision_id: decision.id.clone(),
            proposer_agent_id: "worker".into(),
            reviewer_agent_id: "manager".into(),
            source_content_hash: bundle
                .candidate
                .submitted_baseline
                .asset_content_hash
                .clone(),
            content_hash: written_hash.clone(),
            storage_locator: bundle.space.storage_locator,
            write_receipt_id: "receipt-recovery".into(),
            written_at: now(),
        };
        let receipt = local_service::WriteReceiptDto {
            id: revision.write_receipt_id.clone(),
            container_id: bundle.space.id,
            previous_container_hash: bundle.candidate.submitted_baseline.asset_content_hash,
            written_container_hash: written_hash,
            verified_at: revision.written_at.clone(),
            atomic_replace: true,
        };
        let connection = domain_store::open_at(&database).unwrap();
        connection.execute("INSERT INTO memory_review_decisions (id, candidate_id, actor_agent_id, decision, comment, decided_at) VALUES (?1, ?2, ?3, 'approve', NULL, ?4)", params![decision.id, decision.candidate_id, decision.actor_agent_id, decision.decided_at]).unwrap();
        connection.execute("UPDATE memory_candidates SET status = 'revision_pending', version = 2 WHERE id = ?1", [&bundle.candidate.id]).unwrap();
        connection.execute("INSERT INTO memory_revision_recovery (recovery_ref, candidate_id, review_decision_id, revision_json, write_receipt_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![recovery_ref, bundle.candidate.id, decision.id, serde_json::to_string(&revision).unwrap(), serde_json::to_string(&receipt).unwrap(), revision.written_at]).unwrap();
        (root, database, agents, bundle.candidate.id, recovery_ref)
    }

    #[test]
    fn formal_memory_requires_independent_reviewer_and_writes_revision() {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        fs::create_dir_all(package.join("memory")).unwrap();
        write_agent_record(&package, "worker", "manager");
        fs::write(package.join(MEMORY_RELATIVE_PATH), "old").unwrap();
        let database = root.path().join("bandi.db");
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-1".into(),
                candidate_id: "candidate-1".into(),
                space_id: "memory-agent-worker".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新约定".into(),
                proposed_content: "new".into(),
            },
        )
        .unwrap();
        let result = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-1".into(),
                candidate_id: bundle.candidate.id,
                decision: "approve".into(),
                expected_candidate_version: 1,
                expected_baseline: bundle.candidate.submitted_baseline,
                comment: None,
            },
        )
        .unwrap();
        assert!(matches!(result, ReviewMemoryCandidateResult::Saved { .. }));
        assert_eq!(
            fs::read_to_string(package.join(MEMORY_RELATIVE_PATH)).unwrap(),
            "new"
        );
    }

    #[test]
    fn review_changes_and_reject_never_write_formal_memory() {
        for (candidate_id, review_id, decision, expected_status) in [
            (
                "candidate-changes",
                "review-changes",
                "request_changes",
                "changes_requested",
            ),
            ("candidate-reject", "review-reject", "reject", "rejected"),
        ] {
            let root = tempfile::tempdir().unwrap();
            let agents = root.path().join("agents");
            let package = agents.join("agt_worker");
            fs::create_dir_all(package.join("memory")).unwrap();
            write_agent_record(&package, "worker", "manager");
            fs::write(package.join(MEMORY_RELATIVE_PATH), "old").unwrap();
            let database = root.path().join("bandi.db");
            let bundle = create_candidate_at(
                &database,
                &agents,
                CreateMemoryCandidateRequest {
                    request_id: format!("create-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    space_id: "memory-agent-worker".into(),
                    proposer_agent_id: "worker".into(),
                    source: MemorySourceDto {
                        kind: "manual".into(),
                        label: "test".into(),
                    },
                    summary: "更新".into(),
                    proposed_content: "new".into(),
                },
            )
            .unwrap();
            let result = review_candidate_at(
                &database,
                &agents,
                ReviewMemoryCandidateRequest {
                    request_id: review_id.into(),
                    candidate_id: bundle.candidate.id,
                    decision: decision.into(),
                    expected_candidate_version: 1,
                    expected_baseline: bundle.candidate.submitted_baseline,
                    comment: None,
                },
            )
            .unwrap();
            match result {
                ReviewMemoryCandidateResult::ReviewRecorded { candidate, .. } => {
                    assert_eq!(candidate.status, expected_status)
                }
                _ => panic!("应只记录审核决定"),
            }
            assert_eq!(
                fs::read_to_string(package.join(MEMORY_RELATIVE_PATH)).unwrap(),
                "old"
            );
        }
    }

    #[test]
    fn self_review_and_changed_baseline_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        fs::create_dir_all(package.join("memory")).unwrap();
        write_agent_record(&package, "worker", "manager");
        fs::write(package.join(MEMORY_RELATIVE_PATH), "old").unwrap();
        let database = root.path().join("bandi.db");
        write_agent_record(&package, "worker", "worker");
        assert!(create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-self".into(),
                candidate_id: "candidate-self".into(),
                space_id: "memory-agent-worker".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into()
                },
                summary: "更新".into(),
                proposed_content: "new".into()
            }
        )
        .is_err());
        write_agent_record(&package, "worker", "manager");
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-2".into(),
                candidate_id: "candidate-2".into(),
                space_id: "memory-agent-worker".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新".into(),
                proposed_content: "new".into(),
            },
        )
        .unwrap();
        fs::write(package.join(MEMORY_RELATIVE_PATH), "external").unwrap();
        let result = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-2".into(),
                candidate_id: bundle.candidate.id,
                decision: "approve".into(),
                expected_candidate_version: 1,
                expected_baseline: bundle.candidate.submitted_baseline,
                comment: None,
            },
        )
        .unwrap();
        match result {
            ReviewMemoryCandidateResult::BaselineChanged { base, current, .. } => {
                assert_eq!(base.content, "old");
                assert_eq!(current.content, "external");
            }
            _ => panic!("应返回真实三方基线"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn approved_write_retry_reuses_original_decision() {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        fs::create_dir_all(package.join("memory")).unwrap();
        write_agent_record(&package, "worker", "manager");
        fs::write(package.join(MEMORY_RELATIVE_PATH), "old").unwrap();
        let database = root.path().join("bandi.db");
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-retry".into(),
                candidate_id: "candidate-retry".into(),
                space_id: "memory-agent-worker".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新".into(),
                proposed_content: "new".into(),
            },
        )
        .unwrap();
        let memory_directory = package.join("memory");
        let original_permissions = fs::metadata(&memory_directory).unwrap().permissions();
        let mut read_only_permissions = original_permissions.clone();
        std::os::unix::fs::PermissionsExt::set_mode(&mut read_only_permissions, 0o555);
        fs::set_permissions(&memory_directory, read_only_permissions).unwrap();

        let first = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-retry-1".into(),
                candidate_id: bundle.candidate.id.clone(),
                decision: "approve".into(),
                expected_candidate_version: 1,
                expected_baseline: bundle.candidate.submitted_baseline.clone(),
                comment: None,
            },
        )
        .unwrap();
        assert!(matches!(
            first,
            ReviewMemoryCandidateResult::SaveFailed { .. }
        ));
        let connection = domain_store::open_at(&database).unwrap();
        let candidate = load_candidate(&connection, &bundle.candidate.id).unwrap();
        assert_eq!(candidate.status, "approved_pending_write");
        assert_eq!(candidate.version, 2);
        drop(connection);

        fs::set_permissions(&memory_directory, original_permissions).unwrap();
        let second = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-retry-2".into(),
                candidate_id: bundle.candidate.id.clone(),
                decision: "approve".into(),
                expected_candidate_version: 2,
                expected_baseline: bundle.candidate.submitted_baseline,
                comment: None,
            },
        )
        .unwrap();
        assert!(matches!(second, ReviewMemoryCandidateResult::Saved { .. }));
        let connection = domain_store::open_at(&database).unwrap();
        let decisions: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM memory_review_decisions WHERE candidate_id = ?1",
                [&bundle.candidate.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(decisions, 1);
    }

    #[test]
    fn revision_recovery_records_metadata_without_rewriting_file() {
        let (_root, database, agents, candidate_id, recovery_ref) = revision_pending_fixture();
        let result = recover_revision_at(
            &database,
            &agents,
            RecoverMemoryRevisionRequest {
                request_id: "recover-1".into(),
                candidate_id: candidate_id.clone(),
                recovery_ref: recovery_ref.clone(),
            },
        )
        .unwrap();
        assert!(matches!(result, ReviewMemoryCandidateResult::Saved { .. }));
        assert_eq!(
            fs::read_to_string(agents.join("agt_worker").join(MEMORY_RELATIVE_PATH)).unwrap(),
            "new"
        );
        let connection = domain_store::open_at(&database).unwrap();
        let revision_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM memory_revisions WHERE id = ?1",
                [&recovery_ref],
                |row| row.get(0),
            )
            .unwrap();
        let recovery_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM memory_revision_recovery WHERE recovery_ref = ?1",
                [&recovery_ref],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_count, 1);
        assert_eq!(recovery_count, 0);
        assert_eq!(
            load_candidate(&connection, &candidate_id).unwrap().status,
            "written"
        );
    }

    #[test]
    fn revision_recovery_stops_when_formal_file_changed() {
        let (_root, database, agents, candidate_id, recovery_ref) = revision_pending_fixture();
        fs::write(
            agents.join("agt_worker").join(MEMORY_RELATIVE_PATH),
            "external",
        )
        .unwrap();
        let result = recover_revision_at(
            &database,
            &agents,
            RecoverMemoryRevisionRequest {
                request_id: "recover-changed".into(),
                candidate_id: candidate_id.clone(),
                recovery_ref: recovery_ref.clone(),
            },
        )
        .unwrap();
        assert!(matches!(
            result,
            ReviewMemoryCandidateResult::SaveFailed {
                retryable: false,
                ..
            }
        ));
        let connection = domain_store::open_at(&database).unwrap();
        assert_eq!(
            load_candidate(&connection, &candidate_id).unwrap().status,
            "revision_pending"
        );
        let recovery_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM memory_revision_recovery WHERE recovery_ref = ?1",
                [&recovery_ref],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(recovery_count, 1);
    }

    #[test]
    fn revision_recovery_rejects_corrupt_payload() {
        let (_root, database, agents, candidate_id, recovery_ref) = revision_pending_fixture();
        let connection = domain_store::open_at(&database).unwrap();
        connection
            .execute(
                "UPDATE memory_revision_recovery SET revision_json = '{' WHERE recovery_ref = ?1",
                [&recovery_ref],
            )
            .unwrap();
        drop(connection);
        let error = recover_revision_at(
            &database,
            &agents,
            RecoverMemoryRevisionRequest {
                request_id: "recover-corrupt".into(),
                candidate_id,
                recovery_ref,
            },
        )
        .unwrap_err();
        assert_eq!(error, "MemoryRevision 恢复数据损坏");
    }

    #[test]
    fn review_list_is_agent_scoped_newest_first_and_survives_reopen() {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        for agent_id in ["worker", "other"] {
            let package = agents.join(format!("agt_{agent_id}"));
            fs::create_dir_all(package.join("memory")).unwrap();
            let reviewer_id = if agent_id == "worker" {
                "manager"
            } else {
                "other-manager"
            };
            write_agent_record(&package, agent_id, reviewer_id);
            fs::write(
                package.join(MEMORY_RELATIVE_PATH),
                format!("{agent_id}-old"),
            )
            .unwrap();
        }
        let database = root.path().join("bandi.db");

        let empty =
            list_reviews_at(&database, &agents, "list-empty".into(), "worker".into()).unwrap();
        assert!(empty.is_empty());

        for (candidate_id, agent_id, reviewer_id) in [
            ("candidate-old", "worker", "manager"),
            ("candidate-new", "worker", "manager"),
            ("candidate-other", "other", "other-manager"),
        ] {
            let bundle = create_candidate_at(
                &database,
                &agents,
                CreateMemoryCandidateRequest {
                    request_id: format!("create-{candidate_id}"),
                    candidate_id: candidate_id.into(),
                    space_id: format!("memory-agent-{agent_id}"),
                    proposer_agent_id: agent_id.into(),
                    source: MemorySourceDto {
                        kind: "manual".into(),
                        label: "test".into(),
                    },
                    summary: candidate_id.into(),
                    proposed_content: format!("{candidate_id}-content"),
                },
            )
            .unwrap();
            assert_eq!(bundle.space.reviewer_agent_id, reviewer_id);
        }
        let connection = domain_store::open_at(&database).unwrap();
        connection
            .execute(
                "UPDATE memory_candidates SET created_at = '2026-01-01T00:00:00Z' WHERE id = 'candidate-old'",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE memory_candidates SET created_at = '2026-01-02T00:00:00Z' WHERE id = 'candidate-new'",
                [],
            )
            .unwrap();
        drop(connection);

        let reviews =
            list_reviews_at(&database, &agents, "list-reopened".into(), "worker".into()).unwrap();
        assert_eq!(
            reviews
                .iter()
                .map(|bundle| bundle.candidate.id.as_str())
                .collect::<Vec<_>>(),
            vec!["candidate-new", "candidate-old"]
        );
        assert!(reviews.iter().all(|bundle| {
            bundle.request_id == "list-reopened"
                && matches!(&bundle.space.scope_key, MemoryScopeKeyDto::AgentLongTerm { agent_id } if agent_id == "worker")
                && bundle.current_content == "worker-old"
        }));
    }

    #[test]
    fn revision_recovery_rejects_missing_payload() {
        let (_root, database, agents, candidate_id, recovery_ref) = revision_pending_fixture();
        let connection = domain_store::open_at(&database).unwrap();
        connection
            .execute(
                "DELETE FROM memory_revision_recovery WHERE recovery_ref = ?1",
                [&recovery_ref],
            )
            .unwrap();
        drop(connection);

        let error = recover_revision_at(
            &database,
            &agents,
            RecoverMemoryRevisionRequest {
                request_id: "recover-missing".into(),
                candidate_id,
                recovery_ref,
            },
        )
        .unwrap_err();
        assert_eq!(error, "MemoryRevision 恢复数据不存在");
    }

    #[test]
    fn revision_history_is_scoped_newest_first_and_survives_reopen() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let connection = domain_store::open_at(&database).unwrap();
        for (space_id, agent_id) in [
            ("memory-agent-worker", "worker"),
            ("memory-agent-other", "other"),
        ] {
            connection.execute("INSERT INTO memory_spaces (id, scope_type, agent_id, owner_kind, owner_agent_id, steward_agent_id, reviewer_agent_id, review_policy, visibility_policy, storage_profile_version, state, current_revision_id, content_hash, updated_at) VALUES (?1, 'agent_long_term', ?2, 'agent', ?2, ?2, 'manager', 'independent_reviewer', 'agent_private', 'memory-v1', 'active', NULL, 'sha256:empty', '2026-01-01T00:00:00Z')", params![space_id, agent_id]).unwrap();
        }
        for (candidate_id, space_id, written_at) in [
            (
                "candidate-old",
                "memory-agent-worker",
                "2026-01-01T00:00:00Z",
            ),
            (
                "candidate-new",
                "memory-agent-worker",
                "2026-01-02T00:00:00Z",
            ),
            (
                "candidate-other",
                "memory-agent-other",
                "2026-01-03T00:00:00Z",
            ),
        ] {
            let revision_id = candidate_id.replace("candidate", "revision");
            let decision_id = candidate_id.replace("candidate", "decision");
            connection.execute("INSERT INTO memory_candidates (id, space_id, proposer_agent_id, reviewer_agent_id, source_kind, source_label, summary, proposed_content, proposed_content_hash, submitted_baseline_json, submitted_base_content, status, version, created_at, updated_at) VALUES (?1, ?2, 'worker', 'manager', 'manual', 'test', 'summary', 'content', 'sha256:content', '{}', '', 'written', 2, ?3, ?3)", params![candidate_id, space_id, written_at]).unwrap();
            connection.execute("INSERT INTO memory_review_decisions (id, candidate_id, actor_agent_id, decision, comment, decided_at) VALUES (?1, ?2, 'manager', 'approve', NULL, ?3)", params![decision_id, candidate_id, written_at]).unwrap();
            connection.execute("INSERT INTO memory_revisions (id, space_id, parent_revision_id, candidate_id, review_decision_id, proposer_agent_id, reviewer_agent_id, source_content_hash, content_hash, write_receipt_id, written_at) VALUES (?1, ?2, NULL, ?3, ?4, 'worker', 'manager', 'sha256:source', 'sha256:content', ?5, ?6)", params![revision_id, space_id, candidate_id, decision_id, format!("receipt-{candidate_id}"), written_at]).unwrap();
        }
        connection.execute("UPDATE memory_spaces SET current_revision_id = 'revision-new' WHERE id = 'memory-agent-worker'", []).unwrap();
        drop(connection);

        let revisions = list_revisions_at(
            &database,
            ListMemoryRevisionsRequest {
                request_id: "list-revisions".into(),
                space_id: "memory-agent-worker".into(),
            },
        )
        .unwrap();
        assert_eq!(
            revisions
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["revision-new", "revision-old"]
        );
        assert!(revisions
            .iter()
            .all(|item| item.space_id == "memory-agent-worker"));
    }

    #[test]
    fn revision_history_supports_empty_space() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let connection = domain_store::open_at(&database).unwrap();
        connection.execute("INSERT INTO memory_spaces (id, scope_type, agent_id, owner_kind, owner_agent_id, steward_agent_id, reviewer_agent_id, review_policy, visibility_policy, storage_profile_version, state, current_revision_id, content_hash, updated_at) VALUES ('memory-agent-worker', 'agent_long_term', 'worker', 'agent', 'worker', 'worker', 'manager', 'independent_reviewer', 'agent_private', 'memory-v1', 'active', NULL, 'sha256:empty', '2026-01-01T00:00:00Z')", []).unwrap();
        drop(connection);
        assert!(list_revisions_at(
            &database,
            ListMemoryRevisionsRequest {
                request_id: "list-empty".into(),
                space_id: "memory-agent-worker".into(),
            },
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    fn revision_history_rejects_cross_space_parent_and_current_revision() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let connection = domain_store::open_at(&database).unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = OFF;")
            .unwrap();
        for (space_id, agent_id) in [
            ("memory-agent-worker", "worker"),
            ("memory-agent-other", "other"),
        ] {
            connection.execute("INSERT INTO memory_spaces (id, scope_type, agent_id, owner_kind, owner_agent_id, steward_agent_id, reviewer_agent_id, review_policy, visibility_policy, storage_profile_version, state, current_revision_id, content_hash, updated_at) VALUES (?1, 'agent_long_term', ?2, 'agent', ?2, ?2, 'manager', 'independent_reviewer', 'agent_private', 'memory-v1', 'active', NULL, 'sha256:empty', '2026-01-01T00:00:00Z')", params![space_id, agent_id]).unwrap();
        }
        for (id, space_id) in [
            ("revision-worker", "memory-agent-worker"),
            ("revision-other", "memory-agent-other"),
        ] {
            connection.execute("INSERT INTO memory_revisions (id, space_id, parent_revision_id, candidate_id, review_decision_id, proposer_agent_id, reviewer_agent_id, source_content_hash, content_hash, write_receipt_id, written_at) VALUES (?1, ?2, NULL, ?3, ?4, 'worker', 'manager', 'sha256:source', 'sha256:content', ?5, '2026-01-01T00:00:00Z')", params![id, space_id, format!("candidate-{id}"), format!("decision-{id}"), format!("receipt-{id}")]).unwrap();
        }
        connection.execute("UPDATE memory_revisions SET parent_revision_id = 'revision-other' WHERE id = 'revision-worker'", []).unwrap();
        drop(connection);
        let request = || ListMemoryRevisionsRequest {
            request_id: "list-corrupt".into(),
            space_id: "memory-agent-worker".into(),
        };
        assert_eq!(
            list_revisions_at(&database, request()).unwrap_err(),
            "MemoryRevision 父版本属于其他 MemorySpace"
        );

        let connection = domain_store::open_at(&database).unwrap();
        connection.execute("UPDATE memory_revisions SET parent_revision_id = NULL WHERE id = 'revision-worker'", []).unwrap();
        connection.execute("UPDATE memory_spaces SET current_revision_id = 'revision-other' WHERE id = 'memory-agent-worker'", []).unwrap();
        drop(connection);
        assert_eq!(
            list_revisions_at(&database, request()).unwrap_err(),
            "MemorySpace 当前版本属于其他 MemorySpace"
        );
    }

    #[test]
    fn eligible_discovery_derives_four_spaces_without_creating_candidates() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        let workspace_root = root.path().join("workspace");
        fs::create_dir_all(package.join("memory")).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();
        write_department_agent_record(&package, "worker", "manager", "dev");
        write_workspace_binding(&package);
        save_memory_organization(&database, &workspace_root);

        let result = discover_eligible_spaces_at(
            &database,
            &agents,
            &registry_root(&database),
            DiscoverEligibleMemorySpacesRequest {
                request_id: "discover-worker".into(),
                agent_id: "worker".into(),
            },
        )
        .unwrap();

        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result
                .spaces
                .iter()
                .map(|space| (space.id.as_str(), space.reviewer_agent_id.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("memory-agent-worker", "manager"),
                ("mem-agent-ws-worker-bandi", "manager"),
                ("mem-ws-bandi", "dev-manager"),
                ("mem-dev-bandi", "dev-manager"),
            ]
        );
        let connection = domain_store::open_at(&database).unwrap();
        let candidates: i64 = connection
            .query_row("SELECT COUNT(*) FROM memory_candidates", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(candidates, 0);
    }

    #[test]
    fn eligible_discovery_reports_missing_independent_reviewer() {
        let root = tempfile::tempdir().unwrap();
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        fs::create_dir_all(package.join("memory")).unwrap();
        fs::write(
            package.join(".bandi-agent.json"),
            serde_json::to_vec(&serde_json::json!({ "id": "worker" })).unwrap(),
        )
        .unwrap();

        let result = discover_eligible_spaces_at(
            &root.path().join("bandi.db"),
            &agents,
            &root.path().join("workspaces"),
            DiscoverEligibleMemorySpacesRequest {
                request_id: "discover-no-reviewer".into(),
                agent_id: "worker".into(),
            },
        )
        .unwrap();

        assert!(result.spaces.is_empty());
        assert_eq!(result.diagnostics.len(), 1);
        assert!(result.diagnostics[0].message.contains("无法确定独立审核者"));
    }

    #[test]
    fn four_memory_scopes_create_candidates_with_canonical_targets() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        let workspace_root = root.path().join("workspace");
        fs::create_dir_all(package.join("memory")).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();
        write_department_agent_record(&package, "worker", "manager", "dev");
        write_workspace_binding(&package);
        save_memory_organization(&database, &workspace_root);

        for (index, space_id) in [
            "memory-agent-worker",
            "mem-agent-ws-worker-bandi",
            "mem-ws-bandi",
            "mem-dev-bandi",
        ]
        .into_iter()
        .enumerate()
        {
            let bundle = create_candidate_at(
                &database,
                &agents,
                CreateMemoryCandidateRequest {
                    request_id: format!("create-scope-{index}"),
                    candidate_id: format!("candidate-scope-{index}"),
                    space_id: space_id.into(),
                    proposer_agent_id: "worker".into(),
                    source: MemorySourceDto {
                        kind: "manual".into(),
                        label: "test".into(),
                    },
                    summary: "更新".into(),
                    proposed_content: format!("content-{index}"),
                },
            )
            .unwrap();
            assert_eq!(bundle.space.id, space_id);
            assert_eq!(bundle.space.state, "active");
        }

        let snapshot = domain_store::load_snapshot_at(&database).unwrap();
        assert_eq!(snapshot.workspaces.len(), 1);
        let connection = domain_store::open_at(&database).unwrap();
        let scopes = connection
            .prepare("SELECT scope_type FROM memory_spaces ORDER BY scope_type")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            scopes,
            vec![
                "agent_long_term",
                "agent_workspace",
                "department_workspace",
                "workspace_shared",
            ]
        );
    }

    #[test]
    fn workspace_memory_approval_writes_to_canonical_workspace_root() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        let workspace_root = root.path().join("workspace");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();
        write_department_agent_record(&package, "worker", "manager", "dev");
        write_workspace_binding(&package);
        save_memory_organization(&database, &workspace_root);
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-workspace-shared".into(),
                candidate_id: "candidate-workspace-shared".into(),
                space_id: "mem-ws-bandi".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新公共记忆".into(),
                proposed_content: "workspace memory".into(),
            },
        )
        .unwrap();
        let result = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-workspace-shared".into(),
                candidate_id: bundle.candidate.id,
                decision: "approve".into(),
                expected_candidate_version: 1,
                expected_baseline: bundle.candidate.submitted_baseline,
                comment: None,
            },
        )
        .unwrap();
        assert!(matches!(result, ReviewMemoryCandidateResult::Saved { .. }));
        assert_eq!(
            fs::read_to_string(workspace_root.join(".bandi/memory/public.md")).unwrap(),
            "workspace memory"
        );
    }

    #[cfg(unix)]
    #[test]
    fn memory_write_rejects_symlinked_intermediate_directory() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        let workspace_root = root.path().join("workspace");
        let outside = root.path().join("outside");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        write_department_agent_record(&package, "worker", "manager", "dev");
        write_workspace_binding(&package);
        save_memory_organization(&database, &workspace_root);
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-symlink".into(),
                candidate_id: "candidate-symlink".into(),
                space_id: "mem-ws-bandi".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新公共记忆".into(),
                proposed_content: "unsafe".into(),
            },
        )
        .unwrap();
        symlink(&outside, workspace_root.join(".bandi")).unwrap();
        let error = review_candidate_at(
            &database,
            &agents,
            ReviewMemoryCandidateRequest {
                request_id: "review-symlink".into(),
                candidate_id: bundle.candidate.id,
                decision: "approve".into(),
                expected_candidate_version: 1,
                expected_baseline: bundle.candidate.submitted_baseline,
                comment: None,
            },
        )
        .unwrap_err();
        assert_eq!(error, "正式 Memory 路径包含符号链接或非目录分量");
        assert!(!outside.join("memory/public.md").exists());
    }

    #[test]
    fn department_memory_becomes_read_only_when_relationship_is_removed() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let package = agents.join("agt_worker");
        let workspace_root = root.path().join("workspace");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(&workspace_root).unwrap();
        write_department_agent_record(&package, "worker", "manager", "design");
        write_workspace_binding(&package);
        save_memory_organization(&database, &workspace_root);
        let bundle = create_candidate_at(
            &database,
            &agents,
            CreateMemoryCandidateRequest {
                request_id: "create-design".into(),
                candidate_id: "candidate-design".into(),
                space_id: "mem-design-bandi".into(),
                proposer_agent_id: "worker".into(),
                source: MemorySourceDto {
                    kind: "manual".into(),
                    label: "test".into(),
                },
                summary: "更新".into(),
                proposed_content: "new".into(),
            },
        )
        .unwrap();
        let mut workspace = domain_store::load_snapshot_at(&database)
            .unwrap()
            .workspaces
            .remove(0);
        workspace.collaborator_department_ids.clear();
        workspace.department_memory_space_ids = vec!["mem-dev-bandi".into()];
        domain_store::save_workspace_at(
            &database,
            domain_store::SaveWorkspaceRequest { workspace },
        )
        .unwrap();

        let loaded = super::load_review_at(
            &database,
            &agents,
            &registry_root(&database),
            "load-design".into(),
            bundle.candidate.id,
        )
        .unwrap();
        assert_eq!(loaded.space.state, "read_only_history");
        let connection = domain_store::open_at(&database).unwrap();
        let state: String = connection
            .query_row(
                "SELECT state FROM memory_spaces WHERE id = 'mem-design-bandi'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(state, "read_only_history");
    }

    #[test]
    fn shared_memory_fixture_round_trips() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../packages/contracts/fixtures/memory-review.valid.json"
        ))
        .unwrap();
        let space: MemorySpaceDto = serde_json::from_value(fixture["space"].clone()).unwrap();
        let candidate: MemoryCandidateDto =
            serde_json::from_value(fixture["candidate"].clone()).unwrap();
        let request: ReviewMemoryCandidateRequest =
            serde_json::from_value(fixture["reviewRequest"].clone()).unwrap();
        assert_eq!(space.scope_type, "agent_long_term");
        assert_eq!(candidate.space_id, space.id);
        assert_eq!(request.decision, "approve");
    }
}
