import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useAdminDirectMessages } from '../hooks/useAdminDirectMessages';
import { useCommunityChat } from '../hooks/useCommunityChat';
import {
  ADMIN_DM_MAX_LENGTH,
  isCommunityAdmin,
  type AdminDirectMessage,
} from '../lib/adminDirectMessages';
import {
  COMMUNITY_CHANNELS,
  canAccessCommunityChannel,
  getCommunityChannelLockMessage,
  type CommunityChannel,
} from '../lib/communityChannels';
import { COMMUNITY_MESSAGE_MAX_LENGTH } from '../lib/communityChat';
import { getPatreonPageUrl } from '../lib/patreon';

type CommunityView = CommunityChannel | 'admin-contact' | 'admin-inbox';

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

function isChannelView(view: CommunityView): view is CommunityChannel {
  return view !== 'admin-contact' && view !== 'admin-inbox';
}

function AdminInboxMessageList({
  messages,
  loading,
}: {
  messages: AdminDirectMessage[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="muted">Loading inbox…</p>;
  }
  if (messages.length === 0) {
    return (
      <p className="muted community-messages__empty">
        No admin messages yet.
      </p>
    );
  }

  const items: ReactNode[] = [];
  let lastUserId: string | null = null;

  for (const msg of messages) {
    if (msg.userId !== lastUserId) {
      lastUserId = msg.userId;
      items.push(
        <div key={`group-${msg.userId}-${msg.id}`} className="community-admin-group">
          <span className="community-admin-group__label">{msg.username}</span>
        </div>,
      );
    }
    items.push(
      <article key={msg.id} className="community-message community-message--inbox">
        <header className="community-message__meta">
          <strong>{msg.username}</strong>
          <time dateTime={msg.createdAt}>{formatMessageTime(msg.createdAt)}</time>
        </header>
        <p className="community-message__body">{msg.body}</p>
        {!msg.readAt && (
          <span className="community-admin-badge" aria-label="Unread">
            New
          </span>
        )}
      </article>,
    );
  }

  return <>{items}</>;
}

export function Community() {
  const { session } = useAppStore();
  const [activeView, setActiveView] = useState<CommunityView>('global');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const isAdmin = isCommunityAdmin(session);
  const activeChannel = isChannelView(activeView) ? activeView : 'global';
  const isAdminContact = activeView === 'admin-contact';
  const isAdminInbox = activeView === 'admin-inbox';

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
    canPost: canAccess && isChannelView(activeView),
  });

  const adminDm = useAdminDirectMessages({
    mode: isAdminInbox ? 'inbox' : 'own',
    userId: session?.userId,
    username: session?.username,
    enabled: isAdminContact || isAdminInbox,
    markReadOnInbox: isAdminInbox && isAdmin,
  });

  useEffect(() => {
    setDraft('');
    setSendError('');
  }, [activeView]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    messages,
    adminDm.messages,
    activeView,
    loading,
    adminDm.loading,
  ]);

  const handleChannelSend = async () => {
    setSendError('');
    const result = await send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  };

  const handleAdminSend = async () => {
    setSendError('');
    const result = await adminDm.send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  };

  const lockMessage = getCommunityChannelLockMessage(activeChannel);
  const patreonUrl = getPatreonPageUrl();
  const showChannelChat = isChannelView(activeView);
  const maxLength = isAdminContact ? ADMIN_DM_MAX_LENGTH : COMMUNITY_MESSAGE_MAX_LENGTH;

  return (
    <div className="community-page">
      <header className="community-page__header">
        <h2 className="section-title">Community</h2>
        <p className="muted">
          {isAdminContact
            ? 'Send a private message to admins only — not posted in public chat.'
            : isAdminInbox
              ? 'Direct messages from members (private, not in public channels).'
              : 'Chat with other members. Tier rooms require an active Patreon tier.'}
        </p>
      </header>

      <nav className="community-channels" aria-label="Community sections">
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
                activeView === ch.id ? ' community-channels__tab--active' : ''
              }${!accessible ? ' community-channels__tab--locked' : ''}`}
              onClick={() => setActiveView(ch.id)}
              aria-current={activeView === ch.id ? 'page' : undefined}
            >
              {!accessible && <span aria-hidden>🔒 </span>}
              {ch.label}
            </button>
          );
        })}
        <button
          type="button"
          className={`community-channels__tab community-channels__tab--admin${
            isAdminContact ? ' community-channels__tab--active' : ''
          }`}
          onClick={() => setActiveView('admin-contact')}
          aria-current={isAdminContact ? 'page' : undefined}
        >
          Contact Admin
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`community-channels__tab community-channels__tab--inbox${
              isAdminInbox ? ' community-channels__tab--active' : ''
            }`}
            onClick={() => setActiveView('admin-inbox')}
            aria-current={isAdminInbox ? 'page' : undefined}
          >
            Admin Inbox
          </button>
        )}
      </nav>

      {isAdminContact && (
        <section className="community-admin-panel card" aria-labelledby="admin-contact-title">
          <h3 id="admin-contact-title" className="section-title">
            Message Dickalicious
          </h3>
          <p className="muted community-admin-panel__hint">
            Your messages go only to admins. They are not visible in Global or
            tier chat channels.
          </p>

          {(adminDm.error || error) && (
            <p className="login-error" role="alert">
              {adminDm.error || error}
            </p>
          )}

          <div
            ref={listRef}
            className="community-messages community-messages--ticket"
            role="log"
            aria-live="polite"
          >
            {adminDm.loading && <p className="muted">Loading your messages…</p>}
            {!adminDm.loading && adminDm.messages.length === 0 && (
              <p className="muted community-messages__empty">
                No messages yet. Send a note to the admin team below.
              </p>
            )}
            {adminDm.messages.map((msg) => (
              <article
                key={msg.id}
                className="community-message community-message--own"
              >
                <header className="community-message__meta">
                  <strong>You</strong>
                  <time dateTime={msg.createdAt}>
                    {formatMessageTime(msg.createdAt)}
                  </time>
                </header>
                <p className="community-message__body">{msg.body}</p>
              </article>
            ))}
          </div>

          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAdminSend();
            }}
          >
            <label className="sr-only" htmlFor="admin-contact-input">
              Message to admin
            </label>
            <textarea
              id="admin-contact-input"
              className="community-compose__input"
              rows={3}
              maxLength={maxLength}
              placeholder="Write a private message to admins…"
              value={draft}
              disabled={adminDm.sending}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="community-compose__footer">
              <span className="muted community-compose__count">
                {draft.trim().length}/{maxLength}
              </span>
              <button
                type="submit"
                className="btn btn--primary btn--small"
                disabled={adminDm.sending || !draft.trim()}
              >
                {adminDm.sending ? 'Sending…' : 'Send to Admin'}
              </button>
            </div>
            {sendError && (
              <p className="login-error" role="alert">
                {sendError}
              </p>
            )}
          </form>
        </section>
      )}

      {isAdminInbox && isAdmin && (
        <section className="community-admin-panel card" aria-labelledby="admin-inbox-title">
          <h3 id="admin-inbox-title" className="section-title">
            Admin Inbox
          </h3>
          <p className="muted community-admin-panel__hint">
            Member direct messages, grouped by sender. Not shown in public
            channels.
          </p>

          {adminDm.error && (
            <p className="login-error" role="alert">
              {adminDm.error}
            </p>
          )}

          <div
            ref={listRef}
            className="community-messages community-messages--inbox"
            role="log"
            aria-live="polite"
          >
            <AdminInboxMessageList
              messages={adminDm.messages}
              loading={adminDm.loading}
            />
          </div>
        </section>
      )}

      {showChannelChat && !canAccess ? (
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
      ) : showChannelChat ? (
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
              void handleChannelSend();
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
      ) : null}
    </div>
  );
}
