import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { api, type Rule, type Bid } from "./db";
import { getFloor, telegram, type Quote } from "./price";
import { EXECUTOR, EXECUTOR_ABI, NFT_ABI, RPC, EXPLORER } from "./config";

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const log = (rule_id: string, kind: string, detail: string) => api("event", { rule_id, kind, detail });

/** level the price must cross for this rule (trail updates high water) */
function evaluate(r: Rule, price: number) {
  if (r.kind === "tp") return { hit: price >= Number(r.trigger_price), level: Number(r.trigger_price), hw: r.high_water };
  if (r.kind === "sl") return { hit: price <= Number(r.trigger_price), level: Number(r.trigger_price), hw: r.high_water };
  const hw = Math.max(Number(r.high_water ?? 0), price);
  const level = hw * (1 - Number(r.trail_pct) / 100);
  return { hit: price <= level, level, hw };
}

async function execute(r: Rule): Promise<string> {
  const owner = await pub.readContract({ address: r.collection as Hex, abi: NFT_ABI, functionName: "ownerOf", args: [BigInt(r.token_id)] });
  if (owner.toLowerCase() !== r.owner.toLowerCase()) throw new Error("seller no longer owns the NFT");
  const bids = await api<Bid[]>("bids_list", { collection: r.collection });
  const now = Math.floor(Date.now() / 1000);
  const ok = bids.filter(b => b.currency.toLowerCase() === r.currency.toLowerCase() && Number(b.expiry) > now &&
    BigInt(b.price_wei) >= BigInt(r.min_price_wei) && (b.any_token || b.token_id === r.token_id) && b.buyer.toLowerCase() !== r.owner.toLowerCase());
  if (!ok.length) throw new Error("no bid at or above your minimum yet");
  const best = ok.sort((a, b) => (BigInt(b.price_wei) > BigInt(a.price_wei) ? 1 : -1))[0];
  const keeper = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as Hex);
  const w = createWalletClient({ account: keeper, chain: sepolia, transport: http(RPC) });
  const s = r.sell as Record<string, string>; const b = best.bid as Record<string, string | boolean>;
  const sell = { seller: s.seller as Hex, nft: s.nft as Hex, tokenId: BigInt(s.tokenId), minPrice: BigInt(s.minPrice), currency: s.currency as Hex, expiry: BigInt(s.expiry), nonce: BigInt(s.nonce) };
  const bid = { buyer: b.buyer as Hex, nft: b.nft as Hex, tokenId: BigInt(b.tokenId as string), anyToken: Boolean(b.anyToken), price: BigInt(b.price as string), currency: b.currency as Hex, expiry: BigInt(b.expiry as string), nonce: BigInt(b.nonce as string) };
  const args = [sell, r.sell_sig as Hex, bid, best.sig as Hex] as const;
  await pub.simulateContract({ address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "execute", args, account: keeper });
  const hash = await w.writeContract({ address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "execute", args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("execute reverted " + hash);
  await api("bid_status", { id: best.id, status: "filled" });
  return hash;
}

export async function runChecks() {
  const rules = await api<Rule[]>("rules_list", { status: "active,triggered" });
  const quotes = new Map<string, Quote>();
  const out: Record<string, unknown>[] = [];
  for (const r of rules) {
    try {
      const qk = r.collection.toLowerCase();
      if (!quotes.has(qk)) quotes.set(qk, await getFloor(r.collection, r.slug));
      const q = quotes.get(qk);
      if (r.status === "triggered") { // waiting for a bid; retry
        await tryExec(r, out); continue;
      }
      if (!q) { out.push({ id: r.id, skip: "no price" }); continue; }
      const { hit, level, hw } = evaluate(r, q.price);
      const hits = hit ? r.hits + 1 : 0; // must hold across N consecutive checks (filters one-trade dips / wash prints)
      await api("rule_update", { id: r.id, p: { hits, last_price: q.price, last_source: q.source, last_checked: new Date().toISOString(), high_water: hw ?? undefined, trigger_price: r.kind === "trail" ? level : undefined } });
      out.push({ id: r.id, kind: r.kind, price: q.price, level, hits, need: r.confirm_n });
      if (hit && hits >= r.confirm_n) {
        const t = await api<Rule | null>("rule_transition", { id: r.id, from: "active", to: "triggered" });
        if (!t) continue;
        await log(r.id, "triggered", `${r.kind.toUpperCase()} hit: floor ${q.price} vs level ${level.toFixed(4)} for ${hits} checks (${q.source})`);
        await telegram(r.telegram_chat, `🔔 ${r.kind.toUpperCase()} triggered for token #${r.token_id}: floor ${q.price} ETH. Selling now…`);
        await tryExec({ ...r, status: "triggered" }, out);
      }
    } catch (e) { out.push({ id: r.id, error: String(e) }); }
  }
  return out;
}

async function tryExec(r: Rule, out: Record<string, unknown>[]) {
  const t = await api<Rule | null>("rule_transition", { id: r.id, from: "triggered", to: "executing" });
  if (!t) return;
  try {
    const hash = await execute(r);
    await api("rule_update", { id: r.id, p: { status: "executed", exec_tx: hash } });
    await log(r.id, "executed", hash);
    if (r.group_id) for (const s of await api<Rule[]>("rules_list", { owner: r.owner, status: "active" }))
      if (s.group_id === r.group_id && s.id !== r.id) { await api("rule_update", { id: s.id, p: { status: "cancelled", note: "sibling order filled" } }); }
    await telegram(r.telegram_chat, `✅ Sold token #${r.token_id}. ${EXPLORER}/tx/${hash}`);
    out.push({ id: r.id, executed: hash });
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 300);
    const fatal = /no longer owns|used|reverted/.test(msg);
    await api("rule_update", { id: r.id, p: { status: fatal ? "failed" : "triggered", note: msg } });
    await log(r.id, fatal ? "failed" : "waiting", msg);
    out.push({ id: r.id, exec_error: msg });
  }
}
