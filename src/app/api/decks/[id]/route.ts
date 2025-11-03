import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import prisma from "../../../../lib/prisma";

function resolveDeckId(req: NextRequest, params?: { id?: string | string[] }): string | null {
  if (!params) return req.nextUrl.pathname.split("/").pop() || null;
  const raw = params.id;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return req.nextUrl.pathname.split("/").pop() || null;
}

export async function GET(request: NextRequest, { params }: { params: { id?: string | string[] } }) {
  const deckId = resolveDeckId(request, params);
  if (!deckId) {
    return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
  }

  try {
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: {
          orderBy: { name: "asc" },
        },
      },
    });

    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: deck.id,
      name: deck.name,
      entries: deck.cards.map((card) => ({
        id: card.id,
        name: card.name,
        count: card.quantity,
        commander: card.isCommander,
      })),
    });
  } catch (error) {
    console.error("GET /api/decks/[id] failed", error);
    return NextResponse.json({ error: "Failed to load deck" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = resolveDeckId(request, params);
  if (!deckId) {
    return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    if (!rawName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const deck = await prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck || deck.ownerId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.deck.update({ where: { id: deckId }, data: { name: rawName } });
    return NextResponse.json({ deck: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt } });
  } catch (error) {
    console.error("PATCH /api/decks/[id] failed", error);
    return NextResponse.json({ error: "Failed to update deck" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = resolveDeckId(request, params);
  if (!deckId) {
    return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
  }

  try {
    const deck = await prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck || deck.ownerId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.deck.delete({ where: { id: deckId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/decks/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
  }
}
