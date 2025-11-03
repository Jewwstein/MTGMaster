"use client";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "../../../lib/socket";
import Tabletop from "../../../components/tabletop/Tabletop";
import { useGame } from "../../../state/game";
import type { ZoneId } from "../../../state/game";
import PreviewPanel from "../../../components/tabletop/PreviewPanel";
import { usePreview } from "../../../components/tabletop/PreviewProvider";
import Image from "next/image";

const EMPTY_ORDER: ReadonlyArray<string> = Object.freeze([] as string[]);

type PlaymatInfo = {
  id: string;
  name: string;
  slug: string;
  filePath: string;
  previewPath: string | null;
  isPreset: boolean;
};

const buildSeatPayload = (snap: any) => {
  const seatIndex = typeof snap?.mySeat === "number" ? snap.mySeat : -1;
  const players = Array.isArray(snap?.players) ? snap.players : [];
  const primary = seatIndex >= 0 && seatIndex < players.length ? players[seatIndex] : players[0];
  const zonesObj: any = snap?.zones && typeof snap.zones === "object" ? snap.zones : {};
  const cloneCards = (arr: any) => (Array.isArray(arr) ? arr.map((card) => ({ ...card })) : []);
  const pick = (playerField: any, zoneField: any) => {
    if (Array.isArray(playerField) && playerField.length > 0) return cloneCards(playerField);
    return cloneCards(zoneField);
  };
  return {
    seatIndex,
    name: primary?.name,
    zones: {
      battlefield: pick(primary?.zones?.battlefield, zonesObj?.battlefield),
      lands: pick(primary?.zones?.lands, zonesObj?.lands),
      command: pick(primary?.zones?.command, zonesObj?.command),
    },
    hand: pick(primary?.hand, zonesObj?.hand),
    life: typeof snap?.life === "number" ? snap.life : null,
    poison: typeof snap?.poison === "number" ? snap.poison : null,
    lifeThemeIndex: typeof snap?.lifeThemeIndex === "number" ? snap.lifeThemeIndex : undefined,
    lifeThemeHex: typeof snap?.lifeThemeHex === "string" ? snap.lifeThemeHex : null,
    playmatKey:
      typeof snap?.playmatKey === "string"
        ? snap.playmatKey
        : typeof primary?.playmatKey === "string"
          ? primary.playmatKey
          : null,
  };
};

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const { data: session } = useSession();
  const [presenceMap, setPresenceMap] = useState<Record<string, { id: string; name?: string; type?: string }>>({});
  const presenceList = useMemo(() => Object.values(presenceMap), [presenceMap]);
  const socket = useMemo(() => getSocket(), []);
  const clientId = useMemo(() => Math.random().toString(36).slice(2), []);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [playmats, setPlaymats] = useState<PlaymatInfo[]>([]);
  const [playmatLoading, setPlaymatLoading] = useState(false);
  const [playmatUploading, setPlaymatUploading] = useState(false);
  const [playmatError, setPlaymatError] = useState<string | null>(null);

  const refreshPlaymats = useCallback(async () => {
    setPlaymatLoading(true);
    setPlaymatError(null);
    try {
      const res = await fetch("/api/playmats", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      const list = Array.isArray(data?.playmats) ? (data.playmats as PlaymatInfo[]) : [];
      setPlaymats(list);
    } catch (err) {
      console.error("Failed to load playmats", err);
      setPlaymatError("Failed to load playmats");
    } finally {
      setPlaymatLoading(false);
    }
  }, []);

  const uploadPlaymat = useCallback(
    async (file: File, name?: string) => {
      if (!file) return;
      setPlaymatUploading(true);
      setPlaymatError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        if (name && name.trim()) form.append("name", name.trim());
        const res = await fetch("/api/playmats", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message = typeof data?.error === "string" ? data.error : `Upload failed (${res.status})`;
          throw new Error(message);
        }
        await refreshPlaymats();
      } catch (err) {
        console.error("Failed to upload playmat", err);
        setPlaymatError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setPlaymatUploading(false);
      }
    },
    [refreshPlaymats],
  );

  useEffect(() => {
    refreshPlaymats().catch(() => {});
  }, [refreshPlaymats]);

  const playmatLookup = useMemo(() => {
    const map: Record<string, { filePath: string; name: string; isPreset: boolean; previewPath: string | null }> = {};
    playmats.forEach((pm) => {
      map[pm.slug] = {
        filePath: pm.filePath,
        name: pm.name,
        isPreset: pm.isPreset,
        previewPath: pm.previewPath ?? null,
      };
    });
    return map;
  }, [playmats]);

  useEffect(() => {
    const onConnect = () => setSocketId(socket.id ?? null);
    const onDisconnect = () => setSocketId(null);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) setSocketId(socket.id ?? null);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    // ensure socket server is initialized
    fetch("/api/socket");
  }, []);

  useEffect(() => {
    const name = session?.user?.name || "Player";
    if (!roomCode) return;
    socket.emit("join", roomCode, name);

    const onPresence = (evt: any) => {
      const evtId = evt?.id;
      if (!evtId) return;
      setPresenceMap((prev) => {
        const next = { ...prev };
        const type = evt?.type ?? "unknown";
        if (type === "leave" || type === "disconnect") {
          delete next[evtId];
        } else {
          next[evtId] = {
            id: evtId,
            name: evt?.name ?? prev[evtId]?.name ?? "Player",
            type,
          };
        }
        const api: any = (useGame as any).getState?.();
        if (api?.clearRemoteSeat) {
          const current = api.getState?.()?.remoteSeats ?? {};
          Object.keys(current).forEach((id) => {
            if (id === (socketId ?? "")) return;
            if (id === evtId && (type === "leave" || type === "disconnect")) {
              api.clearRemoteSeat(id);
            }
            if (!(id in next)) {
              api.clearRemoteSeat(id);
            }
          });
        }
        return next;
      });
      if (evt?.type === "leave" || evt?.type === "disconnect") {
        try {
          const api: any = (useGame as any).getState?.();
          api?.clearRemoteSeat?.(evtId);
        } catch {}
      }
    };
    socket.on("presence", onPresence);

    return () => {
      socket.emit("leave", roomCode);
      socket.off("presence", onPresence);
    };
  }, [roomCode, session, socket, socketId]);

  useEffect(() => {
    const allowed = new Set(presenceList.map((p) => p.id));
    const state: any = (useGame as any).getState?.();
    const clear = state?.clearRemoteSeat;
    const remoteSeats = state?.remoteSeats ?? {};
    if (!clear) return;
    Object.keys(remoteSeats).forEach((id) => {
      if (id === (socketId ?? "")) return;
      if (!allowed.has(id)) clear(id);
    });
  }, [presenceList, socketId]);

  // Apply Presence to seat names automatically on change
  useEffect(() => {
    // seat ordering disabled
  }, [presenceList]);

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
    const displayName = session?.user?.name || "Player";
    const scheduleSend = () => {
      if (!socketId) return;
      if (sendTimer) return;
      sendTimer = setTimeout(() => {
        if (!socketId) {
          sendTimer = null;
          return;
        }
        const snap = (useGame as any).getState().snapshot();
        const from = socketId;
        socket.emit("state", roomCode, { from, name: displayName, snap, seat: buildSeatPayload(snap) });
        sendTimer = null;
      }, 150);
    };
    const unsub = (useGame as any).subscribe(() => scheduleSend());
    const onLocalChange = (evt: any) => {
      try {
        const snap = evt?.detail;
        if (snap && socketId) {
          const from = socketId;
          socket.emit("state", roomCode, { from, name: displayName, snap, seat: buildSeatPayload(snap) });
        }
      } catch {}
    };
    if (typeof window !== "undefined") {
      window.addEventListener("game:local-change", onLocalChange as EventListener);
    }
    const onState = (_room: string, payload: any) => {
      try {
        if (!payload) return;
        const myId = socketId ?? clientId;
        if (payload.from === myId) return;
        const snap = payload.snap ?? payload;
        if (snap && typeof snap === "object") {
          const api: any = (useGame as any).getState?.();
          const seatPayload = payload?.seat;
          if (seatPayload && typeof seatPayload === "object") {
            api?.setRemoteSeat?.(payload.from, {
              name: payload.name || seatPayload?.name || "Opponent",
              seatIndex: typeof seatPayload?.seatIndex === "number" ? seatPayload.seatIndex : -1,
              zones: {
                battlefield: Array.isArray(seatPayload?.zones?.battlefield) ? seatPayload.zones.battlefield : [],
                lands: Array.isArray(seatPayload?.zones?.lands) ? seatPayload.zones.lands : [],
                command: Array.isArray(seatPayload?.zones?.command) ? seatPayload.zones.command : [],
              },
              hand: Array.isArray(seatPayload?.hand) ? seatPayload.hand : [],
              life: typeof seatPayload?.life === "number" ? seatPayload.life : undefined,
              poison: typeof seatPayload?.poison === "number" ? seatPayload.poison : undefined,
              lifeThemeIndex: typeof seatPayload?.lifeThemeIndex === "number" ? seatPayload.lifeThemeIndex : undefined,
              lifeThemeHex: typeof seatPayload?.lifeThemeHex === "string" ? seatPayload.lifeThemeHex : null,
              playmatKey:
                typeof seatPayload?.playmatKey === "string"
                  ? seatPayload.playmatKey
                  : seatPayload?.playmatKey === null
                    ? null
                    : undefined,
            });
          } else {
            const zonesObj: any = snap?.zones && typeof snap.zones === "object" ? snap.zones : {};
            const seatIndex = typeof snap?.mySeat === "number" ? snap.mySeat : -1;
            const players = Array.isArray(snap?.players) ? snap.players : [];
            const primary = seatIndex >= 0 && seatIndex < players.length ? players[seatIndex] : players[0];
            const battlefield = Array.isArray(primary?.zones?.battlefield)
              ? primary.zones.battlefield
              : Array.isArray(zonesObj?.battlefield)
                ? zonesObj.battlefield
                : [];
            const lands = Array.isArray(primary?.zones?.lands)
              ? primary.zones.lands
              : Array.isArray(zonesObj?.lands)
                ? zonesObj.lands
                : [];
            const command = Array.isArray(primary?.zones?.command)
              ? primary.zones.command
              : Array.isArray(zonesObj?.command)
                ? zonesObj.command
                : [];
            const hand = Array.isArray(primary?.hand)
              ? primary.hand
              : Array.isArray(zonesObj?.hand)
                ? zonesObj.hand
                : [];
            api?.setRemoteSeat?.(payload.from, {
              name: payload.name || primary?.name || "Opponent",
              seatIndex,
              zones: { battlefield, lands, command },
              hand,
              life: typeof snap?.life === "number" ? snap.life : undefined,
              poison: typeof snap?.poison === "number" ? snap.poison : undefined,
              lifeThemeIndex: typeof snap?.lifeThemeIndex === "number" ? snap.lifeThemeIndex : undefined,
              lifeThemeHex: typeof snap?.lifeThemeHex === "string" ? snap.lifeThemeHex : null,
              playmatKey:
                typeof snap?.playmatKey === "string"
                  ? snap.playmatKey
                  : typeof primary?.playmatKey === "string"
                    ? primary.playmatKey
                    : undefined,
            });
          }
          if (snap?.remoteSeats && typeof snap.remoteSeats === "object") {
            for (const [id, seat] of Object.entries(snap.remoteSeats as Record<string, any>)) {
              if (!id || id === myId) continue;
              api?.setRemoteSeat?.(id, seat);
            }
          }
        }
      } catch {}
    };
    socket.on("state", onState);
    return () => {
      if (sendTimer) clearTimeout(sendTimer);
      if (unsub) unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("game:local-change", onLocalChange as EventListener);
      }
      socket.off("state", onState);
    };
  }, [roomCode, socket, clientId, socketId, session]);

  useEffect(() => {
    if (!roomCode || !socketId) return;
    const snap = (useGame as any).getState().snapshot();
    const seatPayload = buildSeatPayload(snap);
    socket.emit("state", roomCode, {
      from: socketId,
      name: session?.user?.name || "Player",
      snap,
      seat: seatPayload,
    });
  }, [roomCode, socketId, session, socket]);

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 px-6 py-4">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Room {roomCode}</h1>
          <div className="text-sm text-zinc-400">Signed in as {session?.user?.name || "Player"}</div>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-12 gap-4 overflow-hidden">
          <div className="col-span-9 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <Tabletop
              presence={presenceList.filter((p) => p.id && p.id !== socketId)}
              socketId={socketId ?? undefined}
              playmats={playmatLookup}
            />
          </div>
          <div className="col-span-3 flex max-h-full flex-col gap-4 overflow-y-auto">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 max-h-72 overflow-auto">
              <h2 className="text-sm font-semibold text-zinc-300">Presence</h2>
              <div className="mt-2 max-h-48 overflow-auto text-xs">
                {presenceList.map((p, i) => (
                  <div key={i} className="text-zinc-400">
                    [{p.type}] {p.name} ({p.id.slice(0, 5)})
                  </div>
                ))}
              </div>
              <SeatsEditor />
            </div>
            <SidebarControls
              playmats={playmats}
              playmatLoading={playmatLoading}
              playmatUploading={playmatUploading}
              playmatError={playmatError}
              onUploadPlaymat={uploadPlaymat}
              onRefreshPlaymats={refreshPlaymats}
            />
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


type SidebarControlsProps = {
  playmats: PlaymatInfo[];
  playmatLoading: boolean;
  playmatUploading: boolean;
  playmatError: string | null;
  onUploadPlaymat: (file: File, name?: string) => Promise<void>;
  onRefreshPlaymats: () => Promise<void>;
};

function SidebarControls({
  playmats,
  playmatLoading,
  playmatUploading,
  playmatError,
  onUploadPlaymat,
  onRefreshPlaymats,
}: SidebarControlsProps) {
  const apiRef = React.useRef<any>(null);
  
  // Initialize the API ref once
  React.useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  }, []);
  
  // Memoize the selector function
  const selectLibrary = React.useCallback((s: any) => {
    return s?.zones?.library ?? [];
  }, []);
  
  // Memoize the game state slice
  const library = useGame(selectLibrary);
  
  // Memoize all callbacks
  const drawSeven = React.useCallback(() => apiRef.current?.drawSeven?.(), []);
  const mull7 = React.useCallback(() => apiRef.current?.mulliganSevenForSeven?.(), []);
  const untapAll = React.useCallback(() => apiRef.current?.untapAll?.(), []);
  const addToken = React.useCallback((name?: string, zone: ZoneId = "battlefield") => apiRef.current?.addToken?.(name, zone), []);
  const moveTopToBottom = React.useCallback(() => apiRef.current?.moveTopLibraryToBottom?.(), []);
  const shuffleLibrary = React.useCallback(() => apiRef.current?.shuffleLibrary?.(), []);
  const preview = usePreview();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<{ name: string; type_line?: string; image?: string }[]>([]);
  const [librarySearchOpen, setLibrarySearchOpen] = React.useState(false);
  const [libraryQuery, setLibraryQuery] = React.useState("");
  const [libraryMenu, setLibraryMenu] = React.useState<{ open: boolean; x: number; y: number; cardId?: string }>({ open: false, x: 0, y: 0 });
  const [libraryPreview, setLibraryPreview] = React.useState<{ name: string; image: string | null; loading: boolean }>({ name: "", image: null, loading: false });
  const libraryPreviewReq = React.useRef(0);
  const selectedPlaymat = useGame((s: any) => (typeof s?.playmatKey === "string" ? s.playmatKey : null));
  const setPlaymatKey = React.useCallback(
    (slug: string | null) => {
      apiRef.current?.setPlaymatKey?.(slug ?? null);
    },
    [],
  );
  const [customPlaymatName, setCustomPlaymatName] = React.useState("");

  const handlePlaymatSelect = React.useCallback(
    (slug: string | null) => {
      setPlaymatKey(slug);
    },
    [setPlaymatKey],
  );

  const handlePlaymatUpload = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await onUploadPlaymat(file, customPlaymatName.trim() || undefined);
        setCustomPlaymatName("");
      } finally {
        event.target.value = "";
      }
    },
    [customPlaymatName, onUploadPlaymat],
  );

  const filteredLibrary = React.useMemo(() => {
    const list = Array.isArray(library) ? library : [];
    const term = libraryQuery.trim().toLowerCase();
    if (!term) return list;
    return list.filter((card: any) => (card?.name ?? "").toLowerCase().includes(term));
  }, [library, libraryQuery]);

  const showLibraryPreview = React.useCallback((name: string) => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      setLibraryPreview({ name: "", image: null, loading: false });
      return;
    }
    const cache = (globalThis as any).__cardImgCache ?? ((globalThis as any).__cardImgCache = new Map<string, string>());
    const key = trimmed.replace(/\s+/g, " ");
    if (cache.has(key)) {
      setLibraryPreview({ name: trimmed, image: cache.get(key) ?? null, loading: false });
      preview.hoverIn(trimmed);
      return;
    }
    const current = ++libraryPreviewReq.current;
    setLibraryPreview({ name: trimmed, image: null, loading: true });
    preview.hoverIn(trimmed);
    const tryFetch = async () => {
      const pick = (data: any) =>
        (data?.image_uris?.normal ||
          data?.image_uris?.large ||
          data?.image_uris?.small ||
          data?.card_faces?.[0]?.image_uris?.normal ||
          data?.card_faces?.[0]?.image_uris?.large ||
          data?.card_faces?.[0]?.image_uris?.small ||
          null) as string | null;
      const query = async (mode: "exact" | "fuzzy", value: string) => {
        const res = await fetch(`https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error("scryfall error");
        const data = await res.json();
        return pick(data);
      };
      const attempt = async (value: string) => {
        try {
          const hit = await query("exact", value);
          if (hit) return hit;
        } catch {}
        try {
          const fuzzy = await query("fuzzy", value);
          if (fuzzy) return fuzzy;
        } catch {}
        return null;
      };
      let img = await attempt(key);
      if (!img) {
        const base = key.replace(/\s*\(.*\)\s*$/, "").replace(/\s*\/\/.*$/, "").trim();
        if (base && base !== key) {
          img = await attempt(base);
        }
      }
      if (libraryPreviewReq.current !== current) return;
      if (img) cache.set(key, img);
      setLibraryPreview({ name: trimmed, image: img, loading: false });
    };
    tryFetch().catch(() => {
      if (libraryPreviewReq.current !== current) return;
      setLibraryPreview({ name: trimmed, image: null, loading: false });
    });
  }, [preview]);

  const moveLibraryCard = React.useCallback(
    (cardId: string | undefined, zone: ZoneId, index?: number) => {
      if (!cardId) return;
      if (zone === "library" && typeof index === "number") {
        if (index <= 0) {
          apiRef.current?.moveCard?.(cardId, "library", 0);
        } else {
          apiRef.current?.moveCard?.(cardId, "library", index === Infinity ? undefined : index);
        }
      } else {
        apiRef.current?.moveCard?.(cardId, zone);
      }
      setLibraryMenu({ open: false, x: 0, y: 0, cardId: undefined });
      if (zone === "hand" || zone === "battlefield") {
        // keep modal open for additional moves
      }
    },
    []
  );

  const closeLibrarySearch = React.useCallback(() => {
    setLibrarySearchOpen(false);
    setLibraryQuery("");
    setLibraryMenu({ open: false, x: 0, y: 0, cardId: undefined });
    setLibraryPreview({ name: "", image: null, loading: false });
    preview.hoverOut();
  }, []);
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
    <>
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 font-mtgmasters">
        <h2 className="text-sm font-semibold text-zinc-300">Quick Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => drawSeven()} className="rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-black hover:bg-amber-400">Draw 7</button>
          <button onClick={() => mull7()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Mulligan 7↔7</button>
          <button onClick={() => untapAll()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Untap All</button>
          <button onClick={() => moveTopToBottom()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800" title="Move the top card of your library to the bottom">Top→Bottom</button>
          <button onClick={() => shuffleLibrary()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Shuffle</button>
          <button onClick={() => setLibrarySearchOpen(true)} className="rounded-md border border-emerald-600 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-600/20">Search Library</button>
          <div className="relative">
            <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">Add Token</button>
            {open && (
              <div className="absolute z-30 mt-2 w-64 rounded-md border border-zinc-800 bg-zinc-900 p-2 shadow font-mtgmasters">
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
            <div className="mt-2 rounded border border-zinc-800 bg-zinc-900 p-2 font-mtgmasters">
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
      {librarySearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10"
          onClick={closeLibrarySearch}
        >
          <div
            className="relative w-full max-w-5xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-100 shadow-xl font-mtgmasters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Library Search</h3>
                <p className="text-xs text-zinc-400">Right-click a card for actions.</p>
              </div>
              <button
                onClick={closeLibrarySearch}
                className="rounded border border-zinc-700 px-3 py-1 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <input
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search library..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 outline-none"
                autoFocus
              />
              <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400">
                {filteredLibrary.length} / {Array.isArray(library) ? library.length : 0}
              </div>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                {filteredLibrary.length === 0 && (
                  <div className="py-12 text-center text-sm text-zinc-500">No cards match that search.</div>
                )}
                {filteredLibrary.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filteredLibrary.map((card: any) => (
                      <div
                        key={card.id}
                        className="flex cursor-pointer items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-sm hover:border-amber-400 hover:text-amber-200"
                        onMouseEnter={() => showLibraryPreview(card.name)}
                        onFocus={() => showLibraryPreview(card.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setLibraryMenu({ open: true, x: e.clientX, y: e.clientY, cardId: card.id });
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-zinc-100">{card.name}</div>
                          {(card as any)?.type_line && <div className="text-[11px] uppercase tracking-wide text-zinc-400">{(card as any).type_line}</div>}
                        </div>
                        <span className="text-[11px] text-zinc-500">Right click</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="text-sm font-semibold text-zinc-300">Preview</div>
                <div className="mt-3 flex min-h-[340px] items-center justify-center rounded border border-zinc-800 bg-zinc-950/60 p-3">
                  {libraryPreview.loading && (
                    <div className="text-[12px] text-zinc-500">Loading...</div>
                  )}
                  {!libraryPreview.loading && libraryPreview.image && (
                    <Image src={libraryPreview.image} alt={libraryPreview.name} width={300} height={418} className="h-[418px] w-[300px] rounded shadow-lg" unoptimized />
                  )}
                  {!libraryPreview.loading && !libraryPreview.image && (
                    <div className="text-center text-[12px] text-zinc-500">
                      Hover a card to preview.
                    </div>
                  )}
                </div>
                {libraryPreview.name && (
                  <div className="mt-3 truncate text-[12px] text-zinc-400">{libraryPreview.name}</div>
                )}
              </div>
            </div>
          </div>
          {libraryMenu.open && (
            <div
              className="fixed z-50 rounded border border-zinc-800 bg-zinc-900 text-xs shadow font-mtgmasters"
              style={{ left: libraryMenu.x, top: libraryMenu.y }}
              onMouseLeave={() => setLibraryMenu({ open: false, x: 0, y: 0, cardId: undefined })}
            >
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "hand")}
              >
                Put into Hand
              </button>
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "battlefield")}
              >
                Put onto Battlefield
              </button>
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "graveyard")}
              >
                Send to Graveyard
              </button>
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "exile")}
              >
                Exile
              </button>
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "library", 0)}
              >
                Put on Top of Library
              </button>
              <button
                className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
                onClick={() => moveLibraryCard(libraryMenu.cardId, "library", Infinity)}
              >
                Put on Bottom of Library
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
