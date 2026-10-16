import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useAdminDirectMessages } from '../hooks/useAdminDirectMessages';
import { useCommunityChat } from '../hooks/useCommunityChat';
import {
  getUnreadCountForAdminContactTab,
  getUnreadCountForInboxTab,
  useCommunityChatUnread,
  type AdminDmToastState,
} from '../hooks/useCommunityChatUnread';
import { useUserDirectMessages } from '../hooks/useUserDirectMessages';
import {
  ADMIN_DM_MAX_LENGTH,
  buildAdminDmConversations,
  isCommunityAdmin,
  type AdminDmConversation,
} from '../lib/adminDirectMessages';
import {
  canAccessCommunityChannel,
  canPostCommunityChannel,
  getCommunityChannelLockMessage,
  getCommunityChannelReadOnlyMessage,
  type CommunityChannel,
} from '../lib/communityChannels';
import {
  COMMUNITY_MESSAGE_MAX_LENGTH,
  type CommunityMessage,
} from '../lib/communityChat';
import { getPatreonPageUrl } from '../lib/patreon';
import type { PatreonMemberTier, PatreonStatus } from '../types';
import {
  OPEN_USER_DM_EVENT,
  buildUserDmConversations,
  type OpenUserDmDetail,
  type UserDmConversation,
} from '../lib/userDirectMessages';

export type CommunityView = CommunityChannel | 'admin-contact' | 'inbox';

export type CommunityUserDmPeer = {
  userId: string;
  username: string;
};

type CommunityChatContextValue = {
  sessionUserId: string | undefined;
  patreonTier: PatreonMemberTier | null | undefined;
  patreonStatus: PatreonStatus | null | undefined;
  isAdmin: boolean;
  widgetOpen: boolean;
  setWidgetOpen: Dispatch<SetStateAction<boolean>>;
  surfaceOpen: boolean;
  activeView: CommunityView;
  setActiveView: Dispatch<SetStateAction<CommunityView>>;
  adminThreadUserId: string | null;
  setAdminThreadUserId: Dispatch<SetStateAction<string | null>>;
  userDmPeer: CommunityUserDmPeer | null;
  setUserDmPeer: Dispatch<SetStateAction<CommunityUserDmPeer | null>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  sendError: string;
  clearingAll: boolean;
  activeChannel: CommunityChannel;
  isAdminContact: boolean;
  isInbox: boolean;
  isAdminThread: boolean;
  isAdminConversationList: boolean;
  isUserDmThread: boolean;
  isUserDmInboxList: boolean;
  canAccess: boolean;
  canPost: boolean;
  readOnlyMessage: string;
  lockMessage: string;
  patreonUrl: string;
  showChannelChat: boolean;
  maxLength: number;
  messages: CommunityMessage[];
  loading: boolean;
  error: string;
  actionError: string;
  sending: boolean;
  removeMessage: (messageId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  toggleHeart: (
    messageId: string,
    hearted: boolean,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  adminDm: ReturnType<typeof useAdminDirectMessages>;
  adminConversations: AdminDmConversation[];
  adminThreadUsername: string | null;
  userDm: ReturnType<typeof useUserDirectMessages>;
  userDmConversations: UserDmConversation[];
  unreadByView: ReturnType<typeof useCommunityChatUnread>['unreadByView'];
  totalUnread: number;
  adminDmToast: AdminDmToastState;
  dismissAdminDmToast: () => void;
  inboxUnread: number;
  adminContactUnread: number;
  handleChannelSend: () => Promise<void>;
  handleAdminSend: () => Promise<void>;
  handleUserDmSend: () => Promise<void>;
  handleClearAllMessages: () => Promise<void>;
};

const CommunityChatContext = createContext<CommunityChatContextValue | null>(null);

export function isChannelView(view: CommunityView): view is CommunityChannel {
  return view !== 'admin-contact' && view !== 'inbox';
}

export function CommunityChatProvider({ children }: { children: ReactNode }) {
  const { session, effectiveSession, adminUserPreview } = useAppStore();
  const { pathname } = useLocation();
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [activeView, setActiveView] = useState<CommunityView>('global');
  const [adminThreadUserId, setAdminThreadUserId] = useState<string | null>(null);
  const [userDmPeer, setUserDmPeer] = useState<CommunityUserDmPeer | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [clearingAll, setClearingAll] = useState(false);

  const isCommunityPage = pathname === '/community';
  const surfaceOpen = widgetOpen || isCommunityPage;
  const isAdmin = isCommunityAdmin(session, adminUserPreview);
  const activeChannel = isChannelView(activeView) ? activeView : 'global';
  const isAdminContact = activeView === 'admin-contact';
  const isInbox = activeView === 'inbox';
  const isAdminThread = isAdmin && isAdminContact && adminThreadUserId != null;
  const isAdminConversationList = isAdmin && isAdminContact && adminThreadUserId == null;
  const isUserDmThread = isInbox && userDmPeer != null;
  const isUserDmInboxList = isInbox && userDmPeer == null;

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
    surfaceOpen;
  const readOnlyMessage = getCommunityChannelReadOnlyMessage(activeChannel);

  const {
    messages,
    loading,
    error,
    actionError,
    sending,
    send,
    removeMessage,
    clearAllMessages,
    toggleHeart,
  } = useCommunityChat({
    channel: activeChannel,
    userId: session?.userId,
    username: session?.username,
    canPost,
    isAdmin,
  });

  const adminDmMode = isAdmin ? (isAdminThread ? 'thread' : 'inbox') : 'own';

  const adminDm = useAdminDirectMessages({
    mode: adminDmMode,
    userId: session?.userId,
    username: session?.username,
    threadUserId: adminThreadUserId ?? undefined,
    enabled: surfaceOpen && isAdminContact,
    markReadOnThread: isAdminThread && surfaceOpen,
  });

  const adminConversations = useMemo(
    () => buildAdminDmConversations(adminDm.messages),
    [adminDm.messages],
  );

  const adminThreadUsername =
    adminConversations.find((conv) => conv.userId === adminThreadUserId)?.username ??
    adminDm.messages.find((msg) => !msg.fromAdmin)?.username ??
    null;

  const userDm = useUserDirectMessages({
    mode: isUserDmThread ? 'thread' : 'inbox',
    userId: session?.userId,
    peerId: userDmPeer?.userId,
    enabled: surfaceOpen && isInbox,
    markReadOnThread: isUserDmThread && surfaceOpen,
  });

  const userDmConversations = useMemo(
    () =>
      session?.userId
        ? buildUserDmConversations(userDm.messages, session.userId, userDm.usernames)
        : [],
    [session?.userId, userDm.messages, userDm.usernames],
  );

  const { unreadByView, totalUnread, adminDmToast, dismissAdminDmToast } = useCommunityChatUnread({
    userId: session?.userId,
    isAdmin,
    open: surfaceOpen,
    activeView,
    adminThreadUserId,
    userDmPeerId: userDmPeer?.userId ?? null,
  });

  useEffect(() => {
    setDraft('');
    setSendError('');
  }, [activeView, adminThreadUserId, userDmPeer?.userId]);

  useEffect(() => {
    if (activeView !== 'admin-contact') {
      setAdminThreadUserId(null);
    }
    if (activeView !== 'inbox') {
      setUserDmPeer(null);
    }
  }, [activeView]);

  useEffect(() => {
    if (isCommunityPage) setWidgetOpen(false);
  }, [isCommunityPage]);

  useEffect(() => {
    const onOpenUserDm = (event: Event) => {
      const detail = (event as CustomEvent<OpenUserDmDetail>).detail;
      if (!detail?.userId) return;
      setActiveView('inbox');
      setUserDmPeer({
        userId: detail.userId,
        username: detail.username || 'User',
      });
      setWidgetOpen(true);
    };
    window.addEventListener(OPEN_USER_DM_EVENT, onOpenUserDm);
    return () => window.removeEventListener(OPEN_USER_DM_EVENT, onOpenUserDm);
  }, []);

  const handleChannelSend = useCallback(async () => {
    setSendError('');
    const result = await send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  }, [draft, send]);

  const handleAdminSend = useCallback(async () => {
    setSendError('');
    const result = await adminDm.send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  }, [adminDm, draft]);

  const handleUserDmSend = useCallback(async () => {
    setSendError('');
    const result = await userDm.send(draft);
    if (result.ok) {
      setDraft('');
      return;
    }
    setSendError(result.error);
  }, [draft, userDm]);

  const handleClearAllMessages = useCallback(async () => {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      'Delete every community chat message? This cannot be undone.',
    );
    if (!confirmed) return;

    setSendError('');
    setClearingAll(true);
    const result = await clearAllMessages();
    setClearingAll(false);
    if (!result.ok) {
      setSendError(result.error);
    }
  }, [clearAllMessages, isAdmin]);

  const lockMessage = getCommunityChannelLockMessage(activeChannel);
  const patreonUrl = getPatreonPageUrl();
  const showChannelChat = isChannelView(activeView);
  const maxLength =
    isAdminContact || isInbox ? ADMIN_DM_MAX_LENGTH : COMMUNITY_MESSAGE_MAX_LENGTH;
  const inboxUnread = getUnreadCountForInboxTab(
    unreadByView,
    activeView,
    surfaceOpen,
    isUserDmThread,
  );
  const adminContactUnread = getUnreadCountForAdminContactTab(
    unreadByView,
    activeView,
    surfaceOpen,
    isAdmin,
  );

  const value = useMemo<CommunityChatContextValue>(
    () => ({
      sessionUserId: session?.userId,
      patreonTier: effectiveSession?.patreonTier,
      patreonStatus: effectiveSession?.patreonStatus,
      isAdmin,
      widgetOpen,
      setWidgetOpen,
      surfaceOpen,
      activeView,
      setActiveView,
      adminThreadUserId,
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
      isUserDmInboxList,
      isUserDmThread,
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
      totalUnread,
      adminDmToast,
      dismissAdminDmToast,
      inboxUnread,
      adminContactUnread,
      handleChannelSend,
      handleAdminSend,
      handleUserDmSend,
      handleClearAllMessages,
    }),
    [
      actionError,
      activeChannel,
      activeView,
      adminContactUnread,
      adminConversations,
      adminDm,
      adminDmToast,
      adminThreadUserId,
      adminThreadUsername,
      canAccess,
      canPost,
      clearingAll,
      dismissAdminDmToast,
      draft,
      effectiveSession?.patreonStatus,
      effectiveSession?.patreonTier,
      error,
      handleAdminSend,
      handleChannelSend,
      handleClearAllMessages,
      handleUserDmSend,
      inboxUnread,
      isAdmin,
      isAdminContact,
      isAdminConversationList,
      isAdminThread,
      isInbox,
      isUserDmInboxList,
      isUserDmThread,
      loading,
      lockMessage,
      maxLength,
      messages,
      patreonUrl,
      readOnlyMessage,
      removeMessage,
      sendError,
      sending,
      session?.userId,
      showChannelChat,
      surfaceOpen,
      toggleHeart,
      totalUnread,
      unreadByView,
      userDm,
      userDmConversations,
      userDmPeer,
      widgetOpen,
    ],
  );

  return (
    <CommunityChatContext.Provider value={value}>{children}</CommunityChatContext.Provider>
  );
}

export function useCommunityChatSession() {
  const value = useContext(CommunityChatContext);
  if (!value) {
    throw new Error('useCommunityChatSession must be used within CommunityChatProvider');
  }
  return value;
}
