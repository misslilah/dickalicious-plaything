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
  Category,
  PunishmentTemplate,
  Reward,
  Session,
  Task,
  UserRole,
  Video,
  VideoCategory,
} from '../types';
import {
  deleteCategoryDb,
  deletePunishmentTemplateDb,
  deleteRewardDb,
  deleteTaskDb,
  deleteVideoCategoryDb,
  deleteVideoDb,
  fetchSharedCatalog,
  insertVideoRow,
  type SharedCatalog,
  upsertCategory,
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
} from '../lib/auth';
import {
  closeDay,
  completeTask,
  dismissPunishment,
  ensureDailyPlan,
  processDayRollover,
  purchaseReward,
  uncompleteTask,
} from '../lib/gameLogic';
import { createInitialState } from '../lib/seed';
import { isSupabaseConfigured, SUPABASE_SETUP_HINT } from '../lib/supabase';
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
  login: (
    emailOrUsername: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  closeDay: () => void;
  purchaseReward: (rewardId: string) => void;
  dismissPunishment: (id: string) => void;
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

    const [catalogResult, progressResult] = await Promise.all([
      fetchSharedCatalog(),
      fetchUserProgress(userId),
    ]);

    if (!catalogResult.ok) {
      setDataError(catalogResult.error);
      setDataLoading(false);
      return;
    }
    if (!progressResult.ok) {
      setDataError(progressResult.error);
      setDataLoading(false);
      return;
    }

    let merged = mergeCatalogIntoState(progressResult.state, catalogResult.catalog);
    merged = processDayRollover(merged);
    merged = ensureDailyPlan(merged);
    setState(merged);
    setDataLoading(false);
    void persistUserProgress(merged);
  }, [persistUserProgress]);

  useEffect(() => {
    void (async () => {
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
      setAuthReady(true);
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
      clearSaveError: () => setLastSaveError(null),
      login: async (emailOrUsername, password) => {
        const result = await authLogin(emailOrUsername, password);
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
      completeTask: (taskId) => applyUserState(completeTask(state, taskId)),
      uncompleteTask: (taskId) => applyUserState(uncompleteTask(state, taskId)),
      closeDay: () => applyUserState(closeDay(state)),
      purchaseReward: (rewardId) => applyUserState(purchaseReward(state, rewardId)),
      dismissPunishment: (id) => applyUserState(dismissPunishment(state, id)),
      updateSettings: (partial) =>
        applyUserState({ ...state, settings: { ...state.settings, ...partial } }),
      updateCategory: async (category) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertCategory(category);
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
        const result = await upsertCategory(category);
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
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === result.task.id ? result.task : t)),
        }));
        return { ok: true };
      },
      addTask: async (task) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertTask({ ...task, id: '' });
        if (!result.ok) return result;
        setState((s) => ({ ...s, tasks: [...s.tasks, result.task] }));
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
      addPunishmentTemplate: async (template) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentTemplate({ ...template, id: '' });
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          punishmentTemplates: [...s.punishmentTemplates, result.template],
        }));
        return { ok: true };
      },
      updatePunishmentTemplate: async (template) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await upsertPunishmentTemplate(template);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          punishmentTemplates: s.punishmentTemplates.map((t) =>
            t.id === result.template.id ? result.template : t,
          ),
        }));
        return { ok: true };
      },
      deletePunishmentTemplate: async (id) => {
        const denied = requireAdmin();
        if (denied) return denied;
        const result = await deletePunishmentTemplateDb(id);
        if (!result.ok) return result;
        setState((s) => ({
          ...s,
          punishmentTemplates: s.punishmentTemplates.filter((t) => t.id !== id),
        }));
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
        next = ensureDailyPlan(next);
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
