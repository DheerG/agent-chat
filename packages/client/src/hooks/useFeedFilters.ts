import { useState, useCallback, useMemo } from 'react';
import type { FeedItem } from '@agent-chat/shared';

/** Toggleable feed categories. Special types (errors, input requests, system
 *  notices) have no category and are always shown — they are never noise. */
export type FeedCategory = 'discussion' | 'you' | 'lead' | 'status';

/** The categories in display order, with the messageType each maps to and the
 *  count key used to label its toggle. */
export const FEED_CATEGORIES: { key: FeedCategory; label: string; type: string }[] = [
  { key: 'discussion', label: 'discussion', type: 'text' },
  { key: 'you', label: 'you', type: 'human' },
  { key: 'lead', label: 'lead', type: 'lead' },
  { key: 'status', label: 'status', type: 'status' },
];

const TYPE_TO_CATEGORY: Record<string, FeedCategory> = {
  text: 'discussion',
  human: 'you',
  lead: 'lead',
  status: 'status',
};

const STORAGE_KEY = 'agentchat.feedFilter.hidden';

/** Classes hidden on a first run — lead narration and status notices are the
 *  bulk of the noise, so the feed opens on the actual inter-agent discussion. */
const DEFAULT_HIDDEN: FeedCategory[] = ['lead', 'status'];

function loadHidden(): Set<FeedCategory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // A stored value (even "[]" = "show all") is the user's explicit choice and
    // wins; only a first-ever run with no stored preference gets the default.
    if (raw !== null) return new Set(JSON.parse(raw) as FeedCategory[]);
  } catch { /* ignore malformed storage */ }
  return new Set(DEFAULT_HIDDEN);
}

/**
 * Client-side feed filtering. The capture layer already tags every message with
 * a messageType, so hiding a category (e.g. the lead's play-by-play, which is
 * ~70% of a typical feed) is a pure presentational filter — no server round-trip.
 * The choice persists in localStorage so it carries across reloads and
 * conversations.
 */
export function useFeedFilters(items: FeedItem[]) {
  const [hidden, setHidden] = useState<Set<FeedCategory>>(loadHidden);

  const toggle = useCallback((cat: FeedCategory) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const visibleItems = useMemo(() => {
    if (hidden.size === 0) return items;
    return items.filter(it => {
      const cat = TYPE_TO_CATEGORY[(it as { messageType: string }).messageType];
      // Unknown/special types (no category) are always shown.
      return !cat || !hidden.has(cat);
    });
  }, [items, hidden]);

  return { hidden, toggle, visibleItems };
}
