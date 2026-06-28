import { useEffect, useState } from 'react';
import { fetchVersion, fetchLatestReleaseTag } from '../lib/api';

/** Normalize a version/tag for comparison: strip a leading "v". */
function norm(v: string): string {
  return v.replace(/^v/, '').trim();
}

/** True when `latest` is a different, newer-looking version than `current`. */
function isNewer(current: string, latest: string): boolean {
  const c = norm(current).split('.').map(n => parseInt(n, 10) || 0);
  const l = norm(latest).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(c.length, l.length);
  for (let i = 0; i < len; i++) {
    const a = c[i] ?? 0;
    const b = l[i] ?? 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

/**
 * Dismissible "update available" banner. Compares the running build version
 * (from the server) against the latest published GitHub release. Fails silent:
 * if either lookup fails, nothing renders — it never blocks the app.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<{ latest: string; repo: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { version, repo } = await fetchVersion();
        const latest = await fetchLatestReleaseTag(repo);
        if (!cancelled && latest && isNewer(version, latest)) {
          setInfo({ latest, repo });
        }
      } catch {
        /* fail silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-banner__text">
        AgentChat <strong>{info.latest}</strong> is available.
      </span>
      <a
        className="update-banner__link"
        href={`https://github.com/${info.repo}/releases/latest`}
        target="_blank"
        rel="noopener noreferrer"
      >
        How to update
      </a>
      <button
        className="update-banner__dismiss"
        onClick={() => setDismissed(true)}
        title="Dismiss"
        aria-label="Dismiss update notice"
      >
        ×
      </button>
    </div>
  );
}
