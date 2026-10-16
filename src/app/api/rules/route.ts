import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, type Hex, getAddress } from "viem";
import { api, publicRule, type Rule } from "@/lib/db";
import { DOMAIN, SELL_TYPES, EXECUTOR, TEST_NFT } from "@/lib/config";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") || undefined;
  const rules = await api<Rule[]>("rules_list", { owner });
  const events = await api<unknown[]>("events", {});
  return NextResponse.json({ rules: rules.map(publicRule), events });
}

type Leg = { kind: "tp" | "sl" | "trail"; trigger_price?: number; trail_pct?: number; sell: Record<string, string>; sig: Hex };
export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { legs: Leg[]; slug?: string; confirm_n?: number; telegram_chat?: string; start_price?: number };
    const group_id = crypto.randomUUID(); const made = [];
    for (const l of b.legs) {
      const s = l.sell;
      const msg = { seller: getAddress(s.seller), nft: getAddress(s.nft), tokenId: BigInt(s.tokenId), minPrice: BigInt(s.minPrice), currency: getAddress(s.currency), expiry: BigInt(s.expiry), nonce: BigInt(s.nonce) };
      const ok = await verifyTypedData({ address: msg.seller, domain: DOMAIN, types: SELL_TYPES, primaryType: "Sell", message: msg, signature: l.sig });
      if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 400 });
      if (!["tp", "sl", "trail"].includes(l.kind)) return NextResponse.json({ error: "bad kind" }, { status: 400 });
      if (l.kind === "trail" && !(Number(l.trail_pct) > 0 && Number(l.trail_pct) < 100)) return NextResponse.json({ error: "trail % must be 0-100" }, { status: 400 });
      if (l.kind !== "trail" && !(Number(l.trigger_price) > 0)) return NextResponse.json({ error: "price needed" }, { status: 400 });
      made.push(publicRule(await api<Rule>("rule_insert", {
        owner: msg.seller.toLowerCase(), collection: msg.nft.toLowerCase(), token_id: s.tokenId, kind: l.kind,
        trigger_price: l.kind === "trail" ? null : l.trigger_price, trail_pct: l.kind === "trail" ? l.trail_pct : null,
        high_water: l.kind === "trail" ? (b.start_price ?? null) : null, min_price_wei: s.minPrice, currency: msg.currency.toLowerCase(),
        sell: s, sell_sig: l.sig, confirm_n: Math.min(Math.max(Number(b.confirm_n) || 3, 1), 20), slug: b.slug || null,
        telegram_chat: b.telegram_chat || null, group_id, chain_id: 11155111,
        note: msg.nft.toLowerCase() === TEST_NFT.toLowerCase() ? "testnet demo collection" : `executor ${EXECUTOR}`,
      })));
    }
    return NextResponse.json({ rules: made });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
