"use client";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useGame } from "../../state/game";

const SLEEVE_PRESETS: ReadonlyArray<{
  id: string;
  name: string;
  gradient: string;
  accent?: string;
}> = Object.freeze([
  {
    id: "nebula",
    name: "Nebula",
    gradient: "linear-gradient(135deg, #1f2937 0%, #111827 45%, #4c1d95 100%)",
  },
  {
    id: "emerald",
    name: "Emerald",
    gradient: "linear-gradient(135deg, #022c22 0%, #064e3b 45%, #10b981 100%)",
  },
  {
    id: "sunset",
    name: "Sunset",
    gradient: "linear-gradient(135deg, #422006 0%, #9a3412 50%, #f97316 100%)",
  },
  {
    id: "ocean",
    name: "Ocean",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #38bdf8 100%)",
  },
  {
    id: "rose",
    name: "Rose",
    gradient: "linear-gradient(135deg, #2d0a1f 0%, #be123c 50%, #f472b6 100%)",
  },
  {
    id: "ashen",
    name: "Ashen",
    gradient: "linear-gradient(135deg, #27272a 0%, #3f3f46 50%, #a1a1aa 100%)",
  },
]);

function resolveSleeveStyle(value: string | null): React.CSSProperties {
  if (!value) return {};
  if (value.startsWith("preset:")) {
    const id = value.slice("preset:".length);
    const preset = SLEEVE_PRESETS.find((entry) => entry.id === id);
    if (!preset) return {};
    return {
      backgroundImage: preset.gradient,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (value.startsWith("image:")) {
    const src = value.slice("image:".length);
    if (!src) return {};
    return {
      backgroundImage: `url(${src})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (value.startsWith("data:")) {
    return {
      backgroundImage: `url(${value})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return {
    backgroundImage: `url(${value})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

function describeSleeve(value: string | null): string {
  if (!value) return "None";
  if (value.startsWith("preset:")) {
    const id = value.slice("preset:".length);
    const preset = SLEEVE_PRESETS.find((entry) => entry.id === id);
    return preset ? preset.name : "Preset";
  }
  return "Custom image";
}

type DeckSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

type DeckEntryPayload = {
  name?: string;
  count?: number;
  commander?: boolean;
  image?: string | null;
};

type LocalDeckEntry = {
  id: string;
  name: string;
  cards: DeckEntryPayload[];
};

export default function LibraryStack() {
  const count = useGame((s: any) => (s?.zones?.library?.length ?? 0) as number);
  const apiRef = useRef<any>(null);
  useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  });
  const draw = useCallback(
    (n: number) => {
      apiRef.current?.draw?.(n);
    },
    [],
  );
  const loadDeckFromNames = useGame((s: any) => (typeof s?.loadDeckFromNames === "function" ? s.loadDeckFromNames : null));
  const [x, setX] = useState(3);
  const [localDecks, setLocalDecks] = useState<LocalDeckEntry[]>([]);
  const [serverDecks, setServerDecks] = useState<DeckSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [sleeveModalOpen, setSleeveModalOpen] = useState(false);
  const [sleeveSelection, setSleeveSelection] = useState<string | null>(null);
  const [sleeveUploadPreview, setSleeveUploadPreview] = useState<string | null>(null);

  const formatUpdated = useCallback((value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }, []);

  const readSleeve = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("library_sleeve_v2");
      if (stored && stored.trim().length > 0) {
        setSleeveSelection(stored.trim());
      } else {
        setSleeveSelection(null);
      }
    } catch (error) {
      console.warn("Failed to read library sleeve", error);
    }
  }, []);

  const readLocalDecks = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("saved_decks_v1");
      if (!raw) {
        setLocalDecks([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setLocalDecks([]);
        return;
      }
      const normalized = parsed
        .map((entry: any): LocalDeckEntry | null => {
          if (!entry || typeof entry !== "object") return null;
          const id = typeof entry.id === "string" ? entry.id : null;
          if (!id) return null;
          const name = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : "Untitled Deck";
          const deckMap = entry.deck && typeof entry.deck === "object" ? entry.deck : {};
          const cards = Object.values(deckMap)
            .map((value: any): DeckEntryPayload | null => {
              if (!value || typeof value !== "object") return null;
              const cardName = typeof value.name === "string" ? value.name.trim() : "";
              if (!cardName) return null;
              const countRaw = value.count;
              let count = 1;
              if (typeof countRaw === "number" && Number.isFinite(countRaw)) count = countRaw;
              else if (typeof countRaw === "string") {
                const parsedCount = parseInt(countRaw, 10);
                if (Number.isFinite(parsedCount) && parsedCount > 0) count = parsedCount;
              }
              count = Math.max(1, count);
              return {
                name: cardName,
                count,
                commander: !!value.commander,
                image: typeof value.image === "string" ? value.image : null,
              };
            })
            .filter(Boolean) as DeckEntryPayload[];
          return { id, name, cards };
        })
        .filter(Boolean) as LocalDeckEntry[];
      setLocalDecks(normalized);
    } catch (error) {
      console.warn("Failed to read local decks", error);
    }
  }, []);

  const refreshDecks = useCallback(async () => {
    setListLoading(true);
    setDeckError(null);
    try {
      const res = await fetch("/api/decks", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const normalized = Array.isArray(data?.decks)
        ? (data.decks
            .map((entry: any): DeckSummary | null => {
              if (!entry || typeof entry.id !== "string") return null;
              const name = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : "Untitled Deck";
              return {
                id: entry.id,
                name,
                updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : entry.updatedAt ? String(entry.updatedAt) : null,
              };
            })
            .filter(Boolean) as DeckSummary[])
        : [];
      setServerDecks(normalized);
    } catch (error) {
      console.error("Failed to load server decks", error);
      setDeckError("Failed to load server decks");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDecks();
  }, [refreshDecks]);

  useEffect(() => {
    readLocalDecks();
    readSleeve();
  }, [readLocalDecks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => readLocalDecks();
    window.addEventListener("decks:local-changed", handler);
    const serverHandler = () => refreshDecks();
    window.addEventListener("decks:server-updated", serverHandler);
    return () => {
      window.removeEventListener("decks:local-changed", handler);
      window.removeEventListener("decks:server-updated", serverHandler);
    };
  }, [readLocalDecks, refreshDecks]);

  const saveSleeve = useCallback((next: string | null) => {
    const normalized = next && next.trim().length > 0 ? next.trim() : null;
    setSleeveSelection(normalized);
    if (typeof window !== "undefined") {
      try {
        if (normalized) {
          window.localStorage.setItem("library_sleeve_v2", normalized);
        } else {
          window.localStorage.removeItem("library_sleeve_v2");
        }
      } catch (error) {
        console.warn("Failed to persist sleeve", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!sleeveSelection) {
      setSleeveUploadPreview(null);
      return;
    }
    if (sleeveSelection.startsWith("preset:")) {
      setSleeveUploadPreview(null);
      return;
    }
    if (sleeveSelection.startsWith("image:")) {
      setSleeveUploadPreview(sleeveSelection.slice("image:".length));
      return;
    }
    setSleeveUploadPreview(sleeveSelection);
  }, [sleeveSelection]);

  const sleeveStyle = useMemo(() => resolveSleeveStyle(sleeveSelection), [sleeveSelection]);
  const sleeveDescription = useMemo(() => describeSleeve(sleeveSelection), [sleeveSelection]);
  const activeSleevePreset = sleeveSelection?.startsWith("preset:") ? sleeveSelection.slice("preset:".length) : null;

  const handleSleevePresetSelect = useCallback(
    (presetId: string) => {
      saveSleeve(`preset:${presetId}`);
    },
    [saveSleeve],
  );

  const handleSleeveUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string" && reader.result.trim().length > 0) {
          saveSleeve(reader.result);
        }
      };
      reader.onerror = () => {
        console.warn("Failed to read sleeve image", reader.error);
      };
      reader.readAsDataURL(file);
      // reset input to allow same file re-selection
      event.target.value = "";
    },
    [saveSleeve],
  );

  const clearSleeve = useCallback(() => {
    saveSleeve(null);
    setSleeveUploadPreview(null);
  }, [saveSleeve]);

  const broadcastSnapshot = useCallback(() => {
    try {
      const api: any = (useGame as any).getState?.();
      const snapshot = api?.snapshot?.();
      if (snapshot && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("game:local-change", { detail: snapshot }));
      }
    } catch (err) {
      console.warn("Failed to broadcast deck load", err);
    }
  }, []);

  const handleLoadDeck = useCallback(
    async (deckId: string) => {
      if (deckLoading) return;
      const trimmed = typeof deckId === "string" ? deckId.trim() : "";
      if (!trimmed) {
        setDeckError("Deck id missing");
        return;
      }
      setDeckLoading(true);
      setDeckError(null);
      try {
        const res = await fetch(`/api/decks/${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) {
          let message = `status ${res.status}`;
          try {
            const payload = await res.json();
            if (payload?.error) message = String(payload.error);
          } catch {}
          throw new Error(message);
        }
        const data = await res.json();
        const entries = Array.isArray(data?.entries) ? (data.entries as DeckEntryPayload[]) : [];
        if (entries.length === 0) {
          setDeckError("Selected server deck has no saved cards. Try re-saving it from the Deck Builder.");
          return;
        }
        const commanders = entries
          .filter((entry): entry is DeckEntryPayload => !!entry && !!entry.commander)
          .map((entry) => String(entry.name ?? ""))
          .filter((name) => name.trim().length > 0);
        const cards = entries
          .filter((entry) => !!entry && typeof entry.name === "string")
          .map((entry) => ({
            name: String(entry?.name ?? ""),
            count: Math.max(1, typeof entry?.count === "number" ? entry.count : 1),
            image: typeof entry?.image === "string" ? entry.image : null,
            commander: !!entry?.commander,
          }))
          .filter((entry) => entry.name.trim().length > 0);
        if (cards.length === 0 && commanders.length === 0) {
          setDeckError("Selected server deck has no loadable cards.");
          return;
        }
        loadDeckFromNames?.(cards, commanders);
        broadcastSnapshot();
        setMenuOpen(false);
      } catch (error) {
        console.error("Failed to load deck", error);
        setDeckError(error instanceof Error ? error.message : "Failed to load deck");
      } finally {
        setDeckLoading(false);
      }
    },
    [deckLoading, loadDeckFromNames, broadcastSnapshot],
  );

  const handleLoadLocalDeck = useCallback(
    (deck: LocalDeckEntry) => {
      if (deckLoading) return;
      if (!deck) {
        setDeckError("Deck data missing");
        return;
      }
      setDeckLoading(true);
      setDeckError(null);
      try {
        const cards = deck.cards
          .filter((entry) => !!entry && typeof entry.name === "string")
          .map((entry) => ({
            name: String(entry.name ?? "").trim(),
            count: Math.max(1, typeof entry.count === "number" ? entry.count : 1),
            image: typeof entry.image === "string" ? entry.image : null,
            commander: !!entry.commander,
          }))
          .filter((entry) => entry.name.length > 0);
        const commanders = cards.filter((entry) => entry.commander).map((entry) => entry.name);
        const libraryCards = cards.filter((entry) => !entry.commander);
        if (libraryCards.length === 0 && commanders.length === 0) throw new Error("Deck empty");
        loadDeckFromNames?.(cards, commanders);
        broadcastSnapshot();
        setMenuOpen(false);
      } catch (error) {
        console.error("Failed to load local deck", error);
        setDeckError(error instanceof Error ? error.message : "Failed to load deck");
      } finally {
        setDeckLoading(false);
      }
    },
    [deckLoading, loadDeckFromNames, broadcastSnapshot],
  );

  const handleToggleMenu = useCallback(() => {
    setDeckError(null);
    setMenuOpen((open) => {
      const next = !open;
      if (!open) {
        readLocalDecks();
        if (!listLoading && serverDecks.length === 0) {
          refreshDecks();
        }
      }
      return next;
    });
  }, [listLoading, readLocalDecks, refreshDecks, serverDecks.length]);

  const refreshAllDecks = useCallback(() => {
    readLocalDecks();
    refreshDecks();
  }, [readLocalDecks, refreshDecks]);

  const sortedDecks = useMemo(() => {
    return [...serverDecks].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [serverDecks]);

  const sortedLocalDecks = useMemo(() => {
    return [...localDecks].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [localDecks]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-300">Library</div>
        <div className="relative flex items-center gap-2">
          <button
            onClick={handleToggleMenu}
            className="rounded border border-sky-700 px-2 py-1 text-[11px] text-sky-300 hover:bg-zinc-800"
            type="button"
          >
            Choose Deck
          </button>
          <button
            onClick={() => {
              setSleeveModalOpen(true);
              setDeckError(null);
            }}
            className="rounded border border-amber-600 px-2 py-1 text-[11px] text-amber-300 hover:bg-zinc-800"
            type="button"
          >
            Card Sleeve
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-2 w-64 rounded border border-zinc-800 bg-zinc-900 p-3 text-xs shadow-lg font-mtgmasters">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Deck Sources</span>
                <button
                  onClick={refreshAllDecks}
                  disabled={listLoading}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {deckError && <div className="mt-2 text-[11px] text-rose-400">{deckError}</div>}

              <div className="mt-2 space-y-3">
                <div>
                  <div className="font-semibold text-zinc-200">Local Decks</div>
                  {sortedLocalDecks.length === 0 && (
                    <div className="mt-2 text-[11px] text-zinc-500">No local decks saved yet.</div>
                  )}
                  {sortedLocalDecks.length > 0 && (
                    <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1">
                      {sortedLocalDecks.map((deck) => (
                        <button
                          key={deck.id}
                          onClick={() => handleLoadLocalDeck(deck)}
                          disabled={deckLoading}
                          className="flex w-full flex-col gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-left text-[12px] text-zinc-200 transition hover:border-amber-400 hover:bg-zinc-900/80 disabled:opacity-60"
                          type="button"
                        >
                          <span className="truncate font-semibold">{deck.name}</span>
                          <span className="truncate text-[11px] text-zinc-400">
                            {deck.cards.reduce((sum, card) => sum + Math.max(1, typeof card.count === "number" ? card.count : 1), 0)} cards
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-semibold text-zinc-200">Server Decks</div>
                  {listLoading && <div className="mt-2 text-[11px] text-zinc-400">Loading server decks...</div>}
                  {!listLoading && sortedDecks.length === 0 && !deckError && (
                    <div className="mt-2 text-[11px] text-zinc-500">No server decks saved yet.</div>
                  )}
                  {!listLoading && sortedDecks.length > 0 && (
                    <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1">
                      {sortedDecks.map((deck) => (
                        <button
                          key={deck.id}
                          onClick={() => handleLoadDeck(deck.id)}
                          disabled={deckLoading}
                          className="flex w-full flex-col gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-left text-[14px] text-zinc-200 transition hover:border-amber-400 hover:bg-zinc-900/80 disabled:opacity-60"
                          type="button"
                        >
                          <span className="truncate font-semibold">{deck.name}</span>
                          {!!deck.updatedAt && <span className="truncate text-[12px] text-zinc-400">Updated {formatUpdated(deck.updatedAt)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {sleeveModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10" onClick={() => setSleeveModalOpen(false)}>
              <div
                className="relative w-full max-w-3xl rounded-xl border border-amber-600/60 bg-zinc-950 p-6 text-sm text-zinc-100 shadow-xl font-mtgmasters"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-amber-200">Library Card Sleeve</h3>
                    <p className="text-xs text-zinc-400">Choose a preset sleeve or upload your own artwork.</p>
                  </div>
                  <button
                    onClick={() => setSleeveModalOpen(false)}
                    className="rounded border border-zinc-700 px-3 py-1 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-800"
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-amber-200">Active Sleeve</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div
                          className="h-20 w-14 flex-shrink-0 rounded-md border border-amber-500/40"
                          style={{
                            backgroundImage: sleeveStyle.backgroundImage,
                            backgroundSize: sleeveStyle.backgroundSize,
                            backgroundPosition: sleeveStyle.backgroundPosition,
                          }}
                        >
                          {!sleeveSelection && <div className="flex h-full w-full items-center justify-center text-[10px] text-amber-200/70">Default</div>}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-amber-100">{sleeveDescription}</div>
                          {sleeveUploadPreview && (
                            <div className="mt-1 text-[10px] text-zinc-400">Custom image stored locally.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-zinc-200">Preset Sleeves</div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {SLEEVE_PRESETS.map((preset) => {
                          const active = activeSleevePreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleSleevePresetSelect(preset.id)}
                              className={`flex items-center gap-3 rounded border px-3 py-2 text-left text-xs transition hover:border-amber-400 hover:text-amber-200 ${
                                active ? "border-amber-500 text-amber-200" : "border-zinc-800 text-zinc-300"
                              }`}
                              type="button"
                            >
                              <span
                                className="h-12 w-12 flex-shrink-0 rounded-md border border-zinc-800"
                                style={{ backgroundImage: preset.gradient, backgroundSize: "cover", backgroundPosition: "center" }}
                              />
                              <span className="font-semibold">{preset.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="text-sm font-semibold text-zinc-200">Upload custom sleeve</div>
                    <p className="text-xs text-zinc-500">PNG, JPEG, WebP up to ~5 MB. Stored locally in your browser.</p>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleSleeveUpload}
                      className="w-full text-[11px] text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-black hover:file:bg-amber-400"
                    />
                    {sleeveUploadPreview && (
                      <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-center">
                        <div className="text-[10px] text-zinc-500">Preview</div>
                        <img src={sleeveUploadPreview} alt="Sleeve preview" className="mx-auto mt-2 h-24 w-18 rounded object-cover" />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setSleeveModalOpen(false)}
                        className="rounded border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
                        type="button"
                      >
                        Done
                      </button>
                      <button
                        onClick={clearSleeve}
                        className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                        type="button"
                      >
                        Clear Sleeve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        role="button"
        onClick={() => draw(1)}
        className="mt-3 relative h-28 w-20 cursor-pointer select-none"
        title="Click to draw 1"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-md border border-zinc-700 bg-zinc-800 shadow"
            style={{
              transform: `translate(${i * 3}px, ${-i * 3}px)`,
              ...sleeveStyle,
            }}
          />
        ))}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-zinc-400">
          {count} cards
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs justify-end">
        <input
          type="number"
          min={1}
          value={x}
          onChange={(e) => setX(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 outline-none"
        />
        <button
          onClick={() => draw(x)}
          className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
        >
          Draw X
        </button>
      </div>
    </div>
  );
}
