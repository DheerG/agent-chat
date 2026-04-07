use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch},
    Router,
};
use serde::Deserialize;

use crate::services::AppState;

#[derive(Deserialize)]
pub struct ListQuery {
    tab: Option<String>,
    limit: Option<u32>,
}

#[derive(Deserialize)]
pub struct FeedQuery {
    limit: Option<u32>,
    after: Option<String>,
}

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .route("/api/conversations", get(list_conversations))
        .route("/api/conversations/{id}", get(get_conversation))
        .route("/api/conversations/{id}/feed", get(get_feed))
        .route("/api/conversations/{id}/archive", patch(archive_conversation))
        .route("/api/conversations/{id}/restore", patch(restore_conversation))
        .route("/health", get(health))
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn list_conversations(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let tab = query.tab.as_deref().unwrap_or("active");
    let limit = query.limit.unwrap_or(50).min(100);
    let items = state.db.list_with_summaries(tab, limit);
    Json(serde_json::json!({ "conversations": items }))
}

async fn get_conversation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_conversation(&id) {
        Some(conversation) => {
            let summary = state.db.get_summary(&id);
            let sessions = state.db.get_sessions_by_conversation(&id);
            Json(serde_json::json!({ "conversation": conversation, "summary": summary, "sessions": sessions }))
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Not found" }))).into_response(),
    }
}

async fn get_feed(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<FeedQuery>,
) -> impl IntoResponse {
    match state.db.get_conversation(&id) {
        Some(_) => {
            let limit = query.limit.unwrap_or(50).min(100);
            let result = state.db.list_messages(&id, limit, query.after.as_deref());
            let items: Vec<serde_json::Value> = result
                .messages
                .into_iter()
                .map(|msg| {
                    let mut v = serde_json::to_value(&msg).unwrap();
                    v.as_object_mut().unwrap().insert("type".into(), "message".into());
                    v
                })
                .collect();
            Json(serde_json::json!({ "items": items, "pagination": result.pagination })).into_response()
        }
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Not found" }))).into_response(),
    }
}

async fn archive_conversation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    state.db.archive_conversation(&id);
    Json(serde_json::json!({ "success": true }))
}

async fn restore_conversation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    state.db.restore_conversation(&id);
    Json(serde_json::json!({ "success": true }))
}
