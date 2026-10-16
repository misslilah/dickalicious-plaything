import { useEffect, useRef, useState, type AnimationEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminDmToast } from './AdminDmToast';
import { CommunityChatPanel } from './CommunityChatPanel';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useCommunityChatSession } from '../contexts/CommunityChatProvider';
import { formatUnreadBadgeCount } from '../lib/communityChatUnread';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ChatLauncherIcon() {
  return (
    <svg viewBox="0 0 24 24" className="community-chat-widget__launcher-icon" aria-hidden="true">
      <path
        d="M6.5 4.75h11A2.75 2.75 0 0 1 20.25 7.5v7A2.75 2.75 0 0 1 17.5 17.25H12.2L8.1 20.2a.9.9 0 0 1-1.35-.78v-2.17H6.5A2.75 2.75 0 0 1 3.75 14.5v-7A2.75 2.75 0 0 1 6.5 4.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommunityChatBubble() {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const widgetRef = useRef<HTMLDivElement>(null);
  const {
    widgetOpen,
    setWidgetOpen,
    setActiveView,
    setAdminThreadUserId,
    totalUnread,
    adminDmToast,
    dismissAdminDmToast,
  } = useCommunityChatSession();

  const [panelMounted, setPanelMounted] = useState(widgetOpen);
  const [closing, setClosing] = useState(false);

  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;
  const showLauncherBadge = totalUnread > 0 && !widgetOpen;
  const launcherBadgeLabel = formatUnreadBadgeCount(totalUnread);
  const panelOpen = panelMounted && !closing;

  useEffect(() => {
    if (widgetOpen) {
      setPanelMounted(true);
      setClosing(false);
      return;
    }
    if (!panelMounted) return;
    if (prefersReducedMotion()) {
      setPanelMounted(false);
      setClosing(false);
      return;
    }
    setClosing(true);
  }, [widgetOpen, panelMounted]);

  useEffect(() => {
    const root = widgetRef.current;
    const viewport = window.visualViewport;
    if (!root) return;

    const syncKeyboardInset = () => {
      if (!viewport) {
        root.style.setProperty('--chat-keyboard-inset', '0px');
        return;
      }
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.style.setProperty('--chat-keyboard-inset', `${inset}px`);
    };

    syncKeyboardInset();
    viewport?.addEventListener('resize', syncKeyboardInset);
    viewport?.addEventListener('scroll', syncKeyboardInset);
    window.addEventListener('resize', syncKeyboardInset);
    return () => {
      viewport?.removeEventListener('resize', syncKeyboardInset);
      viewport?.removeEventListener('scroll', syncKeyboardInset);
      window.removeEventListener('resize', syncKeyboardInset);
    };
  }, [panelMounted]);

  useEffect(() => {
    if (!panelOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWidgetOpen(false);
    };

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (widgetRef.current?.contains(target)) return;
      if (target.closest('.flash-word-game-modal')) return;
      setWidgetOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [panelOpen, setWidgetOpen]);

  const onPanelAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!closing) return;
    setPanelMounted(false);
    setClosing(false);
  };

  const shellClassName = [
    'community-chat-widget',
    hasNav && 'community-chat-widget--with-nav',
    hasPlayer && 'community-chat-widget--with-player',
    panelOpen && 'community-chat-widget--open',
    closing && 'community-chat-widget--closing',
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
          setAdminThreadUserId(null);
          setWidgetOpen(true);
        }}
      />
      <div ref={widgetRef} className={shellClassName}>
        {panelMounted ? (
          <CommunityChatPanel
            variant="widget"
            closing={closing}
            onClose={() => setWidgetOpen(false)}
            onAnimationEnd={onPanelAnimationEnd}
          />
        ) : (
          <button
            type="button"
            className="community-chat-widget__launcher"
            onClick={() => setWidgetOpen(true)}
            aria-controls="community-chat-widget-panel"
            aria-haspopup="dialog"
            aria-expanded={false}
            aria-label={
              showLauncherBadge
                ? `Chat, ${totalUnread} unread`
                : 'Chat'
            }
          >
            <ChatLauncherIcon />
            {showLauncherBadge && (
              <span className="community-chat-widget__launcher-badge" aria-hidden="true">
                {launcherBadgeLabel}
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
}
