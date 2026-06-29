use super::Database;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// Monotonic message-id source. `Ulid::new()` is not ordered within a single
/// millisecond, but the feed breaks event_time ties by id — so two wrappers
/// from the SAME transcript line (same event_time) could otherwise display out
/// of transcript order. Forcing each new id strictly greater than the last
/// makes the id tiebreak preserve insertion (transcript ordinal) order.
static LAST_MESSAGE_ID: Mutex<Option<ulid::Ulid>> = Mutex::new(None);

fn next_message_id() -> String {
    let mut guard = LAST_MESSAGE_ID.lock().unwrap();
    let mut id = ulid::Ulid::new();
    if let Some(prev) = (*guard).filter(|&p| id <= p) {
        id = prev.increment().unwrap_or(id);
    }
    *guard = Some(id);
    id.to_string()
}

// ─── Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub name: String,
    pub workspace_path: Option<String>,
    pub workspace_name: Option<String>,
    #[serde(rename = "type")]
    pub conv_type: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub conversation_id: String,
    pub total_messages: i64,
    pub last_message_at: Option<String>,
    pub last_message_preview: Option<String>,
    pub last_message_sender: Option<String>,
    pub active_session_count: i64,
    pub total_session_count: i64,
    pub started_at: Option<String>,
    pub status: String,
}

impl Default for ConversationSummary {
    fn default() -> Self {
        Self {
            conversation_id: String::new(),
            total_messages: 0,
            last_message_at: None,
            last_message_preview: None,
            last_message_sender: None,
            active_session_count: 0,
            total_session_count: 0,
            started_at: None,
            status: "active".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationListItem {
    #[serde(flatten)]
    pub conversation: Conversation,
    pub summary: ConversationSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub conversation_id: Option<String>,
    pub agent_name: Option<String>,
    pub agent_type: Option<String>,
    pub model: Option<String>,
    pub cwd: Option<String>,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub parent_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub parent_message_id: Option<String>,
    pub sender_id: String,
    pub sender_name: String,
    pub sender_type: String,
    pub content: String,
    pub message_type: String,
    pub metadata: serde_json::Value,
    pub created_at: String,
    /// Real send/delivery time from the transcript. The feed orders on this.
    /// Falls back to created_at (ingestion time) for legacy rows.
    pub event_time: Option<String>,
}

/// Per-member capture coverage for a conversation. Powers the watcher's
/// completeness signal: a watcher can see every member's transcript is being
/// tailed and how far behind capture is, instead of trusting a raw total.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberCoverage {
    pub owner_name: String,
    pub byte_offset: i64,
    pub file_size: i64,
    pub last_event_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedMessages {
    pub messages: Vec<Message>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

// ─── Conversation Queries ──────────────────────────────────────────

impl Database {
    pub fn create_conversation(
        &self,
        name: &str,
        workspace_path: Option<&str>,
        workspace_name: Option<&str>,
        conv_type: &str,
    ) -> Conversation {
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO conversations (id, name, workspace_path, workspace_name, type, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)",
                params![id, name, workspace_path, workspace_name, conv_type, now],
            )
            .expect("insert conversation");

            conn.execute(
                "INSERT INTO conversation_summaries (conversation_id, started_at, updated_at)
                 VALUES (?1, ?2, ?2)",
                params![id, now],
            )
            .expect("insert summary");
        });

        Conversation {
            id,
            name: name.to_string(),
            workspace_path: workspace_path.map(String::from),
            workspace_name: workspace_name.map(String::from),
            conv_type: conv_type.to_string(),
            status: "active".into(),
            created_at: now.clone(),
            updated_at: now,
            archived_at: None,
        }
    }

    pub fn get_conversation(&self, id: &str) -> Option<Conversation> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                 FROM conversations WHERE id = ?1",
                params![id],
                |row| Ok(row_to_conversation(row)),
            )
            .ok()
        })
    }

    /// Find a conversation by exact name, INCLUDING archived ones (an active
    /// match is preferred). The watcher needs the archived row so a team whose
    /// directory reappears can be restored in place — re-ingesting its
    /// transcripts onto a fresh conversation would otherwise collide on the
    /// global unique source_key and leave the team's history missing.
    pub fn find_conversation_by_name(&self, name: &str) -> Option<Conversation> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                 FROM conversations WHERE name = ?1
                 ORDER BY (archived_at IS NULL) DESC, created_at DESC LIMIT 1",
                params![name],
                |row| Ok(row_to_conversation(row)),
            )
            .ok()
        })
    }

    pub fn find_conversations_by_name_prefix(&self, prefix: &str) -> Vec<Conversation> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                     FROM conversations WHERE name LIKE ?1 AND archived_at IS NULL ORDER BY created_at DESC",
                )
                .expect("prepare");
            let pattern = format!("{prefix}%");
            stmt.query_map(params![pattern], |row| Ok(row_to_conversation(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_unarchived_team_conversations(&self) -> Vec<Conversation> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                     FROM conversations WHERE archived_at IS NULL AND type = 'team'",
                )
                .expect("prepare");
            stmt.query_map([], |row| Ok(row_to_conversation(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_active_conversations(&self) -> Vec<Conversation> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                     FROM conversations WHERE archived_at IS NULL AND status IN ('active', 'idle', 'error')
                     ORDER BY updated_at DESC",
                )
                .expect("prepare");
            stmt.query_map([], |row| Ok(row_to_conversation(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_recent_conversations(&self, limit: u32) -> Vec<Conversation> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                     FROM conversations WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?1",
                )
                .expect("prepare");
            stmt.query_map(params![limit], |row| Ok(row_to_conversation(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_all_conversations(&self, limit: u32) -> Vec<Conversation> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                     FROM conversations ORDER BY updated_at DESC LIMIT ?1",
                )
                .expect("prepare");
            stmt.query_map(params![limit], |row| Ok(row_to_conversation(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn archive_conversation(&self, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE conversations SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .expect("archive");
        });
    }

    pub fn restore_conversation(&self, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE conversations SET archived_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .expect("restore");
        });
    }

    pub fn get_summary(&self, conversation_id: &str) -> ConversationSummary {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT conversation_id, total_messages, last_message_at, last_message_preview,
                        last_message_sender, active_session_count, total_session_count, started_at,
                        status, updated_at
                 FROM conversation_summaries WHERE conversation_id = ?1",
                params![conversation_id],
                |row| Ok(row_to_summary(row)),
            )
            .unwrap_or_else(|_| ConversationSummary {
                conversation_id: conversation_id.to_string(),
                ..Default::default()
            })
        })
    }

    pub fn get_all_summaries(&self, ids: &[String]) -> Vec<ConversationSummary> {
        if ids.is_empty() {
            return vec![];
        }
        self.with_conn(|conn| {
            let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{i}")).collect();
            let sql = format!(
                "SELECT conversation_id, total_messages, last_message_at, last_message_preview,
                        last_message_sender, active_session_count, total_session_count, started_at,
                        status, updated_at
                 FROM conversation_summaries WHERE conversation_id IN ({})",
                placeholders.join(", ")
            );
            let mut stmt = conn.prepare(&sql).expect("prepare");
            let params: Vec<&dyn rusqlite::types::ToSql> =
                ids.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
            stmt.query_map(params.as_slice(), |row| Ok(row_to_summary(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_with_summaries(&self, tab: &str, limit: u32) -> Vec<ConversationListItem> {
        let convos = match tab {
            "active" => self.list_active_conversations(),
            "recent" => self.list_recent_conversations(limit),
            _ => self.list_all_conversations(limit),
        };
        let ids: Vec<String> = convos.iter().map(|c| c.id.clone()).collect();
        let summaries = self.get_all_summaries(&ids);
        let summary_map: HashMap<String, ConversationSummary> =
            summaries.into_iter().map(|s| (s.conversation_id.clone(), s)).collect();

        let mut items: Vec<ConversationListItem> = convos
            .into_iter()
            .map(|c| {
                let summary = summary_map
                    .get(&c.id)
                    .cloned()
                    .unwrap_or_else(|| ConversationSummary {
                        conversation_id: c.id.clone(),
                        ..Default::default()
                    });
                ConversationListItem {
                    conversation: c,
                    summary,
                }
            })
            .collect();

        // Sort by most recent message, falling back to conversation updatedAt
        items.sort_by(|a, b| {
            let ta = a.summary.last_message_at.as_deref().unwrap_or(&a.conversation.updated_at);
            let tb = b.summary.last_message_at.as_deref().unwrap_or(&b.conversation.updated_at);
            tb.cmp(ta)
        });

        items
    }

    pub fn increment_summary_messages(
        &self,
        conversation_id: &str,
        preview: &str,
        sender: &str,
        timestamp: Option<&str>,
    ) {
        let ts = timestamp
            .map(String::from)
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
        let truncated: String = preview.chars().take(120).collect();
        self.with_conn(|conn| {
            // Only move the preview/sender forward when this message is at least
            // as new as the current latest — otherwise an out-of-order ingest
            // (a backfilled or send-time-enriched older row arriving after a
            // newer one) would point the preview at an older message. SQLite
            // evaluates every SET RHS against the pre-update row, so the CASE
            // compares against the OLD last_message_at.
            conn.execute(
                "UPDATE conversation_summaries
                 SET total_messages = total_messages + 1,
                     last_message_preview = CASE WHEN ?1 >= COALESCE(last_message_at, '')
                                                 THEN ?2 ELSE last_message_preview END,
                     last_message_sender = CASE WHEN ?1 >= COALESCE(last_message_at, '')
                                                 THEN ?3 ELSE last_message_sender END,
                     last_message_at = MAX(COALESCE(last_message_at, ''), ?1),
                     updated_at = MAX(COALESCE(updated_at, ''), ?1)
                 WHERE conversation_id = ?4",
                params![ts, truncated, sender, conversation_id],
            )
            .expect("increment messages");
        });
    }

    /// Recompute session counts from the sessions table instead of blindly
    /// incrementing. The old increment fired only on conversation creation and
    /// double-counted on re-runs, so every multi-member team showed "1 session".
    /// Deriving from COUNT(sessions) stays correct as members are added on each
    /// config change.
    pub fn resync_session_counts(&self, conversation_id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE conversation_summaries
                 SET total_session_count =
                        (SELECT COUNT(*) FROM sessions WHERE conversation_id = ?2),
                     active_session_count =
                        (SELECT COUNT(*) FROM sessions WHERE conversation_id = ?2 AND status = 'active'),
                     updated_at = ?1
                 WHERE conversation_id = ?2",
                params![now, conversation_id],
            )
            .expect("resync sessions");
        });
    }

    // ─── Ingestion progress + coverage ─────────────────────────────────

    /// Drop all ingest-progress rows for a conversation. Used when the watcher
    /// re-points to a new transcript tree (the lead session changed): the old
    /// paths' rows would otherwise linger and make the coverage signal report
    /// "capture live" off stale, already-caught-up files before the new
    /// transcripts have been tailed.
    pub fn clear_ingest_files(&self, conversation_id: &str) {
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM ingest_files WHERE conversation_id = ?1",
                params![conversation_id],
            )
            .ok();
        });
    }

    /// Persisted byte offset for a transcript file (0 if never read).
    pub fn get_ingest_offset(&self, path: &str) -> i64 {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT byte_offset FROM ingest_files WHERE path = ?1",
                params![path],
                |row| row.get(0),
            )
            .unwrap_or(0)
        })
    }

    /// Record progress for a transcript file: how far we've read, the file's
    /// current size (for lag), and the latest event time ingested from it.
    pub fn set_ingest_offset(
        &self,
        path: &str,
        conversation_id: &str,
        owner_name: &str,
        byte_offset: i64,
        file_size: i64,
        last_event_at: Option<&str>,
    ) {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO ingest_files (path, conversation_id, owner_name, byte_offset, file_size, last_event_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(path) DO UPDATE SET
                    conversation_id = ?2, owner_name = ?3, byte_offset = ?4, file_size = ?5,
                    last_event_at = COALESCE(?6, last_event_at), updated_at = ?7",
                params![path, conversation_id, owner_name, byte_offset, file_size, last_event_at, now],
            )
            .expect("set ingest offset");
        });
    }

    /// Message counts grouped by message_type. Powers the class-separated
    /// header count so a single conflated total (dominated by lead narration +
    /// status noise) can't manufacture false trust about completeness.
    pub fn get_message_class_counts(&self, conversation_id: &str) -> HashMap<String, i64> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT message_type, COUNT(*) FROM messages
                     WHERE conversation_id = ?1 GROUP BY message_type",
                )
                .expect("prepare");
            stmt.query_map(params![conversation_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .expect("query")
            .filter_map(|r| r.ok())
            .collect()
        })
    }

    /// Per-member capture coverage for a conversation (the completeness signal).
    pub fn get_member_coverage(&self, conversation_id: &str) -> Vec<MemberCoverage> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT owner_name, byte_offset, file_size, last_event_at, updated_at
                     FROM ingest_files WHERE conversation_id = ?1 ORDER BY owner_name",
                )
                .expect("prepare");
            stmt.query_map(params![conversation_id], |row| {
                Ok(MemberCoverage {
                    owner_name: row.get(0).unwrap_or_default(),
                    byte_offset: row.get(1).unwrap_or(0),
                    file_size: row.get(2).unwrap_or(0),
                    last_event_at: row.get(3).unwrap_or(None),
                    updated_at: row.get(4).unwrap_or_default(),
                })
            })
            .expect("query")
            .filter_map(|r| r.ok())
            .collect()
        })
    }

    // ─── Message Queries ───────────────────────────────────────────────

    /// Insert a message with an explicit event_time and a stable source_key.
    ///
    /// When `source_key` is provided the insert is idempotent — a second insert
    /// of the same key returns `None` (the row already exists), giving
    /// exactly-once ingestion that survives restarts and full re-scans without
    /// the fragile 5-second time window. `event_time` is the transcript's real
    /// send/delivery time and drives feed ordering.
    #[allow(clippy::too_many_arguments)]
    pub fn insert_message_full(
        &self,
        conversation_id: &str,
        sender_id: &str,
        sender_name: &str,
        sender_type: &str,
        content: &str,
        message_type: &str,
        parent_message_id: Option<&str>,
        metadata: &serde_json::Value,
        event_time: Option<&str>,
        source_key: Option<&str>,
    ) -> Option<Message> {
        let id = next_message_id();
        let created_at = chrono::Utc::now().to_rfc3339();
        let metadata_str = serde_json::to_string(metadata).unwrap_or_else(|_| "{}".into());

        let inserted = self.with_conn(|conn| {
            conn.execute(
                "INSERT OR IGNORE INTO messages (id, conversation_id, parent_message_id, sender_id, sender_name,
                                       sender_type, content, message_type, metadata, created_at, event_time, source_key)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    conversation_id,
                    parent_message_id,
                    sender_id,
                    sender_name,
                    sender_type,
                    content,
                    message_type,
                    metadata_str,
                    created_at,
                    event_time,
                    source_key,
                ],
            )
            .expect("insert message")
        });

        if inserted == 0 {
            // Duplicate source_key — already ingested.
            return None;
        }

        Some(Message {
            id,
            conversation_id: conversation_id.to_string(),
            parent_message_id: parent_message_id.map(String::from),
            sender_id: sender_id.to_string(),
            sender_name: sender_name.to_string(),
            sender_type: sender_type.to_string(),
            content: content.to_string(),
            message_type: message_type.to_string(),
            metadata: metadata.clone(),
            created_at,
            event_time: event_time.map(String::from),
        })
    }

    pub fn get_messages(
        &self,
        conversation_id: &str,
        limit: u32,
        after: Option<&str>,
        before: Option<&str>,
    ) -> Vec<Message> {
        // Order by the real event time (transcript send/delivery time), falling
        // back to ingestion time for legacy rows, with id as the deterministic
        // tiebreaker. The cursor is the composite "<sortKey>\u{1}<id>".
        const SORT: &str = "COALESCE(event_time, created_at)";
        self.with_conn(|conn| {
            let mut sql = String::from(
                "SELECT id, conversation_id, parent_message_id, sender_id, sender_name,
                        sender_type, content, message_type, metadata, created_at, event_time
                 FROM messages WHERE conversation_id = ?1",
            );
            let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
                vec![Box::new(conversation_id.to_string())];

            if let Some(cursor) = after {
                let (sk, id) = resolve_cursor(conn, conversation_id, cursor);
                let i = param_values.len();
                sql.push_str(&format!(
                    " AND ({SORT} > ?{} OR ({SORT} = ?{} AND id > ?{}))",
                    i + 1,
                    i + 1,
                    i + 2
                ));
                param_values.push(Box::new(sk));
                param_values.push(Box::new(id));
            }
            if let Some(cursor) = before {
                let (sk, id) = resolve_cursor(conn, conversation_id, cursor);
                let i = param_values.len();
                sql.push_str(&format!(
                    " AND ({SORT} < ?{} OR ({SORT} = ?{} AND id < ?{}))",
                    i + 1,
                    i + 1,
                    i + 2
                ));
                param_values.push(Box::new(sk));
                param_values.push(Box::new(id));
            }
            sql.push_str(&format!(
                " ORDER BY {SORT} ASC, id ASC LIMIT ?{}",
                param_values.len() + 1
            ));
            param_values.push(Box::new(limit));

            let mut stmt = conn.prepare(&sql).expect("prepare");
            let params: Vec<&dyn rusqlite::types::ToSql> =
                param_values.iter().map(|b| b.as_ref()).collect();
            stmt.query_map(params.as_slice(), |row| Ok(row_to_message(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }

    pub fn list_messages(
        &self,
        conversation_id: &str,
        limit: u32,
        after: Option<&str>,
    ) -> PaginatedMessages {
        let fetch_limit = limit + 1;
        let mut messages = self.get_messages(conversation_id, fetch_limit, after, None);
        let has_more = messages.len() > limit as usize;
        if has_more {
            messages.pop();
        }
        let next_cursor = if has_more {
            messages.last().map(message_cursor)
        } else {
            None
        };
        PaginatedMessages {
            messages,
            pagination: Pagination {
                has_more,
                next_cursor,
            },
        }
    }

    // ─── Session Queries ───────────────────────────────────────────────

    pub fn upsert_session(
        &self,
        id: &str,
        conversation_id: Option<&str>,
        agent_name: Option<&str>,
        agent_type: Option<&str>,
        model: Option<&str>,
        cwd: Option<&str>,
    ) -> Session {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            let existing: Option<Session> = conn
                .query_row(
                    "SELECT id, conversation_id, agent_name, agent_type, model, cwd, status,
                            started_at, ended_at, parent_session_id
                     FROM sessions WHERE id = ?1",
                    params![id],
                    |row| Ok(row_to_session(row)),
                )
                .ok();

            if let Some(existing) = existing {
                // Update fields that are provided
                conn.execute(
                    "UPDATE sessions SET
                        conversation_id = COALESCE(?1, conversation_id),
                        agent_name = COALESCE(?2, agent_name),
                        agent_type = COALESCE(?3, agent_type),
                        model = COALESCE(?4, model),
                        cwd = COALESCE(?5, cwd)
                     WHERE id = ?6",
                    params![conversation_id, agent_name, agent_type, model, cwd, id],
                )
                .expect("update session");

                // Re-read to get final state
                conn.query_row(
                    "SELECT id, conversation_id, agent_name, agent_type, model, cwd, status,
                            started_at, ended_at, parent_session_id
                     FROM sessions WHERE id = ?1",
                    params![id],
                    |row| Ok(row_to_session(row)),
                )
                .unwrap_or(existing)
            } else {
                conn.execute(
                    "INSERT INTO sessions (id, conversation_id, agent_name, agent_type, model, cwd, status, started_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)",
                    params![id, conversation_id, agent_name, agent_type, model, cwd, now],
                )
                .expect("insert session");

                Session {
                    id: id.to_string(),
                    conversation_id: conversation_id.map(String::from),
                    agent_name: agent_name.map(String::from),
                    agent_type: agent_type.map(String::from),
                    model: model.map(String::from),
                    cwd: cwd.map(String::from),
                    status: "active".into(),
                    started_at: now,
                    ended_at: None,
                    parent_session_id: None,
                }
            }
        })
    }

    pub fn get_sessions_by_conversation(&self, conversation_id: &str) -> Vec<Session> {
        self.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, conversation_id, agent_name, agent_type, model, cwd, status,
                            started_at, ended_at, parent_session_id
                     FROM sessions WHERE conversation_id = ?1",
                )
                .expect("prepare");
            stmt.query_map(params![conversation_id], |row| Ok(row_to_session(row)))
                .expect("query")
                .filter_map(|r| r.ok())
                .collect()
        })
    }
}

// ─── Cursor helpers ────────────────────────────────────────────────
//
// The feed orders by (COALESCE(event_time, created_at), id). A cursor encodes
// both parts joined by U+0001 so pagination is stable under event-time order.

const CURSOR_SEP: char = '\u{1}';

fn message_cursor(m: &Message) -> String {
    let sort_key = m.event_time.as_deref().unwrap_or(&m.created_at);
    format!("{sort_key}{CURSOR_SEP}{}", m.id)
}

/// Resolve a cursor to (sort_key, id). A new composite cursor splits directly.
/// A legacy id-only cursor (from before event-time ordering — e.g. a WebSocket
/// `lastSeenId`) is resolved against the DB so the sort_key is the row's real
/// COALESCE(event_time, created_at). Without this, the bare ULID would be
/// compared as a sort key against ISO timestamps and exceed every row, so
/// pagination/catch-up would replay the entire conversation.
fn resolve_cursor(conn: &Connection, conversation_id: &str, cursor: &str) -> (String, String) {
    if let Some((sk, id)) = cursor.split_once(CURSOR_SEP) {
        return (sk.to_string(), id.to_string());
    }
    let sort_key: Option<String> = conn
        .query_row(
            "SELECT COALESCE(event_time, created_at) FROM messages
             WHERE id = ?1 AND conversation_id = ?2",
            params![cursor, conversation_id],
            |r| r.get(0),
        )
        .ok();
    match sort_key {
        Some(sk) => (sk, cursor.to_string()),
        // Unknown id (e.g. a message cleared on upgrade): fall back to id-as-both
        // — rare, and no worse than the pre-resolution behavior.
        None => (cursor.to_string(), cursor.to_string()),
    }
}

// ─── Row mappers ───────────────────────────────────────────────────

fn row_to_conversation(row: &rusqlite::Row) -> Conversation {
    Conversation {
        id: row.get(0).unwrap(),
        name: row.get(1).unwrap(),
        workspace_path: row.get(2).unwrap(),
        workspace_name: row.get(3).unwrap(),
        conv_type: row.get(4).unwrap(),
        status: row.get(5).unwrap(),
        created_at: row.get(6).unwrap(),
        updated_at: row.get(7).unwrap(),
        archived_at: row.get(8).unwrap(),
    }
}

fn row_to_summary(row: &rusqlite::Row) -> ConversationSummary {
    ConversationSummary {
        conversation_id: row.get(0).unwrap(),
        total_messages: row.get(1).unwrap(),
        last_message_at: row.get(2).unwrap(),
        last_message_preview: row.get(3).unwrap(),
        last_message_sender: row.get(4).unwrap(),
        active_session_count: row.get(5).unwrap(),
        total_session_count: row.get(6).unwrap(),
        started_at: row.get(7).unwrap(),
        status: row.get(8).unwrap(),
    }
}

fn row_to_message(row: &rusqlite::Row) -> Message {
    let metadata_str: String = row.get(8).unwrap();
    Message {
        id: row.get(0).unwrap(),
        conversation_id: row.get(1).unwrap(),
        parent_message_id: row.get(2).unwrap(),
        sender_id: row.get(3).unwrap(),
        sender_name: row.get(4).unwrap(),
        sender_type: row.get(5).unwrap(),
        content: row.get(6).unwrap(),
        message_type: row.get(7).unwrap(),
        metadata: serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Object(Default::default())),
        created_at: row.get(9).unwrap(),
        event_time: row.get(10).unwrap(),
    }
}

fn row_to_session(row: &rusqlite::Row) -> Session {
    Session {
        id: row.get(0).unwrap(),
        conversation_id: row.get(1).unwrap(),
        agent_name: row.get(2).unwrap(),
        agent_type: row.get(3).unwrap(),
        model: row.get(4).unwrap(),
        cwd: row.get(5).unwrap(),
        status: row.get(6).unwrap(),
        started_at: row.get(7).unwrap(),
        ended_at: row.get(8).unwrap(),
        parent_session_id: row.get(9).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_type_serializes_as_type() {
        let conv = Conversation {
            id: "test".into(),
            name: "test".into(),
            workspace_path: None,
            workspace_name: None,
            conv_type: "team".into(),
            status: "active".into(),
            created_at: "2024-01-01".into(),
            updated_at: "2024-01-01".into(),
            archived_at: None,
        };
        let json = serde_json::to_string(&conv).unwrap();
        assert!(json.contains("\"type\":\"team\""), "Expected 'type' field, got: {json}");
        assert!(!json.contains("convType"), "Should not have 'convType', got: {json}");
    }

    fn mem_db() -> Database {
        Database::open_in_memory().unwrap()
    }

    fn ingest(db: &Database, conv: &str, content: &str, event_time: &str, key: &str) -> Option<Message> {
        db.insert_message_full(
            conv, "s@c", "sender", "agent", content, "text", None,
            &serde_json::json!({}), Some(event_time), Some(key),
        )
    }

    #[test]
    fn source_key_makes_ingestion_idempotent() {
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        let first = ingest(&db, &conv.id, "hello", "2026-06-28T13:00:00.000Z", "k1");
        let dup = ingest(&db, &conv.id, "hello", "2026-06-28T13:00:00.000Z", "k1");
        assert!(first.is_some(), "first insert should land");
        assert!(dup.is_none(), "duplicate source_key must be ignored");
        assert_eq!(db.list_messages(&conv.id, 50, None).messages.len(), 1);
    }

    #[test]
    fn feed_orders_by_event_time_not_insertion() {
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        // Insert out of chronological order; feed must come back sorted by event_time.
        ingest(&db, &conv.id, "third", "2026-06-28T13:00:03.000Z", "k3");
        ingest(&db, &conv.id, "first", "2026-06-28T13:00:01.000Z", "k1");
        ingest(&db, &conv.id, "second", "2026-06-28T13:00:02.000Z", "k2");
        let msgs = db.list_messages(&conv.id, 50, None).messages;
        let order: Vec<&str> = msgs.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(order, vec!["first", "second", "third"]);
    }

    #[test]
    fn event_time_cursor_paginates_without_dropping_rows() {
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        for i in 0..5 {
            ingest(
                &db,
                &conv.id,
                &format!("m{i}"),
                &format!("2026-06-28T13:00:0{i}.000Z"),
                &format!("k{i}"),
            );
        }
        let page1 = db.list_messages(&conv.id, 2, None);
        assert_eq!(page1.messages.len(), 2);
        assert!(page1.pagination.has_more);
        let cursor = page1.pagination.next_cursor.clone();
        let page2 = db.list_messages(&conv.id, 2, cursor.as_deref());
        let seen: Vec<&str> = page1
            .messages
            .iter()
            .chain(page2.messages.iter())
            .map(|m| m.content.as_str())
            .collect();
        assert_eq!(seen, vec!["m0", "m1", "m2", "m3"]);
    }

    #[test]
    fn same_event_time_rows_keep_insertion_order() {
        // Two wrappers from one transcript line share an event_time; the feed
        // breaks ties by id, so ids must increase in insertion order.
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        let ts = "2026-06-28T13:00:00.000Z";
        let a = ingest(&db, &conv.id, "first", ts, "ka").unwrap();
        let b = ingest(&db, &conv.id, "second", ts, "kb").unwrap();
        assert!(a.id < b.id, "monotonic ids preserve insertion order within a ms");
        let got: Vec<String> = db.get_messages(&conv.id, 50, None, None)
            .iter().map(|m| m.content.clone()).collect();
        assert_eq!(got, vec!["first".to_string(), "second".to_string()]);
    }

    #[test]
    fn legacy_id_only_cursor_pages_after_the_row_not_replay_all() {
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        let m0 = ingest(&db, &conv.id, "m0", "2026-06-28T13:00:00.000Z", "k0").unwrap();
        ingest(&db, &conv.id, "m1", "2026-06-28T13:00:01.000Z", "k1");
        ingest(&db, &conv.id, "m2", "2026-06-28T13:00:02.000Z", "k2");
        // A bare-id cursor (a WS lastSeenId) must resolve to m0's event_time and
        // return only later rows — not the whole conversation. A ULID compared
        // as an ISO sort key would exceed every row and replay all three.
        let after = db.get_messages(&conv.id, 100, Some(&m0.id), None);
        let got: Vec<&str> = after.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(got, vec!["m1", "m2"], "id-only cursor must page after, not replay");
    }

    #[test]
    fn resync_session_counts_reflects_real_roster() {
        let db = mem_db();
        let conv = db.create_conversation("t", None, None, "team");
        for i in 0..6 {
            db.upsert_session(&format!("a{i}@c"), Some(&conv.id), Some("n"), None, None, None);
        }
        db.resync_session_counts(&conv.id);
        let summary = db.get_summary(&conv.id);
        assert_eq!(summary.total_session_count, 6, "every member counted, not just 1");
        assert_eq!(summary.active_session_count, 6);
    }
}
