"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlaymatAdjustment = {
  zoom: number;
  position: {
    x: number;
    y: number;
  };
};

const STORAGE_KEY = "playmat-adjustments";

const DEFAULT_ADJUSTMENT: PlaymatAdjustment = {
  zoom: 1,
  position: { x: 50, y: 50 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAdjustment(input: Partial<PlaymatAdjustment> | undefined, fallback: PlaymatAdjustment = DEFAULT_ADJUSTMENT): PlaymatAdjustment {
  const base = input ?? fallback;
  const zoom = clamp(base.zoom ?? fallback.zoom, 1, 4);
  const x = clamp(base.position?.x ?? fallback.position.x, 0, 100);
  const y = clamp(base.position?.y ?? fallback.position.y, 0, 100);
  return {
    zoom,
    position: { x, y },
  };
}

export function usePlaymatAdjustments() {
  const [adjustments, setAdjustments] = useState<Record<string, PlaymatAdjustment>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, Partial<PlaymatAdjustment>>;
        const normalized: Record<string, PlaymatAdjustment> = {};
        Object.entries(parsed ?? {}).forEach(([slug, value]) => {
          if (typeof slug !== "string" || !slug) return;
          normalized[slug] = normalizeAdjustment(value);
        });
        setAdjustments(normalized);
      }
    } catch (error) {
      console.error("Failed to load playmat adjustments:", error);
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      if (Object.keys(adjustments).length > 0) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(adjustments));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save playmat adjustments:", error);
    }
  }, [adjustments]);

  const setAdjustment = useCallback((slug: string, updates: Partial<PlaymatAdjustment>) => {
    if (typeof slug !== "string" || !slug.trim()) return;
    setAdjustments((prev) => {
      const existing = prev[slug] ?? DEFAULT_ADJUSTMENT;
      const next = normalizeAdjustment({
        zoom: updates.zoom ?? existing.zoom,
        position: {
          x: updates.position?.x ?? existing.position.x,
          y: updates.position?.y ?? existing.position.y,
        },
      }, existing);
      if (next.zoom === DEFAULT_ADJUSTMENT.zoom && next.position.x === DEFAULT_ADJUSTMENT.position.x && next.position.y === DEFAULT_ADJUSTMENT.position.y) {
        const { [slug]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [slug]: next };
    });
  }, []);

  const clearAdjustment = useCallback((slug: string) => {
    if (typeof slug !== "string" || !slug.trim()) return;
    setAdjustments((prev) => {
      if (!(slug in prev)) return prev;
      const { [slug]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  const resetAll = useCallback(() => {
    setAdjustments({});
  }, []);

  const getAdjustment = useCallback(
    (slug: string | null | undefined): PlaymatAdjustment => {
      if (!slug) return DEFAULT_ADJUSTMENT;
      return adjustments[slug] ?? DEFAULT_ADJUSTMENT;
    },
    [adjustments],
  );

  return {
    adjustments,
    getAdjustment,
    setAdjustment,
    clearAdjustment,
    resetAll,
    defaultAdjustment: DEFAULT_ADJUSTMENT,
  } as const;
}

export const PLAYMAT_DEFAULT_ADJUSTMENT = DEFAULT_ADJUSTMENT;
