"use client";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "../../../lib/socket";
import Tabletop from "../../../components/tabletop/Tabletop";
import { useGame } from "../../../state/game";
import PreviewPanel from "../../../components/tabletop/PreviewPanel";
import { usePreview } from "../../../components/tabletop/PreviewProvider";
import Image from "next/image";

const EMPTY_ORDER: ReadonlyArray<string> = Object.freeze([] as string[]);

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const { data: session } = useSession();
  const [presence, setPresence] = useState<{ id: string; name: string; type: string }[]>([]);
  const socket = useMemo(() => getSocket(), []);
  const clientId = useMemo(() => Math.random().toString(36).slice(2), []);

  useEffect(() => {
    // ensure socket server is initialized
    fetch("/api/socket");
  }, []);

  useEffect(() => {
    const name = session?.user?.name || "Player";
    if (!roomCode) return;
    socket.emit("join", roomCode, name);

    const onPresence = (evt: any) => {
      setPresence((prev) => {
        const next = [...prev, evt];
        return next.slice(-100);
      });
    };
    socket.on("presence", onPresence);

    return () => {
      socket.emit("leave", roomCode);
      socket.off("presence", onPresence);
    };
  }, [roomCode, session, socket]);

  // Apply Presence to seat names automatically on change
  useEffect(() => {
    // seat ordering disabled
  }, [presence]);

  // Match my seat by name when seats/presence/session change (avoid loops)
  useEffect(() => {
    // mySeat auto-matching disabled
  }, [session]);

  // Hydrate from last saved snapshot on mount
  useEffect(() => {
    let active = true;
    (async () => {
      if (!roomCode) return;
      try {
        const res = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (data?.stateJson) {
          const snap = typeof data.stateJson === "string" ? JSON.parse(data.stateJson) : data.stateJson;
          if (snap && typeof snap === "object") {
            const api: any = (useGame as any).getState?.();
            api?.hydrate?.(snap);
          }
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [roomCode]);

  // Throttled snapshot saves (every ~5s while activity occurs)
  useEffect(() => {
    if (!roomCode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let destroyed = false;
    const schedule = () => {
      pending = true;
      if (timer) return;
      timer = setTimeout(async () => {
        if (destroyed) return;
        try {
          const snap = (useGame as any).getState().snapshot();
          await fetch(`/api/rooms/${roomCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stateJson: JSON.stringify(snap) }),
          });
        } catch {}
        pending = false;
        timer = null;
      }, 5000);
    };
    const unsub = (useGame as any).subscribe(() => schedule());
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      if (unsub) unsub();
    };
  }, [roomCode]);

  // Realtime: debounce-broadcast local state to room; hydrate on incoming
  useEffect(() => {
    if (!roomCode) return;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSend = () => {
      if (sendTimer) return;
      sendTimer = setTimeout(() => {
        const snap = (useGame as any).getState().snapshot();
        socket.emit("state", roomCode, { from: clientId, snap });
        sendTimer = null;
      }, 150);
    };
    const unsub = (useGame as any).subscribe(() => scheduleSend());
    const onState = (_room: string, payload: any) => {
      try {
        if (!payload || payload.from === clientId) return;
        const snap = payload.snap ?? payload;
        if (snap && typeof snap === "object") {
          const api: any = (useGame as any).getState?.();
          api?.hydrate?.(snap);
        }
      } catch {}
    };
    socket.on("state", onState);
    return () => {
      if (sendTimer) clearTimeout(sendTimer);
      if (unsub) unsub();
      socket.off("state", onState);
    };
  }, [roomCode, socket, clientId]);

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 px-6 py-4">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Room {roomCode}</h1>
          <div className="text-sm text-zinc-400">Signed in as {session?.user?.name || "Player"}</div>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-12 gap-4 overflow-hidden">
          <div className="col-span-9 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <Tabletop />
          </div>
          <div className="col-span-3 flex max-h-full flex-col gap-4 overflow-y-auto">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 max-h-72 overflow-auto">
              <h2 className="text-sm font-semibold text-zinc-300">Presence</h2>
              <div className="mt-2 max-h-48 overflow-auto text-xs">
                {presence.map((p, i) => (
                  <div key={i} className="text-zinc-400">
                    [{p.type}] {p.name} ({p.id.slice(0, 5)})
                  </div>
                ))}
              </div>
              <SeatsEditor />
            </div>
            <SidebarControls />
            <PreviewPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatsEditor() {
  return null;
}


function SidebarControls() {
  const apiRef = React.useRef<any>(null);
  React.useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  });
  const drawSeven = () => apiRef.current?.drawSeven?.();
  const mull7 = () => apiRef.current?.mulliganSevenForSeven?.();
  const untapAll = () => apiRef.current?.untapAll?.();
  const addToken = () => apiRef.current?.addToken?.();
  const moveTopToBottom = () => apiRef.current?.moveTopLibraryToBottom?.();
  const library = useGame((s: any) => (s?.zones?.library ?? []) as any[]);
  const preview = usePreview();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<{ name: string; type_line?: string; image?: string }[]>([]);
  // Scry controls
  const [scryOpen, setScryOpen] = React.useState(false);
  const [scryN, setScryN] = React.useState(1);
  const [scryStep, setScryStep] = React.useState(0);
  const [topImg, setTopImg] = React.useState<string | null>(null);
  const [topImgLoading, setTopImgLoading] = React.useState(false);
  // Dice roller
  const [lastRoll, setLastRoll] = React.useState<{ die: number; value: number } | null>(null);

  React.useEffect(() => {
    async function fetchImg(name: string) {
      try {
        setTopImgLoading(true);
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
        const data = await res.json();
        const img =
          data?.image_uris?.normal ||
          data?.image_uris?.small ||
          data?.card_faces?.[0]?.image_uris?.normal ||
          data?.card_faces?.[0]?.image_uris?.small ||
          null;
        setTopImg(img);
      } catch {
        setTopImg(null);
      } finally {
        setTopImgLoading(false);
      }
    }
    const name = library?.[0]?.name as string | undefined;
    if (scryOpen && name) fetchImg(name);
    else setTopImg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scryOpen, library && library[0] && library[0].name]);

  async function searchTokens(term: string) {
    setLoading(true);
    try {
      const url = `https://api.scryfall.com/cards/search`;
      const params = new URLSearchParams({ q: `is:token ${term}` });
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
      setResults(items.slice(0, 10));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="relative rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold text-zinc-300">Quick Actions</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => drawSeven()} className="rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-black hover:bg-amber-400">Draw 7</button>
        <button onClick={() => mull7()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Mulligan 7↔7</button>
        <button onClick={() => untapAll()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Untap All</button>
        <button onClick={() => moveTopToBottom()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800" title="Move the top card of your library to the bottom">Top→Bottom</button>
        <div className="relative">
          <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Add Token</button>
          {open && (
            <div className="absolute z-30 mt-2 w-64 rounded-md border border-zinc-800 bg-zinc-900 p-2 shadow">
              <div className="flex gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tokens..." className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm outline-none" />
                <button onClick={() => searchTokens(q)} className="rounded-md bg-amber-500 px-2 py-1 text-sm font-semibold text-black hover:bg-amber-400">Go</button>
              </div>
              <div className="mt-2 max-h-56 overflow-auto">
                {loading && <div className="px-2 py-1 text-xs text-zinc-400">Loading...</div>}
                {!loading && results.length === 0 && (<div className="px-2 py-1 text-xs text-zinc-500">No results</div>)}
                {!loading && results.map((r, i) => (
                  <button key={`${r.name}-${i}`} onClick={() => { addToken(r.name, "battlefield"); setOpen(false); }} onMouseEnter={() => preview.hoverIn(r.name)} onMouseLeave={() => preview.hoverOut()} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-zinc-800">
                    {r.image ? (
                      <Image src={r.image} alt={r.name} width={32} height={44} className="h-11 w-8 flex-shrink-0 rounded" unoptimized />
                    ) : (
                      <div className="h-11 w-8 flex-shrink-0 rounded border border-zinc-700" />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold">{r.name}</span>
                      <span className="truncate text-zinc-500">{r.type_line}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Scry controls */}
      <div className="mt-3 rounded-md border border-zinc-800 p-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Scry</span>
            <button onClick={() => setScryN((n) => Math.max(1, n - 1))} className="rounded border border-zinc-700 px-2 hover:bg-zinc-800">-</button>
            <span className="w-5 text-center">{scryN}</span>
            <button onClick={() => setScryN((n) => Math.min(10, n + 1))} className="rounded border border-zinc-700 px-2 hover:bg-zinc-800">+</button>
          </div>
          <button onClick={() => { setScryStep(0); setScryOpen(true); }} className="rounded bg-amber-500 px-2 py-1 font-semibold text-black hover:bg-amber-400">Start</button>
        </div>
        {scryOpen && (
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-900 p-2">
            {scryStep >= scryN || library.length === 0 ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Scry complete</span>
                <button onClick={() => setScryOpen(false)} className="rounded border border-zinc-700 px-2 hover:bg-zinc-800">Close</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {topImgLoading ? (
                    <div className="h-24 w-16 animate-pulse rounded border border-zinc-800 bg-zinc-900" />
                  ) : topImg ? (
                    <Image src={topImg} alt={library?.[0]?.name ?? "Top card"} width={96} height={134} className="h-24 w-16 rounded" unoptimized />
                  ) : (
                    <div className="h-24 w-16 rounded border border-zinc-800" />)
                  }
                  <div className="min-w-0 pr-2">
                    <div className="text-xs text-zinc-400">Top of Library</div>
                    <div className="truncate text-sm font-semibold">{library?.[0]?.name ?? "(empty)"}</div>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => { setScryStep((k) => k + 1); }} className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Keep</button>
                  <button onClick={() => { moveTopToBottom(); setScryStep((k) => k + 1); }} className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-500">Bottom</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
