"use client";
import Image from "next/image";
import React from "react";
import { usePreview } from "./PreviewProvider";
import { computeCounterAppearance } from "./themeUtils";

export default function PreviewPanel() {
  const { img, name, loading, meta } = usePreview();
  const counterInfo = React.useMemo(() => {
    if (!meta || typeof meta.counters !== "number" || meta.counters <= 0) return null;
    const appearance = computeCounterAppearance(meta.themeHex ?? null, meta.themeIndex ?? 0, meta.themeImage ?? null);
    return {
      value: meta.counters,
      appearance,
    };
  }, [meta]);
  const previewCustomText = React.useMemo(() => {
    if (!meta || typeof meta.customText !== "string") return null;
    const trimmed = meta.customText.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [meta]);
  return (
    <div className="relative flex h-full min-h-[450px] flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-md bg-zinc-900/30">
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-zinc-950/70 px-2 py-1 text-xs">
          <h2 className="text-sm font-semibold text-zinc-300">Card Preview</h2>
          {name && <span className="max-w-[140px] truncate text-[11px] uppercase tracking-wide text-zinc-400" title={name}>{name}</span>}
        </div>
        {loading && (
          <div className="m-auto px-3 text-base text-zinc-400">Loading...</div>
        )}
        {!loading && img && (
          <Image
            src={img}
            alt={name ?? "Card"}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 260px"
            unoptimized
            priority
          />
        )}
        {!loading && !img && (
          <div className="m-auto px-3 text-center text-sm text-zinc-500">Hover a card to preview</div>
        )}
        {counterInfo && (
          <div className="pointer-events-none absolute left-4 flex items-center" style={{ top: "25%" }}>
            <div
              className="rounded-full px-2.5 py-1 text-sm font-bold shadow"
              style={{ color: counterInfo.appearance.textColor, ...counterInfo.appearance.style }}
            >
              +{counterInfo.value}
            </div>
          </div>
        )}
        {previewCustomText && (
          <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded bg-zinc-950/70 px-3 py-2 text-center text-sm font-medium text-zinc-100">
            {previewCustomText}
          </div>
        )}
      </div>
    </div>
  );
}
