import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminVideoWatchLog,
  type AdminVideoWatchLogRow,
} from '../lib/videoCompletionDb';

function formatWatchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatWatchPercent(percent: number | null): string {
  if (percent == null) return '—';
  if (Number.isInteger(percent)) return `${percent}%`;
  return `${percent.toFixed(1)}%`;
}

export function VideoWatchLogSection() {
  const [rows, setRows] = useState<AdminVideoWatchLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAdminVideoWatchLog(150).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setRows([]);
      } else {
        setRows(result.rows);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.username.toLowerCase().includes(q) ||
        (row.email ?? '').toLowerCase().includes(q) ||
        row.videoTitle.toLowerCase().includes(q) ||
        (row.categoryName ?? '').toLowerCase().includes(q) ||
        row.viewType.includes(q),
    );
  }, [rows, search]);

  return (
    <section className="card video-watch-log">
      <header className="video-watch-log__header">
        <div className="video-watch-log__title-row">
          <h3 className="section-title">Watch log</h3>
          <span className="admin-count" aria-live="polite">
            {filtered.length}
          </span>
        </div>
        <p className="muted video-watch-log__intro">
          Recent catalog video activity (last 150). Full watches require at least
          95% without skipping forward. Partial views are logged after 5 seconds
          or 10% watched (once per user per video per day).
        </p>
        <label className="field video-watch-log__search">
          <span className="visually-hidden">Search watch log</span>
          <input
            type="search"
            placeholder="Search user, email, video, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search watch log"
          />
        </label>
      </header>

      {loading && <p className="muted">Loading watch log…</p>}

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="muted">
          {rows.length === 0
            ? 'No video watches yet.'
            : 'No entries match your search.'}
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="video-watch-log__list">
          {filtered.map((row) => (
            <li key={row.logId} className="video-watch-log__row">
              <div className="video-watch-log__primary">
                <strong>{row.username}</strong>
                {row.email && <span className="muted">{row.email}</span>}
              </div>
              <div className="video-watch-log__video">
                <span>{row.videoTitle}</span>
                {row.categoryName && (
                  <span className="video-watch-log__category">{row.categoryName}</span>
                )}
              </div>
              <div className="video-watch-log__type">
                <span
                  className={`video-watch-log__badge video-watch-log__badge--${row.viewType}`}
                >
                  {row.viewType === 'full' ? 'Full watch' : 'Partial view'}
                </span>
                <span className="muted video-watch-log__percent">
                  {formatWatchPercent(row.watchPercent)}
                </span>
              </div>
              <div className="video-watch-log__meta muted">
                <time dateTime={row.watchedAt}>{formatWatchedAt(row.watchedAt)}</time>
                {row.xpAwarded > 0 && (
                  <span className="video-watch-log__xp">+{row.xpAwarded} XP</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
