import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useCommunityChat } from '../hooks/useCommunityChat';
import {
  COMMUNITY_CHANNELS,
  canAccessCommunityChannel,
  getCommunityChannelLockMessage,
  type CommunityChannel,
} from '../lib/communityChannels';
import { COMMUNITY_MESSAGE_MAX_LENGTH } from '../lib/communityChat';
import { getPatreonPageUrl } from '../lib/patreon';

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Community() {
  const { session } = useAppStore();
  const [activeChannel, setActiveChannel] = useState<CommunityChannel>('global');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const isAdmin = session?.role === 'admin';
  const canAccess = canAccessCommunityChannel(
    activeChannel,
    session?.patreonTier,
    session?.patreonStatus,
    isAdmin,
  );

  const { messages, loading, error, sending, send } = useCommunityChat({
    channel: activeChannel,
    userId: session?.userId,
    username: session?.username,
    canPost: canAccess,
  });

  useEffect(() => {
    setDraft('');
    setSendError('');
  }, [activeChannel]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeChannel, loading]);

  const handleSend = async () => {
    setSendError('');
    const result = await send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  };

  const lockMessage = getCommunityChannelLockMessage(activeChannel);
  const patreonUrl = getPatreonPageUrl();

  return (
    <div className="community-page">
      <header className="community-page__header">
        <h2 className="section-title">Community</h2>
        <p className="muted">
          Chat with other members. Tier rooms require an active Patreon tier.
        </p>
      </header>

      <nav className="community-channels" aria-label="Chat channels">
        {COMMUNITY_CHANNELS.map((ch) => {
          const accessible = canAccessCommunityChannel(
            ch.id,
            session?.patreonTier,
            session?.patreonStatus,
            isAdmin,
          );
          return (
            <button
              key={ch.id}
              type="button"
              className={`community-channels__tab${
                activeChannel === ch.id ? ' community-channels__tab--active' : ''
              }${!accessible ? ' community-channels__tab--locked' : ''}`}
              onClick={() => setActiveChannel(ch.id)}
              aria-current={activeChannel === ch.id ? 'page' : undefined}
            >
              {!accessible && <span aria-hidden>🔒 </span>}
              {ch.label}
            </button>
          );
        })}
      </nav>

      {!canAccess ? (
        <section className="community-locked card" aria-live="polite">
          <h3 className="section-title">Channel locked</h3>
          <p className="muted">{lockMessage}</p>
          <p className="muted">
            Upgrade on Patreon to join this room. Higher tiers can also access
            lower-tier channels.
          </p>
          <div className="btn-row">
            <a
              className="btn btn--primary"
              href={patreonUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Support on Patreon
            </a>
            <Link className="btn btn--ghost" to="/settings">
              Settings
            </Link>
          </div>
        </section>
      ) : (
        <>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div
            ref={listRef}
            className="community-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {loading && <p className="muted">Loading messages…</p>}
            {!loading && messages.length === 0 && (
              <p className="muted community-messages__empty">
                No messages yet. Say hello!
              </p>
            )}
            {messages.map((msg) => {
              const isOwn = msg.userId === session?.userId;
              return (
                <article
                  key={msg.id}
                  className={`community-message${
                    isOwn ? ' community-message--own' : ''
                  }`}
                >
                  <header className="community-message__meta">
                    <strong>{msg.username}</strong>
                    <time dateTime={msg.createdAt}>
                      {formatMessageTime(msg.createdAt)}
                    </time>
                  </header>
                  <p className="community-message__body">{msg.body}</p>
                </article>
              );
            })}
          </div>

          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <label className="sr-only" htmlFor="community-message-input">
              Message
            </label>
            <textarea
              id="community-message-input"
              className="community-compose__input"
              rows={2}
              maxLength={COMMUNITY_MESSAGE_MAX_LENGTH}
              placeholder="Write a message…"
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="community-compose__footer">
              <span className="muted community-compose__count">
                {draft.trim().length}/{COMMUNITY_MESSAGE_MAX_LENGTH}
              </span>
              <button
                type="submit"
                className="btn btn--primary btn--small"
                disabled={sending || !draft.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {sendError && (
              <p className="login-error" role="alert">
                {sendError}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
