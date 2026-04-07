use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message as WsMessage, WebSocket},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};

use crate::services::{AppEvent, AppState};

struct ClientState {
    subscribed_conversations: HashSet<String>,
    subscribed_all: bool,
    tx: tokio::sync::mpsc::UnboundedSender<String>,
}

pub struct WebSocketHub {
    clients: Arc<Mutex<HashMap<usize, ClientState>>>,
    next_id: Arc<Mutex<usize>>,
}

impl WebSocketHub {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(0)),
        }
    }

    /// Start listening for app events and broadcasting to clients.
    pub fn start_broadcasting(&self, mut events: broadcast::Receiver<AppEvent>, db: crate::db::Database) {
        let clients = self.clients.clone();
        tokio::spawn(async move {
            while let Ok(event) = events.recv().await {
                match event {
                    AppEvent::MessageCreated(msg) => {
                        let conversation_id = msg.conversation_id.clone();

                        // Broadcast message to conversation subscribers
                        let msg_payload = serde_json::json!({
                            "type": "message",
                            "conversationId": conversation_id,
                            "message": msg,
                        });
                        let msg_str = serde_json::to_string(&msg_payload).unwrap();

                        // Broadcast summary update to all clients
                        let summary = db.get_summary(&conversation_id);
                        let summary_payload = serde_json::json!({
                            "type": "summary_update",
                            "conversationId": conversation_id,
                            "summary": summary,
                        });
                        let summary_str = serde_json::to_string(&summary_payload).unwrap();

                        let clients_lock = clients.lock().await;
                        let mut sent_msg_to: HashSet<usize> = HashSet::new();

                        // Send message to conversation-specific subscribers
                        for (&id, client) in clients_lock.iter() {
                            if client.subscribed_conversations.contains(&conversation_id) {
                                let _ = client.tx.send(msg_str.clone());
                                sent_msg_to.insert(id);
                            }
                        }

                        // Send message to subscribe_all clients (avoid double-send)
                        for (&id, client) in clients_lock.iter() {
                            if client.subscribed_all && !sent_msg_to.contains(&id) {
                                let _ = client.tx.send(msg_str.clone());
                            }
                        }

                        // Send summary to all clients
                        for client in clients_lock.values() {
                            let _ = client.tx.send(summary_str.clone());
                        }
                    }
                }
            }
        });
    }

    pub async fn handle_upgrade(
        &self,
        ws: WebSocket,
        state: AppState,
    ) {
        let client_id = {
            let mut id = self.next_id.lock().await;
            *id += 1;
            *id
        };

        let (mut ws_tx, mut ws_rx) = ws.split();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

        // Register client
        {
            let mut clients = self.clients.lock().await;
            clients.insert(client_id, ClientState {
                subscribed_conversations: HashSet::new(),
                subscribed_all: false,
                tx,
            });
        }

        // Task: forward outbound messages to the WebSocket
        let send_task = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_tx.send(WsMessage::Text(msg.into())).await.is_err() {
                    break;
                }
            }
        });

        // Task: handle inbound messages from the WebSocket
        let clients_for_recv = self.clients.clone();
        let recv_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                if let WsMessage::Text(text) = msg {
                    let text = text.to_string();
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        let mut clients = clients_for_recv.lock().await;

                        match msg_type {
                            "subscribe" => {
                                if let Some(ids) = parsed.get("conversationIds").and_then(|v| v.as_array()) {
                                    if let Some(client) = clients.get_mut(&client_id) {
                                        for id in ids.iter().filter_map(|v| v.as_str()) {
                                            client.subscribed_conversations.insert(id.to_string());
                                        }
                                        let _ = client.tx.send(
                                            serde_json::json!({"type": "subscribed", "conversationIds": ids}).to_string()
                                        );

                                        // Catchup support
                                        if let Some(last_seen) = parsed.get("lastSeenId").and_then(|v| v.as_str()) {
                                            if ids.len() == 1 {
                                                if let Some(conv_id) = ids[0].as_str() {
                                                    let messages = state.db.get_messages(conv_id, 100, Some(last_seen), None);
                                                    for m in messages {
                                                        let payload = serde_json::json!({
                                                            "type": "message",
                                                            "conversationId": conv_id,
                                                            "message": m,
                                                        });
                                                        let _ = client.tx.send(serde_json::to_string(&payload).unwrap());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            "subscribe_all" => {
                                if let Some(client) = clients.get_mut(&client_id) {
                                    client.subscribed_all = true;
                                    let _ = client.tx.send(
                                        serde_json::json!({"type": "subscribed_all"}).to_string()
                                    );
                                }
                            }
                            "unsubscribe" => {
                                if let Some(ids) = parsed.get("conversationIds").and_then(|v| v.as_array()) {
                                    if let Some(client) = clients.get_mut(&client_id) {
                                        for id in ids.iter().filter_map(|v| v.as_str()) {
                                            client.subscribed_conversations.remove(id);
                                        }
                                    }
                                }
                            }
                            "ping" => {
                                if let Some(client) = clients.get(&client_id) {
                                    let _ = client.tx.send(
                                        serde_json::json!({"type": "pong"}).to_string()
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        // Wait for either task to complete (client disconnect)
        tokio::select! {
            _ = send_task => {},
            _ = recv_task => {},
        }

        // Cleanup
        let mut clients = self.clients.lock().await;
        clients.remove(&client_id);
    }
}

/// Axum handler for WebSocket upgrade at /ws
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    axum::Extension(hub): axum::Extension<Arc<WebSocketHub>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        hub.handle_upgrade(socket, state).await;
    })
}
