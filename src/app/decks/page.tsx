"use client";
import React from "react";
import Image from "next/image";
import { useGame } from "../../state/game";

type DeckEntry = { name: string; count: number; commander?: boolean };

export default function DecksPage() {
  const [deckName, setDeckName] = React.useState("New Commander Deck");
  const [deck, setDeck] = React.useState<Record<string, DeckEntry>>({});
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<{ name: string; type_line?: string; image?: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [paste, setPaste] = React.useState("");
  const [importUrl, setImportUrl] = React.useState("");
  const loadDeck = useGame((s) => (s as any).loadDeckFromNames as (cards:{name:string;count:number}[], commanders:string[])=>void);
  const [saved, setSaved] = React.useState<{ id: string; name: string; deck: Record<string, DeckEntry> }[]>([]);
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
  const [serverDecks, setServerDecks] = React.useState<{ id: string; name: string; updatedAt?: string }[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function ensureThumb(name: string) {
    if (thumbs[name]) return;
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
      const data = await res.json();
      const img =
        data?.image_uris?.small ||
        data?.image_uris?.normal ||
        data?.card_faces?.[0]?.image_uris?.small ||
        data?.card_faces?.[0]?.image_uris?.normal;
      if (img) setThumbs((t) => ({ ...t, [name]: img }));
    } catch {}
  }

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("saved_decks_v1");
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);
  function persistSaved(next: { id: string; name: string; deck: Record<string, DeckEntry> }[]) {
    setSaved(next);
    try { localStorage.setItem("saved_decks_v1", JSON.stringify(next)); } catch {}
  }
  function saveCurrent() {
    const id = Math.random().toString(36).slice(2);
    const entry = { id, name: deckName || "Untitled Deck", deck: deck };
    persistSaved([entry, ...saved].slice(0, 50));
  }
  function loadSaved(id: string) {
    const item = saved.find((s) => s.id === id);
    if (!item) return;
    setDeckName(item.name);
    setDeck(item.deck);
  }
  function deleteSaved(id: string) {
    persistSaved(saved.filter((s) => s.id !== id));
  }

  async function refreshServerDecks() {
    try {
      const res = await fetch("/api/decks", { cache: "no-store" });
      const data = await res.json();
      setServerDecks(Array.isArray(data?.decks) ? data.decks : []);
    } catch {}
  }
  React.useEffect(() => {
    refreshServerDecks();
  }, []);

  async function saveToServer() {
    if (busy) return;
    setBusy(true);
    try {
      const entries = Object.values(deck).map((e) => ({ name: e.name, count: e.count, commander: !!e.commander }));
      await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deckName || "Untitled Deck", entries }),
      });
      await refreshServerDecks();
    } finally {
      setBusy(false);
    }
  }
  async function loadServer(id: string) {
    try {
      const res = await fetch(`/api/decks/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!data || !data.entries) return;
      setDeckName(data.name || deckName);
      const next: Record<string, DeckEntry> = {};
      for (const e of data.entries as { name: string; count: number; commander?: boolean }[]) {
        next[e.name] = { name: e.name, count: e.count, commander: !!e.commander };
      }
      setDeck(next);
    } catch {}
  }
  async function deleteServer(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/decks/${id}`, { method: "DELETE" });
      await refreshServerDecks();
    } finally {
      setBusy(false);
    }
  }

  function addCard(name: string, delta = 1) {
    setDeck((d) => {
      const cur = d[name]?.count ?? 0;
      const next = Math.max(0, cur + delta);
      const commander = d[name]?.commander ?? false;
      const copy = { ...d } as Record<string, DeckEntry>;
      if (next === 0) delete copy[name];
      else copy[name] = { name, count: next, commander };
      return copy;
    });
  }
  function toggleCommander(name: string) {
    setDeck((d) => {
      const entry = d[name] ?? { name, count: 1, commander: false };
      const copy = { ...d } as Record<string, DeckEntry>;
      copy[name] = { ...entry, commander: !entry.commander };
      return copy;
    });
  }

  async function searchScryfall(term: string) {
    setLoading(true);
    try {
      const url = `https://api.scryfall.com/cards/search`;
      const params = new URLSearchParams({ q: term });
      const res = await fetch(`${url}?${params.toString()}`);
      const data = await res.json();
      const items = Array.isArray(data?.data)
        ? data.data.map((d: any) => ({
            name: d?.name as string,
            type_line: d?.type_line as string | undefined,
            image:
              d?.image_uris?.small ||
              d?.image_uris?.normal ||
              d?.card_faces?.[0]?.image_uris?.small ||
              d?.card_faces?.[0]?.image_uris?.normal,
          }))
        : [];
      setResults(items.slice(0, 20));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function importFromText(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const acc: Record<string, number> = {};
    for (const line of lines) {
      const m = line.match(/^(.*?)(?:\s+x(\d+))?$/i);
      if (!m) continue;
      const name = m[1].trim();
      const cnt = m[2] ? parseInt(m[2], 10) : 1;
      if (!name) continue;
      acc[name] = (acc[name] ?? 0) + (isFinite(cnt) ? cnt : 1);
    }
    for (const [name, count] of Object.entries(acc)) addCard(name, count);
  }

  async function importFromUrl(url: string) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("moxfield.com")) {
        const res = await fetch(url, { cache: "no-store" });
        const html = await res.text();
        // best-effort parse for card names within the page
        const names = Array.from(html.matchAll(/data-card-name=\"([^\"]+)\"/g)).map((m) => m[1]);
        if (names.length) {
          const acc: Record<string, number> = {};
          names.forEach((n) => (acc[n] = (acc[n] ?? 0) + 1));
          for (const [name, count] of Object.entries(acc)) addCard(name, count);
          return;
        }
      }
      if (u.hostname.includes("archidekt.com")) {
        const res = await fetch(url, { cache: "no-store" });
        const html = await res.text();
        const names = Array.from(html.matchAll(/\bcardName\":\"([^\"]+)\"/g)).map((m) => m[1]);
        if (names.length) {
          const acc: Record<string, number> = {};
          names.forEach((n) => (acc[n] = (acc[n] ?? 0) + 1));
          for (const [name, count] of Object.entries(acc)) addCard(name, count);
          return;
        }
      }
      // fallback: try to detect "Card Name xN" patterns in page
      const res = await fetch(url, { cache: "no-store" });
      const html = await res.text();
      const lines = html.split(/\n/);
      importFromText(lines.join("\n"));
    } catch (e) {
      // ignore errors for now
    }
  }

  function loadToLibrary() {
    const entries = Object.values(deck);
    const commanders = entries.filter((e) => e.commander).map((e) => e.name);
    const cards = entries
      .filter((e) => !e.commander)
      .map((e) => ({ name: e.name, count: e.count }));
    loadDeck(cards, commanders);
  }

  const total = Object.values(deck).reduce((s, e) => s + e.count, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold">Deck Builder</h1>
        <div className="mt-1 text-sm text-zinc-400">Search, paste, or import a deck. Mark commanders, then load to Library.</div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          {/* Left: Search */}
          <div className="col-span-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search Scryfall (name/type/oracle)..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
              />
              <button onClick={() => searchScryfall(q)} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400">
                Search
              </button>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-300">Server Decks (public)</div>
                <button onClick={refreshServerDecks} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Refresh</button>
              </div>
              {serverDecks.length === 0 && <div className="mt-2 text-sm text-zinc-500">No server decks yet</div>}
              {serverDecks.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-800">
                  {serverDecks.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="truncate">{s.name}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => loadServer(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Load</button>
                        <button onClick={() => deleteServer(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 max-h-[520px] overflow-auto">
              {loading && <div className="px-2 py-1 text-xs text-zinc-400">Loading...</div>}
              {!loading && results.length === 0 && <div className="px-2 py-1 text-xs text-zinc-500">No results</div>}
              <div className="grid grid-cols-2 gap-2">
                {results.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 rounded border border-zinc-800 p-2">
                    {r.image ? (
                      <Image src={r.image} alt={r.name} width={48} height={67} className="h-16 w-12 flex-shrink-0 rounded" unoptimized />
                    ) : (
                      <div className="h-16 w-12 flex-shrink-0 rounded border border-zinc-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.name}</div>
                      <div className="truncate text-[11px] text-zinc-500">{r.type_line}</div>
                    </div>
                    <button onClick={() => addCard(r.name, 1)} className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
                      Add
                    </button>
                    <button onClick={() => toggleCommander(r.name)} className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
                      Commander
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Deck + Imports */}
          <div className="col-span-6 flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2">
                <input
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
                <div className="text-sm text-zinc-400">{total} cards</div>
              </div>
              <div className="mt-3 max-h-64 overflow-auto rounded border border-zinc-800">
                {Object.values(deck).length === 0 && <div className="px-3 py-2 text-sm text-zinc-500">No cards added</div>}
                {Object.values(deck).length > 0 && (
                  <div className="divide-y divide-zinc-800">
                    {Object.values(deck).map((e) => (
                      <div
                        key={e.name}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                        onMouseEnter={() => ensureThumb(e.name)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {thumbs[e.name] ? (
                            <Image src={thumbs[e.name]} alt={e.name} width={28} height={39} className="h-10 w-7 flex-shrink-0 rounded" unoptimized />
                          ) : (
                            <div className="h-10 w-7 flex-shrink-0 rounded border border-zinc-700" />
                          )}
                          <span className="w-6 text-right font-mono">{e.count}×</span>
                          <span className="truncate">{e.name}</span>
                          {e.commander && <span className="rounded bg-sky-600/20 px-2 py-[2px] text-[10px] text-sky-300">Commander</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => addCard(e.name, -1)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">-1</button>
                          <button onClick={() => addCard(e.name, 1)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">+1</button>
                          <button onClick={() => toggleCommander(e.name)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Cmd</button>
                          <button onClick={() => addCard(e.name, -e.count)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={saveCurrent} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Save Deck</button>
                <button onClick={loadToLibrary} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400">Load to Library</button>
                <button onClick={saveToServer} disabled={busy} className="rounded-md border border-sky-700 px-3 py-2 text-sm text-sky-300 hover:bg-zinc-800 disabled:opacity-50">Save to Server</button>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Saved Decks (local)</div>
              {saved.length === 0 && <div className="mt-2 text-sm text-zinc-500">No saved decks yet</div>}
              {saved.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-800">
                  {saved.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="truncate">{s.name}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => loadSaved(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Load</button>
                        <button onClick={() => deleteSaved(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Paste from Text</div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'One per line. Examples:\nSol Ring\nIsland x8'}
                className="mt-2 h-32 w-full rounded-md border border-zinc-700 bg-zinc-800 p-2 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => importFromText(paste)} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Import Text</button>
                <button onClick={() => setPaste("")} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Clear</button>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Import from URL (Moxfield / Archidekt)</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Paste deck URL..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
                <button onClick={() => importFromUrl(importUrl)} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Import</button>
              </div>
              <div className="mt-2 text-xs text-zinc-500">Public lists only. Parsing is best-effort.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
