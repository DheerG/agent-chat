import { useState, useRef, useEffect } from 'react';
import { Filter, Eye, EyeOff, X } from 'lucide-react';
import { FEED_CATEGORIES, type FeedCategory } from '../hooks/useFeedFilters';

interface Props {
  /** messageCounts keyed by messageType (the totals per class). */
  counts: Record<string, number>;
  hidden: Set<FeedCategory>;
  onToggle: (cat: FeedCategory) => void;
}

/**
 * Message-type filter: a funnel button opens a menu where each class can be
 * shown/hidden (eye / eye-off), and the hidden classes appear as removable
 * chips. At least one class always stays visible. Only classes that actually
 * occur in the conversation are offered.
 */
export function FeedFilter({ counts, hidden, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const present = FEED_CATEGORIES.filter(c => (counts[c.type] ?? 0) > 0);
  if (present.length === 0) return null;

  const hiddenPresent = present.filter(c => hidden.has(c.key));
  const visibleCount = present.length - hiddenPresent.length;

  return (
    <div className="feed-filter" ref={ref}>
      <button
        type="button"
        className={`feed-filter__button${hiddenPresent.length ? ' feed-filter__button--active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filter message types"
      >
        <Filter size={13} strokeWidth={2} />
        <span>Filter</span>
        {hiddenPresent.length > 0 && (
          <span className="feed-filter__badge">{hiddenPresent.length}</span>
        )}
      </button>

      {/* Hidden classes as removable chips — click the × to bring one back. */}
      {hiddenPresent.map(c => (
        <button
          key={c.key}
          type="button"
          className="feed-filter__chip"
          onClick={() => onToggle(c.key)}
          title={`Show ${c.label} again`}
        >
          <EyeOff size={11} strokeWidth={2} />
          <span>{c.label}</span>
          <X size={12} strokeWidth={2.5} className="feed-filter__chip-x" />
        </button>
      ))}

      {open && (
        <div className="feed-filter__menu" role="menu">
          <div className="feed-filter__menu-title">Show in feed</div>
          {present.map(c => {
            const isHidden = hidden.has(c.key);
            const isLastVisible = !isHidden && visibleCount === 1;
            return (
              <button
                key={c.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={!isHidden}
                disabled={isLastVisible}
                className={`feed-filter__row${isHidden ? ' feed-filter__row--off' : ''}`}
                onClick={() => { if (!isLastVisible) onToggle(c.key); }}
                title={
                  isLastVisible
                    ? 'At least one type must stay visible'
                    : isHidden ? `Show ${c.label}` : `Hide ${c.label}`
                }
              >
                {isHidden ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                <span className="feed-filter__row-label">{c.label}</span>
                <span className="feed-filter__row-count">{counts[c.type] ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
