"use client";
import { useDraggable } from "@dnd-kit/core";
import type { CardItem } from "../../state/game";
import { useEffect, useState } from "react";
import { usePreview } from "./PreviewProvider";
import { useGame } from "../../state/game";

export default function Card({
  card,
  onClick,
  previewOn = undefined,
}: {
  card: CardItem;
  onClick?: () => void;
  previewOn?: never;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const [img, setImg] = useState<string | null>(null);
  const preview = usePreview();
  const [err, setErr] = useState<string | null>(null);
  const incCounter = useGame((s) => (s as any).incCounter as (id: string, delta: number) => void);
  const [menu, setMenu] = useState<{open:boolean;x:number;y:number}>({open:false,x:0,y:0});

  const cache = (globalThis as any).__cardImgCache ?? ((globalThis as any).__cardImgCache = new Map<string, string>());

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    backgroundImage: img ? `url(${img})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
  useEffect(() => {
    let cancelled = false;
    async function fetchImg() {
      const raw = card.name ?? "";
      const key = raw.trim().replace(/\s+/g, " ");
      if (cache.has(key)) {
        setImg(cache.get(key)!);
        return;
      }
      const pick = (data: any) =>
        (data?.image_uris?.small ||
          data?.image_uris?.normal ||
          data?.card_faces?.[0]?.image_uris?.small ||
          data?.card_faces?.[0]?.image_uris?.normal) as string | null;

      const tryMode = async (mode: "exact" | "fuzzy", nameStr: string) => {
        const url = `https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(nameStr)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return pick(data);
      };
      const tryAll = async (nameStr: string) => {
        try {
          const s1 = await tryMode("exact", nameStr);
          if (s1) return s1;
        } catch {}
        try {
          const s2 = await tryMode("fuzzy", nameStr);
          if (s2) return s2;
        } catch {}
        return null;
      };
      try {
        let src = await tryAll(key);
        if (!src) {
          // fallback: strip common annotations
          const base = key.replace(/\s*\(.*\)\s*$/, "").replace(/\s*\/\/.*$/, "").trim();
          if (base && base !== key) src = await tryAll(base);
        }
        if (!cancelled) {
          setImg(src);
          if (src) cache.set(key, src);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(String((e as any)?.message || "failed"));
          setImg(null);
        }
      }
    }
    fetchImg();
    return () => {
      cancelled = true;
    };
  }, [card.name]);

  return (
    <div className="relative inline-block align-top" onContextMenu={(e)=>{e.preventDefault(); setMenu({open:true,x:e.clientX,y:e.clientY});}}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => {
          if (onClick) onClick();
        }}
        onPointerEnter={() => preview.hoverIn(card.name)}
        onPointerLeave={() => preview.hoverOut()}
        className={`relative select-none rounded-md border border-zinc-700 bg-zinc-800 shadow ${
          card.tapped ? "rotate-90" : ""
        } w-20 h-28 grid place-items-center text-[10px] text-zinc-200`}
        style={style}
        aria-label={card.name}
      >
        {!img && card.name}
        {(card.counters ?? 0) > 0 && (
          <div
            className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow select-none"
            title="Scroll to change counters"
            onWheel={(e) => {
              e.preventDefault();
              incCounter(card.id, e.deltaY < 0 ? 1 : -1);
            }}
          >
            +{card.counters}
          </div>
        )}
      </div>
      {menu.open && (
        <div
          className="fixed z-50 rounded border border-zinc-800 bg-zinc-900 text-xs shadow"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={()=>setMenu((m)=>({...m,open:false}))}
        >
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={()=>{ incCounter(card.id, +1); setMenu((m)=>({...m,open:false})); }}
          >+1/+1 Counter</button>
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={()=>{ incCounter(card.id, -1); setMenu((m)=>({...m,open:false})); }}
          >-1/+1 Counter</button>
        </div>
      )}
    </div>
  );
}
