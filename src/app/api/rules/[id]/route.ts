import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import { api, type Rule } from "@/lib/db";
// off-chain cancel (stops the keeper). For a hard on-chain cancel call executor.cancel(nonce) from the wallet.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const { sig } = await req.json() as { sig: Hex };
  const rules = await api<Rule[]>("rules_list", {}); const r = rules.find(x => x.id === id);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await verifyMessage({ address: r.owner as Hex, message: `cancel ${id}`, signature: sig }))) return NextResponse.json({ error: "bad sig" }, { status: 401 });
  await api("rule_transition", { id, from: r.status, to: "cancelled" });
  return NextResponse.json({ ok: true });
}
