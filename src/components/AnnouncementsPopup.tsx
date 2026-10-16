import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import {
  markAnnouncementsPopupSeen,
  shouldShowAnnouncementsPopup,
} from '../lib/announcementsPopup';
import {
  fetchCommunityMessages,
  type CommunityMessage,
} from '../lib/communityChat';
import { isCategoryTutorialOpen } from '../lib/categoryTutorial';
import {
  isSiteTutorialDone,
  isSiteTutorialOpen,
  SITE_TUTORIAL_DONE_EVENT,
  SITE_TUTORIAL_REQUEST_EVENT,
} from '../lib/siteTutorial';
import {
  isUniversityTutorialOpen,
  UNIVERSITY_TUTORIAL_DONE_EVENT,
} from '../lib/universityTutorial';
import { isVideosTutorialOpen } from '../lib/videosTutorial';

const MAX_ITEMS = 8;

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AnnouncementsPopup() {
  const { pathname } = useLocation();
  const { session } = useAppStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const isAdminRoute = pathname.startsWith('/admin');

  const close = useCallback(() => {
    markAnnouncementsPopupSeen();
    setOpen(false);
  }, []);

  const tryOpen = useCallback(() => {
    if (isAdminRoute) return;
    if (!isSiteTutorialDone() || isSiteTutorialOpen()) return;
    if (
      isUniversityTutorialOpen() ||
      isVideosTutorialOpen() ||
      isCategoryTutorialOpen()
    ) {
      return;
    }
    if (!shouldShowAnnouncementsPopup()) return;
    setOpen(true);
  }, [isAdminRoute]);

  useEffect(() => {
    const timer = window.setTimeout(tryOpen, 520);
    return () => window.clearTimeout(timer);
  }, [tryOpen]);

  useEffect(() => {
    const onDone = () => {
      window.setTimeout(tryOpen, 360);
    };
    const onRequest = () => {
      if (open) setOpen(false);
    };
    window.addEventListener(SITE_TUTORIAL_DONE_EVENT, onDone);
    window.addEventListener(UNIVERSITY_TUTORIAL_DONE_EVENT, onDone);
    window.addEventListener(SITE_TUTORIAL_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(SITE_TUTORIAL_DONE_EVENT, onDone);
      window.removeEventListener(UNIVERSITY_TUTORIAL_DONE_EVENT, onDone);
      window.removeEventListener(SITE_TUTORIAL_REQUEST_EVENT, onRequest);
    };
  }, [open, tryOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      const result = await fetchCommunityMessages(
        'announcements',
        session?.userId,
      );
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setMessages([]);
        return;
      }
      setMessages([...result.messages].reverse().slice(0, MAX_ITEMS));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, session?.userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  if (isAdminRoute || !open) return null;

  return (
    <div
      className="announcements-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcements-popup-title"
    >
      <button
        type="button"
        className="announcements-popup__backdrop"
        aria-label="Close announcements"
        onClick={close}
      />
      <div className="announcements-popup__panel">
        <p className="announcements-popup__kicker">From Dickalicious</p>
        <h2 id="announcements-popup-title" className="section-title">
          Announcements
        </h2>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && messages.length === 0 ? (
          <p className="muted">
            Nothing new yet. Dickalicious posts here from Community →
            Announcements.
          </p>
        ) : null}
        {!loading && messages.length > 0 ? (
          <ul className="announcements-popup__list">
            {messages.map((item) => (
              <li key={item.id} className="announcements-popup__item">
                <p className="announcements-popup__meta muted">
                  {formatStamp(item.createdAt)}
                </p>
                <p className="announcements-popup__body">{item.body}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="announcements-popup__actions">
          <button type="button" className="btn btn--primary" onClick={close}>
            Got it
          </button>
          <Link to="/community" className="btn btn--ghost" onClick={close}>
            Open Community
          </Link>
        </div>
      </div>
    </div>
  );
}
