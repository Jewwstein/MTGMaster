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
  let ownerId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    ownerId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch (error) {
    console.warn("getServerSession failed in POST /api/decks", error);
  }

  try {
    if (!ownerId) {
      const guest = await prisma.user.upsert({
        where: { username: "guest" },
        update: {},
        create: {
          username: "guest",
          name: "Guest",
        },
      });
      ownerId = guest.id;
    }

    const body = await request.json();
    const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Untitled Deck";
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    const sanitized = entries
      .filter((entry: any) => typeof entry?.name === "string" && entry.name.trim())
      .map((entry: any) => {
        const rawImage = typeof entry?.image === "string" ? entry.image.trim() : "";
        return {
          name: entry.name.trim(),
          quantity: Math.max(1, typeof entry?.count === "number" && Number.isFinite(entry.count) ? entry.count : 1),
          isCommander: !!entry?.commander,
          image: rawImage.length > 0 ? rawImage : null,
        };
      });

    if (sanitized.length === 0) {
      return NextResponse.json({ error: "Deck must contain at least one card before saving" }, { status: 400 });
    }

    const deck = await prisma.deck.create({
      data: {
        ownerId: ownerId!,
        name,
      },
    });

    if (sanitized.length > 0) {
      const cardData = sanitized.map((entry: { name: string; quantity: number; isCommander: boolean; image: string | null }) => ({
        deckId: deck.id,
        name: entry.name,
        quantity: entry.quantity,
        isCommander: entry.isCommander,
        image: entry.image,
      }));
      try {
        await prisma.deckCard.createMany({
          data: cardData as any[],
        });
      } catch (error) {
        console.warn("deckCard.createMany failed, falling back to sequential create", error);
        for (const entry of cardData) {
          await prisma.deckCard.create({
            data: entry as any,
          });
        }
      }
    }

    return NextResponse.json({ deck: { id: deck.id, name: deck.name, updatedAt: deck.updatedAt } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/decks failed", error);
    const message = error instanceof Error ? error.message : "Failed to save deck";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
