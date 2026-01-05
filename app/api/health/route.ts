import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  return NextResponse.json({
    vercel: Boolean(process.env.VERCEL),
    kvConfigured
  });
}

