import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

type RoomSummary = {
  roomCode: string;
  name: string | null;
  status: string;
  updatedAt: Date;
};

const normalizeRoom = (room: RoomSummary) => ({
  roomCode: room.roomCode,
  name: room.name,
  status: room.status,
  updatedAt: room.updatedAt?.toISOString?.() ?? room.updatedAt,
});

export async function GET() {
  try {
    const rooms = await prisma.game.findMany({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
      select: {
        roomCode: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ rooms: rooms.map(normalizeRoom) });
  } catch (error) {
    console.error("GET /api/rooms failed", error);
    return NextResponse.json({ rooms: [] }, { status: 500 });
  }
}
