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

    /// Insert a message and emit a MessageCreated event.
    pub fn send_message(
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
        let msg = self.db.insert_message(
            conversation_id,
            sender_id,
            sender_name,
            sender_type,
            content,
            message_type,
            parent_message_id,
            metadata,
        );
        let _ = self.events.send(AppEvent::MessageCreated(msg.clone()));
        msg
    }
}
