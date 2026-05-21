/** Map Patreon reward / tier titles to app tiers (case-insensitive substring match). */
export type AppPatreonTier = 'sweetie' | 'princess' | 'slut';

export function mapPatreonTierTitle(title: string): AppPatreonTier | null {
  const t = title.toLowerCase();
  if (t.includes('slut')) return 'slut';
  if (t.includes('princess')) return 'princess';
  if (t.includes('sweetie')) return 'sweetie';
  return null;
}

export function highestTier(tiers: AppPatreonTier[]): AppPatreonTier | null {
  const order: AppPatreonTier[] = ['sweetie', 'princess', 'slut'];
  let best: AppPatreonTier | null = null;
  let bestRank = -1;
  for (const tier of tiers) {
    const rank = order.indexOf(tier);
    if (rank > bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
