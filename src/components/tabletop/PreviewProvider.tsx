"use client";
import axios from "axios";
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";

type PreviewTarget = {
  name: string;
  counters?: number | null;
  themeHex?: string | null;
  themeIndex?: number;
  themeImage?: string | null;
  customText?: string | null;
  image?: string | null;
};

type PreviewCtx = {
  hoverIn: (target: string | PreviewTarget) => void;
  hoverOut: () => void;
  img: string | null;
  name: string | null;
  loading: boolean;
  meta: PreviewTarget | null;
};

const Ctx = createContext<PreviewCtx | null>(null);

export function usePreview() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePreview must be used within PreviewProvider");
  return v;
}

const memoryCache = new Map<string, string>();
async function getScryfallImage(name: string): Promise<string | null> {
  const key = name.trim().replace(/\s+/g, " ");
  if (memoryCache.has(key)) return memoryCache.get(key)!;
  const tryMode = async (mode: "exact" | "fuzzy") => {
    const { data } = await axios.get(`https://api.scryfall.com/cards/named`, {
      params: { [mode]: key },
    });
    const img =
      data?.image_uris?.large ||
      data?.image_uris?.normal ||
      data?.card_faces?.[0]?.image_uris?.large ||
      data?.card_faces?.[0]?.image_uris?.normal;
    if (img) memoryCache.set(key, img as string);
    return (img as string) ?? null;
  };
  try {
    const exact = await tryMode("exact");
    if (exact) return exact;
  } catch {}
  try {
    const fuzzy = await tryMode("fuzzy");
    if (fuzzy) return fuzzy;
  } catch {}
  return null;
}

export default function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [cardName, setCardName] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<PreviewTarget | null>(null);
  const openTimer = useRef<NodeJS.Timeout | null>(null);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingTargetRef = useRef<PreviewTarget | null>(null);

  const normalizeTarget = useCallback((input: string | PreviewTarget): PreviewTarget => {
    if (typeof input === "string") {
      return { name: input };
    }
    return input;
  }, []);

  const doOpen = useCallback(async (target: PreviewTarget) => {
    pendingTargetRef.current = null;
    setMeta(target);
    setCardName(target.name);
    if (target.image && target.image.trim().length > 0) {
      setImg(target.image);
      setLoading(false);
      return;
    }
    setLoading(true);
    const url = await getScryfallImage(target.name);
    setImg(url);
    setLoading(false);
  }, []);

  const hoverIn = useCallback((target: string | PreviewTarget) => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const normalized = normalizeTarget(target);
    pendingTargetRef.current = normalized;
    openTimer.current = setTimeout(() => {
      if (pendingTargetRef.current) {
        doOpen(pendingTargetRef.current);
      }
    }, 350);
  }, [doOpen, normalizeTarget]);

  const hoverOut = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      // keep last image so panel doesn't flash empty
      setCardName(null);
      setLoading(false);
      setMeta(null);
    }, 200);
    pendingTargetRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ hoverIn, hoverOut, img, name: cardName, loading, meta }),
    [hoverIn, hoverOut, img, cardName, loading, meta],
  );

  return (
    <Ctx.Provider value={value}>{children}</Ctx.Provider>
  );
}
