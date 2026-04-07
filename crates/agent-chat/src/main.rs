mod db;
mod http;
mod services;
mod watcher;
mod web;
mod ws;

use clap::Parser;
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(
    name = "agent-chat",
    version,
    about = "Real-time viewer for Claude Code agent team conversations"
)]
struct Cli {
    /// Port to listen on (default: 5555)
    #[arg(short, long, default_value = "5555")]
    port: u16,

    /// Path to the teams directory
    #[arg(long, env = "TEAMS_DIR")]
    teams_dir: Option<PathBuf>,

    /// Path to the SQLite database
    #[arg(long, env = "AGENT_CHAT_DB_PATH")]
    db_path: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("agent_chat=info".parse()?))
        .init();

    let cli = Cli::parse();

    let home = dirs::home_dir().expect("Could not determine home directory");
    let teams_dir = cli
        .teams_dir
        .unwrap_or_else(|| home.join(".claude").join("teams"));
    let db_path = cli
        .db_path
        .unwrap_or_else(|| home.join(".agent-chat").join("v2.db"));

    // Ensure parent directories exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::create_dir_all(&teams_dir).ok();

    web::run(db_path, teams_dir, cli.port).await?;

    Ok(())
}
