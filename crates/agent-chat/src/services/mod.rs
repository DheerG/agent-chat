use crate::db::queries::Message;
use crate::db::Database;
use tokio::sync::broadcast;

/// Event emitted when a new message is created.
#[derive(Debug, Clone)]
pub enum AppEvent {
    MessageCreated(Message),
}

/// Shared application state holding the database and event bus.
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub events: broadcast::Sender<AppEvent>,
}

impl AppState {
    pub fn new(db: Database) -> Self {
        let (events, _) = broadcast::channel(256);
        Self { db, events }
    }

    /// Idempotent insert keyed on `source_key`, with the transcript's real
    /// `event_time`. Returns the new message (and emits a MessageCreated event)
    /// only on a genuine insert; a duplicate source_key returns `None` and emits
    /// nothing — so re-reading a transcript never double-posts to the feed.
    #[allow(clippy::too_many_arguments)]
    pub fn ingest_message(
        &self,
        conversation_id: &str,
        sender_id: &str,
        sender_name: &str,
        sender_type: &str,
        content: &str,
        message_type: &str,
        metadata: &serde_json::Value,
        event_time: Option<&str>,
        source_key: &str,
    ) -> Option<Message> {
        let msg = self.db.insert_message_full(
            conversation_id,
            sender_id,
            sender_name,
            sender_type,
            content,
            message_type,
            None,
            metadata,
            event_time,
            Some(source_key),
        )?;
        let _ = self.events.send(AppEvent::MessageCreated(msg.clone()));
        Some(msg)
    }
}
