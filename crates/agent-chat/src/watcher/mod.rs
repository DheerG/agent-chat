use crate::services::AppState;
use notify::{Event, RecursiveMode, Watcher};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use tracing::{error, info};

const POLL_INTERVAL_MS: u64 = 5_000;

#[derive(Deserialize)]
struct InboxMessage {
    from: String,
    text: Option<String>,
    summary: Option<String>,
    timestamp: String,
    color: Option<String>,
    #[allow(dead_code)]
    read: Option<bool>,
}

#[derive(Deserialize)]
struct TeamConfig {
    #[allow(dead_code)]
    name: Option<String>,
    #[allow(dead_code)]
    description: Option<String>,
    members: Option<Vec<TeamMember>>,
}

#[derive(Deserialize)]
struct TeamMember {
    #[serde(rename = "agentId")]
    agent_id: String,
    name: String,
    #[serde(rename = "agentType")]
    agent_type: Option<String>,
    model: Option<String>,
    #[allow(dead_code)]
    color: Option<String>,
    cwd: Option<String>,
}

struct TeamState {
    conversation_id: String,
    #[allow(dead_code)]
    config: TeamConfig,
}

struct WatcherState {
    teams: HashMap<String, TeamState>,
    skipped_teams: HashSet<String>,
    seen_messages: HashSet<String>,
    team_dedup_keys: HashMap<String, HashSet<String>>,
    last_processed_index: HashMap<PathBuf, usize>,
}

impl WatcherState {
    fn new() -> Self {
        Self {
            teams: HashMap::new(),
            skipped_teams: HashSet::new(),
            seen_messages: HashSet::new(),
            team_dedup_keys: HashMap::new(),
            last_processed_index: HashMap::new(),
        }
    }
}

/// Start the TeamInboxWatcher in a background tokio task.
pub fn start(state: AppState, teams_dir: PathBuf) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(e) = run_watcher(state, teams_dir).await {
            error!(error = %e, "TeamInboxWatcher crashed");
        }
    })
}

async fn run_watcher(state: AppState, teams_dir: PathBuf) -> anyhow::Result<()> {
    if !teams_dir.exists() {
        fs::create_dir_all(&teams_dir).ok();
    }

    let watcher_state = Arc::new(Mutex::new(WatcherState::new()));

    // Initial scan
    scan_teams(&state, &teams_dir, &watcher_state);

    // Set up file watcher
    let (tx, mut rx) = mpsc::channel::<PathBuf>(256);

    let tx_clone = tx.clone();
    let teams_dir_clone = teams_dir.clone();
    let mut notify_watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            for path in event.paths {
                if let Ok(rel) = path.strip_prefix(&teams_dir_clone) {
                    let _ = tx_clone.blocking_send(rel.to_path_buf());
                }
            }
        }
    })?;

    notify_watcher.watch(&teams_dir, RecursiveMode::Recursive)?;

    // Poll timer for discovering new teams
    let poll_state = state.clone();
    let poll_dir = teams_dir.clone();
    let poll_ws = watcher_state.clone();
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_millis(POLL_INTERVAL_MS));
        loop {
            ticker.tick().await;
            poll_for_new_teams(&poll_state, &poll_dir, &poll_ws);
        }
    });

    info!(teams_dir = %teams_dir.display(), "TeamInboxWatcher started");

    // Debounce: accumulate paths, drain every 100ms
    let mut debounce_map: HashMap<String, tokio::time::Instant> = HashMap::new();
    let mut drain_interval = interval(Duration::from_millis(100));

    loop {
        tokio::select! {
            Some(rel_path) = rx.recv() => {
                let key = rel_path.display().to_string();
                debounce_map.insert(key, tokio::time::Instant::now());
            }
            _ = drain_interval.tick() => {
                if debounce_map.is_empty() {
                    continue;
                }
                let now = tokio::time::Instant::now();
                let ready: Vec<String> = debounce_map
                    .iter()
                    .filter(|(_, ts)| now.duration_since(**ts) >= Duration::from_millis(100))
                    .map(|(k, _)| k.clone())
                    .collect();

                for key in ready {
                    debounce_map.remove(&key);
                    let rel = PathBuf::from(&key);
                    process_file_change(&state, &teams_dir, &rel, &watcher_state);
                }
            }
        }
    }
}

fn scan_teams(state: &AppState, teams_dir: &Path, ws: &Arc<Mutex<WatcherState>>) {
    let entries = match fs::read_dir(teams_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        process_team(state, teams_dir, &name, ws);
    }
}

fn poll_for_new_teams(state: &AppState, teams_dir: &Path, ws: &Arc<Mutex<WatcherState>>) {
    let entries = match fs::read_dir(teams_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut current_names: HashSet<String> = HashSet::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        current_names.insert(name.clone());

        let ws_lock = ws.lock().unwrap();
        let known = ws_lock.teams.contains_key(&name) || ws_lock.skipped_teams.contains(&name);
        drop(ws_lock);

        if !known {
            let config_path = teams_dir.join(&name).join("config.json");
            if config_path.exists() {
                process_team(state, teams_dir, &name, ws);
                info!(team_name = %name, "Team discovered by poll");
            }
        }
    }

    // Remove teams that no longer exist
    let ws_lock = ws.lock().unwrap();
    let removed: Vec<String> = ws_lock
        .teams
        .keys()
        .filter(|k| !current_names.contains(*k))
        .cloned()
        .collect();
    drop(ws_lock);

    for name in removed {
        remove_team(state, teams_dir, &name, ws);
    }

    let ws_lock = ws.lock().unwrap();
    drop(ws_lock);
    // Clean up skipped teams that no longer exist
    ws.lock().unwrap().skipped_teams.retain(|s| current_names.contains(s));
}

fn process_team(state: &AppState, teams_dir: &Path, team_name: &str, ws: &Arc<Mutex<WatcherState>>) {
    let ws_lock = ws.lock().unwrap();
    if ws_lock.teams.contains_key(team_name) {
        drop(ws_lock);
        process_team_inboxes(state, teams_dir, team_name, ws);
        return;
    }
    drop(ws_lock);

    let team_path = teams_dir.join(team_name);
    let config_path = team_path.join("config.json");

    let config: TeamConfig = match fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(c) => c,
        None => {
            ws.lock().unwrap().skipped_teams.insert(team_name.to_string());
            return;
        }
    };

    // Compute workspace path from member cwds
    let cwds: Vec<&str> = config
        .members
        .as_ref()
        .map(|m| m.iter().filter_map(|m| m.cwd.as_deref()).collect())
        .unwrap_or_default();
    let workspace_path = common_ancestor(&cwds)
        .or_else(|| cwds.first().map(|s| s.to_string()))
        .unwrap_or_else(|| team_path.display().to_string());
    let workspace_name = Path::new(&workspace_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Skip if workspace doesn't exist
    if workspace_path != team_path.display().to_string() && !Path::new(&workspace_path).exists() {
        ws.lock().unwrap().skipped_teams.insert(team_name.to_string());
        info!(team_name, workspace_path, "Team skipped — workspace missing");
        return;
    }

    // Find or create conversation
    let mut conversation = state.db.find_conversation_by_name(team_name);

    if let Some(ref conv) = conversation {
        if conv.archived_at.is_some() {
            state.db.restore_conversation(&conv.id);
            info!(conversation_id = %conv.id, "Auto-restored conversation");
        }
    }

    if conversation.is_none() {
        let existing = state.db.find_conversations_by_name_prefix(team_name);
        if !existing.is_empty() {
            let mut max_suffix = 1u32;
            for c in &existing {
                if c.name == team_name {
                    continue;
                }
                if let Some(suffix) = c.name.strip_prefix(team_name).and_then(|s| s.strip_prefix('-')) {
                    if let Ok(num) = suffix.parse::<u32>() {
                        if num > max_suffix {
                            max_suffix = num;
                        }
                    }
                }
            }
            let disambiguated = format!("{team_name}-{}", max_suffix + 1);
            conversation = Some(state.db.create_conversation(
                &disambiguated,
                Some(&workspace_path),
                Some(&workspace_name),
                "team",
            ));
        } else {
            conversation = Some(state.db.create_conversation(
                team_name,
                Some(&workspace_path),
                Some(&workspace_name),
                "team",
            ));
        }
    }

    let conversation = conversation.unwrap();

    // Register team members as sessions
    if let Some(members) = &config.members {
        for member in members {
            state.db.upsert_session(
                &member.agent_id,
                Some(&conversation.id),
                Some(&member.name),
                member.agent_type.as_deref(),
                member.model.as_deref(),
                member.cwd.as_deref(),
            );
            state.db.increment_session_count(&conversation.id);
        }
    }

    ws.lock().unwrap().teams.insert(
        team_name.to_string(),
        TeamState {
            conversation_id: conversation.id,
            config,
        },
    );

    process_team_inboxes(state, teams_dir, team_name, ws);
}

fn process_team_inboxes(
    state: &AppState,
    teams_dir: &Path,
    team_name: &str,
    ws: &Arc<Mutex<WatcherState>>,
) {
    let conversation_id = {
        let ws_lock = ws.lock().unwrap();
        match ws_lock.teams.get(team_name) {
            Some(ts) => ts.conversation_id.clone(),
            None => return,
        }
    };

    let inbox_dir = teams_dir.join(team_name).join("inboxes");
    let files = match fs::read_dir(&inbox_dir) {
        Ok(entries) => entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>(),
        Err(_) => return,
    };

    for file in files {
        let file_path = file.path();
        let recipient_name = file_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        process_inbox_file(state, team_name, &conversation_id, &file_path, &recipient_name, ws);
    }
}

fn process_inbox_file(
    state: &AppState,
    team_name: &str,
    conversation_id: &str,
    file_path: &Path,
    recipient_name: &str,
    ws: &Arc<Mutex<WatcherState>>,
) {
    let raw = match fs::read_to_string(file_path) {
        Ok(s) if !s.trim().is_empty() => s,
        _ => return,
    };

    let messages: Vec<InboxMessage> = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(_) => return,
    };

    let last_index = {
        let ws_lock = ws.lock().unwrap();
        ws_lock
            .last_processed_index
            .get(file_path)
            .copied()
            .unwrap_or(0)
    };

    for i in last_index..messages.len() {
        let msg = &messages[i];
        let text = match &msg.text {
            Some(t) => t,
            None => continue,
        };

        if msg.from.is_empty() || msg.timestamp.is_empty() {
            continue;
        }

        let text_hash = {
            let mut hasher = Sha256::new();
            hasher.update(text.as_bytes());
            hex::encode(&hasher.finalize()[..8])
        };
        let dedup_key = format!("{}|{}|{}", msg.from, msg.timestamp, text_hash);

        {
            let mut ws_lock = ws.lock().unwrap();
            if ws_lock.seen_messages.contains(&dedup_key) {
                continue;
            }
            ws_lock.seen_messages.insert(dedup_key.clone());
            ws_lock
                .team_dedup_keys
                .entry(team_name.to_string())
                .or_default()
                .insert(dedup_key);
        }

        // Detect structured JSON events
        let content = text.clone();
        let mut message_type = "text";
        let mut extra_meta = serde_json::Map::new();

        if content.starts_with("{\"type\":\"") {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(t) = parsed.get("type").and_then(|v| v.as_str()) {
                    message_type = "status";
                    extra_meta.insert("original_type".into(), serde_json::Value::String(t.to_string()));

                    match t {
                        "idle_notification" => {
                            if let Some(v) = parsed.get("idleReason") {
                                extra_meta.insert("idle_reason".into(), v.clone());
                            }
                            if let Some(v) = parsed.get("summary") {
                                extra_meta.insert("summary".into(), v.clone());
                            }
                        }
                        "task_assignment" | "task_completed" => {
                            if let Some(v) = parsed.get("taskId") {
                                extra_meta.insert("task_id".into(), v.clone());
                            }
                            if let Some(v) = parsed.get("subject") {
                                extra_meta.insert("task_subject".into(), v.clone());
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        let mut metadata = serde_json::Map::new();
        metadata.insert("recipient".into(), serde_json::Value::String(recipient_name.to_string()));
        if let Some(color) = &msg.color {
            metadata.insert("color".into(), serde_json::Value::String(color.clone()));
        }
        if let Some(summary) = &msg.summary {
            metadata.insert("summary".into(), serde_json::Value::String(summary.clone()));
        }
        metadata.insert("source".into(), serde_json::Value::String("team_inbox".into()));
        metadata.extend(extra_meta);

        let metadata_value = serde_json::Value::Object(metadata);
        let sender_id = format!("{}@{}", msg.from, team_name);

        state.send_message(
            conversation_id,
            &sender_id,
            &msg.from,
            "agent",
            &content,
            message_type,
            None,
            &metadata_value,
        );

        state.db.increment_summary_messages(
            conversation_id,
            text,
            &msg.from,
            Some(&msg.timestamp),
        );
    }

    ws.lock()
        .unwrap()
        .last_processed_index
        .insert(file_path.to_path_buf(), messages.len());
}

fn process_file_change(
    state: &AppState,
    teams_dir: &Path,
    rel_path: &Path,
    ws: &Arc<Mutex<WatcherState>>,
) {
    let components: Vec<&str> = rel_path
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect();

    if components.is_empty() {
        return;
    }

    let team_name = components[0];
    let team_path = teams_dir.join(team_name);

    {
        let ws_lock = ws.lock().unwrap();
        let known = ws_lock.teams.contains_key(team_name) || ws_lock.skipped_teams.contains(team_name);
        if !known {
            drop(ws_lock);
            let config_path = team_path.join("config.json");
            if config_path.exists() {
                process_team(state, teams_dir, team_name, ws);
            }
            return;
        }
    }

    if !team_path.exists() {
        remove_team(state, teams_dir, team_name, ws);
        return;
    }

    if components.len() >= 3 && components[1] == "inboxes" && components[2].ends_with(".json") {
        let file_path = teams_dir.join(team_name).join("inboxes").join(components[2]);
        let recipient_name = components[2].trim_end_matches(".json");
        let conversation_id = {
            let ws_lock = ws.lock().unwrap();
            ws_lock.teams.get(team_name).map(|ts| ts.conversation_id.clone())
        };
        if let Some(cid) = conversation_id {
            process_inbox_file(state, team_name, &cid, &file_path, recipient_name, ws);
        }
    } else if components.len() == 2 && components[1] == "config.json" {
        // Config updated — re-read it
        let config_path = team_path.join("config.json");
        if let Ok(raw) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<TeamConfig>(&raw) {
                let mut ws_lock = ws.lock().unwrap();
                if let Some(ts) = ws_lock.teams.get_mut(team_name) {
                    ts.config = config;
                }
            }
        }
    }
}

fn remove_team(state: &AppState, teams_dir: &Path, team_name: &str, ws: &Arc<Mutex<WatcherState>>) {
    let mut ws_lock = ws.lock().unwrap();

    if let Some(ts) = ws_lock.teams.remove(team_name) {
        state.db.archive_conversation(&ts.conversation_id);
        info!(team_name, conversation_id = %ts.conversation_id, "Team conversation archived");
    }

    if let Some(keys) = ws_lock.team_dedup_keys.remove(team_name) {
        for key in keys {
            ws_lock.seen_messages.remove(&key);
        }
    }

    let prefix = teams_dir.join(team_name);
    ws_lock
        .last_processed_index
        .retain(|k, _| !k.starts_with(&prefix));

    ws_lock.skipped_teams.remove(team_name);

    info!(team_name, "Team removed");
}

fn common_ancestor(paths: &[&str]) -> Option<String> {
    if paths.is_empty() {
        return None;
    }
    let parts: Vec<Vec<&str>> = paths.iter().map(|p| p.split('/').collect()).collect();
    let mut common: Vec<&str> = Vec::new();
    for i in 0..parts[0].len() {
        let segment = parts[0][i];
        if parts.iter().all(|p| p.get(i) == Some(&segment)) {
            common.push(segment);
        } else {
            break;
        }
    }
    let result = common.join("/");
    if result.is_empty() || result == "/" {
        return None;
    }
    let home = dirs::home_dir()
        .map(|h| h.display().to_string())
        .unwrap_or_else(|| "/Users".into());
    if result == home || result.len() <= home.len() {
        return None;
    }
    Some(result)
}
