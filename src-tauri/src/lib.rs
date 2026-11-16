// Diagnostic only: disable Stronghold plugin initialization to isolate Windows startup.
// This branch is NOT a production fix. Do not merge or ship this configuration.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
