use std::{collections::HashSet, fs, path::Path};

use crate::local_service;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const DATABASE_SCHEMA_VERSION: i64 = 11;
const ORGANIZATION_SCHEMA_VERSION: u64 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CompanyDto {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) mission: String,
    pub(crate) boundary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) assistant_agent_id: Option<String>,
    pub(crate) department_ids: Vec<String>,
    pub(crate) workspace_ids: Vec<String>,
    pub(crate) shared_asset_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DepartmentDto {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) company_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent_department_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manager_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manager: Option<String>,
    pub(crate) mission: String,
    pub(crate) members: u64,
    pub(crate) responsibilities: Vec<String>,
    pub(crate) boundaries: Vec<String>,
    pub(crate) delegation_depth: u64,
    pub(crate) member_agent_ids: Vec<String>,
    pub(crate) owned_sop_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RoleDto {
    pub(crate) id: String,
    pub(crate) company_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) department_id: Option<String>,
    pub(crate) name: String,
    pub(crate) status: String,
    pub(crate) mission: String,
    pub(crate) responsibilities: Vec<String>,
    pub(crate) inputs: Vec<String>,
    pub(crate) deliverables: Vec<String>,
    pub(crate) decision_boundaries: Vec<String>,
    pub(crate) escalation_conditions: Vec<String>,
    pub(crate) completion_definition: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ServiceGrantDto {
    pub(crate) id: String,
    pub(crate) agent_id: String,
    pub(crate) department_id: String,
    pub(crate) capabilities: Vec<String>,
    pub(crate) workspace_ids: Vec<String>,
    pub(crate) prohibitions: Vec<String>,
    pub(crate) status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkspaceDto {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) company: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) department: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) company_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) primary_department_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_lead_agent_id: Option<String>,
    pub(crate) collaborator_department_ids: Vec<String>,
    pub(crate) config: String,
    pub(crate) health: String,
    pub(crate) agent_ids: Vec<String>,
    pub(crate) asset_ids: Vec<String>,
    pub(crate) public_memory_space_id: String,
    pub(crate) department_memory_space_ids: Vec<String>,
    pub(crate) files: Vec<Value>,
    pub(crate) recent_edits: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OrganizationSnapshotDto {
    pub(crate) schema_version: u64,
    pub(crate) companies: Vec<CompanyDto>,
    pub(crate) departments: Vec<DepartmentDto>,
    pub(crate) roles: Vec<RoleDto>,
    pub(crate) workspaces: Vec<WorkspaceDto>,
    pub(crate) service_grants: Vec<ServiceGrantDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveCompanyRequest {
    pub(crate) company: CompanyDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveDepartmentRequest {
    pub(crate) department: DepartmentDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveRoleRequest {
    pub(crate) role: RoleDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveWorkspaceRequest {
    pub(crate) workspace: WorkspaceDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RemoveWorkspaceRequest {
    pub(crate) workspace_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveServiceGrantsRequest {
    pub(crate) agent_id: String,
    pub(crate) grants: Vec<ServiceGrantDto>,
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

fn validate_text(value: &str, field: &str, required: bool) -> Result<(), String> {
    let length = value.chars().count();
    if required && value.trim().is_empty() {
        return Err(format!("{field}不能为空"));
    }
    if length > 16_384 {
        return Err(format!("{field}过长"));
    }
    Ok(())
}

fn validate_id(value: &str, field: &str) -> Result<(), String> {
    if validate_identifier(value) {
        Ok(())
    } else {
        Err(format!("{field}无效"))
    }
}

fn validate_ids(values: &[String], field: &str) -> Result<(), String> {
    let mut unique = HashSet::new();
    for value in values {
        validate_id(value, field)?;
        if !unique.insert(value) {
            return Err(format!("{field}包含重复标识"));
        }
    }
    Ok(())
}

fn validate_string_list(values: &[String], field: &str) -> Result<(), String> {
    if values.len() > 512 {
        return Err(format!("{field}项目过多"));
    }
    for value in values {
        validate_text(value, field, true)?;
    }
    Ok(())
}

fn json<T: Serialize>(value: &T, field: &str) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| format!("{field}无法序列化"))
}

fn parse_json<T: for<'de> Deserialize<'de>>(value: String) -> rusqlite::Result<T> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            value.len(),
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

pub(crate) fn open_at(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建本地领域数据目录".to_string())?;
    }
    let connection = Connection::open(path).map_err(|_| "无法打开本地领域数据库".to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )
        .map_err(|_| "无法配置本地领域数据库".to_string())?;
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version > DATABASE_SCHEMA_VERSION {
        return Err("本地领域数据库版本高于当前应用支持范围".into());
    }
    if version == 0 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE companies (
                   id TEXT PRIMARY KEY,
                   name TEXT NOT NULL,
                   mission TEXT NOT NULL,
                   boundary_text TEXT NOT NULL,
                   assistant_agent_id TEXT,
                   department_ids_json TEXT NOT NULL,
                   workspace_ids_json TEXT NOT NULL,
                   shared_asset_ids_json TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE UNIQUE INDEX companies_name_unique ON companies(name COLLATE NOCASE);
                 CREATE TABLE departments (
                   id TEXT PRIMARY KEY,
                   company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
                   parent_department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
                   name TEXT NOT NULL,
                   parent_name TEXT,
                   manager_agent_id TEXT,
                   manager_name TEXT,
                   mission TEXT NOT NULL,
                   members INTEGER NOT NULL,
                   responsibilities_json TEXT NOT NULL,
                   boundaries_json TEXT NOT NULL,
                   delegation_depth INTEGER NOT NULL,
                   member_agent_ids_json TEXT NOT NULL,
                   owned_sop_ids_json TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(parent_department_id IS NULL OR parent_department_id <> id)
                 );
                 CREATE UNIQUE INDEX departments_company_name_unique ON departments(company_id, name COLLATE NOCASE);
                 CREATE TABLE roles (
                   id TEXT PRIMARY KEY,
                   company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
                   department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
                   name TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
                   mission TEXT NOT NULL,
                   responsibilities_json TEXT NOT NULL,
                   inputs_json TEXT NOT NULL,
                   deliverables_json TEXT NOT NULL,
                   decision_boundaries_json TEXT NOT NULL,
                   escalation_conditions_json TEXT NOT NULL,
                   completion_definition_json TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE UNIQUE INDEX roles_company_name_unique ON roles(company_id, name COLLATE NOCASE);
                 CREATE TABLE workspaces (
                   id TEXT PRIMARY KEY,
                   name TEXT NOT NULL,
                   canonical_path TEXT NOT NULL UNIQUE,
                   company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
                   primary_department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
                   project_lead_agent_id TEXT,
                   company_name TEXT,
                   department_name TEXT,
                   collaborator_department_ids_json TEXT NOT NULL,
                   config TEXT NOT NULL,
                   health TEXT NOT NULL,
                   agent_ids_json TEXT NOT NULL,
                   asset_ids_json TEXT NOT NULL,
                   public_memory_space_id TEXT NOT NULL,
                   department_memory_space_ids_json TEXT NOT NULL,
                   files_json TEXT NOT NULL,
                   recent_edits_json TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE TABLE service_grants (
                   id TEXT PRIMARY KEY,
                   agent_id TEXT NOT NULL,
                   department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
                   capabilities_json TEXT NOT NULL,
                   workspace_ids_json TEXT NOT NULL,
                   prohibitions_json TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('有效', '暂停')),
                   updated_at TEXT NOT NULL
                 );
                 CREATE INDEX service_grants_agent ON service_grants(agent_id);
                 PRAGMA user_version = 1;
                 COMMIT;",
            )
            .map_err(|_| "本地领域数据库迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 1 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE memory_spaces (
                   id TEXT PRIMARY KEY,
                   scope_type TEXT NOT NULL CHECK(scope_type = 'agent_long_term'),
                   agent_id TEXT NOT NULL UNIQUE,
                   owner_agent_id TEXT NOT NULL,
                   steward_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   review_policy TEXT NOT NULL CHECK(review_policy = 'independent_reviewer'),
                   visibility_policy TEXT NOT NULL CHECK(visibility_policy = 'agent_private'),
                   current_revision_id TEXT,
                   content_hash TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(owner_agent_id <> reviewer_agent_id)
                 );
                 CREATE TABLE memory_candidates (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   source_kind TEXT NOT NULL CHECK(source_kind IN ('manual', 'import')),
                   source_label TEXT NOT NULL,
                   summary TEXT NOT NULL,
                   proposed_content TEXT NOT NULL,
                   proposed_content_hash TEXT NOT NULL,
                   submitted_baseline_json TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('pending_review', 'changes_requested', 'rejected', 'approved_pending_write', 'written', 'revision_pending')),
                   version INTEGER NOT NULL CHECK(version >= 1),
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(proposer_agent_id <> reviewer_agent_id)
                 );
                 CREATE INDEX memory_candidates_space ON memory_candidates(space_id);
                 CREATE TABLE memory_review_decisions (
                   id TEXT PRIMARY KEY,
                   candidate_id TEXT NOT NULL REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   actor_agent_id TEXT NOT NULL,
                   decision TEXT NOT NULL CHECK(decision IN ('request_changes', 'reject', 'approve')),
                   comment TEXT,
                   decided_at TEXT NOT NULL
                 );
                 CREATE INDEX memory_decisions_candidate ON memory_review_decisions(candidate_id);
                 CREATE TABLE memory_revisions (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   parent_revision_id TEXT REFERENCES memory_revisions(id) ON DELETE RESTRICT,
                   candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   review_decision_id TEXT NOT NULL UNIQUE REFERENCES memory_review_decisions(id) ON DELETE RESTRICT,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   source_content_hash TEXT NOT NULL,
                   content_hash TEXT NOT NULL,
                   write_receipt_id TEXT NOT NULL UNIQUE,
                   written_at TEXT NOT NULL
                 );
                 CREATE INDEX memory_revisions_space ON memory_revisions(space_id);
                 PRAGMA user_version = 2;
                 COMMIT;",
            )
            .map_err(|_| "正式 Memory 数据库迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 2 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE memory_revision_recovery (
                   recovery_ref TEXT PRIMARY KEY,
                   candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   review_decision_id TEXT NOT NULL REFERENCES memory_review_decisions(id) ON DELETE RESTRICT,
                   revision_json TEXT NOT NULL,
                   write_receipt_json TEXT NOT NULL,
                   created_at TEXT NOT NULL
                 );
                 PRAGMA user_version = 3;
                 COMMIT;",
            )
            .map_err(|_| "正式 Memory 恢复数据迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 3 {
        let has_base_content = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_candidates') WHERE name = 'submitted_base_content')",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| "无法检查正式 Memory 候选结构".to_string())?;
        let migration = if has_base_content {
            "BEGIN IMMEDIATE;
             PRAGMA user_version = 4;
             COMMIT;"
        } else {
            "BEGIN IMMEDIATE;
             ALTER TABLE memory_candidates ADD COLUMN submitted_base_content TEXT NOT NULL DEFAULT '';
             PRAGMA user_version = 4;
             COMMIT;"
        };
        connection
            .execute_batch(migration)
            .map_err(|_| "正式 Memory 候选基线内容迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 4 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE backup_snapshots (
                   id TEXT PRIMARY KEY,
                   kind TEXT NOT NULL CHECK(kind IN ('manual', 'pre_restore')),
                   scope TEXT NOT NULL CHECK(scope = 'files'),
                   created_at TEXT NOT NULL,
                   entry_count INTEGER NOT NULL CHECK(entry_count > 0),
                   manifest_hash TEXT NOT NULL,
                   integrity TEXT NOT NULL CHECK(integrity IN ('verified', 'failed'))
                 );
                 CREATE TABLE backup_snapshot_entries (
                   snapshot_id TEXT NOT NULL REFERENCES backup_snapshots(id) ON DELETE RESTRICT,
                   asset_id TEXT NOT NULL,
                   container_id TEXT NOT NULL,
                   asset_kind TEXT NOT NULL,
                   locator_json TEXT NOT NULL,
                   asset_content_hash TEXT NOT NULL,
                   container_content_hash TEXT NOT NULL,
                   snapshot_content_hash TEXT NOT NULL,
                   size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
                   redacted INTEGER NOT NULL CHECK(redacted = 0),
                   content_ref TEXT NOT NULL,
                   PRIMARY KEY(snapshot_id, asset_id)
                 );
                 CREATE INDEX backup_entries_asset ON backup_snapshot_entries(asset_id);
                 CREATE TABLE backup_restore_operations (
                   id TEXT PRIMARY KEY,
                   snapshot_id TEXT NOT NULL REFERENCES backup_snapshots(id) ON DELETE RESTRICT,
                   pre_restore_snapshot_id TEXT REFERENCES backup_snapshots(id) ON DELETE RESTRICT,
                   preview_ref TEXT NOT NULL UNIQUE,
                   requested_asset_ids_json TEXT NOT NULL,
                   current_baselines_json TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('previewed', 'restored', 'partial_failure', 'restore_failed')),
                   expires_at TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   completed_at TEXT,
                   result_json TEXT
                 );
                 PRAGMA user_version = 5;
                 COMMIT;",
            )
            .map_err(|_| "Backup 数据库迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 5 {
        let already_current = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_spaces') WHERE name = 'reviewer_principal_kind')",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| "无法检查正式 Memory 结构".to_string())?;
        if already_current {
            connection
                .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version = 6; COMMIT;")
                .map_err(|_| "四类正式 Memory 数据库迁移失败".to_string())?;
        } else {
            connection
            .execute_batch(
                "PRAGMA foreign_keys = OFF;
                 PRAGMA legacy_alter_table = ON;
                 BEGIN IMMEDIATE;
                 ALTER TABLE memory_spaces RENAME TO memory_spaces_v1;
                 CREATE TABLE memory_spaces (
                   id TEXT PRIMARY KEY,
                   scope_type TEXT NOT NULL CHECK(scope_type IN ('agent_long_term', 'agent_workspace', 'workspace_shared', 'department_workspace')),
                   agent_id TEXT,
                   workspace_id TEXT,
                   department_id TEXT,
                   owner_kind TEXT NOT NULL CHECK(owner_kind IN ('agent', 'workspace', 'department_workspace')),
                   owner_agent_id TEXT,
                   steward_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   review_policy TEXT NOT NULL CHECK(review_policy = 'independent_reviewer'),
                   visibility_policy TEXT NOT NULL CHECK(visibility_policy IN ('agent_private', 'workspace_shared', 'department_workspace')),
                   storage_profile_version TEXT NOT NULL CHECK(storage_profile_version = 'memory-v1'),
                   state TEXT NOT NULL CHECK(state IN ('active', 'read_only_history')),
                   current_revision_id TEXT,
                   content_hash TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(
                     (scope_type = 'agent_long_term' AND agent_id IS NOT NULL AND workspace_id IS NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'agent_workspace' AND agent_id IS NOT NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'workspace_shared' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'workspace' AND owner_agent_id IS NULL) OR
                     (scope_type = 'department_workspace' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NOT NULL AND owner_kind = 'department_workspace' AND owner_agent_id IS NULL)
                   )
                 );
                 INSERT INTO memory_spaces (
                   id, scope_type, agent_id, workspace_id, department_id, owner_kind,
                   owner_agent_id, steward_agent_id, reviewer_agent_id, review_policy,
                   visibility_policy, storage_profile_version, state, current_revision_id,
                   content_hash, updated_at
                 )
                 SELECT id, scope_type, agent_id, NULL, NULL, 'agent', agent_id,
                        agent_id, reviewer_agent_id, review_policy, visibility_policy,
                        'memory-v1', 'active', current_revision_id, content_hash, updated_at
                 FROM memory_spaces_v1;
                 DROP TABLE memory_spaces_v1;
                 CREATE UNIQUE INDEX memory_spaces_scope_unique
                   ON memory_spaces(scope_type, COALESCE(agent_id, ''), COALESCE(workspace_id, ''), COALESCE(department_id, ''));
                 PRAGMA user_version = 6;
                 COMMIT;
                 PRAGMA legacy_alter_table = OFF;
                 PRAGMA foreign_keys = ON;",
            )
            .map_err(|_| "四类正式 Memory 数据库迁移失败".to_string())?;
        }
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 6 {
        let already_current = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_candidates') WHERE name = 'reviewer_principal_kind')",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| "无法检查正式 Memory 候选结构".to_string())?;
        if already_current {
            connection
                .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version = 7; COMMIT;")
                .map_err(|_| "正式 Memory 外键迁移失败".to_string())?;
        } else {
            connection
            .execute_batch(
                "PRAGMA foreign_keys = OFF;
                 PRAGMA legacy_alter_table = ON;
                 BEGIN IMMEDIATE;
                 ALTER TABLE memory_candidates RENAME TO memory_candidates_v6;
                 ALTER TABLE memory_revisions RENAME TO memory_revisions_v6;
                 ALTER TABLE memory_spaces RENAME TO memory_spaces_v6;
                 CREATE TABLE memory_spaces (
                   id TEXT PRIMARY KEY,
                   scope_type TEXT NOT NULL CHECK(scope_type IN ('agent_long_term', 'agent_workspace', 'workspace_shared', 'department_workspace')),
                   agent_id TEXT,
                   workspace_id TEXT,
                   department_id TEXT,
                   owner_kind TEXT NOT NULL CHECK(owner_kind IN ('agent', 'workspace', 'department_workspace')),
                   owner_agent_id TEXT,
                   steward_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   review_policy TEXT NOT NULL CHECK(review_policy = 'independent_reviewer'),
                   visibility_policy TEXT NOT NULL CHECK(visibility_policy IN ('agent_private', 'workspace_shared', 'department_workspace')),
                   storage_profile_version TEXT NOT NULL CHECK(storage_profile_version = 'memory-v1'),
                   state TEXT NOT NULL CHECK(state IN ('active', 'read_only_history')),
                   current_revision_id TEXT,
                   content_hash TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(
                     (scope_type = 'agent_long_term' AND agent_id IS NOT NULL AND workspace_id IS NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'agent_workspace' AND agent_id IS NOT NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'workspace_shared' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'workspace' AND owner_agent_id IS NULL) OR
                     (scope_type = 'department_workspace' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NOT NULL AND owner_kind = 'department_workspace' AND owner_agent_id IS NULL)
                   )
                 );
                 INSERT INTO memory_spaces SELECT * FROM memory_spaces_v6;
                 CREATE TABLE memory_candidates (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   source_kind TEXT NOT NULL CHECK(source_kind IN ('manual', 'import')),
                   source_label TEXT NOT NULL,
                   summary TEXT NOT NULL,
                   proposed_content TEXT NOT NULL,
                   submitted_baseline_json TEXT NOT NULL,
                   proposed_content_hash TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('pending_review', 'changes_requested', 'rejected', 'approved_pending_write', 'written', 'revision_pending')),
                   version INTEGER NOT NULL,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   submitted_base_content TEXT NOT NULL DEFAULT ''
                 );
                 INSERT INTO memory_candidates SELECT * FROM memory_candidates_v6;
                 CREATE TABLE memory_revisions (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   parent_revision_id TEXT,
                   candidate_id TEXT NOT NULL,
                   review_decision_id TEXT NOT NULL,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_agent_id TEXT NOT NULL,
                   source_content_hash TEXT NOT NULL,
                   content_hash TEXT NOT NULL,
                   write_receipt_id TEXT NOT NULL,
                   written_at TEXT NOT NULL
                 );
                 INSERT INTO memory_revisions SELECT * FROM memory_revisions_v6;
                 DROP TABLE memory_candidates_v6;
                 DROP TABLE memory_revisions_v6;
                 DROP TABLE memory_spaces_v6;
                 CREATE UNIQUE INDEX memory_spaces_scope_unique
                   ON memory_spaces(scope_type, COALESCE(agent_id, ''), COALESCE(workspace_id, ''), COALESCE(department_id, ''));
                 PRAGMA user_version = 7;
                 COMMIT;
                 PRAGMA legacy_alter_table = OFF;
                 PRAGMA foreign_keys = ON;",
            )
            .map_err(|_| "正式 Memory 外键迁移失败".to_string())?;
        }
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 7 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE IF NOT EXISTS external_agent_references (
                   agent_id TEXT PRIMARY KEY,
                   canonical_root TEXT NOT NULL UNIQUE,
                   metadata_json TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 PRAGMA user_version = 8;
                 COMMIT;",
            )
            .map_err(|_| "Agent 引用数据库迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 8 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 DROP TABLE IF EXISTS agent_recovery_operations;
                 CREATE TABLE agent_recovery_operations (
                   id TEXT PRIMARY KEY,
                   request_id TEXT NOT NULL UNIQUE,
                   agent_id TEXT NOT NULL,
                   operation_kind TEXT NOT NULL CHECK(operation_kind IN ('create', 'identity_update')),
                   status TEXT NOT NULL CHECK(status IN ('prepared', 'filesystem_committed', 'revision_pending', 'organization_pending', 'blocked', 'completed')),
                   expected_manifest_hash TEXT NOT NULL,
                   fixed_revision_id TEXT,
                   payload_json TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   completed_at TEXT
                 );
                 CREATE INDEX agent_recovery_operations_agent ON agent_recovery_operations(agent_id, created_at);
                 PRAGMA user_version = 9;
                 COMMIT;",
            )
            .map_err(|_| "Agent 恢复操作数据库迁移失败".to_string())?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 9 {
        let already_current = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_spaces') WHERE name = 'reviewer_principal_kind')",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| "无法检查正式 Memory 审核主体结构".to_string())?;
        if already_current {
            connection
                .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version = 10; COMMIT;")
                .map_err(|_| "正式 Memory 审核主体迁移失败".to_string())?;
        } else {
            connection
                .execute_batch(
                "PRAGMA foreign_keys = OFF;
                 PRAGMA legacy_alter_table = ON;
                 BEGIN IMMEDIATE;
                 ALTER TABLE memory_revision_recovery RENAME TO memory_revision_recovery_v9;
                 ALTER TABLE memory_review_decisions RENAME TO memory_review_decisions_v9;
                 ALTER TABLE memory_revisions RENAME TO memory_revisions_v9;
                 ALTER TABLE memory_candidates RENAME TO memory_candidates_v9;
                 ALTER TABLE memory_spaces RENAME TO memory_spaces_v9;
                 DROP INDEX IF EXISTS memory_spaces_scope_unique;
                 DROP INDEX IF EXISTS memory_candidates_space;
                 DROP INDEX IF EXISTS memory_decisions_candidate;
                 DROP INDEX IF EXISTS memory_revisions_space;
                 CREATE TABLE memory_spaces (
                   id TEXT PRIMARY KEY,
                   scope_type TEXT NOT NULL CHECK(scope_type IN ('agent_long_term', 'agent_workspace', 'workspace_shared', 'department_workspace')),
                   agent_id TEXT,
                   workspace_id TEXT,
                   department_id TEXT,
                   owner_kind TEXT NOT NULL CHECK(owner_kind IN ('agent', 'workspace', 'department_workspace')),
                   owner_agent_id TEXT,
                   steward_agent_id TEXT NOT NULL,
                   reviewer_principal_kind TEXT NOT NULL CHECK(reviewer_principal_kind IN ('agent', 'chairman_user')),
                   reviewer_principal_id TEXT NOT NULL,
                   review_policy TEXT NOT NULL CHECK(review_policy = 'independent_reviewer'),
                   visibility_policy TEXT NOT NULL CHECK(visibility_policy IN ('agent_private', 'workspace_shared', 'department_workspace')),
                   storage_profile_version TEXT NOT NULL CHECK(storage_profile_version = 'memory-v1'),
                   state TEXT NOT NULL CHECK(state IN ('active', 'read_only_history')),
                   current_revision_id TEXT,
                   content_hash TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   CHECK(
                     (scope_type = 'agent_long_term' AND agent_id IS NOT NULL AND workspace_id IS NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'agent_workspace' AND agent_id IS NOT NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'agent' AND owner_agent_id = agent_id) OR
                     (scope_type = 'workspace_shared' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NULL AND owner_kind = 'workspace' AND owner_agent_id IS NULL) OR
                     (scope_type = 'department_workspace' AND agent_id IS NULL AND workspace_id IS NOT NULL AND department_id IS NOT NULL AND owner_kind = 'department_workspace' AND owner_agent_id IS NULL)
                   ),
                   CHECK(reviewer_principal_kind <> 'agent' OR owner_agent_id IS NULL OR owner_agent_id <> reviewer_principal_id)
                 );
                 INSERT INTO memory_spaces SELECT id, scope_type, agent_id, workspace_id, department_id, owner_kind, owner_agent_id, steward_agent_id, 'agent', reviewer_agent_id, review_policy, visibility_policy, storage_profile_version, state, current_revision_id, content_hash, updated_at FROM memory_spaces_v9;
                 CREATE UNIQUE INDEX memory_spaces_scope_unique ON memory_spaces(scope_type, COALESCE(agent_id, ''), COALESCE(workspace_id, ''), COALESCE(department_id, ''));
                 CREATE TABLE memory_candidates (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_principal_kind TEXT NOT NULL CHECK(reviewer_principal_kind IN ('agent', 'chairman_user')),
                   reviewer_principal_id TEXT NOT NULL,
                   source_kind TEXT NOT NULL CHECK(source_kind IN ('manual', 'import')),
                   source_label TEXT NOT NULL,
                   summary TEXT NOT NULL,
                   proposed_content TEXT NOT NULL,
                   submitted_baseline_json TEXT NOT NULL,
                   proposed_content_hash TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN ('pending_review', 'changes_requested', 'rejected', 'approved_pending_write', 'written', 'revision_pending')),
                   version INTEGER NOT NULL CHECK(version >= 1),
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   submitted_base_content TEXT NOT NULL DEFAULT '',
                   CHECK(reviewer_principal_kind <> 'agent' OR proposer_agent_id <> reviewer_principal_id)
                 );
                 INSERT INTO memory_candidates SELECT id, space_id, proposer_agent_id, 'agent', reviewer_agent_id, source_kind, source_label, summary, proposed_content, submitted_baseline_json, proposed_content_hash, status, version, created_at, updated_at, submitted_base_content FROM memory_candidates_v9;
                 CREATE INDEX memory_candidates_space ON memory_candidates(space_id);
                 CREATE TABLE memory_review_decisions (
                   id TEXT PRIMARY KEY,
                   candidate_id TEXT NOT NULL REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   actor_principal_kind TEXT NOT NULL CHECK(actor_principal_kind IN ('agent', 'chairman_user')),
                   actor_principal_id TEXT NOT NULL,
                   decision TEXT NOT NULL CHECK(decision IN ('request_changes', 'reject', 'approve')),
                   comment TEXT,
                   decided_at TEXT NOT NULL
                 );
                 INSERT INTO memory_review_decisions SELECT id, candidate_id, 'agent', actor_agent_id, decision, comment, decided_at FROM memory_review_decisions_v9;
                 CREATE INDEX memory_decisions_candidate ON memory_review_decisions(candidate_id);
                 CREATE TABLE memory_revisions (
                   id TEXT PRIMARY KEY,
                   space_id TEXT NOT NULL REFERENCES memory_spaces(id) ON DELETE RESTRICT,
                   parent_revision_id TEXT REFERENCES memory_revisions(id) ON DELETE RESTRICT,
                   candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   review_decision_id TEXT NOT NULL UNIQUE REFERENCES memory_review_decisions(id) ON DELETE RESTRICT,
                   proposer_agent_id TEXT NOT NULL,
                   reviewer_principal_kind TEXT NOT NULL CHECK(reviewer_principal_kind IN ('agent', 'chairman_user')),
                   reviewer_principal_id TEXT NOT NULL,
                   source_content_hash TEXT NOT NULL,
                   content_hash TEXT NOT NULL,
                   write_receipt_id TEXT NOT NULL UNIQUE,
                   written_at TEXT NOT NULL
                 );
                 INSERT INTO memory_revisions SELECT id, space_id, parent_revision_id, candidate_id, review_decision_id, proposer_agent_id, 'agent', reviewer_agent_id, source_content_hash, content_hash, write_receipt_id, written_at FROM memory_revisions_v9;
                 CREATE INDEX memory_revisions_space ON memory_revisions(space_id);
                 CREATE TABLE memory_revision_recovery (
                   recovery_ref TEXT PRIMARY KEY,
                   candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id) ON DELETE RESTRICT,
                   review_decision_id TEXT NOT NULL REFERENCES memory_review_decisions(id) ON DELETE RESTRICT,
                   revision_json TEXT NOT NULL,
                   write_receipt_json TEXT NOT NULL,
                   created_at TEXT NOT NULL
                 );
                 INSERT INTO memory_revision_recovery SELECT * FROM memory_revision_recovery_v9;
                 DROP TABLE memory_revision_recovery_v9;
                 DROP TABLE memory_revisions_v9;
                 DROP TABLE memory_review_decisions_v9;
                 DROP TABLE memory_candidates_v9;
                 DROP TABLE memory_spaces_v9;
                 PRAGMA user_version = 10;
                 COMMIT;
                 PRAGMA legacy_alter_table = OFF;
                 PRAGMA foreign_keys = ON;",
            )
                .map_err(|error| format!("正式 Memory 审核主体迁移失败：{error}"))?;
            let invalid: i64 = connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })
                .map_err(|_| "无法校验正式 Memory 外键".to_string())?;
            if invalid != 0 {
                return Err("正式 Memory 审核主体迁移后外键校验失败".into());
            }
        }
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| "无法读取本地领域数据库版本".to_string())?;
    if version == 10 {
        connection
            .execute_batch(crate::tool_configuration::MIGRATION_V11)
            .map_err(|_| "工具方案数据库迁移失败".to_string())?;
    }
    Ok(())
}

fn company_exists(transaction: &Transaction<'_>, company_id: &str) -> Result<bool, String> {
    transaction
        .query_row(
            "SELECT 1 FROM companies WHERE id = ?1",
            [company_id],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|_| "无法校验公司引用".to_string())
}

fn department_company(
    transaction: &Transaction<'_>,
    department_id: &str,
) -> Result<Option<String>, String> {
    transaction
        .query_row(
            "SELECT company_id FROM departments WHERE id = ?1",
            [department_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法校验部门引用".to_string())
}

fn agent_facts_at(
    transaction: &Transaction<'_>,
    agents_root: &Path,
    agent_id: &str,
) -> Result<(Option<String>, String), String> {
    let external: Option<String> = transaction
        .query_row(
            "SELECT metadata_json FROM external_agent_references WHERE agent_id = ?1",
            [agent_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法读取外部 Agent metadata".to_string())?;
    if let Some(encoded) = external {
        let metadata: Value =
            serde_json::from_str(&encoded).map_err(|_| "外部 Agent metadata 已损坏".to_string())?;
        if metadata.get("id").and_then(Value::as_str) != Some(agent_id) {
            return Err("外部 Agent metadata 稳定标识不一致".into());
        }
        return Ok((
            metadata
                .get("companyId")
                .and_then(Value::as_str)
                .map(str::to_string),
            metadata
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("inactive")
                .to_string(),
        ));
    }

    let package = agents_root.join(format!("agt_{agent_id}"));
    let metadata = fs::symlink_metadata(&package).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "Agent 不存在".to_string()
        } else {
            "无法检查 AgentPackage".to_string()
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("AgentPackage 必须是受管根内普通目录".into());
    }
    let manifest_path = package.join("agent.yaml");
    let (manifest_agent_id, _) = local_service::manifest_facts(&manifest_path)
        .map_err(|diagnostic| format!("无法读取 Agent 事实：{}", diagnostic.message))?;
    if manifest_agent_id != agent_id {
        return Err("AgentPackage 稳定标识不一致".into());
    }
    let manifest: Value = serde_yaml::from_str(
        &fs::read_to_string(manifest_path).map_err(|_| "无法读取 Agent 事实".to_string())?,
    )
    .map_err(|_| "Agent 事实格式无效".to_string())?;
    Ok((
        manifest
            .get("companyId")
            .and_then(Value::as_str)
            .map(str::to_string),
        manifest
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("inactive")
            .to_string(),
    ))
}

fn validate_agent_company(
    transaction: &Transaction<'_>,
    agents_root: &Path,
    agent_id: &str,
    company_id: &str,
) -> Result<String, String> {
    let (actual_company_id, status) = agent_facts_at(transaction, agents_root, agent_id)?;
    if actual_company_id.as_deref() != Some(company_id) {
        return Err("Agent 必须属于同一公司".into());
    }
    Ok(status)
}

fn validate_active_agent_company(
    transaction: &Transaction<'_>,
    agents_root: &Path,
    agent_id: &str,
    company_id: &str,
) -> Result<(), String> {
    if validate_agent_company(transaction, agents_root, agent_id, company_id)? != "active" {
        return Err("Agent 必须处于 active 状态".into());
    }
    Ok(())
}

fn validate_company(company: &CompanyDto) -> Result<(), String> {
    validate_id(&company.id, "公司标识")?;
    validate_text(&company.name, "公司名称", true)?;
    validate_text(&company.mission, "公司使命", true)?;
    validate_text(&company.boundary, "公司边界", true)?;
    if let Some(agent_id) = company.assistant_agent_id.as_deref() {
        validate_id(agent_id, "助理 Agent 标识")?;
    }
    validate_ids(&company.department_ids, "部门标识")?;
    validate_ids(&company.workspace_ids, "工作区标识")?;
    validate_ids(&company.shared_asset_ids, "共享资产标识")
}

fn validate_department_base(department: &DepartmentDto) -> Result<(), String> {
    validate_id(&department.id, "部门标识")?;
    validate_id(&department.company_id, "公司标识")?;
    validate_text(&department.name, "部门名称", true)?;
    validate_text(&department.mission, "部门使命", true)?;
    if department.delegation_depth == 0 || department.delegation_depth > 32 {
        return Err("委派深度必须在 1 到 32 之间".into());
    }
    if let Some(parent_id) = department.parent_department_id.as_deref() {
        validate_id(parent_id, "上级部门标识")?;
        if parent_id == department.id {
            return Err("部门不能以自身作为上级".into());
        }
    }
    if let Some(manager_id) = department.manager_agent_id.as_deref() {
        validate_id(manager_id, "主管 Agent 标识")?;
        if !department
            .member_agent_ids
            .iter()
            .any(|id| id == manager_id)
        {
            return Err("部门主管必须属于该部门".into());
        }
    }
    validate_ids(&department.member_agent_ids, "成员 Agent 标识")?;
    validate_ids(&department.owned_sop_ids, "SOP 标识")?;
    validate_string_list(&department.responsibilities, "部门职责")?;
    validate_string_list(&department.boundaries, "部门边界")
}

fn validate_department_graph(
    transaction: &Transaction<'_>,
    department: &DepartmentDto,
) -> Result<(), String> {
    if !company_exists(transaction, &department.company_id)? {
        return Err("所属公司不存在".into());
    }
    let existing_company: Option<String> = transaction
        .query_row(
            "SELECT company_id FROM departments WHERE id = ?1",
            [&department.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法读取当前部门".to_string())?;
    if existing_company
        .as_deref()
        .is_some_and(|id| id != department.company_id)
    {
        return Err("普通编辑不能跨公司移动部门".into());
    }
    let mut parent_id = department.parent_department_id.clone();
    let mut seen = HashSet::new();
    while let Some(current) = parent_id {
        if current == department.id || !seen.insert(current.clone()) {
            return Err("组织关系必须无环".into());
        }
        let parent: Option<(String, Option<String>)> = transaction
            .query_row(
                "SELECT company_id, parent_department_id FROM departments WHERE id = ?1",
                [&current],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| "无法校验上级部门".to_string())?;
        let Some((company_id, next_parent)) = parent else {
            return Err("上级部门不存在".into());
        };
        if company_id != department.company_id {
            return Err("上级部门必须属于同一公司".into());
        }
        parent_id = next_parent;
    }
    Ok(())
}

fn validate_role(transaction: &Transaction<'_>, role: &RoleDto) -> Result<(), String> {
    validate_id(&role.id, "岗位标识")?;
    validate_id(&role.company_id, "公司标识")?;
    validate_text(&role.name, "岗位名称", true)?;
    validate_text(&role.mission, "岗位使命", true)?;
    if !matches!(role.status.as_str(), "active" | "archived") {
        return Err("岗位状态无效".into());
    }
    if !company_exists(transaction, &role.company_id)? {
        return Err("岗位所属公司不存在".into());
    }
    if let Some(department_id) = role.department_id.as_deref() {
        validate_id(department_id, "部门标识")?;
        if department_company(transaction, department_id)?.as_deref() != Some(&role.company_id) {
            return Err("岗位部门必须属于岗位公司".into());
        }
    }
    validate_string_list(&role.responsibilities, "岗位职责")?;
    validate_string_list(&role.inputs, "岗位输入")?;
    validate_string_list(&role.deliverables, "岗位交付物")?;
    validate_string_list(&role.decision_boundaries, "岗位决策边界")?;
    validate_string_list(&role.escalation_conditions, "岗位升级条件")?;
    validate_string_list(&role.completion_definition, "岗位完成定义")
}

fn validate_workspace(
    transaction: &Transaction<'_>,
    agents_root: Option<&Path>,
    workspace: &WorkspaceDto,
) -> Result<(), String> {
    validate_id(&workspace.id, "工作区标识")?;
    validate_text(&workspace.name, "工作区名称", true)?;
    validate_text(&workspace.path, "工作区路径", true)?;
    validate_ids(&workspace.collaborator_department_ids, "协作部门标识")?;
    validate_ids(&workspace.agent_ids, "Agent 标识")?;
    validate_ids(&workspace.asset_ids, "资产标识")?;
    validate_ids(&workspace.department_memory_space_ids, "MemorySpace 标识")?;
    validate_id(&workspace.public_memory_space_id, "公共 MemorySpace 标识")?;
    match workspace.company_id.as_deref() {
        None => {
            if workspace.primary_department_id.is_some()
                || workspace.project_lead_agent_id.is_some()
                || !workspace.collaborator_department_ids.is_empty()
            {
                return Err("未关联公司的工作区不能设置组织责任".into());
            }
        }
        Some(company_id) => {
            validate_id(company_id, "公司标识")?;
            if !company_exists(transaction, company_id)? {
                return Err("工作区所属公司不存在".into());
            }
            let primary_id = workspace
                .primary_department_id
                .as_deref()
                .ok_or_else(|| "已关联组织的工作区必须设置唯一主责部门".to_string())?;
            if department_company(transaction, primary_id)?.as_deref() != Some(company_id) {
                return Err("主责部门必须属于工作区公司".into());
            }
            for department_id in &workspace.collaborator_department_ids {
                if department_id == primary_id {
                    return Err("主责部门不能同时作为协作部门".into());
                }
                if department_company(transaction, department_id)?.as_deref() != Some(company_id) {
                    return Err("协作部门必须属于工作区公司".into());
                }
            }
            if let Some(agents_root) = agents_root {
                let agent_id = workspace
                    .project_lead_agent_id
                    .as_deref()
                    .ok_or_else(|| "已关联组织的工作区必须设置默认项目负责人".to_string())?;
                validate_id(agent_id, "默认负责人标识")?;
                validate_active_agent_company(transaction, agents_root, agent_id, company_id)?;
            } else if let Some(agent_id) = workspace.project_lead_agent_id.as_deref() {
                validate_id(agent_id, "默认负责人标识")?;
            }
        }
    }
    Ok(())
}

pub(crate) fn save_company_governed_at(
    path: &Path,
    agents_root: &Path,
    request: SaveCompanyRequest,
) -> Result<CompanyDto, String> {
    validate_company(&request.company)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始公司保存事务".to_string())?;
    if let Some(agent_id) = request.company.assistant_agent_id.as_deref() {
        validate_active_agent_company(&transaction, agents_root, agent_id, &request.company.id)?;
    }
    save_company_in(&transaction, &request.company)?;
    transaction
        .commit()
        .map_err(|_| "无法提交公司保存事务".to_string())?;
    Ok(request.company)
}

fn save_company_in(transaction: &Transaction<'_>, company: &CompanyDto) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO companies (id, name, mission, boundary_text, assistant_agent_id, department_ids_json, workspace_ids_json, shared_asset_ids_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, mission=excluded.mission, boundary_text=excluded.boundary_text,
               assistant_agent_id=excluded.assistant_agent_id, department_ids_json=excluded.department_ids_json,
               workspace_ids_json=excluded.workspace_ids_json, shared_asset_ids_json=excluded.shared_asset_ids_json, updated_at=excluded.updated_at",
            params![
                company.id,
                company.name,
                company.mission,
                company.boundary,
                company.assistant_agent_id,
                json(&company.department_ids, "部门列表")?,
                json(&company.workspace_ids, "工作区列表")?,
                json(&company.shared_asset_ids, "共享资产列表")?,
                now,
            ],
        )
        .map_err(|error| if error.to_string().contains("companies_name_unique") { "公司名称重复".to_string() } else { "无法保存公司".to_string() })?;
    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn save_company_at(
    path: &Path,
    request: SaveCompanyRequest,
) -> Result<CompanyDto, String> {
    validate_company(&request.company)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始公司保存事务".to_string())?;
    save_company_in(&transaction, &request.company)?;
    transaction
        .commit()
        .map_err(|_| "无法提交公司保存事务".to_string())?;
    Ok(request.company)
}

pub(crate) fn save_department_governed_at(
    path: &Path,
    agents_root: &Path,
    request: SaveDepartmentRequest,
) -> Result<DepartmentDto, String> {
    validate_department_base(&request.department)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始部门保存事务".to_string())?;
    validate_department_graph(&transaction, &request.department)?;
    for agent_id in &request.department.member_agent_ids {
        let status = validate_agent_company(
            &transaction,
            agents_root,
            agent_id,
            &request.department.company_id,
        )?;
        if request.department.manager_agent_id.as_deref() == Some(agent_id) && status != "active" {
            return Err("部门主管必须处于 active 状态".into());
        }
    }
    save_department_in(&transaction, &request.department)?;
    transaction
        .commit()
        .map_err(|_| "无法提交部门保存事务".to_string())?;
    Ok(request.department)
}

fn save_department_in(
    transaction: &Transaction<'_>,
    department: &DepartmentDto,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO departments (id, company_id, parent_department_id, name, parent_name, manager_agent_id, manager_name, mission, members, responsibilities_json, boundaries_json, delegation_depth, member_agent_ids_json, owned_sop_ids_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET parent_department_id=excluded.parent_department_id, name=excluded.name,
               parent_name=excluded.parent_name, manager_agent_id=excluded.manager_agent_id, manager_name=excluded.manager_name,
               mission=excluded.mission, members=excluded.members, responsibilities_json=excluded.responsibilities_json,
               boundaries_json=excluded.boundaries_json, delegation_depth=excluded.delegation_depth,
               member_agent_ids_json=excluded.member_agent_ids_json, owned_sop_ids_json=excluded.owned_sop_ids_json, updated_at=excluded.updated_at",
            params![
                department.id,
                department.company_id,
                department.parent_department_id,
                department.name,
                department.parent,
                department.manager_agent_id,
                department.manager,
                department.mission,
                i64::try_from(department.members)
                    .map_err(|_| "部门成员数量无效".to_string())?,
                json(&department.responsibilities, "部门职责")?,
                json(&department.boundaries, "部门边界")?,
                i64::try_from(department.delegation_depth)
                    .map_err(|_| "委派深度无效".to_string())?,
                json(&department.member_agent_ids, "部门成员")?,
                json(&department.owned_sop_ids, "部门 SOP")?,
                now,
            ],
        )
        .map_err(|error| if error.to_string().contains("departments_company_name_unique") { "同一公司内部门名称重复".to_string() } else { "无法保存部门".to_string() })?;
    Ok(())
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn save_department_at(
    path: &Path,
    request: SaveDepartmentRequest,
) -> Result<DepartmentDto, String> {
    validate_department_base(&request.department)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始部门保存事务".to_string())?;
    validate_department_graph(&transaction, &request.department)?;
    save_department_in(&transaction, &request.department)?;
    transaction
        .commit()
        .map_err(|_| "无法提交部门保存事务".to_string())?;
    Ok(request.department)
}

pub(crate) fn save_role_at(path: &Path, request: SaveRoleRequest) -> Result<RoleDto, String> {
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始岗位保存事务".to_string())?;
    validate_role(&transaction, &request.role)?;
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO roles (id, company_id, department_id, name, status, mission, responsibilities_json, inputs_json, deliverables_json, decision_boundaries_json, escalation_conditions_json, completion_definition_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(id) DO UPDATE SET department_id=excluded.department_id, name=excluded.name, status=excluded.status,
               mission=excluded.mission, responsibilities_json=excluded.responsibilities_json, inputs_json=excluded.inputs_json,
               deliverables_json=excluded.deliverables_json, decision_boundaries_json=excluded.decision_boundaries_json,
               escalation_conditions_json=excluded.escalation_conditions_json, completion_definition_json=excluded.completion_definition_json,
               updated_at=excluded.updated_at",
            params![
                request.role.id,
                request.role.company_id,
                request.role.department_id,
                request.role.name,
                request.role.status,
                request.role.mission,
                json(&request.role.responsibilities, "岗位职责")?,
                json(&request.role.inputs, "岗位输入")?,
                json(&request.role.deliverables, "岗位交付物")?,
                json(&request.role.decision_boundaries, "岗位决策边界")?,
                json(&request.role.escalation_conditions, "岗位升级条件")?,
                json(&request.role.completion_definition, "岗位完成定义")?,
                now,
            ],
        )
        .map_err(|error| if error.to_string().contains("roles_company_name_unique") { "公司内岗位名称重复".to_string() } else { "无法保存岗位".to_string() })?;
    transaction
        .commit()
        .map_err(|_| "无法提交岗位保存事务".to_string())?;
    Ok(request.role)
}

pub(crate) fn save_workspace_governed_at(
    path: &Path,
    agents_root: &Path,
    request: SaveWorkspaceRequest,
) -> Result<WorkspaceDto, String> {
    save_workspace_with_agents_at(path, Some(agents_root), request)
}

pub(crate) fn save_workspace_at(
    path: &Path,
    request: SaveWorkspaceRequest,
) -> Result<WorkspaceDto, String> {
    save_workspace_with_agents_at(path, None, request)
}

fn save_workspace_with_agents_at(
    path: &Path,
    agents_root: Option<&Path>,
    request: SaveWorkspaceRequest,
) -> Result<WorkspaceDto, String> {
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始工作区保存事务".to_string())?;
    validate_workspace(&transaction, agents_root, &request.workspace)?;
    let current_path: Option<String> = transaction
        .query_row(
            "SELECT canonical_path FROM workspaces WHERE id = ?1",
            [&request.workspace.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法读取当前工作区".to_string())?;
    if current_path
        .as_deref()
        .is_some_and(|value| value != request.workspace.path)
    {
        return Err("普通编辑不能更改已登记工作区路径".into());
    }
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO workspaces (id, name, canonical_path, company_id, primary_department_id, project_lead_agent_id, company_name, department_name, collaborator_department_ids_json, config, health, agent_ids_json, asset_ids_json, public_memory_space_id, department_memory_space_ids_json, files_json, recent_edits_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, company_id=excluded.company_id,
               primary_department_id=excluded.primary_department_id, project_lead_agent_id=excluded.project_lead_agent_id,
               company_name=excluded.company_name, department_name=excluded.department_name,
               collaborator_department_ids_json=excluded.collaborator_department_ids_json, config=excluded.config,
               health=excluded.health, agent_ids_json=excluded.agent_ids_json, asset_ids_json=excluded.asset_ids_json,
               public_memory_space_id=excluded.public_memory_space_id,
               department_memory_space_ids_json=excluded.department_memory_space_ids_json,
               files_json=excluded.files_json, recent_edits_json=excluded.recent_edits_json, updated_at=excluded.updated_at",
            params![
                request.workspace.id,
                request.workspace.name,
                request.workspace.path,
                request.workspace.company_id,
                request.workspace.primary_department_id,
                request.workspace.project_lead_agent_id,
                request.workspace.company,
                request.workspace.department,
                json(&request.workspace.collaborator_department_ids, "协作部门")?,
                request.workspace.config,
                request.workspace.health,
                json(&request.workspace.agent_ids, "Agent 列表")?,
                json(&request.workspace.asset_ids, "资产列表")?,
                request.workspace.public_memory_space_id,
                json(&request.workspace.department_memory_space_ids, "部门记忆空间")?,
                json(&request.workspace.files, "工作区文件")?,
                json(&request.workspace.recent_edits, "最近编辑")?,
                now,
            ],
        )
        .map_err(|error| if error.to_string().contains("canonical_path") { "该规范化目录已由其他工作区登记".to_string() } else { "无法保存工作区".to_string() })?;
    transaction
        .commit()
        .map_err(|_| "无法提交工作区保存事务".to_string())?;
    Ok(request.workspace)
}

pub(crate) fn remove_workspace_at(
    path: &Path,
    request: RemoveWorkspaceRequest,
) -> Result<(), String> {
    validate_id(&request.workspace_id, "工作区标识")?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始移除工作区事务".to_string())?;
    let referenced: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM service_grants WHERE EXISTS (SELECT 1 FROM json_each(service_grants.workspace_ids_json) WHERE value = ?1)",
            [&request.workspace_id],
            |row| row.get(0),
        )
        .map_err(|_| "无法检查工作区服务授权引用".to_string())?;
    if referenced > 0 {
        return Err("工作区仍被服务授权引用，不能移除索引".into());
    }
    let changed = transaction
        .execute(
            "DELETE FROM workspaces WHERE id = ?1",
            [&request.workspace_id],
        )
        .map_err(|_| "无法移除工作区索引".to_string())?;
    if changed == 0 {
        return Err("工作区索引不存在".into());
    }
    transaction
        .commit()
        .map_err(|_| "无法提交移除工作区事务".to_string())
}

fn validate_service_grant_input(request: &SaveServiceGrantsRequest) -> Result<(), String> {
    validate_id(&request.agent_id, "Agent 标识")?;
    let mut unique = HashSet::new();
    for grant in &request.grants {
        validate_id(&grant.id, "服务授权标识")?;
        if grant.agent_id != request.agent_id {
            return Err("服务授权 Agent 标识不一致".into());
        }
        validate_id(&grant.department_id, "服务部门标识")?;
        validate_ids(&grant.workspace_ids, "服务工作区标识")?;
        validate_string_list(&grant.capabilities, "服务能力")?;
        validate_string_list(&grant.prohibitions, "服务禁止事项")?;
        if !matches!(grant.status.as_str(), "有效" | "暂停") {
            return Err("服务授权状态无效".into());
        }
        if !unique.insert(&grant.id) {
            return Err("服务授权标识重复".into());
        }
    }
    Ok(())
}

fn validate_service_grants(
    transaction: &Transaction<'_>,
    request: &SaveServiceGrantsRequest,
) -> Result<(), String> {
    for grant in &request.grants {
        if department_company(transaction, &grant.department_id)?.is_none() {
            return Err("服务授权目标部门不存在".into());
        }
        for workspace_id in &grant.workspace_ids {
            let company_id: Option<Option<String>> = transaction
                .query_row(
                    "SELECT company_id FROM workspaces WHERE id = ?1",
                    [workspace_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| "无法校验服务授权工作区".to_string())?;
            if company_id.flatten() != department_company(transaction, &grant.department_id)? {
                return Err("服务授权工作区必须与目标部门属于同一公司".into());
            }
        }
    }
    Ok(())
}

fn replace_service_grants_in(
    transaction: &Transaction<'_>,
    request: &SaveServiceGrantsRequest,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM service_grants WHERE agent_id = ?1",
            [&request.agent_id],
        )
        .map_err(|_| "无法替换服务授权".to_string())?;
    let now = Utc::now().to_rfc3339();
    for grant in &request.grants {
        transaction.execute(
            "INSERT INTO service_grants (id, agent_id, department_id, capabilities_json, workspace_ids_json, prohibitions_json, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![grant.id, grant.agent_id, grant.department_id, json(&grant.capabilities, "服务能力")?, json(&grant.workspace_ids, "服务工作区")?, json(&grant.prohibitions, "服务禁止事项")?, grant.status, now],
        ).map_err(|_| "无法保存服务授权".to_string())?;
    }
    Ok(())
}

pub(crate) fn save_service_grants_at(
    path: &Path,
    request: SaveServiceGrantsRequest,
) -> Result<Vec<ServiceGrantDto>, String> {
    validate_service_grant_input(&request)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始服务授权事务".to_string())?;
    validate_service_grants(&transaction, &request)?;
    replace_service_grants_in(&transaction, &request)?;
    transaction
        .commit()
        .map_err(|_| "无法提交服务授权事务".to_string())?;
    Ok(request.grants)
}

pub(crate) fn reconcile_agent_organization_at(
    path: &Path,
    agents_root: &Path,
    operation_id: &str,
    agent_id: &str,
    company_id: &str,
    primary_department_id: &str,
    grants: SaveServiceGrantsRequest,
) -> Result<(), String> {
    validate_id(operation_id, "Agent operation 标识")?;
    validate_id(agent_id, "Agent 标识")?;
    validate_id(company_id, "公司标识")?;
    validate_id(primary_department_id, "主属部门标识")?;
    if grants.agent_id != agent_id {
        return Err("服务授权 Agent 标识不一致".into());
    }
    validate_service_grant_input(&grants)?;
    let mut connection = open_at(path)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "无法开始 Agent 组织 reconcile 事务".to_string())?;
    validate_active_agent_company(&transaction, agents_root, agent_id, company_id)?;
    if department_company(&transaction, primary_department_id)?.as_deref() != Some(company_id) {
        return Err("Agent 主属部门必须属于同一公司".into());
    }
    let mut statement = transaction
        .prepare("SELECT id, member_agent_ids_json FROM departments WHERE company_id = ?1")
        .map_err(|_| "无法读取 Agent 组织成员关系".to_string())?;
    let rows = statement
        .query_map([company_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "无法查询 Agent 组织成员关系".to_string())?;
    let mut departments = Vec::new();
    for row in rows {
        let (department_id, encoded) = row.map_err(|_| "Agent 组织成员关系损坏".to_string())?;
        let mut members: Vec<String> =
            parse_json(encoded).map_err(|_| "Agent 组织成员关系损坏".to_string())?;
        members.retain(|id| id != agent_id);
        if department_id == primary_department_id {
            members.push(agent_id.to_string());
        }
        departments.push((department_id, members));
    }
    drop(statement);
    if !departments
        .iter()
        .any(|(id, _)| id == primary_department_id)
    {
        return Err("Agent 主属部门不存在".into());
    }
    for (department_id, members) in departments {
        transaction.execute(
            "UPDATE departments SET member_agent_ids_json = ?1, members = ?2, updated_at = ?3 WHERE id = ?4",
            params![json(&members, "部门成员")?, i64::try_from(members.len()).map_err(|_| "部门成员数量无效".to_string())?, Utc::now().to_rfc3339(), department_id],
        ).map_err(|_| "无法 reconcile Agent 部门成员关系".to_string())?;
    }
    validate_service_grants(&transaction, &grants)?;
    replace_service_grants_in(&transaction, &grants)?;
    if transaction.execute(
        "UPDATE agent_recovery_operations SET status = 'completed', payload_json = '{}', expected_manifest_hash = '', fixed_revision_id = NULL, completed_at = ?1 WHERE id = ?2 AND status = 'organization_pending'",
        params![Utc::now().to_rfc3339(), operation_id],
    ).map_err(|_| "无法完成 Agent commit operation".to_string())? != 1 {
        return Err("Agent commit operation 状态不允许完成".into());
    }
    transaction
        .commit()
        .map_err(|_| "无法提交 Agent 组织 reconcile 事务".to_string())
}

pub(crate) fn load_snapshot_at(path: &Path) -> Result<OrganizationSnapshotDto, String> {
    let connection = open_at(path)?;
    let mut companies = Vec::new();
    let mut statement = connection
        .prepare("SELECT id, name, mission, boundary_text, assistant_agent_id, department_ids_json, workspace_ids_json, shared_asset_ids_json FROM companies ORDER BY rowid")
        .map_err(|_| "无法读取公司".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(CompanyDto {
                id: row.get(0)?,
                name: row.get(1)?,
                mission: row.get(2)?,
                boundary: row.get(3)?,
                assistant_agent_id: row.get(4)?,
                department_ids: parse_json(row.get(5)?)?,
                workspace_ids: parse_json(row.get(6)?)?,
                shared_asset_ids: parse_json(row.get(7)?)?,
            })
        })
        .map_err(|_| "无法查询公司".to_string())?;
    for row in rows {
        companies.push(row.map_err(|_| "公司记录损坏".to_string())?);
    }

    let mut departments = Vec::new();
    let mut statement = connection
        .prepare("SELECT id, name, company_id, parent_department_id, parent_name, manager_agent_id, manager_name, mission, members, responsibilities_json, boundaries_json, delegation_depth, member_agent_ids_json, owned_sop_ids_json FROM departments ORDER BY rowid")
        .map_err(|_| "无法读取部门".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(DepartmentDto {
                id: row.get(0)?,
                name: row.get(1)?,
                company_id: row.get(2)?,
                parent_department_id: row.get(3)?,
                parent: row.get(4)?,
                manager_agent_id: row.get(5)?,
                manager: row.get(6)?,
                mission: row.get(7)?,
                members: u64::try_from(row.get::<_, i64>(8)?)
                    .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(8, i64::MIN))?,
                responsibilities: parse_json(row.get(9)?)?,
                boundaries: parse_json(row.get(10)?)?,
                delegation_depth: u64::try_from(row.get::<_, i64>(11)?)
                    .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(11, i64::MIN))?,
                member_agent_ids: parse_json(row.get(12)?)?,
                owned_sop_ids: parse_json(row.get(13)?)?,
            })
        })
        .map_err(|_| "无法查询部门".to_string())?;
    for row in rows {
        departments.push(row.map_err(|_| "部门记录损坏".to_string())?);
    }

    for company in &mut companies {
        company.department_ids = departments
            .iter()
            .filter(|department| department.company_id == company.id)
            .map(|department| department.id.clone())
            .collect();
    }

    let mut roles = Vec::new();
    let mut statement = connection
        .prepare("SELECT id, company_id, department_id, name, status, mission, responsibilities_json, inputs_json, deliverables_json, decision_boundaries_json, escalation_conditions_json, completion_definition_json FROM roles ORDER BY rowid")
        .map_err(|_| "无法读取岗位".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(RoleDto {
                id: row.get(0)?,
                company_id: row.get(1)?,
                department_id: row.get(2)?,
                name: row.get(3)?,
                status: row.get(4)?,
                mission: row.get(5)?,
                responsibilities: parse_json(row.get(6)?)?,
                inputs: parse_json(row.get(7)?)?,
                deliverables: parse_json(row.get(8)?)?,
                decision_boundaries: parse_json(row.get(9)?)?,
                escalation_conditions: parse_json(row.get(10)?)?,
                completion_definition: parse_json(row.get(11)?)?,
            })
        })
        .map_err(|_| "无法查询岗位".to_string())?;
    for row in rows {
        roles.push(row.map_err(|_| "岗位记录损坏".to_string())?);
    }

    let mut workspaces = Vec::new();
    let mut statement = connection
        .prepare("SELECT id, name, canonical_path, company_name, department_name, company_id, primary_department_id, project_lead_agent_id, collaborator_department_ids_json, config, health, agent_ids_json, asset_ids_json, public_memory_space_id, department_memory_space_ids_json, files_json, recent_edits_json FROM workspaces ORDER BY rowid")
        .map_err(|_| "无法读取工作区".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(WorkspaceDto {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                company: row.get(3)?,
                department: row.get(4)?,
                company_id: row.get(5)?,
                primary_department_id: row.get(6)?,
                project_lead_agent_id: row.get(7)?,
                collaborator_department_ids: parse_json(row.get(8)?)?,
                config: row.get(9)?,
                health: row.get(10)?,
                agent_ids: parse_json(row.get(11)?)?,
                asset_ids: parse_json(row.get(12)?)?,
                public_memory_space_id: row.get(13)?,
                department_memory_space_ids: parse_json(row.get(14)?)?,
                files: parse_json(row.get(15)?)?,
                recent_edits: parse_json(row.get(16)?)?,
            })
        })
        .map_err(|_| "无法查询工作区".to_string())?;
    for row in rows {
        workspaces.push(row.map_err(|_| "工作区记录损坏".to_string())?);
    }

    for company in &mut companies {
        company.workspace_ids = workspaces
            .iter()
            .filter(|workspace| workspace.company_id.as_deref() == Some(company.id.as_str()))
            .map(|workspace| workspace.id.clone())
            .collect();
    }

    let mut service_grants = Vec::new();
    let mut statement = connection
        .prepare("SELECT id, agent_id, department_id, capabilities_json, workspace_ids_json, prohibitions_json, status FROM service_grants ORDER BY rowid")
        .map_err(|_| "无法读取服务授权".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(ServiceGrantDto {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                department_id: row.get(2)?,
                capabilities: parse_json(row.get(3)?)?,
                workspace_ids: parse_json(row.get(4)?)?,
                prohibitions: parse_json(row.get(5)?)?,
                status: row.get(6)?,
            })
        })
        .map_err(|_| "无法查询服务授权".to_string())?;
    for row in rows {
        service_grants.push(row.map_err(|_| "服务授权记录损坏".to_string())?);
    }

    Ok(OrganizationSnapshotDto {
        schema_version: ORGANIZATION_SCHEMA_VERSION,
        companies,
        departments,
        roles,
        workspaces,
        service_grants,
    })
}

pub(crate) fn import_workspace_record_at(
    path: &Path,
    workspace_id: &str,
    canonical_path: &Path,
) -> Result<(), String> {
    validate_id(workspace_id, "工作区标识")?;
    let canonical = canonical_path.to_string_lossy().into_owned();
    let workspace = WorkspaceDto {
        id: workspace_id.to_string(),
        name: workspace_id.to_string(),
        path: canonical,
        company: None,
        department: None,
        company_id: None,
        primary_department_id: None,
        project_lead_agent_id: None,
        collaborator_department_ids: Vec::new(),
        config: "未验证".into(),
        health: "未验证".into(),
        agent_ids: Vec::new(),
        asset_ids: Vec::new(),
        public_memory_space_id: format!("mem-ws-{workspace_id}"),
        department_memory_space_ids: Vec::new(),
        files: Vec::new(),
        recent_edits: Vec::new(),
    };
    save_workspace_at(path, SaveWorkspaceRequest { workspace })?;
    Ok(())
}

pub(crate) fn workspace_path_at(
    path: &Path,
    workspace_id: &str,
) -> Result<std::path::PathBuf, String> {
    validate_id(workspace_id, "工作区标识")?;
    let connection = open_at(path)?;
    let canonical: String = connection
        .query_row(
            "SELECT canonical_path FROM workspaces WHERE id = ?1",
            [workspace_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "无法读取工作区索引".to_string())?
        .ok_or_else(|| "工作区尚未登记".to_string())?;
    Ok(std::path::PathBuf::from(canonical))
}

pub(crate) fn stable_entity_id(prefix: &str, name: &str) -> String {
    let digest =
        Sha256::digest(format!("{prefix}:{}:{}", name.trim(), Utc::now().to_rfc3339()).as_bytes());
    format!("{prefix}-{:x}", digest)[..prefix.len() + 1 + 24].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn company(id: &str) -> CompanyDto {
        CompanyDto {
            id: id.into(),
            name: format!("公司-{id}"),
            mission: "使命".into(),
            boundary: "边界".into(),
            assistant_agent_id: None,
            department_ids: Vec::new(),
            workspace_ids: Vec::new(),
            shared_asset_ids: Vec::new(),
        }
    }

    fn department(id: &str, company_id: &str, parent: Option<&str>) -> DepartmentDto {
        DepartmentDto {
            id: id.into(),
            name: format!("部门-{id}"),
            company_id: company_id.into(),
            parent_department_id: parent.map(str::to_string),
            parent: None,
            manager_agent_id: None,
            manager: None,
            mission: "使命".into(),
            members: 0,
            responsibilities: Vec::new(),
            boundaries: vec!["不授予权限".into()],
            delegation_depth: 1,
            member_agent_ids: Vec::new(),
            owned_sop_ids: Vec::new(),
        }
    }

    fn managed_agent(agents_root: &Path, id: &str, company_id: &str) {
        let package = agents_root.join(format!("agt_{id}"));
        fs::create_dir_all(package.join("config")).unwrap();
        fs::write(
            package.join(".bandi-agent.json"),
            serde_json::to_vec(&serde_json::json!({ "id": id })).unwrap(),
        )
        .unwrap();
        fs::write(
            package.join("agent.yaml"),
            format!("schemaVersion: 1\nid: {id}\ncompanyId: {company_id}\nstatus: active\n"),
        )
        .unwrap();
        fs::write(package.join("instructions.md"), "# Instructions\n").unwrap();
        for (name, content) in [
            ("rules.yaml", "schemaVersion: 1\nrules: []\n"),
            ("skills.yaml", "schemaVersion: 1\nskills: []\n"),
            ("mcp.yaml", "schemaVersion: 1\nmcp: []\n"),
            ("sop.yaml", "schemaVersion: 1\nsop: []\n"),
            ("hooks.yaml", "schemaVersion: 1\nhooks: []\n"),
            ("commands.yaml", "schemaVersion: 1\ncommands: []\n"),
            (
                "permissions.yaml",
                "schemaVersion: 1\npermissions:\n  files: 未授予\n  commands: 禁止\n  network: 禁止\n  delegation: 禁止\n",
            ),
            (
                "orchestration.yaml",
                "schemaVersion: 1\norchestration: { enabled: false, maxDelegationDepth: 0, allowedAgentIds: [], allowedRoleIds: [], allowedDepartmentIds: [], requireWorkspaceBinding: true, requireSopMatch: true, requireServiceGrantForCrossDepartment: true, escalationConditions: [], prohibitions: [] }\n",
            ),
            (
                "context.yaml",
                "schemaVersion: 1\ncontextPolicy:\n  enabled: true\n  triggerRatio: 0.8\n  targetRatio: 0.5\n  protectRecentTurns: 6\n  protectOpeningTurns: 2\ncontextWindowTokens: 200000\noutputParameterBindings: []\n",
            ),
        ] {
            fs::write(package.join("config").join(name), content).unwrap();
        }
    }

    #[test]
    fn organization_snapshot_matches_shared_fixture() {
        let snapshot: OrganizationSnapshotDto = serde_json::from_str(include_str!(
            "../../../../packages/contracts/fixtures/organization-snapshot.valid.json"
        ))
        .unwrap();
        assert_eq!(snapshot.schema_version, 1);
        assert_eq!(snapshot.companies[0].id, "company-acme");
        assert_eq!(snapshot.departments[0].company_id, snapshot.companies[0].id);
        assert_eq!(
            snapshot.workspaces[0].primary_department_id.as_deref(),
            Some(snapshot.departments[0].id.as_str())
        );
        assert_eq!(snapshot.service_grants[0].agent_id, "agent-owner");
    }

    #[test]
    fn governed_workspace_requires_active_same_company_lead() {
        let root = tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        save_company_at(
            &database,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        save_department_at(
            &database,
            SaveDepartmentRequest {
                department: department("owner", "a", None),
            },
        )
        .unwrap();
        managed_agent(&agents, "lead", "a");
        let workspace = WorkspaceDto {
            id: "ws".into(),
            name: "Workspace".into(),
            path: "/tmp/ws".into(),
            company: Some("公司-a".into()),
            department: Some("部门-owner".into()),
            company_id: Some("a".into()),
            primary_department_id: Some("owner".into()),
            project_lead_agent_id: Some("lead".into()),
            collaborator_department_ids: Vec::new(),
            config: "未验证".into(),
            health: "未验证".into(),
            agent_ids: vec!["lead".into()],
            asset_ids: Vec::new(),
            public_memory_space_id: "mem-ws-ws".into(),
            department_memory_space_ids: Vec::new(),
            files: Vec::new(),
            recent_edits: Vec::new(),
        };
        save_workspace_governed_at(
            &database,
            &agents,
            SaveWorkspaceRequest {
                workspace: workspace.clone(),
            },
        )
        .unwrap();

        let mut missing = workspace.clone();
        missing.id = "missing-lead".into();
        missing.path = "/tmp/missing-lead".into();
        missing.project_lead_agent_id = None;
        assert_eq!(
            save_workspace_governed_at(
                &database,
                &agents,
                SaveWorkspaceRequest { workspace: missing },
            )
            .unwrap_err(),
            "已关联组织的工作区必须设置默认项目负责人"
        );

        managed_agent(&agents, "inactive", "a");
        fs::write(
            agents.join("agt_inactive/agent.yaml"),
            "schemaVersion: 1\nid: inactive\ncompanyId: a\nstatus: inactive\n",
        )
        .unwrap();
        let mut inactive = workspace;
        inactive.id = "inactive-lead".into();
        inactive.path = "/tmp/inactive-lead".into();
        inactive.project_lead_agent_id = Some("inactive".into());
        assert_eq!(
            save_workspace_governed_at(
                &database,
                &agents,
                SaveWorkspaceRequest {
                    workspace: inactive,
                },
            )
            .unwrap_err(),
            "Agent 必须处于 active 状态"
        );
    }

    #[test]
    fn new_database_migrates_to_latest_without_changing_wire_version() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        let connection = open_at(&path).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let recovery_table: String = connection
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_revision_recovery'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        drop(connection);
        assert_eq!(version, DATABASE_SCHEMA_VERSION);
        assert_eq!(recovery_table, "memory_revision_recovery");
        assert_eq!(
            load_snapshot_at(&path).unwrap().schema_version,
            ORGANIZATION_SCHEMA_VERSION
        );
    }

    #[test]
    fn existing_v8_database_replaces_incompatible_agent_recovery_table() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        let connection = open_at(&path).unwrap();
        connection
            .execute_batch(
                "DROP TABLE agent_recovery_operations;
                 CREATE TABLE agent_recovery_operations (
                   id TEXT PRIMARY KEY,
                   request_id TEXT NOT NULL UNIQUE,
                   agent_id TEXT NOT NULL,
                   operation_kind TEXT NOT NULL,
                   status TEXT NOT NULL,
                   recovery_ref TEXT,
                   detail_json TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   completed_at TEXT
                 );
                 PRAGMA user_version = 8;",
            )
            .unwrap();
        drop(connection);

        let connection = open_at(&path).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let payload_column: String = connection
            .query_row(
                "SELECT name FROM pragma_table_info('agent_recovery_operations') WHERE name = 'payload_json'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(version, DATABASE_SCHEMA_VERSION);
        assert_eq!(payload_column, "payload_json");
    }

    #[test]
    fn existing_v2_database_adds_recovery_table_without_losing_data() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("kept"),
            },
        )
        .unwrap();
        let connection = Connection::open(&path).unwrap();
        connection
            .execute(
                "INSERT INTO memory_spaces (id, scope_type, agent_id, owner_kind, owner_agent_id, steward_agent_id, reviewer_principal_kind, reviewer_principal_id, review_policy, visibility_policy, storage_profile_version, state, current_revision_id, content_hash, updated_at) VALUES ('memory-agent-worker', 'agent_long_term', 'worker', 'agent', 'worker', 'worker', 'agent', 'reviewer', 'independent_reviewer', 'agent_private', 'memory-v1', 'active', NULL, 'sha256:old', '2026-09-01T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute_batch(
                "DROP TABLE backup_restore_operations;
                 DROP TABLE backup_snapshot_entries;
                 DROP TABLE backup_snapshots;
                 DROP TABLE memory_revision_recovery;
                 PRAGMA user_version = 2;",
            )
            .unwrap();
        drop(connection);

        let connection = open_at(&path).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let recovery_table: String = connection
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_revision_recovery'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let memory_space_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM memory_spaces", [], |row| row.get(0))
            .unwrap();
        drop(connection);

        assert_eq!(version, DATABASE_SCHEMA_VERSION);
        assert_eq!(recovery_table, "memory_revision_recovery");
        assert_eq!(memory_space_count, 1);
        let snapshot = load_snapshot_at(&path).unwrap();
        assert_eq!(snapshot.schema_version, ORGANIZATION_SCHEMA_VERSION);
        assert_eq!(snapshot.companies[0].id, "kept");
    }

    #[test]
    fn existing_v4_database_adds_backup_tables_without_losing_data() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("kept-v4"),
            },
        )
        .unwrap();
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "DROP TABLE backup_restore_operations;
                 DROP TABLE backup_snapshot_entries;
                 DROP TABLE backup_snapshots;
                 PRAGMA user_version = 4;",
            )
            .unwrap();
        drop(connection);

        let connection = open_at(&path).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let backup_tables: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name IN (
                   'backup_snapshots',
                   'backup_snapshot_entries',
                   'backup_restore_operations'
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        drop(connection);

        assert_eq!(version, DATABASE_SCHEMA_VERSION);
        assert_eq!(backup_tables, 3);
        assert_eq!(load_snapshot_at(&path).unwrap().companies[0].id, "kept-v4");
    }

    #[test]
    fn database_uses_wal_and_survives_reopen() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        let snapshot = load_snapshot_at(&path).unwrap();
        assert_eq!(snapshot.companies.len(), 1);
        assert!(snapshot.companies[0].department_ids.is_empty());
        assert!(snapshot.companies[0].workspace_ids.is_empty());
        let connection = Connection::open(path).unwrap();
        let mode: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[test]
    fn company_relationship_ids_are_derived_from_relations() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        let mut stored_company = company("a");
        stored_company.department_ids = vec!["stale-department".into()];
        stored_company.workspace_ids = vec!["stale-workspace".into()];
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: stored_company,
            },
        )
        .unwrap();
        save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("owner", "a", None),
            },
        )
        .unwrap();
        let workspace = WorkspaceDto {
            id: "ws".into(),
            name: "Workspace".into(),
            path: "/tmp/ws".into(),
            company: Some("公司-a".into()),
            department: Some("部门-owner".into()),
            company_id: Some("a".into()),
            primary_department_id: Some("owner".into()),
            project_lead_agent_id: None,
            collaborator_department_ids: Vec::new(),
            config: "未验证".into(),
            health: "未验证".into(),
            agent_ids: Vec::new(),
            asset_ids: Vec::new(),
            public_memory_space_id: "mem-ws-ws".into(),
            department_memory_space_ids: Vec::new(),
            files: Vec::new(),
            recent_edits: Vec::new(),
        };
        save_workspace_at(&path, SaveWorkspaceRequest { workspace }).unwrap();
        let snapshot = load_snapshot_at(&path).unwrap();
        assert_eq!(snapshot.companies[0].department_ids, ["owner"]);
        assert_eq!(snapshot.companies[0].workspace_ids, ["ws"]);
    }

    #[test]
    fn department_graph_rejects_cycles_and_cross_company_parents() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("b"),
            },
        )
        .unwrap();
        save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("root", "a", None),
            },
        )
        .unwrap();
        save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("child", "a", Some("root")),
            },
        )
        .unwrap();
        let error = save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("root", "a", Some("child")),
            },
        )
        .unwrap_err();
        assert_eq!(error, "组织关系必须无环");
        let error = save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("foreign", "b", Some("root")),
            },
        )
        .unwrap_err();
        assert_eq!(error, "上级部门必须属于同一公司");
    }

    #[test]
    fn workspace_requires_single_company_scoped_responsibility() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("owner", "a", None),
            },
        )
        .unwrap();
        let workspace = WorkspaceDto {
            id: "ws".into(),
            name: "Workspace".into(),
            path: "/tmp/ws".into(),
            company: Some("公司-a".into()),
            department: Some("部门-owner".into()),
            company_id: Some("a".into()),
            primary_department_id: Some("owner".into()),
            project_lead_agent_id: None,
            collaborator_department_ids: vec!["owner".into()],
            config: "未验证".into(),
            health: "未验证".into(),
            agent_ids: Vec::new(),
            asset_ids: Vec::new(),
            public_memory_space_id: "mem-ws-ws".into(),
            department_memory_space_ids: Vec::new(),
            files: Vec::new(),
            recent_edits: Vec::new(),
        };
        assert_eq!(
            save_workspace_at(&path, SaveWorkspaceRequest { workspace }).unwrap_err(),
            "主责部门不能同时作为协作部门"
        );
    }

    #[test]
    fn removed_workspace_does_not_reappear_after_lookup_or_reopen() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        let workspace_root = root.path().join("workspace");
        fs::create_dir(&workspace_root).unwrap();
        import_workspace_record_at(&path, "ws", &workspace_root).unwrap();
        remove_workspace_at(
            &path,
            RemoveWorkspaceRequest {
                workspace_id: "ws".into(),
            },
        )
        .unwrap();

        assert_eq!(
            workspace_path_at(&path, "ws").unwrap_err(),
            "工作区尚未登记"
        );
        assert!(load_snapshot_at(&path).unwrap().workspaces.is_empty());
        drop(open_at(&path).unwrap());
        assert_eq!(
            workspace_path_at(&path, "ws").unwrap_err(),
            "工作区尚未登记"
        );
        assert!(load_snapshot_at(&path).unwrap().workspaces.is_empty());
    }

    #[test]
    fn stable_entity_id_is_ascii_for_chinese_workspace_name() {
        let id = stable_entity_id("workspace", "中文项目");
        assert!(validate_identifier(&id));
        assert!(id.is_ascii());
        assert!(id.starts_with("workspace-"));
    }

    #[test]
    fn service_grants_are_replaced_transactionally() {
        let root = tempdir().unwrap();
        let path = root.path().join("bandi.db");
        save_company_at(
            &path,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        save_department_at(
            &path,
            SaveDepartmentRequest {
                department: department("target", "a", None),
            },
        )
        .unwrap();
        let workspace = WorkspaceDto {
            id: "ws".into(),
            name: "Workspace".into(),
            path: "/tmp/ws".into(),
            company: Some("公司-a".into()),
            department: Some("部门-target".into()),
            company_id: Some("a".into()),
            primary_department_id: Some("target".into()),
            project_lead_agent_id: None,
            collaborator_department_ids: Vec::new(),
            config: "未验证".into(),
            health: "未验证".into(),
            agent_ids: Vec::new(),
            asset_ids: Vec::new(),
            public_memory_space_id: "mem-ws-ws".into(),
            department_memory_space_ids: Vec::new(),
            files: Vec::new(),
            recent_edits: Vec::new(),
        };
        save_workspace_at(&path, SaveWorkspaceRequest { workspace }).unwrap();
        let grant = ServiceGrantDto {
            id: "grant".into(),
            agent_id: "agent".into(),
            department_id: "target".into(),
            capabilities: vec!["审查".into()],
            workspace_ids: vec!["ws".into()],
            prohibitions: vec!["不得发布".into()],
            status: "有效".into(),
        };
        save_service_grants_at(
            &path,
            SaveServiceGrantsRequest {
                agent_id: "agent".into(),
                grants: vec![grant],
            },
        )
        .unwrap();
        save_service_grants_at(
            &path,
            SaveServiceGrantsRequest {
                agent_id: "agent".into(),
                grants: Vec::new(),
            },
        )
        .unwrap();
        assert!(load_snapshot_at(&path).unwrap().service_grants.is_empty());
    }

    #[test]
    fn company_assistant_requires_existing_same_company_agent() {
        let root = tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        managed_agent(&agents, "assistant", "a");
        let mut value = company("a");
        value.assistant_agent_id = Some("assistant".into());
        save_company_governed_at(&database, &agents, SaveCompanyRequest { company: value })
            .unwrap();

        let mut missing = company("missing-company");
        missing.assistant_agent_id = Some("missing".into());
        assert_eq!(
            save_company_governed_at(&database, &agents, SaveCompanyRequest { company: missing },)
                .unwrap_err(),
            "Agent 不存在"
        );

        let mut foreign = company("b");
        foreign.assistant_agent_id = Some("assistant".into());
        assert_eq!(
            save_company_governed_at(&database, &agents, SaveCompanyRequest { company: foreign },)
                .unwrap_err(),
            "Agent 必须属于同一公司"
        );
    }

    #[test]
    fn department_members_require_existing_same_company_agents() {
        let root = tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        save_company_at(
            &database,
            SaveCompanyRequest {
                company: company("a"),
            },
        )
        .unwrap();
        managed_agent(&agents, "manager", "a");
        managed_agent(&agents, "foreign", "b");

        let mut valid = department("valid", "a", None);
        valid.member_agent_ids = vec!["manager".into()];
        valid.manager_agent_id = Some("manager".into());
        save_department_governed_at(
            &database,
            &agents,
            SaveDepartmentRequest { department: valid },
        )
        .unwrap();

        let mut missing = department("missing", "a", None);
        missing.member_agent_ids = vec!["unknown".into()];
        assert_eq!(
            save_department_governed_at(
                &database,
                &agents,
                SaveDepartmentRequest {
                    department: missing
                },
            )
            .unwrap_err(),
            "Agent 不存在"
        );

        let mut foreign = department("foreign-department", "a", None);
        foreign.member_agent_ids = vec!["foreign".into()];
        assert_eq!(
            save_department_governed_at(
                &database,
                &agents,
                SaveDepartmentRequest {
                    department: foreign
                },
            )
            .unwrap_err(),
            "Agent 必须属于同一公司"
        );
    }

    #[test]
    fn department_manager_must_be_a_member() {
        let root = tempdir().unwrap();
        let database = root.path().join("bandi.db");
        let agents = root.path().join("agents");
        let mut value = department("team", "a", None);
        value.manager_agent_id = Some("manager".into());
        assert_eq!(
            save_department_governed_at(
                &database,
                &agents,
                SaveDepartmentRequest { department: value },
            )
            .unwrap_err(),
            "部门主管必须属于该部门"
        );
    }
}
