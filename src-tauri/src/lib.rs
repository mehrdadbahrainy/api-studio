// The native Stronghold plugin triggered a reproducible Windows startup crash
// in v0.1.1. Password-derived workspace encryption runs via Web Crypto in the
// WebView instead. Existing .stronghold snapshots are not deleted.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
