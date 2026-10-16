import { api } from "./db";
import { TEST_NFT } from "./config";

export type Quote = { price: number; source: string } | null;

/** Floor price in ETH. Real collections: OpenSea (key) -> Magic Eden (keyless) ; test collection: mock feed. */
export async function getFloor(collection: string, slug?: string | null): Promise<Quote> {
  if (collection.toLowerCase() === TEST_NFT.toLowerCase() || process.env.SLTP_FORCE_MOCK === "1") {
    const p = await api<{ mock_floor: number } | null>("price_get", { collection });
    return p ? { price: Number(p.mock_floor), source: "mock" } : null;
  }
  const key = process.env.OPENSEA_API_KEY;
  if (key && slug) {
    try {
      const r = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats`, { headers: { "x-api-key": key }, cache: "no-store" });
      if (r.ok) { const j = await r.json(); const f = j?.total?.floor_price; if (typeof f === "number" && f > 0) return { price: f, source: "opensea" }; }
    } catch {}
  }
  try {
    const r = await fetch(`https://api-mainnet.magiceden.dev/v3/rtp/ethereum/collections/v7?id=${collection}`, { cache: "no-store", headers: process.env.MAGICEDEN_API_KEY ? { Authorization: `Bearer ${process.env.MAGICEDEN_API_KEY}` } : {} });
    if (r.ok) { const j = await r.json(); const f = j?.collections?.[0]?.floorAsk?.price?.amount?.decimal; if (typeof f === "number" && f > 0) return { price: f, source: "magiceden" }; }
  } catch {}
  return null;
}

export async function telegram(chat: string | null | undefined, text: string) {
  const tok = process.env.TELEGRAM_BOT_TOKEN; if (!tok || !chat) return;
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) }); } catch {}
}
