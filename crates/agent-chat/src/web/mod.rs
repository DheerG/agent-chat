use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use rust_embed::Embed;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::db::Database;
use crate::http::api_routes;
use crate::services::AppState;
use crate::watcher;
use crate::ws::{self, WebSocketHub};

/// Embedded React client build output.
/// At compile time, this bakes in packages/client/dist/.
/// If the directory doesn't exist yet, rust-embed will produce an empty set.
#[derive(Embed)]
#[folder = "../../packages/client/dist/"]
#[prefix = ""]
struct ClientAssets;

/// Serve an embedded static file.
async fn serve_embedded(req: Request) -> impl IntoResponse {
    let path = req.uri().path().trim_start_matches('/');

    // Try exact path first
    if let Some(file) = ClientAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(file.data.to_vec()))
            .unwrap();
    }

    // SPA fallback: serve index.html for non-API, non-ws paths
    if let Some(index) = ClientAssets::get("index.html") {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(index.data.to_vec()))
            .unwrap();
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::from("Not found"))
        .unwrap()
}

/// Run the web server mode: HTTP API + WebSocket + embedded React UI.
pub async fn run(db_path: PathBuf, teams_dir: PathBuf, port: u16) -> anyhow::Result<()> {
    let db = Database::open(&db_path)?;
    let state = AppState::new(db);

    // Start the WebSocket hub
    let hub = Arc::new(WebSocketHub::new());
    hub.start_broadcasting(state.events.subscribe(), state.db.clone());

    // Start the file watcher
    let _watcher_handle = watcher::start(state.clone(), teams_dir.clone());

    // Build the router
    let app = api_routes()
        .route("/ws", get(ws::ws_handler))
        .fallback(get(serve_embedded))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .layer(axum::Extension(hub))
        .with_state(state);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));

    // Bind with a friendly error on port conflict
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            eprintln!(
                "\n  Error: Port {port} is already in use.\n  Is AgentChat already running? Use --port to choose a different port.\n"
            );
            std::process::exit(1);
        }
        Err(e) => return Err(e.into()),
    };

    // Auto-open browser
    let url = format!("http://localhost:{port}");
    println!("\n  AgentChat is running at {url}");
    println!("  Watching: {}\n", teams_dir.display());
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let _ = open::that(&url);
    });

    info!(port, teams_dir = %teams_dir.display(), "AgentChat server started");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Graceful shutdown complete");

    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install CTRL+C signal handler");
    println!("\n  Shutting down...");
    info!("Shutdown signal received");
}
