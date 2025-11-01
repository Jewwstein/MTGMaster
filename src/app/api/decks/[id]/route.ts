import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

// GET /api/decks/[id] -> fetch deck with aggregated cards
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const deck = await prisma.deck.findUnique({
      where: { id },
      select: { id: true, name: true, cards: { select: { name: true, isCommander: true } } },
    });
    if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const map = new Map<string, { name: string; count: number; commander: boolean }>();
    for (const c of deck.cards) {
      const prev = map.get(c.name) ?? { name: c.name, count: 0, commander: false };
      prev.count += 1;
      prev.commander = prev.commander || !!c.isCommander;
      map.set(c.name, prev);
    }
    const entries = Array.from(map.values());
    return NextResponse.json({ id: deck.id, name: deck.name, entries });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// PATCH /api/decks/[id] -> rename
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await req.json();
    const name: string | undefined = body?.name;
    const updated = await prisma.deck.update({ where: { id }, data: { name } });
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}

// DELETE /api/decks/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    await prisma.deckCard.deleteMany({ where: { deckId: id } });
    await prisma.deck.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "failed") }, { status: 500 });
  }
}
