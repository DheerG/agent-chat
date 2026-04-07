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
                    if let Err(e) = agent_chat::web::run_with_options(db_path, teams_dir, 5555, false).await {
                        tracing::error!(error = %e, "AgentChat server failed");
                    }
                });
            });

            // Navigate the window to the server once it's ready
            let window = app.get_webview_window("main").expect("no main window");
            std::thread::spawn(move || {
                for _ in 0..50 {
                    if std::net::TcpStream::connect("127.0.0.1:5555").is_ok() {
                        let _ = window.navigate("http://localhost:5555".parse().unwrap());
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                tracing::error!("Server did not start within 5 seconds");
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
