use std::{fs, path::Path};

use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain_store;

const AGENT_RECOVERY_PAYLOAD_LIMIT: usize = 25 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RegisterExternalAgentRequest {
    pub(crate) agent_id: String,
    pub(crate) selected_root: String,
    pub(crate) metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RemoveExternalAgentRequest {
    pub(crate) agent_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalAgentReferenceDto {
    pub(crate) agent_id: String,
    pub(crate) canonical_root: String,
    pub(crate) metadata: Value,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct AgentRecoveryOperation {
    pub(crate) id: String,
    pub(crate) request_id: String,
    pub(crate) agent_id: String,
    pub(crate) operation_kind: String,
    pub(crate) status: String,
    pub(crate) expected_manifest_hash: String,
    pub(crate) fixed_revision_id: Option<String>,
    pub(crate) payload: Value,
    pub(crate) created_at: String,
    pub(crate) completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRecoverySummaryDto {
    pub(crate) id: String,
    pub(crate) agent_id: String,
    pub(crate) operation_kind: String,
    pub(crate) status: String,
    pub(crate) created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) completed_at: Option<String>,
}

impl From<&AgentRecoveryOperation> for AgentRecoverySummaryDto {
    fn from(operation: &AgentRecoveryOperation) -> Self {
        Self {
            id: operation.id.clone(),
            agent_id: operation.agent_id.clone(),
            operation_kind: operation.operation_kind.clone(),
            status: operation.status.clone(),
            created_at: operation.created_at.clone(),
            completed_at: operation.completed_at.clone(),
        }
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

pub(crate) fn validate_agent_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    let length = trimmed.chars().count();
    if name != trimmed || !(2..=40).contains(&length) {
        return Err("Agent 名称必须去除首尾空白，且为 2 到 40 个字符".into());
    }
    let uuid = trimmed
        .strip_prefix("agent-")
        .or_else(|| trimmed.strip_prefix("agent_"))
        .unwrap_or(trimmed);
    let parts = uuid.split('-').collect::<Vec<_>>();
    if parts.len() == 5
        && [8, 4, 4, 4, 12]
            .iter()
            .zip(parts.iter())
            .all(|(length, part)| {
                part.len() == *length && part.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
    {
        return Err("Agent 名称不能使用 UUID 或系统生成的 Agent ID".into());
    }
    if trimmed.chars().all(char::is_numeric) {
        return Err("Agent 名称不能全部是数字".into());
    }
    if !trimmed.chars().any(char::is_alphabetic) {
        return Err("Agent 名称至少应包含一个中文或英文字母".into());
    }
    Ok(())
}

fn validate_metadata(agent_id: &str, metadata: &Value) -> Result<(), String> {
    let object = metadata
        .as_object()
        .ok_or_else(|| "外部 Agent metadata 必须是对象".to_string())?;
    if object.get("id").and_then(Value::as_str) != Some(agent_id) {
        return Err("外部 Agent metadata 的稳定 ID 与请求不一致".into());
    }
    let name = object
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "外部 Agent metadata 缺少有效名称".to_string())?;
    validate_agent_name(name)?;
    if serde_json::to_vec(metadata)
        .map_err(|_| "外部 Agent metadata 无法序列化".to_string())?
        .len()
        > 1024 * 1024
    {
        return Err("外部 Agent metadata 超过 1 MiB".into());
    }
    Ok(())
}

pub(crate) fn register_external_agent_at(
    database: &Path,
    request: RegisterExternalAgentRequest,
) -> Result<ExternalAgentReferenceDto, String> {
    if !valid_id(&request.agent_id) || !Path::new(&request.selected_root).is_absolute() {
        return Err("外部 Agent 标识或目录无效".into());
    }
    validate_metadata(&request.agent_id, &request.metadata)?;
    let root = Path::new(&request.selected_root);
    let metadata =
        fs::symlink_metadata(root).map_err(|_| "外部 Agent 目录不存在或不可访问".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("外部 Agent 根必须是普通目录且不能是符号链接".into());
    }
    let canonical_root = fs::canonicalize(root)
        .map_err(|_| "外部 Agent 目录无法规范化".to_string())?
        .to_string_lossy()
        .into_owned();
    let encoded = serde_json::to_string(&request.metadata)
        .map_err(|_| "外部 Agent metadata 无法序列化".to_string())?;
    let mut connection = domain_store::open_at(database)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始外部 Agent 登记事务".to_string())?;
    let created_at = transaction
        .query_row(
            "SELECT created_at FROM external_agent_references WHERE agent_id = ?1",
            [&request.agent_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "无法读取外部 Agent 引用".to_string())?
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let updated_at = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO external_agent_references (agent_id, canonical_root, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(agent_id) DO UPDATE SET canonical_root=excluded.canonical_root, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at",
            params![request.agent_id, canonical_root, encoded, created_at, updated_at],
        )
        .map_err(|error| if error.to_string().contains("canonical_root") { "该外部目录已由其他 Agent 登记".to_string() } else { "无法登记外部 Agent 引用".to_string() })?;
    transaction
        .commit()
        .map_err(|_| "无法提交外部 Agent 登记事务".to_string())?;
    Ok(ExternalAgentReferenceDto {
        agent_id: request.agent_id,
        canonical_root,
        metadata: request.metadata,
        created_at,
        updated_at,
    })
}

pub(crate) fn list_external_agents_at(
    database: &Path,
) -> Result<Vec<ExternalAgentReferenceDto>, String> {
    let connection = domain_store::open_at(database)?;
    let mut statement = connection.prepare("SELECT agent_id, canonical_root, metadata_json, created_at, updated_at FROM external_agent_references ORDER BY agent_id").map_err(|_| "无法读取外部 Agent 引用".to_string())?;
    let rows = statement
        .query_map([], |row| {
            let encoded: String = row.get(2)?;
            let metadata = serde_json::from_str(&encoded).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    encoded.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(ExternalAgentReferenceDto {
                agent_id: row.get(0)?,
                canonical_root: row.get(1)?,
                metadata,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|_| "无法查询外部 Agent 引用".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "外部 Agent 引用记录损坏".to_string())
}

pub(crate) fn remove_external_agent_at(
    database: &Path,
    request: RemoveExternalAgentRequest,
) -> Result<(), String> {
    if !valid_id(&request.agent_id) {
        return Err("外部 Agent 标识无效".into());
    }
    let connection = domain_store::open_at(database)?;
    if connection
        .execute(
            "DELETE FROM external_agent_references WHERE agent_id = ?1",
            [&request.agent_id],
        )
        .map_err(|_| "无法移除外部 Agent 引用".to_string())?
        == 0
    {
        return Err("外部 Agent 引用不存在".into());
    }
    Ok(())
}

pub(crate) fn prepare_operation_at(
    database: &Path,
    request_id: &str,
    agent_id: &str,
    operation_kind: &str,
    expected_manifest_hash: &str,
    fixed_revision_id: Option<&str>,
    payload: &Value,
) -> Result<AgentRecoveryOperation, String> {
    if !valid_id(request_id)
        || !valid_id(agent_id)
        || !matches!(operation_kind, "create" | "identity_update" | "delete")
        || !expected_manifest_hash.starts_with("sha256:")
        || fixed_revision_id.is_some_and(|id| !valid_id(id))
    {
        return Err("Agent commit operation 无效".into());
    }
    let encoded = serde_json::to_string(payload)
        .map_err(|_| "Agent commit payload 无法序列化".to_string())?;
    if encoded.len() > AGENT_RECOVERY_PAYLOAD_LIMIT {
        return Err("Agent commit payload 超过 25 MiB".into());
    }
    let connection = domain_store::open_at(database)?;
    if let Some(existing) = load_operation_by_request(&connection, request_id)? {
        if existing.status == "completed" {
            return Ok(existing);
        }
        if existing.agent_id != agent_id
            || existing.operation_kind != operation_kind
            || existing.expected_manifest_hash != expected_manifest_hash
            || existing.fixed_revision_id.as_deref() != fixed_revision_id
            || existing.payload != *payload
        {
            return Err("同一 requestId 已绑定其他 Agent commit payload".into());
        }
        return Ok(existing);
    }
    let created_at = Utc::now().to_rfc3339();
    let id = crate::local_service::stable_id("agent-operation", request_id);
    connection.execute(
        "INSERT INTO agent_recovery_operations (id, request_id, agent_id, operation_kind, status, expected_manifest_hash, fixed_revision_id, payload_json, created_at, completed_at) VALUES (?1, ?2, ?3, ?4, 'prepared', ?5, ?6, ?7, ?8, NULL)",
        params![id, request_id, agent_id, operation_kind, expected_manifest_hash, fixed_revision_id, encoded, created_at],
    ).map_err(|_| "无法持久化 prepared Agent commit operation".to_string())?;
    get_operation_at(database, &id)
}

fn load_operation_by_request(
    connection: &rusqlite::Connection,
    request_id: &str,
) -> Result<Option<AgentRecoveryOperation>, String> {
    connection.query_row(
        "SELECT id, request_id, agent_id, operation_kind, status, expected_manifest_hash, fixed_revision_id, payload_json, created_at, completed_at FROM agent_recovery_operations WHERE request_id = ?1",
        [request_id], row_operation,
    ).optional().map_err(|_| "无法读取 Agent commit operation".to_string())
}

fn row_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRecoveryOperation> {
    let encoded: String = row.get(7)?;
    let payload = serde_json::from_str(&encoded).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            encoded.len(),
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })?;
    Ok(AgentRecoveryOperation {
        id: row.get(0)?,
        request_id: row.get(1)?,
        agent_id: row.get(2)?,
        operation_kind: row.get(3)?,
        status: row.get(4)?,
        expected_manifest_hash: row.get(5)?,
        fixed_revision_id: row.get(6)?,
        payload,
        created_at: row.get(8)?,
        completed_at: row.get(9)?,
    })
}

pub(crate) fn list_recovery_summaries_at(
    database: &Path,
    agent_id: Option<&str>,
) -> Result<Vec<AgentRecoverySummaryDto>, String> {
    if agent_id.is_some_and(|id| !valid_id(id)) {
        return Err("Agent 标识无效".into());
    }
    let connection = domain_store::open_at(database)?;
    let sql = if agent_id.is_some() {
        "SELECT id, agent_id, operation_kind, status, created_at, completed_at FROM agent_recovery_operations WHERE agent_id = ?1 ORDER BY created_at DESC"
    } else {
        "SELECT id, agent_id, operation_kind, status, created_at, completed_at FROM agent_recovery_operations ORDER BY created_at DESC"
    };
    let mut statement = connection
        .prepare(sql)
        .map_err(|_| "无法读取 Agent recovery 摘要".to_string())?;
    let map = |row: &rusqlite::Row<'_>| {
        Ok(AgentRecoverySummaryDto {
            id: row.get(0)?,
            agent_id: row.get(1)?,
            operation_kind: row.get(2)?,
            status: row.get(3)?,
            created_at: row.get(4)?,
            completed_at: row.get(5)?,
        })
    };
    let rows = match agent_id {
        Some(id) => statement.query_map([id], map),
        None => statement.query_map([], map),
    }
    .map_err(|_| "无法查询 Agent recovery 摘要".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Agent recovery 摘要记录损坏".to_string())
}

pub(crate) fn get_operation_at(
    database: &Path,
    operation_id: &str,
) -> Result<AgentRecoveryOperation, String> {
    if !valid_id(operation_id) {
        return Err("Agent commit operation 标识无效".into());
    }
    let connection = domain_store::open_at(database)?;
    connection.query_row(
        "SELECT id, request_id, agent_id, operation_kind, status, expected_manifest_hash, fixed_revision_id, payload_json, created_at, completed_at FROM agent_recovery_operations WHERE id = ?1",
        [operation_id], row_operation,
    ).optional().map_err(|_| "无法读取 Agent commit operation".to_string())?.ok_or_else(|| "Agent commit operation 不存在".to_string())
}

pub(crate) fn complete_delete_operation_at(
    database: &Path,
    operation_id: &str,
) -> Result<AgentRecoveryOperation, String> {
    if !valid_id(operation_id) {
        return Err("Agent delete operation 标识无效".into());
    }
    let connection = domain_store::open_at(database)?;
    if connection
        .execute(
            "UPDATE agent_recovery_operations SET status = 'completed', payload_json = '{}', expected_manifest_hash = '', completed_at = ?1 WHERE id = ?2 AND operation_kind = 'delete' AND status = 'database_committed'",
            params![Utc::now().to_rfc3339(), operation_id],
        )
        .map_err(|_| "无法完成 Agent delete operation".to_string())?
        != 1
    {
        return Err("Agent delete operation 状态不允许完成".into());
    }
    get_operation_at(database, operation_id)
}

pub(crate) fn complete_operation_at(
    database: &Path,
    operation_id: &str,
) -> Result<AgentRecoveryOperation, String> {
    if !valid_id(operation_id) {
        return Err("Agent commit operation 标识无效".into());
    }
    let connection = domain_store::open_at(database)?;
    if connection
        .execute(
            "UPDATE agent_recovery_operations SET status = 'completed', payload_json = '{}', expected_manifest_hash = '', fixed_revision_id = NULL, completed_at = ?1 WHERE id = ?2 AND status = 'organization_pending'",
            params![Utc::now().to_rfc3339(), operation_id],
        )
        .map_err(|_| "无法完成 Agent commit operation".to_string())?
        != 1
    {
        return Err("Agent commit operation 状态不允许完成".into());
    }
    get_operation_at(database, operation_id)
}

pub(crate) fn set_operation_status_at(
    database: &Path,
    operation_id: &str,
    status: &str,
    fixed_revision_id: Option<&str>,
) -> Result<AgentRecoveryOperation, String> {
    if !valid_id(operation_id)
        || !matches!(
            status,
            "filesystem_committed"
                | "revision_pending"
                | "organization_pending"
                | "database_committed"
                | "blocked"
        )
        || fixed_revision_id.is_some_and(|id| !valid_id(id))
    {
        return Err("Agent commit operation 状态更新无效".into());
    }
    let connection = domain_store::open_at(database)?;
    let current: Option<String> = connection
        .query_row(
            "SELECT status FROM agent_recovery_operations WHERE id = ?1",
            [operation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法读取 Agent commit operation 状态".to_string())?;
    let allowed = matches!(
        (current.as_deref(), status),
        (
            Some("prepared"),
            "filesystem_committed" | "revision_pending" | "blocked"
        ) | (
            Some("filesystem_committed"),
            "revision_pending" | "organization_pending" | "database_committed" | "blocked"
        ) | (Some("revision_pending"), "organization_pending" | "blocked")
            | (Some("organization_pending"), "blocked")
            | (Some("database_committed"), "blocked")
    );
    if !allowed {
        return Err("Agent commit operation 状态不允许更新".into());
    }
    connection
        .execute(
            "UPDATE agent_recovery_operations SET status = ?1, fixed_revision_id = COALESCE(?2, fixed_revision_id) WHERE id = ?3",
            params![status, fixed_revision_id, operation_id],
        )
        .map_err(|_| "无法更新 Agent commit operation".to_string())?;
    get_operation_at(database, operation_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_name_validation_matches_the_public_rules() {
        for name in ["周策", "测试工程师 2", &"A".repeat(40)] {
            assert!(validate_agent_name(name).is_ok());
        }
        for name in [
            "",
            "周",
            "123456",
            "１２３",
            "---",
            "！！！",
            "550e8400-e29b-41d4-a716-446655440000",
            "agent-550e8400-e29b-41d4-a716-446655440000",
            " 周策 ",
        ] {
            assert!(validate_agent_name(name).is_err(), "应拒绝名称：{name}");
        }
        assert!(validate_agent_name(&"A".repeat(41)).is_err());
    }

    #[test]
    fn external_reference_never_requires_agent_files() {
        let root = tempfile::tempdir().unwrap();
        let external = root.path().join("external");
        fs::create_dir(&external).unwrap();
        let database = root.path().join("bandi.db");
        register_external_agent_at(
            &database,
            RegisterExternalAgentRequest {
                agent_id: "external-1".into(),
                selected_root: external.to_string_lossy().into_owned(),
                metadata: serde_json::json!({"id": "external-1", "name": "外部 Agent", "status": "active"}),
            },
        )
        .unwrap();
        assert!(!external.join("agent.yaml").exists());
        assert_eq!(list_external_agents_at(&database).unwrap().len(), 1);
    }

    #[test]
    fn prepared_operation_is_idempotent_and_payload_bound() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let payload = serde_json::json!({"manifest": "value"});
        let first = prepare_operation_at(
            &database,
            "request-1",
            "agent-1",
            "create",
            "sha256:a",
            None,
            &payload,
        )
        .unwrap();
        let second = prepare_operation_at(
            &database,
            "request-1",
            "agent-1",
            "create",
            "sha256:a",
            None,
            &payload,
        )
        .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(first.status, "prepared");
        assert!(prepare_operation_at(
            &database,
            "request-1",
            "agent-1",
            "create",
            "sha256:b",
            None,
            &payload
        )
        .is_err());
    }

    #[test]
    fn recovery_summary_hides_internal_payload_and_status_cannot_regress() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let operation = prepare_operation_at(
            &database,
            "request-2",
            "agent-2",
            "identity_update",
            "sha256:secret",
            Some("revision-2"),
            &serde_json::json!({"avatar": [1, 2, 3]}),
        )
        .unwrap();
        let summary = list_recovery_summaries_at(&database, Some("agent-2"))
            .unwrap()
            .remove(0);
        let encoded = serde_json::to_value(summary).unwrap();
        assert!(encoded.get("payload").is_none());
        assert!(encoded.get("expectedManifestHash").is_none());
        assert!(encoded.get("fixedRevisionId").is_none());
        set_operation_status_at(&database, &operation.id, "filesystem_committed", None).unwrap();
        assert!(
            set_operation_status_at(&database, &operation.id, "filesystem_committed", None,)
                .is_err()
        );
    }

    #[test]
    fn maximum_avatar_payload_can_be_prepared() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let mut avatar = vec![255; 5 * 1024 * 1024];
        avatar[..8].copy_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);
        let payload = serde_json::json!({
            "create": { "avatarBytes": avatar },
            "organization": null,
        });

        let operation = prepare_operation_at(
            &database,
            "request-large-avatar",
            "agent-large-avatar",
            "create",
            "sha256:large-avatar",
            None,
            &payload,
        )
        .unwrap();

        assert_eq!(operation.payload, payload);
    }

    #[test]
    fn recovery_payload_limit_is_still_enforced() {
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let payload = serde_json::json!({
            "content": "x".repeat(AGENT_RECOVERY_PAYLOAD_LIMIT),
        });

        let error = prepare_operation_at(
            &database,
            "request-oversized",
            "agent-oversized",
            "create",
            "sha256:oversized",
            None,
            &payload,
        )
        .unwrap_err();

        assert_eq!(error, "Agent commit payload 超过 25 MiB");
    }
}
