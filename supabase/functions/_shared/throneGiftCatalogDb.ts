import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DbCatalogRow = {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  url: string;
  throne_gift_id: string | null;
  sort_order: number;
  created_at: string;
};

export type CatalogGiftResponse = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  url: string;
  throneGiftId?: string | null;
  imageUrl?: string | null;
};

export type ScrapedThroneGift = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  url: string;
  imageUrl?: string | null;
};

export function createServiceSupabase(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

function mapDbRow(row: DbCatalogRow): CatalogGiftResponse {
  return {
    id: row.id,
    title: row.title,
    priceCents: row.price_cents,
    currency: row.currency,
    url: row.url,
    throneGiftId: row.throne_gift_id,
  };
}

export async function fetchCatalogGiftsFromDb(
  supabase: SupabaseClient,
): Promise<CatalogGiftResponse[]> {
  const { data, error } = await supabase
    .from('throne_gift_catalog')
    .select('id, title, price_cents, currency, url, throne_gift_id, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('price_cents', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    console.error('[throne_gift_catalog] read failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapDbRow(row as DbCatalogRow));
}

/** Merge scraped Throne gifts into the persistent catalog (match on throne_gift_id). */
export async function upsertScrapedGiftsToCatalog(
  supabase: SupabaseClient,
  gifts: ScrapedThroneGift[],
): Promise<void> {
  for (let index = 0; index < gifts.length; index++) {
    const gift = gifts[index];
    const throneGiftId = gift.id?.trim();
    if (!throneGiftId) continue;

    const row = {
      title: gift.title,
      price_cents: gift.priceCents,
      currency: gift.currency || 'EUR',
      url: gift.url,
      throne_gift_id: throneGiftId,
      sort_order: (index + 1) * 10,
    };

    const { error } = await supabase.from('throne_gift_catalog').upsert(row, {
      onConflict: 'throne_gift_id',
    });

    if (error) {
      console.error('[throne_gift_catalog] upsert failed:', error.message, throneGiftId);
    }
  }
}
