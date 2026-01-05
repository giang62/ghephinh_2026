import { NextResponse } from "next/server";
import { submitResult, type ClickCounterResult, type ImagePuzzleResult, getRoomSnapshot, assertRoom } from "@/lib/roomStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as {
      playerId?: unknown;
      token?: unknown;
      result?: unknown;
    };

    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const result = body.result as ImagePuzzleResult | ClickCounterResult;

    const room = submitResult({ roomId, playerId, token, result });
    return NextResponse.json({ room: getRoomSnapshot(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const room = assertRoom(roomId);
    return NextResponse.json({ room: getRoomSnapshot(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
