import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ opensea: !!process.env.OPENSEA_API_KEY, telegram: !!process.env.TELEGRAM_BOT_TOKEN, walletconnect: !!process.env.NEXT_PUBLIC_WC_PROJECT_ID }); }
