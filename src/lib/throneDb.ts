import type { ThroneGiftEvent, ThronePaymentPending } from '../types';
import { getSupabase, isSupabaseColumnMissingError } from './supabase';
import { getThroneWebhookUrl, THRONE_MIGRATION_HINT } from './throneSetup';

export { getThroneWebhookUrl };

type DbGiftEvent = {
  id: string;
  received_at: string;
  event_type: string;
  gifter_name: string | null;
  item_name: string | null;
  amount_cents: number | null;
  currency: string | null;
  matched_user_id: string | null;
  matched_task_id: string | null;
  payload?: Record<string, unknown> | null;
};

type DbPending = {
  id: string;
  user_id: string;
  task_id: string | null;
  punishment_template_id: string | null;
  status: ThronePaymentPending['status'];
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  gift_event_id: string | null;
};

function throneTableError(error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  if (/relation.*does not exist/i.test(error.message)) return THRONE_MIGRATION_HINT;
  if (isSupabaseColumnMissingError(error) && /throne_payment/i.test(error.message)) {
    return THRONE_MIGRATION_HINT;
  }
  return error.message;
}

function mapGiftEvent(row: DbGiftEvent): ThroneGiftEvent {
  return {
    id: row.id,
    receivedAt: row.received_at,
    eventType: row.event_type,
    gifterName: row.gifter_name,
    itemName: row.item_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    matchedUserId: row.matched_user_id,
    matchedTaskId: row.matched_task_id,
    payload: row.payload ?? null,
  };
}

function mapPending(row: DbPending): ThronePaymentPending {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    punishmentTemplateId: row.punishment_template_id,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    giftEventId: row.gift_event_id,
  };
}

export async function fetchUserThronePunishmentPending(
  userId: string,
): Promise<
  { ok: true; pending: ThronePaymentPending[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('throne_payment_pending')
    .select('*')
    .eq('user_id', userId)
    .not('punishment_template_id', 'is', null)
    .in('status', ['waiting', 'completed'])
    .order('created_at', { ascending: false });

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    pending: (data as DbPending[]).map(mapPending),
  };
}

export async function fetchUserThronePending(
  userId: string,
): Promise<
  { ok: true; pending: ThronePaymentPending[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('throne_payment_pending')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    pending: (data as DbPending[]).map(mapPending),
  };
}

export async function startThronePunishmentPending(
  userId: string,
  punishmentTemplateId: string,
): Promise<
  { ok: true; pending: ThronePaymentPending } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data: existing } = await supabase
    .from('throne_payment_pending')
    .select('id')
    .eq('user_id', userId)
    .eq('punishment_template_id', punishmentTemplateId)
    .eq('status', 'waiting')
    .maybeSingle();

  if (existing) {
    return { ok: false, error: 'You are already waiting for payment verification.' };
  }

  const { data, error } = await supabase
    .from('throne_payment_pending')
    .insert({ user_id: userId, punishment_template_id: punishmentTemplateId })
    .select()
    .single();

  if (error || !data) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    if (error?.code === '23505') {
      return { ok: false, error: 'You are already waiting for payment verification.' };
    }
    return { ok: false, error: error?.message ?? 'Could not start payment wait.' };
  }

  return { ok: true, pending: mapPending(data as DbPending) };
}

export async function startThronePaymentPending(
  userId: string,
  taskId: string,
): Promise<
  { ok: true; pending: ThronePaymentPending } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data: existing } = await supabase
    .from('throne_payment_pending')
    .select('id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('status', 'waiting')
    .maybeSingle();

  if (existing) {
    return { ok: false, error: 'You are already waiting for payment verification.' };
  }

  const { data, error } = await supabase
    .from('throne_payment_pending')
    .insert({ user_id: userId, task_id: taskId })
    .select()
    .single();

  if (error || !data) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    if (error?.code === '23505') {
      return { ok: false, error: 'You are already waiting for payment verification.' };
    }
    return { ok: false, error: error?.message ?? 'Could not start payment wait.' };
  }

  return { ok: true, pending: mapPending(data as DbPending) };
}

export async function cancelThronePaymentPending(
  pendingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('throne_payment_pending')
    .update({ status: 'cancelled' })
    .eq('id', pendingId)
    .eq('status', 'waiting');

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fetchWaitingThronePayments(): Promise<
  | {
      ok: true;
      pending: (ThronePaymentPending & {
        username?: string;
        taskTitle?: string;
        punishmentTitle?: string;
        throneAmountCents?: number | null;
      })[];
    }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('throne_payment_pending')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as DbPending[];
  if (rows.length === 0) return { ok: true, pending: [] };

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const taskIds = [
    ...new Set(rows.map((row) => row.task_id).filter((id): id is string => Boolean(id))),
  ];
  const punishmentIds = [
    ...new Set(
      rows
        .map((row) => row.punishment_template_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [profilesResult, tasksResult, punishmentsResult] = await Promise.all([
    supabase.from('profiles').select('id, username').in('id', userIds),
    taskIds.length > 0
      ? supabase.from('training_tasks').select('id, title').in('id', taskIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    punishmentIds.length > 0
      ? supabase
          .from('punishment_templates')
          .select('id, title, throne_amount_cents')
          .in('id', punishmentIds)
      : Promise.resolve({
          data: [] as { id: string; title: string; throne_amount_cents: number | null }[],
        }),
  ]);

  const usernameById = new Map(
    (profilesResult.data ?? []).map((profile: { id: string; username: string }) => [
      profile.id,
      profile.username,
    ]),
  );
  const titleById = new Map(
    (tasksResult.data ?? []).map((task: { id: string; title: string }) => [task.id, task.title]),
  );
  const punishmentById = new Map(
    (punishmentsResult.data ?? []).map(
      (tpl: { id: string; title: string; throne_amount_cents: number | null }) => [
        tpl.id,
        tpl,
      ],
    ),
  );

  const pending = rows.map((row) => {
    const punishment = row.punishment_template_id
      ? punishmentById.get(row.punishment_template_id)
      : undefined;
    return {
      ...mapPending(row),
      username: usernameById.get(row.user_id),
      taskTitle: row.task_id ? titleById.get(row.task_id) : undefined,
      punishmentTitle: punishment?.title,
      throneAmountCents: punishment?.throne_amount_cents ?? null,
    };
  });

  return { ok: true, pending };
}

export async function adminConfirmThronePayment(
  pendingId: string,
  kind: 'training' | 'punishment' = 'training',
): Promise<
  | {
      ok: true;
      userId: string;
      taskId?: string;
      punishmentTemplateId?: string;
    }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const rpcName =
    kind === 'punishment'
      ? 'complete_throne_punishment_pending'
      : 'complete_throne_payment_pending';

  const { data, error } = await supabase.rpc(rpcName, {
    p_pending_id: pendingId,
    p_gift_event_id: null,
  });

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    user_id?: string;
    task_id?: string;
    punishment_template_id?: string;
  };
  if (!result?.ok) {
    return { ok: false, error: result?.error ?? 'Could not confirm payment.' };
  }

  return {
    ok: true,
    userId: result.user_id!,
    taskId: result.task_id,
    punishmentTemplateId: result.punishment_template_id,
  };
}

export async function fetchRecentThroneGiftEvents(
  limit = 10,
): Promise<{ ok: true; events: ThroneGiftEvent[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('throne_gift_events')
    .select(
      'id, received_at, event_type, gifter_name, item_name, amount_cents, currency, matched_user_id, matched_task_id, payload',
    )
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    const hint = throneTableError(error);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: error.message };
  }

  return { ok: true, events: (data as DbGiftEvent[]).map(mapGiftEvent) };
}

/** Admin alias for waiting Throne payments queue. */
export const fetchWaitingThronePendingAdmin = fetchWaitingThronePayments;
