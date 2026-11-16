// TEMPORARY DIAGNOSTIC: not safe to release. Confirms whether initialization
// of the Stronghold plugin (not Argon2) triggers the Windows 2025 crash.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            eprintln!("DIAG: before Stronghold plugin registration");
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::new(|_| vec![0_u8; 32]).build()
            )?;
            eprintln!("DIAG: after Stronghold plugin registration");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
