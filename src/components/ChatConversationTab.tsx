import { useEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useOnlinePresence } from '../hooks/useOnlinePresence';
import { getUnreadCountForChannelTab } from '../hooks/useCommunityChatUnread';
import {
  COMMUNITY_CHANNELS,
  canAccessCommunityChannel,
  type CommunityChannel,
} from '../lib/communityChannels';
import { COMMUNITY_MESSAGE_MAX_LENGTH, type CommunityMessage } from '../lib/communityChat';
import type { CommunityUnreadView } from '../lib/communityChatUnread';
import type { CommunityView } from '../contexts/CommunityChatProvider';
import type { PatreonMemberTier, PatreonStatus } from '../types';

const GROUP_MS = 5 * 60 * 1000;

function dayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dayKeyFromDate(date);
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (dayKey(iso) === dayKeyFromDate(today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKeyFromDate(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sameGroup(a: CommunityMessage, b: CommunityMessage): boolean {
  return (
    a.userId === b.userId &&
    Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < GROUP_MS
  );
}

function roomBlurb(channel: CommunityChannel): string {
  if (channel === 'announcements') return 'From Dickalicious';
  if (channel === 'global') return 'Open to everyone';
  const meta = COMMUNITY_CHANNELS.find((item) => item.id === channel);
  return meta?.minTierLabel ? `${meta.minTierLabel} and up` : '';
}

type ThreadEntry =
  | { kind: 'day'; id: string; label: string }
  | {
      kind: 'line';
      id: string;
      msg: CommunityMessage;
      own: boolean;
      lead: boolean;
      tail: boolean;
    };

function buildThread(messages: CommunityMessage[], sessionUserId: string | undefined): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  let lastDay = '';
  messages.forEach((msg, index) => {
    const day = dayKey(msg.createdAt);
    if (day && day !== lastDay) {
      entries.push({ kind: 'day', id: `day-${day}`, label: formatDay(msg.createdAt) });
      lastDay = day;
    }
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const lead = !(prev && dayKey(prev.createdAt) === day && sameGroup(prev, msg));
    const tail = !(next && dayKey(next.createdAt) === day && sameGroup(msg, next));
    entries.push({
      kind: 'line',
      id: msg.id,
      msg,
      own: msg.userId === sessionUserId,
      lead,
      tail,
    });
  });
  return entries;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="chat-tab__send-icon" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatComposer({
  inputId,
  value,
  sending,
  maxLength,
  placeholder,
  autoFocus,
  error,
  onChange,
  onSend,
}: {
  inputId: string;
  value: string;
  sending: boolean;
  maxLength: number;
  placeholder: string;
  autoFocus: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = !sending && Boolean(value.trim());

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => ref.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [autoFocus, inputId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    void onSend();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submit();
  };

  return (
    <form className="chat-tab__composer" onSubmit={submit} aria-busy={sending || undefined}>
      <label className="sr-only" htmlFor={inputId}>
        Message
      </label>
      <p id={`${inputId}-hint`} className="sr-only">
        Enter to send. Shift plus Enter for a new line.
      </p>
      <div className="chat-tab__composer-bar">
        <textarea
          ref={ref}
          id={inputId}
          className="chat-tab__input"
          rows={1}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-hint`}
        />
        <button
          type="submit"
          className="chat-tab__send"
          disabled={!ready}
          aria-label={sending ? 'Sending' : 'Send'}
        >
          {sending ? '…' : <SendIcon />}
        </button>
      </div>
      {error && (
        <p className="chat-tab__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ChatConversationTab({
  idPrefix,
  autoFocus,
  sessionUserId,
  patreonTier,
  patreonStatus,
  isAdmin,
  surfaceOpen,
  activeView,
  activeChannel,
  unreadByView,
  canAccess,
  canPost,
  lockMessage,
  readOnlyMessage,
  patreonUrl,
  messages,
  loading,
  error,
  sending,
  draft,
  sendError,
  onDraftChange,
  onSend,
  onSelectChannel,
  onDelete,
  onToggleHeart,
}: {
  idPrefix: string;
  autoFocus: boolean;
  sessionUserId: string | undefined;
  patreonTier: PatreonMemberTier | null | undefined;
  patreonStatus: PatreonStatus | null | undefined;
  isAdmin: boolean;
  surfaceOpen: boolean;
  activeView: CommunityView;
  activeChannel: CommunityChannel;
  unreadByView: Record<CommunityUnreadView, number>;
  canAccess: boolean;
  canPost: boolean;
  lockMessage: string;
  readOnlyMessage: string;
  patreonUrl: string;
  messages: CommunityMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  draft: string;
  sendError: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onSelectChannel: (channel: CommunityChannel) => void;
  onDelete: (messageId: string) => void;
  onToggleHeart: (messageId: string, hearted: boolean) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const presence = useOnlinePresence(undefined, undefined);
  const onlineCount = presence.onlineUsers.length;
  const channelMeta = COMMUNITY_CHANNELS.find((channel) => channel.id === activeChannel);
  const thread = useMemo(
    () => buildThread(messages, sessionUserId),
    [messages, sessionUserId],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, loading, activeChannel]);

  const subtitle = onlineCount > 0 ? `${onlineCount} online` : roomBlurb(activeChannel);

  return (
    <div className="chat-tab">
      <header className="chat-tab__header">
        <div className="chat-tab__heading">
          <h3 className="chat-tab__room">{channelMeta?.label ?? 'Chat'}</h3>
          {subtitle && <p className="chat-tab__sub">{subtitle}</p>}
        </div>
      </header>

      <nav className="chat-tab__rooms" aria-label="Chat rooms">
        {COMMUNITY_CHANNELS.map((channel) => {
          const accessible = canAccessCommunityChannel(
            channel.id,
            patreonTier,
            patreonStatus,
            isAdmin,
          );
          const unread = getUnreadCountForChannelTab(
            unreadByView,
            channel.id,
            activeView,
            surfaceOpen,
          );
          const selected = activeView === channel.id;
          return (
            <button
              key={channel.id}
              type="button"
              className={`chat-tab__room-btn${selected ? ' chat-tab__room-btn--on' : ''}${
                !accessible ? ' chat-tab__room-btn--locked' : ''
              }`}
              onClick={() => onSelectChannel(channel.id)}
              aria-current={selected ? 'true' : undefined}
            >
              {channel.label}
              {unread > 0 && (
                <span className="chat-tab__unread" aria-label={`${unread} unread`}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {error && (
        <p className="chat-tab__error" role="alert">
          {error}
        </p>
      )}

      {!canAccess ? (
        <div className="chat-tab__state" aria-live="polite">
          <p className="chat-tab__state-title">This room is locked</p>
          <p className="chat-tab__state-copy">{lockMessage}</p>
          <div className="chat-tab__state-links">
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>
            <Link to="/settings">Settings</Link>
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          className="chat-tab__thread"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={`${channelMeta?.label ?? 'Chat'} messages`}
        >
          {loading && (
            <div className="chat-tab__state">
              <p className="chat-tab__state-copy">Loading…</p>
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="chat-tab__state">
              <p className="chat-tab__state-title">
                {activeChannel === 'announcements' ? 'No announcements' : 'No messages yet'}
              </p>
              <p className="chat-tab__state-copy">
                {activeChannel === 'announcements'
                  ? 'New posts from Dickalicious will show up here.'
                  : 'Be the first to say something.'}
              </p>
            </div>
          )}
          {thread.map((entry) => {
            if (entry.kind === 'day') {
              return (
                <div key={entry.id} className="chat-tab__day">
                  <span>{entry.label}</span>
                </div>
              );
            }
            const { msg, own, lead, tail } = entry;
            return (
              <article
                key={msg.id}
                className={`chat-tab__line${own ? ' chat-tab__line--own' : ''}${
                  lead ? ' chat-tab__line--lead' : ''
                }${tail ? ' chat-tab__line--tail' : ''}`}
              >
                {!own && lead && (
                  <Link to={`/profile/${msg.userId}`} className="chat-tab__author">
                    {msg.username}
                  </Link>
                )}
                <div className="chat-tab__bubble">
                  <p className="chat-tab__body">{msg.body}</p>
                </div>
                {tail && (
                  <time className="chat-tab__time" dateTime={msg.createdAt}>
                    {formatTime(msg.createdAt)}
                  </time>
                )}
                {(msg.heartCount > 0 || isAdmin) && (
                  <div className="chat-tab__actions">
                    {msg.heartCount > 0 && (
                      <span aria-label={`${msg.heartCount} hearts`}>{msg.heartCount}</span>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleHeart(msg.id, msg.hearted)}
                          aria-label={msg.hearted ? 'Remove heart' : 'Heart message'}
                        >
                          {msg.hearted ? 'Unheart' : 'Heart'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(msg.id)}
                          aria-label="Delete message"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {canAccess && canPost && (
        <ChatComposer
          inputId={`${idPrefix}-chat-tab-input`}
          value={draft}
          sending={sending}
          maxLength={COMMUNITY_MESSAGE_MAX_LENGTH}
          placeholder={activeChannel === 'announcements' ? 'Write an announcement' : 'Message'}
          autoFocus={autoFocus}
          error={sendError}
          onChange={onDraftChange}
          onSend={onSend}
        />
      )}
      {canAccess && !canPost && readOnlyMessage && (
        <p className="chat-tab__readonly">{readOnlyMessage}</p>
      )}
    </div>
  );
}
