import { useState, useEffect, useCallback, useRef } from 'react';
import type { FeedItem, Message } from '@agent-chat/shared';
import { fetchAllFeed } from '../lib/api';

/** Sort key for a feed item: the real event time, falling back to ingestion
 * time, then id — identical to the server's ORDER BY COALESCE(event_time,
 * created_at), id so the live feed and a reloaded feed agree exactly. */
function sortKey(m: FeedItem): [string, string] {
  return [m.eventTime ?? m.createdAt, m.id];
}

function cmpItems(a: FeedItem, b: FeedItem): number {
  const [ka, ia] = sortKey(a);
  const [kb, ib] = sortKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  if (ia !== ib) return ia < ib ? -1 : 1;
  return 0;
}

/** First index in the sorted list whose item sorts after `target` (where it
 * should be inserted to keep order). Assumes `list` is already sorted. */
function lowerBound(list: FeedItem[], target: FeedItem): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmpItems(list[mid]!, target) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function useFeed(conversationId: string | null) {
  const [items, setItems] = useState<FeedItem[]>([]);
  // Always reflects the currently-selected conversation, so an in-flight resync
  // can tell whether the user switched away before it resolved.
  const convRef = useRef(conversationId);
  convRef.current = conversationId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    // Load the WHOLE captured feed, not just the first 50 — there is no
    // scroll-up pagination, so a 50-row cap would leave most of a backfilled
    // conversation (startup / --rebuild / a team selected after its backfill)
    // captured-but-not-displayable, defeating the "all messages displayable"
    // goal. The feed auto-scrolls to the newest, so history stays above.
    fetchAllFeed(conversationId)
      .then(all => {
        if (!cancelled) {
          setItems(all);
          setError(null);
          if (all.length > 0) {
            setLastSeenId(all[all.length - 1]!.id);
          }
        }
      })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  // Recover from a server "resync" (broadcast events dropped under a backfill
  // load) by re-pulling the WHOLE feed, not just the first page — otherwise we'd
  // discard live messages already shown and still miss the dropped ones.
  const resync = useCallback(() => {
    if (!conversationId) return;
    const startedFor = conversationId;
    fetchAllFeed(conversationId)
      .then(all => {
        // The user may have switched conversations while this was in flight;
        // only apply if the feed is still showing the conversation we fetched.
        if (convRef.current !== startedFor) return;
        setItems(prev => {
          // Merge: a live WebSocket row can arrive during the fetch and sit past
          // the page the snapshot already read, so a blind replace would drop it.
          // Union by id, then re-sort into (eventTime, id) order.
          const byId = new Map(all.map(m => [m.id, m]));
          for (const m of prev) {
            if (m.type === 'message' && !byId.has(m.id)) byId.set(m.id, m);
          }
          return Array.from(byId.values()).sort(cmpItems);
        });
        if (all.length > 0) setLastSeenId(all[all.length - 1]!.id);
      })
      .catch(() => { /* a failed resync leaves the current feed in place */ });
  }, [conversationId]);

  const addMessage = useCallback((msg: Message) => {
    const feedMsg: FeedItem = {
      type: 'message',
      id: msg.id,
      conversationId: msg.conversationId,
      parentMessageId: msg.parentMessageId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderType: msg.senderType,
      content: msg.content,
      messageType: msg.messageType,
      metadata: msg.metadata,
      createdAt: msg.createdAt,
      // Carry the real send/delivery time so the row shows the correct time
      // immediately and sorts to its true position, not ingestion-time order.
      eventTime: msg.eventTime,
    };
    setItems(prev => {
      // Dedup: the WebSocket catch-up can redeliver a message already loaded.
      if (prev.some(m => m.type === 'message' && m.id === feedMsg.id)) return prev;
      // Insert in (COALESCE(eventTime, createdAt), id) order to match the
      // server/API feed exactly — a send-time-enriched delivery can sort before
      // rows already shown, so appending would leave the live feed out of order
      // until reload. In the common in-order case this still lands at the tail.
      const lo = lowerBound(prev, feedMsg);
      const next = prev.slice();
      next.splice(lo, 0, feedMsg);
      return next;
    });
    setLastSeenId(msg.id);
  }, []);

  return { items, loading, error, addMessage, resync, lastSeenId };
}
