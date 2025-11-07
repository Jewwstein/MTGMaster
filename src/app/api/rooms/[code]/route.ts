import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

const normalizeRoom = (room: { roomCode: string; name: string | null; status: string; updatedAt: Date }) => ({
  roomCode: room.roomCode,
  name: room.name,
  status: room.status,
  updatedAt: room.updatedAt?.toISOString?.() ?? room.updatedAt,
});

const getRoomCode = (req: Request, params: { code?: string } | undefined) => {
  const raw = typeof params?.code === "string" ? params.code.trim() : "";
  if (raw) return raw.toUpperCase();

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const roomsIndex = segments.lastIndexOf("rooms");
    const candidate = roomsIndex >= 0 && roomsIndex + 1 < segments.length ? segments[roomsIndex + 1] : "";
    return candidate ? candidate.trim().toUpperCase() : null;
  } catch {
    return null;
  }
};

// GET /api/rooms/[code] -> fetch or create room, return latest snapshot
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const roomCode = getRoomCode(_req, params);
    if (!roomCode) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }
    let game = await prisma.game.findUnique({ where: { roomCode } });
    if (!game) {
      game = await prisma.game.create({ data: { roomCode, name: roomCode, stateJson: JSON.stringify({}), status: "active" } });
    }
    return NextResponse.json({
      roomCode: game.roomCode,
      stateJson: game.stateJson,
      room: normalizeRoom(game),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// POST /api/rooms/[code] -> save snapshot { stateJson }
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const roomCode = getRoomCode(req, params);
    if (!roomCode) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }
    const body = await req.json();
    const stateJson: string = typeof body?.stateJson === "string" ? body.stateJson : JSON.stringify(body?.stateJson ?? {});
    const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : undefined;
    const game = await prisma.game.upsert({
      where: { roomCode },
      create: { roomCode, name: name ?? roomCode, stateJson, status: "active" },
      update: { stateJson, status: "active", ...(name ? { name } : {}) },
    });
    return NextResponse.json({ ok: true, updatedAt: game.updatedAt, room: normalizeRoom(game) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// PATCH /api/rooms/[code] -> update metadata (e.g., status, name)
export async function PATCH(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const roomCode = getRoomCode(req, params);
    if (!roomCode) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, any> = {};

    if (typeof body?.status === "string") {
      const normalized = body.status.trim().toLowerCase();
      if (!normalized) {
        return NextResponse.json({ error: "Status cannot be empty" }, { status: 400 });
      }
      const allowedStatuses = new Set(["active", "closed"]);
      if (!allowedStatuses.has(normalized)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = normalized;
    }

    if (typeof body?.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length > 0) {
        updates.name = trimmed;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const game = await prisma.game.update({
      where: { roomCode },
      data: updates,
      select: {
        roomCode: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ room: normalizeRoom(game) });
  } catch (e: any) {
    if (typeof e?.code === "string" && e.code === "P2025") {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}
