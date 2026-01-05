import { NextResponse } from "next/server";
import { joinRoom, getRoomSnapshot } from "@/lib/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name : "";

    const { room, playerId, token } = joinRoom({ roomId, name });
    return NextResponse.json({ playerId, token, room: getRoomSnapshot(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
