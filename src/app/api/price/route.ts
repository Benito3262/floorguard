import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/db";
import { getFloor } from "@/lib/price";
import { TEST_NFT } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("collection") || TEST_NFT;
  return NextResponse.json(await getFloor(c, req.nextUrl.searchParams.get("slug")));
}
// testnet only: move the mock floor of the demo collection
export async function POST(req: NextRequest) {
  const { floor } = await req.json() as { floor: number };
  if (!(Number(floor) > 0)) return NextResponse.json({ error: "floor > 0" }, { status: 400 });
  return NextResponse.json(await api("price_set", { collection: TEST_NFT, floor: Number(floor) }));
}
