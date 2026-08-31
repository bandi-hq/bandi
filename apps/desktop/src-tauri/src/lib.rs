use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UiAsset {
    mime_type: &'static str,
    bytes: Vec<u8>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentPackageFile {
    path: String,
    content: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateManagedAgentRequest {
    agent_id: String,
    agent: serde_json::Value,
    files: Vec<AgentPackageFile>,
    avatar_bytes: Option<Vec<u8>>,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum AvatarChange {
    Keep,
    Replace { bytes: Vec<u8> },
    Remove,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveManagedAgentIdentityRequest {
    agent_id: String,
    agent: serde_json::Value,
    manifest: String,
    expected_manifest: String,
    avatar: AvatarChange,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAgentResult {
    agent: serde_json::Value,
    baseline: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchWorkspaceRequest {
    request_id: String,
    workspace_id: String,
    cwd: String,
    terminal_id: String,
    executable: String,
    args: Vec<String>,
    enter_bandi_on_start: bool,
}

#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum LaunchWorkspaceResult {
    Accepted {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "acceptedAt")]
        accepted_at: String,
    },
    FallbackRequired {
        #[serde(rename = "requestId")]
        request_id: String,
        executable: String,
        args: Vec<String>,
        message: String,
    },
    Rejected {
        #[serde(rename = "requestId")]
        request_id: String,
        code: String,
        message: String,
    },
}

fn terminal_bundle_id(id: &str) -> Result<&'static str, String> {
    match id {
        "system" | "terminal" => Ok("com.apple.Terminal"),
        "iterm2" => Ok("com.googlecode.iterm2"),
        "warp" => Ok("dev.warp.Warp-Stable"),
        "ghostty" => Ok("com.mitchellh.ghostty"),
        "wezterm" => Ok("com.github.wez.wezterm"),
        "kitty" => Ok("net.kovidgoyal.kitty"),
        "alacritty" => Ok("org.alacritty"),
        _ => Err("UNSUPPORTED_TERMINAL: 当前终端尚未加入安全白名单".into()),
    }
}

fn validate_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn validated_workspace_path(cwd: &str) -> Result<PathBuf, String> {
    let path = Path::new(cwd);
    if !path.is_absolute() {
        return Err("INVALID_WORKSPACE_PATH: 工作区必须使用绝对路径".into());
    }
    let canonical = fs::canonicalize(path)
        .map_err(|_| "WORKSPACE_UNAVAILABLE: 工作区目录不存在或不可访问".to_string())?;
    if !canonical.is_dir() {
        return Err("INVALID_WORKSPACE_PATH: 工作区路径不是目录".into());
    }
    Ok(canonical)
}

fn open_terminal_app(bundle_id: &str, cwd: &Path) -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .arg("-b")
        .arg(bundle_id)
        .arg(cwd)
        .status()
        .map_err(|_| "TERMINAL_OPEN_FAILED: 无法请求 macOS 打开终端".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("TERMINAL_OPEN_FAILED: 终端未安装或未接受目录打开请求".into())
    }
}

fn validate_launch(executable: &str, args: &[String]) -> Result<Vec<String>, String> {
    if executable.is_empty() || executable.len() > 512 || executable.contains(['\0', '\r', '\n']) {
        return Err("INVALID_EXECUTABLE: 启动程序无效".into());
    }
    if executable.contains('/') {
        let path = Path::new(executable);
        if !path.is_absolute() || executable.split('/').any(|segment| segment == "..") {
            return Err("INVALID_EXECUTABLE: 自定义程序必须使用无路径穿越的绝对路径".into());
        }
        let metadata = fs::metadata(path)
            .map_err(|_| "EXECUTABLE_UNAVAILABLE: 自定义启动程序不存在或不可访问".to_string())?;
        if !metadata.is_file() {
            return Err("INVALID_EXECUTABLE: 自定义启动程序不是普通文件".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if metadata.permissions().mode() & 0o111 == 0 {
                return Err("INVALID_EXECUTABLE: 自定义启动程序不可执行".into());
            }
        }
    } else if !executable
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-'))
    {
        return Err("INVALID_EXECUTABLE: 启动程序只能是普通命令名或绝对路径".into());
    }
    if args.len() > 32
        || args
            .iter()
            .any(|arg| arg.is_empty() || arg.len() > 512 || arg.contains(['\0', '\r', '\n']))
        || args.iter().map(String::len).sum::<usize>() > 4096
    {
        return Err("INVALID_ARGUMENTS: 启动参数无效或超过限制".into());
    }
    Ok(args.to_vec())
}

fn launch_args(request: &LaunchWorkspaceRequest) -> Result<Vec<String>, String> {
    let mut args = validate_launch(&request.executable, &request.args)?;
    if request.enter_bandi_on_start && !args.iter().any(|arg| arg == "/bandi:bandi") {
        args.push("/bandi:bandi".into());
    }
    Ok(args)
}

fn direct_terminal_command(terminal_id: &str) -> Option<(&'static str, Vec<&'static str>)> {
    match terminal_id {
        "ghostty" => Some((
            "/Applications/Ghostty.app/Contents/MacOS/ghostty",
            vec!["--working-directory"],
        )),
        "wezterm" => Some((
            "/Applications/WezTerm.app/Contents/MacOS/wezterm",
            vec!["start", "--cwd"],
        )),
        "kitty" => Some((
            "/Applications/kitty.app/Contents/MacOS/kitty",
            vec!["--directory"],
        )),
        "alacritty" => Some((
            "/Applications/Alacritty.app/Contents/MacOS/alacritty",
            vec!["--working-directory"],
        )),
        _ => None,
    }
}

fn launch_direct_terminal(
    terminal_id: &str,
    cwd: &Path,
    executable: &str,
    args: &[String],
) -> Result<bool, String> {
    let Some((program, prefix)) = direct_terminal_command(terminal_id) else {
        return Ok(false);
    };
    if !Path::new(program).is_file() {
        return Ok(false);
    }
    let mut command = Command::new(program);
    command.args(prefix).arg(cwd);
    match terminal_id {
        "ghostty" => {
            command.arg("-e");
        }
        "wezterm" => {
            command.arg("--");
        }
        "alacritty" => {
            command.arg("-e");
        }
        _ => {}
    }
    command.arg(executable).args(args);
    command
        .spawn()
        .map(|_| true)
        .map_err(|_| "TERMINAL_LAUNCH_FAILED: 无法请求终端执行启动命令".into())
}

#[tauri::command]
fn launch_workspace_terminal(request: LaunchWorkspaceRequest) -> LaunchWorkspaceResult {
    let reject = |error: String| {
        let (code, message) = error
            .split_once(": ")
            .unwrap_or(("LAUNCH_REJECTED", &error));
        LaunchWorkspaceResult::Rejected {
            request_id: request.request_id.clone(),
            code: code.into(),
            message: message.into(),
        }
    };
    if !validate_identifier(&request.request_id) || !validate_identifier(&request.workspace_id) {
        return reject("INVALID_REQUEST: 请求或工作区标识无效".into());
    }
    let bundle_id = match terminal_bundle_id(&request.terminal_id) {
        Ok(value) => value,
        Err(error) => return reject(error),
    };
    let cwd = match validated_workspace_path(&request.cwd) {
        Ok(value) => value,
        Err(error) => return reject(error),
    };
    let args = match launch_args(&request) {
        Ok(value) => value,
        Err(error) => return reject(error),
    };
    match launch_direct_terminal(&request.terminal_id, &cwd, &request.executable, &args) {
        Ok(true) => LaunchWorkspaceResult::Accepted {
            request_id: request.request_id,
            accepted_at: accepted_at(),
        },
        Err(error) => reject(error),
        Ok(false) => {
            if let Err(error) = open_terminal_app(bundle_id, &cwd) {
                return reject(error);
            }
            LaunchWorkspaceResult::FallbackRequired {
                request_id: request.request_id,
                executable: request.executable,
                args,
                message: "当前终端尚未通过自动执行验证；已打开工作目录，请复制命令运行。".into(),
            }
        }
    }
}

fn accepted_at() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn asset_name(slot: &str) -> Result<(&'static str, usize), String> {
    match slot {
        "logo" => Ok(("logo.asset", 5 * 1024 * 1024)),
        "background" => Ok(("background.asset", 15 * 1024 * 1024)),
        _ => Err("INVALID_SLOT: 仅支持 logo 或 background".into()),
    }
}

const AGENT_AVATAR_LIMIT: usize = 5 * 1024 * 1024;

fn validate_agent_id(agent_id: &str) -> Result<(), String> {
    if validate_identifier(agent_id) && agent_id != "." && agent_id != ".." {
        Ok(())
    } else {
        Err("INVALID_AGENT_ID: Agent 标识无效".into())
    }
}

fn validate_avatar(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > AGENT_AVATAR_LIMIT {
        return Err("INVALID_SIZE: 头像为空或超过 5 MiB".into());
    }
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("INVALID_IMAGE: Agent 头像仅支持 PNG".into());
    }
    Ok(())
}

fn image_mime(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok("image/jpeg")
    } else {
        Err("INVALID_IMAGE: 仅支持 PNG 或 JPEG 图片".into())
    }
}

fn asset_path(app: &tauri::AppHandle, slot: &str) -> Result<PathBuf, String> {
    let (name, _) = asset_name(slot)?;
    app.path()
        .app_data_dir()
        .map(|path| path.join("ui-assets").join(name))
        .map_err(|_| "ASSET_STORAGE_UNAVAILABLE: 无法访问本机个性化资源目录".into())
}

#[tauri::command]
fn import_ui_asset(app: tauri::AppHandle, slot: String, bytes: Vec<u8>) -> Result<(), String> {
    let (_, limit) = asset_name(&slot)?;
    if bytes.is_empty() || bytes.len() > limit {
        return Err("INVALID_SIZE: 图片为空或超过该位置允许的大小".into());
    }
    image_mime(&bytes)?;
    let target = asset_path(&app, &slot)?;
    let parent = target
        .parent()
        .ok_or_else(|| "ASSET_STORAGE_UNAVAILABLE: 个性化资源目录无效".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "ASSET_WRITE_FAILED: 无法创建个性化资源目录".to_string())?;
    let temporary = parent.join(format!(".{slot}.tmp"));
    let mut file = fs::File::create(&temporary)
        .map_err(|_| "ASSET_WRITE_FAILED: 无法写入个性化图片".to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "ASSET_WRITE_FAILED: 无法完整写入个性化图片".to_string())?;
    fs::rename(&temporary, &target).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        "ASSET_WRITE_FAILED: 无法安全替换个性化图片".to_string()
    })
}

#[tauri::command]
fn read_ui_asset(app: tauri::AppHandle, slot: String) -> Result<Option<UiAsset>, String> {
    let target = asset_path(&app, &slot)?;
    let bytes = match fs::read(target) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("ASSET_READ_FAILED: 无法读取个性化图片".into()),
    };
    let mime_type = image_mime(&bytes)?;
    Ok(Some(UiAsset { mime_type, bytes }))
}

#[tauri::command]
fn delete_ui_asset(app: tauri::AppHandle, slot: String) -> Result<(), String> {
    match fs::remove_file(asset_path(&app, &slot)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("ASSET_DELETE_FAILED: 无法移除个性化图片".into()),
    }
}

fn managed_agent_dir(app: &tauri::AppHandle, agent_id: &str) -> Result<PathBuf, String> {
    validate_agent_id(agent_id)?;
    app.path()
        .home_dir()
        .map(|path| {
            path.join(".bandi")
                .join("agents")
                .join(format!("agt_{agent_id}"))
        })
        .map_err(|_| "AGENT_STORAGE_UNAVAILABLE: 无法访问受管 Agent 目录".into())
}

fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "AGENT_STORAGE_UNAVAILABLE: Agent 目录无效".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "AGENT_WRITE_FAILED: 无法创建受管 Agent 目录".to_string())?;
    let temporary = parent.join(format!(
        ".{}.tmp",
        target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("agent")
    ));
    let mut file = fs::File::create(&temporary)
        .map_err(|_| "AGENT_WRITE_FAILED: 无法写入临时文件".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "AGENT_WRITE_FAILED: 无法完整写入文件".to_string())?;
    fs::rename(&temporary, target).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        "AGENT_WRITE_FAILED: 无法安全替换文件".to_string()
    })
}

fn validate_package_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.starts_with('/')
        || path.split('/').any(|segment| {
            segment.is_empty() || segment == "." || segment == ".." || !validate_identifier(segment)
        })
    {
        Err("INVALID_AGENT_FILE: AgentPackage 文件路径无效".into())
    } else {
        Ok(())
    }
}

fn baseline(content: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in content.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn write_package_file(root: &Path, file: &AgentPackageFile) -> Result<(), String> {
    validate_package_path(&file.path)?;
    write_atomic(&root.join(&file.path), file.content.as_bytes())
}

fn validate_agent_record(
    agent_id: &str,
    agent: &serde_json::Value,
    has_avatar: bool,
) -> Result<(), String> {
    let object = agent
        .as_object()
        .ok_or_else(|| "INVALID_AGENT_RECORD: Agent 记录必须是对象".to_string())?;
    if object.get("id").and_then(serde_json::Value::as_str) != Some(agent_id) {
        return Err("INVALID_AGENT_RECORD: Agent ID 与请求不一致".into());
    }
    let avatar = object.get("avatarPath").and_then(serde_json::Value::as_str);
    if avatar.is_some_and(|value| value != "avatar.png")
        || has_avatar != (avatar == Some("avatar.png"))
    {
        return Err("INVALID_AGENT_RECORD: 头像引用与文件变更不一致".into());
    }
    Ok(())
}

fn write_agent_record(root: &Path, agent: &serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(agent)
        .map_err(|_| "INVALID_AGENT_RECORD: Agent 记录无法序列化".to_string())?;
    write_atomic(&root.join(".bandi-agent.json"), &bytes)
}

fn create_managed_agent_at(
    agents_root: &Path,
    request: CreateManagedAgentRequest,
) -> Result<ManagedAgentResult, String> {
    validate_agent_id(&request.agent_id)?;
    if let Some(bytes) = request.avatar_bytes.as_deref() {
        validate_avatar(bytes)?;
    }
    validate_agent_record(
        &request.agent_id,
        &request.agent,
        request.avatar_bytes.is_some(),
    )?;
    let manifest = request
        .files
        .iter()
        .find(|file| file.path == "agent.yaml")
        .map(|file| file.content.clone())
        .ok_or_else(|| "INVALID_AGENT_PACKAGE: 缺少 agent.yaml".to_string())?;
    let target = agents_root.join(format!("agt_{}", request.agent_id));
    if target.exists() {
        return Err("AGENT_ALREADY_EXISTS: 受管 AgentPackage 已存在".into());
    }
    fs::create_dir_all(agents_root)
        .map_err(|_| "AGENT_WRITE_FAILED: 无法创建受管 Agent 根目录".to_string())?;
    let staging = agents_root.join(format!(".agt_{}.staging", request.agent_id));
    let _ = fs::remove_dir_all(&staging);
    let result = (|| {
        fs::create_dir(&staging)
            .map_err(|_| "AGENT_WRITE_FAILED: 无法创建 AgentPackage 临时目录".to_string())?;
        for file in &request.files {
            write_package_file(&staging, file)?;
        }
        if let Some(bytes) = request.avatar_bytes.as_deref() {
            write_atomic(&staging.join("avatar.png"), bytes)?;
        }
        write_agent_record(&staging, &request.agent)?;
        fs::rename(&staging, &target)
            .map_err(|_| "AGENT_WRITE_FAILED: 无法提交 AgentPackage".to_string())?;
        Ok(ManagedAgentResult {
            agent: request.agent,
            baseline: baseline(&manifest),
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[tauri::command]
fn create_managed_agent(
    app: tauri::AppHandle,
    request: CreateManagedAgentRequest,
) -> Result<ManagedAgentResult, String> {
    let root = managed_agent_dir(&app, &request.agent_id)?;
    let agents_root = root
        .parent()
        .ok_or_else(|| "AGENT_STORAGE_UNAVAILABLE: Agent 根目录无效".to_string())?;
    create_managed_agent_at(agents_root, request)
}

fn save_managed_agent_identity_at(
    root: &Path,
    request: SaveManagedAgentIdentityRequest,
) -> Result<ManagedAgentResult, String> {
    validate_agent_id(&request.agent_id)?;
    if !root.is_dir() {
        return Err("AGENT_NOT_FOUND: 受管 AgentPackage 不存在".into());
    }
    let manifest_path = root.join("agent.yaml");
    let current = fs::read_to_string(&manifest_path)
        .map_err(|_| "AGENT_READ_FAILED: 无法读取 agent.yaml".to_string())?;
    if baseline(&current) != request.expected_manifest {
        return Err("BASELINE_CHANGED: agent.yaml 已被外部修改，请刷新后重试".into());
    }
    if let AvatarChange::Replace { bytes } = &request.avatar {
        validate_avatar(bytes)?;
    }
    let avatar_path = root.join("avatar.png");
    let has_avatar = match &request.avatar {
        AvatarChange::Keep => avatar_path.is_file(),
        AvatarChange::Replace { .. } => true,
        AvatarChange::Remove => false,
    };
    validate_agent_record(&request.agent_id, &request.agent, has_avatar)?;
    let old_avatar = fs::read(&avatar_path).ok();
    let old_record = fs::read(root.join(".bandi-agent.json")).ok();
    let result = (|| {
        match &request.avatar {
            AvatarChange::Keep => {}
            AvatarChange::Replace { bytes } => write_atomic(&avatar_path, bytes)?,
            AvatarChange::Remove => match fs::remove_file(&avatar_path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("AGENT_DELETE_FAILED: 无法移除 Agent 头像".into()),
            },
        }
        write_atomic(&manifest_path, request.manifest.as_bytes())?;
        write_agent_record(root, &request.agent)?;
        Ok(ManagedAgentResult {
            agent: request.agent,
            baseline: baseline(&request.manifest),
        })
    })();
    if result.is_err() {
        let _ = write_atomic(&manifest_path, current.as_bytes());
        match old_avatar {
            Some(bytes) => {
                let _ = write_atomic(&avatar_path, &bytes);
            }
            None => {
                let _ = fs::remove_file(&avatar_path);
            }
        }
        if let Some(bytes) = old_record {
            let _ = write_atomic(&root.join(".bandi-agent.json"), &bytes);
        }
    }
    result
}

#[tauri::command]
fn save_managed_agent_identity(
    app: tauri::AppHandle,
    request: SaveManagedAgentIdentityRequest,
) -> Result<ManagedAgentResult, String> {
    let root = managed_agent_dir(&app, &request.agent_id)?;
    save_managed_agent_identity_at(&root, request)
}

#[tauri::command]
fn list_managed_agents(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let marker = managed_agent_dir(&app, "probe")?;
    let root = marker
        .parent()
        .ok_or_else(|| "AGENT_STORAGE_UNAVAILABLE: Agent 根目录无效".to_string())?;
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("AGENT_READ_FAILED: 无法扫描受管 Agent 目录".into()),
    };
    let mut agents = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with("agt_") || !entry.path().is_dir() {
            continue;
        }
        let bytes = match fs::read(entry.path().join(".bandi-agent.json")) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if let Ok(agent) = serde_json::from_slice(&bytes) {
            agents.push(agent);
        }
    }
    Ok(agents)
}

#[tauri::command]
fn read_agent_avatar(app: tauri::AppHandle, agent_id: String) -> Result<Option<UiAsset>, String> {
    let bytes = match fs::read(managed_agent_dir(&app, &agent_id)?.join("avatar.png")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("AGENT_READ_FAILED: 无法读取 Agent 头像".into()),
    };
    validate_avatar(&bytes)?;
    Ok(Some(UiAsset {
        mime_type: "image/png",
        bytes,
    }))
}

const COMMAND_EVENT: &str = "bandi://app-command";
const COMMAND_IDS: &[&str] = &[
    "navigation.home",
    "navigation.agents",
    "navigation.organization",
    "navigation.workspaces",
    "navigation.assets",
    "navigation.settings",
    "theme.toggle",
    "editor.save",
    "editor.cancel",
];

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            launch_workspace_terminal,
            import_ui_asset,
            read_ui_asset,
            delete_ui_asset,
            read_agent_avatar,
            create_managed_agent,
            save_managed_agent_identity,
            list_managed_agents
        ])
        .menu(|app| {
            let application = SubmenuBuilder::new(app, "Bandi")
                .about(None)
                .separator()
                .text("navigation.settings", "设置…")
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;
            let edit = SubmenuBuilder::new(app, "编辑")
                .item(
                    &MenuItemBuilder::with_id("editor.save", "保存配置")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                )
                .text("editor.cancel", "取消编辑")
                .separator()
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let navigate = SubmenuBuilder::new(app, "导航")
                .text("navigation.home", "首页")
                .text("navigation.agents", "Agents")
                .text("navigation.organization", "组织")
                .text("navigation.workspaces", "Workspaces")
                .text("navigation.assets", "资产")
                .separator()
                .text("theme.toggle", "切换主题")
                .build()?;
            let window = SubmenuBuilder::new(app, "窗口")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            MenuBuilder::new(app)
                .item(&application)
                .item(&edit)
                .item(&navigate)
                .item(&window)
                .build()
        })
        .on_menu_event(|app, event| {
            let command = event.id().as_ref();
            if COMMAND_IDS.contains(&command) {
                let _ = app.emit(COMMAND_EVENT, command);
            }
        })
        .run(tauri::generate_context!())
        .expect("启动 Bandi Desktop 失败");
}

#[cfg(test)]
mod tests {
    use super::{
        asset_name, baseline, create_managed_agent_at, image_mime, launch_args,
        save_managed_agent_identity_at, terminal_bundle_id, validate_agent_id, validate_avatar,
        validate_identifier, validate_launch, validated_workspace_path, AgentPackageFile,
        AvatarChange, CreateManagedAgentRequest, LaunchWorkspaceRequest,
        SaveManagedAgentIdentityRequest, AGENT_AVATAR_LIMIT, COMMAND_IDS,
    };

    #[test]
    fn menu_commands_are_whitelisted() {
        assert!(COMMAND_IDS.contains(&"editor.save"));
        assert!(!COMMAND_IDS.contains(&"shell.exec"));
    }

    #[test]
    fn terminal_apps_are_whitelisted() {
        for id in [
            "system",
            "terminal",
            "iterm2",
            "warp",
            "ghostty",
            "wezterm",
            "kitty",
            "alacritty",
        ] {
            assert!(terminal_bundle_id(id).is_ok());
        }
        assert!(terminal_bundle_id("/bin/sh").is_err());
        assert_eq!(terminal_bundle_id("system"), terminal_bundle_id("terminal"));
    }

    #[test]
    fn terminal_request_inputs_are_validated() {
        assert!(validate_identifier("workspace-1"));
        assert!(!validate_identifier(""));
        assert!(!validate_identifier("workspace/../other"));
        assert!(validated_workspace_path("relative/path").is_err());
        assert!(validate_launch("claude", &["a;b $HOME 'literal'".into()]).is_ok());
        assert!(validate_launch("claude && other", &[]).is_err());
        assert!(validate_launch("claude", &["line\nbreak".into()]).is_err());
    }

    #[test]
    fn bandi_entry_is_appended_once() {
        let request = |args, enter_bandi_on_start| LaunchWorkspaceRequest {
            request_id: "request-1".into(),
            workspace_id: "workspace-1".into(),
            cwd: "/tmp".into(),
            terminal_id: "terminal".into(),
            executable: "claude".into(),
            args,
            enter_bandi_on_start,
        };
        assert_eq!(
            launch_args(&request(vec!["--model".into(), "opus".into()], true)),
            Ok(vec!["--model".into(), "opus".into(), "/bandi:bandi".into()])
        );
        assert_eq!(
            launch_args(&request(vec!["/bandi:bandi".into()], true)),
            Ok(vec!["/bandi:bandi".into()])
        );
        assert_eq!(
            launch_args(&request(vec!["--model".into()], false)),
            Ok(vec!["--model".into()])
        );
    }

    #[test]
    fn ui_asset_slots_are_whitelisted() {
        assert_eq!(asset_name("logo"), Ok(("logo.asset", 5 * 1024 * 1024)));
        assert_eq!(
            asset_name("background"),
            Ok(("background.asset", 15 * 1024 * 1024))
        );
        assert!(asset_name("../config").is_err());
    }

    #[test]
    fn ui_assets_only_accept_png_and_jpeg_signatures() {
        assert_eq!(image_mime(b"\x89PNG\r\n\x1a\nrest"), Ok("image/png"));
        assert_eq!(image_mime(&[0xff, 0xd8, 0xff, 0xe0]), Ok("image/jpeg"));
        assert!(image_mime(b"<svg></svg>").is_err());
        assert!(image_mime(&[]).is_err());
    }

    #[test]
    fn agent_avatar_and_id_are_validated() {
        assert!(validate_agent_id("agent-1").is_ok());
        assert!(validate_agent_id("../agent").is_err());
        assert!(validate_avatar(b"\x89PNG\r\n\x1a\nrest").is_ok());
        assert!(validate_avatar(b"not png").is_err());
        assert!(validate_avatar(&vec![0; AGENT_AVATAR_LIMIT + 1]).is_err());
    }

    #[test]
    fn managed_agent_create_and_identity_save_check_baseline() {
        let root = std::env::temp_dir().join(format!("bandi-agent-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let created = create_managed_agent_at(
            &root,
            CreateManagedAgentRequest {
                agent_id: "test-agent".into(),
                agent: serde_json::json!({ "id": "test-agent", "avatarPath": "avatar.png" }),
                files: vec![AgentPackageFile {
                    path: "agent.yaml".into(),
                    content: "id: test-agent".into(),
                }],
                avatar_bytes: Some(b"\x89PNG\r\n\x1a\nrest".to_vec()),
            },
        )
        .expect("隔离目录中的 AgentPackage 应创建成功");
        assert_eq!(created.baseline, baseline("id: test-agent"));

        let package = root.join("agt_test-agent");
        let saved = save_managed_agent_identity_at(
            &package,
            SaveManagedAgentIdentityRequest {
                agent_id: "test-agent".into(),
                agent: serde_json::json!({ "id": "test-agent", "avatarPath": null }),
                manifest: "id: test-agent\nname: updated".into(),
                expected_manifest: created.baseline,
                avatar: AvatarChange::Remove,
            },
        )
        .expect("正确基线应保存成功");
        assert!(!package.join("avatar.png").exists());
        assert_eq!(saved.baseline, baseline("id: test-agent\nname: updated"));

        let changed = save_managed_agent_identity_at(
            &package,
            SaveManagedAgentIdentityRequest {
                agent_id: "test-agent".into(),
                agent: serde_json::json!({ "id": "test-agent" }),
                manifest: "id: changed".into(),
                expected_manifest: "stale".into(),
                avatar: AvatarChange::Keep,
            },
        );
        assert!(matches!(changed, Err(error) if error.starts_with("BASELINE_CHANGED")));
        let _ = std::fs::remove_dir_all(&root);
    }
}
