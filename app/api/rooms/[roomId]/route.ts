import { NextResponse } from "next/server";
import { assertRoom, assertAdmin, getAdminView, getRoomSnapshot, getPublicPlayers } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const room = await assertRoom(roomId);

    const url = new URL(req.url);
    const adminKey = url.searchParams.get("adminKey");
    const serverNowMs = Date.now();

    if (adminKey) {
      assertAdmin(room, adminKey);
      return NextResponse.json({ serverNowMs, ...getAdminView(room) });
    }

    return NextResponse.json({
      serverNowMs,
      ...getRoomSnapshot(room),
      players: getPublicPlayers(room)
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
