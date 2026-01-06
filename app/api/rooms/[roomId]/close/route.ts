import { NextResponse } from "next/server";
import { adminCloseRoom } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as { adminKey?: unknown };
    const adminKey = typeof body.adminKey === "string" ? body.adminKey : "";
    await adminCloseRoom({ roomId, adminKey });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

