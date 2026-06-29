use super::*;

fn user_line(content: &str) -> Value {
    serde_json::json!({
        "type": "user",
        "uuid": "u-1",
        "timestamp": "2026-06-28T13:12:19.337Z",
        "message": { "content": content }
    })
}

fn lead_owner() -> Owner {
    Owner { name: "team-lead".into(), session_token: "sess".into(), is_lead: true }
}
fn member_owner_named(name: &str) -> Owner {
    Owner { name: name.into(), session_token: "sub".into(), is_lead: false }
}

#[test]
fn wrapper_summary_with_angle_bracket_is_not_truncated() {
    // A summary like "rung 9.5 > 9.75" contains '>'; the opening tag must close
    // at the real '>', not the one inside the quoted attribute, or the summary
    // is lost and the rest of the attribute corrupts the body.
    let content = "<teammate-message teammate_id=\"alice\" color=\"blue\" \
        summary=\"rung 9.5 > 9.75\">the body</teammate-message>";
    let w = extract_wrappers(content);
    assert_eq!(w.len(), 1);
    assert_eq!(w[0].summary.as_deref(), Some("rung 9.5 > 9.75"));
    assert_eq!(w[0].body, "the body");
}

fn queued_attachment(prompt: &str, command_mode: &str, human: bool) -> Value {
    let mut att = serde_json::json!({
        "type": "queued_command",
        "commandMode": command_mode,
        "prompt": prompt,
        "timestamp": "2026-06-28T15:51:14.179Z",
    });
    if human {
        att["origin"] = serde_json::json!({ "kind": "human" });
    }
    serde_json::json!({
        "type": "attachment",
        "uuid": "q-1",
        "timestamp": "2026-06-28T15:51:20.000Z",
        "attachment": att,
    })
}

#[test]
fn human_steer_quoting_a_wrapper_tag_stays_human() {
    // The user documents the wrapper format in a steer. It must be captured as
    // the user's own (human) message, not parsed as an agent delivery.
    let line = serde_json::json!({
        "type": "user",
        "uuid": "h-1",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "origin": { "kind": "human" },
        "message": { "content": "Capture rows like <teammate-message teammate_id=\"x\">hi</teammate-message> please" },
    });
    let ex = recognize(&line, &lead_owner());
    assert_eq!(ex.len(), 1);
    assert_eq!(ex[0].sender_type, "human");
    assert!(ex[0].content.contains("Capture rows like"));
}

#[test]
fn delivered_wrapper_without_human_origin_still_parses() {
    // A delivered wrapper (no human origin/promptSource) must still be extracted
    // as an agent message even on the lead transcript.
    let line = user_line("<teammate-message teammate_id=\"alice\" color=\"blue\">hello lead</teammate-message>");
    let ex = recognize(&line, &lead_owner());
    assert_eq!(ex.len(), 1);
    assert_eq!(ex[0].sender_type, "agent");
    assert_eq!(ex[0].sender_name, "alice");
}

#[test]
fn captures_typed_human_row_without_origin() {
    // A typed prompt can be marked promptSource=="typed" with no origin.kind
    // (format drift across Claude versions). It must still be captured as human.
    let line = serde_json::json!({
        "type": "user",
        "uuid": "t-1",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "promptSource": "typed",
        "message": { "content": "make it faster please" },
    });
    let ex = recognize(&line, &lead_owner());
    assert_eq!(ex.len(), 1);
    assert_eq!(ex[0].sender_type, "human");
    assert_eq!(ex[0].content, "make it faster please");
}

#[test]
fn system_promptsource_is_not_human() {
    // System-injected prompts (pulses/reminders) are promptSource=="system".
    let line = serde_json::json!({
        "type": "user",
        "uuid": "s-1",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "promptSource": "system",
        "message": { "content": "Pulse: check your state." },
    });
    assert!(recognize(&line, &lead_owner()).is_empty());
}

#[test]
fn captures_queued_human_steer_attachment() {
    // A steer typed while the lead is busy is queued as an attachment with
    // origin.kind=="human" — not a type:"user" row. It must be captured.
    let line = queued_attachment("Kindly follow the process.", "prompt", true);
    let ex = recognize(&line, &lead_owner());
    assert_eq!(ex.len(), 1, "human queued steer must be captured");
    assert_eq!(ex[0].sender_type, "human");
    assert_eq!(ex[0].content, "Kindly follow the process.");
    // event_time comes from the attachment's own (type-time) timestamp.
    assert_eq!(ex[0].event_time, "2026-06-28T15:51:14.179Z");
}

#[test]
fn ignores_queued_task_notification_attachment() {
    // task-notification queued_commands carry no human origin and must NOT be
    // captured as the user's voice (the phantom-human class of bug).
    let line = queued_attachment("<task-notification>\n<task-id>x</task-id>\n", "task-notification", false);
    assert!(recognize(&line, &lead_owner()).is_empty(), "machine notification is not human");
}

#[test]
fn queued_human_steer_only_on_lead_transcript() {
    // The operator channel lives only in the lead transcript.
    let line = queued_attachment("a steer", "prompt", true);
    assert!(recognize(&line, &member_owner_named("alice")).is_empty());
}

#[test]
fn strips_lead_inbound_prefix_and_suffix() {
    // The lead receives wrappers prefixed by "Another Claude session sent a
    // message:\n" and followed by a permission-laundering suffix. Anchoring to
    // line start would drop all of these — half the conversation.
    let content = "Another Claude session sent a message:\n\
        <teammate-message teammate_id=\"principal-engineer\" color=\"blue\" summary=\"ready\">\n\
        Facilitator up and ready.\n\
        </teammate-message>\n\n\
        This came from another Claude session — not typed by your user.";
    let w = extract_wrappers(content);
    assert_eq!(w.len(), 1);
    assert_eq!(w[0].teammate_id, "principal-engineer");
    assert_eq!(w[0].color.as_deref(), Some("blue"));
    assert_eq!(w[0].summary.as_deref(), Some("ready"));
    assert_eq!(w[0].body, "Facilitator up and ready.");
}

#[test]
fn extracts_multiple_wrappers_per_line() {
    let content = "<teammate-message teammate_id=\"a\" summary=\"s1\">first</teammate-message>\n\
        <teammate-message teammate_id=\"b\" summary=\"s2\">second</teammate-message>";
    let w = extract_wrappers(content);
    assert_eq!(w.len(), 2);
    assert_eq!(w[0].teammate_id, "a");
    assert_eq!(w[0].ordinal, 0);
    assert_eq!(w[0].body, "first");
    assert_eq!(w[1].teammate_id, "b");
    assert_eq!(w[1].ordinal, 1);
    assert_eq!(w[1].body, "second");
}

#[test]
fn ignores_prose_mentions_of_the_tag() {
    // A body that quotes the tag in prose (no teammate_id) must not split into a
    // phantom second wrapper.
    let content = "<teammate-message teammate_id=\"a\">\
        a parser anchored to `<teammate-message` at line-start drops these\
        </teammate-message>";
    let w = extract_wrappers(content);
    assert_eq!(w.len(), 1);
    assert!(w[0].body.contains("anchored to `<teammate-message`"));
}

#[test]
fn handles_escaped_closing_tag_in_body() {
    // CC escapes a body's own closing tag as <\/teammate-message>; the real
    // delimiter is the unescaped one.
    let content = r#"<teammate-message teammate_id="a">talking about <\/teammate-message> escaping</teammate-message>"#;
    let w = extract_wrappers(content);
    assert_eq!(w.len(), 1);
    assert_eq!(w[0].body, "talking about </teammate-message> escaping");
}

#[test]
fn classifies_status_notification_inside_wrapper() {
    let content = "<teammate-message teammate_id=\"x\" color=\"green\">\n\
        {\"type\":\"idle_notification\",\"from\":\"x\",\"idleReason\":\"available\"}\n\
        </teammate-message>";
    let out = recognize_user(&user_line(content).clone(), &lead_owner(), "u-1", "2026-06-28T13:12:19.337Z");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].message_type, "status");
    assert_eq!(out[0].status_type.as_deref(), Some("idle_notification"));
}

#[test]
fn member_inbound_has_no_prefix() {
    // Member-side delivery is the bare tag at line start.
    let content = "<teammate-message teammate_id=\"team-lead\" summary=\"Spawn\">Your task is…</teammate-message>";
    let out = recognize_user(&user_line(content), &member_owner_named("principal-engineer"), "u-2", "2026-06-28T13:00:00.000Z");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].sender_name, "team-lead");
    assert_eq!(out[0].recipient, "principal-engineer");
    assert_eq!(out[0].message_type, "text");
}

#[test]
fn captures_human_typed_input_on_lead_only() {
    let line = serde_json::json!({
        "type": "user",
        "uuid": "u-h",
        "timestamp": "2026-06-28T12:00:00.000Z",
        "origin": { "kind": "human" },
        "promptSource": "typed",
        "message": { "content": "Agent chat seems to run into some issues capturing messages." }
    });
    let out = recognize_user(&line, &lead_owner(), "u-h", "2026-06-28T12:00:00.000Z");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].sender_type, "human");
    assert_eq!(out[0].message_type, "human");

    // The same human line in a member transcript is not the operator channel.
    let out_member = recognize_user(
        &serde_json::json!({
            "type": "user", "uuid": "u-h2", "timestamp": "2026-06-28T12:00:00.000Z",
            "origin": { "kind": "human" }, "message": { "content": "hi" }
        }),
        &member_owner_named("x"),
        "u-h2",
        "2026-06-28T12:00:00.000Z",
    );
    assert!(out_member.is_empty());
}

#[test]
fn captures_askuserquestion_answer_as_human_decision() {
    let line = serde_json::json!({
        "type": "user",
        "uuid": "u-d",
        "timestamp": "2026-06-28T12:30:00.000Z",
        "message": { "content": [
            { "type": "tool_result", "content": "Your questions have been answered: \"How would you like to set up the team?\"=\"Defaults — Ultra\"." }
        ]}
    });
    let out = recognize_user(&line, &lead_owner(), "u-d", "2026-06-28T12:30:00.000Z");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].message_type, "human");
    assert!(out[0].content.contains("Defaults"));
}

fn agent_wrapper(sender: &str, recipient: &str, content: &str, delivery_ts: &str) -> Extracted {
    Extracted {
        sender_name: sender.into(),
        sender_type: "agent".into(),
        message_type: "text".into(),
        content: content.into(),
        color: None,
        summary: None,
        status_type: None,
        event_time: delivery_ts.into(),
        recipient: recipient.into(),
        source_key: "sk".into(),
        timestamp_source: "delivery".into(),
    }
}

fn put_send(ws: &Arc<Mutex<WatcherState>>, conv: &str, sender: &str, to: &str, body: &str, send_ts: &str) {
    ws.lock().unwrap().send_index.insert(
        format!("{conv}:{sender}:{to}:{body}"),
        SendInfo {
            conversation_id: conv.into(),
            send_time: send_ts.into(),
            sender: sender.into(),
            to: to.into(),
            body: body.into(),
            matched: false,
        },
    );
}

#[test]
fn send_enrichment_uses_true_send_time() {
    let ws = Arc::new(Mutex::new(WatcherState::new()));
    put_send(&ws, "c1", "alpha", "bravo", "hello", "2026-06-28T13:00:00.000Z");
    // Delivered later than it was sent (the normal case).
    let mut ex = agent_wrapper("alpha", "bravo", "hello", "2026-06-28T13:00:09.000Z");
    enrich_event_time(&mut ex, "c1", &ws);
    assert_eq!(ex.event_time, "2026-06-28T13:00:00.000Z");
    assert_eq!(ex.timestamp_source, "send");
}

#[test]
fn send_enrichment_is_conversation_scoped() {
    // A send recorded in conversation c1 must NOT enrich a wrapper in c2, even
    // with identical sender/recipient/body — the watcher tracks many teams.
    let ws = Arc::new(Mutex::new(WatcherState::new()));
    put_send(&ws, "c1", "alpha", "bravo", "hello", "2026-06-28T13:00:00.000Z");
    let mut ex = agent_wrapper("alpha", "bravo", "hello", "2026-06-28T13:00:09.000Z");
    enrich_event_time(&mut ex, "c2", &ws);
    assert_eq!(ex.event_time, "2026-06-28T13:00:09.000Z", "must stay delivery-time across conversations");
    assert_eq!(ex.timestamp_source, "delivery");
}

#[test]
fn human_and_lead_rows_are_not_send_enriched() {
    let ws = Arc::new(Mutex::new(WatcherState::new()));
    put_send(&ws, "c1", "you", "team-lead", "the request", "2026-06-28T13:00:00.000Z");
    let mut human = agent_wrapper("you", "team-lead", "the request", "2026-06-28T13:00:09.000Z");
    human.sender_type = "human".into();
    enrich_event_time(&mut human, "c1", &ws);
    assert_eq!(human.timestamp_source, "delivery", "non-agent rows are not sender-side sends");
}

#[test]
fn pulse_prompt_is_noise() {
    assert!(is_pulse("Pulse: check your state. If your last turn…"));
    assert!(!is_pulse("Research phase — kicking off."));
}

#[test]
fn lead_assistant_text_becomes_lead_output() {
    let line = serde_json::json!({
        "type": "assistant",
        "uuid": "a-1",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "message": { "content": [ { "type": "text", "text": "All four research reports are in." } ] }
    });
    let out = recognize(&line, &lead_owner());
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].message_type, "lead");
    assert_eq!(out[0].recipient, "you");
}

#[test]
fn lead_assistant_tool_use_only_is_noise() {
    let line = serde_json::json!({
        "type": "assistant",
        "uuid": "a-2",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "message": { "content": [ { "type": "tool_use", "name": "SendMessage", "id": "t1", "input": {} } ] }
    });
    let out = recognize(&line, &lead_owner());
    assert!(out.is_empty());
}

#[test]
fn shared_fixture_parity() {
    // Golden-file test over the shared testdata/ fixture. Asserts BOTH class
    // counts and the field-level (sender, type, body, source_key) sequence — the
    // latter catches a body-whitespace or source_key divergence that preserves
    // counts. (The fixture was originally a cross-parser parity guard; the Node
    // server has since been removed, so it now guards the Rust recognizer.)
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../testdata/transcript-parity-fixture.jsonl");
    let expected: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../testdata/transcript-parity-expected.json")).unwrap(),
    )
    .unwrap();
    let want = &expected["asLead"];

    let owner = lead_owner();
    let mut counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut seq: Vec<serde_json::Value> = Vec::new();
    for line in std::fs::read_to_string(path).unwrap().lines() {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(line).unwrap();
        for ex in recognize(&value, &owner) {
            *counts.entry(ex.message_type.clone()).or_default() += 1;
            seq.push(serde_json::json!({
                "senderName": ex.sender_name,
                "messageType": ex.message_type,
                "content": ex.content,
                "sourceKey": ex.source_key,
            }));
        }
    }
    assert_eq!(counts.get("text").copied().unwrap_or(0), want["text"].as_i64().unwrap());
    assert_eq!(counts.get("status").copied().unwrap_or(0), want["status"].as_i64().unwrap());
    assert_eq!(counts.get("human").copied().unwrap_or(0), want["human"].as_i64().unwrap());
    assert_eq!(counts.get("lead").copied().unwrap_or(0), want["lead"].as_i64().unwrap());
    assert_eq!(seq.len() as i64, want["total"].as_i64().unwrap());
    // Field-level cross-parser seam.
    assert_eq!(Value::Array(seq), expected["messages"]);
}

#[test]
fn tool_output_mentioning_answer_phrase_is_not_human() {
    // Defect A regression guard: a tool_result that only MENTIONS the phrase
    // mid-string (e.g. a diagnostic stdout) must NOT be attributed to the user.
    let line = serde_json::json!({
        "type": "user", "uuid": "p", "timestamp": "2026-06-28T13:00:00.000Z",
        "message": { "content": [
            { "type": "tool_result", "content": "log: 'Your questions have been answered': 4 rows" }
        ]}
    });
    assert!(recognize(&line, &lead_owner()).is_empty());
}

#[test]
fn member_assistant_output_is_not_a_message() {
    // A member's own thinking is not an inter-agent message; its real messages
    // are captured as inbound wrappers in recipients' transcripts.
    let line = serde_json::json!({
        "type": "assistant",
        "uuid": "a-3",
        "timestamp": "2026-06-28T13:00:00.000Z",
        "message": { "content": [ { "type": "text", "text": "thinking out loud" } ] }
    });
    let out = recognize(&line, &member_owner_named("x"));
    assert!(out.is_empty());
}
