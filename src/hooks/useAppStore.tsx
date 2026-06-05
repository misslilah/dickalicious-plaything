import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppState,
  Badge,
  Category,
  PunishmentCategory,
  PunishmentTemplate,
  Reward,
  Session,
  Task,
  UserRole,
  Video,
  VideoCategory,
} from '../types';
import {
  deleteBadgeDb,
  fetchUserBadgeIds,
  updateBadgesOrder,
  upsertBadge,
} from '../lib/badgeDb';
import {
  processBadgeUnlockOnBubblePop,
  processBadgeUnlockOnTaskComplete,
  processBadgeUnlockOnTimeAccumulated,
} from '../lib/badgeUnlockService';
import { incrementUserBubblePopCount } from '../lib/bubblePopDb';
import {
  deleteCategoryDb,
  deletePunishmentCategoryDb,
  deletePunishmentTemplateDb,
  deleteRewardDb,
  deleteTaskDb,
  deleteVideoCategoryDb,
  deleteVideoDb,
  fetchSharedCatalog,
  insertVideoRow,
  updateVideoRow,
  updateVideoDuration,
  type SharedCatalog,
  upsertCategory,
  upsertPunishmentCategory,
  upsertPunishmentTemplate,
  upsertReward,
  upsertTask,
  updateVideoCategoriesOrder,
  upsertVideoCategory,
} from '../lib/catalogDb';
import {
  changePassword,
  createUser,
  getCurrentSession,
  login as authLogin,
  logout as authLogout,
  onAuthStateChange,
  sessionToApp,
  signUp as authSignUp,
} from '../lib/auth';
import { updateProfileLastSeen } from '../lib/profileDb';
import { useOnlinePresence } from './useOnlinePresence';
import {
  fetchCategoryMembers,
  joinCategoryDb,
  leaveCategoryDb,
  syncCategoryProgressDb,
} from '../lib/categoryMembersDb';
import { canJoinCategory } from '../lib/categoryProgression';
import {
  acceptPunishment,
  addVideoXp,
  applyTaskMalus,
  closeDay,
  completeTask,
  dismissPunishment,
  ensureDailyPlan,
  markTaskStarted,
  processDayRollover,
  purchaseReward,
  uncompleteTask,
} from '../lib/gameLogic';
import {
  readBubblesEnabledFromStorage,
  writeBubblesEnabledToStorage,
} from '../lib/appSettings';
import { createInitialState } from '../lib/seed';
import { isSupabaseConfigured, SUPABASE_SETUP_HINT } from '../lib/supabase';
import { fetchUserProgress, saveUserProgress } from '../lib/userProgressDb';
import {
  tryRecordVideoCompletion,
  tryRecordVideoPartialView,
} from '../lib/videoCompletionDb';
import {
  fetchPurchasedVideoIds,
  purchaseVideoDb,
} from '../lib/videoPurchaseDb';
import {
  deleteVideoFile,
  formatVideoSizeError,
  MAX_VIDEO_BYTES,
  uploadVideoFile,
  videoStoragePath,
} from '../lib/videoStorage';

type MutateResult = { ok: true } | { ok: false; error: string };

interface AppStoreValue {
  state: AppState;
  session: Session | null;
  authReady: boolean;
  dataLoading: boolean;
  dataError: string | null;
  supabaseConfigured: boolean;
  lastSaveError: string | null;
  refresh: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  refreshPatreonProfile: () => Promise<void>;
  login: (
    emailOrUsername: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (
    email: string,
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (
    newPassword: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  createAppUser: (
    username: string,
    password: string,
    role: UserRole,
  ) => Promise<MutateResult>;
  completeTask: (taskId: string) => void;
  recordBadgeTaskTime: (taskId: string, seconds: number) => void;
  /** Hidden counter: soap bubble popped (logged-in users only). */
  recordSoapBubblePop: () => void;
  uncompleteTask: (taskId: string) => void;
  markTaskStarted: (taskId: string) => void;
  closeDay: () => void;
  purchaseReward: (rewardId: string) => void;
  purchaseVideo: (
    videoId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  acceptPunishment: (templateId: string) => void;
  applyTaskMalus: (taskId: string) => void;
  dismissPunishment: (id: string) => void;
  /** Awards XP once per user per video after a full watch. Returns XP granted, or 0. */
  awardVideoCompletion: (videoId: string) => Promise<number>;
  /** Logs a partial view once per user per video per day (deduped server-side). */
  recordVideoPartialView: (
    videoId: string,
    watchPercent: number | null,
  ) => Promise<void>;
  /** Adds XP immediately (e.g. mini-game streak rewards). */
  awardBonusXp: (amount: number) => void;
  joinCategory: (categoryId: string) => Promise<MutateResult>;
  leaveCategory: (categoryId: string) => Promise<MutateResult>;
  updateSettings: (partial: Partial<AppState['settings']>) => void;
  updateCategory: (category: Category) => Promise<MutateResult>;
  addCategory: (category: Category) => Promise<MutateResult>;
  deleteCategory: (id: string) => Promise<MutateResult>;
  updateTask: (task: Task) => Promise<MutateResult>;
  addTask: (task: Task) => Promise<MutateResult>;
  deleteTask: (id: string) => Promise<MutateResult>;
  addReward: (reward: Reward) => Promise<MutateResult>;
  updateReward: (reward: Reward) => Promise<MutateResult>;
  deleteReward: (id: string) => Promise<MutateResult>;
  addBadge: (badge: Badge) => Promise<MutateResult>;
  updateBadge: (badge: Badge) => Promise<MutateResult>;
  reorderBadges: (orderedIds: string[]) => Promise<MutateResult>;
  deleteBadge: (id: string) => Promise<MutateResult>;
  addPunishmentCategory: (category: PunishmentCategory) => Promise<MutateResult>;
  updatePunishmentCategory: (category: PunishmentCategory) => Promise<MutateResult>;
  deletePunishmentCategory: (id: string) => Promise<MutateResult>;
  addPunishmentTemplate: (template: PunishmentTemplate) => Promise<MutateResult>;
  updatePunishmentTemplate: (template: PunishmentTemplate) => Promise<MutateResult>;
  deletePunishmentTemplate: (id: string) => Promise<MutateResult>;
  addVideoCategory: (category: VideoCategory) => Promise<MutateResult>;
  updateVideoCategory: (category: VideoCategory) => Promise<MutateResult>;
  reorderVideoCategories: (orderedIds: string[]) => Promise<MutateResult>;
  deleteVideoCategory: (id: string) => Promise<MutateResult>;
  addVideo: (
    video: Video,
    file: Blob,
    fileName: string,
    onUploadProgress?: (percent: number) => void,
  ) => Promise<MutateResult>;
  updateVideo: (video: Video) => Promise<MutateResult>;
  patchVideoDuration: (id: string, durationSeconds: number) => Promise<MutateResult>;
  deleteVideo: (id: string) => Promise<MutateResult>;
  resetAll: () => Promise<MutateResult>;
  clearSaveError: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function mergeCatalogIntoState(base: AppState, catalog: SharedCatalog): AppState {
  return {
    ...base,
    categories: catalog.categories,
    tasks: catalog.tasks,
    rewards: catalog.rewards,
    badges: catalog.badges,
    punishmentCategories: catalog.punishmentCategories,
    punishmentTemplates: catalog.punishmentTemplates,
    videoCategories: catalog.videoCategories,
    videoCategoryCounts: catalog.videoCategoryCounts,
    videos: catalog.videos,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const base = createInitialState();
    const stored = readBubblesEnabledFromStorage();
    if (stored === null) return base;
    return { ...base, settings: { ...base.settings, bubblesEnabled: stored } };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const persistUserProgress = useCallback(async (next: AppState) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const result = await saveUserProgress(userId, next);
    if (!result.ok) setLastSaveError(result.error);
  }, []);

  const applyUserState = useCallback(
    (next: AppState) => {
      setState(next);
      void persistUserProgress(next);
    },
    [persistUserProgress],
  );

  const applyUnlockedBadges = useCallback((badgeIds: string[]) => {
    if (badgeIds.length === 0) return;
    setState((s) => {
      const merged = new Set([...s.unlockedBadgeIds, ...badgeIds]);
      return { ...s, unlockedBadgeIds: [...merged] };
    });
  }, []);

  const runBadgeUnlockOnComplete = useCallback(
    async (userId: string, next: AppState, taskId: string) => {
      const result = await processBadgeUnlockOnTaskComplete(userId, next, taskId);
      if (result.ok) applyUnlockedBadges(result.newlyUnlocked);
      else setLastSaveError(result.error);
    },
    [applyUnlockedBadges],
  );

  const runBadgeUnlockOnTime = useCallback(
    async (userId: string, snapshot: AppState, taskId: string, seconds: number) => {
      const result = await processBadgeUnlockOnTimeAccumulated(
        userId,
        snapshot,
        taskId,
        seconds,
      );
      if (result.ok) applyUnlockedBadges(result.newlyUnlocked);
      else setLastSaveError(result.error);
    },
    [applyUnlockedBadges],
  );

  const runBadgeUnlockOnBubblePop = useCallback(
    async (userId: string, snapshot: AppState, popCount: number) => {
      const result = await processBadgeUnlockOnBubblePop(userId, snapshot, popCount);
      if (result.ok) applyUnlockedBadges(result.newlyUnlocked);
      else setLastSaveError(result.error);
    },
    [applyUnlockedBadges],
  );

  const loadAllData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setDataError(null);

    try {
      const [catalogResult, progressResult, membersResult, badgesResult, purchasedResult] =
        await Promise.all([
          fetchSharedCatalog(),
          fetchUserProgress(userId),
          fetchCategoryMembers(userId),
          fetchUserBadgeIds(userId),
          fetchPurchasedVideoIds(userId),
        ]);

      if (!catalogResult.ok) {
        setDataError(catalogResult.error);
        return;
      }
      if (!progressResult.ok) {
        setDataError(progressResult.error);
        return;
      }
      if (!membersResult.ok) {
        setDataError(membersResult.error);
        return;
      }
      if (!badgesResult.ok) {
        setDataError(badgesResult.error);
        return;
      }
      if (!purchasedResult.ok) {
        setDataError(purchasedResult.error);
        return;
      }

      let merged = mergeCatalogIntoState(progressResult.state, catalogResult.catalog);
      merged = {
        ...merged,
        joinedCategoryIds: membersResult.categoryIds,
        categoryMemberProgress: membersResult.progress,
        unlockedBadgeIds: badgesResult.badgeIds,
        purchasedVideoIds: purchasedResult.videoIds,
      };
      merged = processDayRollover(merged, userId);
      merged = ensureDailyPlan(merged, undefined, userId);
      setState(merged);
      void persistUserProgress(merged);
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : 'Failed to load app data from Supabase.',
      );
    } finally {
      setDataLoading(false);
    }
  }, [persistUserProgress]);

  useEffect(() => {
    void (async () => {
      try {
        if (!isSupabaseConfigured()) {
          setAuthReady(true);
          return;
        }
        const current = await getCurrentSession();
        if (current) {
          userIdRef.current = current.userId;
          setSession(sessionToApp(current));
          await loadAllData(current.userId);
        }
      } catch (err) {
        setDataError(
          err instanceof Error ? err.message : 'Failed to initialize the app.',
        );
      } finally {
        setAuthReady(true);
      }
    })();

    const unsub = onAuthStateChange((authSession) => {
      if (!authSession) {
        userIdRef.current = null;
        setSession(null);
        setState(createInitialState());
        return;
      }
      const priorUserId = userIdRef.current;
      userIdRef.current = authSession.userId;
      setSession(sessionToApp(authSession));
      // Token refresh / duplicate auth events must not remount the app (e.g. fullscreen).
      if (priorUserId !== authSession.userId) {
        void loadAllData(authSession.userId);
      }
    });

    return () => unsub?.();
  }, [loadAllData]);

  const refresh = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    await loadAllData(userId);
  }, [loadAllData]);

  const refreshCatalog = useCallback(async () => {
    const catalogResult = await fetchSharedCatalog();
    if (catalogResult.ok) {
      setState((s) =>
        ensureDailyPlan(
          mergeCatalogIntoState(s, catalogResult.catalog),
          undefined,
          userIdRef.current,
        ),
      );
    }
  }, []);

  const refreshPatreonProfile = useCallback(async () => {
    const current = await getCurrentSession();
    if (current) {
      setSession(sessionToApp(current));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const current = await getCurrentSession();
    if (current) {
      setSession(sessionToApp(current));
    }
  }, []);

  useOnlinePresence(session?.userId, session?.username);

  useEffect(() => {
    const userId = session?.userId;
    if (!userId || !isSupabaseConfigured()) return;
    void updateProfileLastSeen(userId);
  }, [session?.userId]);

  const requireAdmin = useCallback((): MutateResult | null => {
    if (session?.role !== 'admin') {
      return { ok: false, error: 'Admin access required.' };
    }
    return null;
  }, [session?.role]);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      session,
      authReady,
      dataLoading,
      dataError,
      supabaseConfigured: isSupabaseConfigured(),
      lastSaveError,
      refresh,
      refreshCatalog,
      refreshPatreonProfile,
      refreshProfile,
      clearSaveError: () => setLastSaveError(null),
      login: async (emailOrUsername, password) => {
        const result = await authLogin(emailOrUsername, password);
        if (!result.ok) return result;
        userIdRef.current = result.session.userId;
        setSession(sessionToApp(result.session));
        await loadAllData(result.session.userId);
        return { ok: true };
      },
      signUp: async (email, username, password) => {
        const result = await authSignUp(email, username, password);
        if (!result.ok) return result;
        userIdRef.current = result.session.userId;
        setSession(sessionToApp(result.session));
        await loadAllData(result.session.userId);
        return { ok: true };
      },
      logout: async () => {
        await authLogout();
        userIdRef.current = null;
        setSession(null);
        setState(createInitialState());
      },
      changePassword: async (newPassword) => changePassword(newPassword),
      createAppUser: async (username, password, role) => {
        const denied = requireAdmin();
        if (denied) return denied;
        return createUser(username, password, role);
      },
      completeTask: (taskId) => {
        const task = state.tasks.find((t) => t.id === taskId);
        const next = completeTask(state, taskId, session?.userId ?? null);
        applyUserState(next);
        const userId = userIdRef.current;
        const categoryId = task?.categoryId;
        if (
          userId &&
          categoryId &&
          (task?.taskScope ?? 'category') === 'category' &&
          next.joinedCategoryIds.includes(categoryId)
        ) {
          void syncCategoryProgressDb(userId, categoryId, next).then((result) => {
            if (!result.ok) return;
            setState((s) => ({
              ...s,
              categoryMemberProgress: [
                ...s.categoryMemberProgress.filter(
                  (p) => p.categoryId !== categoryId,
                ),
                result.progress,
              ],
            }));
          });
        }
        if (userId) {
          void runBadgeUnlockOnComplete(userId, next, taskId);
        }
      },
      recordBadgeTaskTime: (taskId, seconds) => {
        const userId = userIdRef.current;
        if (!userId || seconds <= 0) return;
        void runBadgeUnlockOnTime(userId, state, taskId, seconds);
      },
      recordSoapBubblePop: () => {
        const userId = userIdRef.current;
        if (!userId || !isSupabaseConfigured()) return;
        void incrementUserBubblePopCount().then((result) => {
          if (!result.ok) return;
          void runBadgeUnlockOnBubblePop(userId, state, result.popCount);
        });
      },
      uncompleteTask: (taskId) => applyUserState(uncompleteTask(state, taskId)),
      markTaskStarted: (taskId) =>
        applyUserState(markTaskStarted(state, taskId)),
      closeDay: () => applyUserState(closeDay(state, session?.userId ?? null)),
      purchaseReward: (rewardId) => applyUserState(purchaseReward(state, rewardId)),
      purchaseVideo: async (videoId) => {
        const userId = userIdRef.current;
        if (!userId) return { ok: false, error: 'Not signed in.' };
        const result = await purchaseVideoDb(videoId);
        if (!result.ok) return result;
        const next: AppState = {
          ...state,
          progress: {
            ...state.progress,
            points: result.pointsRemaining,
          },
          purchasedVideoIds: state.purchasedVideoIds.includes(videoId)
            ? state.purchasedVideoIds
            : [...state.purchasedVideoIds, videoId],
        };
        applyUserState(next);
        return { ok: true };
      },
      acceptPunishment: (templateId) =>
        applyUserState(acceptPunishment(state, templateId)),
      applyTaskMalus: (taskId) => applyUserState(applyTaskMalus(state, taskId)),
      dismissPunishment: (id) => applyUserState(dismissPunishment(state, id)),
      awardVideoCompletion: async (videoId) => {
        const userId = userIdRef.current;
        if (!userId) return 0;
        const video = state.videos.find((v) => v.id === videoId);
        if (!video) return 0;
        const xpReward = video.xpReward ?? 0;
        const result = await tryRecordVideoCompletion(userId, videoId, xpReward);
        if (!result.ok) {
          setLastSaveError(result.error);
          return 0;
        }
        if (!result.awarded || result.xp <= 0) return 0;
        applyUserState(addVideoXp(state, result.xp));
        return result.xp;
      },
      recordVideoPartialView: async (videoId, watchPercent) => {
        const userId = userIdRef.current;
        if (!userId) return;
        const video = state.videos.find((v) => v.id === videoId);
        if (!video) return;
        await tryRecordVideoPartialView(videoId, watchPercent);
      },
      awardBonusXp: (amount) => {
        if (amount <= 0) return;
        applyUserState(addVideoXp(state, amount));
      },
      joinCategory: async (categoryId) => {
        const userId = userIdRef.current;
        if (!userId) return { ok: false, error: 'Not signed in.' };
        const category = state.categories.find((c) => c.id === categoryId);
        if (!category) return { ok: false, error: 'Category not found.' };
        const gate = canJoinCategory(
          state,
          category,
          state.progress.currentLevel,
        );
        if (!gate.ok) return { ok: false, error: gate.reason };
        const result = await joinCategoryDb(userId, categoryId);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          joinedCategoryIds: s.joinedCategoryIds.includes(categoryId)
            ? s.joinedCategoryIds
            : [...s.joinedCategoryIds, categoryId],
          categoryMemberProgress: [
            ...s.categoryMemberProgress.filter((p) => p.categoryId !== categoryId),
            {
              categoryId,
              tasksCompletedCount: 0,
              markedCompleteAt: null,
            },
          ],
        }));
        return { ok: true };
      },
      leaveCategory: async (categoryId) => {
        const userId = userIdRef.current;
        if (!userId) return { ok: false, error: 'Not signed in.' };
        const result = await leaveCategoryDb(userId, categoryId);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          joinedCategoryIds: s.joinedCategoryIds.filter((id) => id !== categoryId),
          categoryMemberProgress: s.categoryMemberProgress.filter(
            (p) => p.categoryId !== categoryId,
          ),
        }));
        return { ok: true };
      },
      updateSettings: (partial) => {
        if (partial.bubblesEnabled !== undefined) {
          writeBubblesEnabledToStorage(partial.bubblesEnabled);
        }
        applyUserState({ ...state, settings: { ...state.settings, ...partial } });
      },
      updateCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertCategory(category, 'update');
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          categories: s.categories.map((c) =>
            c.id === result.category.id ? result.category : c,
          ),
        }));
        return { ok: true };
      },
      addCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertCategory(category, 'insert');
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          categories: [...s.categories, result.category],
        }));
        return { ok: true };
      },
      deleteCategory: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deleteCategoryDb(id);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          categories: s.categories.filter((c) => c.id !== id),
          tasks: s.tasks.filter((t) => t.categoryId !== id),
        }));
        return { ok: true };
      },
      updateTask: async (task) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertTask(task);
        if (!result.ok) return result;
        setState((s) =>
          ensureDailyPlan(
            {
              ...s,
              tasks: s.tasks.map((t) => (t.id === result.task.id ? result.task : t)),
            },
            undefined,
            userIdRef.current,
          ),
        );
        return { ok: true };
      },
      addTask: async (task) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertTask({ ...task, id: '' });
        if (!result.ok) return result;
        setState((s) =>
          ensureDailyPlan(
            { ...s, tasks: [...s.tasks, result.task] },
            undefined,
            userIdRef.current,
          ),
        );
        return { ok: true };
      },
      deleteTask: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deleteTaskDb(id);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          tasks: s.tasks.filter((t) => t.id !== id),
          dailyPlans: Object.fromEntries(
            Object.entries(s.dailyPlans).map(([date, plan]) => [
              date,
              {
                ...plan,
                tasks: plan.tasks.filter((pt) => pt.taskId !== id),
                extraTaskIds: plan.extraTaskIds.filter((tid) => tid !== id),
              },
            ]),
          ),
        }));
        return { ok: true };
      },
      addReward: async (reward) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertReward({ ...reward, id: '' });
        if (!result.ok) return result;
        setState((s) => ({ ...s, rewards: [...s.rewards, result.reward] }));
        return { ok: true };
      },
      updateReward: async (reward) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertReward(reward);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          rewards: s.rewards.map((r) => (r.id === result.reward.id ? result.reward : r)),
        }));
        return { ok: true };
      },
      deleteReward: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deleteRewardDb(id);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          rewards: s.rewards.filter((r) => r.id !== id),
          unlockedRewardIds: s.unlockedRewardIds.filter((rid) => rid !== id),
        }));
        return { ok: true };
      },
      addBadge: async (badge) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertBadge(badge, 'insert');
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          badges: [...s.badges, result.badge].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
          ),
        }));
        return { ok: true };
      },
      updateBadge: async (badge) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertBadge(badge, 'update');
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          badges: s.badges
            .map((b) => (b.id === result.badge.id ? result.badge : b))
            .sort(
              (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
            ),
        }));
        return { ok: true };
      },
      reorderBadges: async (orderedIds) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await updateBadgesOrder(orderedIds);
        if (!result.ok) return result;
        setState((s) => {
          const byId = new Map(s.badges.map((b) => [b.id, b]));
          const badges = orderedIds
            .map((id, index) => {
              const badge = byId.get(id);
              if (!badge) return null;
              return { ...badge, sortOrder: index };
            })
            .filter((b): b is Badge => b != null);
          return { ...s, badges };
        });
        return { ok: true };
      },
      deleteBadge: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deleteBadgeDb(id);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          badges: s.badges.filter((b) => b.id !== id),
          unlockedBadgeIds: s.unlockedBadgeIds.filter((bid) => bid !== id),
        }));
        return { ok: true };
      },
      addPunishmentCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentCategory(category, 'insert');
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      updatePunishmentCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentCategory(category, 'update');
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      deletePunishmentCategory: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deletePunishmentCategoryDb(id);
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      addPunishmentTemplate: async (template) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentTemplate({ ...template, id: '' });
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      updatePunishmentTemplate: async (template) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentTemplate(template);
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      deletePunishmentTemplate: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deletePunishmentTemplateDb(id);
        if (!result.ok) return result;
        await refreshCatalog();
        return { ok: true };
      },
      addVideoCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertVideoCategory({ ...category, id: '' });
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          videoCategories: [...s.videoCategories, result.category].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          ),
        }));
        return { ok: true };
      },
      updateVideoCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertVideoCategory(category);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          videoCategories: s.videoCategories
            .map((c) => (c.id === result.category.id ? result.category : c))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
        return { ok: true };
      },
      reorderVideoCategories: async (orderedIds) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await updateVideoCategoriesOrder(orderedIds);
        if (!result.ok) return result;
        setState((s) => {
          const byId = new Map(s.videoCategories.map((c) => [c.id, c]));
          const videoCategories = orderedIds.map((id, index) => {
            const cat = byId.get(id);
            if (!cat) return null;
            return { ...cat, sortOrder: index };
          }).filter((c): c is VideoCategory => c != null);
          return { ...s, videoCategories };
        });
        return { ok: true };
      },
      deleteVideoCategory: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const videosToRemove = state.videos.filter((v) => v.categoryId === id);
        const result = await deleteVideoCategoryDb(id);
        if (!result.ok) return result;
        await Promise.all(
          videosToRemove.map((v) => deleteVideoFile(v.storagePath)),
        );
        setState((s) => ({
          ...s,
          videoCategories: s.videoCategories.filter((c) => c.id !== id),
          videoCategoryCounts: Object.fromEntries(
            Object.entries(s.videoCategoryCounts).filter(([key]) => key !== id),
          ),
          videos: s.videos.filter((v) => v.categoryId !== id),
        }));
        return { ok: true };
      },
      addVideo: async (video, file, fileName, onUploadProgress) => {
        const denied = requireAdmin();
        if (denied) return denied;
        if (file.size > MAX_VIDEO_BYTES) {
          return { ok: false, error: formatVideoSizeError(file.size) };
        }
        const tempId = crypto.randomUUID();
        const path = videoStoragePath(tempId, fileName);
        const upload = await uploadVideoFile(
          path,
          file,
          video.mimeType,
          onUploadProgress,
        );
        if (!upload.ok) return upload;

        const row: Video = {
          ...video,
          id: tempId,
          storagePath: path,
        };
        const insert = await insertVideoRow(row);
        if (!insert.ok) {
          await deleteVideoFile(path);
          return insert;
        }
        setState((s) => ({
          ...s,
          videos: [insert.video, ...s.videos],
          videoCategoryCounts: {
            ...s.videoCategoryCounts,
            [insert.video.categoryId]:
              (s.videoCategoryCounts[insert.video.categoryId] ?? 0) + 1,
          },
        }));
        return { ok: true };
      },
      updateVideo: async (video) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const previous = state.videos.find((v) => v.id === video.id);
        const result = await updateVideoRow(video);
        if (!result.ok) return result;
        setState((s) => {
          const nextCounts = { ...s.videoCategoryCounts };
          if (
            previous &&
            previous.categoryId !== result.video.categoryId
          ) {
            nextCounts[previous.categoryId] = Math.max(
              0,
              (nextCounts[previous.categoryId] ?? 0) - 1,
            );
            nextCounts[result.video.categoryId] =
              (nextCounts[result.video.categoryId] ?? 0) + 1;
          }
          return {
            ...s,
            videoCategoryCounts: nextCounts,
            videos: s.videos.map((v) =>
              v.id === result.video.id ? result.video : v,
            ),
          };
        });
        return { ok: true };
      },
      patchVideoDuration: async (id, durationSeconds) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await updateVideoDuration(id, durationSeconds);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          videos: s.videos.map((v) =>
            v.id === result.video.id ? result.video : v,
          ),
        }));
        return { ok: true };
      },
      deleteVideo: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const video = state.videos.find((v) => v.id === id);
        const result = await deleteVideoDb(id);
        if (!result.ok) return result;
        if (video) await deleteVideoFile(video.storagePath);
        setState((s) => {
          const nextCounts = { ...s.videoCategoryCounts };
          if (video) {
            nextCounts[video.categoryId] = Math.max(
              0,
              (nextCounts[video.categoryId] ?? 0) - 1,
            );
          }
          return {
            ...s,
            videoCategoryCounts: nextCounts,
            videos: s.videos.filter((v) => v.id !== id),
          };
        });
        return { ok: true };
      },
      resetAll: async () => {
        const userId = userIdRef.current;
        if (!userId) return { ok: false, error: 'Not signed in.' };
        const fresh = createInitialState();
        const catalogResult = await fetchSharedCatalog();
        let next = fresh;
        if (catalogResult.ok) {
          next = mergeCatalogIntoState(fresh, catalogResult.catalog);
        }
        next = ensureDailyPlan(next, undefined, userId);
        const membersResult = await fetchCategoryMembers(userId);
        if (membersResult.ok) {
          next = {
            ...next,
            joinedCategoryIds: membersResult.categoryIds,
            categoryMemberProgress: membersResult.progress,
          };
        }
        const badgesResult = await fetchUserBadgeIds(userId);
        if (badgesResult.ok) {
          next = { ...next, unlockedBadgeIds: badgesResult.badgeIds };
        }
        setState(next);
        const save = await saveUserProgress(userId, next);
        if (!save.ok) return save;
        return { ok: true };
      },
    }),
    [
      state,
      session,
      authReady,
      dataLoading,
      dataError,
      lastSaveError,
      refresh,
      refreshCatalog,
      refreshPatreonProfile,
      refreshProfile,
      loadAllData,
      applyUserState,
      runBadgeUnlockOnComplete,
      runBadgeUnlockOnTime,
      runBadgeUnlockOnBubblePop,
      requireAdmin,
    ],
  );

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider');
  return ctx;
}

export { SUPABASE_SETUP_HINT };
