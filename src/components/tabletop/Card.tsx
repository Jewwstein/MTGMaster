"use client";
import { useDraggable } from "@dnd-kit/core";
import type { CardItem, ZoneId } from "../../state/game";
import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { usePreview } from "./PreviewProvider";
import { useGame } from "../../state/game";
import { computeCounterAppearance } from "./themeUtils";

export default function Card({
  card,
  onClick,
  previewOn = undefined,
  suppressContextMenu = false,
  sizeClass = "w-20 h-28",
  isSelected = false,
}: {
  card: CardItem;
  onClick?: () => void;
  previewOn?: never;
  suppressContextMenu?: boolean;
  sizeClass?: string;
  isSelected?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const [img, setImg] = useState<string | null>(card.image ?? null);
  const preview = usePreview();
  const [err, setErr] = useState<string | null>(null);
  const incCounter = useGame((s) => (s as any).incCounter as (id: string, delta: number) => void);
  const cloneCard = useGame((s) => (s as any).cloneCard as (id: string) => void);
  const moveAnyToLibraryTop = useGame((s) => (s as any).moveAnyToLibraryTop as (id: string) => void);
  const moveAnyToLibraryBottom = useGame((s) => (s as any).moveAnyToLibraryBottom as (id: string) => void);
  const moveToZone = useGame((s) => (s as any).moveToZone as (id: string, to: ZoneId) => void);
  const setCardCustomText = useGame((s) => (s as any).setCardCustomText as (id: string, text: string | null) => void);
  const lifeThemeIndex = useGame((s: any) => (typeof s?.lifeThemeIndex === "number" ? s.lifeThemeIndex : 0));
  const lifeThemeHex = useGame((s: any) => (typeof s?.lifeThemeHex === "string" ? s.lifeThemeHex : null));
  const lifeThemeImage = useGame((s: any) => (typeof s?.lifeThemeImage === "string" ? s.lifeThemeImage : null));
  const [menu, setMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    mode: "actions" | "customText";
    textDraft: string;
  }>({ open: false, x: 0, y: 0, mode: "actions", textDraft: "" });
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      if (card.image) {
        setImg(card.image);
        setErr(null);
        return;
      }
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
        try {
          const params = new URLSearchParams({
            q: `!"${nameStr}"`,
            order: "released",
            dir: "desc",
            unique: "prints",
          });
          const res = await fetch(`https://api.scryfall.com/cards/search?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.data)) {
              for (const entry of data.data) {
                const src = pick(entry);
                if (src) return src;
              }
            }
          }
        } catch {}
        return null;
      };
      try {
        let src = await tryAll(key);
        if (!src) {
          // fallback: strip common annotations
          const base = key.replace(/\s*\(.*\)\s*$/, "").replace(/\s*\/\/.*$/, "").trim();
          if (base && base !== key) {
            src = await tryAll(base);
          }
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
  }, [card.name, card.image]);

  const counterAppearance = useMemo(
    () => computeCounterAppearance(lifeThemeHex, lifeThemeIndex, lifeThemeImage),
    [lifeThemeHex, lifeThemeIndex, lifeThemeImage],
  );
  const counterTextColor = counterAppearance.textColor;
  const themedCounterStyle = counterAppearance.style;

  useEffect(() => {
    if (!menu.open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current || menuRef.current.contains(event.target as Node)) return;
      setMenu((prev) => ({ ...prev, open: false }));
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu((prev) => ({ ...prev, open: false }));
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menu.open]);

  const closeMenu = () => setMenu((prev) => ({ ...prev, open: false }));
  const handleCounter = (delta: number) => {
    incCounter(card.id, delta);
    closeMenu();
  };
  const handleClone = () => {
    cloneCard?.(card.id);
    closeMenu();
  };
  const handleMoveTop = () => {
    moveAnyToLibraryTop?.(card.id);
    closeMenu();
  };
  const handleMoveBottom = () => {
    moveAnyToLibraryBottom?.(card.id);
    closeMenu();
  };
  const handleMoveTo = (zone: ZoneId) => {
    moveToZone?.(card.id, zone);
    closeMenu();
  };
  const handleCustomTextSave = () => {
    const trimmed = menu.textDraft.trim();
    setCardCustomText?.(card.id, trimmed.length > 0 ? trimmed : null);
    closeMenu();
  };
  const handleCustomTextClear = () => {
    setCardCustomText?.(card.id, null);
    closeMenu();
  };

  return (
    <div
      className="relative inline-block align-top"
      onContextMenu={(e)=>{
        if (suppressContextMenu) return;
        e.preventDefault();
        const { clientX, clientY } = e;
        setMenu({ open: true, x: clientX, y: clientY, mode: "actions", textDraft: card.customText ?? "" });
      }}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => {
          if (onClick) onClick();
        }}
        onPointerEnter={() =>
          preview.hoverIn({
            name: card.name,
            counters: typeof card.counters === "number" ? card.counters : null,
            themeHex: lifeThemeHex,
            themeIndex: lifeThemeIndex,
            themeImage: lifeThemeImage,
            customText: card.customText ?? null,
          })
        }
        onPointerLeave={() => preview.hoverOut()}
        className={`relative select-none rounded-md border border-zinc-700 bg-zinc-800 shadow ${
          card.tapped ? "rotate-90" : ""
        } ${isSelected ? "ring-2 ring-amber-400" : ""} ${sizeClass} grid place-items-center text-[10px] text-zinc-200`}
        style={style}
        aria-label={card.name}
      >
        {!img && card.name}
        {(card.counters ?? 0) > 0 && (
          <div
            className="absolute left-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow select-none"
            style={{
              ...themedCounterStyle,
              top: "15%",
              color: counterTextColor,
              transform: "scale(1.25)",
              transformOrigin: "left top",
              textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.65)",
            }}
            title="Scroll to change counters"
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              incCounter(card.id, e.deltaY < 0 ? 1 : -1);
            }}
          >
            +{card.counters}
          </div>
        )}
        {card.customText && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-zinc-900/80 px-2 py-1 text-[11px] font-medium text-zinc-100">
            {card.customText}
          </div>
        )}
      </div>
      {menu.open && typeof window !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 w-52 rounded border border-zinc-800 bg-zinc-900 text-xs shadow font-mtgmasters"
            style={{ left: menu.x, top: menu.y }}
          >
          {menu.mode === "actions" ? (
            <div className="flex flex-col divide-y divide-zinc-800">
              <div className="flex flex-col">
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleCounter(+1)}>
                  +1/+1 Counter
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleCounter(-1)}>
                  -1/+1 Counter
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={handleClone}>
                  Clone Card
                </button>
              </div>
              <div className="flex flex-col">
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={handleMoveTop}>
                  Put on Top of Library
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={handleMoveBottom}>
                  Put on Bottom of Library
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("battlefield")}>
                  Move to Battlefield
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("lands")}>
                  Move to Lands
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("command")}>
                  Move to Command Zone
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("hand")}>
                  Move to Hand
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("graveyard")}>
                  Move to Graveyard
                </button>
                <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleMoveTo("exile")}>
                  Move to Exile
                </button>
              </div>
              <div className="flex flex-col">
                <button
                  className="px-3 py-2 text-left hover:bg-zinc-800"
                  onClick={() => setMenu((prev) => ({ ...prev, mode: "customText", textDraft: card.customText ?? "" }))}
                >
                  Set Custom Text
                </button>
                {card.customText && (
                  <button className="px-3 py-2 text-left hover:bg-zinc-800" onClick={handleCustomTextClear}>
                    Clear Custom Text
                  </button>
                )}
                <button className="px-3 py-2 text-left text-zinc-400 hover:bg-zinc-800" onClick={closeMenu}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3">
              <div className="space-y-1">
                <label htmlFor={`custom-text-${card.id}`} className="block text-[11px] uppercase tracking-wide text-zinc-400">
                  Custom Text
                </label>
                <input
                  id={`custom-text-${card.id}`}
                  autoFocus
                  value={menu.textDraft}
                  onChange={(event) => setMenu((prev) => ({ ...prev, textDraft: event.target.value }))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none"
                  placeholder="Enter text"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setMenu((prev) => ({ ...prev, mode: "actions" }))}
                >
                  Back
                </button>
                <button
                  className="rounded border border-emerald-500 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                  onClick={handleCustomTextSave}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          </div>,
          document.body,
        )}
    </div>
  );
}
