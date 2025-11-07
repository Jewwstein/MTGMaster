"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import type { PageThemeManager } from "@/hooks/usePageTheme";

const DEFAULT_ACCENT_COLOR = "#f59e0b";

export default function PageThemeControls({
  manager,
  title = "Page Theme",
}: {
  manager: PageThemeManager;
  title?: string;
}) {
  const { theme, setTheme, clearTheme, isCustom, applyToAllPages } = manager;
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftTheme, setDraftTheme] = useState(theme);

  // Update draft theme when theme changes
  useEffect(() => {
    setDraftTheme({
      ...theme,
      backgroundPosition: { ...theme.backgroundPosition },
    });
  }, [theme]);

  const handleFileChange = useCallback((file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setDraftTheme(prev => ({
          ...prev,
          backgroundImage: result,
          backgroundZoom: 1,
          backgroundPosition: { x: 50, y: 50 },
        }));
        setError(null);
      }
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsDataURL(file);
  }, []);

  const handleAccentChange = useCallback((value: string) => {
    setDraftTheme(prev => ({
      ...prev,
      accentColor: value || DEFAULT_ACCENT_COLOR
    }));
  }, []);

  const handleApply = useCallback(() => {
    setTheme(draftTheme);
    setIsOpen(false);
  }, [draftTheme, setTheme]);

  const handleApplyToAll = useCallback(() => {
    setTheme(draftTheme);
    applyToAllPages(draftTheme);
    setIsOpen(false);
  }, [draftTheme, setTheme, applyToAllPages]);

  const handleReset = useCallback(() => {
    clearTheme();
    setIsOpen(false);
  }, [clearTheme]);

  const backgroundPreviewStyle = useMemo<CSSProperties | undefined>(() => {
    if (!draftTheme.backgroundImage) return undefined;
    const zoomPercent = Math.round((draftTheme.backgroundZoom || 1) * 100);
    const posX = Math.round(draftTheme.backgroundPosition?.x ?? 50);
    const posY = Math.round(draftTheme.backgroundPosition?.y ?? 50);
    return {
      backgroundImage: `url(${draftTheme.backgroundImage})`,
      backgroundSize: `${zoomPercent}% auto`,
      backgroundPosition: `${posX}% ${posY}%`,
      backgroundRepeat: "no-repeat",
    };
  }, [draftTheme.backgroundImage, draftTheme.backgroundZoom, draftTheme.backgroundPosition]);

  const handleZoomChange = useCallback((value: number) => {
    setDraftTheme(prev => ({
      ...prev,
      backgroundZoom: value,
    }));
  }, []);

  const handlePositionChange = useCallback((axis: "x" | "y", value: number) => {
    setDraftTheme(prev => ({
      ...prev,
      backgroundPosition: {
        ...prev.backgroundPosition,
        [axis]: value,
      },
    }));
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-600 transition-all duration-200 hover:scale-110"
        aria-label="Customize theme"
      >
        🎨
      </button>
    );
  }

  return (
    <div 
      className="fixed bottom-20 right-4 z-50 w-80 rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mtgmasters text-xs text-zinc-200 shadow-xl transition-all duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">{title}</h2>
          <p className="text-[11px] text-zinc-500">
            Customize your background and accent color.
          </p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-white"
          aria-label="Close theme settings"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Background Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            className="w-full cursor-pointer rounded border border-dashed border-zinc-700 bg-zinc-800 p-2 text-[11px] text-zinc-300 file:mr-2 file:cursor-pointer file:border-0 file:bg-amber-500 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-amber-600"
          />
          {draftTheme.backgroundImage && (
            <div
              className="mt-2 h-24 overflow-hidden rounded border border-zinc-700"
              style={backgroundPreviewStyle}
            />
          )}
        </div>

        {draftTheme.backgroundImage && (
          <div className="grid gap-3 rounded border border-zinc-800/60 bg-zinc-900/40 p-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Zoom ({draftTheme.backgroundZoom.toFixed(2)}×)
              </label>
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={draftTheme.backgroundZoom}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Horizontal ({Math.round(draftTheme.backgroundPosition.x)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draftTheme.backgroundPosition.x}
                  onChange={(event) => handlePositionChange("x", Number(event.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Vertical ({Math.round(draftTheme.backgroundPosition.y)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draftTheme.backgroundPosition.y}
                  onChange={(event) => handlePositionChange("y", Number(event.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Accent Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={draftTheme.accentColor || DEFAULT_ACCENT_COLOR}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded border border-zinc-700 bg-zinc-800"
            />
            <span className="text-[11px] text-zinc-400">
              {draftTheme.accentColor || DEFAULT_ACCENT_COLOR}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <div className="flex justify-between">
            <button
              onClick={handleApply}
              className="rounded bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600"
            >
              Apply to This Page
            </button>
            <button
              onClick={handleApplyToAll}
              className="rounded bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600"
            >
              Apply to All Pages
            </button>
          </div>
          <div className="flex justify-between">
            {isCustom && (
              <button
                onClick={handleReset}
                className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Reset to Default
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="ml-auto rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
