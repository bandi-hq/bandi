use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use crate::{domain_store, local_service};

pub(crate) const PROFILE_VERSION: &str = "memory-v1";

#[derive(Debug, Clone)]
pub(crate) enum ScopeKey {
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

#[derive(Debug, Clone)]
pub(crate) enum Owner {
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

#[derive(Debug, Clone)]
pub(crate) struct ResolvedMemoryTarget {
    pub(crate) space_id: String,
    pub(crate) scope_type: &'static str,
    pub(crate) scope_key: ScopeKey,
    pub(crate) owner: Owner,
    pub(crate) steward_agent_id: String,
    pub(crate) reviewer_agent_id: String,
    pub(crate) visibility_policy: &'static str,
    pub(crate) state: &'static str,
    pub(crate) root_kind: local_service::RootKind,
    pub(crate) relative_path: String,
    pub(crate) root: PathBuf,
    pub(crate) target: PathBuf,
}

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && value != "."
        && value != "..";
    if valid {
        Ok(())
    } else {
        Err(format!("{label}无效"))
    }
}

fn agent_package(agents_root: &Path, agent_id: &str) -> Result<PathBuf, String> {
    validate_id(agent_id, "Agent 标识")?;
    let package = agents_root.join(format!("agt_{agent_id}"));
    let metadata =
        fs::symlink_metadata(&package).map_err(|_| "受管 AgentPackage 不存在".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("受管 AgentPackage 必须是普通目录".into());
    }
    Ok(package)
}

fn agent_record(agents_root: &Path, agent_id: &str) -> Result<serde_json::Value, String> {
    let package = agent_package(agents_root, agent_id)?;
    let path = package.join(".bandi-agent.json");
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| "Agent 身份索引不存在或不可读取".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Agent 身份索引必须是普通文件".into());
    }
    serde_json::from_slice(
        &fs::read(path).map_err(|_| "Agent 身份索引不存在或不可读取".to_string())?,
    )
    .map_err(|_| "Agent 身份索引已损坏".to_string())
}

fn agent_reviewer(
    snapshot: &domain_store::OrganizationSnapshotDto,
    agents_root: &Path,
    agent_id: &str,
) -> Result<String, String> {
    let record = agent_record(agents_root, agent_id)?;
    if let Some(manager) = record
        .get("managerAgentId")
        .and_then(serde_json::Value::as_str)
    {
        validate_id(manager, "直属主管标识")?;
        if manager == agent_id {
            return Err("提议者不能审核自己的候选".into());
        }
        return Ok(manager.into());
    }
    let company_id = record
        .get("companyId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "没有直属主管或所属公司，无法确定独立审核者".to_string())?;
    let reviewer = snapshot
        .companies
        .iter()
        .find(|company| company.id == company_id)
        .and_then(|company| company.assistant_agent_id.clone())
        .ok_or_else(|| "公司未配置董事长助理，无法确定独立审核者".to_string())?;
    if reviewer == agent_id {
        return Err("提议者不能审核自己的候选".into());
    }
    Ok(reviewer)
}

fn workspace_root(
    database: &Path,
    registry_root: &Path,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    validate_id(workspace_id, "Workspace 标识")?;
    if let Ok(path) = domain_store::workspace_path_at(database, workspace_id) {
        return local_service::ensure_registered_workspace_path(&path);
    }
    let path = local_service::workspace_path_from_registry_at(registry_root, workspace_id)?;
    domain_store::import_workspace_record_at(database, workspace_id, &path)?;
    Ok(path)
}

fn has_workspace_binding(
    agents_root: &Path,
    agent_id: &str,
    workspace_id: &str,
) -> Result<bool, String> {
    let package = agent_package(agents_root, agent_id)?;
    let directory = package.join("workspaces").join(workspace_id);
    let directory_metadata = match fs::symlink_metadata(&directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("无法检查 WorkspaceBinding".into()),
    };
    if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
        return Err("WorkspaceBinding 目录必须是普通目录".into());
    }
    let path = directory.join("config.yaml");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("无法检查 WorkspaceBinding".into()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("WorkspaceBinding 必须是普通文件".into());
    }
    let document: serde_yaml::Value = serde_yaml::from_str(
        &fs::read_to_string(path).map_err(|_| "无法读取 WorkspaceBinding".to_string())?,
    )
    .map_err(|_| "WorkspaceBinding 已损坏".to_string())?;
    let actual = document
        .get("workspaceBinding")
        .and_then(|binding| binding.get("workspaceId"))
        .and_then(serde_yaml::Value::as_str);
    Ok(actual == Some(workspace_id))
}

fn company_assistant(
    snapshot: &domain_store::OrganizationSnapshotDto,
    company_id: &str,
) -> Result<String, String> {
    snapshot
        .companies
        .iter()
        .find(|company| company.id == company_id)
        .and_then(|company| company.assistant_agent_id.clone())
        .ok_or_else(|| "公司未配置董事长助理，无法升级独立审核".to_string())
}

fn department_manager(
    snapshot: &domain_store::OrganizationSnapshotDto,
    department_id: &str,
) -> Result<(String, String), String> {
    let department = snapshot
        .departments
        .iter()
        .find(|department| department.id == department_id)
        .ok_or_else(|| "Department 不存在".to_string())?;
    let manager = department
        .manager_agent_id
        .clone()
        .ok_or_else(|| "Department 未配置主管".to_string())?;
    Ok((department.company_id.clone(), manager))
}

fn workspace<'a>(
    snapshot: &'a domain_store::OrganizationSnapshotDto,
    workspace_id: &str,
) -> Result<&'a domain_store::WorkspaceDto, String> {
    snapshot
        .workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| "Workspace 尚未登记".to_string())
}

fn can_propose_department(
    snapshot: &domain_store::OrganizationSnapshotDto,
    agents_root: &Path,
    proposer_agent_id: &str,
    department_id: &str,
    workspace_id: &str,
) -> Result<bool, String> {
    let record = agent_record(agents_root, proposer_agent_id)?;
    if record
        .get("primaryDepartmentId")
        .and_then(serde_json::Value::as_str)
        == Some(department_id)
    {
        return Ok(true);
    }
    Ok(snapshot.service_grants.iter().any(|grant| {
        grant.agent_id == proposer_agent_id
            && grant.department_id == department_id
            && grant.status == "有效"
            && grant.workspace_ids.iter().any(|id| id == workspace_id)
    }))
}

#[allow(clippy::too_many_arguments)]
fn build(
    space_id: String,
    scope_type: &'static str,
    scope_key: ScopeKey,
    owner: Owner,
    steward_agent_id: String,
    reviewer_agent_id: String,
    visibility_policy: &'static str,
    root_kind: local_service::RootKind,
    relative_path: String,
    root: PathBuf,
) -> ResolvedMemoryTarget {
    let target = root.join(&relative_path);
    ResolvedMemoryTarget {
        space_id,
        scope_type,
        scope_key,
        owner,
        steward_agent_id,
        reviewer_agent_id,
        visibility_policy,
        state: "active",
        root_kind,
        relative_path,
        root,
        target,
    }
}

pub(crate) fn discover_requested(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    proposer_agent_id: &str,
) -> Result<(Vec<ResolvedMemoryTarget>, Vec<String>), String> {
    validate_id(proposer_agent_id, "提议者标识")?;
    agent_package(agents_root, proposer_agent_id)?;
    let snapshot = domain_store::load_snapshot_at(database)?;
    let mut space_ids = vec![format!("memory-agent-{proposer_agent_id}")];
    let mut diagnostics = Vec::new();

    for item in &snapshot.workspaces {
        match has_workspace_binding(agents_root, proposer_agent_id, &item.id) {
            Ok(true) => {
                space_ids.push(format!("mem-agent-ws-{proposer_agent_id}-{}", item.id));
                space_ids.push(format!("mem-ws-{}", item.id));
            }
            Ok(false) => continue,
            Err(message) => {
                diagnostics.push(format!("Workspace {}：{message}", item.id));
                continue;
            }
        }
        let mut departments = Vec::new();
        if let Some(primary) = &item.primary_department_id {
            departments.push(primary.clone());
        }
        departments.extend(item.collaborator_department_ids.clone());
        departments.sort();
        departments.dedup();
        for department_id in departments {
            match can_propose_department(
                &snapshot,
                agents_root,
                proposer_agent_id,
                &department_id,
                &item.id,
            ) {
                Ok(true) => space_ids.push(format!("mem-{department_id}-{}", item.id)),
                Ok(false) => {}
                Err(message) => diagnostics.push(format!(
                    "Department {department_id} × Workspace {}：{message}",
                    item.id
                )),
            }
        }
    }

    let mut spaces = Vec::new();
    for space_id in space_ids {
        match resolve_requested(
            database,
            agents_root,
            registry_root,
            &space_id,
            proposer_agent_id,
        ) {
            Ok(target) => spaces.push(target),
            Err(message) => diagnostics.push(format!("MemorySpace {space_id}：{message}")),
        }
    }
    Ok((spaces, diagnostics))
}

pub(crate) fn resolve_requested(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    space_id: &str,
    proposer_agent_id: &str,
) -> Result<ResolvedMemoryTarget, String> {
    validate_id(space_id, "MemorySpace 标识")?;
    validate_id(proposer_agent_id, "提议者标识")?;
    let snapshot = domain_store::load_snapshot_at(database)?;
    let reviewer = agent_reviewer(&snapshot, agents_root, proposer_agent_id)?;
    if space_id == format!("memory-agent-{proposer_agent_id}") {
        let root = agent_package(agents_root, proposer_agent_id)?;
        return Ok(build(
            space_id.into(),
            "agent_long_term",
            ScopeKey::AgentLongTerm {
                agent_id: proposer_agent_id.into(),
            },
            Owner::Agent {
                agent_id: proposer_agent_id.into(),
            },
            proposer_agent_id.into(),
            reviewer,
            "agent_private",
            local_service::RootKind::Managed,
            "memory/long-term.md".into(),
            root,
        ));
    }
    for item in &snapshot.workspaces {
        if space_id == format!("mem-agent-ws-{proposer_agent_id}-{}", item.id) {
            workspace_root(database, registry_root, &item.id)?;
            if !has_workspace_binding(agents_root, proposer_agent_id, &item.id)? {
                return Err("Agent 未建立该 Workspace 的 WorkspaceBinding".into());
            }
            let root = agent_package(agents_root, proposer_agent_id)?;
            return Ok(build(
                space_id.into(),
                "agent_workspace",
                ScopeKey::AgentWorkspace {
                    agent_id: proposer_agent_id.into(),
                    workspace_id: item.id.clone(),
                },
                Owner::Agent {
                    agent_id: proposer_agent_id.into(),
                },
                proposer_agent_id.into(),
                reviewer,
                "agent_private",
                local_service::RootKind::Managed,
                format!("workspaces/{}/memory.md", item.id),
                root,
            ));
        }
        if space_id == format!("mem-ws-{}", item.id) {
            if !has_workspace_binding(agents_root, proposer_agent_id, &item.id)? {
                return Err("提议者未绑定该 Workspace".into());
            }
            let primary = item
                .primary_department_id
                .as_deref()
                .ok_or_else(|| "Workspace 未配置主责部门".to_string())?;
            let (company_id, steward) = department_manager(&snapshot, primary)?;
            if item.company_id.as_deref() != Some(company_id.as_str()) {
                return Err("Workspace 主责部门不属于所属公司".into());
            }
            let reviewer = if proposer_agent_id == steward {
                company_assistant(&snapshot, &company_id)?
            } else {
                steward.clone()
            };
            let root = workspace_root(database, registry_root, &item.id)?;
            return Ok(build(
                space_id.into(),
                "workspace_shared",
                ScopeKey::WorkspaceShared {
                    workspace_id: item.id.clone(),
                },
                Owner::Workspace {
                    workspace_id: item.id.clone(),
                },
                steward,
                reviewer,
                "workspace_shared",
                local_service::RootKind::Workspace,
                ".bandi/memory/public.md".into(),
                root,
            ));
        }
        let mut departments = Vec::new();
        if let Some(primary) = &item.primary_department_id {
            departments.push(primary.clone());
        }
        departments.extend(item.collaborator_department_ids.clone());
        for department_id in departments {
            if space_id != format!("mem-{department_id}-{}", item.id) {
                continue;
            }
            let (company_id, steward) = department_manager(&snapshot, &department_id)?;
            if item.company_id.as_deref() != Some(company_id.as_str()) {
                return Err("Department 与 Workspace 不属于同一 Company".into());
            }
            if !can_propose_department(
                &snapshot,
                agents_root,
                proposer_agent_id,
                &department_id,
                &item.id,
            )? {
                return Err("提议者无权向该 Department × Workspace 空间提交候选".into());
            }
            let reviewer = if proposer_agent_id == steward {
                company_assistant(&snapshot, &company_id)?
            } else {
                steward.clone()
            };
            let root = workspace_root(database, registry_root, &item.id)?;
            return Ok(build(
                space_id.into(),
                "department_workspace",
                ScopeKey::DepartmentWorkspace {
                    department_id: department_id.clone(),
                    workspace_id: item.id.clone(),
                },
                Owner::DepartmentWorkspace {
                    department_id: department_id.clone(),
                    workspace_id: item.id.clone(),
                },
                steward,
                reviewer,
                "department_workspace",
                local_service::RootKind::Workspace,
                format!(".bandi/memory/departments/{department_id}.md"),
                root,
            ));
        }
    }
    Err("目标 MemorySpace 不存在或提议者无权访问".into())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn resolve_stored(
    database: &Path,
    agents_root: &Path,
    registry_root: &Path,
    scope_type: &str,
    agent_id: Option<&str>,
    workspace_id: Option<&str>,
    department_id: Option<&str>,
    space_id: &str,
    steward_agent_id: String,
    reviewer_agent_id: String,
    state: &str,
) -> Result<ResolvedMemoryTarget, String> {
    let (scope_key, owner, visibility, root_kind, relative, root) = match scope_type {
        "agent_long_term" => {
            let agent = agent_id.ok_or_else(|| "MemorySpace Agent key 缺失".to_string())?;
            (
                ScopeKey::AgentLongTerm {
                    agent_id: agent.into(),
                },
                Owner::Agent {
                    agent_id: agent.into(),
                },
                "agent_private",
                local_service::RootKind::Managed,
                "memory/long-term.md".into(),
                agent_package(agents_root, agent)?,
            )
        }
        "agent_workspace" => {
            let agent = agent_id.ok_or_else(|| "MemorySpace Agent key 缺失".to_string())?;
            let workspace =
                workspace_id.ok_or_else(|| "MemorySpace Workspace key 缺失".to_string())?;
            workspace_root(database, registry_root, workspace)?;
            if !has_workspace_binding(agents_root, agent, workspace)? {
                return Err("Agent 的 WorkspaceBinding 已失效".into());
            }
            (
                ScopeKey::AgentWorkspace {
                    agent_id: agent.into(),
                    workspace_id: workspace.into(),
                },
                Owner::Agent {
                    agent_id: agent.into(),
                },
                "agent_private",
                local_service::RootKind::Managed,
                format!("workspaces/{workspace}/memory.md"),
                agent_package(agents_root, agent)?,
            )
        }
        "workspace_shared" => {
            let workspace =
                workspace_id.ok_or_else(|| "MemorySpace Workspace key 缺失".to_string())?;
            (
                ScopeKey::WorkspaceShared {
                    workspace_id: workspace.into(),
                },
                Owner::Workspace {
                    workspace_id: workspace.into(),
                },
                "workspace_shared",
                local_service::RootKind::Workspace,
                ".bandi/memory/public.md".into(),
                workspace_root(database, registry_root, workspace)?,
            )
        }
        "department_workspace" => {
            let workspace_id =
                workspace_id.ok_or_else(|| "MemorySpace Workspace key 缺失".to_string())?;
            let department =
                department_id.ok_or_else(|| "MemorySpace Department key 缺失".to_string())?;
            let snapshot = domain_store::load_snapshot_at(database)?;
            let item = workspace(&snapshot, workspace_id)?;
            let active = item.primary_department_id.as_deref() == Some(department)
                || item
                    .collaborator_department_ids
                    .iter()
                    .any(|id| id == department);
            if state == "active" && !active {
                return Err("Department × Workspace 关系已失效".into());
            }
            (
                ScopeKey::DepartmentWorkspace {
                    department_id: department.into(),
                    workspace_id: workspace_id.into(),
                },
                Owner::DepartmentWorkspace {
                    department_id: department.into(),
                    workspace_id: workspace_id.into(),
                },
                "department_workspace",
                local_service::RootKind::Workspace,
                format!(".bandi/memory/departments/{department}.md"),
                workspace_root(database, registry_root, workspace_id)?,
            )
        }
        _ => return Err("MemorySpace scope 已损坏".into()),
    };
    let target = root.join(&relative);
    Ok(ResolvedMemoryTarget {
        space_id: space_id.into(),
        scope_type: match scope_type {
            "agent_long_term" => "agent_long_term",
            "agent_workspace" => "agent_workspace",
            "workspace_shared" => "workspace_shared",
            _ => "department_workspace",
        },
        scope_key,
        owner,
        steward_agent_id,
        reviewer_agent_id,
        visibility_policy: visibility,
        state: if state == "active" {
            "active"
        } else {
            "read_only_history"
        },
        root_kind,
        relative_path: relative,
        root,
        target,
    })
}

pub(crate) fn read(target: &ResolvedMemoryTarget) -> Result<String, String> {
    ensure_safe_chain(&target.root, &target.relative_path, false)?;
    match fs::read_to_string(&target.target) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(_) => Err("无法读取正式 Memory".into()),
    }
}

pub(crate) fn ensure_safe_chain(
    root: &Path,
    relative_path: &str,
    create_parent: bool,
) -> Result<(), String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("正式 Memory 相对路径无效".into());
    }
    let mut current = root.to_path_buf();
    let components = relative.components().collect::<Vec<_>>();
    for component in components.iter().take(components.len().saturating_sub(1)) {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err("正式 Memory 路径包含符号链接或非目录分量".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create_parent => {
                fs::create_dir(&current).map_err(|_| "无法创建正式 Memory 目标目录".to_string())?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return Err("无法检查正式 Memory 目标目录".into()),
        }
    }
    if let Ok(metadata) = fs::symlink_metadata(root.join(relative)) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("正式 Memory 目标必须是普通文件".into());
        }
    }
    Ok(())
}
