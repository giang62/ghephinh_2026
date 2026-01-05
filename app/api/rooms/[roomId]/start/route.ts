import { NextResponse } from "next/server";
import { adminStartRoom, getRoomSnapshot } from "@/lib/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const body = (await req.json()) as { adminKey?: unknown };
    const adminKey = typeof body.adminKey === "string" ? body.adminKey : "";

    const room = adminStartRoom({ roomId, adminKey });
    return NextResponse.json({ room: getRoomSnapshot(room) });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}
