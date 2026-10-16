import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress, type Hex } from "viem";
import { api } from "@/lib/db";
import { DOMAIN, BID_TYPES } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { return NextResponse.json(await api("bids_list", { collection: req.nextUrl.searchParams.get("collection") || undefined })); }
export async function POST(req: NextRequest) {
  const { bid: b, sig } = await req.json() as { bid: Record<string, string | boolean>; sig: Hex };
  const msg = { buyer: getAddress(b.buyer as string), nft: getAddress(b.nft as string), tokenId: BigInt(b.tokenId as string), anyToken: Boolean(b.anyToken), price: BigInt(b.price as string), currency: getAddress(b.currency as string), expiry: BigInt(b.expiry as string), nonce: BigInt(b.nonce as string) };
  if (!(await verifyTypedData({ address: msg.buyer, domain: DOMAIN, types: BID_TYPES, primaryType: "Bid", message: msg, signature: sig }))) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  return NextResponse.json(await api("bid_insert", { buyer: msg.buyer.toLowerCase(), collection: msg.nft.toLowerCase(), token_id: String(b.tokenId), any_token: msg.anyToken, price_wei: String(b.price), currency: msg.currency.toLowerCase(), expiry: Number(b.expiry), bid: b, sig }));
}
