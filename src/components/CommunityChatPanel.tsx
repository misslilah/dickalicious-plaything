import { useEffect, useRef, type AnimationEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  useCommunityChatSession,
  type CommunityView,
} from '../contexts/CommunityChatProvider';
import {
  ADMIN_DM_SENDER_NAME,
  isAdminDirectMessageFromAdmin,
  type AdminDmConversation,
} from '../lib/adminDirectMessages';
import { COMMUNITY_CHANNELS } from '../lib/communityChannels';
import { formatUnreadBadgeCount } from '../lib/communityChatUnread';
import {
  DEMO_PUBLIC_PROFILE_NOTICE,
  isDemoPublicProfileId,
} from '../lib/demoPublicProfile';
import { USER_DM_MAX_LENGTH } from '../lib/userDirectMessages';
import { ChatConversationTab } from './ChatConversationTab';

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMessageTimeFull(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function SendArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="community-compose__send-icon" aria-hidden="true">
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="community-chat-widget__glyph" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="community-chat-widget__glyph" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatComposeForm({
  inputId,
  label,
  placeholder,
  maxLength,
  value,
  sending,
  disabled = false,
  sendError,
  sendLabel,
  autoFocus = false,
  onChange,
  onSend,
}: {
  inputId: string;
  label: string;
  placeholder: string;
  maxLength: number;
  value: string;
  sending: boolean;
  disabled?: boolean;
  sendError: string | null;
  sendLabel: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSend = !sending && !disabled && Boolean(trimmed);
  const nearLimit = trimmed.length >= Math.floor(maxLength * 0.85);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [autoFocus, inputId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    void onSend();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="community-compose community-compose--widget"
      onSubmit={submit}
      aria-busy={sending || undefined}
    >
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <p id={`${inputId}-hint`} className="sr-only">
        Enter to send. Shift plus Enter for a new line.
      </p>
      <div className="community-compose__row">
        <textarea
          ref={inputRef}
          id={inputId}
          className="community-compose__input"
          rows={1}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={sendError ? true : undefined}
          aria-describedby={`${inputId}-hint`}
        />
        <button
          type="submit"
          className="community-compose__send"
          disabled={!canSend}
          aria-label={sending ? 'Sending' : sendLabel}
        >
          {sending ? <span className="community-compose__send-status">…</span> : <SendArrowIcon />}
        </button>
      </div>
      {nearLimit && (
        <span className="muted community-compose__count">
          {trimmed.length}/{maxLength}
        </span>
      )}
      {sendError && (
        <p className="community-chat-widget__error" role="alert">
          {sendError}
        </p>
      )}
    </form>
  );
}

function viewLabel(
  view: CommunityView,
  isAdmin: boolean,
  threadUsername: string | null,
): string {
  if (view === 'admin-contact') {
    if (isAdmin && threadUsername) return threadUsername;
    if (isAdmin) return 'Messages';
    return 'Dickalicious';
  }
  if (view === 'inbox') {
    return threadUsername ?? 'Inbox';
  }
  return COMMUNITY_CHANNELS.find((ch) => ch.id === view)?.label ?? 'Chat';
}

function UnreadMark({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="community-channels__unread" aria-label={`${count} unread`}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

function ThreadLine({
  body,
  createdAt,
  isOwn,
  author,
  continued,
}: {
  body: string;
  createdAt: string;
  isOwn: boolean;
  author: string;
  continued: boolean;
}) {
  return (
    <article
      className={`community-message${isOwn ? ' community-message--own' : ''}${
        continued ? ' community-message--continued' : ''
      }`}
    >
      {!isOwn && !continued && <span className="community-message__author">{author}</span>}
      <div className="community-message__bubble">
        <p className="community-message__body">{body}</p>
      </div>
      <time
        className="community-message__time"
        dateTime={createdAt}
        title={formatMessageTimeFull(createdAt)}
      >
        {formatMessageTime(createdAt)}
      </time>
    </article>
  );
}

function AdminConversationList({
  conversations,
  loading,
  onSelect,
  emptyText = 'No conversations yet.',
}: {
  conversations: AdminDmConversation[];
  loading: boolean;
  onSelect: (userId: string) => void;
  emptyText?: string;
}) {
  if (loading) {
    return <p className="community-messages__status">Loading…</p>;
  }
  if (conversations.length === 0) {
    return (
      <div className="community-messages__empty">
        <p className="community-messages__empty-text">{emptyText}</p>
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
              <strong className="community-admin-conversation__name">{conv.username}</strong>
              <span className="community-admin-conversation__preview">{conv.lastMessagePreview}</span>
            </span>
            <span className="community-admin-conversation__meta">
              <time className="community-admin-conversation__time" dateTime={conv.lastMessageAt}>
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

export function CommunityChatPanel({
  variant,
  onClose,
  closing = false,
  onAnimationEnd,
}: {
  variant: 'widget' | 'page';
  onClose?: () => void;
  closing?: boolean;
  onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const chat = useCommunityChatSession();
  const idPrefix = variant === 'page' ? 'page' : 'widget';
  const isPage = variant === 'page';

  const {
    sessionUserId,
    patreonTier,
    patreonStatus,
    isAdmin,
    surfaceOpen,
    activeView,
    setActiveView,
    setAdminThreadUserId,
    userDmPeer,
    setUserDmPeer,
    draft,
    setDraft,
    sendError,
    clearingAll,
    activeChannel,
    isAdminContact,
    isInbox,
    isAdminThread,
    isAdminConversationList,
    isUserDmThread,
    isUserDmInboxList,
    canAccess,
    canPost,
    readOnlyMessage,
    lockMessage,
    patreonUrl,
    showChannelChat,
    maxLength,
    messages,
    loading,
    error,
    actionError,
    sending,
    removeMessage,
    toggleHeart,
    adminDm,
    adminConversations,
    adminThreadUsername,
    userDm,
    userDmConversations,
    unreadByView,
    inboxUnread,
    adminContactUnread,
    handleChannelSend,
    handleAdminSend,
    handleUserDmSend,
    handleClearAllMessages,
  } = chat;

  useEffect(() => {
    if (!surfaceOpen) return;
    const el = listRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    messages,
    adminDm.messages,
    activeView,
    loading,
    adminDm.loading,
    userDm.messages,
    userDm.loading,
    userDmPeer?.userId,
    surfaceOpen,
  ]);

  const isDemoUserDm = isUserDmThread && isDemoPublicProfileId(userDmPeer?.userId);
  const headerThreadName = isInbox ? (userDmPeer?.username ?? null) : adminThreadUsername;
  const surfaceError = error || actionError || userDm.error || adminDm.error;

  const panelClassName = [
    isPage ? 'community-page__chat' : 'community-chat-widget__panel',
    !isPage && closing && 'community-chat-widget__panel--closing',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      id={isPage ? undefined : 'community-chat-widget-panel'}
      className={panelClassName}
      aria-label="Community chat"
      role={isPage ? 'region' : 'dialog'}
      aria-modal={isPage ? undefined : 'false'}
      onAnimationEnd={isPage ? undefined : onAnimationEnd}
    >
      <header className="community-chat-widget__header">
        <div className="community-chat-widget__title-wrap">
          {(isAdminThread || isUserDmThread) && (
            <button
              type="button"
              className="community-chat-widget__back"
              onClick={() => {
                if (isUserDmThread) setUserDmPeer(null);
                else setAdminThreadUserId(null);
              }}
              aria-label="Back to conversations"
            >
              <BackIcon />
            </button>
          )}
          <h2 className="community-chat-widget__title">
            {showChannelChat ? 'Chat' : viewLabel(activeView, isAdmin, headerThreadName)}
          </h2>
        </div>
        <div className="community-chat-widget__header-actions">
          {isAdmin && (
            <button
              type="button"
              className="community-chat-widget__clear-all"
              onClick={() => void handleClearAllMessages()}
              disabled={clearingAll}
              aria-label="Clear all messages"
            >
              {clearingAll ? 'Clearing…' : 'Clear'}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="community-chat-widget__close"
              onClick={onClose}
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </header>

      <nav className="community-channels community-channels--widget" aria-label="Chat sections">
        <div className="community-channels__scroll">
          <button
            type="button"
            className={`community-channels__tab${
              showChannelChat ? ' community-channels__tab--active' : ''
            }`}
            onClick={() => setActiveView(activeChannel)}
            aria-current={showChannelChat ? 'true' : undefined}
          >
            Chat
          </button>
          <button
            type="button"
            className={`community-channels__tab${isInbox ? ' community-channels__tab--active' : ''}`}
            onClick={() => {
              setActiveView('inbox');
              setUserDmPeer(null);
            }}
            aria-current={isInbox ? 'true' : undefined}
          >
            Inbox
            <UnreadMark count={inboxUnread} />
          </button>
          <button
            type="button"
            className={`community-channels__tab${
              isAdminContact ? ' community-channels__tab--active' : ''
            }`}
            onClick={() => {
              setActiveView('admin-contact');
              setAdminThreadUserId(null);
            }}
            aria-current={isAdminContact ? 'true' : undefined}
          >
            Dickalicious
            <UnreadMark count={adminContactUnread} />
          </button>
        </div>
      </nav>

      <div className="community-chat-widget__body">
        {surfaceError && !showChannelChat && (
          <p className="community-chat-widget__error" role="alert">
            {surfaceError}
          </p>
        )}
        {isDemoUserDm && (
          <p className="community-chat-widget__notice">{DEMO_PUBLIC_PROFILE_NOTICE}</p>
        )}

        {isInbox && isUserDmInboxList && (
          <div
            ref={listRef}
            className="community-messages community-messages--widget community-messages--inbox"
            role="log"
            aria-live="polite"
          >
            <AdminConversationList
              conversations={userDmConversations.map((conv) => ({
                userId: conv.peerId,
                username: conv.username,
                lastMessageAt: conv.lastMessageAt,
                lastMessagePreview: conv.lastMessagePreview,
                unreadCount: conv.unreadCount,
              }))}
              loading={userDm.loading}
              emptyText="No private messages yet."
              onSelect={(peerId) => {
                const conv = userDmConversations.find((item) => item.peerId === peerId);
                setUserDmPeer({
                  userId: peerId,
                  username: conv?.username ?? 'User',
                });
              }}
            />
          </div>
        )}

        {isInbox && isUserDmThread && userDmPeer && (
          <>
            <div
              ref={listRef}
              className="community-messages community-messages--widget"
              role="log"
              aria-live="polite"
            >
              {userDm.loading && <p className="community-messages__status">Loading…</p>}
              {!userDm.loading && userDm.messages.length === 0 && (
                <div className="community-messages__empty">
                  <p className="community-messages__empty-text">
                    {isDemoUserDm
                      ? 'Nothing is delivered from this demo thread.'
                      : 'No messages yet.'}
                  </p>
                </div>
              )}
              {userDm.messages.map((msg, index) => {
                const isOwnMessage = msg.fromId === sessionUserId;
                const prev = userDm.messages[index - 1];
                const continued = Boolean(prev && prev.fromId === msg.fromId);
                return (
                  <ThreadLine
                    key={msg.id}
                    body={msg.body}
                    createdAt={msg.createdAt}
                    isOwn={isOwnMessage}
                    author={userDmPeer.username}
                    continued={continued}
                  />
                );
              })}
            </div>
            <ChatComposeForm
              inputId={`${idPrefix}-user-dm-input`}
              label="Send message"
              placeholder="Message"
              maxLength={USER_DM_MAX_LENGTH}
              value={draft}
              sending={userDm.sending}
              sendError={sendError}
              sendLabel="Send message"
              autoFocus={!isPage}
              onChange={setDraft}
              onSend={handleUserDmSend}
            />
          </>
        )}

        {isAdminContact && isAdminConversationList && (
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
        )}

        {isAdminContact && isAdminThread && (
          <>
            <div
              ref={listRef}
              className="community-messages community-messages--widget"
              role="log"
              aria-live="polite"
            >
              {adminDm.loading && <p className="community-messages__status">Loading…</p>}
              {!adminDm.loading && adminDm.messages.length === 0 && (
                <div className="community-messages__empty">
                  <p className="community-messages__empty-text">No messages yet.</p>
                </div>
              )}
              {adminDm.messages.map((msg, index) => {
                const fromAdmin = isAdminDirectMessageFromAdmin(msg);
                const isOwnMessage = fromAdmin === isAdmin;
                const prev = adminDm.messages[index - 1];
                const continued = Boolean(
                  prev && isAdminDirectMessageFromAdmin(prev) === fromAdmin,
                );
                return (
                  <ThreadLine
                    key={msg.id}
                    body={msg.body}
                    createdAt={msg.createdAt}
                    isOwn={isOwnMessage}
                    author={fromAdmin ? ADMIN_DM_SENDER_NAME : msg.username}
                    continued={continued}
                  />
                );
              })}
            </div>
            <ChatComposeForm
              inputId={`${idPrefix}-admin-reply-input`}
              label="Reply to member"
              placeholder="Reply"
              maxLength={maxLength}
              value={draft}
              sending={adminDm.sending}
              sendError={sendError}
              sendLabel="Reply"
              autoFocus={!isPage}
              onChange={setDraft}
              onSend={handleAdminSend}
            />
          </>
        )}

        {isAdminContact && !isAdmin && (
          <>
            <div
              ref={listRef}
              className="community-messages community-messages--widget"
              role="log"
              aria-live="polite"
            >
              {adminDm.loading && <p className="community-messages__status">Loading…</p>}
              {!adminDm.loading && adminDm.messages.length === 0 && (
                <div className="community-messages__empty">
                  <p className="community-messages__empty-text">No messages yet.</p>
                </div>
              )}
              {adminDm.messages.map((msg, index) => {
                const fromAdmin = isAdminDirectMessageFromAdmin(msg);
                const isOwnMessage = !fromAdmin;
                const prev = adminDm.messages[index - 1];
                const continued = Boolean(
                  prev && isAdminDirectMessageFromAdmin(prev) === fromAdmin,
                );
                return (
                  <ThreadLine
                    key={msg.id}
                    body={msg.body}
                    createdAt={msg.createdAt}
                    isOwn={isOwnMessage}
                    author={ADMIN_DM_SENDER_NAME}
                    continued={continued}
                  />
                );
              })}
            </div>
            <ChatComposeForm
              inputId={`${idPrefix}-admin-contact-input`}
              label="Message to admin"
              placeholder="Message"
              maxLength={maxLength}
              value={draft}
              sending={adminDm.sending}
              sendError={sendError}
              sendLabel="Send"
              autoFocus={!isPage}
              onChange={setDraft}
              onSend={handleAdminSend}
            />
          </>
        )}

        {showChannelChat && (
          <ChatConversationTab
            idPrefix={idPrefix}
            autoFocus={!isPage}
            sessionUserId={sessionUserId}
            patreonTier={patreonTier}
            patreonStatus={patreonStatus}
            isAdmin={isAdmin}
            surfaceOpen={surfaceOpen}
            activeView={activeView}
            activeChannel={activeChannel}
            unreadByView={unreadByView}
            canAccess={canAccess}
            canPost={canPost}
            lockMessage={lockMessage}
            readOnlyMessage={readOnlyMessage}
            patreonUrl={patreonUrl}
            messages={messages}
            loading={loading}
            error={error || actionError}
            sending={sending}
            draft={draft}
            sendError={sendError || null}
            onDraftChange={setDraft}
            onSend={handleChannelSend}
            onSelectChannel={(channel) => setActiveView(channel)}
            onDelete={(messageId) => {
              void removeMessage(messageId);
            }}
            onToggleHeart={(messageId, hearted) => {
              void toggleHeart(messageId, hearted);
            }}
          />
        )}
      </div>
    </section>
  );
}
