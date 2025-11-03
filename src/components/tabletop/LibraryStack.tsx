"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "../../state/game";

type DeckSummary = {
  id: string;
  name: string;
  updatedAt?: string | null;
};

type DeckEntryPayload = {
  name?: string;
  count?: number;
  commander?: boolean;
};

export default function LibraryStack() {
  const count = useGame((s: any) => (s?.zones?.library?.length ?? 0) as number);
  const draw = (n: number) => {
    const api: any = (useGame as any).getState?.();
    api?.draw?.(n);
  };
  const loadDeckFromNames = useGame((s: any) => (typeof s?.loadDeckFromNames === "function" ? s.loadDeckFromNames : null));
  const [x, setX] = useState(3);
  const [serverDecks, setServerDecks] = useState<DeckSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);

  const formatUpdated = useCallback((value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
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
        const commanders = entries
          .filter((entry): entry is DeckEntryPayload => !!entry && !!entry.commander)
          .map((entry) => String(entry.name ?? ""))
          .filter((name) => name.trim().length > 0);
        const cards = entries
          .filter((entry) => !!entry && !entry.commander)
          .map((entry) => ({
            name: String(entry?.name ?? ""),
            count: Math.max(1, typeof entry?.count === "number" ? entry.count : 1),
          }))
          .filter((entry) => entry.name.trim().length > 0);
        if (cards.length === 0 && commanders.length === 0) throw new Error("Deck empty");
        loadDeckFromNames?.(cards, commanders);
        try {
          const api: any = (useGame as any).getState?.();
          const snapshot = api?.snapshot?.();
          if (snapshot && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("game:local-change", { detail: snapshot }));
          }
        } catch (err) {
          console.warn("Failed to broadcast deck load", err);
        }
        setMenuOpen(false);
      } catch (error) {
        console.error("Failed to load deck", error);
        setDeckError(error instanceof Error ? error.message : "Failed to load deck");
      } finally {
        setDeckLoading(false);
      }
    },
    [deckLoading, loadDeckFromNames],
  );

  const handleToggleMenu = useCallback(() => {
    setDeckError(null);
    setMenuOpen((open) => {
      const next = !open;
      if (!open && !listLoading && serverDecks.length === 0) {
        refreshDecks();
      }
      return next;
    });
  }, [listLoading, refreshDecks, serverDecks.length]);

  const sortedDecks = useMemo(() => {
    return [...serverDecks].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [serverDecks]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-300">Library</div>
        <div className="relative">
          <button
            onClick={handleToggleMenu}
            className="rounded border border-sky-700 px-2 py-1 text-[11px] text-sky-300 hover:bg-zinc-800"
            type="button"
          >
            Choose Deck
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-2 w-60 rounded border border-zinc-800 bg-zinc-900 p-3 text-xs shadow-lg font-mtgmasters">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Server Decks</span>
                <button
                  onClick={refreshDecks}
                  disabled={listLoading}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {deckError && <div className="mt-2 text-[11px] text-rose-400">{deckError}</div>}
              {listLoading && <div className="mt-2 text-[11px] text-zinc-400">Loading...</div>}
              {!listLoading && sortedDecks.length === 0 && !deckError && (
                <div className="mt-2 text-[11px] text-zinc-500">No decks saved yet.</div>
              )}
              {!listLoading && sortedDecks.length > 0 && (
                <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                  {sortedDecks.map((deck) => (
                    <button
                      key={deck.id}
                      onClick={() => handleLoadDeck(deck.id)}
                      disabled={deckLoading}
                      className="flex w-full flex-col rounded border border-zinc-700 px-2 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
                      type="button"
                    >
                      <span className="truncate font-semibold">{deck.name}</span>
                      {deck.updatedAt && (
                        <span className="truncate text-[10px] text-zinc-500">{formatUpdated(deck.updatedAt)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
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
            style={{ transform: `translate(${i * 3}px, ${-i * 3}px)` }}
          />
        ))}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-zinc-400">
          {count} cards
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <button
          onClick={() => draw(1)}
          className="rounded-md bg-amber-500 px-2 py-1 font-semibold text-black hover:bg-amber-400"
        >
          Draw 1
        </button>
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
