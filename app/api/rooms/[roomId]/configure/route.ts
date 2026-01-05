import { NextResponse } from "next/server";
import { adminConfigureRoom, getRoomSnapshot } from "@/lib/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as { adminKey?: unknown; durationSec?: unknown; imageUrl?: unknown };
    const adminKey = typeof body.adminKey === "string" ? body.adminKey : "";
    const durationSec = typeof body.durationSec === "number" ? body.durationSec : undefined;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;

    const room = adminConfigureRoom({ roomId, adminKey, durationSec, imageUrl });
    return NextResponse.json({ room: getRoomSnapshot(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
