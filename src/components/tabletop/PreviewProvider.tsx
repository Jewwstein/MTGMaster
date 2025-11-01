"use client";
import axios from "axios";
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";

type PreviewCtx = {
  hoverIn: (cardName: string) => void;
  hoverOut: () => void;
  img: string | null;
  name: string | null;
  loading: boolean;
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
  const openTimer = useRef<NodeJS.Timeout | null>(null);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);

  const doOpen = useCallback(async (name: string) => {
    setCardName(name);
    setLoading(true);
    const url = await getScryfallImage(name);
    setImg(url);
    setLoading(false);
  }, []);

  const hoverIn = useCallback((name: string) => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => doOpen(name), 350);
  }, [doOpen]);

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
    }, 200);
  }, []);

  const value = useMemo(() => ({ hoverIn, hoverOut, img, name: cardName, loading }), [hoverIn, hoverOut, img, cardName, loading]);

  return (
    <Ctx.Provider value={value}>{children}</Ctx.Provider>
  );
}
