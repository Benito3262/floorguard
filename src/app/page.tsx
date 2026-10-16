"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSignTypedData, useSignMessage, useWriteContract, usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { parseEther, formatEther, type Hex } from "viem";
import { DOMAIN, SELL_TYPES, BID_TYPES, EXECUTOR, EXECUTOR_ABI, TEST_NFT, TWETH, NFT_ABI, ERC20_ABI, EXPLORER, CHAIN_ID } from "@/lib/config";

type Rule = { id: string; kind: string; token_id: string; collection: string; trigger_price: number | null; trail_pct: number | null; high_water: number | null; min_price_wei: string; status: string; hits: number; confirm_n: number; last_price: number | null; last_source: string | null; sell: { nonce: string }; exec_tx: string | null; note: string | null; owner: string; created_at: string };
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const badge: Record<string, string> = { active: "bg-emerald-100 text-emerald-800", triggered: "bg-amber-100 text-amber-800", executing: "bg-amber-100 text-amber-800", executed: "bg-sky-100 text-sky-800", failed: "bg-rose-100 text-rose-800", cancelled: "bg-stone-200 text-stone-600" };

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId(); const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect(); const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData(); const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract(); const pub = usePublicClient();
  const [owned, setOwned] = useState<number[]>([]); const [approved, setApproved] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]); const [floor, setFloor] = useState<number | null>(null);
  const [collection, setCollection] = useState<string>(TEST_NFT); const [slug, setSlug] = useState("");
  const [tokenId, setTokenId] = useState(""); const [tp, setTp] = useState("1.5"); const [sl, setSl] = useState("0.6");
  const [trail, setTrail] = useState(""); const [n, setN] = useState("3"); const [tg, setTg] = useState("");
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const isTest = collection.toLowerCase() === TEST_NFT.toLowerCase();

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/rules${address ? `?owner=${address}` : ""}`).then(r => r.json()); setRules(r.rules || []);
    const p = await fetch(`/api/price?collection=${collection}&slug=${slug}`).then(r => r.json()); setFloor(p?.price ?? null);
    if (address && pub) {
      try {
        const total = Number(await pub.readContract({ address: collection as Hex, abi: NFT_ABI, functionName: "totalSupply" }));
        const ids: number[] = [];
        for (let i = 1; i <= Math.min(total, 60); i++) { const o = await pub.readContract({ address: collection as Hex, abi: NFT_ABI, functionName: "ownerOf", args: [BigInt(i)] }); if (o.toLowerCase() === address.toLowerCase()) ids.push(i); }
        setOwned(ids); if (!tokenId && ids[0]) setTokenId(String(ids[0]));
        setApproved(await pub.readContract({ address: collection as Hex, abi: NFT_ABI, functionName: "isApprovedForAll", args: [address, EXECUTOR] }));
      } catch { setOwned([]); }
    }
  }, [address, pub, collection, slug, tokenId]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);

  const run = async (label: string, f: () => Promise<void>) => { setBusy(label); setMsg(""); try { await f(); } catch (e) { setMsg((e as Error).message.split("\n")[0]); } setBusy(""); refresh(); };
  const wait = async (h: Hex) => { await pub!.waitForTransactionReceipt({ hash: h }); };

  const mint = () => run("mint", async () => { await wait(await writeContractAsync({ address: TEST_NFT, abi: NFT_ABI, functionName: "mint", args: [address!, 2n] })); setMsg("Minted 2 test NFTs 🎉"); });
  const approve = () => run("approve", async () => { await wait(await writeContractAsync({ address: collection as Hex, abi: NFT_ABI, functionName: "setApprovalForAll", args: [EXECUTOR, true] })); });

  const arm = () => run("arm", async () => {
    const nonce = BigInt(Date.now()); const expiry = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
    const legs: Record<string, unknown>[] = [];
    const mk = async (kind: string, minEth: string, extra: Record<string, number>) => {
      const sell = { seller: address!, nft: collection as Hex, tokenId: BigInt(tokenId), minPrice: parseEther(minEth), currency: TWETH, expiry, nonce };
      const sig = await signTypedDataAsync({ domain: DOMAIN, types: SELL_TYPES, primaryType: "Sell", message: sell });
      legs.push({ kind, ...extra, sig, sell: Object.fromEntries(Object.entries(sell).map(([k, v]) => [k, String(v)])) });
    };
    if (tp) await mk("tp", tp, { trigger_price: Number(tp) });
    if (sl) await mk("sl", (Number(sl) * 0.9).toFixed(6), { trigger_price: Number(sl) }); // accept up to 10% below SL so it actually fills
    if (trail) await mk("trail", ((floor ?? 0) * (1 - Number(trail) / 100) * 0.9).toFixed(6) || "0.0001", { trail_pct: Number(trail) });
    if (!legs.length) throw new Error("Set at least one level");
    const r = await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legs, slug, confirm_n: Number(n), telegram_chat: tg, start_price: floor }) }).then(r => r.json());
    if (r.error) throw new Error(r.error); setMsg("Armed ✅ You can close this tab now.");
  });
  const cancel = (id: string) => run("cancel", async () => { const sig = await signMessageAsync({ message: `cancel ${id}` }); await fetch(`/api/rules/${id}`, { method: "DELETE", body: JSON.stringify({ sig }) }); });
  const hardCancel = (nonce: string) => run("cancel", async () => { await wait(await writeContractAsync({ address: EXECUTOR, abi: EXECUTOR_ABI, functionName: "cancel", args: [BigInt(nonce)] })); });

  // demo lab
  const [mock, setMock] = useState("1.0"); const [bidPx, setBidPx] = useState("0.6");
  const setMockFloor = () => run("price", async () => { await fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ floor: Number(mock) }) }); });
  const placeBid = () => run("bid", async () => {
    const price = parseEther(bidPx);
    const bal = await pub!.readContract({ address: TWETH, abi: ERC20_ABI, functionName: "balanceOf", args: [address!] });
    if (bal < price) await wait(await writeContractAsync({ address: TWETH, abi: ERC20_ABI, functionName: "mint", args: [address!, parseEther("100")] }));
    const al = await pub!.readContract({ address: TWETH, abi: ERC20_ABI, functionName: "allowance", args: [address!, EXECUTOR] });
    if (al < price) await wait(await writeContractAsync({ address: TWETH, abi: ERC20_ABI, functionName: "approve", args: [EXECUTOR, 2n ** 255n] }));
    const bid = { buyer: address!, nft: TEST_NFT, tokenId: 0n, anyToken: true, price, currency: TWETH, expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400), nonce: BigInt(Date.now()) };
    const sig = await signTypedDataAsync({ domain: DOMAIN, types: BID_TYPES, primaryType: "Bid", message: bid });
    const r = await fetch("/api/bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sig, bid: Object.fromEntries(Object.entries(bid).map(([k, v]) => [k, typeof v === "bigint" ? String(v) : v])) }) }).then(r => r.json());
    if (r.error) throw new Error(r.error); setMsg("Bid placed");
  });

  return (
    <main className="max-w-3xl mx-auto px-5 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <div><h1 className="text-3xl font-black tracking-tight">Floorguard 🛡️</h1><p className="text-stone-500">Stop-loss & take-profit for your NFTs. Sells while you sleep.</p></div>
        {isConnected ? <button className="btn2" onClick={() => disconnect()}>{short(address!)}</button>
          : <div className="flex gap-2">{connectors.map(c => <button key={c.uid} className="btn" onClick={() => connect({ connector: c })}>{c.name === "Injected" ? "Connect wallet" : c.name}</button>)}</div>}
      </header>
      {isConnected && chainId !== CHAIN_ID && <div className="card p-4 flex justify-between items-center"><span>Switch to Sepolia testnet</span><button className="btn" onClick={() => switchChain({ chainId: CHAIN_ID })}>Switch</button></div>}

      <section className="card p-5 grid sm:grid-cols-3 gap-4 text-sm">
        <div><b>1. Sign once</b><p className="text-stone-500">You sign sell orders at your TP & SL with a hard minimum price. Keys & NFTs never leave your wallet.</p></div>
        <div><b>2. We watch</b><p className="text-stone-500">Every minute we check the floor. A level must hold for N checks in a row, so a single dip or wash trade won’t fire it.</p></div>
        <div><b>3. Auto-sell</b><p className="text-stone-500">When it holds, the keeper matches your order to the best bid at or above your minimum. TP and SL share a nonce, so only one can ever fill.</p></div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex justify-between items-baseline"><h2 className="text-xl font-bold">Set your levels</h2><span className="text-sm text-stone-500">Floor: <b className="text-stone-900">{floor ?? "–"} {floor != null && "ETH"}</b></span></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Collection<input className="inp" value={collection} onChange={e => setCollection(e.target.value)} /></label>
          <label className="text-sm">OpenSea slug (mainnet, optional)<input className="inp" placeholder="e.g. pudgypenguins" value={slug} onChange={e => setSlug(e.target.value)} /></label>
        </div>
        <div className="text-sm">Your NFTs {isTest && <span className="text-stone-400">(SLTP Test Apes on Sepolia)</span>}
          <div className="flex flex-wrap gap-2 mt-2">
            {owned.map(i => <button key={i} onClick={() => setTokenId(String(i))} className={`pill ${tokenId === String(i) ? "bg-stone-900 text-white" : "bg-stone-100"}`}>#{i}</button>)}
            {isConnected && !owned.length && <span className="text-stone-400">None yet.</span>}
            {isConnected && isTest && <button className="btn2" disabled={!!busy} onClick={mint}>{busy === "mint" ? "Minting…" : "+ Mint 2 test NFTs"}</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-sm">Take profit (ETH)<input className="inp" value={tp} onChange={e => setTp(e.target.value)} /></label>
          <label className="text-sm">Stop loss (ETH)<input className="inp" value={sl} onChange={e => setSl(e.target.value)} /></label>
          <label className="text-sm">Trailing stop %<input className="inp" placeholder="optional" value={trail} onChange={e => setTrail(e.target.value)} /></label>
          <label className="text-sm">Confirm checks<input className="inp" value={n} onChange={e => setN(e.target.value)} /></label>
        </div>
        <label className="text-sm block">Telegram chat ID for alerts (optional)<input className="inp" placeholder="message the bot, paste your chat id" value={tg} onChange={e => setTg(e.target.value)} /></label>
        <div className="flex gap-2 flex-wrap">
          {!approved && <button className="btn2" disabled={!isConnected || !!busy} onClick={approve}>{busy === "approve" ? "Approving…" : "Approve keeper contract (one time)"}</button>}
          <button className="btn" disabled={!isConnected || !approved || !tokenId || !!busy} onClick={arm}>{busy === "arm" ? "Signing…" : `Arm #${tokenId || "?"}`}</button>
        </div>
        <p className="text-xs text-stone-400">SL orders accept fills down to 10% under your stop, so they still sell in a falling market. TP orders never fill below your TP.</p>
        {msg && <p className="text-sm font-medium">{msg}</p>}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-xl font-bold">Your orders</h2>
        {!rules.length && <p className="text-stone-400 text-sm">Nothing armed yet.</p>}
        {rules.map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm">
            <div className="flex items-center gap-2"><span className={`pill ${badge[r.status] || ""}`}>{r.status}</span>
              <b>{r.kind === "tp" ? "Take profit" : r.kind === "sl" ? "Stop loss" : `Trailing ${r.trail_pct}%`}</b> #{r.token_id}
              <span className="text-stone-500">@ {r.trigger_price != null ? Number(r.trigger_price).toFixed(4) : "–"} ETH · min {formatEther(BigInt(r.min_price_wei))}</span></div>
            <div className="flex items-center gap-2 text-stone-500">
              {r.status === "active" && <span>{r.hits}/{r.confirm_n} checks</span>}
              {r.exec_tx && <a className="underline text-sky-700" target="_blank" href={`${EXPLORER}/tx/${r.exec_tx}`}>sold ↗</a>}
              {["active", "triggered"].includes(r.status) && address?.toLowerCase() === r.owner && <button className="btn2" onClick={() => cancel(r.id)}>Cancel</button>}
            </div>
            {r.note && r.status !== "active" && <p className="w-full text-xs text-stone-400">{r.note}</p>}
          </div>))}
        {isConnected && <p className="text-xs text-stone-400">Want a hard, on-chain cancel? <button className="underline" onClick={() => { const r = rules.find(x => ["active", "triggered"].includes(x.status)); if (r) hardCancel(r.sell.nonce); }}>Burn the nonce</button> of your latest order on the executor.</p>}
      </section>

      {isTest && <section className="card p-5 space-y-3 border-dashed">
        <h2 className="text-xl font-bold">🧪 Testnet lab</h2>
        <p className="text-sm text-stone-500">Move the mock floor and put a bid on the board (any wallet; it mints test WETH). The keeper runs every minute.</p>
        <div className="flex gap-2 items-end"><label className="text-sm flex-1">Mock floor (ETH)<input className="inp" value={mock} onChange={e => setMock(e.target.value)} /></label><button className="btn2" disabled={!!busy} onClick={setMockFloor}>Set floor</button></div>
        <div className="flex gap-2 items-end"><label className="text-sm flex-1">Collection bid (tWETH)<input className="inp" value={bidPx} onChange={e => setBidPx(e.target.value)} /></label><button className="btn2" disabled={!isConnected || !!busy} onClick={placeBid}>{busy === "bid" ? "…" : "Place bid"}</button></div>
      </section>}
      <footer className="text-xs text-stone-400 text-center">Sepolia · executor <a className="underline" target="_blank" href={`${EXPLORER}/address/${EXECUTOR}`}>{short(EXECUTOR)}</a> · non-custodial</footer>
    </main>
  );
}
