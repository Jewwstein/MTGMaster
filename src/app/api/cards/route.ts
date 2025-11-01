import { NextRequest } from "next/server";
import prisma from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) {
    return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
  }
  try {
    // Try cache (best-effort)
    try {
      const cached = await prisma.cardCache.findFirst({ where: { name } });
      if (cached && (cached.imageNormal || cached.imageSmall)) {
        return Response.json({
          name: cached.name,
          image: cached.imageNormal ?? cached.imageSmall ?? null,
          scryfallId: cached.scryfallId,
        });
      }
    } catch {}

    const resp = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Scryfall lookup failed" }), { status: 404 });
    }
    const data = await resp.json();
    const scryfallId: string | undefined = data?.id;
    const imageNormal: string | undefined = data?.image_uris?.normal ?? data?.card_faces?.[0]?.image_uris?.normal;
    const imageSmall: string | undefined = data?.image_uris?.small ?? data?.card_faces?.[0]?.image_uris?.small;
    const manaCost: string | undefined = data?.mana_cost ?? data?.card_faces?.[0]?.mana_cost;
    const typeLine: string | undefined = data?.type_line ?? data?.card_faces?.[0]?.type_line;
    const oracleText: string | undefined = data?.oracle_text ?? data?.card_faces?.[0]?.oracle_text;
    const colorIdentity: string | undefined = Array.isArray(data?.color_identity) ? data.color_identity.join("") : undefined;
    const cmc: number | undefined = typeof data?.cmc === "number" ? data.cmc : undefined;

    // Respond immediately with the image URL even if we can't store it
    const image = imageNormal ?? imageSmall ?? null;
    const response = Response.json({ name, image, scryfallId });

    // Best-effort cache write (non-blocking for return path)
    if (scryfallId) {
      prisma.cardCache
        .upsert({
          where: { scryfallId },
          create: {
            scryfallId,
            name,
            manaCost,
            typeLine,
            oracleText,
            imageSmall: imageSmall ?? null,
            imageNormal: imageNormal ?? null,
            colorIdentity: colorIdentity ?? null,
            cmc: cmc ?? null,
          },
          update: {
            name,
            manaCost,
            typeLine,
            oracleText,
            imageSmall: imageSmall ?? null,
            imageNormal: imageNormal ?? null,
            colorIdentity: colorIdentity ?? null,
            cmc: cmc ?? null,
          },
        })
        .catch(() => {});
    }

    return response;
  } catch (e) {
    // Never 500 just because cache write fails; try direct Scryfall as ultimate fallback
    try {
      const fallback = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name ?? "")}`
      );
      if (!fallback.ok) return new Response(JSON.stringify({ error: "Lookup failed" }), { status: 404 });
      const data = await fallback.json();
      const img =
        data?.image_uris?.normal ||
        data?.image_uris?.small ||
        data?.card_faces?.[0]?.image_uris?.normal ||
        data?.card_faces?.[0]?.image_uris?.small ||
        null;
      return Response.json({ name, image: img });
    } catch {
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
    }
  }
}
