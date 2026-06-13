import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminDmToast } from './AdminDmToast';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useAppStore } from '../hooks/useAppStore';
import { useAdminDirectMessages } from '../hooks/useAdminDirectMessages';
import { useCommunityChat } from '../hooks/useCommunityChat';
import {
  getUnreadCountForAdminContactTab,
  getUnreadCountForChannelTab,
  useCommunityChatUnread,
} from '../hooks/useCommunityChatUnread';
import {
  ADMIN_DM_MAX_LENGTH,
  ADMIN_DM_SENDER_NAME,
  buildAdminDmConversations,
  isAdminDirectMessageFromAdmin,
  isCommunityAdmin,
  type AdminDmConversation,
} from '../lib/adminDirectMessages';
import {
  COMMUNITY_CHANNELS,
  canAccessCommunityChannel,
  canPostCommunityChannel,
  getCommunityChannelLockMessage,
  getCommunityChannelReadOnlyMessage,
  type CommunityChannel,
} from '../lib/communityChannels';
import type { CommunityMessage } from '../lib/communityChat';
import { COMMUNITY_MESSAGE_MAX_LENGTH } from '../lib/communityChat';
import { formatUnreadBadgeCount } from '../lib/communityChatUnread';
import { getPatreonPageUrl } from '../lib/patreon';

type CommunityView = CommunityChannel | 'admin-contact';

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
  return view !== 'admin-contact';
}

function ChannelMessageBubble({
  msg,
  isOwn,
  isAdmin,
  onDelete,
  onToggleHeart,
}: {
  msg: CommunityMessage;
  isOwn: boolean;
  isAdmin: boolean;
  onDelete: (messageId: string) => void;
  onToggleHeart: (messageId: string, hearted: boolean) => void;
}) {
  return (
    <article
      className={`community-message${isOwn ? ' community-message--own' : ''}${
        msg.heartCount > 0 ? ' community-message--hearted' : ''
      }`}
    >
      <header className="community-message__meta">
        <strong>{msg.username}</strong>
        <time dateTime={msg.createdAt}>{formatMessageTime(msg.createdAt)}</time>
      </header>
      <p className="community-message__body">{msg.body}</p>
      <footer className="community-message__footer">
        {msg.heartCount > 0 && (
          <span className="community-message__heart-count" aria-label={`${msg.heartCount} hearts`}>
            <span aria-hidden="true">❤️</span>
            {msg.heartCount}
          </span>
        )}
        {isAdmin && (
          <div className="community-message__admin-actions">
            <button
              type="button"
              className={`community-message__action community-message__action--heart${
                msg.hearted ? ' community-message__action--heart-active' : ''
              }`}
              onClick={() => onToggleHeart(msg.id, msg.hearted)}
              aria-label={msg.hearted ? 'Remove heart' : 'Heart message'}
              title={msg.hearted ? 'Remove heart' : 'Heart message'}
            >
              <span aria-hidden="true">{msg.hearted ? '❤️' : '🤍'}</span>
            </button>
            <button
              type="button"
              className="community-message__action community-message__action--delete"
              onClick={() => onDelete(msg.id)}
              aria-label="Delete message"
              title="Delete message"
            >
              <span aria-hidden="true">🗑️</span>
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}

function viewLabel(
  view: CommunityView,
  isAdmin: boolean,
  threadUsername: string | null,
): string {
  if (view === 'admin-contact') {
    if (isAdmin && threadUsername) return threadUsername;
    if (isAdmin) return 'Member messages';
    return 'Message Dickalicious';
  }
  return COMMUNITY_CHANNELS.find((ch) => ch.id === view)?.label ?? 'Chat';
}

function AdminConversationList({
  conversations,
  loading,
  onSelect,
}: {
  conversations: AdminDmConversation[];
  loading: boolean;
  onSelect: (userId: string) => void;
}) {
  if (loading) {
    return <p className="muted">Loading conversations…</p>;
  }
  if (conversations.length === 0) {
    return (
      <div className="community-messages__empty">
        <span className="community-messages__empty-icon" aria-hidden="true">
          ✉️
        </span>
        <p className="muted community-messages__empty-text">
          No member messages yet.
        </p>
      </div>
    );
  }

  return (
    <ul className="community-admin-conversations" role="list">
      {conversations.map((conv) => (
        <li key={conv.userId}>
          <button
            type="button"
            className={`community-admin-conversation${
              conv.unreadCount > 0 ? ' community-admin-conversation--unread' : ''
            }`}
            onClick={() => onSelect(conv.userId)}
          >
            <span className="community-admin-conversation__main">
              <strong className="community-admin-conversation__name">
                {conv.username}
              </strong>
              <span className="community-admin-conversation__preview muted">
                {conv.lastMessagePreview}
              </span>
            </span>
            <span className="community-admin-conversation__meta">
              <time
                className="community-admin-conversation__time muted"
                dateTime={conv.lastMessageAt}
              >
                {formatMessageTime(conv.lastMessageAt)}
              </time>
              {conv.unreadCount > 0 && (
                <span
                  className="community-admin-conversation__badge"
                  aria-label={`${conv.unreadCount} unread`}
                >
                  {formatUnreadBadgeCount(conv.unreadCount)}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CommunityChatBubble() {
  const { session, effectiveSession, adminUserPreview } = useAppStore();
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<CommunityView>('global');
  const [adminThreadUserId, setAdminThreadUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;

  const isAdmin = isCommunityAdmin(session, adminUserPreview);
  const activeChannel = isChannelView(activeView) ? activeView : 'global';
  const isAdminContact = activeView === 'admin-contact';
  const isAdminThread = isAdmin && isAdminContact && adminThreadUserId != null;
  const isAdminConversationList = isAdmin && isAdminContact && adminThreadUserId == null;

  const canAccess = canAccessCommunityChannel(
    activeChannel,
    effectiveSession?.patreonTier,
    effectiveSession?.patreonStatus,
    isAdmin,
  );
  const canPost =
    canAccess &&
    canPostCommunityChannel(activeChannel, isAdmin) &&
    isChannelView(activeView) &&
    open;
  const readOnlyMessage = getCommunityChannelReadOnlyMessage(activeChannel);

  const {
    messages,
    loading,
    error,
    actionError,
    sending,
    send,
    removeMessage,
    toggleHeart,
  } = useCommunityChat({
    channel: activeChannel,
    userId: session?.userId,
    username: session?.username,
    canPost,
    isAdmin,
  });

  const adminDmMode = isAdmin
    ? isAdminThread
      ? 'thread'
      : 'inbox'
    : 'own';

  const adminDm = useAdminDirectMessages({
    mode: adminDmMode,
    userId: session?.userId,
    username: session?.username,
    threadUserId: adminThreadUserId ?? undefined,
    enabled: open && isAdminContact,
    markReadOnThread: isAdminThread && open,
  });

  const adminConversations = useMemo(
    () => buildAdminDmConversations(adminDm.messages),
    [adminDm.messages],
  );

  const adminThreadUsername =
    adminConversations.find((conv) => conv.userId === adminThreadUserId)?.username ??
    adminDm.messages.find((msg) => !msg.fromAdmin)?.username ??
    null;

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
    adminThreadUserId,
  });

  useEffect(() => {
    setDraft('');
    setSendError('');
  }, [activeView, adminThreadUserId]);

  useEffect(() => {
    if (activeView !== 'admin-contact') {
      setAdminThreadUserId(null);
    }
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
    adminThreadUserId,
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
  const adminContactUnread = getUnreadCountForAdminContactTab(
    unreadByView,
    activeView,
    open,
    isAdmin,
  );

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
    isAdminConversationList && 'community-chat-widget__panel--inbox',
    showChannelChat && !canAccess && 'community-chat-widget__panel--locked',
  ]
    .filter(Boolean)
    .join(' ');

  const adminSubtitle = isAdminThread
    ? 'Private thread with this member'
    : isAdmin
      ? 'Pick a member to open their thread'
      : 'Private message to Dickalicious';

  return (
    <>
      <AdminDmToast
        preview={adminDmToast?.preview ?? null}
        onDismiss={dismissAdminDmToast}
        onOpenChat={() => {
          setActiveView('admin-contact');
          setAdminThreadUserId(null);
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
              {isAdminThread && (
                <button
                  type="button"
                  className="community-chat-widget__back"
                  onClick={() => setAdminThreadUserId(null)}
                  aria-label="Back to conversations"
                >
                  <span aria-hidden="true">←</span>
                </button>
              )}
              <div className="community-chat-widget__title-block">
                <div className="community-chat-widget__title-row">
                  <span className="community-chat-widget__title-icon" aria-hidden="true">
                    {isAdminContact ? '✉️' : '💬'}
                  </span>
                  <h2 className="community-chat-widget__title">
                    {viewLabel(activeView, isAdmin, adminThreadUsername)}
                  </h2>
                </div>
                <p className="community-chat-widget__subtitle muted">
                  {isAdminContact
                    ? adminSubtitle
                    : 'Pick a channel, then chat below'}
                </p>
              </div>
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
            <div className="community-channels__scroll">
              {COMMUNITY_CHANNELS.map((ch) => {
                const accessible = canAccessCommunityChannel(
                  ch.id,
                  effectiveSession?.patreonTier,
                  effectiveSession?.patreonStatus,
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
            </div>
            <button
              type="button"
              className={`community-channels__tab community-channels__tab--admin${
                isAdminContact ? ' community-channels__tab--active' : ''
              }`}
              onClick={() => {
                setActiveView('admin-contact');
                setAdminThreadUserId(null);
              }}
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
          </nav>

          <div className="community-chat-widget__body">
            {isAdminContact && isAdminConversationList && (
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
                  <AdminConversationList
                    conversations={adminConversations}
                    loading={adminDm.loading}
                    onSelect={setAdminThreadUserId}
                  />
                </div>
              </>
            )}

            {isAdminContact && isAdminThread && (
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
                  {adminDm.loading && <p className="muted">Loading thread…</p>}
                  {!adminDm.loading && adminDm.messages.length === 0 && (
                    <div className="community-messages__empty">
                      <span className="community-messages__empty-icon" aria-hidden="true">
                        ✉️
                      </span>
                      <p className="muted community-messages__empty-text">
                        No messages in this thread yet.
                      </p>
                    </div>
                  )}
                  {adminDm.messages.map((msg) => {
                    const fromUser = !isAdminDirectMessageFromAdmin(msg);
                    return (
                      <article
                        key={msg.id}
                        className={`community-message${
                          fromUser ? '' : ' community-message--own'
                        }`}
                      >
                        <header className="community-message__meta">
                          <strong>
                            {fromUser ? msg.username : ADMIN_DM_SENDER_NAME}
                          </strong>
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
                  <label className="sr-only" htmlFor="widget-admin-reply-input">
                    Reply to member
                  </label>
                  <textarea
                    id="widget-admin-reply-input"
                    className="community-compose__input"
                    rows={2}
                    maxLength={maxLength}
                    placeholder="Write a reply…"
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
                      {adminDm.sending ? 'Sending…' : 'Reply'}
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

            {isAdminContact && !isAdmin && (
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
                {(error || actionError) && (
                  <p className="login-error" role="alert">
                    {error || actionError}
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
                        {activeChannel === 'announcements' ? '📣' : '👋'}
                      </span>
                      <p className="muted community-messages__empty-text">
                        {activeChannel === 'announcements'
                          ? 'No announcements yet.'
                          : 'No messages yet. Say hello!'}
                      </p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <ChannelMessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.userId === session?.userId}
                      isAdmin={isAdmin}
                      onDelete={(messageId) => {
                        void removeMessage(messageId);
                      }}
                      onToggleHeart={(messageId, hearted) => {
                        void toggleHeart(messageId, hearted);
                      }}
                    />
                  ))}
                </div>

                {canPost ? (
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
                      placeholder={
                        activeChannel === 'announcements'
                          ? 'Write an announcement…'
                          : 'Write a message…'
                      }
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
                ) : (
                  readOnlyMessage && (
                    <p className="community-compose community-compose--readonly muted">
                      {readOnlyMessage}
                    </p>
                  )
                )}
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
