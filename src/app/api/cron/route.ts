import { NextRequest, NextResponse } from "next/server";
import { runChecks } from "@/lib/engine";
export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (k !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ at: new Date().toISOString(), results: await runChecks() });
}
export const POST = GET;
