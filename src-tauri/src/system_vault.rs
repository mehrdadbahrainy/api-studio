use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

const PRIMARY: &str = "workspace.protected.dat";
const BACKUP: &str = "workspace.protected.bak";
const TEMP: &str = "workspace.protected.tmp";
const MAX_BYTES: usize = 20 * 1024 * 1024;

fn paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let dir = app.path().app_local_data_dir().map_err(|_| "Cannot locate workspace storage.")?;
    Ok((dir.join(PRIMARY), dir.join(BACKUP), dir.join(TEMP)))
}

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;
    use std::ptr;
    use std::slice;

    #[repr(C)]
    struct Blob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "Crypt32")]
    unsafe extern "system" {
        fn CryptProtectData(
            source: *const Blob, description: *const u16, entropy: *const Blob,
            reserved: *mut c_void, prompt: *const c_void, flags: u32, output: *mut Blob
        ) -> i32;
        fn CryptUnprotectData(
            source: *const Blob, description: *mut *mut u16, entropy: *const Blob,
            reserved: *mut c_void, prompt: *const c_void, flags: u32, output: *mut Blob
        ) -> i32;
    }
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    fn transform(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        if data.is_empty() || data.len() > super::MAX_BYTES {
            return Err("Invalid workspace storage size.".into());
        }
        let input = Blob { cb_data: data.len() as u32, pb_data: data.as_ptr() as *mut u8 };
        let mut output = Blob { cb_data: 0, pb_data: ptr::null_mut() };
        let success = unsafe {
            if protect {
                CryptProtectData(&input, ptr::null(), ptr::null(), ptr::null_mut(),
                    ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            } else {
                CryptUnprotectData(&input, ptr::null_mut(), ptr::null(), ptr::null_mut(),
                    ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            }
        };
        if success == 0 {
            // No OS file paths or Windows diagnostic text are sent to the UI.
            return Err("Windows user data protection failed.".into());
        }
        if output.pb_data.is_null() || output.cb_data == 0 || output.cb_data as usize > super::MAX_BYTES {
            if !output.pb_data.is_null() {
                unsafe { LocalFree(output.pb_data.cast()); }
            }
            return Err("Protected workspace content is invalid.".into());
        }
        let bytes = unsafe { slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
        unsafe { LocalFree(output.pb_data.cast()); }
        Ok(bytes)
    }

    pub fn protect(bytes: &[u8]) -> Result<Vec<u8>, String> { transform(bytes, true) }
    pub fn unprotect(bytes: &[u8]) -> Result<Vec<u8>, String> { transform(bytes, false) }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("Passwordless protected workspace is currently available only on Windows.".into())
    }
    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("Passwordless protected workspace is currently available only on Windows.".into())
    }
}

#[tauri::command]
pub fn is_system_vault_supported() -> bool {
    cfg!(windows)
}

#[tauri::command]
pub fn protected_workspace_exists(app: tauri::AppHandle) -> Result<bool, String> {
    let (primary, backup, _) = paths(&app)?;
    Ok(primary.exists() || backup.exists())
}

#[tauri::command]
pub fn read_protected_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (primary, backup, _) = paths(&app)?;
    let file = if primary.exists() { primary } else if backup.exists() { backup } else { return Ok(None); };
    let metadata = fs::metadata(&file).map_err(|_| "Unable to inspect protected workspace.")?;
    if metadata.len() as usize > MAX_BYTES {
        return Err("Protected workspace file is oversized.".into());
    }
    let ciphertext = fs::read(&file).map_err(|_| "Unable to read protected workspace.")?;
    let plaintext = dpapi::unprotect(&ciphertext)?;
    let json = String::from_utf8(plaintext).map_err(|_| "Protected workspace encoding is invalid.")?;
    Ok(Some(json))
}

#[tauri::command]
pub fn write_protected_workspace(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.len() > MAX_BYTES || payload.len() < 30 {
        return Err("Invalid protected workspace payload size.".into());
    }
    // Never write plaintext to disk. Windows DPAPI encrypts for CURRENT_USER only.
    let ciphertext = dpapi::protect(payload.as_bytes())?;
    let (primary, backup, temporary) = paths(&app)?;
    let dir = primary.parent().ok_or("Missing workspace directory")?;
    fs::create_dir_all(dir).map_err(|_| "Cannot create protected workspace directory.")?;
    {
        let mut file = File::create(&temporary).map_err(|_| "Cannot write protected workspace.")?;
        file.write_all(&ciphertext).map_err(|_| "Protected workspace write failed.")?;
        file.sync_all().map_err(|_| "Protected workspace sync failed.")?;
    }
    if primary.exists() {
        if backup.exists() { fs::remove_file(&backup).map_err(|_| "Cannot replace protected workspace backup.")?; }
        fs::rename(&primary, &backup).map_err(|_| "Cannot back up protected workspace.")?;
    }
    if fs::rename(&temporary, &primary).is_err() {
        if !primary.exists() && backup.exists() { let _ = fs::rename(&backup, &primary); }
        return Err("Protected workspace commit failed.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn remove_protected_workspace(app: tauri::AppHandle) -> Result<(), String> {
    let (primary, backup, _) = paths(&app)?;
    for file in [primary, backup] {
        if file.exists() {
            fs::remove_file(file).map_err(|_| "Could not clear previous passwordless workspace.")?;
        }
    }
    Ok(())
}
