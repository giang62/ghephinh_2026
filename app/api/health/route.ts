import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const kvConfigured = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  return NextResponse.json({
    vercel: Boolean(process.env.VERCEL),
    kvConfigured,
    hasKvEnv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    hasUpstashEnv: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  });
}
