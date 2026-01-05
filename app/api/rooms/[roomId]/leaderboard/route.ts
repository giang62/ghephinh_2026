import { NextResponse } from "next/server";
import { assertRoom, getPublicLeaderboard } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const room = assertRoom(roomId);
    return NextResponse.json({ serverNowMs: Date.now(), ...getPublicLeaderboard(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

