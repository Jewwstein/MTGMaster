"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PageKey = "dashboard" | "decks" | "lobby";

type BackgroundPosition = {
  x: number;
  y: number;
};

export type PageTheme = {
  backgroundImage: string | null;
  accentColor: string;
  backgroundZoom: number;
  backgroundPosition: BackgroundPosition;
};

const DEFAULT_ACCENT_COLOR = "#f59e0b";
const DEFAULT_THEME: PageTheme = {
  backgroundImage: null,
  accentColor: DEFAULT_ACCENT_COLOR,
  backgroundZoom: 1,
  backgroundPosition: { x: 50, y: 50 },
};

type ThemeManager = {
  theme: PageTheme;
  setTheme: (updates: Partial<PageTheme>) => void;
  clearTheme: () => void;
  isCustom: boolean;
  applyToAllPages: (override?: PageTheme) => void;
};

function getStorageKey(page: PageKey) {
  return `page-theme:${page}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeThemeState(input: Partial<PageTheme> | PageTheme, base: PageTheme = DEFAULT_THEME): PageTheme {
  const merged = {
    ...base,
    ...input,
  } as PageTheme;

  const zoomCandidate = (input as PageTheme)?.backgroundZoom ?? merged.backgroundZoom ?? base.backgroundZoom;
  const positionCandidate = (input as PageTheme)?.backgroundPosition ?? merged.backgroundPosition ?? base.backgroundPosition;

  const zoom = clamp(Number.isFinite(zoomCandidate) ? Number(zoomCandidate) : base.backgroundZoom, 1, 4);
  const posX = clamp(positionCandidate?.x ?? base.backgroundPosition.x, 0, 100);
  const posY = clamp(positionCandidate?.y ?? base.backgroundPosition.y, 0, 100);

  return {
    ...merged,
    accentColor: merged.accentColor || DEFAULT_ACCENT_COLOR,
    backgroundZoom: zoom,
    backgroundPosition: { x: posX, y: posY },
  };
}

function applyThemeToDocument(theme: PageTheme) {
  if (typeof document === "undefined") return;

  // Apply background image
  if (theme.backgroundImage) {
    document.documentElement.style.setProperty(
      "--theme-bg-image",
      `url(${theme.backgroundImage})`
    );
  } else {
    document.documentElement.style.removeProperty("--theme-bg-image");
  }

  // Always apply accent color
  document.documentElement.style.setProperty(
    "--accent-color",
    theme.accentColor || DEFAULT_ACCENT_COLOR
  );

  const zoom = Number.isFinite(theme.backgroundZoom) ? clamp(theme.backgroundZoom, 1, 4) : 1;
  const posX = clamp(theme.backgroundPosition?.x ?? 50, 0, 100);
  const posY = clamp(theme.backgroundPosition?.y ?? 50, 0, 100);

  document.documentElement.style.setProperty(
    "--theme-bg-size",
    `${(zoom * 100).toFixed(0)}% auto`
  );

  document.documentElement.style.setProperty(
    "--theme-bg-position",
    `${posX.toFixed(0)}% ${posY.toFixed(0)}%`
  );
}

export function usePageTheme(page: PageKey): ThemeManager {
  const [theme, setTheme] = useState<PageTheme>(DEFAULT_THEME);
  const hydratedRef = useRef(false);
  const storageKey = getStorageKey(page);

  // Load theme from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PageTheme>;
        const loadedTheme = normalizeThemeState(parsed, DEFAULT_THEME);
        setTheme(loadedTheme);
        applyThemeToDocument(loadedTheme);
      }
    } catch (error) {
      console.error("Failed to load theme:", error);
    } finally {
      hydratedRef.current = true;
    }
  }, [storageKey]);

  // Save theme to localStorage and apply to document when it changes
  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    
    try {
      if (
        theme.backgroundImage ||
        theme.accentColor !== DEFAULT_ACCENT_COLOR ||
        theme.backgroundZoom !== DEFAULT_THEME.backgroundZoom ||
        theme.backgroundPosition.x !== DEFAULT_THEME.backgroundPosition.x ||
        theme.backgroundPosition.y !== DEFAULT_THEME.backgroundPosition.y
      ) {
        window.localStorage.setItem(storageKey, JSON.stringify(theme));
      } else {
        window.localStorage.removeItem(storageKey);
      }
      applyThemeToDocument(theme);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  }, [storageKey, theme]);

  const updateTheme = useCallback((updates: Partial<PageTheme>) => {
    setTheme(prev => normalizeThemeState(updates, prev));
  }, []);

  const clearTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
        applyThemeToDocument(DEFAULT_THEME);
      } catch (error) {
        console.error("Failed to clear theme:", error);
      }
    }
  }, [storageKey]);

  const applyToAllPages = useCallback((override?: PageTheme) => {
    if (typeof window === "undefined") return;
    const target = normalizeThemeState(override ?? theme, theme);

    const allPages: PageKey[] = ["dashboard", "decks", "lobby"];
    allPages.forEach(pageKey => {
      if (pageKey !== page) {
        const key = getStorageKey(pageKey);
        window.localStorage.setItem(key, JSON.stringify(target));
      }
    });
  }, [page, theme]);

  const isZoomCustom =
    theme.backgroundZoom !== DEFAULT_THEME.backgroundZoom ||
    theme.backgroundPosition.x !== DEFAULT_THEME.backgroundPosition.x ||
    theme.backgroundPosition.y !== DEFAULT_THEME.backgroundPosition.y;

  const isCustom = Boolean(
    theme.backgroundImage || 
    (theme.accentColor && theme.accentColor !== DEFAULT_ACCENT_COLOR) ||
    isZoomCustom
  );

  return {
    theme,
    setTheme: updateTheme,
    clearTheme,
    isCustom,
    applyToAllPages,
  };
}

export type PageThemeManager = ReturnType<typeof usePageTheme>;
