import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminDmToast } from './AdminDmToast';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useAppStore } from '../hooks/useAppStore';
import { useAdminDirectMessages } from '../hooks/useAdminDirectMessages';
import { useCommunityChat } from '../hooks/useCommunityChat';
import {
  getUnreadCountForAdminContactTab,
  getUnreadCountForAdminInboxTab,
  getUnreadCountForChannelTab,
  useCommunityChatUnread,
} from '../hooks/useCommunityChatUnread';
import {
  ADMIN_DM_MAX_LENGTH,
  ADMIN_DM_SENDER_NAME,
  isAdminDirectMessageFromAdmin,
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
import { formatUnreadBadgeCount } from '../lib/communityChatUnread';
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

function viewLabel(view: CommunityView): string {
  if (view === 'admin-contact') return 'Message Dickalicious';
  if (view === 'admin-inbox') return 'Admin Inbox';
  return COMMUNITY_CHANNELS.find((ch) => ch.id === view)?.label ?? 'Chat';
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
      <div className="community-messages__empty">
        <span className="community-messages__empty-icon" aria-hidden="true">
          📥
        </span>
        <p className="muted community-messages__empty-text">No admin messages yet.</p>
      </div>
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

export function CommunityChatBubble() {
  const { session } = useAppStore();
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<CommunityView>('global');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;

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
    canPost: canAccess && isChannelView(activeView) && open,
  });

  const adminDm = useAdminDirectMessages({
    mode: isAdminInbox ? 'inbox' : 'own',
    userId: session?.userId,
    username: session?.username,
    enabled: open && (isAdminContact || isAdminInbox),
    markReadOnInbox: isAdminInbox && isAdmin && open,
  });

  const {
    unreadByView,
    totalUnread,
    adminDmToast,
    dismissAdminDmToast,
  } = useCommunityChatUnread({
    userId: session?.userId,
    isAdmin,
    open,
    activeView,
  });

  useEffect(() => {
    setDraft('');
    setSendError('');
  }, [activeView]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    messages,
    adminDm.messages,
    activeView,
    loading,
    adminDm.loading,
    open,
  ]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && widgetRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

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

  const showLauncherBadge = totalUnread > 0 && !open;
  const launcherBadgeLabel = formatUnreadBadgeCount(totalUnread);
  const adminContactUnread = getUnreadCountForAdminContactTab(unreadByView, activeView, open);
  const adminInboxUnread = getUnreadCountForAdminInboxTab(unreadByView, activeView, open);

  const shellClassName = [
    'community-chat-widget',
    hasNav && 'community-chat-widget--with-nav',
    hasPlayer && 'community-chat-widget--with-player',
    open && 'community-chat-widget--open',
  ]
    .filter(Boolean)
    .join(' ');

  const panelClassName = [
    'community-chat-widget__panel',
    isAdminContact && 'community-chat-widget__panel--dm',
    isAdminInbox && 'community-chat-widget__panel--inbox',
    showChannelChat && !canAccess && 'community-chat-widget__panel--locked',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <AdminDmToast
        preview={adminDmToast?.preview ?? null}
        onDismiss={dismissAdminDmToast}
        onOpenChat={() => {
          setActiveView('admin-contact');
          setOpen(true);
        }}
      />
      <div ref={widgetRef} className={shellClassName}>
      {open && (
        <section
          className={panelClassName}
          aria-label="Community chat"
          role="dialog"
          aria-modal="false"
        >
          <header className="community-chat-widget__header">
            <div className="community-chat-widget__title-wrap">
              <div className="community-chat-widget__title-row">
                <span className="community-chat-widget__title-icon" aria-hidden="true">
                  {isAdminContact ? '✉️' : isAdminInbox ? '📥' : '💬'}
                </span>
                <h2 className="community-chat-widget__title">{viewLabel(activeView)}</h2>
              </div>
              <p className="community-chat-widget__subtitle muted">
                {isAdminContact
                  ? 'Private message to Dickalicious'
                  : isAdminInbox
                    ? 'Member direct messages'
                    : 'Pick a channel, then chat below'}
              </p>
            </div>
            <button
              type="button"
              className="community-chat-widget__close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <nav
            className="community-channels community-channels--widget"
            aria-label="Chat channels"
          >
            {COMMUNITY_CHANNELS.map((ch) => {
              const accessible = canAccessCommunityChannel(
                ch.id,
                session?.patreonTier,
                session?.patreonStatus,
                isAdmin,
              );
              const tabUnread = getUnreadCountForChannelTab(
                unreadByView,
                ch.id,
                activeView,
                open,
              );
              return (
                <button
                  key={ch.id}
                  type="button"
                  className={`community-channels__tab${
                    activeView === ch.id ? ' community-channels__tab--active' : ''
                  }${!accessible ? ' community-channels__tab--locked' : ''}`}
                  onClick={() => setActiveView(ch.id)}
                  aria-current={activeView === ch.id ? 'true' : undefined}
                >
                  {!accessible && <span aria-hidden>🔒 </span>}
                  {ch.label}
                  {tabUnread > 0 && (
                    <span
                      className="community-channels__badge community-channels__badge--unread"
                      aria-label={`${tabUnread} unread`}
                    >
                      {formatUnreadBadgeCount(tabUnread)}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              className={`community-channels__tab community-channels__tab--admin${
                isAdminContact ? ' community-channels__tab--active' : ''
              }`}
              onClick={() => setActiveView('admin-contact')}
              aria-current={isAdminContact ? 'true' : undefined}
            >
              Dickalicious
              {adminContactUnread > 0 && (
                <span
                  className="community-channels__badge community-channels__badge--unread"
                  aria-label={`${adminContactUnread} unread`}
                >
                  {formatUnreadBadgeCount(adminContactUnread)}
                </span>
              )}
            </button>
            {isAdmin && (
              <button
                type="button"
                className={`community-channels__tab community-channels__tab--inbox${
                  isAdminInbox ? ' community-channels__tab--active' : ''
                }`}
                onClick={() => setActiveView('admin-inbox')}
                aria-current={isAdminInbox ? 'true' : undefined}
              >
                Inbox
                {adminInboxUnread > 0 && (
                  <span
                    className="community-channels__badge community-channels__badge--unread"
                    aria-label={`${adminInboxUnread} unread`}
                  >
                    {formatUnreadBadgeCount(adminInboxUnread)}
                  </span>
                )}
              </button>
            )}
          </nav>

          <div className="community-chat-widget__body">
            {isAdminContact && (
              <>
                {(adminDm.error || error) && (
                  <p className="login-error" role="alert">
                    {adminDm.error || error}
                  </p>
                )}

                <div
                  ref={listRef}
                  className="community-messages community-messages--widget community-messages--ticket"
                  role="log"
                  aria-live="polite"
                >
                  {adminDm.loading && <p className="muted">Loading your messages…</p>}
                  {!adminDm.loading && adminDm.messages.length === 0 && (
                    <div className="community-messages__empty">
                      <span className="community-messages__empty-icon" aria-hidden="true">
                        ✉️
                      </span>
                      <p className="muted community-messages__empty-text">
                        No messages yet. Send a private note below.
                      </p>
                    </div>
                  )}
                  {adminDm.messages.map((msg) => {
                    const fromAdmin = isAdminDirectMessageFromAdmin(msg);
                    return (
                      <article
                        key={msg.id}
                        className={`community-message${
                          fromAdmin ? '' : ' community-message--own'
                        }`}
                      >
                        <header className="community-message__meta">
                          <strong>{fromAdmin ? ADMIN_DM_SENDER_NAME : 'You'}</strong>
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
                  className="community-compose community-compose--widget"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAdminSend();
                  }}
                >
                  <label className="sr-only" htmlFor="widget-admin-contact-input">
                    Message to admin
                  </label>
                  <textarea
                    id="widget-admin-contact-input"
                    className="community-compose__input"
                    rows={2}
                    maxLength={maxLength}
                    placeholder="Write a private message…"
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
                      {adminDm.sending ? 'Sending…' : 'Send'}
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

            {isAdminInbox && isAdmin && (
              <>
                {adminDm.error && (
                  <p className="login-error" role="alert">
                    {adminDm.error}
                  </p>
                )}

                <div
                  ref={listRef}
                  className="community-messages community-messages--widget community-messages--inbox"
                  role="log"
                  aria-live="polite"
                >
                  <AdminInboxMessageList
                    messages={adminDm.messages}
                    loading={adminDm.loading}
                  />
                </div>
              </>
            )}

            {showChannelChat && !canAccess && (
              <section className="community-locked community-locked--widget" aria-live="polite">
                <span className="community-locked__icon" aria-hidden="true">
                  🔒
                </span>
                <h3 className="community-chat-widget__locked-title">This room is locked</h3>
                <p className="muted community-locked__message">{lockMessage}</p>
                <p className="muted community-locked__hint">
                  Upgrade on Patreon to unlock this channel.
                </p>
                <div className="btn-row community-chat-widget__locked-actions">
                  <a
                    className="btn btn--primary btn--small"
                    href={patreonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Patreon
                  </a>
                  <Link className="btn btn--ghost btn--small" to="/settings">
                    Settings
                  </Link>
                </div>
              </section>
            )}

            {showChannelChat && canAccess && (
              <>
                {error && (
                  <p className="login-error" role="alert">
                    {error}
                  </p>
                )}

                <div
                  ref={listRef}
                  className="community-messages community-messages--widget"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {loading && <p className="muted">Loading messages…</p>}
                  {!loading && messages.length === 0 && (
                    <div className="community-messages__empty">
                      <span className="community-messages__empty-icon" aria-hidden="true">
                        👋
                      </span>
                      <p className="muted community-messages__empty-text">
                        No messages yet. Say hello!
                      </p>
                    </div>
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
                  className="community-compose community-compose--widget"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleChannelSend();
                  }}
                >
                  <label className="sr-only" htmlFor="widget-community-message-input">
                    Message
                  </label>
                  <textarea
                    id="widget-community-message-input"
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
        </section>
      )}

      <button
        type="button"
        className="community-chat-widget__launcher"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close community chat' : 'Open community chat'}
        aria-expanded={open}
        title="Community chat"
      >
        <svg
          className="community-chat-widget__launcher-icon"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3l3.5 3.5c.2.2.5.3.8.3.3 0 .6-.1.8-.3L15 18h5c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14h-4.5l-.3.2-2.7 2.7-2.7-2.7-.3-.2H4V4h16v12z"
          />
        </svg>
        {showLauncherBadge && (
          <span
            className="community-chat-widget__launcher-badge community-chat-widget__launcher-badge--unread"
            aria-label={`${totalUnread} unread messages`}
          >
            {launcherBadgeLabel}
          </span>
        )}
      </button>
    </div>
    </>
  );
}
