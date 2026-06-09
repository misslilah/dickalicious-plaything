import { normalizeSupabaseUrl } from './supabase';

export const THRONE_MIGRATION_HINT =
  'Throne payment tables are not set up yet. Run supabase/migrations/073_throne_payment_integration.sql in the Supabase SQL Editor, then refresh.';

export const THRONE_REALTIME_MIGRATION_HINT =
  'Run migration 074_throne_realtime_and_rls.sql if gift toasts never appear after webhooks succeed.';

/** Edge function URL for Throne dashboard webhook configuration. */
export function getThroneWebhookUrl(): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!raw?.trim()) return null;
  return `${normalizeSupabaseUrl(raw)}/functions/v1/throne-webhook`;
}

export const THRONE_WEBHOOK_SETUP_STEPS = [
  'Run migration 073_throne_payment_integration.sql in Supabase SQL Editor.',
  'Set THRONE_WEBHOOK_SECRET in Supabase → Edge Functions → Secrets (generate a long random string).',
  'Deploy the edge function: supabase functions deploy throne-webhook --no-verify-jwt',
  'Important: --no-verify-jwt is required. Without it Supabase returns 401 before the handler runs and Throne may still show "success".',
  'Optional: append ?token=<THRONE_WEBHOOK_SECRET> to the webhook URL if Throne cannot send custom headers.',
  'In Throne: Settings → Alerts & Integrations → Webhook Integration (if shown). Paste the webhook URL below.',
  'Add the same secret as Authorization: Bearer <secret> or X-Throne-Webhook-Secret header (per Throne dashboard).',
  'Create a training task with "Throne payment task" enabled and set Open URL to the Throne gift/item link.',
  'Run migrations 074_throne_realtime_and_rls.sql and 075_throne_payment_pending_profiles_fkey.sql in Supabase SQL Editor.',
  'If Throne has no webhook field in your account, use Admin → Training → Throne to confirm pending payments manually.',
] as const;
