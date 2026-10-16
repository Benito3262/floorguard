export type Rule = {
  id: string; created_at: string; owner: string; chain_id: number; collection: string; slug: string | null; token_id: string;
  kind: "tp" | "sl" | "trail"; trigger_price: number | null; trail_pct: number | null; high_water: number | null;
  min_price_wei: string; currency: string; sell: Record<string, string>; sell_sig: string; confirm_n: number; hits: number;
  status: string; telegram_chat: string | null; last_price: number | null; last_source: string | null; last_checked: string | null;
  exec_tx: string | null; note: string | null; group_id: string | null;
};
export type Bid = { id: string; buyer: string; collection: string; token_id: string | null; any_token: boolean; price_wei: string; currency: string; expiry: number; bid: Record<string, unknown>; sig: string; status: string };

export async function api<T>(op: string, a: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_ANON_KEY!;
  const r = await fetch(`${url}/rest/v1/rpc/sltp_api`, {
    method: "POST", cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ k: process.env.SLTP_DB_KEY, op, a }),
  });
  if (!r.ok) throw new Error(`db ${op}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}
export const publicRule = (r: Rule) => { const { sell_sig: _s, ...rest } = r; void _s; return rest; };
