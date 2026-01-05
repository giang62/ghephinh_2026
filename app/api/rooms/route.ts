import { NextResponse } from "next/server";
import { createRoom, parseGameId } from "@/lib/roomStore";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      gameId?: unknown;
      durationSec?: unknown;
      imageUrl?: unknown;
    };

    const gameId = parseGameId(body.gameId);
    const durationSec = typeof body.durationSec === "number" ? body.durationSec : undefined;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;

    const created = createRoom({ gameId, durationSec, imageUrl });
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 });
  }
}

