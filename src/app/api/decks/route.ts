import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const decks = await prisma.deck.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ decks });
  } catch (error) {
    console.error("GET /api/decks failed", error);
    return NextResponse.json({ decks: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Untitled Deck";
    const entries = Array.isArray(body?.entries) ? body.entries : [];

    const deck = await prisma.deck.create({
      data: {
        ownerId: userId,
        name,
        cards: {
          createMany: {
            data: entries
              .filter((entry: any) => typeof entry?.name === "string" && entry.name.trim())
              .map((entry: any) => ({
                name: entry.name.trim(),
                quantity: typeof entry?.count === "number" ? entry.count : 1,
                isCommander: !!entry?.commander,
              })),
          },
        },
      },
    });

    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    console.error("POST /api/decks failed", error);
    return NextResponse.json({ error: "Failed to save deck" }, { status: 500 });
  }
}
