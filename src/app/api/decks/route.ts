import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

// GET /api/decks -> list all decks (public)
export async function GET() {
  try {
    const decks = await prisma.deck.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ decks });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// POST /api/decks -> create deck with cards
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name: string = body?.name || "Untitled";
    const entries: { name: string; count: number; commander?: boolean }[] = Array.isArray(body?.entries) ? body.entries : [];
    const deck = await prisma.deck.create({
      data: {
        ownerId: "public", // open/public
        name,
        cards: {
          create: entries.flatMap((e) =>
            Array.from({ length: Math.max(0, Math.floor(e.count)) }).map(() => ({
              name: e.name,
              quantity: 1,
              isCommander: !!e.commander,
            }))
          ),
        },
      },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(deck, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}
