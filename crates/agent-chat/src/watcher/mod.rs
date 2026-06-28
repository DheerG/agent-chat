//! Transcript-based team message ingester.
//!
//! Claude Code changed how agent teams communicate. The old per-recipient inbox
//! files (`~/.claude/teams/<team>/inboxes/<member>.json`) are now a transient
//! delivery queue that CC drains to `[]` right after in-memory hand-off, so a
//! file-watcher reading them catches only a dwell-time-biased lucky subset.
//!
//! The durable record is the append-only session transcripts under
//! `~/.claude/projects/<proj>/`:
//!   - lead:    `<proj>/<leadSessionId>.jsonl`
//!   - members: `<proj>/<leadSessionId>/subagents/agent-a<name>-<hash>.jsonl`
//!
//! Every delivered message appears as a `type:"user"` line whose content holds
//! one or more `<teammate-message teammate_id="…" …>BODY</teammate-message>`
//! wrappers (the lead's copies are prefixed with "Another Claude session sent a
//! message:\n"). Discovery still uses `~/.claude/teams/<team>/config.json`
//! (members, cwd, leadSessionId); only the message *source* moves to transcripts.
//!
//! Design guarantees (see the team's converged plan):
//!   * No loss vs read timing — we tail an append-only log, not a drained queue.
//!   * Exactly-once — every record carries a stable `source_key`; the DB unique
//!     index makes re-reads idempotent, replacing the fragile 5s dedup window.
//!   * Restart-safe — byte offsets are persisted per file.
//!   * Partial-write-safe — only whole, newline-terminated lines are consumed.
//!   * All recipients — every member transcript is tailed, including members
//!     spawned mid-run; non-lead-addressed messages are no longer lost.
//!   * Fail toward showing — an unrecognized row is surfaced, never silently
//!     dropped; only an explicit noise denylist is collapsed.

use crate::services::AppState;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::time::{interval, Duration};
use tracing::{error, info};

/// How often transcripts are tailed for new appends. ~1s gives near-real-time
/// capture; the WebSocket pushes each new message to clients immediately.
const POLL_INTERVAL_MS: u64 = 1_000;

// ─── Config (discovery) ────────────────────────────────────────────

#[derive(Deserialize)]
struct TeamConfig {
    #[allow(dead_code)]
    name: Option<String>,
    #[serde(rename = "leadAgentId")]
    lead_agent_id: Option<String>,
    #[serde(rename = "leadSessionId")]
    lead_session_id: Option<String>,
    members: Option<Vec<TeamMember>>,
}

#[derive(Deserialize, Clone)]
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

/// Sidecar metadata for a subagent transcript. Real teammates carry
/// `taskKind == "in_process_teammate"`; incidental tool helpers (e.g. an
/// Explore agent) do not and must be excluded.
#[derive(Deserialize)]
struct SubagentMeta {
    name: Option<String>,
    #[serde(rename = "taskKind")]
    task_kind: Option<String>,
}

// ─── Watcher state ─────────────────────────────────────────────────

struct TeamState {
    conversation_id: String,
    lead_session_id: String,
    /// `~/.claude/projects/<proj>` — where this team's transcripts live.
    project_dir: PathBuf,
    /// Display name of the lead member (owner of the lead transcript).
    lead_name: String,
}

struct WatcherState {
    teams: HashMap<String, TeamState>,
    skipped_teams: HashSet<String>,
    /// Sender-side SendMessage events keyed by tool_use id, used to enrich a
    /// delivered wrapper's event_time with the TRUE send time.
    send_index: HashMap<String, SendInfo>,
}

/// A sender-side SendMessage tool_use, used to enrich the matching delivered
/// wrapper's event_time. (An in-feed "undelivered" probe was tried and removed:
/// in real time you cannot distinguish a slow-but-delivered message from a lost
/// one — delivery latency is unbounded — so any such signal cries wolf. The
/// tail-gap stays honestly disclosed in the README instead.)
struct SendInfo {
    /// Scopes this send to its team — the watcher tracks many teams through one
    /// shared state, so enrichment must never cross conversation boundaries.
    conversation_id: String,
    send_time: String,
    sender: String,
    to: String,
    body: String,
    matched: bool,
}

impl WatcherState {
    fn new() -> Self {
        Self {
            teams: HashMap::new(),
            skipped_teams: HashSet::new(),
            send_index: HashMap::new(),
        }
    }
}

/// Start the transcript watcher in a background tokio task.
pub fn start(state: AppState, teams_dir: PathBuf) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(e) = run_watcher(state, teams_dir).await {
            error!(error = %e, "TeamTranscriptWatcher crashed");
        }
    })
}

async fn run_watcher(state: AppState, teams_dir: PathBuf) -> anyhow::Result<()> {
    if !teams_dir.exists() {
        fs::create_dir_all(&teams_dir).ok();
    }
    // ~/.claude/projects, sibling of ~/.claude/teams.
    let projects_dir = teams_dir
        .parent()
        .map(|p| p.join("projects"))
        .unwrap_or_else(|| teams_dir.join("..").join("projects"));

    let ws = Arc::new(Mutex::new(WatcherState::new()));

    // Archive teams whose directory was deleted while the server was off.
    reconcile_missing_teams(&state, &teams_dir);

    info!(
        teams_dir = %teams_dir.display(),
        projects_dir = %projects_dir.display(),
        "TeamTranscriptWatcher started"
    );

    let mut ticker = interval(Duration::from_millis(POLL_INTERVAL_MS));
    loop {
        ticker.tick().await;
        discover_teams(&state, &teams_dir, &projects_dir, &ws);
        let team_names: Vec<String> = {
            let lock = ws.lock().unwrap();
            lock.teams.keys().cloned().collect()
        };
        for name in team_names {
            ingest_team(&state, &name, &ws);
        }
    }
}

fn reconcile_missing_teams(state: &AppState, teams_dir: &Path) {
    for conv in state.db.list_unarchived_team_conversations() {
        let config_path = teams_dir.join(&conv.name).join("config.json");
        if !config_path.exists() {
            state.db.archive_conversation(&conv.id);
            info!(conversation_id = %conv.id, name = %conv.name, "Archived — team dir missing");
        }
    }
}

// ─── Discovery ─────────────────────────────────────────────────────

fn discover_teams(
    state: &AppState,
    teams_dir: &Path,
    projects_dir: &Path,
    ws: &Arc<Mutex<WatcherState>>,
) {
    let entries = match fs::read_dir(teams_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut current: HashSet<String> = HashSet::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.path().is_dir() {
            continue;
        }
        // A team whose directory still exists is NOT gone — keep it in `current`
        // (out of the removal pass) even if config.json is momentarily absent
        // mid-rewrite. Otherwise a transient missing config would archive the
        // active conversation and split it into a new one when config returns.
        current.insert(name.clone());
        if !teams_dir.join(&name).join("config.json").exists() {
            continue; // can't ingest without config this tick; retry next tick
        }
        // Refresh member roster every tick (cheap, idempotent) so a config
        // change that adds members re-syncs the session roster + counts.
        process_team(state, teams_dir, projects_dir, &name, ws);
    }

    // Archive teams whose directory disappeared.
    let removed: Vec<String> = {
        let lock = ws.lock().unwrap();
        lock.teams.keys().filter(|k| !current.contains(*k)).cloned().collect()
    };
    for name in removed {
        remove_team(state, &name, ws);
    }
    ws.lock().unwrap().skipped_teams.retain(|s| current.contains(s));
}

fn process_team(
    state: &AppState,
    teams_dir: &Path,
    projects_dir: &Path,
    team_name: &str,
    ws: &Arc<Mutex<WatcherState>>,
) {
    let config_path = teams_dir.join(team_name).join("config.json");
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

    let lead_session_id = match &config.lead_session_id {
        Some(s) if !s.is_empty() => s.clone(),
        _ => {
            ws.lock().unwrap().skipped_teams.insert(team_name.to_string());
            return;
        }
    };

    let lead_name = config
        .lead_agent_id
        .as_deref()
        .and_then(|aid| {
            config
                .members
                .as_ref()
                .and_then(|ms| ms.iter().find(|m| m.agent_id == aid))
                .map(|m| m.name.clone())
        })
        .unwrap_or_else(|| "team-lead".to_string());

    // Resolve the project transcript dir from the lead session id (robust —
    // avoids replicating CC's cwd path-encoding).
    let project_dir = match find_project_dir(projects_dir, &lead_session_id) {
        Some(p) => p,
        None => {
            // Transcripts not on disk yet — try again next tick, don't skip.
            return;
        }
    };

    // Already tracked: refresh the member roster, and re-point the transcript
    // tree if Claude rewrote config.json with a new leadSessionId (otherwise we
    // would keep tailing the old transcripts and miss every new message).
    {
        let mut lock = ws.lock().unwrap();
        if let Some(ts) = lock.teams.get_mut(team_name) {
            let conv_id = ts.conversation_id.clone();
            if ts.lead_session_id != lead_session_id || ts.project_dir != project_dir {
                ts.lead_session_id = lead_session_id.clone();
                ts.project_dir = project_dir.clone();
                info!(team_name, "Lead session changed — re-pointed transcript tree");
            }
            // Refresh the cached lead name too: if the team was first discovered
            // before config.members was populated, lead_name was the fallback
            // "team-lead"; a later config rewrite fills in the real name, and
            // lead rows/enrichment must use it even when the session is unchanged.
            if ts.lead_name != lead_name {
                ts.lead_name = lead_name.clone();
            }
            drop(lock);
            register_members(state, &conv_id, &config);
            return;
        }
    }

    // Compute workspace from member cwds for display.
    let cwds: Vec<&str> = config
        .members
        .as_ref()
        .map(|m| m.iter().filter_map(|m| m.cwd.as_deref()).collect())
        .unwrap_or_default();
    let workspace_path = common_ancestor(&cwds)
        .or_else(|| cwds.first().map(|s| s.to_string()))
        .unwrap_or_else(|| project_dir.display().to_string());
    let workspace_name = Path::new(&workspace_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Find or create the conversation (with name disambiguation), restoring an
    // archived one if it reappears.
    let mut conversation = state.db.find_conversation_by_name(team_name);
    if let Some(conv) = conversation.as_ref().filter(|c| c.archived_at.is_some()) {
        state.db.restore_conversation(&conv.id);
        info!(conversation_id = %conv.id, "Auto-restored conversation");
    }
    if conversation.is_none() {
        let existing = state.db.find_conversations_by_name_prefix(team_name);
        // Disambiguate only when the exact name is already taken by a live team.
        let name = if existing.iter().any(|c| c.name == team_name) {
            let max_suffix = existing
                .iter()
                .filter_map(|c| {
                    c.name
                        .strip_prefix(team_name)
                        .and_then(|s| s.strip_prefix('-'))
                        .and_then(|s| s.parse::<u32>().ok())
                })
                .max()
                .unwrap_or(1);
            format!("{team_name}-{}", max_suffix + 1)
        } else {
            team_name.to_string()
        };
        conversation = Some(state.db.create_conversation(
            &name,
            Some(&workspace_path),
            Some(&workspace_name),
            "team",
        ));
    }
    let conversation = conversation.unwrap();

    // NOTE: we do NOT auto-delete legacy inbox-era rows (NULL source_key) here.
    // The transcript ingest cannot be guaranteed to recreate every legacy
    // message (a tail-gap message with no delivery record, or a member
    // transcript that never appears), so deleting them up front risks losing
    // history that can't be rebuilt. Upgraders who want a clean slate run
    // `agent-chat --rebuild` (documented in the README), which deletes the DB
    // and rebuilds entirely from transcripts. Until then, the worst case is a
    // few duplicated rows for the overlap — never silent data loss.

    register_members(state, &conversation.id, &config);

    ws.lock().unwrap().teams.insert(
        team_name.to_string(),
        TeamState {
            conversation_id: conversation.id.clone(),
            lead_session_id,
            project_dir,
            lead_name,
        },
    );
    info!(team_name, conversation_id = %conversation.id, "Team discovered");

    ingest_team(state, team_name, ws);
}

/// Upsert every member as a session and recompute the derived session counts.
/// Fixes the "1 session" roster bug: members are written to config *after*
/// creation, so a create-time-only registration always undercounted.
fn register_members(state: &AppState, conversation_id: &str, config: &TeamConfig) {
    if let Some(members) = &config.members {
        for m in members {
            state.db.upsert_session(
                &m.agent_id,
                Some(conversation_id),
                Some(&m.name),
                m.agent_type.as_deref(),
                m.model.as_deref(),
                m.cwd.as_deref(),
            );
        }
    }
    state.db.resync_session_counts(conversation_id);
}

fn remove_team(state: &AppState, team_name: &str, ws: &Arc<Mutex<WatcherState>>) {
    let mut lock = ws.lock().unwrap();
    if let Some(ts) = lock.teams.remove(team_name) {
        state.db.archive_conversation(&ts.conversation_id);
        info!(team_name, conversation_id = %ts.conversation_id, "Team conversation archived");
    }
    lock.skipped_teams.remove(team_name);
}

/// Locate `~/.claude/projects/<proj>` containing `<lead_session_id>.jsonl`.
fn find_project_dir(projects_dir: &Path, lead_session_id: &str) -> Option<PathBuf> {
    let file = format!("{lead_session_id}.jsonl");
    let entries = fs::read_dir(projects_dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() && p.join(&file).exists() {
            return Some(p);
        }
    }
    None
}

// ─── Ingestion ─────────────────────────────────────────────────────

/// One transcript to tail, with its owner identity.
struct Owner {
    name: String,
    session_token: String,
    is_lead: bool,
}

/// New, whole lines read from one transcript this tick — gathered before any
/// emission so the send-index is complete before delivered wrappers are ordered.
struct PendingFile {
    path_str: String,
    owner: Owner,
    lines: Vec<Value>,
    new_offset: u64,
    file_size: u64,
}

fn ingest_team(state: &AppState, team_name: &str, ws: &Arc<Mutex<WatcherState>>) {
    let (conversation_id, project_dir, lead_session_id, lead_name) = {
        let lock = ws.lock().unwrap();
        match lock.teams.get(team_name) {
            Some(ts) => (
                ts.conversation_id.clone(),
                ts.project_dir.clone(),
                ts.lead_session_id.clone(),
                ts.lead_name.clone(),
            ),
            None => return,
        }
    };

    // ── 1. Gather new lines from every transcript (no emit yet) ──────────
    let mut pending: Vec<PendingFile> = Vec::new();
    let lead_file = project_dir.join(format!("{lead_session_id}.jsonl"));
    if lead_file.exists() {
        let owner = Owner {
            name: lead_name.clone(),
            session_token: lead_session_id.clone(),
            is_lead: true,
        };
        if let Some(pf) = read_new_lines(state, &lead_file, owner) {
            pending.push(pf);
        }
    }
    let subagents = project_dir.join(&lead_session_id).join("subagents");
    if let Ok(entries) = fs::read_dir(&subagents) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(owner) = member_owner(&path) else {
                continue;
            };
            if let Some(pf) = read_new_lines(state, &path, owner) {
                pending.push(pf);
            }
        }
    }
    if pending.is_empty() {
        return;
    }

    // ── 2. Sends pass: index every SendMessage (true send time) so delivered
    //       wrappers can be ordered on it before any of them are emitted ──────
    {
        let mut lock = ws.lock().unwrap();
        for pf in &pending {
            for line in &pf.lines {
                scan_send(line, &conversation_id, &pf.owner, &mut lock.send_index);
            }
        }
    }

    // ── 3. Recognize + enrich every new row ACROSS all files, then emit in
    //       global event_time order. Emitting file-by-file would push a later
    //       lead row before an earlier member row on a multi-file/backfill tick
    //       (the live feed appends in emit order), and leave the summary preview
    //       on a non-latest message.
    let mut batch: Vec<(usize, Extracted)> = Vec::new();
    for (i, pf) in pending.iter().enumerate() {
        for line in &pf.lines {
            for mut ex in recognize(line, &pf.owner) {
                enrich_event_time(&mut ex, &conversation_id, ws);
                batch.push((i, ex));
            }
        }
    }
    // Stable sort by event_time (ISO8601 sorts lexically); preserves
    // within-same-instant order, including the per-line wrapper ordinal.
    batch.sort_by(|a, b| a.1.event_time.cmp(&b.1.event_time));

    // Per-file latest event time, for the coverage signal's last_event_at.
    let mut last_per_file: Vec<Option<String>> = vec![None; pending.len()];
    for (i, ex) in &batch {
        if last_per_file[*i].as_deref().is_none_or(|c| ex.event_time.as_str() > c) {
            last_per_file[*i] = Some(ex.event_time.clone());
        }
        emit(state, &conversation_id, ex);
    }

    // ── 4. Persist each file's offset (independent of emit order) ──────────
    for (i, pf) in pending.iter().enumerate() {
        state.db.set_ingest_offset(
            &pf.path_str,
            &conversation_id,
            &pf.owner.name,
            pf.new_offset as i64,
            pf.file_size as i64,
            last_per_file[i].as_deref(),
        );
    }
}

/// Read whole new lines from a transcript's persisted offset (no emit, no offset
/// advance — the caller persists the offset after emitting).
fn read_new_lines(state: &AppState, path: &Path, owner: Owner) -> Option<PendingFile> {
    let path_str = path.to_string_lossy().to_string();
    let start_offset = state.db.get_ingest_offset(&path_str).max(0) as u64;
    let mut file = fs::File::open(path).ok()?;
    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    // File shrank (rotated/truncated) → re-read from 0; source_key idempotency
    // prevents any double-posting.
    let read_from = if file_size < start_offset { 0 } else { start_offset };
    if file_size == read_from {
        return None; // nothing new
    }
    file.seek(SeekFrom::Start(read_from)).ok()?;
    let mut buf = String::new();
    file.read_to_string(&mut buf).ok()?;
    // Only consume up to the last newline; a trailing partial line waits.
    let last_nl = buf.rfind('\n')?;
    let lines: Vec<Value> = buf[..=last_nl]
        .split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    Some(PendingFile {
        path_str,
        owner,
        lines,
        new_offset: read_from + last_nl as u64 + 1,
        file_size,
    })
}

/// Index a line's SendMessage tool_use(s) as pending sends (keyed by tool_use id).
fn scan_send(
    line: &Value,
    conversation_id: &str,
    owner: &Owner,
    index: &mut HashMap<String, SendInfo>,
) {
    if line.get("type").and_then(|v| v.as_str()) != Some("assistant") {
        return;
    }
    let ts = line.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
    let uuid = line.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
    if ts.is_empty() || uuid.is_empty() {
        return;
    }
    let blocks = match line
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        Some(a) => a,
        None => return,
    };
    for block in blocks {
        if block.get("type").and_then(|t| t.as_str()) != Some("tool_use")
            || block.get("name").and_then(|n| n.as_str()) != Some("SendMessage")
        {
            continue;
        }
        let id = match block.get("id").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let input = block.get("input");
        let to = input
            .and_then(|x| x.get("to"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let body = input
            .and_then(|x| x.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        // Skip non-teammate targets (e.g. "main") and empty bodies.
        if to.is_empty() || body.is_empty() || to == "main" {
            continue;
        }
        index.entry(id).or_insert(SendInfo {
            conversation_id: conversation_id.to_string(),
            send_time: ts.to_string(),
            sender: owner.name.clone(),
            to,
            body,
            matched: false,
        });
    }
}

fn normalize_body(s: &str) -> String {
    s.trim().to_string()
}

/// Enrich a delivered agent↔agent wrapper's event_time with the matching send's
/// true send time (and mark that send delivered). Falls back to delivery time.
fn enrich_event_time(ex: &mut Extracted, conversation_id: &str, ws: &Arc<Mutex<WatcherState>>) {
    if ex.sender_type != "agent" {
        return; // human/lead rows are not sender-side sends
    }
    let body = normalize_body(&ex.content);
    let mut lock = ws.lock().unwrap();
    // Among unmatched sends with the same sender/recipient/body, take the
    // EARLIEST by send_time. If a sender sends the same body twice before either
    // is enriched, this pairs first-sent with first-delivered instead of picking
    // one in nondeterministic HashMap order (which could swap their send_times).
    let best = lock
        .send_index
        .iter()
        .filter(|(_, info)| {
            info.conversation_id == conversation_id
                && !info.matched
                && info.sender == ex.sender_name
                && info.to == ex.recipient
                && normalize_body(&info.body) == body
        })
        .min_by(|a, b| a.1.send_time.cmp(&b.1.send_time))
        .map(|(k, _)| k.clone());
    if let Some(info) = best.and_then(|k| lock.send_index.get_mut(&k)) {
        info.matched = true;
        ex.event_time = info.send_time.clone();
        ex.timestamp_source = "send".into();
    }
}

/// Resolve a subagent transcript's owner, or None if it is not a real teammate
/// (e.g. an Explore helper with no `taskKind`).
fn member_owner(transcript: &Path) -> Option<Owner> {
    let meta_path = transcript.with_extension("meta.json");
    let meta: SubagentMeta = fs::read_to_string(&meta_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())?;
    if meta.task_kind.as_deref() != Some("in_process_teammate") {
        return None;
    }
    let name = meta.name?;
    let stem = transcript.file_stem()?.to_string_lossy().to_string();
    Some(Owner {
        name,
        session_token: stem,
        is_lead: false,
    })
}


/// A message recognized out of one transcript record.
struct Extracted {
    sender_name: String,
    sender_type: String,
    message_type: String,
    content: String,
    color: Option<String>,
    summary: Option<String>,
    status_type: Option<String>,
    event_time: String,
    recipient: String,
    source_key: String,
    /// "delivery" (transcript delivery time, approximate) or "send" (enriched
    /// with the true sender-side send time). Drives the UI's provisional marker.
    timestamp_source: String,
}

fn emit(state: &AppState, conversation_id: &str, ex: &Extracted) {
    // Every delivery copy is emitted as its own idempotent row (keyed on a
    // persisted source_key). We deliberately do NOT collapse "same logical
    // message to N recipients" in the watcher: the previous in-memory collapse
    // was the only code path that could drop or duplicate a message (its
    // collapsed copy's source_key was never persisted, so a file-shrink re-read
    // past the in-memory window re-inserted a duplicate; and a recipient-
    // agnostic key silently dropped two distinct identical-body sends). N
    // attributed rows is the team's accepted fail-toward-visible fallback and is
    // strictly loss/dup-free. Broadcast grouping, if wanted, belongs at the
    // display/data-model layer keyed on the persisted rows, not here.
    let mut metadata = serde_json::Map::new();
    metadata.insert("recipient".into(), Value::String(ex.recipient.clone()));
    metadata.insert("recipients".into(), serde_json::json!([ex.recipient]));
    if let Some(c) = &ex.color {
        metadata.insert("color".into(), Value::String(c.clone()));
    }
    if let Some(s) = &ex.summary {
        metadata.insert("summary".into(), Value::String(s.clone()));
    }
    if let Some(t) = &ex.status_type {
        metadata.insert("original_type".into(), Value::String(t.clone()));
    }
    metadata.insert("source".into(), Value::String("transcript".into()));
    // Ordering provenance for the UI's provisional marker. "send" = enriched
    // with the true sender-side time (settled); "delivery" = transcript delivery
    // time (approximate — preserves causal order for direct chains, may skew
    // cross-recipient; shown provisional).
    metadata.insert(
        "timestampSource".into(),
        Value::String(ex.timestamp_source.clone()),
    );

    let sender_id = format!("{}@{}", ex.sender_name, conversation_id);
    let inserted = state.ingest_message(
        conversation_id,
        &sender_id,
        &ex.sender_name,
        &ex.sender_type,
        &ex.content,
        &ex.message_type,
        &Value::Object(metadata),
        Some(&ex.event_time),
        &ex.source_key,
    );

    if inserted.is_some() {
        // Keep the conversation summary current (substantive vs notification
        // split is computed at read time from message_type).
        state.db.increment_summary_messages(
            conversation_id,
            &ex.content,
            &ex.sender_name,
            Some(&ex.event_time),
        );
    }
}

// ─── Recognizers ───────────────────────────────────────────────────

/// Turn one transcript JSON line into zero or more messages.
fn recognize(line: &Value, owner: &Owner) -> Vec<Extracted> {
    let line_type = line.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let uuid = line.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
    let ts = line
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if uuid.is_empty() || ts.is_empty() {
        return vec![];
    }

    match line_type {
        "user" => recognize_user(line, owner, uuid, &ts),
        "assistant" if owner.is_lead => recognize_lead_output(line, owner, uuid, &ts),
        "attachment" if owner.is_lead => recognize_attachment(line, owner, uuid, &ts),
        _ => vec![], // system/mode/other attachments — noise, collapsed
    }
}

/// A user steer typed while the lead was busy is queued by Claude Code as a
/// `type:"attachment"` row with `attachment.type:"queued_command"` and
/// `attachment.origin.kind:"human"` — NOT a `type:"user"` row. Capture those
/// (lead transcript only) so mid-run human instructions aren't dropped. Queued
/// `task-notification`s carry no human origin, so machine notifications are
/// never mistaken for the user's voice.
fn recognize_attachment(line: &Value, owner: &Owner, uuid: &str, ts: &str) -> Vec<Extracted> {
    let Some(att) = line.get("attachment") else {
        return vec![];
    };
    let is_human_queued = att.get("type").and_then(|v| v.as_str()) == Some("queued_command")
        && att.get("origin").and_then(|o| o.get("kind")).and_then(|k| k.as_str()) == Some("human");
    if !is_human_queued {
        return vec![];
    }
    let prompt = att.get("prompt").and_then(|v| v.as_str()).unwrap_or("").trim();
    if prompt.is_empty() || is_pulse(prompt) {
        return vec![];
    }
    // The attachment timestamp is when the user actually typed the steer (queue
    // time), which orders it more truthfully than the delivery row's timestamp.
    let event_time = att.get("timestamp").and_then(|v| v.as_str()).unwrap_or(ts);
    vec![Extracted {
        sender_name: "you".into(),
        sender_type: "human".into(),
        message_type: "human".into(),
        content: prompt.to_string(),
        color: None,
        summary: None,
        status_type: None,
        event_time: event_time.to_string(),
        recipient: owner.name.clone(),
        source_key: format!("{}:{}:queued", owner.session_token, uuid),
        timestamp_source: "delivery".into(),
    }]
}

fn recognize_user(line: &Value, owner: &Owner, uuid: &str, ts: &str) -> Vec<Extracted> {
    let content = message_content_text(line);

    // (1) Inbound teammate-message wrappers — the primary agent↔agent record.
    let wrappers = extract_wrappers(&content);
    if !wrappers.is_empty() {
        return wrappers
            .into_iter()
            .map(|w| {
                let trimmed = w.body.trim_start();
                let (message_type, status_type) = if trimmed.starts_with("{\"type\":\"") {
                    // idle/task notifications now arrive as JSON inside the
                    // wrapper — classify as status so the UI can collapse them.
                    let st = serde_json::from_str::<Value>(trimmed)
                        .ok()
                        .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(String::from));
                    ("status".to_string(), st)
                } else {
                    ("text".to_string(), None)
                };
                Extracted {
                    sender_name: w.teammate_id.clone(),
                    sender_type: "agent".into(),
                    message_type,
                    content: w.body,
                    color: w.color,
                    summary: w.summary,
                    status_type,
                    event_time: ts.to_string(),
                    recipient: owner.name.clone(),
                    source_key: format!("{}:{}:w{}", owner.session_token, uuid, w.ordinal),
                    timestamp_source: "delivery".into(),
                }
            })
            .collect();
    }

    // The human↔lead operator channel lives only in the lead transcript.
    if !owner.is_lead {
        return vec![];
    }

    // (2) Human's AskUserQuestion answers arrive as a tool_result.
    if let Some(answer) = human_decision_text(line) {
        return vec![Extracted {
            sender_name: "you".into(),
            sender_type: "human".into(),
            message_type: "human".into(),
            content: answer,
            color: None,
            summary: None,
            status_type: None,
            event_time: ts.to_string(),
            recipient: owner.name.clone(),
            source_key: format!("{}:{}:human", owner.session_token, uuid),
            timestamp_source: "delivery".into(),
        }];
    }

    // (3) Human typed input (the user's request + steers). Claude marks these
    // as origin.kind=="human" and/or promptSource=="typed"; accept either, since
    // the format has drifted across versions and missing the user's own messages
    // is the worst capture failure. System-injected prompts (pulses, reminders)
    // are promptSource=="system" — excluded — and the wrapper/tool_result paths
    // above have already claimed agent deliveries and question answers.
    let origin_human = line
        .get("origin")
        .and_then(|o| o.get("kind"))
        .and_then(|k| k.as_str())
        == Some("human");
    let typed = line.get("promptSource").and_then(|v| v.as_str()) == Some("typed");
    let is_human = origin_human || typed;
    if is_human && !content.trim().is_empty() && !is_pulse(&content) {
        return vec![Extracted {
            sender_name: "you".into(),
            sender_type: "human".into(),
            message_type: "human".into(),
            content: content.trim().to_string(),
            color: None,
            summary: None,
            status_type: None,
            event_time: ts.to_string(),
            recipient: owner.name.clone(),
            source_key: format!("{}:{}:human", owner.session_token, uuid),
            timestamp_source: "delivery".into(),
        }];
    }

    vec![]
}

/// Lead's substantive output to the human (text blocks only; tool_use-only rows
/// are noise). Rendered collapsed-but-visible so the watcher isn't reading
/// answers to invisible questions.
fn recognize_lead_output(line: &Value, owner: &Owner, uuid: &str, ts: &str) -> Vec<Extracted> {
    let text = assistant_text(line);
    if text.trim().is_empty() {
        return vec![];
    }
    vec![Extracted {
        sender_name: owner.name.clone(),
        sender_type: "lead".into(),
        message_type: "lead".into(),
        content: text.trim().to_string(),
        color: None,
        summary: None,
        status_type: None,
        event_time: ts.to_string(),
        recipient: "you".into(),
        source_key: format!("{}:{}:lead", owner.session_token, uuid),
        timestamp_source: "delivery".into(),
    }]
}

// ─── Wrapper parsing ───────────────────────────────────────────────

struct Wrapper {
    teammate_id: String,
    color: Option<String>,
    summary: Option<String>,
    body: String,
    ordinal: usize,
}

/// Extract every `<teammate-message …>BODY</teammate-message>` from a line.
///
/// Robust against the three real hazards: the lead-side prefix (we substring
/// match the tag anywhere, never anchor to line start), multiple wrappers per
/// line (we iterate), and bodies that quote the tag (CC escapes a body's own
/// `</teammate-message>` as `<\/…>`, so the real closing tag is the unescaped
/// one; and a real opening always carries `teammate_id=`).
fn extract_wrappers(content: &str) -> Vec<Wrapper> {
    const OPEN: &str = "<teammate-message";
    const CLOSE: &str = "</teammate-message>";
    let mut out = Vec::new();
    let mut search = 0usize;
    let mut ordinal = 0usize;

    while let Some(rel) = content[search..].find(OPEN) {
        let open_pos = search + rel;
        let tag_end = match content[open_pos..].find('>') {
            Some(e) => open_pos + e,
            None => break,
        };
        let opening = &content[open_pos..tag_end];
        if !opening.contains("teammate_id=") {
            // A prose mention of the tag, not a real wrapper.
            search = tag_end + 1;
            continue;
        }
        let body_start = tag_end + 1;
        let (body_end, after) = find_unescaped(content, body_start, CLOSE);
        let raw_body = &content[body_start..body_end];
        let (teammate_id, color, summary) = parse_attrs(opening);
        out.push(Wrapper {
            teammate_id,
            color,
            summary,
            body: unescape_tags(raw_body).trim().to_string(),
            ordinal,
        });
        ordinal += 1;
        search = after;
    }
    out
}

/// Find `needle` at/after `from`, skipping escaped occurrences (preceded by a
/// backslash). Returns (start_of_needle, index_after_needle); if not found,
/// both default to the end of the string (body runs to EOL).
fn find_unescaped(content: &str, from: usize, needle: &str) -> (usize, usize) {
    let mut i = from;
    while let Some(rel) = content[i..].find(needle) {
        let pos = i + rel;
        let escaped = pos > 0 && content.as_bytes()[pos - 1] == b'\\';
        if !escaped {
            return (pos, pos + needle.len());
        }
        i = pos + 1;
    }
    (content.len(), content.len())
}

fn unescape_tags(s: &str) -> String {
    s.replace("<\\/teammate-message>", "</teammate-message>")
        .replace("<\\/", "</")
}

/// Pull teammate_id / color / summary from an opening tag. Values are read up to
/// the next double quote (summary may contain `>` but rarely a quote).
fn parse_attrs(opening: &str) -> (String, Option<String>, Option<String>) {
    let get = |key: &str| -> Option<String> {
        let needle = format!("{key}=\"");
        let start = opening.find(&needle)? + needle.len();
        let rest = &opening[start..];
        let end = rest.find('"')?;
        Some(rest[..end].to_string())
    };
    (
        get("teammate_id").unwrap_or_default(),
        get("color"),
        get("summary"),
    )
}

// ─── Line content helpers ──────────────────────────────────────────

/// Concatenated text of a user/assistant line's content (string or block array).
fn message_content_text(line: &Value) -> String {
    let content = match line.get("message").and_then(|m| m.get("content")) {
        Some(c) => c,
        None => return String::new(),
    };
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        let mut out = String::new();
        for block in arr {
            if block.get("type").and_then(|t| t.as_str()) != Some("text") {
                continue;
            }
            if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(t);
            }
        }
        return out;
    }
    String::new()
}

fn assistant_text(line: &Value) -> String {
    message_content_text(line)
}

/// If a user line is a tool_result carrying an AskUserQuestion answer, return
/// the human-readable answer text.
fn human_decision_text(line: &Value) -> Option<String> {
    let arr = line.get("message")?.get("content")?.as_array()?;
    for block in arr {
        if block.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
            let c = block.get("content")?;
            let text = if let Some(s) = c.as_str() {
                s.to_string()
            } else if let Some(inner) = c.as_array() {
                inner
                    .iter()
                    .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                continue;
            };
            // Anchor to the START — a real AskUserQuestion answer always begins
            // with this phrase. A bare `.contains` mis-classified any tool output
            // that merely MENTIONS it (a Bash stdout, a SendMessage success
            // envelope) as the user's own words — an active faithfulness bug on
            // the user's highest-trust channel.
            if text.trim_start().starts_with("Your questions have been answered") {
                return Some(text.trim().to_string());
            }
        }
    }
    None
}

/// Heartbeat-cron prompts injected by the team harness — collapsed as noise.
fn is_pulse(content: &str) -> bool {
    content.trim_start().starts_with("Pulse: check your state")
}

// ─── Misc ──────────────────────────────────────────────────────────

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

#[cfg(test)]
mod tests;
