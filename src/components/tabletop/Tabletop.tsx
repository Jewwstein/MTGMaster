"use client";
import React from "react";
import { DndContext, DragEndEvent, rectIntersection, DragStartEvent, useSensor, useSensors, PointerSensor, DragMoveEvent } from "@dnd-kit/core";
import Zone from "./Zone";
import OpponentCard from "./OpponentCard";
import LibraryStack from "./LibraryStack";
import { useGame, type ZoneId, type CardItem, type RemoteSeatState, type GameState } from "../../state/game";
import { getSocket } from "../../lib/socket";
import { useParams } from "next/navigation";
import HandOverlay from "./HandOverlay";
import { usePreview } from "./PreviewProvider";

const NO_CARDS: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);
const EMPTY_REMOTE: Readonly<Record<string, RemoteSeatState>> = Object.freeze({} as Record<string, RemoteSeatState>);
const LIFE_D20_THEMES: ReadonlyArray<{
  top: string;
  bottom: string;
  stroke: string;
  poly: string;
  textClass: string;
  glowClass: string;
}> = [
  {
    top: "#0b1220",
    bottom: "#0a1a33",
    stroke: "#3b82f6",
    poly: "#60a5fa",
    textClass: "text-sky-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(56,189,248,0.45)]",
  },
  {
    top: "#0d1d16",
    bottom: "#103624",
    stroke: "#34d399",
    poly: "#6ee7b7",
    textClass: "text-emerald-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(16,185,129,0.45)]",
  },
  {
    top: "#1d1909",
    bottom: "#37280a",
    stroke: "#fbbf24",
    poly: "#fcd34d",
    textClass: "text-amber-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(250,204,21,0.45)]",
  },
  {
    top: "#240c14",
    bottom: "#3f1725",
    stroke: "#f43f5e",
    poly: "#fb7185",
    textClass: "text-rose-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(244,63,94,0.45)]",
  },
];

const selectMySeat = (s: any) => (typeof s?.mySeat === "number" ? (s.mySeat as number) : -1);
const selectLocalBattlefield = (s: any) => (Array.isArray(s?.zones?.battlefield) ? s.zones.battlefield : NO_CARDS);
const selectLocalLands = (s: any) => (Array.isArray(s?.zones?.lands) ? s.zones.lands : NO_CARDS);
const selectLocalCommand = (s: any) => (Array.isArray(s?.zones?.command) ? s.zones.command : NO_CARDS);
const selectLocalHandCount = (s: any) => (Array.isArray(s?.zones?.hand) ? s.zones.hand.length : 0);
const selectLocalPlaymatSlug = (s: any) => (typeof s?.playmatKey === "string" ? s.playmatKey : null);
const selectRemoteSeatMap = (s: any) => (s && s.remoteSeats ? (s.remoteSeats as Record<string, RemoteSeatState>) : EMPTY_REMOTE);
const selectLifeThemeIndex = (s: any) => (typeof s?.lifeThemeIndex === "number" ? s.lifeThemeIndex : 0);
const selectLifeThemeHex = (s: any) => (typeof s?.lifeThemeHex === "string" ? s.lifeThemeHex : null);

function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  return null;
}

function adjustChannel(channel: number, percent: number) {
  if (percent >= 0) {
    return Math.min(255, Math.round(channel + (255 - channel) * percent));
  }
  return Math.max(0, Math.round(channel * (1 + percent)));
}

function shadeHex(hex: string, percent: number) {
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;
  const value = parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const nr = adjustChannel(r, percent);
  const ng = adjustChannel(g, percent);
  const nb = adjustChannel(b, percent);
  return `#${[nr, ng, nb]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getLuminance(hex: string) {
  const normalized = normalizeHex(hex);
  if (!normalized) return 0;
  const value = parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeTheme(idx: number, customHex?: string | null) {
  const normalized = normalizeHex(customHex ?? undefined);
  if (!normalized) return LIFE_D20_THEMES[idx % LIFE_D20_THEMES.length];
  const top = shadeHex(normalized, 0.2);
  const bottom = shadeHex(normalized, -0.15);
  const stroke = shadeHex(normalized, 0.35);
  const poly = shadeHex(normalized, 0.15);
  const luminance = getLuminance(normalized);
  const textClass = luminance > 150 ? "text-zinc-900" : "text-white";
  const glowClass = luminance > 150 ? "drop-shadow-[0_0_4px_rgba(31,31,31,0.45)]" : "drop-shadow-[0_0_6px_rgba(255,255,255,0.45)]";
  return { top, bottom, stroke, poly, textClass, glowClass };
}

type PresenceEntry = {
  id: string;
  name?: string;
  type?: string;
};

type PlaymatMap = Record<string, { filePath: string; name: string; isPreset: boolean; previewPath: string | null }>;

type TabletopProps = {
  presence?: PresenceEntry[];
  socketId?: string;
  playmats?: PlaymatMap;
};

export default function Tabletop({ presence = [], socketId, playmats = {} }: TabletopProps) {
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const [dragging, setDragging] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pointer = React.useRef<{x:number; y:number}>({x:0,y:0});
  const mySeat = useGame(selectMySeat);
  const remoteSeatMap = useGame(selectRemoteSeatMap) as Record<string, RemoteSeatState>;
  const localPlaymatSlug = useGame(selectLocalPlaymatSlug);
  const clearRemoteSeat = (useGame as any).getState?.()?.clearRemoteSeat as
    | ((id: string) => void)
    | undefined;

  const opponentPresence = React.useMemo<PresenceEntry[]>(() => {
    if (!Array.isArray(presence)) return [];
    return presence.filter((entry): entry is PresenceEntry => !!entry && typeof entry.id === "string" && entry.id !== socketId);
  }, [presence, socketId]);

  React.useEffect(() => {
    // ensure socket server is initialized
    fetch("/api/socket").catch(()=>{});
  }, []);

  function onDragEnd(event: DragEndEvent) {
    const cardId = String(event.active.id);
    const overId = event.over?.id as ZoneId | undefined;
    if (overId) {
      const api: any = (useGame as any).getState?.();
      api?.moveCard?.(cardId, overId);
      if (overId === "battlefield") {
        const container = document.getElementById("zone-battlefield-canvas") || document.getElementById("zone-battlefield");
        const dragged = event.active?.rect?.current?.translated || event.active?.rect?.current?.initial;
        if (container && dragged) {
          const rect = container.getBoundingClientRect();
          const grid = 20;
          const centerX = dragged.left + dragged.width / 2;
          const centerY = dragged.top + dragged.height / 2;
          const relXRaw = centerX - rect.left - dragged.width / 2;
          const relYRaw = centerY - rect.top - dragged.height / 2;
          const relX = Math.max(0, Math.round(relXRaw / grid) * grid);
          const relY = Math.max(0, Math.round(relYRaw / grid) * grid);
          api?.setBattlefieldPos?.(cardId, relX, relY);
        }
      }
    }
    setDragging(false);
  }

  function onDragStart(_e: DragStartEvent) {
    setDragging(true);
  }
  function onDragMove(e: DragMoveEvent) {
    if ((e as any).delta) {
      const ev: any = e;
      if (ev.activatorEvent && ev.activatorEvent.clientX != null) {
        pointer.current = { x: ev.activatorEvent.clientX, y: ev.activatorEvent.clientY };
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragMove={onDragMove}>
      <div className="relative grid h-full grid-cols-[280px_1fr_220px] grid-rows-[1fr] gap-4 pb-28">
        {/* Left: Graveyard / Exile + Life/Commander */}
        <div className="flex flex-col gap-3">
          <Zone
            id="graveyard"
            title="Graveyard"
            className="min-h-[100px]"
            isDragging={dragging}
            innerClassName="max-h-40 overflow-auto flex flex-wrap content-start gap-2"
          />
          <Zone
            id="exile"
            title="Exile"
            className="min-h-[100px]"
            isDragging={dragging}
            innerClassName="max-h-40 overflow-auto flex flex-wrap content-start gap-2"
          />
          <LifeCommanderLeft />
        </div>

        {/* Center: Shared battlefield + Lands */}
        <div className="flex h-full flex-col gap-3">
          <SharedBattlefieldSection
            dragging={dragging}
            mySeat={mySeat}
            presence={opponentPresence}
            remoteSeatMap={remoteSeatMap}
            socketId={socketId}
            playmats={playmats}
            localPlaymatSlug={localPlaymatSlug}
          />
        </div>

        {/* Right: Command Zone above Library stack */}
        <div className="flex h-full flex-col gap-3">
          <Zone id="command" title="Command Zone" className="flex-1 min-h-[220px]" isDragging={dragging} innerClassName="flex flex-col gap-2" />
          <CommanderTaxPanel />
          <div className="flex flex-1 flex-col">
            <LibraryStack />
          </div>
        </div>

        {/* Floating Hand overlay */}
        <HandOverlay />
      </div>
    </DndContext>
  );
}

type SeatEntry = {
  key: string;
  name: string;
  seatIndex: number;
  cards: ReadonlyArray<CardItem>;
  lands: ReadonlyArray<CardItem>;
  command: ReadonlyArray<CardItem>;
  handCount: number;
  type: "local" | "player";
  playmatKey: string | null;
};

function CommanderTaxPanel() {
  const tax = useGame((s: any) => (s && s.commanderTaxCount) ?? 0);
  const incTax = (delta: number) => {
    const api: any = (useGame as any).getState?.();
    api?.incCommanderTax?.(delta);
  };

  return (
    <div className="relative rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mtgmasters">
      <h3 className="text-xs font-semibold text-zinc-300">Commander Tax</h3>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-zinc-400">Total Tax</span>
        <span className="text-lg font-bold text-zinc-100">{tax * 2}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => incTax(1)} className="flex-1 rounded border border-zinc-700 px-2 py-1 text-[10px] font-semibold hover:bg-zinc-800">
          + Cast
        </button>
        <button onClick={() => incTax(-1)} className="flex-1 rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">
          - Cast
        </button>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">Each commander cast adds 2 tax mana.</p>
    </div>
  );
}

type SharedBattlefieldSectionProps = {
  dragging: boolean;
  mySeat: number;
  presence: PresenceEntry[];
  remoteSeatMap: Record<string, RemoteSeatState>;
  socketId?: string;
  playmats: PlaymatMap;
  localPlaymatSlug: string | null;
};

function SharedBattlefieldSection({ dragging, mySeat, presence, remoteSeatMap, socketId, playmats, localPlaymatSlug }: SharedBattlefieldSectionProps) {
  const localBattlefield = useGame(selectLocalBattlefield);
  const localLands = useGame(selectLocalLands);
  const localCommand = useGame(selectLocalCommand);
  const localHandCount = useGame(selectLocalHandCount);

  const seatEntries = React.useMemo<SeatEntry[]>(() => {
    const list: SeatEntry[] = [
      {
        key: "local",
        name: "Your Battlefield",
        seatIndex: mySeat,
        cards: localBattlefield,
        lands: localLands,
        command: localCommand,
        handCount: localHandCount,
        type: "local",
        playmatKey: localPlaymatSlug ?? null,
      },
    ];
    const seenKeys = new Set<string>(["local"]);

    presence.forEach((entry: PresenceEntry, idx: number) => {
      const snapshot = remoteSeatMap?.[entry.id];
      if (!snapshot) return;
      const seatIndex = typeof snapshot?.seatIndex === "number" ? snapshot.seatIndex : -1;
      const key = entry.id;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      list.push({
        key,
        name: entry.name || snapshot?.name || `Opponent ${idx + 1}`,
        seatIndex,
        cards: Array.isArray(snapshot?.zones?.battlefield) ? snapshot.zones.battlefield : NO_CARDS,
        lands: Array.isArray(snapshot?.zones?.lands) ? snapshot.zones.lands : NO_CARDS,
        command: Array.isArray(snapshot?.zones?.command) ? snapshot.zones.command : NO_CARDS,
        handCount: Array.isArray(snapshot?.hand) ? snapshot.hand.length : 0,
        type: "player",
        playmatKey: typeof snapshot?.playmatKey === "string" ? snapshot.playmatKey : null,
      });
    });

    Object.entries(remoteSeatMap ?? {}).forEach(([id, snapshot]) => {
      if (!snapshot || seenKeys.has(id) || id === socketId) return;
      const seatIndex = typeof snapshot?.seatIndex === "number" ? snapshot.seatIndex : -1;
      seenKeys.add(id);
      list.push({
        key: id,
        name: snapshot.name || "Opponent",
        seatIndex,
        cards: Array.isArray(snapshot?.zones?.battlefield) ? snapshot.zones.battlefield : NO_CARDS,
        lands: Array.isArray(snapshot?.zones?.lands) ? snapshot.zones.lands : NO_CARDS,
        command: Array.isArray(snapshot?.zones?.command) ? snapshot.zones.command : NO_CARDS,
        handCount: Array.isArray(snapshot?.hand) ? snapshot.hand.length : 0,
        type: "player",
        playmatKey: typeof snapshot?.playmatKey === "string" ? snapshot.playmatKey : null,
      });
    });

    return list;
  }, [presence, socketId, mySeat, localBattlefield, localLands, localCommand, localHandCount, remoteSeatMap, localPlaymatSlug]);

  const totalSeats = seatEntries.length;
  const [cursor, setCursor] = React.useState(0);
  const hasInteracted = React.useRef(false);

  React.useEffect(() => {
    if (totalSeats === 0) {
      if (cursor !== 0) setCursor(0);
      return;
    }
    if (cursor >= totalSeats) {
      setCursor(totalSeats - 1);
    }
  }, [cursor, totalSeats]);

  React.useEffect(() => {
    if (hasInteracted.current) return;
    if (totalSeats === 0) return;
    if (cursor !== 0) setCursor(0);
  }, [cursor, totalSeats]);

  const active = seatEntries[Math.min(cursor, Math.max(totalSeats - 1, 0))];

  const cycle = React.useCallback(
    (delta: number) => {
      if (totalSeats <= 1) return;
      hasInteracted.current = true;
      setCursor((prev) => {
        const next = (prev + delta + totalSeats) % totalSeats;
        return next;
      });
    },
    [totalSeats],
  );

  const handleWheel = React.useCallback(
    (evt: React.WheelEvent<HTMLDivElement>) => {
      if (totalSeats <= 1) return;
      evt.preventDefault();
      cycle(evt.deltaY > 0 ? 1 : -1);
    },
    [cycle, totalSeats],
  );

  const showLocal = active?.type === "local";

  return (
    <>
      <div className="relative">
        <div className="absolute right-3 top-2 z-10 flex items-center gap-2 text-[11px] text-zinc-400">
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
            onClick={() => cycle(-1)}
            disabled={totalSeats <= 1}
          >
            ◀
          </button>
          <span>
            {totalSeats === 0 ? "0 / 0" : `${cursor + 1} / ${totalSeats}`}
          </span>
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
            onClick={() => cycle(1)}
            disabled={totalSeats <= 1}
          >
            ▶
          </button>
        </div>

        <div onWheel={handleWheel} className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 font-mtgmasters">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span>{active?.name ?? "Battlefield"}</span>
            <span className="text-[10px] font-normal text-zinc-500">
              Scroll or use arrows to view other players
            </span>
          </div>

          {showLocal ? (
            <Zone
              id="battlefield"
              title="Battlefield"
              className="min-h-[360px]"
              isDragging={dragging}
              innerClassName="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] auto-rows-[7rem] gap-2"
              playmat={resolvePlaymat(localPlaymatSlug, playmats)}
            />
          ) : (
            <OpponentBattlefieldShell seat={active} playmats={playmats} />
          )}
        </div>
      </div>

      <div className="mt-3">
        <Zone id="lands" title="Lands" className="min-h-[120px]" isDragging={dragging} noWrap playmat={resolvePlaymat(localPlaymatSlug, playmats)} />
      </div>
    </>
  );
}

function resolvePlaymat(slug: string | null | undefined, map: PlaymatMap): { slug: string; filePath: string; name: string } | null {
  if (!slug) return null;
  const entry = map[slug];
  if (!entry || !entry.filePath) return null;
  return { slug, filePath: entry.filePath, name: entry.name };
}

function OpponentBattlefieldShell({ seat, playmats }: { seat: SeatEntry | undefined; playmats: PlaymatMap }) {
  if (!seat) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] text-zinc-400">
        No battlefield data
      </div>
    );
  }

  const cards = seat.cards ?? NO_CARDS;
  const lands = seat.lands ?? NO_CARDS;
  const command = seat.command ?? NO_CARDS;
  const playmatSlug = typeof seat.playmatKey === "string" ? seat.playmatKey : null;
  const resolvedPlaymat = resolvePlaymat(playmatSlug, playmats);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 font-mtgmasters">
      <div className="mb-2 text-xs font-semibold text-zinc-300">Battlefield</div>
      <div
        className="relative min-h-[360px] overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/80"
        style={resolvedPlaymat ? backgroundStyle(resolvedPlaymat.filePath) : undefined}
      >
        {cards.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-3">
            {cards.map((card) => (
              <OpponentCard key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] italic text-zinc-500">
            Empty
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <OpponentZoneGallery title="Lands" cards={lands} playmat={resolvedPlaymat} />
        <OpponentZoneGallery title="Command" cards={command} playmat={resolvedPlaymat} />
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[10px] text-zinc-400">
          Hand: <span className="font-semibold text-zinc-200">{seat.handCount}</span> cards
        </div>
      </div>
    </div>
  );
}

function backgroundStyle(url: string) {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  } as const;
}

function OpponentZoneGallery({ title, cards, playmat }: { title: string; cards: ReadonlyArray<CardItem>; playmat: { slug: string; filePath: string; name: string } | null }) {
  const preview = usePreview();
  const list = Array.isArray(cards) ? cards : NO_CARDS;
  const hasCards = list.length > 0;

  return (
    <div className="font-mtgmasters">
      <div className="text-[11px] font-semibold text-zinc-300">{title}</div>
      <div
        className="mt-1 min-h-[2.5rem] rounded border border-zinc-800 bg-zinc-950/60 p-2"
        style={playmat ? backgroundStyle(playmat.filePath) : undefined}
      >
        {hasCards ? (
          <div className="flex flex-wrap gap-1 text-[10px] text-zinc-200">
            {list.map((card) => (
              <span
                key={card.id}
                className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 hover:border-amber-400 hover:text-amber-200"
                onPointerEnter={() => preview.hoverIn(card.name)}
                onPointerLeave={() => preview.hoverOut()}
              >
                {card.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] italic text-zinc-500">Empty</span>
        )}
      </div>
    </div>
  );
}

function LifeCommanderLeft() {
  const params2 = useParams<{ code: string }>();
  const roomCode = (params2?.code ?? "").toString().toUpperCase();
  const life = useGame((s: any) => (s && s.life) ?? 40);
  const mySeat = useGame(selectMySeat);
  const players = useGame((s: GameState) => s.players) ?? [];
  const remoteSeats = useGame((s: GameState) => s.remoteSeats) ?? {};
  const lifeThemeIdx = useGame(selectLifeThemeIndex);
  const lifeThemeHex = useGame(selectLifeThemeHex);
  const poison = useGame((s: any) => (s && s.poison) ?? 0);
  const commanderDamage = useGame((s: any) => (s && s.commanderDamage) ? (s.commanderDamage as Record<string, number>) : {});
  const doIncLife = (n: number) => { const api: any = (useGame as any).getState?.(); api?.incLife?.(n); };
  const doIncPoison = (n: number) => { const api: any = (useGame as any).getState?.(); api?.incPoison?.(n); };
  const adjustCommanderDamage = React.useCallback((key: string, delta: number) => {
    if (!key) return;
    const api: any = (useGame as any).getState?.();
    api?.incCommanderDamage?.(key, delta);
  }, []);
  const setLifeThemeIndex = React.useCallback((idx: number) => {
    const api: any = (useGame as any).getState?.();
    api?.setLifeThemeIndex?.(idx);
  }, []);
  const setLifeThemeHex = React.useCallback((hex: string | null) => {
    const api: any = (useGame as any).getState?.();
    api?.setLifeThemeHex?.(hex);
  }, []);
  const socket = React.useMemo(() => getSocket(), []);
  const [rolling, setRolling] = React.useState<{die:number; value?:number; by?:string} | null>(null);
  const [diceLog, setDiceLog] = React.useState<{ die:number; value:number; by:string }[]>([]);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [customHex, setCustomHex] = React.useState<string>(lifeThemeHex ?? "");
  const paletteContainerRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    setCustomHex(lifeThemeHex ?? "");
  }, [lifeThemeHex]);
  React.useEffect(() => {
    if (!paletteOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!paletteContainerRef.current) return;
      if (paletteContainerRef.current.contains(target)) return;
      setPaletteOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [paletteOpen]);
  const normalizedCustomHex = React.useMemo(() => normalizeHex(customHex), [customHex]);
  const localTheme = React.useMemo(() => {
    const base = computeTheme(lifeThemeIdx, lifeThemeHex);
    return life <= 10 ? LIFE_D20_THEMES[3] : base;
  }, [lifeThemeIdx, lifeThemeHex, life]);
  React.useEffect(() => {
    let mounted = true;
    const onDice = (payload: any) => {
      const by = (payload && payload.by) || "Player";
      const die = Number(payload?.die || 20);
      const value = Number(payload?.value || 1);
      if (!mounted) return;
      setRolling({ die });
      setTimeout(() => {
        if (!mounted) return;
        setRolling({ die, value, by });
        setDiceLog((l) => [{ die, value, by }, ...l].slice(0, 6));
      }, 300);
      setTimeout(() => {
        if (!mounted) return;
        setRolling(null);
      }, 900);
    };
    socket.on("dice", onDice);
    return () => {
      mounted = false;
      socket.off("dice", onDice);
    };
  }, [socket]);
  function rollDie(d: number) {
    const value = Math.floor(Math.random() * d) + 1;
    setRolling({ die: d, value, by: "You" });
    setDiceLog((l) => [{ die: d, value, by: "You" }, ...l].slice(0, 6));
    const payload = { die: d, value };
    if (roomCode) socket.emit("dice", roomCode, payload);
    else socket.emit("dice", payload);
    setTimeout(() => setRolling(null), 800);
  }

  const lifeRows = React.useMemo(() => {
    const rows: { key: string; label: string; value: number | null; themeIdx: number; themeHex: string | null }[] = [];
    const localLabel = players?.[mySeat]?.name || "You";
    rows.push({ key: "local", label: localLabel, value: life, themeIdx: lifeThemeIdx, themeHex: lifeThemeHex });

    const entries = Object.entries(remoteSeats as Record<string, RemoteSeatState>);
    entries.forEach(([id, seat], idx) => {
      if (!seat) return;
      const seatIndex = typeof seat.seatIndex === "number" ? seat.seatIndex : -1;
      const sameSeat = mySeat >= 0 && seatIndex === mySeat;
      const sameName = players?.[mySeat]?.name && seat.name && seat.name === players[mySeat]!.name;
      if (sameSeat || sameName) return;
      const playerName = seatIndex >= 0 && seatIndex < players.length ? players[seatIndex]?.name : null;
      rows.push({
        key: id ?? `remote-${idx}`,
        label: seat.name || playerName || `Opponent ${idx + 1}`,
        value: typeof seat.life === "number" ? seat.life : null,
        themeIdx: typeof seat.lifeThemeIndex === "number" ? seat.lifeThemeIndex : lifeThemeIdx,
        themeHex: typeof seat.lifeThemeHex === "string" ? seat.lifeThemeHex : null,
      });
    });

    return rows;
  }, [players, remoteSeats, mySeat, life, lifeThemeIdx, lifeThemeHex]);

  const renderMiniD20 = React.useCallback((value: number | null, themeIdx: number, themeHex?: string | null) => {
    const lowLife = typeof value === "number" && value <= 10;
    const effectiveIdx = typeof themeIdx === "number" ? themeIdx : 0;
    const themeBase = computeTheme(effectiveIdx, themeHex ?? lifeThemeHex);
    const theme = lowLife ? LIFE_D20_THEMES[3] : themeBase;
    const gradientId = `life-d20-${effectiveIdx}-${lowLife ? "low" : "hi"}`;
    return (
      <div className="relative h-12 w-12 select-none">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor={theme.top} />
              <stop offset="100%" stopColor={theme.bottom} />
            </linearGradient>
          </defs>
          <polygon points="50,3 86,20 97,58 72,94 28,94 3,58 14,20" fill={`url(#${gradientId})`} stroke={theme.stroke} strokeWidth="3" />
          <polyline points="50,3 72,94 28,94 50,3" fill="none" stroke={theme.poly} strokeOpacity="0.35" strokeWidth="2" />
          <polyline points="86,20 3,58 97,58 14,20" fill="none" stroke={theme.poly} strokeOpacity="0.35" strokeWidth="2" />
        </svg>
        <div
          className={`pointer-events-none absolute inset-0 grid place-items-center text-sm font-extrabold ${theme.textClass} ${theme.glowClass}`}
        >
          {value ?? "--"}
        </div>
      </div>
    );
  }, []);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mtgmasters">
      <h3 className="text-xs font-semibold text-zinc-300">Life</h3>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="col-span-2 rounded border border-zinc-800 p-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Life</span>
            <div
              className="relative h-16 w-16 select-none"
              title="Scroll to change, double-click to reset"
              onWheel={(e) => doIncLife(e.deltaY < 0 ? 1 : -1)}
              onDoubleClick={() => doIncLife(40 - life)}
              role="img"
              aria-label={`Life total ${life}`}
            >
              <svg viewBox="0 0 100 100" className="h-full w-full">
                <defs>
                  <linearGradient id="d20grad" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor={localTheme.top} />
                    <stop offset="100%" stopColor={localTheme.bottom} />
                  </linearGradient>
                </defs>
                <polygon points="50,3 86,20 97,58 72,94 28,94 3,58 14,20" fill="url(#d20grad)" stroke={localTheme.stroke} strokeWidth="3" />
                <polyline points="50,3 72,94 28,94 50,3" fill="none" stroke={localTheme.poly} strokeOpacity="0.35" strokeWidth="2" />
                <polyline points="86,20 3,58 97,58 14,20" fill="none" stroke={localTheme.poly} strokeOpacity="0.35" strokeWidth="2" />
              </svg>
              <div className={`pointer-events-none absolute inset-0 grid place-items-center text-2xl font-extrabold ${localTheme.textClass} ${localTheme.glowClass}`}>
                {life}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => doIncLife(1)} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-amber-400">+1</button>
            <button onClick={() => doIncLife(-1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">-1</button>
            <button onClick={() => doIncLife(5)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">+5</button>
            <button onClick={() => doIncLife(-5)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">-5</button>
          </div>
        </div>
        <div className="rounded border border-zinc-800 p-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Poison</span>
            <span className="text-lg font-bold">{poison}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => doIncPoison(1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">+1</button>
            <button onClick={() => doIncPoison(-1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">-1</button>
          </div>
        </div>
      </div>
      {lifeRows.length > 0 && (
        <div className="mt-3 space-y-2">
          {lifeRows.map((row, idx) => {
            const isLocal = idx === 0;
            const opponentKey = !isLocal ? row.key : null;
            const commanderValue = opponentKey ? commanderDamage[opponentKey] ?? 0 : 0;
            return (
              <div key={row.key ?? `${row.label}-${idx}`} className="flex items-center gap-3 text-xs text-zinc-300">
                {renderMiniD20(row.value, typeof row.themeIdx === "number" ? row.themeIdx : idx, row.themeHex)}
                <span className="truncate text-zinc-200">{row.label}</span>
                {!isLocal && opponentKey && (
                  <div
                    className="flex cursor-ns-resize select-none items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-200 hover:border-amber-400"
                    title="Scroll to adjust commander damage"
                    onWheel={(e) => {
                      e.preventDefault();
                      adjustCommanderDamage(opponentKey, e.deltaY < 0 ? 1 : -1);
                    }}
                  >
                    <span className="text-zinc-400">CMD</span>
                    <span className="font-semibold text-amber-300">{commanderValue}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 rounded border border-zinc-800 p-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-zinc-300">Life Die Color</div>
          <button
            onClick={() => setPaletteOpen((open) => !open)}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800"
          >
            Customize
          </button>
        </div>
        {paletteOpen && (
          <div ref={paletteContainerRef} className="mt-2 grid gap-2">
            <div className="grid grid-cols-4 gap-2">
              {LIFE_D20_THEMES.map((theme, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setLifeThemeIndex(idx);
                    setLifeThemeHex(null);
                  }}
                  className={`relative flex h-10 items-center justify-center rounded border ${lifeThemeIdx === idx && !lifeThemeHex ? "border-amber-400" : "border-zinc-700 hover:border-sky-400"}`}
                >
                  <div className="h-6 w-6">
                    <svg viewBox="0 0 100 100" className="h-full w-full">
                      <defs>
                        <linearGradient id={`life-theme-${idx}`} x1="0" x2="1" y1="0" y2="1">
                          <stop offset="0%" stopColor={theme.top} />
                          <stop offset="100%" stopColor={theme.bottom} />
                        </linearGradient>
                      </defs>
                      <polygon points="50,3 86,20 97,58 72,94 28,94 3,58 14,20" fill={`url(#life-theme-${idx})`} stroke={theme.stroke} strokeWidth="3" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-zinc-400">Custom Hex</label>
              <input
                type="text"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                placeholder="#1f2937"
                className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none"
              />
              <button
                onClick={() => {
                  if (normalizedCustomHex) {
                    setLifeThemeHex(normalizedCustomHex);
                  }
                }}
                className={`rounded border px-2 py-1 text-xs ${normalizedCustomHex ? "border-emerald-500 text-emerald-300 hover:bg-emerald-500/10" : "border-zinc-700 text-zinc-400"}`}
                disabled={!normalizedCustomHex}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 rounded border border-zinc-800 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-300">Roll Dice</span>
          {rolling && (
            <span className="text-zinc-400">d{rolling.die}</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[6,8,10,12,20].map((d)=> (
            <button key={d} onClick={()=>rollDie(d)} className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">d{d}</button>
          ))}
        </div>
        {rolling && (
          <div className="mt-2 grid place-items-center">
            <div className={`h-16 w-16 rounded-full border-2 border-zinc-700 grid place-items-center`}>
              <span className="text-xl font-extrabold">{rolling.value}</span>
            </div>
          </div>
        )}
        {diceLog.length > 0 && (
          <div className="mt-2 max-h-24 overflow-auto text-[11px] text-zinc-400">
            {diceLog.map((r,i)=> (
              <div key={i}>[{r.by}] d{r.die} → <span className="font-semibold text-zinc-200">{r.value}</span></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
