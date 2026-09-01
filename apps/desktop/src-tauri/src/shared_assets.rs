use std::{
    collections::{HashMap, HashSet},
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    domain_store::OrganizationSnapshotDto,
    local_service::{diagnostic, AssetLocatorDto, DiagnosticDto, RootKind},
};

const SHARED_ASSET_SCHEMA_VERSION: u64 = 1;
const SHARED_ASSET_KINDS: &[&str] = &[
    "rule",
    "skill",
    "mcp",
    "sop",
    "hook",
    "command",
    "output_profile",
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SharedAssetNodeDto {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) company_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) department_id: Option<String>,
    pub(crate) locator: AssetLocatorDto,
    pub(crate) content_hash: String,
    pub(crate) parse_status: String,
    pub(crate) diagnostics: Vec<DiagnosticDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SharedAssetManifest {
    schema_version: u64,
    id: String,
    kind: String,
    company_id: String,
    #[serde(default)]
    department_id: Option<String>,
    content_file: String,
}

#[derive(Debug)]
pub(crate) struct SharedAssetIndex {
    pub(crate) nodes: Vec<SharedAssetNodeDto>,
    pub(crate) root_available: bool,
    pub(crate) diagnostics: Vec<DiagnosticDto>,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn content_hash(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn owner_is_registered(snapshot: &OrganizationSnapshotDto, manifest: &SharedAssetManifest) -> bool {
    let company = snapshot
        .companies
        .iter()
        .find(|company| company.id == manifest.company_id);
    let Some(company) = company else { return false };
    if !company.shared_asset_ids.iter().any(|id| id == &manifest.id) {
        return false;
    }
    match manifest.department_id.as_deref() {
        None => true,
        Some(department_id) => snapshot.departments.iter().any(|department| {
            department.id == department_id
                && department.company_id == manifest.company_id
                && (manifest.kind != "sop"
                    || department.owned_sop_ids.iter().any(|id| id == &manifest.id))
        }),
    }
}

fn safe_content_path(package: &Path, relative: &str) -> Result<PathBuf, Box<DiagnosticDto>> {
    let path = Path::new(relative);
    if path.is_absolute() || path.components().count() != 1 || relative == "asset.yaml" {
        return Err(Box::new(diagnostic(
            "shared_asset_content_path_invalid",
            "error",
            "共享资产 contentFile 必须是资产目录内的单个相对文件名",
            Some("contentFile".into()),
            Some("移除绝对路径、子目录和路径穿越"),
        )));
    }
    let target = package.join(path);
    let metadata = fs::symlink_metadata(&target).map_err(|_| {
        Box::new(diagnostic(
            "shared_asset_content_missing",
            "error",
            "共享资产正文不存在或不可访问",
            Some(relative.into()),
            Some("恢复 manifest 声明的正文文件"),
        ))
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(Box::new(diagnostic(
            "shared_asset_content_rejected",
            "error",
            "共享资产正文必须是资产目录内的普通文件",
            Some(relative.into()),
            Some("移除符号链接或非文件目标"),
        )));
    }
    Ok(target)
}

fn invalid_node(
    id: String,
    kind: String,
    company_id: String,
    department_id: Option<String>,
    relative_path: String,
    issue: DiagnosticDto,
) -> SharedAssetNodeDto {
    SharedAssetNodeDto {
        id,
        kind,
        company_id,
        department_id,
        locator: AssetLocatorDto {
            root_kind: RootKind::Bandi,
            display_path: relative_path.clone(),
            relative_path: Some(relative_path),
        },
        content_hash: content_hash(&[]),
        parse_status: "invalid".into(),
        diagnostics: vec![issue],
    }
}

fn discover_package(
    root: &Path,
    package: &Path,
    directory_id: &str,
    snapshot: &OrganizationSnapshotDto,
) -> SharedAssetNodeDto {
    let relative_manifest = format!("{directory_id}/asset.yaml");
    let manifest_path = package.join("asset.yaml");
    let manifest_metadata = fs::symlink_metadata(&manifest_path);
    if !matches!(&manifest_metadata, Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink())
    {
        return invalid_node(
            directory_id.into(),
            "unknown".into(),
            "unknown".into(),
            None,
            relative_manifest,
            diagnostic(
                "shared_asset_manifest_rejected",
                "error",
                "共享资产 manifest 必须是普通文件",
                Some("asset.yaml".into()),
                Some("恢复 canonical asset.yaml"),
            ),
        );
    }
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|content| serde_yaml::from_str::<SharedAssetManifest>(&content).ok());
    let Some(manifest) = manifest else {
        return invalid_node(
            directory_id.into(),
            "unknown".into(),
            "unknown".into(),
            None,
            relative_manifest,
            diagnostic(
                "shared_asset_manifest_invalid",
                "error",
                "共享资产 manifest 不符合冻结 schema",
                Some("asset.yaml".into()),
                Some("修正 YAML 字段、类型和未知字段"),
            ),
        );
    };
    let basic_valid = manifest.schema_version == SHARED_ASSET_SCHEMA_VERSION
        && manifest.id == directory_id
        && valid_id(&manifest.id)
        && valid_id(&manifest.company_id)
        && manifest.department_id.as_deref().is_none_or(valid_id)
        && SHARED_ASSET_KINDS.contains(&manifest.kind.as_str());
    if !basic_valid {
        return invalid_node(
            manifest.id,
            manifest.kind,
            manifest.company_id,
            manifest.department_id,
            relative_manifest,
            diagnostic(
                "shared_asset_identity_invalid",
                "error",
                "共享资产版本、稳定身份、类型或目录身份无效",
                Some("asset.yaml".into()),
                Some("保持目录名、id、kind 与 owner 字段符合共享资产 v1"),
            ),
        );
    }
    if !owner_is_registered(snapshot, &manifest) {
        return invalid_node(
            manifest.id,
            manifest.kind,
            manifest.company_id,
            manifest.department_id,
            relative_manifest,
            diagnostic(
                "shared_asset_owner_invalid",
                "error",
                "共享资产未在对应 Company 或 Department 中显式登记",
                Some("companyId".into()),
                Some("先在组织配置中登记共享资产及其归属"),
            ),
        );
    }
    let content_path = match safe_content_path(package, &manifest.content_file) {
        Ok(path) => path,
        Err(issue) => {
            return invalid_node(
                manifest.id,
                manifest.kind,
                manifest.company_id,
                manifest.department_id,
                relative_manifest,
                *issue,
            )
        }
    };
    let bytes = match fs::read(&content_path) {
        Ok(bytes) => bytes,
        Err(_) => {
            return invalid_node(
                manifest.id,
                manifest.kind,
                manifest.company_id,
                manifest.department_id,
                relative_manifest,
                diagnostic(
                    "shared_asset_content_unreadable",
                    "error",
                    "无法读取共享资产正文",
                    Some(manifest.content_file),
                    Some("检查正文文件权限"),
                ),
            )
        }
    };
    let relative_content = content_path
        .strip_prefix(root)
        .unwrap_or(&content_path)
        .to_string_lossy()
        .into_owned();
    SharedAssetNodeDto {
        id: manifest.id,
        kind: manifest.kind,
        company_id: manifest.company_id,
        department_id: manifest.department_id,
        locator: AssetLocatorDto {
            root_kind: RootKind::Bandi,
            display_path: relative_content.clone(),
            relative_path: Some(relative_content),
        },
        content_hash: content_hash(&bytes),
        parse_status: "parsed".into(),
        diagnostics: Vec::new(),
    }
}

pub(crate) fn discover(root: &Path, snapshot: &OrganizationSnapshotDto) -> SharedAssetIndex {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return SharedAssetIndex {
                nodes: Vec::new(),
                root_available: false,
                diagnostics: vec![diagnostic(
                    "shared_asset_root_not_initialized",
                    "info",
                    "Bandi 共享资产根尚未初始化",
                    None,
                    Some("创建首个真实共享资产后刷新索引"),
                )],
            }
        }
        Err(_) => {
            return SharedAssetIndex {
                nodes: Vec::new(),
                root_available: false,
                diagnostics: vec![diagnostic(
                    "shared_asset_root_unreadable",
                    "error",
                    "无法读取 Bandi 共享资产根",
                    None,
                    Some("检查应用数据目录权限"),
                )],
            }
        }
    };
    let mut nodes = Vec::new();
    let mut diagnostics = Vec::new();
    let mut seen = HashSet::new();
    for entry in entries.flatten() {
        let directory_id = entry.file_name().to_string_lossy().into_owned();
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !valid_id(&directory_id) || metadata.file_type().is_symlink() || !metadata.is_dir() {
            diagnostics.push(diagnostic(
                "shared_asset_directory_rejected",
                "error",
                "共享资产必须位于稳定 ID 命名的普通目录",
                Some(directory_id),
                Some("移除非法目录或符号链接"),
            ));
            continue;
        }
        let node = discover_package(root, &entry.path(), &directory_id, snapshot);
        if !seen.insert(node.id.clone()) {
            diagnostics.push(diagnostic(
                "shared_asset_id_conflict",
                "error",
                "发现重复共享资产稳定 ID",
                Some(node.id),
                Some("修复冲突 manifest"),
            ));
            continue;
        }
        nodes.push(node);
    }
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    SharedAssetIndex {
        nodes,
        root_available: true,
        diagnostics,
    }
}

pub(crate) fn agent_companies(snapshot: &OrganizationSnapshotDto) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for department in &snapshot.departments {
        for agent_id in department
            .member_agent_ids
            .iter()
            .chain(department.manager_agent_id.iter())
        {
            values
                .entry(agent_id.clone())
                .or_insert_with(|| department.company_id.clone());
        }
    }
    for company in &snapshot.companies {
        if let Some(agent_id) = &company.assistant_agent_id {
            values
                .entry(agent_id.clone())
                .or_insert_with(|| company.id.clone());
        }
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain_store::{CompanyDto, DepartmentDto};
    use tempfile::tempdir;

    fn snapshot() -> OrganizationSnapshotDto {
        OrganizationSnapshotDto {
            schema_version: 1,
            companies: vec![CompanyDto {
                id: "xinghe".into(),
                name: "星河".into(),
                mission: String::new(),
                boundary: String::new(),
                assistant_agent_id: None,
                department_ids: vec!["dev".into()],
                workspace_ids: Vec::new(),
                shared_asset_ids: vec!["skill-review".into()],
            }],
            departments: vec![DepartmentDto {
                id: "dev".into(),
                name: "研发".into(),
                company_id: "xinghe".into(),
                parent_department_id: None,
                parent: None,
                manager_agent_id: Some("zhouce".into()),
                manager: None,
                mission: String::new(),
                members: 1,
                responsibilities: Vec::new(),
                boundaries: Vec::new(),
                delegation_depth: 1,
                member_agent_ids: vec!["zhouce".into()],
                owned_sop_ids: Vec::new(),
            }],
            roles: Vec::new(),
            workspaces: Vec::new(),
            service_grants: Vec::new(),
        }
    }

    #[test]
    fn discovers_registered_shared_asset_with_bandi_locator() {
        let root = tempdir().unwrap();
        let package = root.path().join("skill-review");
        fs::create_dir(&package).unwrap();
        fs::write(package.join("asset.yaml"), "schemaVersion: 1\nid: skill-review\nkind: skill\ncompanyId: xinghe\ncontentFile: SKILL.md\n").unwrap();
        fs::write(package.join("SKILL.md"), "# Review\n").unwrap();

        let result = discover(root.path(), &snapshot());

        assert!(result.root_available);
        assert_eq!(result.nodes.len(), 1);
        assert_eq!(result.nodes[0].parse_status, "parsed");
        assert_eq!(result.nodes[0].locator.root_kind, RootKind::Bandi);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_shared_asset_content() {
        use std::os::unix::fs::symlink;

        let root = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let package = root.path().join("skill-review");
        fs::create_dir(&package).unwrap();
        fs::write(package.join("asset.yaml"), "schemaVersion: 1\nid: skill-review\nkind: skill\ncompanyId: xinghe\ncontentFile: SKILL.md\n").unwrap();
        fs::write(outside.path().join("secret.md"), "secret").unwrap();
        symlink(outside.path().join("secret.md"), package.join("SKILL.md")).unwrap();

        let result = discover(root.path(), &snapshot());

        assert_eq!(result.nodes[0].parse_status, "invalid");
        assert_eq!(
            result.nodes[0].diagnostics[0].code,
            "shared_asset_content_rejected"
        );
    }
}
