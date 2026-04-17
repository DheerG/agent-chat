use super::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

    pub fn find_conversation_by_name(&self, name: &str) -> Option<Conversation> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, workspace_path, workspace_name, type, status, created_at, updated_at, archived_at
                 FROM conversations WHERE name = ?1 AND archived_at IS NULL",
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
            conn.execute(
                "UPDATE conversation_summaries
                 SET total_messages = total_messages + 1,
                     last_message_at = MAX(COALESCE(last_message_at, ''), ?1),
                     last_message_preview = ?2, last_message_sender = ?3,
                     updated_at = MAX(COALESCE(updated_at, ''), ?1)
                 WHERE conversation_id = ?4",
                params![ts, truncated, sender, conversation_id],
            )
            .expect("increment messages");
        });
    }

    pub fn increment_session_count(&self, conversation_id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE conversation_summaries
                 SET active_session_count = active_session_count + 1,
                     total_session_count = total_session_count + 1, updated_at = ?1
                 WHERE conversation_id = ?2",
                params![now, conversation_id],
            )
            .expect("increment sessions");
        });
    }

    // ─── Message Queries ───────────────────────────────────────────────

    pub fn insert_message(
        &self,
        conversation_id: &str,
        sender_id: &str,
        sender_name: &str,
        sender_type: &str,
        content: &str,
        message_type: &str,
        parent_message_id: Option<&str>,
        metadata: &serde_json::Value,
    ) -> Message {
        let id = ulid::Ulid::new().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        let metadata_str = serde_json::to_string(metadata).unwrap_or_else(|_| "{}".into());

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO messages (id, conversation_id, parent_message_id, sender_id, sender_name,
                                       sender_type, content, message_type, metadata, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                    created_at
                ],
            )
            .expect("insert message");
        });

        Message {
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
        }
    }

    pub fn get_messages(
        &self,
        conversation_id: &str,
        limit: u32,
        after: Option<&str>,
        before: Option<&str>,
    ) -> Vec<Message> {
        self.with_conn(|conn| {
            let mut sql = String::from(
                "SELECT id, conversation_id, parent_message_id, sender_id, sender_name,
                        sender_type, content, message_type, metadata, created_at
                 FROM messages WHERE conversation_id = ?1",
            );
            let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
                vec![Box::new(conversation_id.to_string())];

            if let Some(after_id) = after {
                sql.push_str(&format!(" AND id > ?{}", param_values.len() + 1));
                param_values.push(Box::new(after_id.to_string()));
            }
            if let Some(before_id) = before {
                sql.push_str(&format!(" AND id < ?{}", param_values.len() + 1));
                param_values.push(Box::new(before_id.to_string()));
            }
            sql.push_str(&format!(" ORDER BY id ASC LIMIT ?{}", param_values.len() + 1));
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
            messages.last().map(|m| m.id.clone())
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

    /// Append a recipient to an existing message's metadata.recipients array.
    pub fn append_message_recipient(&self, message_id: &str, recipient: &str) {
        self.with_conn(|conn| {
            let metadata_str: String = match conn.query_row(
                "SELECT metadata FROM messages WHERE id = ?1",
                params![message_id],
                |row| row.get(0),
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let mut metadata: serde_json::Value =
                serde_json::from_str(&metadata_str).unwrap_or(serde_json::json!({}));

            let recipients = metadata
                .as_object_mut()
                .unwrap()
                .entry("recipients")
                .or_insert_with(|| serde_json::json!([]));

            if let Some(arr) = recipients.as_array_mut() {
                let recipient_val = serde_json::Value::String(recipient.to_string());
                if !arr.contains(&recipient_val) {
                    arr.push(recipient_val);
                }
            }

            let updated = serde_json::to_string(&metadata).unwrap();
            conn.execute(
                "UPDATE messages SET metadata = ?1 WHERE id = ?2",
                params![updated, message_id],
            )
            .ok();
        });
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
}
