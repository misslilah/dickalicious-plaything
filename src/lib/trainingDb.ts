import type {
  SlutTrainingMember,
  Task,
  TrainingBlackmailProfile,
  TrainingProofStatus,
  TrainingProofSubmission,
  TrainingTask,
  TrainingTaskCompletion,
} from '../types';
import { fetchAdminProfiles } from './profileDb';
import { getSupabase, isSupabaseColumnMissingError } from './supabase';

export const TRAINING_MIGRATION_HINT =
  'Training tables are not set up yet. Run supabase/migrations/071_training_blackmail.sql in the Supabase SQL Editor, then refresh.';

export const TRAINING_PERSONAL_MIGRATION_HINT =
  'Personal training tasks require supabase/migrations/072_training_personal_tasks.sql. Run it in the Supabase SQL Editor, then refresh.';

type DbTrainingTask = {
  id: string;
  title: string;
  description: string;
  sort_order: number;
  video_path: string | null;
  required_phrase: string | null;
  required_phrase_repeat_count: number;
  timer_seconds: number | null;
  open_url: string | null;
  throne_payment: boolean;
  requires_proof_photo: boolean;
  is_active: boolean;
  assigned_user_id: string | null;
};

type DbTrainingCompletion = {
  id: string;
  user_id: string;
  task_id: string;
  completed_at: string;
  proof_photo_path: string | null;
  proof_status: TrainingProofStatus | null;
  verified_at: string | null;
  verified_by: string | null;
};

type DbProofRow = DbTrainingCompletion & {
  training_tasks: { title: string } | { title: string }[] | null;
};

function mapTrainingTask(row: DbTrainingTask): TrainingTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    videoPath: row.video_path,
    requiredPhrase: row.required_phrase?.trim() || undefined,
    requiredPhraseRepeatCount: row.required_phrase_repeat_count,
    timerSeconds: row.timer_seconds ?? undefined,
    openUrl: row.open_url?.trim() || undefined,
    thronePayment: Boolean(row.throne_payment),
    requiresProofPhoto: row.requires_proof_photo,
    isActive: row.is_active,
    assignedUserId: row.assigned_user_id ?? null,
  };
}

function mapCompletion(row: DbTrainingCompletion): TrainingTaskCompletion {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    completedAt: row.completed_at,
    proofPhotoPath: row.proof_photo_path,
    proofStatus: row.proof_status,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
  };
}

function trainingTaskToDb(task: TrainingTask) {
  const phrase = task.requiredPhrase?.trim() || null;
  return {
    id: task.id || undefined,
    title: task.title.trim(),
    description: task.description.trim(),
    sort_order: task.sortOrder,
    video_path: task.videoPath?.trim() || null,
    required_phrase: phrase,
    required_phrase_repeat_count: phrase
      ? Math.max(1, task.requiredPhraseRepeatCount ?? 1)
      : 1,
    timer_seconds: task.timerSeconds ?? null,
    open_url: task.openUrl?.trim() || null,
    throne_payment: Boolean(task.thronePayment),
    requires_proof_photo: task.requiresProofPhoto,
    is_active: task.isActive,
    assigned_user_id: task.assignedUserId ?? null,
  };
}

function trainingTasksQueryError(error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  if (/relation.*does not exist/i.test(error.message)) return TRAINING_MIGRATION_HINT;
  if (isSupabaseColumnMissingError(error) && /assigned_user_id/i.test(error.message)) {
    return TRAINING_PERSONAL_MIGRATION_HINT;
  }
  return error.message;
}

/** Adapter so training tasks can reuse task completion hooks/modals. */
export function trainingTaskAsTaskAdapter(task: TrainingTask): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    taskScope: 'daily',
    xpReward: 0,
    frequency: 'once',
    timerSeconds: task.timerSeconds,
    openUrl: task.openUrl,
    requiredPhrase: task.requiredPhrase,
    requiredPhraseRepeatCount: task.requiredPhraseRepeatCount,
  };
}

export function trainingTaskNeedsProof(
  task: TrainingTask,
  blackmailEnabled: boolean,
): boolean {
  return blackmailEnabled && task.requiresProofPhoto;
}

export async function fetchTrainingBlackmailProfile(
  userId: string,
): Promise<
  { ok: true; profile: TrainingBlackmailProfile } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('profiles')
    .select('training_blackmail_enabled, training_blackmail_consented_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: TRAINING_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    profile: {
      enabled: Boolean(data?.training_blackmail_enabled),
      consentedAt: data?.training_blackmail_consented_at ?? null,
    },
  };
}

export async function enableTrainingBlackmail(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({
      training_blackmail_enabled: true,
      training_blackmail_consented_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: TRAINING_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fetchTrainingTasks(
  includeInactive = false,
): Promise<{ ok: true; tasks: TrainingTask[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  let query = supabase
    .from('training_tasks')
    .select('*')
    .is('assigned_user_id', null)
    .order('sort_order')
    .order('created_at');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    const hint = trainingTasksQueryError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return { ok: true, tasks: (data as DbTrainingTask[]).map(mapTrainingTask) };
}

/** Global active tasks plus personal active tasks assigned to the user. */
export async function fetchTrainingTasksForUser(
  userId: string,
): Promise<{ ok: true; tasks: TrainingTask[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('training_tasks')
    .select('*')
    .eq('is_active', true)
    .or(`assigned_user_id.is.null,assigned_user_id.eq.${userId}`)
    .order('sort_order')
    .order('created_at');

  if (error) {
    const hint = trainingTasksQueryError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return { ok: true, tasks: (data as DbTrainingTask[]).map(mapTrainingTask) };
}

/** Admin: personal training tasks assigned to a specific Slut. */
export async function fetchPersonalTrainingTasksForUser(
  userId: string,
  includeInactive = true,
): Promise<{ ok: true; tasks: TrainingTask[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  let query = supabase
    .from('training_tasks')
    .select('*')
    .eq('assigned_user_id', userId)
    .order('sort_order')
    .order('created_at');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    const hint = trainingTasksQueryError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return { ok: true, tasks: (data as DbTrainingTask[]).map(mapTrainingTask) };
}

/** Admin: active Slut-tier members with blackmail status and pending proof counts. */
export async function fetchActiveSlutTrainingMembers(): Promise<
  { ok: true; members: SlutTrainingMember[] } | { ok: false; error: string }
> {
  const profilesResult = await fetchAdminProfiles();
  if (!profilesResult.ok) return profilesResult;

  const sluts = profilesResult.profiles.filter(
    (p) => p.patreonTier === 'slut' && p.patreonStatus === 'active',
  );
  if (sluts.length === 0) return { ok: true, members: [] };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const ids = sluts.map((s) => s.id);
  const [blackmailResult, pendingResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, training_blackmail_enabled')
      .in('id', ids),
    supabase
      .from('training_task_completions')
      .select('user_id')
      .in('user_id', ids)
      .eq('proof_status', 'pending')
      .not('proof_photo_path', 'is', null),
  ]);

  if (blackmailResult.error) {
    if (isSupabaseColumnMissingError(blackmailResult.error)) {
      return { ok: false, error: TRAINING_MIGRATION_HINT };
    }
    return { ok: false, error: blackmailResult.error.message };
  }
  if (pendingResult.error) {
    const hint = trainingTasksQueryError(pendingResult.error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: pendingResult.error.message };
  }

  const blackmailById = new Map<string, boolean>();
  for (const row of blackmailResult.data ?? []) {
    blackmailById.set(row.id, Boolean(row.training_blackmail_enabled));
  }

  const pendingById = new Map<string, number>();
  for (const row of pendingResult.data ?? []) {
    pendingById.set(row.user_id, (pendingById.get(row.user_id) ?? 0) + 1);
  }

  const members: SlutTrainingMember[] = sluts
    .map((s) => ({
      id: s.id,
      username: s.username,
      blackmailEnabled: blackmailById.get(s.id) ?? false,
      pendingProofCount: pendingById.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));

  return { ok: true, members };
}

export async function upsertTrainingTask(
  task: TrainingTask,
): Promise<{ ok: true; task: TrainingTask } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = trainingTaskToDb(task);
  const { data, error } = task.id
    ? await supabase.from('training_tasks').update(row).eq('id', task.id).select().single()
    : await supabase.from('training_tasks').insert(row).select().single();

  if (error || !data) {
    const hint = trainingTasksQueryError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error?.message ?? 'Save failed.' };
  }
  return { ok: true, task: mapTrainingTask(data as DbTrainingTask) };
}

export async function deleteTrainingTaskDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('training_tasks').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchUserTrainingCompletions(
  userId: string,
): Promise<
  { ok: true; completions: TrainingTaskCompletion[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('training_task_completions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { ok: false, error: TRAINING_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    completions: (data as DbTrainingCompletion[]).map(mapCompletion),
  };
}

export async function completeTrainingTask(
  userId: string,
  taskId: string,
  proofPhotoPath: string | null,
  needsProof: boolean,
): Promise<
  { ok: true; completion: TrainingTaskCompletion } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    user_id: userId,
    task_id: taskId,
    proof_photo_path: proofPhotoPath,
    proof_status: needsProof ? ('pending' as const) : null,
  };

  const { data, error } = await supabase
    .from('training_task_completions')
    .insert(row)
    .select()
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'This training task is already completed.' };
    }
    return { ok: false, error: error?.message ?? 'Could not complete task.' };
  }

  return { ok: true, completion: mapCompletion(data as DbTrainingCompletion) };
}

export async function fetchPendingProofSubmissions(): Promise<
  { ok: true; submissions: TrainingProofSubmission[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('training_task_completions')
    .select(
      'id, user_id, task_id, completed_at, proof_photo_path, proof_status, training_tasks(title)',
    )
    .eq('proof_status', 'pending')
    .not('proof_photo_path', 'is', null)
    .order('completed_at', { ascending: true });

  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { ok: false, error: TRAINING_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  const submissions: TrainingProofSubmission[] = [];
  for (const row of (data ?? []) as DbProofRow[]) {
    if (!row.proof_photo_path) continue;
    const taskRel = row.training_tasks;
    const taskTitle = Array.isArray(taskRel)
      ? taskRel[0]?.title
      : taskRel?.title;
    submissions.push({
      completionId: row.id,
      userId: row.user_id,
      username: '',
      taskId: row.task_id,
      taskTitle: taskTitle ?? 'Training task',
      completedAt: row.completed_at,
      proofPhotoPath: row.proof_photo_path,
      proofStatus: row.proof_status ?? 'pending',
    });
  }

  return { ok: true, submissions };
}

export async function verifyTrainingProof(
  completionId: string,
  adminUserId: string,
  status: 'approved' | 'rejected',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('training_task_completions')
    .update({
      proof_status: status,
      verified_at: new Date().toISOString(),
      verified_by: adminUserId,
    })
    .eq('id', completionId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
