import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // ensure it always runs

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
