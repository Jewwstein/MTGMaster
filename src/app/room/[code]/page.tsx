"use client";
import React from "react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePageTheme, PageKey } from "@/hooks/usePageTheme";
import { usePlaymatAdjustments, type PlaymatAdjustment } from "@/hooks/usePlaymatAdjustments";
import PageThemeControls from "@/components/theme/PageThemeControls";
import { getSocket } from "../../../lib/socket";
import Tabletop from "../../../components/tabletop/Tabletop";
import { useGame } from "../../../state/game";
import type { ZoneId, GameState } from "../../../state/game";
import PreviewPanel from "../../../components/tabletop/PreviewPanel";
import { usePreview } from "../../../components/tabletop/PreviewProvider";
import Image from "next/image";

const EMPTY_ORDER: ReadonlyArray<string> = Object.freeze([] as string[]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type PlaymatInfo = {
  id: string;
  name: string;
  slug: string;
  filePath: string;
  previewPath: string | null;
  isPreset: boolean;
};

const buildSeatPayload = (snap: any, playerKey?: string | null) => {
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
    graveyard: pick(primary?.zones?.graveyard, zonesObj?.graveyard),
    exile: pick(primary?.zones?.exile, zonesObj?.exile),
    commanderTaxCount: typeof snap?.commanderTaxCount === "number" ? snap.commanderTaxCount : null,
    life: typeof snap?.life === "number" ? snap.life : null,
    poison: typeof snap?.poison === "number" ? snap.poison : null,
    lifeThemeIndex: typeof snap?.lifeThemeIndex === "number" ? snap.lifeThemeIndex : undefined,
    lifeThemeHex: typeof snap?.lifeThemeHex === "string" ? snap.lifeThemeHex : null,
    lifeThemeImage: typeof snap?.lifeThemeImage === "string" ? snap.lifeThemeImage : null,
    currentTurn: typeof snap?.currentTurn === "number" ? snap.currentTurn : null,
    turnOrder: Array.isArray(snap?.turnOrder) ? [...snap.turnOrder] : null,
    playmatKey:
      typeof snap?.playmatKey === "string"
        ? snap.playmatKey
        : typeof primary?.playmatKey === "string"
          ? primary.playmatKey
          : null,
    playerKey: playerKey ?? (typeof snap?.playerKey === "string" ? snap.playerKey : null),
  };
};

export default function RoomPage() {
  const themeManager = usePageTheme('lobby' as PageKey);
  const { theme } = themeManager;
  const { getAdjustment: getPlaymatAdjustment, setAdjustment: setPlaymatAdjustment, clearAdjustment: clearPlaymatAdjustment, defaultAdjustment: defaultPlaymatAdjustment } = usePlaymatAdjustments();
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const { data: session } = useSession();
  const localIdentity = useMemo(() => {
    const rawUsername = (session?.user as any)?.username?.toString().trim();
    const rawName = session?.user?.name?.trim();
    const rawEmail = session?.user?.email?.trim();
    const name = rawUsername || rawName || rawEmail || "Player";
    const key = name.toLowerCase();
    return { name, key };
  }, [session]);
  const [presenceMap, setPresenceMap] = useState<Record<string, { id: string; key: string; name?: string; type?: string }>>({});
  const presenceList = useMemo(() => Object.values(presenceMap), [presenceMap]);
  const socket = useMemo(() => getSocket(), []);
  const clientId = useMemo(() => Math.random().toString(36).slice(2), []);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [playmats, setPlaymats] = useState<PlaymatInfo[]>([]);
  const [playmatLoading, setPlaymatLoading] = useState(false);
  const [playmatUploading, setPlaymatUploading] = useState(false);
  const [playmatError, setPlaymatError] = useState<string | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<PlaymatAdjustment>(defaultPlaymatAdjustment);
  const [playmatModalOpen, setPlaymatModalOpen] = useState(false);
  const [customPlaymatName, setCustomPlaymatName] = useState("");
  const selectedPlaymat = useGame((s: any) => (typeof s?.playmatKey === "string" ? s.playmatKey : null));
  const selectedPlaymatAdjustmentMemo = useMemo(() => getPlaymatAdjustment(selectedPlaymat), [getPlaymatAdjustment, selectedPlaymat]);

  useEffect(() => {
    if (!playmatModalOpen) return;
    setAdjustmentDraft(selectedPlaymatAdjustmentMemo);
  }, [playmatModalOpen, selectedPlaymatAdjustmentMemo]);
  const turnOrder = useGame((s: GameState) => (Array.isArray(s.turnOrder) ? s.turnOrder : []));
  const currentTurn = useGame((s: GameState) => (typeof s.currentTurn === "number" ? s.currentTurn : 0));
  const setTurnOrder = useGame((s: GameState) => s.setTurnOrder);
  const passTurn = useGame((s: GameState) => s.passTurn);
  const gamePlayers = useGame((s: GameState) => (Array.isArray(s.players) ? s.players : []));
  const remoteSeatState = useGame((s: GameState) => s.remoteSeats ?? {});
  const playerSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    presenceList.forEach((entry) => {
      if (entry && entry.name) {
        const trimmed = entry.name.trim();
        if (trimmed.length > 0) suggestions.add(trimmed);
      }
    });
    gamePlayers.forEach((player) => {
      if (player && typeof player.name === "string") {
        const trimmed = player.name.trim();
        if (trimmed.length > 0) suggestions.add(trimmed);
      }
    });
    Object.values(remoteSeatState).forEach((seat) => {
      if (seat && typeof seat.name === "string") {
        const trimmed = seat.name.trim();
        if (trimmed.length > 0) suggestions.add(trimmed);
      }
    });
    turnOrder.forEach((name) => {
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (trimmed.length > 0) suggestions.add(trimmed);
      }
    });
    if (localIdentity.name) suggestions.add(localIdentity.name);
    return Array.from(suggestions);
  }, [presenceList, gamePlayers, remoteSeatState, turnOrder, localIdentity.name]);

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
  const handleAdjustmentDraftChange = useCallback((updates: Partial<PlaymatAdjustment>) => {
    setAdjustmentDraft((prev) => {
      const next = {
        zoom: clamp(updates.zoom ?? prev.zoom, 1, 4),
        position: {
          x: clamp(updates.position?.x ?? prev.position.x, 0, 100),
          y: clamp(updates.position?.y ?? prev.position.y, 0, 100),
        },
      } as PlaymatAdjustment;
      return next;
    });
  }, [setAdjustmentDraft]);

  const handleApplyAdjustment = useCallback(() => {
    if (!selectedPlaymat) return;
    setPlaymatAdjustment(selectedPlaymat, adjustmentDraft);
  }, [selectedPlaymat, adjustmentDraft, setPlaymatAdjustment]);

  const handleResetAdjustment = useCallback(() => {
    if (!selectedPlaymat) return;
    clearPlaymatAdjustment(selectedPlaymat);
    setAdjustmentDraft(defaultPlaymatAdjustment);
  }, [clearPlaymatAdjustment, defaultPlaymatAdjustment, selectedPlaymat, setAdjustmentDraft]);

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
    const name = localIdentity.name;
    if (!roomCode) return;
    socket.emit("join", roomCode, name);

    const onPresence = (evt: any) => {
      const evtId = typeof evt?.id === "string" ? evt.id : null;
      const evtKeyRaw = typeof evt?.key === "string" ? evt.key.trim() : "";
      const evtKey = evtKeyRaw || evtId;
      if (!evtKey) return;
      setPresenceMap((prev) => {
        const next = { ...prev };
        const type = evt?.type ?? "unknown";
        if (type === "leave" || type === "disconnect") {
          if (next[evtKey]?.id === evtId || !evtId) {
            delete next[evtKey];
          }
        } else {
          const prior = next[evtKey];
          next[evtKey] = {
            id: evtId ?? prior?.id ?? "",
            key: evtKey,
            name: evt?.name ?? prior?.name ?? "Player",
            type,
          };
        }
        const api: any = (useGame as any).getState?.();
        if (api?.clearRemoteSeat) {
          const current = api.getState?.()?.remoteSeats ?? {};
          Object.keys(current).forEach((key) => {
            if (!key || key === localIdentity.key) return;
            if (key === evtKey && (type === "leave" || type === "disconnect")) {
              api.clearRemoteSeat(key);
              return;
            }
            if (!next[key]) {
              api.clearRemoteSeat(key);
            }
          });
        }
        return next;
      });
      if (evt?.type === "leave" || evt?.type === "disconnect") {
        try {
          const api: any = (useGame as any).getState?.();
          api?.clearRemoteSeat?.(evtKey);
        } catch {}
      }
    };
    socket.on("presence", onPresence);

    return () => {
      socket.emit("leave", roomCode);
      socket.off("presence", onPresence);
    };
  }, [roomCode, session, socket, socketId, localIdentity]);

  useEffect(() => {
    const allowedKeys = new Set(presenceList.map((p) => p.key).filter(Boolean));
    const state: any = (useGame as any).getState?.();
    const clear = state?.clearRemoteSeat;
    const remoteSeats = state?.remoteSeats ?? {};
    if (!clear) return;
    Object.keys(remoteSeats).forEach((key) => {
      if (!key || key === localIdentity.key) return;
      if (!allowedKeys.has(key)) clear(key);
    });
  }, [presenceList, socketId, localIdentity]);

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
    const BROADCAST_DELAY = 1000;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSnap: any = null;
    const displayName = localIdentity.name;
    const playerKey = localIdentity.key;
    const flush = () => {
      if (!socketId) {
        pendingSnap = null;
        sendTimer = null;
        return;
      }
      const snap = pendingSnap ?? (useGame as any).getState().snapshot();
      pendingSnap = null;
      const from = socketId;
      socket.emit("state", roomCode, {
        from,
        name: displayName,
        playerKey,
        snap,
        seat: buildSeatPayload(snap, playerKey),
      });
      sendTimer = null;
    };
    const scheduleSend = (nextSnap?: any) => {
      if (!socketId) return;
      if (nextSnap && typeof nextSnap === "object") pendingSnap = nextSnap;
      if (sendTimer) return;
      sendTimer = setTimeout(flush, BROADCAST_DELAY);
    };
    const unsub = (useGame as any).subscribe(() => scheduleSend());
    const onLocalChange = (evt: any) => {
      try {
        const snap = evt?.detail;
        scheduleSend(snap);
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
          const seatKeyRaw = typeof seatPayload?.playerKey === "string" ? seatPayload.playerKey.trim() : "";
          const payloadKeyRaw = typeof payload.playerKey === "string" ? payload.playerKey.trim() : "";
          const storageKey = seatKeyRaw || payloadKeyRaw;
          const socketOrigin = typeof payload.from === "string" ? payload.from : null;
          if (seatPayload && typeof seatPayload === "object" && storageKey) {
            api?.setRemoteSeat?.(storageKey, {
              name: payload.name || seatPayload?.name || "Opponent",
              seatIndex: typeof seatPayload?.seatIndex === "number" ? seatPayload.seatIndex : -1,
              zones: {
                battlefield: Array.isArray(seatPayload?.zones?.battlefield) ? seatPayload.zones.battlefield : [],
                lands: Array.isArray(seatPayload?.zones?.lands) ? seatPayload.zones.lands : [],
                command: Array.isArray(seatPayload?.zones?.command) ? seatPayload.zones.command : [],
              },
              hand: Array.isArray(seatPayload?.hand) ? seatPayload.hand : [],
              graveyard: Array.isArray(seatPayload?.graveyard) ? seatPayload.graveyard : [],
              exile: Array.isArray(seatPayload?.exile) ? seatPayload.exile : [],
              commanderTaxCount:
                typeof seatPayload?.commanderTaxCount === "number"
                  ? seatPayload.commanderTaxCount
                  : payload.commanderTaxCount ?? undefined,
              life: typeof seatPayload?.life === "number" ? seatPayload.life : undefined,
              poison: typeof seatPayload?.poison === "number" ? seatPayload.poison : undefined,
              lifeThemeIndex: typeof seatPayload?.lifeThemeIndex === "number" ? seatPayload.lifeThemeIndex : undefined,
              lifeThemeHex: typeof seatPayload?.lifeThemeHex === "string" ? seatPayload.lifeThemeHex : null,
              lifeThemeImage: typeof seatPayload?.lifeThemeImage === "string" ? seatPayload.lifeThemeImage : null,
              playmatKey:
                typeof seatPayload?.playmatKey === "string"
                  ? seatPayload.playmatKey
                  : seatPayload?.playmatKey === null
                    ? null
                    : undefined,
              playerKey: seatKeyRaw || payloadKeyRaw || null,
              socketId: socketOrigin,
            });
          } else if (payloadKeyRaw) {
            const fallbackKey = payloadKeyRaw;
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
            const graveyard = Array.isArray(primary?.zones?.graveyard)
              ? primary.zones.graveyard
              : Array.isArray(zonesObj?.graveyard)
                ? zonesObj.graveyard
                : [];
            const exile = Array.isArray(primary?.zones?.exile)
              ? primary.zones.exile
              : Array.isArray(zonesObj?.exile)
                ? zonesObj.exile
                : [];
            api?.setRemoteSeat?.(fallbackKey, {
              name: payload.name || primary?.name || "Opponent",
              seatIndex,
              zones: { battlefield, lands, command },
              hand,
              graveyard,
              exile,
              commanderTaxCount: typeof payload.commanderTaxCount === "number" ? payload.commanderTaxCount : null,
              life: typeof snap?.life === "number" ? snap.life : undefined,
              poison: typeof snap?.poison === "number" ? snap.poison : undefined,
              lifeThemeIndex: typeof snap?.lifeThemeIndex === "number" ? snap.lifeThemeIndex : undefined,
              lifeThemeHex: typeof snap?.lifeThemeHex === "string" ? snap.lifeThemeHex : null,
              lifeThemeImage: typeof snap?.lifeThemeImage === "string" ? snap.lifeThemeImage : null,
              playmatKey:
                typeof snap?.playmatKey === "string"
                  ? snap.playmatKey
                  : typeof primary?.playmatKey === "string"
                    ? primary.playmatKey
                    : undefined,
              playerKey: fallbackKey,
              socketId: socketOrigin,
            });
          }
          const incomingOrderRaw = Array.isArray(payload?.turnOrder)
            ? payload.turnOrder
            : Array.isArray(snap?.turnOrder)
              ? snap.turnOrder
              : null;
          if (incomingOrderRaw) {
            const normalized = incomingOrderRaw
              .map((entry: unknown) => (typeof entry === "string" ? entry.trim() : ""))
              .filter((entry: string) => entry.length > 0);
            if (normalized.length > 0) {
              api?.setTurnOrder?.(normalized);
            }
          }
          const incomingTurn =
            typeof payload?.currentTurn === "number"
              ? payload.currentTurn
              : typeof snap?.currentTurn === "number"
                ? snap.currentTurn
                : null;
          if (typeof incomingTurn === "number") {
            api?.setCurrentTurn?.(incomingTurn);
          }
          if (snap?.remoteSeats && typeof snap.remoteSeats === "object") {
            for (const [id, seat] of Object.entries(snap.remoteSeats as Record<string, any>)) {
              if (!seat) continue;
              const remoteKeyRaw = typeof seat?.playerKey === "string" ? seat.playerKey.trim() : "";
              if (!remoteKeyRaw) continue;
              const remoteKey = remoteKeyRaw;
              if (!remoteKey || remoteKey === localIdentity.key) continue;
              api?.setRemoteSeat?.(remoteKey, {
                ...seat,
                playerKey: remoteKey,
              });
            }
          }
        }
      } catch {}
    };
    socket.on("state", onState);
    return () => {
      if (sendTimer) clearTimeout(sendTimer);
      pendingSnap = null;
      if (unsub) unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("game:local-change", onLocalChange as EventListener);
      }
      socket.off("state", onState);
    };
  }, [roomCode, socket, clientId, socketId, session, localIdentity]);

  useEffect(() => {
    if (!roomCode || !socketId) return;
    const snap = (useGame as any).getState().snapshot();
    const seatPayload = buildSeatPayload(snap, localIdentity.key);
    socket.emit("state", roomCode, {
      from: socketId,
      name: localIdentity.name,
      playerKey: localIdentity.key,
      snap,
      seat: seatPayload,
    });
  }, [roomCode, socketId, session, socket, localIdentity]);

  return (
    <div 
      className="flex h-screen flex-col text-white"
      style={{
        backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
        backgroundColor: theme.backgroundImage ? 'transparent' : '#111827',
        '--accent-color': theme.accentColor || '#f59e0b'
      } as React.CSSProperties}
    >
      <PageThemeControls manager={themeManager} />
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Room {roomCode}</h1>
          <div className="text-sm text-zinc-400">Signed in as {session?.user?.name || "Player"}</div>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-12 gap-3 h-[calc(100vh-180px)]">
          <div className="col-span-10 h-full rounded-2xl border border-zinc-800/60 bg-transparent p-4 overflow-auto backdrop-blur-sm">
            <Tabletop
              presence={presenceList}
              socketId={socketId ?? undefined}
              playmats={playmatLookup}
              localPlayerKey={localIdentity.key}
              getPlaymatAdjustment={getPlaymatAdjustment}
            />
          </div>
          <div className="col-span-2 h-full flex flex-col overflow-hidden max-w-[260px]">
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col gap-3 overflow-y-auto pr-1 h-full">
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 p-3 backdrop-blur-sm">
                  <h2 className="text-sm font-semibold text-zinc-300">Presence</h2>
                  <div className="mt-2 max-h-48 overflow-auto text-xs">
                    {presenceList.map((p) => (
                      <div key={p.key} className="text-zinc-200">
                        {p.name || "Player"}
                        {p.type ? <span className="ml-2 text-[10px] uppercase text-zinc-500">{p.type}</span> : null}
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
                  playmatModalOpen={playmatModalOpen}
                  setPlaymatModalOpen={setPlaymatModalOpen}
                  selectedPlaymat={selectedPlaymat}
                  customPlaymatName={customPlaymatName}
                  setCustomPlaymatName={setCustomPlaymatName}
                  adjustmentDraft={adjustmentDraft}
                  onAdjustmentDraftChange={handleAdjustmentDraftChange}
                  onApplyAdjustment={handleApplyAdjustment}
                  onResetAdjustment={handleResetAdjustment}
                />
                <PreviewPanel />
              </div>
            </div>
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
  playmatModalOpen: boolean;
  setPlaymatModalOpen: Dispatch<SetStateAction<boolean>>;
  selectedPlaymat: string | null;
  customPlaymatName: string;
  setCustomPlaymatName: Dispatch<SetStateAction<string>>;
  adjustmentDraft: PlaymatAdjustment;
  onAdjustmentDraftChange: (updates: Partial<PlaymatAdjustment>) => void;
  onApplyAdjustment: () => void;
  onResetAdjustment: () => void;
};

function SidebarControls({
  playmats,
  playmatLoading,
  playmatUploading,
  playmatError,
  onUploadPlaymat,
  onRefreshPlaymats,
  playmatModalOpen,
  setPlaymatModalOpen,
  selectedPlaymat,
  customPlaymatName,
  setCustomPlaymatName,
  adjustmentDraft,
  onAdjustmentDraftChange,
  onApplyAdjustment,
  onResetAdjustment,
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
  const addToken = React.useCallback((name?: string, zone: ZoneId = "battlefield", image?: string | null) => apiRef.current?.addToken?.(name, zone, image), []);
  const moveTopToBottom = React.useCallback(() => apiRef.current?.moveTopLibraryToBottom?.(), []);
  const shuffleLibrary = React.useCallback(() => apiRef.current?.shuffleLibrary?.(), []);
  const passTurn = React.useCallback(() => apiRef.current?.passTurn?.(), []);
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

  const setPlaymatKey = React.useCallback(
    (slug: string | null) => {
      apiRef.current?.setPlaymatKey?.(slug ?? null);
    },
    [],
  );

  const handlePlaymatSelect = React.useCallback(
    (slug: string | null) => {
      setPlaymatKey(slug);
      setPlaymatModalOpen(false);
    },
    [setPlaymatKey, setPlaymatModalOpen],
  );

  const selectedPlaymatMeta = React.useMemo(() => {
    if (!selectedPlaymat) return null;
    return playmats.find((pm) => pm.slug === selectedPlaymat) ?? null;
  }, [playmats, selectedPlaymat]);

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

  const closePlaymatModal = React.useCallback(() => {
    setPlaymatModalOpen(false);
  }, []);

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
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 px-3 py-2 font-mtgmasters backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-300">Battlefield Background</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {selectedPlaymatMeta ? selectedPlaymatMeta.name : "None selected"}
            </p>
          </div>
          <button
            onClick={() => setPlaymatModalOpen(true)}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Choose
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 px-3 py-2 font-mtgmasters backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-zinc-300">Quick Actions</h2>
        <div className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1 text-xs">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => drawSeven()} className="rounded-md bg-amber-500 px-2.5 py-0.5 font-semibold text-black hover:bg-amber-400">Draw 7</button>
            <button onClick={() => mull7()} className="rounded-md border border-zinc-700 px-2.5 py-0.5 hover:bg-zinc-800">Mulligan 7↔7</button>
            <button onClick={() => untapAll()} className="rounded-md border border-zinc-700 px-2.5 py-0.5 hover:bg-zinc-800">Untap All</button>
            <button onClick={() => moveTopToBottom()} className="rounded-md border border-zinc-700 px-2.5 py-0.5 hover:bg-zinc-800" title="Move the top card of your library to the bottom">Top→Bottom</button>
            <button onClick={() => shuffleLibrary()} className="rounded-md border border-zinc-700 px-2.5 py-0.5 hover:bg-zinc-800">Shuffle</button>
            <button onClick={() => setLibrarySearchOpen(true)} className="rounded-md border border-emerald-600 px-2.5 py-0.5 text-emerald-300 hover:bg-emerald-600/20">Search Library</button>
            <button onClick={passTurn} className="rounded-md border border-amber-500 px-2.5 py-0.5 text-amber-200 hover:bg-amber-500/20">Pass Turn</button>
          </div>
          <div className="relative">
            <button onClick={() => setOpen((v) => !v)} className="rounded-md border border-zinc-700/70 px-2.5 py-0.5 hover:bg-zinc-800/70">Add Token</button>
            {open && (
              <div className="absolute z-30 mt-2 w-64 rounded-md border border-zinc-800/70 bg-zinc-900/90 p-2 shadow-lg backdrop-blur-md font-mtgmasters">
                <div className="flex gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tokens..." className="w-full rounded-md border border-zinc-700/70 bg-zinc-800/70 px-2 py-1 text-sm outline-none" />
                  <button onClick={() => searchTokens(q)} className="rounded-md bg-amber-500 px-2 py-1 text-sm font-semibold text-black hover:bg-amber-400">Go</button>
                </div>
                <div className="mt-2 max-h-56 overflow-auto">
                  {loading && <div className="px-2 py-1 text-xs text-zinc-400">Loading...</div>}
                  {!loading && results.length === 0 && (<div className="px-2 py-1 text-xs text-zinc-500">No results</div>)}
                  {!loading && results.map((r, i) => (
                    <button key={`${r.name}-${i}`} onClick={() => { addToken(r.name, "battlefield", r.image ?? null); setOpen(false); }} onMouseEnter={() => preview.hoverIn(r.name)} onMouseLeave={() => preview.hoverOut()} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-zinc-800">
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
        <div className="mt-3 rounded-md border border-zinc-800/60 bg-zinc-900/20 p-2 backdrop-blur-sm">
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
            <div className="mt-2 rounded border border-zinc-800/60 bg-zinc-900/25 p-2 font-mtgmasters backdrop-blur-sm">
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
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-zinc-300">Preview</div>
                <div className="mt-3 flex min-h-[340px] items-center justify-center rounded border border-zinc-800/70 bg-zinc-950/40 p-3 backdrop-blur-sm">
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
      {playmatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10" onClick={closePlaymatModal}>
          <div
            className="relative w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-100 shadow-xl font-mtgmasters"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Battlefield Background</h3>
                <p className="text-xs text-zinc-400">Choose a preset or upload your own playmat.</p>
              </div>
              <button onClick={closePlaymatModal} className="rounded border border-zinc-700 px-3 py-1 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-800">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wide text-zinc-500">Active Playmat</label>
                    <div className="mt-1 text-xs text-zinc-400">
                      {selectedPlaymatMeta ? selectedPlaymatMeta.name : "None selected"}
                    </div>
                  </div>
                  <button
                    onClick={onRefreshPlaymats}
                    disabled={playmatLoading}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {playmatLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {playmatError && (
                  <div className="rounded border border-red-800/60 bg-red-900/40 px-3 py-2 text-[11px] text-red-200">
                    {playmatError}
                  </div>
                )}
                <select
                  value={selectedPlaymat ?? ""}
                  onChange={(event) => handlePlaymatSelect(event.target.value ? event.target.value : null)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                >
                  <option value="">None (default)</option>
                  {playmats.map((pm) => (
                    <option key={pm.id} value={pm.slug}>
                      {pm.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  {playmats.map((pm) => {
                    const active = selectedPlaymat === pm.slug;
                    return (
                      <button
                        key={pm.id}
                        onClick={() => handlePlaymatSelect(pm.slug)}
                        className={`flex items-center gap-3 rounded border px-3 py-2 text-left text-xs transition hover:border-amber-400 hover:text-amber-200 ${
                          active ? "border-amber-500 text-amber-200" : "border-zinc-800 text-zinc-300"
                        }`}
                      >
                        {pm.previewPath ? (
                          <Image
                            src={pm.previewPath}
                            alt={pm.name}
                            width={56}
                            height={36}
                            className="h-14 w-20 rounded object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="h-14 w-20 rounded border border-zinc-700 bg-zinc-800" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{pm.name}</div>
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">{pm.isPreset ? "Preset" : "Custom"}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="text-sm font-semibold text-zinc-200">Upload custom playmat</div>
                <p className="text-xs text-zinc-500">PNG, JPEG, WebP, or SVG up to 10 MB.</p>
                <input
                  type="text"
                  value={customPlaymatName}
                  onChange={(event) => setCustomPlaymatName(event.target.value)}
                  placeholder="Optional display name"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handlePlaymatUpload}
                  disabled={playmatUploading}
                  className="w-full text-[11px] text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-black hover:file:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {playmatUploading && <div className="text-[11px] text-amber-300">Uploading…</div>}
                {selectedPlaymatMeta ? (
                  <div className="mt-4 space-y-3">
                    <div className="text-xs font-semibold text-zinc-400">Current selection</div>
                    <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                      {selectedPlaymatMeta.previewPath ? (
                        <Image
                          src={selectedPlaymatMeta.previewPath}
                          alt={selectedPlaymatMeta.name}
                          width={72}
                          height={48}
                          className="h-16 w-24 rounded object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="h-16 w-24 rounded border border-zinc-700 bg-zinc-800" />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-zinc-200">{selectedPlaymatMeta.name}</div>
                        <div className="text-[11px] text-zinc-500">Slug: {selectedPlaymatMeta.slug}</div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
                      <div className="text-xs font-semibold text-zinc-300">Playmat Framing</div>
                      <p className="mt-1 text-[11px] text-zinc-500">Adjust zoom and position to fit the battlefield.</p>
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                            Zoom ({adjustmentDraft.zoom.toFixed(2)}×)
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={4}
                            step={0.05}
                            value={adjustmentDraft.zoom}
                            onChange={(event) => onAdjustmentDraftChange({ zoom: Number(event.target.value) })}
                            className="w-full"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                              Horizontal ({Math.round(adjustmentDraft.position.x)}%)
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={adjustmentDraft.position.x}
                              onChange={(event) => onAdjustmentDraftChange({ position: { x: Number(event.target.value) } as PlaymatAdjustment["position"] })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                              Vertical ({Math.round(adjustmentDraft.position.y)}%)
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={adjustmentDraft.position.y}
                              onChange={(event) => onAdjustmentDraftChange({ position: { y: Number(event.target.value) } as PlaymatAdjustment["position"] })}
                              className="w-full"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={onApplyAdjustment}
                            className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
                            disabled={!selectedPlaymat}
                          >
                            Save Adjustment
                          </button>
                          <button
                            onClick={onResetAdjustment}
                            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                            disabled={!selectedPlaymat}
                          >
                            Reset Adjustment
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded border border-dashed border-zinc-700 px-3 py-2 text-[11px] text-zinc-500">
                    No playmat selected yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
