import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

// GET /api/rooms/[code] -> fetch or create room, return latest snapshot
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  try {
    const roomCode = params.code.toUpperCase();
    let game = await prisma.game.findUnique({ where: { roomCode } });
    if (!game) {
      game = await prisma.game.create({ data: { roomCode, name: roomCode, stateJson: JSON.stringify({}) } });
    }
    return NextResponse.json({ roomCode: game.roomCode, stateJson: game.stateJson });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// POST /api/rooms/[code] -> save snapshot { stateJson }
export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const roomCode = params.code.toUpperCase();
    const body = await req.json();
    const stateJson: string = typeof body?.stateJson === "string" ? body.stateJson : JSON.stringify(body?.stateJson ?? {});
    const game = await prisma.game.upsert({
      where: { roomCode },
      create: { roomCode, name: roomCode, stateJson },
      update: { stateJson },
    });
    return NextResponse.json({ ok: true, updatedAt: game.updatedAt });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}
