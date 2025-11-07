import { NextRequest, NextResponse } from "next/server";

type ImportedCard = {
  name: string;
  count: number;
  commander?: boolean;
  image?: string | null;
};

type ImportSuccess = {
  source: "moxfield" | "archidekt" | "generic";
  name?: string | null;
  cards: ImportedCard[];
};

type ImportError = { error: string };

function normaliseImage(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    // check a few common shapes
    if (typeof value.normal === "string") return value.normal;
    if (typeof value.large === "string") return value.large;
    if (typeof value.png === "string") return value.png;
  }
  return null;
}

async function importMoxfieldDeck(deckId: string): Promise<ImportSuccess> {
  const API_URL = `https://api.moxfield.com/v2/decks/all/${deckId}`;
  const response = await fetch(API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTGMastersDeckImport/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Moxfield lookup failed (${response.status})`);
  }
  const data = await response.json();
  const cards: ImportedCard[] = [];

  const pushBoard = (board: unknown, commander = false) => {
    if (!board || typeof board !== "object") return;
    for (const rawValue of Object.values(board as Record<string, unknown>)) {
      const value = rawValue as Record<string, unknown>;
      const quantity = Number((value?.quantity as number | undefined) ?? (value?.count as number | undefined) ?? 1);
      const cardInfo = (value?.card as Record<string, unknown> | undefined) ?? value;
      const name = typeof cardInfo?.name === "string" ? cardInfo.name.trim() : null;
      if (!name) continue;
      cards.push({
        name,
        count: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        commander,
        image: normaliseImage(cardInfo?.imageUris ?? cardInfo?.image_uris ?? cardInfo?.images),
      });
    }
  };

  pushBoard((data as any)?.commanders, true);
  pushBoard((data as any)?.mainboard, false);
  pushBoard((data as any)?.companions, false);
  pushBoard((data as any)?.sideboard, false);
  pushBoard((data as any)?.maybeboard, false);

  if (cards.length === 0) {
    throw new Error("Moxfield deck contained no recognizable cards");
  }

  const name = typeof (data as any)?.name === "string" ? (data as any).name : null;
  return { source: "moxfield", name, cards };
}

async function importArchidektDeck(deckId: string): Promise<ImportSuccess> {
  const API_URL = `https://archidekt.com/api/decks/${deckId}/?format=json`;
  const response = await fetch(API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTGMastersDeckImport/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Archidekt lookup failed (${response.status})`);
  }
  const data = await response.json();
  const cards: ImportedCard[] = [];

  const entries: any[] = Array.isArray((data as any)?.cards) ? (data as any).cards : [];
  for (const entry of entries) {
    const quantity = Number(entry?.quantity ?? 1);
    const category = String(entry?.board?.category ?? entry?.categories?.[0] ?? "").toLowerCase();
    const cardInfo: any = entry?.card ?? entry;
    const name =
      typeof cardInfo?.oracleCard?.name === "string"
        ? cardInfo.oracleCard.name
        : typeof cardInfo?.name === "string"
        ? cardInfo.name
        : null;
    if (!name) continue;
    cards.push({
      name: name.trim(),
      count: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      commander: category.includes("commander") || category.includes("partner"),
      image: normaliseImage(cardInfo?.oracleCard?.image_uris ?? cardInfo?.image_uris ?? cardInfo?.images),
    });
  }

  if (cards.length === 0) {
    throw new Error("Archidekt deck contained no recognizable cards");
  }

  const name = typeof (data as any)?.name === "string" ? (data as any).name : null;
  return { source: "archidekt", name, cards };
}

function parseDeckId(url: URL, marker: string): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf(marker);
  if (idx === -1) return null;
  const next = parts[idx + 1];
  if (!next) return null;
  return next.split("?")[0].split("#")[0];
}

async function importGeneric(url: string): Promise<ImportSuccess> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }
  const html = await response.text();
  const cardMap: Record<string, number> = {};
  const regex = /(\d+)\s+x?\s+([^<\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const qty = parseInt(match[1], 10);
    const name = match[2]?.trim();
    if (!name) continue;
    const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
    cardMap[name] = (cardMap[name] ?? 0) + quantity;
  }
  const cards: ImportedCard[] = Object.entries(cardMap).map(([name, count]) => ({ name, count }));
  if (cards.length === 0) {
    throw new Error("No cards found while scraping page");
  }
  return { source: "generic", cards };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return NextResponse.json<ImportError>({ error: "URL is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return NextResponse.json<ImportError>({ error: "Invalid URL" }, { status: 400 });
    }

    const host = parsed.hostname.toLowerCase();
    if (host.includes("moxfield.com")) {
      const deckId = parseDeckId(parsed, "decks");
      if (!deckId) {
        return NextResponse.json<ImportError>({ error: "Unable to determine Moxfield deck id" }, { status: 400 });
      }
      const result = await importMoxfieldDeck(deckId);
      return NextResponse.json<ImportSuccess>(result);
    }

    if (host.includes("archidekt.com")) {
      const deckId = parseDeckId(parsed, "decks");
      if (!deckId) {
        return NextResponse.json<ImportError>({ error: "Unable to determine Archidekt deck id" }, { status: 400 });
      }
      const result = await importArchidektDeck(deckId);
      return NextResponse.json<ImportSuccess>(result);
    }

    const fallback = await importGeneric(rawUrl);
    return NextResponse.json<ImportSuccess>(fallback);
  } catch (error) {
    console.error("POST /api/deck-import failed", error);
    return NextResponse.json<ImportError>({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
