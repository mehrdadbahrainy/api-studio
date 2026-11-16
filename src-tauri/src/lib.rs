mod system_vault;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const ENCRYPTED_FILE: &str = "workspace.encrypted.json";
const LEGACY_STRONGHOLD: &str = "workspace.stronghold";
const MAX_VAULT_BYTES: usize = 20 * 1024 * 1024;

fn workspace_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((dir.join(ENCRYPTED_FILE), dir.join("workspace.encrypted.bak")))
}

#[tauri::command]
fn legacy_stronghold_exists(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(LEGACY_STRONGHOLD).exists())
}

#[tauri::command]
fn read_encrypted_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (primary, backup) = workspace_paths(&app)?;
    // Recover from an interrupted write by reading the preserved backup.
    for file in [&primary, &backup] {
        if file.exists() {
            let metadata = fs::metadata(file).map_err(|e| e.to_string())?;
            if metadata.len() > MAX_VAULT_BYTES as u64 {
                return Err("Encrypted workspace file is too large.".into());
            }
            return fs::read_to_string(file).map(Some).map_err(|e| e.to_string());
        }
    }
    Ok(None)
}

#[tauri::command]
fn write_encrypted_workspace(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.len() > MAX_VAULT_BYTES || payload.len() < 80 ||
        !payload.contains("api-studio-encrypted-workspace") {
        return Err("Invalid or oversized encrypted workspace payload.".into());
    }
    let (primary, backup) = workspace_paths(&app)?;
    let dir = primary.parent().ok_or("Missing workspace directory")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temporary = dir.join("workspace.encrypted.tmp");
    fs::write(&temporary, payload.as_bytes()).map_err(|e| e.to_string())?;
    if primary.exists() {
        if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
        fs::rename(&primary, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, &primary) {
        if !primary.exists() && backup.exists() {
            let _ = fs::rename(&backup, &primary);
        }
        return Err(format!("Encrypted workspace save failed: {}", error));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            read_encrypted_workspace,
            write_encrypted_workspace,
            legacy_stronghold_exists,
            system_vault::is_system_vault_supported,
            system_vault::protected_workspace_exists,
            system_vault::read_protected_workspace,
            system_vault::write_protected_workspace,
            system_vault::remove_protected_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
