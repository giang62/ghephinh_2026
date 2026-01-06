import { NextResponse } from "next/server";
import { assertRoom, getPlayerStageView, getPublicPlayers, getRoomSnapshot } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as { playerId?: unknown; token?: unknown };
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const token = typeof body.token === "string" ? body.token : "";

    const room = await assertRoom(roomId);
    const player = room.players.find((p) => p.playerId === playerId) ?? null;
    if (!player) throw new Error("Không tìm thấy người chơi");
    if (player.token !== token) throw new Error("Không có quyền");

    return NextResponse.json({
      serverNowMs: Date.now(),
      ...getRoomSnapshot(room),
      players: getPublicPlayers(room),
      me: getPlayerStageView(room, playerId)
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

