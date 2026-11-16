// TEMPORARY DIAGNOSTIC ONLY: no real KDF. Never merge or release.
// Registers Stronghold before window construction rather than dynamically
// inside Tauri's setup callback. Validates native startup on Windows 2025.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_stronghold::Builder::new(|_| vec![0_u8; 32]).build())
        .run(tauri::generate_context!())
        .expect("error running API Studio");
}
