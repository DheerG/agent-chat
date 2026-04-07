// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("agent_chat=info".parse().unwrap()),
        )
        .init();

    let home = dirs::home_dir().expect("Could not determine home directory");
    let teams_dir = home.join(".claude").join("teams");
    let db_path = home.join(".agent-chat").join("v2.db");

    // Ensure directories exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::create_dir_all(&teams_dir).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let teams_dir = teams_dir.clone();
            let db_path = db_path.clone();

            // Start the Rust server in a background thread
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    if let Err(e) = agent_chat::web::run(db_path, teams_dir, 5555).await {
                        tracing::error!(error = %e, "AgentChat server failed");
                    }
                });
            });

            // Navigate the window to the server after it starts
            let window = app.get_webview_window("main").expect("no main window");
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                let _ = window.navigate("http://localhost:5555".parse().unwrap());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
