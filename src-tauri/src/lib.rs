use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Argon2 uses a per-installation salt, never a hardcoded encryption key.
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&data_dir.join("salt.txt")).build()
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
