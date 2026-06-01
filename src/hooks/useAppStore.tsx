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
import { deleteBadgeDb, fetchUserBadgeIds, upsertBadge } from '../lib/badgeDb';
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
  type SharedCatalog,
  upsertCategory,
  upsertPunishmentCategory,
  upsertPunishmentTemplate,
  upsertReward,
  upsertTask,
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
import { createInitialState } from '../lib/seed';
import { getSupabase, isSupabaseConfigured, SUPABASE_SETUP_HINT } from '../lib/supabase';
import { fetchUserProgress, saveUserProgress } from '../lib/userProgressDb';
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
    password: string,
    username: string,
  ) => Promise<
    | { ok: true; needsEmailConfirmation?: boolean }
    | { ok: false; error: string }
  >;
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
  uncompleteTask: (taskId: string) => void;
  markTaskStarted: (taskId: string) => void;
  closeDay: () => void;
  purchaseReward: (rewardId: string) => void;
  acceptPunishment: (templateId: string) => void;
  applyTaskMalus: (taskId: string) => void;
  dismissPunishment: (id: string) => void;
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
  deleteBadge: (id: string) => Promise<MutateResult>;
  addPunishmentCategory: (category: PunishmentCategory) => Promise<MutateResult>;
  updatePunishmentCategory: (category: PunishmentCategory) => Promise<MutateResult>;
  deletePunishmentCategory: (id: string) => Promise<MutateResult>;
  addPunishmentTemplate: (template: PunishmentTemplate) => Promise<MutateResult>;
  updatePunishmentTemplate: (template: PunishmentTemplate) => Promise<MutateResult>;
  deletePunishmentTemplate: (id: string) => Promise<MutateResult>;
  addVideoCategory: (category: VideoCategory) => Promise<MutateResult>;
  updateVideoCategory: (category: VideoCategory) => Promise<MutateResult>;
  deleteVideoCategory: (id: string) => Promise<MutateResult>;
  addVideo: (
    video: Video,
    file: Blob,
    fileName: string,
  ) => Promise<MutateResult>;
  updateVideo: (video: Video) => Promise<MutateResult>;
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
    videos: catalog.videos,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createInitialState());
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

  const loadAllData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setDataError(null);

    try {
      const [catalogResult, progressResult, membersResult, badgesResult] =
        await Promise.all([
          fetchSharedCatalog(),
          fetchUserProgress(userId),
          fetchCategoryMembers(userId),
          fetchUserBadgeIds(userId),
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

      let merged = mergeCatalogIntoState(progressResult.state, catalogResult.catalog);
      merged = {
        ...merged,
        joinedCategoryIds: membersResult.categoryIds,
        categoryMemberProgress: membersResult.progress,
        unlockedBadgeIds: badgesResult.badgeIds,
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
      userIdRef.current = authSession.userId;
      setSession(sessionToApp(authSession));
      void loadAllData(authSession.userId);
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
      signUp: async (email, password, username) => {
        const result = await authSignUp(email, password, username);
        if (!result.ok) return result;

        const supabase = getSupabase();
        const { data } = supabase ? await supabase.auth.getSession() : { data: null };
        if (!data?.session?.user) {
          return { ok: true, needsEmailConfirmation: true };
        }

        const current = await getCurrentSession();
        if (!current) {
          return { ok: true, needsEmailConfirmation: true };
        }
        userIdRef.current = current.userId;
        setSession(sessionToApp(current));
        await loadAllData(current.userId);
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
      },
      uncompleteTask: (taskId) => applyUserState(uncompleteTask(state, taskId)),
      markTaskStarted: (taskId) =>
        applyUserState(markTaskStarted(state, taskId)),
      closeDay: () => applyUserState(closeDay(state, session?.userId ?? null)),
      purchaseReward: (rewardId) => applyUserState(purchaseReward(state, rewardId)),
      acceptPunishment: (templateId) =>
        applyUserState(acceptPunishment(state, templateId)),
      applyTaskMalus: (taskId) => applyUserState(applyTaskMalus(state, taskId)),
      dismissPunishment: (id) => applyUserState(dismissPunishment(state, id)),
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
      updateSettings: (partial) =>
        applyUserState({ ...state, settings: { ...state.settings, ...partial } }),
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
        setState((s) => ({ ...s, badges: [...s.badges, result.badge] }));
        return { ok: true };
      },
      updateBadge: async (badge) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertBadge(badge, 'update');
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          badges: s.badges.map((b) => (b.id === result.badge.id ? result.badge : b)),
        }));
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
          videoCategories: [...s.videoCategories, result.category],
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
          videoCategories: s.videoCategories.map((c) =>
            c.id === result.category.id ? result.category : c,
          ),
        }));
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
          videos: s.videos.filter((v) => v.categoryId !== id),
        }));
        return { ok: true };
      },
      addVideo: async (video, file, fileName) => {
        const denied = requireAdmin();
        if (denied) return denied;
        if (file.size > MAX_VIDEO_BYTES) {
          return { ok: false, error: formatVideoSizeError(file.size) };
        }
        const tempId = crypto.randomUUID();
        const path = videoStoragePath(tempId, fileName);
        const upload = await uploadVideoFile(path, file, video.mimeType);
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
        setState((s) => ({ ...s, videos: [insert.video, ...s.videos] }));
        return { ok: true };
      },
      updateVideo: async (video) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await updateVideoRow(video);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          videos: s.videos.map((v) => (v.id === result.video.id ? result.video : v)),
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
        setState((s) => ({
          ...s,
          videos: s.videos.filter((v) => v.id !== id),
        }));
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
