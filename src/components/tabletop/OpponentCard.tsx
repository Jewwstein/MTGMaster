"use client";
import React from "react";
import type { CardItem } from "../../state/game";
import { usePreview } from "./PreviewProvider";

const globalCache: Map<string, string> =
  (globalThis as any).__cardImgCache ?? ((globalThis as any).__cardImgCache = new Map<string, string>());

async function fetchScryfallImage(name: string): Promise<string | null> {
  const pick = (data: any) =>
    (data?.image_uris?.small ||
      data?.image_uris?.normal ||
      data?.card_faces?.[0]?.image_uris?.small ||
      data?.card_faces?.[0]?.image_uris?.normal ||
      null) as string | null;

  const tryMode = async (mode: "exact" | "fuzzy", query: string) => {
    const url = `https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return pick(data);
  };

  const attempt = async (query: string) => {
    try {
      const exact = await tryMode("exact", query);
      if (exact) return exact;
    } catch {}
    try {
      const fuzzy = await tryMode("fuzzy", query);
      if (fuzzy) return fuzzy;
    } catch {}
    return null;
  };

  let img = await attempt(name);
  if (img) return img;
  const stripped = name.replace(/\s*\(.*\)\s*$/, "").replace(/\s*\/\/.*$/, "").trim();
  if (stripped && stripped !== name) {
    img = await attempt(stripped);
  }
  return img ?? null;
}

export default function OpponentCard({ card, className, sizeClass = "h-24 w-16" }: { card: CardItem; className?: string; sizeClass?: string }) {
  const preview = usePreview();
  const [img, setImg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const raw = card?.name ?? "";
    const key = raw.trim().replace(/\s+/g, " ");
    async function ensureImage() {
      if (!key) {
        setImg(null);
        return;
      }
      if (globalCache.has(key)) {
        setImg(globalCache.get(key)!);
        return;
      }
      const src = await fetchScryfallImage(key);
      if (!cancelled) {
        if (src) globalCache.set(key, src);
        setImg(src);
      }
    }
    ensureImage();
    return () => {
      cancelled = true;
    };
  }, [card?.name]);

  const style: React.CSSProperties = {
    backgroundImage: img ? `url(${img})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  const rotated = card?.tapped ? "rotate-90" : "";

  return (
    <div
      className={`relative ${sizeClass} select-none overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-200 shadow ${rotated} ${className ?? ""}`}
      style={style}
      onPointerEnter={() =>
        preview.hoverIn({
          name: card.name,
          counters: typeof card.counters === "number" ? card.counters : null,
          customText: typeof card.customText === "string" ? card.customText : null,
        })
      }
      onPointerLeave={() => preview.hoverOut()}
      title={card.name}
      aria-label={card.name}
    >
      {!img && <span className="m-2 block text-center leading-tight text-zinc-300">{card.name}</span>}
      {(card.counters ?? 0) > 0 && (
        <div className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
          +{card.counters}
        </div>
      )}
      {card.labels && card.labels.length > 0 && (
        <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1 text-[9px]">
          {card.labels.map((label) => (
            <span key={label} className="rounded bg-zinc-900/80 px-1 py-0.5 text-[8px] uppercase text-amber-300">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
