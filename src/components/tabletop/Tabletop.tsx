"use client";
import React from "react";
import { DndContext, DragEndEvent, rectIntersection, DragStartEvent, useSensor, useSensors, PointerSensor, DragMoveEvent, useDroppable } from "@dnd-kit/core";
import Zone from "./Zone";
import OpponentCard from "./OpponentCard";
import LibraryStack from "./LibraryStack";
import { useGame, type ZoneId, type CardItem, type RemoteSeatState, type GameState, type LogEntry } from "../../state/game";
import { getSocket } from "../../lib/socket";
import { useParams } from "next/navigation";
import HandOverlay from "./HandOverlay";
import { usePreview } from "./PreviewProvider";
import Card from "./Card";
import type { PlaymatAdjustment } from "../../hooks/usePlaymatAdjustments";

function PhyrexianPoisonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <circle cx="60" cy="70" r="40" stroke="currentColor" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path
        fill="currentColor"
        d="M60 0 52.6 20.8c-1.9 5.4-2.8 11-2.8 17.4 0 8.1 1.8 16.2 4.8 26.2-3 10-4.8 18.1-4.8 26.2 0 6.4.9 12 2.8 17.4L60 140l7.4-31.2c1.9-5.4 2.8-11 2.8-17.4 0-8.1-1.8-16.2-4.8-26.2 3-10 4.8-18.1 4.8-26.2 0-6.4-.9-12-2.8-17.4Z"
      />
    </svg>
  );
}

function GameLogPanel({ entries, open, onClose }: { entries: LogEntry[]; open: boolean; onClose: () => void }) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [open, entries.length]);

  if (!open) return null;

  return (
    <div className="fixed bottom-16 left-4 z-50 w-80 max-h-[320px] overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/90 shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-200">
        <span>Game Log</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
        >
          Close
        </button>
      </div>
      <div ref={bodyRef} className="max-h-[260px] overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-zinc-200">
        {entries.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">No activity yet.</div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-zinc-800/50 pb-2 last:border-b-0 last:pb-0">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div>{entry.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const NO_CARDS: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);
const EMPTY_REMOTE: Readonly<Record<string, RemoteSeatState>> = Object.freeze({} as Record<string, RemoteSeatState>);
const LIFE_D20_THEMES: ReadonlyArray<{
  top: string;
  bottom: string;
  stroke: string;
  poly: string;
  textClass: string;
  glowClass: string;
  textColor: string;
  textShadow: string;
}> = [
  {
    top: "#0b1220",
    bottom: "#0a1a33",
    stroke: "#3b82f6",
    poly: "#60a5fa",
    textClass: "text-sky-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(56,189,248,0.45)]",
    textColor: "#e2f3ff",
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
  },
  {
    top: "#0d1d16",
    bottom: "#103624",
    stroke: "#34d399",
    poly: "#6ee7b7",
    textClass: "text-emerald-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(16,185,129,0.45)]",
    textColor: "#dcfce7",
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
  },
  {
    top: "#1d1909",
    bottom: "#37280a",
    stroke: "#fbbf24",
    poly: "#fcd34d",
    textClass: "text-amber-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(250,204,21,0.45)]",
    textColor: "#fff7d6",
    textShadow: "0 2px 8px rgba(0,0,0,0.68)",
  },
  {
    top: "#240c14",
    bottom: "#3f1725",
    stroke: "#f43f5e",
    poly: "#fb7185",
    textClass: "text-rose-200",
    glowClass: "drop-shadow-[0_0_6px_rgba(244,63,94,0.45)]",
    textColor: "#ffe6f1",
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
  },
];

const selectMySeat = (s: any) => (typeof s?.mySeat === "number" ? (s.mySeat as number) : -1);
const selectLocalBattlefield = (s: any) => (Array.isArray(s?.zones?.battlefield) ? s.zones.battlefield : NO_CARDS);
const selectLocalLands = (s: any) => (Array.isArray(s?.zones?.lands) ? s.zones.lands : NO_CARDS);
const selectLocalCommand = (s: any) => (Array.isArray(s?.zones?.command) ? s.zones.command : NO_CARDS);
const selectLocalGraveyard = (s: any) => (Array.isArray(s?.zones?.graveyard) ? s.zones.graveyard : NO_CARDS);
const selectLocalExile = (s: any) => (Array.isArray(s?.zones?.exile) ? s.zones.exile : NO_CARDS);
const selectLocalHandCount = (s: any) => (Array.isArray(s?.zones?.hand) ? s.zones.hand.length : 0);
const selectLocalPlaymatSlug = (s: any) => (typeof s?.playmatKey === "string" ? s.playmatKey : null);
const selectRemoteSeatMap = (s: any) => (s && s.remoteSeats ? (s.remoteSeats as Record<string, RemoteSeatState>) : EMPTY_REMOTE);
const selectLifeThemeIndex = (s: any) => (typeof s?.lifeThemeIndex === "number" ? s.lifeThemeIndex : 0);
const selectLifeThemeHex = (s: any) => (typeof s?.lifeThemeHex === "string" ? s.lifeThemeHex : null);
const selectLifeThemeImage = (s: any) => (typeof s?.lifeThemeImage === "string" ? s.lifeThemeImage : null);

function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  return null;
}

function FloatingPassTurnButton({ className = "" }: { className?: string }) {
  const passTurn = useGame((s: GameState) => s.passTurn);
  const turnOrder = useGame((s: GameState) => (Array.isArray(s.turnOrder) ? s.turnOrder : []));
  const currentTurn = useGame((s: GameState) => (typeof s.currentTurn === "number" ? s.currentTurn : 0));
  const currentPlayer = turnOrder.length ? turnOrder[currentTurn % turnOrder.length] : null;

  return (
    <button
      type="button"
      onClick={passTurn}
      className={`group flex items-center gap-2 rounded-full border border-amber-500 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur transition hover:bg-amber-500/30 ${className}`}
      title="Pass Turn"
    >
      <span>Pass Turn</span>
      {currentPlayer && <span className="text-[11px] text-amber-300/80">Current: {currentPlayer}</span>}
    </button>
  );
}

function CommandZoneWithOpponents({
  isDragging,
  opponentSeats,
  localPlayerKey,
}: {
  isDragging: boolean;
  opponentSeats: ReadonlyArray<RemoteSeatState>;
  localPlayerKey?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "command" });
  const cards = useGame(selectLocalCommand);
  const preview = usePreview();

  const opponentEntries = React.useMemo(() => {
    if (!Array.isArray(opponentSeats) || opponentSeats.length === 0) return [] as Array<{ key: string; title: string; cards: ReadonlyArray<CardItem>; tax: number }>;
    const list: Array<{ key: string; title: string; cards: ReadonlyArray<CardItem>; tax: number }> = [];
    const seen = new Set<string>();

    opponentSeats.forEach((seat, idx) => {
      if (!seat) return;
      if (localPlayerKey && seat.playerKey && seat.playerKey === localPlayerKey) return;
      const key = seat.playerKey ?? seat.id ?? `opponent-${idx}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      const rawCards = Array.isArray(seat?.zones?.command)
        ? seat.zones.command
        : Array.isArray((seat as any)?.command)
          ? ((seat as any).command as ReadonlyArray<CardItem>)
          : NO_CARDS;
      const cards = Array.isArray(rawCards) ? rawCards : NO_CARDS;
      const taxCount = typeof seat.commanderTaxCount === "number" && seat.commanderTaxCount > 0 ? seat.commanderTaxCount : 0;
      const title = seat.name && seat.name.trim().length > 0 ? seat.name : `Opponent ${idx + 1}`;
      list.push({ key, title, cards, tax: taxCount });
    });

    return list;
  }, [opponentSeats, localPlayerKey]);

  const localCards = Array.isArray(cards) ? cards : NO_CARDS;

  return (
    <div
      id="zone-command"
      ref={setNodeRef}
      className={`rounded-md border border-zinc-800/70 bg-zinc-900/30 p-2 backdrop-blur-sm ${isDragging && isOver ? "ring-2 ring-amber-500" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
        <span>Command Zone</span>
        <span className="text-[10px] font-normal text-zinc-500">Local + Opponents</span>
      </div>
      <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
        <div className="flex flex-wrap justify-center gap-2">
          {localCards.length > 0 ? (
            localCards.map((card) => <Card key={card.id} card={card} sizeClass="w-36 h-52" />)
          ) : (
            <div className="rounded border border-dashed border-zinc-700/80 bg-zinc-900/20 px-3 py-2 text-[10px] italic text-zinc-500">No commanders</div>
          )}
        </div>
        {opponentEntries.length > 0 && (
          <div className="space-y-2">
            {opponentEntries.map(({ key, title, cards: oppCards, tax }) => (
              <div key={key} className="rounded border border-zinc-800/70 bg-zinc-900/30">
                <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold text-zinc-200">
                  <span className="truncate pr-2" title={title}>{title}</span>
                  <span className="text-amber-300">Tax {Math.max(0, tax * 2)}</span>
                </div>
                <div className="border-t border-zinc-800/70 px-2 py-1">
                  {oppCards.length > 0 ? (
                    <div className="flex flex-wrap gap-1 text-[10px] text-zinc-200">
                      {oppCards.map((card) => (
                        <span
                          key={card.id}
                          className="rounded border border-zinc-800/60 bg-zinc-900/30 px-1.5 py-0.5 hover:border-amber-400 hover:text-amber-200"
                          onPointerEnter={() => preview.hoverIn(card.name)}
                          onPointerLeave={() => preview.hoverOut()}
                        >
                          {card.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] italic text-zinc-500">No commanders revealed</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OpponentCommanderWindow({
  cards,
  playmat,
  commanderTax,
}: {
  cards: ReadonlyArray<CardItem>;
  playmat: { slug: string; filePath: string; name: string } | null;
  commanderTax: number | null | undefined;
}) {
  const list = Array.isArray(cards) ? cards : NO_CARDS;
  const primary = list[0];
  const others = list.slice(1);
  const tax = typeof commanderTax === "number" ? commanderTax : 0;

  return (
    <div className="rounded-xl border border-amber-400/40 bg-zinc-950/95 px-3 py-2 text-[10px] text-zinc-200 shadow-lg">
      <div className="flex items-center justify-between font-semibold">
        <span className="text-[11px] uppercase tracking-wide text-amber-200/90">Commander</span>
        <span className="rounded border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
          Tax {Math.max(0, tax * 2)}
        </span>
      </div>
      <div
        className="mt-3 flex min-h-[160px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80"
        style={playmat ? backgroundStyle(playmat.filePath) : undefined}
      >
        {primary ? (
          <OpponentCard card={primary} sizeClass="h-40 w-28" className="mx-auto" />
        ) : (
          <span className="text-[9px] italic text-zinc-500">No commander cards</span>
        )}
      </div>
      {others.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1 text-[9px] text-zinc-300">
          {others.map((card) => (
            <span key={card.id} className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5">
              {card.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
  const textColor = luminance > 150 ? "#131313" : "#f9fafb";
  const textShadow = luminance > 150 ? "0 2px 8px rgba(0,0,0,0.62)" : "0 2px 8px rgba(0,0,0,0.78)";
  return { top, bottom, stroke, poly, textClass, glowClass, textColor, textShadow };
}

function OpponentZoneGroup({
  zone,
  seats,
  localPlayerKey,
}: {
  zone: "graveyard" | "exile";
  seats: ReadonlyArray<RemoteSeatState>;
  localPlayerKey?: string;
}) {
  const preview = usePreview();

  const entries = React.useMemo(() => {
    if (!Array.isArray(seats) || seats.length === 0) return [] as Array<{ key: string; title: string; cards: ReadonlyArray<CardItem> }>;
    const list: Array<{ key: string; title: string; cards: ReadonlyArray<CardItem> }> = [];
    const seen = new Set<string>();

    seats.forEach((seat, idx) => {
      if (!seat) return;
      if (localPlayerKey && seat.playerKey && seat.playerKey === localPlayerKey) return;
      const key = typeof seat.id === "string" && seat.id.length > 0 ? seat.id : seat.socketId ?? `remote-${idx}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      const cardsSource = zone === "graveyard" ? seat.graveyard : seat.exile;
      const cards = Array.isArray(cardsSource) ? cardsSource : NO_CARDS;
      list.push({ key, title: seat.name || `Opponent ${idx + 1}`, cards });
      seen.add(key);
    });

    return list;
  }, [zone, seats, localPlayerKey]);

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (entries.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-[10px] italic text-zinc-500">
        No opponent cards in this zone
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
      {entries.map(({ key, title, cards }) => {
        const hasCards = cards.length > 0;
        const isOpen = !!expanded[key];
        return (
          <div key={key} className="rounded border border-zinc-800/70 bg-zinc-900/35 backdrop-blur-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-zinc-900/70"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
            >
              <span className="truncate pr-2">{title}</span>
              <span className="text-[10px] font-normal text-zinc-400">{hasCards ? `${cards.length}` : "Empty"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-zinc-800 px-3 py-2">
                {hasCards ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                    {cards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded border border-zinc-700/70 bg-zinc-900/30 px-2 py-1 text-[10px] backdrop-blur-sm hover:border-amber-400 hover:text-amber-200"
                        onPointerEnter={() => preview.hoverIn(card.name)}
                        onPointerLeave={() => preview.hoverOut()}
                        title={card.name}
                      >
                        {card.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] italic text-zinc-500">No cards</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScrollableZoneWithOpponents({
  zoneId,
  title,
  isDragging,
  opponentSeats,
  localPlayerKey,
}: {
  zoneId: "graveyard" | "exile";
  title: string;
  isDragging: boolean;
  opponentSeats: ReadonlyArray<RemoteSeatState>;
  localPlayerKey?: string;
}) {
  // Determine if this is a zone that should be transparent
  const isTransparentZone = ['graveyard', 'exile', 'command'].includes(zoneId);
  
  return (
    <div className={`rounded border border-zinc-800/80 p-2 text-[11px] text-zinc-200 space-y-2 ${isTransparentZone ? 'bg-transparent' : 'bg-zinc-950/70'}`}>
      <Zone
        id={zoneId}
        title={title}
        className={isTransparentZone ? 'bg-transparent' : 'bg-zinc-900/90'}
        isDragging={isDragging}
        innerClassName="max-h-40 overflow-auto flex flex-wrap content-start gap-2"
      />
      <OpponentZoneGroup zone={zoneId} seats={opponentSeats} localPlayerKey={localPlayerKey} />
    </div>
  );
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
  playmats: PlaymatMap;
  localPlayerKey?: string;
  getPlaymatAdjustment?: (slug: string | null | undefined) => PlaymatAdjustment;
};

export default function Tabletop({ presence = [], socketId, playmats, localPlayerKey, getPlaymatAdjustment }: TabletopProps) {
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const [dragging, setDragging] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pointer = React.useRef<{x:number; y:number}>({x:0,y:0});
  const [logOpen, setLogOpen] = React.useState(false);
  const mySeat = useGame(selectMySeat);
  const remoteSeatMap = useGame(selectRemoteSeatMap) as Record<string, RemoteSeatState>;
  const logEntries = useGame((s: any) => (Array.isArray(s?.log) ? (s.log as LogEntry[]) : []));
  const localPlaymatSlug = useGame(selectLocalPlaymatSlug);
  const opponentRemoteSeats = React.useMemo(() => Object.values(remoteSeatMap ?? {}), [remoteSeatMap]);
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

  const draw = React.useCallback((n: number) => {
    const api: any = (useGame as any).getState?.();
    api?.draw?.(n);
  }, []);

  const handleToggle = (cardId: string) => {
    const api: any = (useGame as any).getState?.();
    api?.toggleTap?.(cardId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragMove={onDragMove}>
      <>
        <div className="relative grid h-full grid-cols-[280px_1fr_220px] grid-rows-[1fr] gap-4 overflow-hidden pb-28">
        {/* Left: Graveyard / Exile + Life/Commander */}
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/25 p-3 shadow-lg shadow-black/5 backdrop-blur-md">
          <ScrollableZoneWithOpponents
            zoneId="graveyard"
            title="Graveyard"
            isDragging={dragging}
            opponentSeats={opponentRemoteSeats}
            localPlayerKey={localPlayerKey}
          />
          <ScrollableZoneWithOpponents
            zoneId="exile"
            title="Exile"
            isDragging={dragging}
            opponentSeats={opponentRemoteSeats}
            localPlayerKey={localPlayerKey}
          />
          <LifeCommanderLeft />
        </div>

        {/* Center: Shared battlefield + Lands */}
        <div className="relative flex h-full flex-col gap-2.5 overflow-hidden">
          <SharedBattlefieldSection
            dragging={dragging}
            mySeat={mySeat}
            presence={opponentPresence}
            remoteSeatMap={remoteSeatMap}
            socketId={socketId}
            playmats={playmats}
            localPlaymatSlug={localPlaymatSlug}
            getPlaymatAdjustment={getPlaymatAdjustment}
          />
        </div>

        {/* Right: Command Zone above Library stack */}
        <div className="flex h-full flex-col gap-3">
          <CommandZoneWithOpponents isDragging={dragging} opponentSeats={opponentRemoteSeats} localPlayerKey={localPlayerKey} />
          <CommanderTaxPanel />
          <div className="flex flex-1 flex-col">
            <LibraryStack />
          </div>
        </div>

        {/* Floating Hand overlay */}
        <HandOverlay />
        </div>
        <button
          type="button"
          onClick={() => setLogOpen((prev) => !prev)}
          className="fixed bottom-16 left-4 z-50 rounded-full border border-amber-500 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 backdrop-blur transition hover:bg-amber-500/20 hover:text-amber-100"
        >
          {logOpen ? "Hide Log" : "Show Log"}
        </button>
        <GameLogPanel entries={logEntries} open={logOpen} onClose={() => setLogOpen(false)} />
      </>
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
  graveyard?: ReadonlyArray<CardItem>;
  exile?: ReadonlyArray<CardItem>;
  commanderTaxCount?: number | null;
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
  getPlaymatAdjustment?: (slug: string | null | undefined) => PlaymatAdjustment;
};

function SharedBattlefieldSection({ dragging, mySeat, presence, remoteSeatMap, socketId, playmats, localPlaymatSlug, getPlaymatAdjustment }: SharedBattlefieldSectionProps) {
  const localBattlefield = useGame(selectLocalBattlefield);
  const localLands = useGame(selectLocalLands);
  const localCommand = useGame(selectLocalCommand);
  const localHandCount = useGame(selectLocalHandCount);

  const localGraveyard = useGame(selectLocalGraveyard);
  const localExile = useGame(selectLocalExile);
  const currentTurn = useGame((s: GameState) => (typeof s?.currentTurn === "number" ? s.currentTurn : 0));
  const turnOrder = useGame((s: GameState) => (Array.isArray(s?.turnOrder) ? s.turnOrder : []));
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
        graveyard: Array.isArray(snapshot?.graveyard) ? snapshot.graveyard : NO_CARDS,
        exile: Array.isArray(snapshot?.exile) ? snapshot.exile : NO_CARDS,
        commanderTaxCount: typeof snapshot?.commanderTaxCount === "number" ? snapshot.commanderTaxCount : null,
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
        commanderTaxCount: typeof snapshot?.commanderTaxCount === "number" ? snapshot.commanderTaxCount : null,
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
  const currentPlayerName = turnOrder.length > 0 ? turnOrder[currentTurn % turnOrder.length] : null;
  const isMyTurn = currentPlayerName && typeof active?.name === "string" ? currentPlayerName === active.name : false;

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
              playmat={resolvePlaymat(localPlaymatSlug, playmats, getPlaymatAdjustment)}
            />
          ) : (
            <OpponentBattlefieldShell seat={active} playmats={playmats} getPlaymatAdjustment={getPlaymatAdjustment} />
          )}

          {currentPlayerName ? (
            <div className="pointer-events-none absolute bottom-16 right-4 text-[11px] font-semibold text-amber-200">
              Current Turn: {currentPlayerName}
              {isMyTurn ? " (You)" : ""}
            </div>
          ) : null}

          <FloatingPassTurnButton className="absolute bottom-4 right-4" />
        </div>
      </div>

      <div className="mt-3">
        <Zone
          id="lands"
          title="Lands"
          className="min-h-[120px]"
          isDragging={dragging}
          noWrap
          playmat={resolvePlaymat(localPlaymatSlug, playmats, getPlaymatAdjustment)}
        />
      </div>
    </>
  );
}

function resolvePlaymat(
  slug: string | null | undefined,
  map: PlaymatMap,
  getAdjustment?: (slug: string | null | undefined) => PlaymatAdjustment,
): { slug: string; filePath: string; name: string; adjustment?: PlaymatAdjustment } | null {
  if (!slug) return null;
  const entry = map[slug];
  if (!entry || !entry.filePath) return null;
  const adjustment = getAdjustment ? getAdjustment(slug) : undefined;
  return { slug, filePath: entry.filePath, name: entry.name, adjustment };
}

function OpponentBattlefieldShell({ seat, playmats, getPlaymatAdjustment }: { seat: SeatEntry | undefined; playmats: PlaymatMap; getPlaymatAdjustment?: (slug: string | null | undefined) => PlaymatAdjustment }) {
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
  const resolvedPlaymat = resolvePlaymat(playmatSlug, playmats, getPlaymatAdjustment);
  const usePositions = cards.some((card) => typeof card?.x === "number" || typeof card?.y === "number");

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 font-mtgmasters">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
        <span>Battlefield</span>
        <div className="flex items-center gap-2 text-[10px] text-zinc-300">
          <span className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5">
            <span role="img" aria-label="hand" className="text-xs">🤚</span>
            <span className="font-semibold text-zinc-100">{seat.handCount}</span>
          </span>
        </div>
      </div>
      <div
        className="relative min-h-[360px] overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/80"
        style={resolvedPlaymat ? backgroundStyle(resolvedPlaymat.filePath) : undefined}
      >
        {cards.length > 0 ? (
          usePositions ? (
            <div className="relative h-full w-full">
              {cards.map((card) => {
                const left = typeof card?.x === "number" ? card.x : 0;
                const top = typeof card?.y === "number" ? card.y : 0;
                return (
                  <div key={card.id} className="absolute" style={{ left, top }}>
                    <OpponentCard card={card} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 p-3">
              {cards.map((card) => (
                <OpponentCard key={card.id} card={card} />
              ))}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] italic text-zinc-500">
            Empty
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <OpponentZoneGallery title="Lands" cards={lands} playmat={resolvedPlaymat} />
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
  const isLands = title.toLowerCase() === "lands";

  return (
    <div className="font-mtgmasters">
      <div className="text-[11px] font-semibold text-zinc-300">{title}</div>
      <div
        className="mt-1 min-h-[2.5rem] rounded border border-zinc-800 bg-zinc-950/60 p-2"
        style={playmat ? backgroundStyle(playmat.filePath) : undefined}
      >
        {hasCards ? (
          isLands ? (
            <div className="flex flex-wrap gap-2">
              {list.map((card) => (
                <OpponentCard key={card.id} card={card} sizeClass="h-24 w-16" />
              ))}
            </div>
          ) : (
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
          )
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
  const lifeThemeImage = useGame(selectLifeThemeImage);
  const poison = useGame((s: any) => (s && s.poison) ?? 0);
  const commanderDamage = useGame((s: any) => (s && s.commanderDamage) ? (s.commanderDamage as Record<string, number>) : {});
  const turnOrder = useGame((s: GameState) => (Array.isArray(s.turnOrder) ? s.turnOrder : []));
  const currentTurn = useGame((s: GameState) => (typeof s.currentTurn === "number" ? s.currentTurn : 0));
  const setTurnOrder = useGame((s: GameState) => s.setTurnOrder);
  const passTurn = useGame((s: GameState) => s.passTurn);
  const doIncLife = React.useCallback((n: number) => {
    const api: any = (useGame as any).getState?.();
    api?.incLife?.(n);
  }, []);
  const doIncPoison = React.useCallback((n: number) => {
    const api: any = (useGame as any).getState?.();
    api?.incPoison?.(n);
  }, []);
  const adjustCommanderDamage = React.useCallback((key: string, delta: number) => {
    if (!key) return;
    const api: any = (useGame as any).getState?.();
    api?.incCommanderDamage?.(key, delta);
  }, []);
  const lifeWheelRef = React.useRef<HTMLDivElement | null>(null);
  const poisonWheelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = lifeWheelRef.current;
    if (!node) return;
    const handleWheel: EventListener = (event) => {
      const wheel = event as WheelEvent;
      if (wheel.cancelable) wheel.preventDefault();
      wheel.stopPropagation();
      wheel.stopImmediatePropagation?.();
      const step = wheel.deltaY < 0 ? 1 : -1;
      doIncLife(step);
    };
    node.addEventListener("wheel", handleWheel, true);
    return () => {
      node.removeEventListener("wheel", handleWheel, true);
    };
  }, [doIncLife]);

  React.useEffect(() => {
    // remove existing wheel listeners to disable scroll adjustments on poison counter
    const node = poisonWheelRef.current;
    if (!node) return;
    const noop: EventListener = (event) => {
      const wheel = event as WheelEvent;
      if (wheel.cancelable) wheel.preventDefault();
      wheel.stopPropagation();
      wheel.stopImmediatePropagation?.();
    };
    node.addEventListener("wheel", noop, true);
    return () => {
      node.removeEventListener("wheel", noop, true);
    };
  }, []);
  const setLifeThemeIndex = React.useCallback((idx: number) => {
    const api: any = (useGame as any).getState?.();
    api?.setLifeThemeIndex?.(idx);
  }, []);
  const setLifeThemeHex = React.useCallback((hex: string | null) => {
    const api: any = (useGame as any).getState?.();
    api?.setLifeThemeHex?.(hex);
  }, []);
  const setLifeThemeImage = React.useCallback((image: string | null) => {
    const api: any = (useGame as any).getState?.();
    api?.setLifeThemeImage?.(image);
  }, []);
  const socket = React.useMemo(() => getSocket(), []);
  const [rolling, setRolling] = React.useState<{die:number; value?:number; by?:string} | null>(null);
  const [diceLog, setDiceLog] = React.useState<{ die:number; value:number; by:string }[]>([]);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [customHex, setCustomHex] = React.useState<string>(lifeThemeHex ?? "");
  const [pendingImage, setPendingImage] = React.useState<string | null>(lifeThemeImage);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [orderDraft, setOrderDraft] = React.useState<string>(() => turnOrder.join("\n"));
  const turnOrderEditingRef = React.useRef(false);
  const paletteContainerRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    setCustomHex(lifeThemeHex ?? "");
  }, [lifeThemeHex]);
  React.useEffect(() => {
    setPendingImage(lifeThemeImage ?? null);
  }, [lifeThemeImage]);
  React.useEffect(() => {
    if (turnOrderEditingRef.current) return;
    setOrderDraft(turnOrder.join("\n"));
  }, [turnOrder]);
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
    const hasImage = typeof lifeThemeImage === "string" && lifeThemeImage.trim().length > 0;
    const base = computeTheme(lifeThemeIdx, lifeThemeHex);
    return life <= 10 && !hasImage ? LIFE_D20_THEMES[3] : base;
  }, [lifeThemeIdx, lifeThemeHex, life, lifeThemeImage]);
  const localImage = React.useMemo(() => {
    if (typeof lifeThemeImage === "string" && lifeThemeImage.trim()) return lifeThemeImage.trim();
    return null;
  }, [lifeThemeImage]);
  const playerSuggestions = React.useMemo(() => {
    const set = new Set<string>();
    const localName = players?.[mySeat]?.name;
    if (localName) set.add(localName.trim());
    turnOrder.forEach((name) => {
      if (typeof name === "string" && name.trim()) set.add(name.trim());
    });
    players.forEach((p) => {
      if (p?.name && p.name.trim()) set.add(p.name.trim());
    });
    Object.values(remoteSeats as Record<string, RemoteSeatState>).forEach((seat) => {
      if (seat?.name && seat.name.trim()) set.add(seat.name.trim());
    });
    return Array.from(set);
  }, [players, mySeat, remoteSeats, turnOrder]);
  const handleApplySuggestions = React.useCallback(() => {
    if (playerSuggestions.length === 0) return;
    setOrderDraft(playerSuggestions.join("\n"));
  }, [playerSuggestions]);
  const handleSetTurnOrder = React.useCallback(() => {
    const parsed = orderDraft
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (parsed.length === 0) return;
    setTurnOrder(parsed);
  }, [orderDraft, setTurnOrder]);
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
    const rows: {
      key: string;
      label: string;
      value: number | null;
      themeIdx: number;
      themeHex: string | null;
      themeImage: string | null;
    }[] = [];

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
        themeImage: typeof seat.lifeThemeImage === "string" ? seat.lifeThemeImage : null,
      });
    });

    return rows;
  }, [players, remoteSeats, mySeat, lifeThemeIdx, lifeThemeHex]);

  const renderMiniD20 = React.useCallback(
    (value: number | null, themeIdx: number, themeHex?: string | null, themeImage?: string | null) => {
      const lowLife = typeof value === "number" && value <= 10;
      const effectiveIdx = typeof themeIdx === "number" ? themeIdx : 0;
      const image = themeImage && themeImage.trim().length > 0 ? themeImage : null;
      const themeBase = computeTheme(effectiveIdx, themeHex ?? lifeThemeHex);
      const theme = lowLife && !image ? LIFE_D20_THEMES[3] : themeBase;
      const gradientId = `life-d20-${effectiveIdx}-${lowLife ? "low" : "hi"}`;
      return (
        <div className="relative h-12 w-12 select-none">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor={theme.top} />
                <stop offset="100%" stopColor={theme.bottom} />
              </linearGradient>
              {image && (
                <pattern id={`${gradientId}-image`} patternUnits="objectBoundingBox" width="1" height="1">
                  <image href={image} preserveAspectRatio="xMidYMid slice" width="100" height="100" />
                </pattern>
              )}
            </defs>
            <polygon
              points="50,3 86,20 97,58 72,94 28,94 3,58 14,20"
              fill={image ? `url(#${gradientId}-image)` : `url(#${gradientId})`}
              stroke={theme.stroke}
              strokeWidth="3"
            />
            {!image && (
              <>
                <polyline points="50,3 72,94 28,94 50,3" fill="none" stroke={theme.poly} strokeOpacity="0.35" strokeWidth="2" />
                <polyline points="86,20 3,58 97,58 14,20" fill="none" stroke={theme.poly} strokeOpacity="0.35" strokeWidth="2" />
              </>
            )}
          </svg>
          <div
            className={`pointer-events-none absolute inset-0 grid place-items-center text-sm font-extrabold ${theme.textClass} ${theme.glowClass}`}
            style={{ color: theme.textColor, textShadow: theme.textShadow }}
          >
            {value ?? "--"}
          </div>
        </div>
      );
    },
    [lifeThemeHex],
  );

  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/25 p-4 font-mtgmasters max-h-96 overflow-y-auto space-y-3 shadow-lg shadow-black/10 backdrop-blur-md">
      <h3 className="text-xs font-semibold text-zinc-300">Life</h3>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-3 text-xs">
        <div className="rounded border border-zinc-800/60 bg-zinc-900/25 p-3 backdrop-blur-sm" style={{ overscrollBehavior: "contain" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">Life</span>
            <div
              className="relative h-16 w-16 select-none"
              title="Scroll to change, double-click to reset"
              onWheelCapture={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.nativeEvent.preventDefault === "function") {
                  e.nativeEvent.preventDefault();
                }
                if (typeof e.nativeEvent.stopImmediatePropagation === "function") {
                  e.nativeEvent.stopImmediatePropagation();
                }
                doIncLife(e.deltaY < 0 ? 1 : -1);
              }}
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
                  {localImage && (
                    <pattern id="d20grad-image" patternUnits="objectBoundingBox" width="1" height="1">
                      <image href={localImage} preserveAspectRatio="xMidYMid slice" width="100" height="100" />
                    </pattern>
                  )}
                </defs>
                <polygon
                  points="50,3 86,20 97,58 72,94 28,94 3,58 14,20"
                  fill={localImage ? "url(#d20grad-image)" : "url(#d20grad)"}
                  stroke={localTheme.stroke}
                  strokeWidth="3"
                />
                {!localImage && (
                  <>
                    <polyline points="50,3 72,94 28,94 50,3" fill="none" stroke={localTheme.poly} strokeOpacity="0.35" strokeWidth="2" />
                    <polyline points="86,20 3,58 97,58 14,20" fill="none" stroke={localTheme.poly} strokeOpacity="0.35" strokeWidth="2" />
                  </>
                )}
              </svg>
              <div
                className={`pointer-events-none absolute inset-0 grid place-items-center text-2xl font-extrabold ${localTheme.textClass} ${localTheme.glowClass}`}
                style={{ color: localTheme.textColor, textShadow: localTheme.textShadow }}
              >
                {life}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => doIncLife(1)} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-amber-400">+1</button>
            <button onClick={() => doIncLife(-1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">-1</button>
            <button onClick={() => doIncLife(5)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">+5</button>
            <button onClick={() => doIncLife(-5)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">-5</button>
          </div>
        </div>
        <div
          ref={poisonWheelRef}
          className="flex flex-col items-center gap-2"
          role="group"
          aria-label={`Poison counters ${poison}`}
        >
          <span className="uppercase tracking-wide text-[10px] text-emerald-300/80">Poison</span>
          <div className="relative">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-500/70 bg-emerald-600/15 text-emerald-200/90">
              <PhyrexianPoisonIcon className="h-10 w-10" />
            </div>
            <span className="pointer-events-none absolute -bottom-1 right-0 grid min-h-[1.75rem] min-w-[2.75rem] place-items-center rounded-full border border-emerald-500/60 bg-emerald-500/25 text-base font-bold text-emerald-100 shadow-lg">
              {poison}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-emerald-400/70 bg-gradient-to-b from-emerald-500/35 via-emerald-500/20 to-emerald-600/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.35)] transition hover:from-emerald-500/55 hover:via-emerald-500/30 hover:to-emerald-600/20"
              onClick={() => doIncPoison(1)}
            >
              +1
            </button>
            <button
              type="button"
              className="rounded border border-emerald-400/70 bg-gradient-to-b from-emerald-500/35 via-emerald-500/20 to-emerald-600/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.35)] transition hover:from-emerald-500/55 hover:via-emerald-500/30 hover:to-emerald-600/20 disabled:cursor-not-allowed disabled:border-emerald-700/40 disabled:bg-emerald-900/25 disabled:text-emerald-400/50 disabled:shadow-none"
              onClick={() => doIncPoison(-1)}
              disabled={poison <= 0}
            >
              -1
            </button>
          </div>
        </div>
      </div>
      {lifeRows.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {lifeRows.map((row, idx) => {
            const opponentKey = row.key;
            const commanderValue = opponentKey ? commanderDamage[opponentKey] ?? 0 : 0;
            return (
              <div key={row.key ?? `${row.label}-${idx}`} className="flex items-center gap-3 text-xs text-zinc-300">
                {renderMiniD20(
                  row.value,
                  typeof row.themeIdx === "number" ? row.themeIdx : idx,
                  row.themeHex,
                  row.themeImage,
                )}
                <span className="truncate text-zinc-200">{row.label}</span>
                {opponentKey && (
                  <div
                    className="flex cursor-ns-resize select-none items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-200 hover:border-amber-400"
                    title="Scroll to adjust commander damage"
                    style={{ overscrollBehavior: "contain" }}
                    onWheelCapture={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (typeof e.nativeEvent.preventDefault === "function") {
                        e.nativeEvent.preventDefault();
                      }
                      if (typeof e.nativeEvent.stopImmediatePropagation === "function") {
                        e.nativeEvent.stopImmediatePropagation();
                      }
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
      <div className="rounded border border-zinc-800/60 bg-zinc-900/25 p-2 text-xs backdrop-blur-sm">
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
            <div className="flex flex-col gap-2 rounded border border-zinc-800/60 bg-zinc-950/40 p-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-zinc-400">Custom Hex</label>
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  placeholder="#1f2937"
                  className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none"
                />
                <input
                  type="color"
                  value={normalizedCustomHex ?? "#1f2937"}
                  onChange={(event) => {
                    setCustomHex(event.target.value);
                    setLifeThemeHex(event.target.value);
                  }}
                  title="Pick a custom color"
                  className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-zinc-800"
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
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span>Custom Image</span>
                <label className="cursor-pointer rounded border border-zinc-700 px-2 py-1 text-xs hover:border-amber-400">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setUploadError(null);
                      setUploading(true);
                      try {
                        const form = new FormData();
                        form.append("file", file);
                        const response = await fetch("/api/life-dice/upload", {
                          method: "POST",
                          body: form,
                        });
                        if (!response.ok) {
                          const payload = await response.json().catch(() => ({}));
                          throw new Error(payload?.error || "Upload failed");
                        }
                        const data = (await response.json()) as { imagePath?: string };
                        if (data?.imagePath) {
                          setPendingImage(data.imagePath);
                          setLifeThemeImage(data.imagePath);
                        }
                      } catch (error: any) {
                        console.error("life die upload failed", error);
                        setUploadError(error?.message || "Upload failed");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  {uploading ? "Uploading…" : "Upload"}
                </label>
                {pendingImage && (
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                    onClick={() => {
                      setPendingImage(null);
                      setLifeThemeImage(null);
                    }}
                  >
                    Remove Image
                  </button>
                )}
                {pendingImage && (
                  <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                    <img src={pendingImage} alt="Life die preview" className="h-10 w-10 rounded object-cover" />
                    <span className="text-zinc-500">Preview</span>
                  </div>
                )}
                {uploadError && <span className="text-xs text-rose-400">{uploadError}</span>}
              </div>
            </div>
            {pendingImage && (
              <p className="text-[10px] text-zinc-500">
                Custom images override gradients. Remove the image to revert to theme colors.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded border border-zinc-800/60 bg-zinc-900/25 p-3 text-xs backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-zinc-300">Turn Order</h4>
          <span className="text-[11px] text-zinc-400">
            Current: <span className="text-zinc-100">{turnOrder.length > 0 ? turnOrder[currentTurn % turnOrder.length] : "—"}</span>
          </span>
        </div>
        {playerSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
            {playerSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded border border-zinc-700 px-2 py-0.5 hover:border-amber-400 hover:text-amber-200"
                onClick={() => setOrderDraft((prev) => {
                  const items = new Set(
                    prev
                      .split(/\r?\n|,/)
                      .map((entry) => entry.trim())
                      .filter((entry) => entry.length > 0),
                  );
                  items.add(name);
                  return Array.from(items).join("\n");
                })}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={orderDraft}
          onChange={(event) => setOrderDraft(event.target.value)}
          onFocus={() => {
            turnOrderEditingRef.current = true;
          }}
          onBlur={() => {
            turnOrderEditingRef.current = false;
            setOrderDraft((prev) => prev);
          }}
          rows={Math.min(6, Math.max(3, turnOrder.length || playerSuggestions.length || 3))}
          placeholder={"Enter one player per line"}
          className="mt-3 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={handleSetTurnOrder} className="rounded-md border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">Set Order</button>
          <button onClick={passTurn} className="rounded-md border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">Pass Turn</button>
          <button onClick={handleApplySuggestions} className="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800">Use Detected</button>
        </div>
      </div>
      <div className="mt-3 rounded border border-zinc-800/60 bg-zinc-900/25 p-2 text-xs backdrop-blur-sm">
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
