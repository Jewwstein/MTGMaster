import { create } from "zustand";
import { getSocket } from "../lib/socket";
import { playSound } from "../lib/sound";

export type ZoneId =
  | "library"
  | "hand"
  | "battlefield"
  | "lands"
  | "graveyard"
  | "exile"
  | "command";

export type CardItem = {
  id: string;
  name: string;
  tapped?: boolean;
  token?: boolean;
  image?: string | null;
  x?: number;
  y?: number;
  counters?: number;
  customText?: string | null;
  cloneOf?: string | null;
  labels?: string[]; // e.g., ["hexproof","haste"]
};

export type LogEntry = {
  id: string;
  message: string;
  timestamp: number;
};

export interface RemoteSeatState {
  id: string;
  name: string;
  seatIndex: number;
  playerKey?: string | null;
  socketId?: string | null;
  zones: {
    battlefield: CardItem[];
    lands: CardItem[];
    command: CardItem[];
  };
  graveyard: CardItem[];
  exile: CardItem[];
  hand: CardItem[];
  commanderTaxCount?: number | null;
  life?: number | null;
  poison?: number | null;
  lifeThemeIndex?: number;
  lifeThemeHex?: string | null;
  lifeThemeImage?: string | null;
  playmatKey?: string | null;
  turnOrder?: string[];
  currentTurn?: number | null;
  updatedAt: number;
};

export type RemoteSeatPayload = {
  name?: string;
  seatIndex?: number;
  playerKey?: string | null;
  socketId?: string | null;
  zones?: {
    battlefield?: CardItem[];
    lands?: CardItem[];
    command?: CardItem[];
  };
  graveyard?: CardItem[];
  exile?: CardItem[];
  hand?: CardItem[];
  commanderTaxCount?: number | null;
  life?: number | null;
  poison?: number | null;
  lifeThemeIndex?: number;
  lifeThemeHex?: string | null;
  lifeThemeImage?: string | null;
  playmatKey?: string | null;
  turnOrder?: string[];
  currentTurn?: number | null;
};

export type GameState = {
  zones: Record<ZoneId, CardItem[]>;
  life: number;
  poison: number;
  commanderTaxCount: number;
  commanderDamage: Record<string, number>; // keyed by opponent id/name
  // multi-seat (scaffold, backward compatible)
  players: Array<{
    id: string;
    name: string;
    zones: {
      battlefield: CardItem[];
      lands: CardItem[];
      command: CardItem[];
      graveyard: CardItem[];
      exile: CardItem[];
    };
    hand: CardItem[]; // private; not synced in realtime
    playmatKey?: string | null;
    lifeThemeImage?: string | null;
  }>;
  // seats / order (used for seat names/ordering)
  turnOrder: string[];
  currentTurn: number; // index into turnOrder (optional usage)
  setTurnOrder: (order: string[]) => void;
  setCurrentTurn: (turn: number) => void;
  passTurn: () => void;
  // local client seat index (matched by name)
  mySeat: number;
  lifeThemeIndex: number;
  lifeThemeHex: string | null;
  lifeThemeImage: string | null;
  playmatKey: string | null;
  remoteSeats: Record<string, RemoteSeatState>;
  log: LogEntry[];
  draw: (n?: number) => void;
  moveCard: (cardId: string, to: ZoneId, index?: number) => void;
  setBattlefieldPos: (cardId: string, x: number, y: number) => void;
  toggleTap: (cardId: string) => void;
  incCounter: (cardId: string, delta: number) => void;
  toggleLabel: (cardId: string, label: string) => void;
  moveAnyToLibraryTop: (cardId: string) => void;
  moveAnyToLibraryBottom: (cardId: string) => void;
  moveTopLibraryToBottom: () => void;
  addToken: (name?: string, to?: ZoneId, image?: string | null) => void;
  moveToZone: (cardId: string, to: ZoneId) => void;
  putOnTopLibrary: (cardId: string) => void;
  putOnBottomLibrary: (cardId: string) => void;
  drawSeven: () => void;
  shuffleLibrary: () => void;
  mulliganLondon: (bottomCount: number) => void;
  mulliganSevenForSeven: () => void;
  untapAll: () => void;
  incLife: (n: number) => void;
  incPoison: (n: number) => void;
  incCommanderTax: (n: number) => void;
  incCommanderDamage: (opponent: string, n: number) => void;
  appendLog: (message: string) => void;
  clearLog: () => void;
  setCardCustomText: (cardId: string, text: string | null) => void;
  loadDeckFromNames: (cards: { name: string; count: number; image?: string | null; commander?: boolean }[], commanders: string[]) => void;
  // turn/stack controls removed
  // persistence
  snapshot: () => any;
  hydrate: (snap: any) => void;
  // seats / names
  setSeatName: (index: number, name: string) => void;
  setSeats: (names: string[]) => void;
  setMySeat: (index: number) => void;
  setRemoteSeat: (id: string, seat: RemoteSeatPayload) => void;
  clearRemoteSeat: (id: string) => void;
  clearAllRemoteSeats: () => void;
  setLifeThemeIndex: (idx: number) => void;
  setLifeThemeHex: (hex: string | null) => void;
  setLifeThemeImage: (image: string | null) => void;
  setPlaymatKey: (key: string | null) => void;
};

const ZONE_LABELS: Record<ZoneId, string> = {
  library: "the library",
  hand: "hand",
  battlefield: "the battlefield",
  lands: "the lands",
  graveyard: "the graveyard",
  exile: "exile",
  command: "the command zone",
};

const LOG_LIMIT = 150;

function resolveActor(state: GameState): string {
  const seatIndex = typeof state.mySeat === "number" ? state.mySeat : -1;
  if (seatIndex >= 0) {
    const seatName = state.players?.[seatIndex]?.name;
    if (typeof seatName === "string" && seatName.trim().length > 0) return seatName.trim();
  }
  return "You";
}

function cardLabel(card?: CardItem | null): string {
  const name = card?.name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return "a card";
}

function summarizeCards(cards: CardItem[]): string {
  if (!Array.isArray(cards) || cards.length === 0) return "a card";
  const labels = cards.map((card) => cardLabel(card));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
  return `${labels.length} cards`;
}

function formatZone(zone: ZoneId | null | undefined): string {
  if (!zone) return "a zone";
  return ZONE_LABELS[zone] ?? zone;
}

function addLogEntry(log: LogEntry[] | undefined, message: string): LogEntry[] {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) return Array.isArray(log) ? [...log] : [];
  const base = Array.isArray(log) ? [...log] : [];
  const entry: LogEntry = { id: uid(), message: trimmed, timestamp: Date.now() };
  const next = [...base, entry];
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function applyZonesWithSync(state: GameState, zones: Record<ZoneId, CardItem[]>) {
  const normalized = normalizeZones(zones);
  const players = syncPlayersFromZones(state.players, normalized, state.mySeat);
  return { zones: normalized, players } as Partial<GameState>;
}

const sampleNames = [
  "Sol Ring",
  "Island",
  "Mountain",
  "Forest",
  "Swamp",
  "Plains",
  "Command Tower",
  "Arcane Signet",
  "Swords to Plowshares",
  "Counterspell",
];
const initialDeck: CardItem[] = sampleNames.map((name) => ({ id: uid(), name }));

function normalizeZones(zonesIn: Record<ZoneId, CardItem[]>): Record<ZoneId, CardItem[]> {
  const order: ZoneId[] = ["library", "hand", "battlefield", "lands", "graveyard", "exile", "command"];
  const seen = new Set<string>();
  const out: Record<ZoneId, CardItem[]> = {
    library: [],
    hand: [],
    battlefield: [],
    lands: [],
    graveyard: [],
    exile: [],
    command: [],
  };
  for (const z of order) {
    for (const c of (zonesIn[z] ?? [])) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out[z].push(c);
      }
    }
  }
  if (out.graveyard.length > 0) {
    out.graveyard = out.graveyard.filter((card) => !card.cloneOf);
  }
  return out;
}

function syncPlayersFromZones(
  playersIn: GameState["players"],
  zones: Record<ZoneId, CardItem[]>,
  seatIndex: number,
): GameState["players"] {
  const out = Array.isArray(playersIn)
    ? playersIn.map((player, idx) => ({
        ...player,
        zones: {
          battlefield: Array.isArray(player?.zones?.battlefield) ? player.zones.battlefield.map((card) => ({ ...card })) : [],
          lands: Array.isArray(player?.zones?.lands) ? player.zones.lands.map((card) => ({ ...card })) : [],
          command: Array.isArray(player?.zones?.command) ? player.zones.command.map((card) => ({ ...card })) : [],
          graveyard: Array.isArray(player?.zones?.graveyard) ? player.zones.graveyard.map((card) => ({ ...card })) : [],
          exile: Array.isArray(player?.zones?.exile) ? player.zones.exile.map((card) => ({ ...card })) : [],
        },
        hand: Array.isArray(player?.hand) ? player.hand.map((card) => ({ ...card })) : [],
        playmatKey: player?.playmatKey ?? null,
      }))
    : [];

  const ensureSeat = (idx: number) => {
    while (out.length <= idx) {
      out.push({
        id: `p${out.length + 1}`,
        name: `Player ${out.length + 1}`,
        zones: { battlefield: [], lands: [], command: [], graveyard: [], exile: [] },
        hand: [],
        playmatKey: null,
      });
    }
  };

  const assignSeat = (idx: number) => {
    ensureSeat(idx);
    const prev = out[idx];
    out[idx] = {
      ...prev,
      zones: {
        battlefield: zones.battlefield.map((card) => ({ ...card })),
        lands: zones.lands.map((card) => ({ ...card })),
        command: zones.command.map((card) => ({ ...card })),
        graveyard: zones.graveyard.map((card) => ({ ...card })),
        exile: zones.exile.map((card) => ({ ...card })),
      },
      hand: zones.hand.map((card) => ({ ...card })),
      playmatKey: prev?.playmatKey ?? null,
    };
  };

  assignSeat(0);
  if (seatIndex != null && seatIndex >= 0 && seatIndex !== 0) assignSeat(seatIndex);

  return out;
}

function cloneZones(zonesIn: Record<ZoneId, CardItem[]>): Record<ZoneId, CardItem[]> {
  const out = {} as Record<ZoneId, CardItem[]>;
  for (const zone of Object.keys(zonesIn) as ZoneId[]) {
    out[zone] = zonesIn[zone].map((card) => ({ ...card }));
  }
  return out;
}

function shuffleCards(cards: CardItem[]): CardItem[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const PHASES = [
  "Untap",
  "Upkeep",
  "Draw",
  "Main 1",
  "Combat",
  "Main 2",
  "End",
] as const;

function createInitialState(): any {
  const deck = sampleNames.map((name) => ({ id: uid(), name }));
  return {
    zones: {
      library: [...deck],
      hand: [],
      battlefield: [],
      lands: [],
      graveyard: [],
      exile: [],
      command: [],
    },
    life: 40,
    poison: 0,
    commanderTaxCount: 0,
    commanderDamage: {},
    players: [
      {
        id: "p1",
        name: "Player 1",
        zones: { battlefield: [], lands: [], command: [], graveyard: [], exile: [] },
        hand: [],
        playmatKey: null,
        lifeThemeImage: null,
      },
    ],
    turnOrder: ["Player 1", "Player 2", "Player 3", "Player 4"],
    currentTurn: 0,
    mySeat: -1,
    lifeThemeIndex: 0,
    lifeThemeHex: null,
    lifeThemeImage: null,
    playmatKey: null,
    remoteSeats: {},
    log: [],
  };
}

export const useGame = create<GameState>((set, get) => ({
  ...createInitialState(),
  setTurnOrder: (order) =>
    set((state) => {
      const cleaned = Array.isArray(order)
        ? order
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
        : [];
      if (cleaned.length === 0) return {} as any;
      const nextTurn = Math.min(state.currentTurn ?? 0, cleaned.length - 1);
      return { turnOrder: cleaned, currentTurn: nextTurn < 0 ? 0 : nextTurn } as any;
    }),
  setCurrentTurn: (turn) =>
    set((state) => {
      const total = state.turnOrder.length;
      if (total === 0) return {} as any;
      const normalized = ((typeof turn === "number" ? turn : 0) % total + total) % total;
      return { currentTurn: normalized } as any;
    }),
  passTurn: () =>
    set((state) => {
      const total = state.turnOrder.length;
      if (total === 0) return {} as any;
      const next = (state.currentTurn + 1) % total;
      if (typeof window !== "undefined") {
        void playSound("pass").catch((error) => {
          console.warn("playSound failed", error);
        });
      }
      return { currentTurn: next } as any;
    }),
  mySeat: -1,
  lifeThemeIndex: 0,
  lifeThemeHex: null,
  lifeThemeImage: null,
  playmatKey: null,
  remoteSeats: {},
  draw: (n = 1) =>
    set((state) => {
      const lib = [...state.zones.library];
      const hand = [...state.zones.hand];
      const drawn: CardItem[] = [];
      for (let i = 0; i < n && lib.length > 0; i++) {
        const top = lib.shift()!;
        drawn.push(top);
        hand.push(top);
      }
      const zones = { ...state.zones, library: lib, hand } as Record<ZoneId, CardItem[]>;
      const partial = applyZonesWithSync(state as GameState, zones);
      if (drawn.length === 0) return partial;
      const actor = resolveActor(state as GameState);
      const message = `${actor} drew ${summarizeCards(drawn)} from the library.`;
      const log = addLogEntry(state.log, message);
      return { ...partial, log } as Partial<GameState>;
    }),
  cloneCard: (cardId: string) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      for (const zone of Object.keys(zones) as ZoneId[]) {
        const idx = zones[zone].findIndex((card) => card.id === cardId);
        if (idx !== -1) {
          const source = zones[zone][idx];
          const clone: CardItem = {
            ...source,
            id: uid(),
            cloneOf: source.cloneOf ?? source.id,
          };
          if (zone === "battlefield") {
            clone.x = (clone.x ?? 0) + 24;
            clone.y = (clone.y ?? 0) + 24;
          }
          zones[zone] = [...zones[zone].slice(0, idx + 1), clone, ...zones[zone].slice(idx + 1)];
          return applyZonesWithSync(state as GameState, zones);
        }
      }
      return {} as any;
    }),
  loadDeckFromNames: (cards, commanders) =>
    set((state) => {
      try {
        const normalizedCards = Array.isArray(cards)
          ? cards
              .filter((entry) => entry && typeof entry.name === "string")
              .map((entry) => ({
                name: entry.name.trim(),
                count: Number.isFinite(entry.count) ? Math.max(0, Number(entry.count)) : 1,
                image:
                  typeof entry.image === "string" && entry.image.trim().length > 0
                    ? entry.image.trim()
                    : null,
                commander: !!entry.commander,
              }))
              .filter((entry) => entry.name.length > 0)
          : [];

        const normalizedCommanders = Array.isArray(commanders)
          ? commanders
              .filter((name) => typeof name === "string")
              .map((name) => name.trim())
              .filter((name) => name.length > 0)
          : [];

        const newLibrary: CardItem[] = [];
        normalizedCards.forEach((card) => {
          if (card.commander) return;
          const copies = Math.max(1, Math.floor(card.count));
          for (let i = 0; i < copies; i++) {
            const image = card.image ?? null;
            const next: CardItem = { id: uid(), name: card.name };
            if (image) next.image = image;
            newLibrary.push(next);
          }
        });

        const commandersZone: CardItem[] = normalizedCommanders.map((name) => {
          const matching = normalizedCards.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
          const commander: CardItem = { id: uid(), name };
          if (matching?.image) commander.image = matching.image;
          return commander;
        });

        const zones = {
          ...state.zones,
          library: newLibrary,
          graveyard: [],
          exile: [],
        } as Record<ZoneId, CardItem[]>;

        zones.command = commandersZone;
        zones.hand = [];
        zones.battlefield = [];
        zones.lands = [];

        const nextState = applyZonesWithSync(state as GameState, zones);
        return nextState;
      } catch (error) {
        console.error("loadDeckFromNames failed", error);
        return {} as any;
      }
    }),
  shuffleLibrary: () =>
    set((state) => {
      const lib = [...state.zones.library];
      for (let i = lib.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lib[i], lib[j]] = [lib[j], lib[i]];
      }
      const zones = { ...state.zones, library: lib } as Record<ZoneId, CardItem[]>;
      return applyZonesWithSync(state as GameState, zones);
    }),
  moveCard: (cardId, to, index) =>
    set((state) => {
      const zones = state.zones as Record<ZoneId, CardItem[]>;
      let fromZone: ZoneId | null = null;
      let fromIndex = -1;
      for (const z of Object.keys(zones) as ZoneId[]) {
        const i = zones[z].findIndex((c) => c.id === cardId);
        if (i !== -1) {
          fromZone = z;
          fromIndex = i;
          break;
        }
      }
      if (fromZone == null) return { zones: state.zones } as any;
      const fromArr = [...zones[fromZone]];
      const [card] = fromArr.splice(fromIndex, 1);
      const originalCard = card;
      // leaving battlefield: drop coords but preserve other metadata (e.g., tokens)
      const leavingBattlefield = fromZone === "battlefield";
      const cleaned: CardItem = leavingBattlefield ? { ...card, x: undefined, y: undefined } : { ...card };
      cleaned.tapped = false;
      const toArr = [...zones[to]];
      const shouldDeleteToken = leavingBattlefield && cleaned.token && to !== "battlefield";
      if (!shouldDeleteToken) {
        const targetCard = to === "battlefield" ? { ...cleaned, tapped: false } : { ...cleaned, tapped: false, x: undefined, y: undefined };
        if (index == null || index < 0 || index > toArr.length) toArr.push(targetCard);
        else toArr.splice(index, 0, targetCard);
      }
      const nextZones = { ...zones, [fromZone]: fromArr, [to]: toArr } as Record<ZoneId, CardItem[]>;
      const partial = applyZonesWithSync(state as GameState, nextZones);
      const movingBetweenZones = shouldDeleteToken || fromZone !== to;
      if (!movingBetweenZones) return partial;
      const actor = resolveActor(state as GameState);
      let message: string;
      if (shouldDeleteToken) {
        message = `${actor} removed ${cardLabel(originalCard)} from ${formatZone(fromZone)}.`;
      } else {
        message = `${actor} moved ${cardLabel(originalCard)} from ${formatZone(fromZone)} to ${formatZone(to)}.`;
      }
      const log = addLogEntry(state.log, message);
      return { ...partial, log } as Partial<GameState>;
    }),
  setBattlefieldPos: (cardId, x, y) =>
    set((state) => {
      const seat = state.mySeat;
      if (seat >= 0 && state.players[seat]) {
        const players = [...state.players];
        const p = { ...players[seat] } as any;
        const arr = (p.zones?.battlefield ?? []).map((c: CardItem) => (c.id === cardId ? { ...c, x, y } : c));
        p.zones = { ...p.zones, battlefield: arr };
        p.playmatKey = state.playmatKey;
        players[seat] = p;
        const legacy = seat === 0 ? normalizeZones({ ...state.zones, battlefield: arr }) : state.zones;
        return { players, zones: legacy } as any;
      }
      const zones = state.zones as Record<ZoneId, CardItem[]>;
      const arr = zones.battlefield.map((c) => (c.id === cardId ? { ...c, x, y } : c));
      const zonesOut = normalizeZones({ ...zones, battlefield: arr });
      const players = syncPlayersFromZones(state.players, zonesOut, state.mySeat);
      return { zones: zonesOut, players } as any;
    }),
  toggleTap: (cardId) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let changed = false;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        zones[zone] = zones[zone].map((card) => {
          if (card.id !== cardId) return card;
          changed = true;
          return { ...card, tapped: !card.tapped };
        });
        if (changed) break;
      }
      if (!changed) return {} as any;
      return applyZonesWithSync(state as GameState, zones);
    }),
  incCounter: (cardId, delta) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let changed = false;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        zones[zone] = zones[zone].map((card) => {
          if (card.id !== cardId) return card;
          changed = true;
          const next = Math.max(0, (card.counters ?? 0) + delta);
          if (next === 0) {
            const { counters, ...rest } = card;
            return rest;
          }
          return { ...card, counters: next };
        });
        if (changed) break;
      }
      if (!changed) return {} as any;
      return applyZonesWithSync(state as GameState, zones);
    }),
  toggleLabel: (cardId, label) =>
    set((state) => {
      const cleanLabel = typeof label === "string" ? label.trim() : "";
      if (!cleanLabel) return {} as any;
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let changed = false;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        zones[zone] = zones[zone].map((card) => {
          if (card.id !== cardId) return card;
          changed = true;
          const current = Array.isArray(card.labels) ? [...card.labels] : [];
          const idx = current.findIndex((entry) => entry === cleanLabel);
          if (idx === -1) current.push(cleanLabel);
          else current.splice(idx, 1);
          return current.length > 0 ? { ...card, labels: current } : (() => {
            const { labels, ...rest } = card;
            return rest;
          })();
        });
        if (changed) break;
      }
      if (!changed) return {} as any;
      return applyZonesWithSync(state as GameState, zones);
    }),
  moveAnyToLibraryTop: (cardId) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let moved: CardItem | null = null;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        const idx = zones[zone].findIndex((card) => card.id === cardId);
        if (idx !== -1) {
          const [card] = zones[zone].splice(idx, 1);
          moved = zone === "battlefield" ? { ...card, x: undefined, y: undefined } : { ...card };
          moved.tapped = false;
          break;
        }
      }
      if (!moved) return {} as any;
      zones.library = [{ ...moved, tapped: false, x: undefined, y: undefined }, ...zones.library.filter((card) => card.id !== cardId)];
      return applyZonesWithSync(state as GameState, zones);
    }),
  moveAnyToLibraryBottom: (cardId) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let moved: CardItem | null = null;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        const idx = zones[zone].findIndex((card) => card.id === cardId);
        if (idx !== -1) {
          const [card] = zones[zone].splice(idx, 1);
          moved = zone === "battlefield" ? { ...card, x: undefined, y: undefined } : { ...card };
          moved.tapped = false;
          break;
        }
      }
      if (!moved) return {} as any;
      zones.library = [...zones.library.filter((card) => card.id !== cardId), { ...moved, tapped: false, x: undefined, y: undefined }];
      return applyZonesWithSync(state as GameState, zones);
    }),
  moveTopLibraryToBottom: () =>
    set((state) => {
      if (state.zones.library.length === 0) return {} as any;
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      const top = zones.library.shift();
      if (!top) return {} as any;
      zones.library.push(top);
      return applyZonesWithSync(state as GameState, zones);
    }),
  addToken: (name = "Token", to: ZoneId = "battlefield", image: string | null = null) =>
    set((state) => {
      const seat = state.mySeat;
      if (seat >= 0 && state.players[seat]) {
        const players = [...state.players];
        const p = { ...players[seat] } as any;
        const z = { ...p.zones } as any;
        z[to] = [...(z[to] ?? []), { id: uid(), name, token: true, image }];
        p.zones = z;
        p.playmatKey = state.playmatKey;
        players[seat] = p;
        const zonesPayload = { ...state.zones, [to]: z[to] } as Record<ZoneId, CardItem[]>;
        const synced = applyZonesWithSync({ ...(state as GameState), players } as GameState, zonesPayload);
        return { players, zones: synced.zones } as any;
      }
      const zones = state.zones as Record<ZoneId, CardItem[]>;
      const zonesPayload = { ...zones, [to]: [...zones[to], { id: uid(), name, token: true, image }] };
      const synced = applyZonesWithSync(state as GameState, zonesPayload);
      return synced as any;
    }),
  moveToZone: (cardId, to) =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let moved: CardItem | null = null;
      let fromZone: ZoneId | null = null;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        const idx = zones[zone].findIndex((card) => card.id === cardId);
        if (idx !== -1) {
          const [card] = zones[zone].splice(idx, 1);
          moved = zone === "battlefield" ? { ...card, x: undefined, y: undefined } : { ...card };
          moved.tapped = false;
          fromZone = zone;
          break;
        }
      }
      if (!moved) return {} as any;
      const originalCard = moved;
      if (to === "battlefield") {
        moved = { ...moved, x: moved.x, y: moved.y };
      }
      zones[to] = [...zones[to].filter((card) => card.id !== cardId), { ...moved, tapped: false }];
      const partial = applyZonesWithSync(state as GameState, zones);
      if (!fromZone || fromZone === to) return partial;
      const actor = resolveActor(state as GameState);
      const message = `${actor} moved ${cardLabel(originalCard)} from ${formatZone(fromZone)} to ${formatZone(to)}.`;
      const log = addLogEntry(state.log, message);
      return { ...partial, log } as Partial<GameState>;
    }),
  putOnTopLibrary: (cardId) => (get().moveAnyToLibraryTop(cardId)),
  putOnBottomLibrary: (cardId) => (get().moveAnyToLibraryBottom(cardId)),
  drawSeven: () =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      const hand: CardItem[] = [];
      const library = [...zones.library];
      for (let i = 0; i < 7 && library.length > 0; i++) {
        hand.push(library.shift()!);
      }
      zones.library = library;
      zones.hand = hand;
      return applyZonesWithSync(state as GameState, zones);
    }),
  mulliganLondon: (bottomCount) =>
    set((state) => {
      const library = [...state.zones.library, ...state.zones.hand.map((card) => ({ ...card, x: undefined, y: undefined }))];
      const shuffled = shuffleCards(library);
      const hand = shuffled.splice(0, 7);
      const bottom = Math.max(0, Math.min(bottomCount ?? 0, hand.length));
      const keptHand = hand.slice(0, hand.length - bottom);
      const toBottom = hand.slice(hand.length - bottom);
      const zones: Record<ZoneId, CardItem[]> = {
        ...state.zones,
        library: [...shuffled, ...toBottom],
        hand: keptHand,
        battlefield: state.zones.battlefield.map((card) => ({ ...card })),
        lands: state.zones.lands.map((card) => ({ ...card })),
        graveyard: state.zones.graveyard.map((card) => ({ ...card })),
        exile: state.zones.exile.map((card) => ({ ...card })),
        command: state.zones.command.map((card) => ({ ...card })),
      } as Record<ZoneId, CardItem[]>;
      return applyZonesWithSync(state as GameState, zones);
    }),
  mulliganSevenForSeven: () =>
    set((state) => {
      const library = [...state.zones.library, ...state.zones.hand.map((card) => ({ ...card, x: undefined, y: undefined }))];
      const shuffled = shuffleCards(library);
      const hand = shuffled.splice(0, 7);
      const zones: Record<ZoneId, CardItem[]> = {
        ...state.zones,
        library: shuffled,
        hand,
        battlefield: state.zones.battlefield.map((card) => ({ ...card })),
        lands: state.zones.lands.map((card) => ({ ...card })),
        graveyard: state.zones.graveyard.map((card) => ({ ...card })),
        exile: state.zones.exile.map((card) => ({ ...card })),
        command: state.zones.command.map((card) => ({ ...card })),
      } as Record<ZoneId, CardItem[]>;
      return applyZonesWithSync(state as GameState, zones);
    }),
  untapAll: () =>
    set((state) => {
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      for (const zone of Object.keys(zones) as ZoneId[]) {
        zones[zone] = zones[zone].map((card) => (card.tapped ? { ...card, tapped: false } : card));
      }
      return applyZonesWithSync(state as GameState, zones);
    }),
  setCardCustomText: (cardId, text) =>
    set((state) => {
      const normalized = typeof text === "string" ? text.trim() : "";
      const nextText = normalized.length > 0 ? normalized : null;
      const zones = cloneZones(state.zones as Record<ZoneId, CardItem[]>);
      let changed = false;
      for (const zone of Object.keys(zones) as ZoneId[]) {
        zones[zone] = zones[zone].map((card) => {
          if (card.id !== cardId) return card;
          if ((card.customText ?? null) === nextText) return card;
          changed = true;
          return { ...card, customText: nextText };
        });
      }
      return changed ? applyZonesWithSync(state as GameState, zones) : ({} as any);
    }),
  appendLog: (message) =>
    set((state) => ({ log: addLogEntry(state.log, message) } as Partial<GameState>)),
  clearLog: () =>
    set(() => ({ log: [] } as Partial<GameState>)),
  incLife: (n) =>
    set((state) => ({ life: state.life + n } as any)),
  incPoison: (n) =>
    set((state) => ({ poison: Math.max(0, state.poison + n) } as any)),
  incCommanderTax: (n) =>
    set((state) => ({ commanderTaxCount: Math.max(0, state.commanderTaxCount + n) } as any)),
  incCommanderDamage: (opponent, n) =>
    set((state) => {
      if (typeof opponent !== "string" || !opponent.trim() || typeof n !== "number") {
        return {} as any;
      }
      const key = opponent.trim();
      const current = state.commanderDamage[key] ?? 0;
      const next = Math.max(0, current + n);
      return { commanderDamage: { ...state.commanderDamage, [key]: next } } as any;
    }),
  snapshot: () => {
    const s = get();
    const playersIn = Array.isArray(s.players)
      ? s.players.map((player, idx) => ({
          id: player?.id ?? `p${idx + 1}`,
          name: player?.name ?? `Player ${idx + 1}`,
          zones: {
            battlefield: Array.isArray(player?.zones?.battlefield)
              ? player.zones.battlefield.map((card) => ({ ...card }))
              : [],
            lands: Array.isArray(player?.zones?.lands) ? player.zones.lands.map((card) => ({ ...card })) : [],
            command: Array.isArray(player?.zones?.command) ? player.zones.command.map((card) => ({ ...card })) : [],
            graveyard: Array.isArray(player?.zones?.graveyard) ? player.zones.graveyard.map((card) => ({ ...card })) : [],
            exile: Array.isArray(player?.zones?.exile) ? player.zones.exile.map((card) => ({ ...card })) : [],
          },
          hand: Array.isArray(player?.hand) ? player.hand.map((card) => ({ ...card })) : [],
          playmatKey: player?.playmatKey ?? null,
          lifeThemeImage: player?.lifeThemeImage ?? null,
        }))
      : [];
    const remoteSeats = Object.fromEntries(
      Object.entries(s.remoteSeats ?? {}).map(([id, seat]) => [
        id,
        {
          ...seat,
          socketId: typeof seat?.socketId === "string" ? seat.socketId : seat?.socketId === null ? null : seat.socketId,
          zones: {
            battlefield: Array.isArray(seat?.zones?.battlefield) ? seat.zones.battlefield.map((card) => ({ ...card })) : [],
            lands: Array.isArray(seat?.zones?.lands) ? seat.zones.lands.map((card) => ({ ...card })) : [],
            command: Array.isArray(seat?.zones?.command) ? seat.zones.command.map((card) => ({ ...card })) : [],
          },
          graveyard: Array.isArray(seat?.graveyard) ? seat.graveyard.map((card) => ({ ...card })) : [],
          exile: Array.isArray(seat?.exile) ? seat.exile.map((card) => ({ ...card })) : [],
          hand: Array.isArray(seat?.hand) ? seat.hand.map((card) => ({ ...card })) : [],
          commanderTaxCount: typeof seat?.commanderTaxCount === "number" ? seat.commanderTaxCount : null,
          life: typeof seat?.life === "number" ? seat.life : null,
          poison: typeof seat?.poison === "number" ? seat.poison : null,
          lifeThemeIndex: typeof seat?.lifeThemeIndex === "number" ? seat.lifeThemeIndex : undefined,
          lifeThemeHex: typeof seat?.lifeThemeHex === "string" ? seat.lifeThemeHex : null,
          lifeThemeImage: typeof seat?.lifeThemeImage === "string" ? seat.lifeThemeImage : null,
          updatedAt: typeof seat.updatedAt === "number" ? seat.updatedAt : Date.now(),
        },
      ]),
    );
    return {
      zones: s.zones,
      life: s.life,
      poison: s.poison,
      commanderTaxCount: s.commanderTaxCount,
      commanderDamage: s.commanderDamage,
      players: playersIn,
      turnOrder: s.turnOrder,
      currentTurn: s.currentTurn,
      mySeat: s.mySeat,
      lifeThemeIndex: s.lifeThemeIndex,
      lifeThemeHex: s.lifeThemeHex,
      lifeThemeImage: s.lifeThemeImage,
      remoteSeats,
      playmatKey: s.playmatKey,
    };
  },
  hydrate: (snap: any) =>
    set((state) => {
      try {
        const zonesIn = snap?.zones && typeof snap.zones === "object" ? (snap.zones as Record<ZoneId, CardItem[]>) : state.zones;
        const zones = normalizeZones(zonesIn);
        // if multi-seat present, mirror first player zones into legacy zones for compatibility
        let players = Array.isArray(snap?.players) ? (snap.players as GameState["players"]) : state.players;
        if (Array.isArray(players) && players.length > 0) {
          const p0 = players[0];
          if (p0?.zones) {
            (zones as any).battlefield = normalizeZones({ battlefield: p0.zones.battlefield } as any).battlefield;
            (zones as any).lands = normalizeZones({ lands: p0.zones.lands } as any).lands;
            (zones as any).command = normalizeZones({ command: p0.zones.command } as any).command;
            (zones as any).hand = p0.hand ?? zones.hand;
          }
        } else {
          // if no players in snap, keep existing state players but keep them in sync with legacy zones
          players = [
            {
              id: "p1",
              name: "Player 1",
              zones: { battlefield: zones.battlefield, lands: zones.lands, command: zones.command, graveyard: zones.graveyard, exile: zones.exile },
              hand: zones.hand,
              playmatKey: state.playmatKey,
              lifeThemeImage: state.lifeThemeImage,
            },
          ];
        }
        const remoteSeatsIn = snap?.remoteSeats && typeof snap.remoteSeats === "object" ? (snap.remoteSeats as Record<string, RemoteSeatState>) : state.remoteSeats;
        const remoteSeats: Record<string, RemoteSeatState> = {};
        if (remoteSeatsIn) {
          for (const [id, seat] of Object.entries(remoteSeatsIn)) {
            if (!seat) continue;
            remoteSeats[id] = {
              id: seat.id ?? id,
              name: seat.name ?? "Opponent",
              seatIndex: typeof seat.seatIndex === "number" ? seat.seatIndex : -1,
              playerKey: typeof seat.playerKey === "string" ? seat.playerKey : null,
              socketId: typeof seat.socketId === "string" ? seat.socketId : null,
              zones: {
                battlefield: Array.isArray(seat?.zones?.battlefield) ? seat.zones.battlefield.map((card) => ({ ...card })) : [],
                lands: Array.isArray(seat?.zones?.lands) ? seat.zones.lands.map((card) => ({ ...card })) : [],
                command: Array.isArray(seat?.zones?.command) ? seat.zones.command.map((card) => ({ ...card })) : [],
              },
              graveyard: Array.isArray(seat?.graveyard) ? seat.graveyard.map((card) => ({ ...card })) : [],
              exile: Array.isArray(seat?.exile) ? seat.exile.map((card) => ({ ...card })) : [],
              hand: Array.isArray(seat?.hand) ? seat.hand.map((card) => ({ ...card })) : [],
              commanderTaxCount: typeof seat?.commanderTaxCount === "number" ? seat.commanderTaxCount : undefined,
              life: typeof seat?.life === "number" ? seat.life : null,
              poison: typeof seat?.poison === "number" ? seat.poison : null,
              lifeThemeIndex: typeof seat?.lifeThemeIndex === "number" ? seat.lifeThemeIndex : undefined,
              lifeThemeHex: typeof seat?.lifeThemeHex === "string" ? seat.lifeThemeHex : null,
              lifeThemeImage: typeof seat?.lifeThemeImage === "string" ? seat.lifeThemeImage : null,
              playmatKey: typeof seat?.playmatKey === "string" ? seat.playmatKey : null,
              updatedAt: typeof seat.updatedAt === "number" ? seat.updatedAt : Date.now(),
            };
          }
        }
        return {
          zones,
          players,
          life: typeof snap?.life === "number" ? snap.life : state.life,
          poison: typeof snap?.poison === "number" ? snap.poison : state.poison,
          commanderTaxCount: typeof snap?.commanderTaxCount === "number" ? snap.commanderTaxCount : state.commanderTaxCount,
          commanderDamage: typeof snap?.commanderDamage === "object" && snap?.commanderDamage ? snap.commanderDamage : state.commanderDamage,
          turnOrder: Array.isArray(snap?.turnOrder) ? snap.turnOrder : state.turnOrder,
          currentTurn: typeof snap?.currentTurn === "number" ? snap.currentTurn : state.currentTurn,
          lifeThemeIndex: typeof snap?.lifeThemeIndex === "number" ? snap.lifeThemeIndex : state.lifeThemeIndex,
          lifeThemeHex: typeof snap?.lifeThemeHex === "string" ? snap.lifeThemeHex : state.lifeThemeHex,
          lifeThemeImage: typeof snap?.lifeThemeImage === "string" ? snap.lifeThemeImage : state.lifeThemeImage,
          playmatKey: typeof snap?.playmatKey === "string" ? snap.playmatKey : state.playmatKey,
          remoteSeats,
        } as any;
      } catch {
        return {} as any;
      }
    }),
  setSeatName: (index, name) =>
    set((state) => {
      const players = [...state.players];
      while (players.length <= index) {
        players.push({
          id: `p${players.length + 1}`,
          name: `Player ${players.length + 1}` as string,
          zones: { battlefield: [], lands: [], command: [], graveyard: [], exile: [] },
          hand: [],
          playmatKey: null,
          lifeThemeImage: null,
        });
      }
      players[index] = { ...players[index], name };
      const turnOrder = [...state.turnOrder];
      while (turnOrder.length <= index) turnOrder.push(`Player ${turnOrder.length + 1}`);
      turnOrder[index] = name || `Player ${index + 1}`;
      return { players, turnOrder } as any;
    }),
  setSeats: (names) =>
    set((state) => {
      const players = names.map((n, i) => {
        const prev = state.players[i];
        const prevZones = prev?.zones;
        return ({
          id: state.players[i]?.id ?? `p${i + 1}`,
          name: n || `Player ${i + 1}`,
          zones: {
            battlefield: Array.isArray(prevZones?.battlefield) ? prevZones!.battlefield : [],
            lands: Array.isArray(prevZones?.lands) ? prevZones!.lands : [],
            command: Array.isArray(prevZones?.command) ? prevZones!.command : [],
            graveyard: Array.isArray(prevZones?.graveyard) ? prevZones!.graveyard : [],
            exile: Array.isArray(prevZones?.exile) ? prevZones!.exile : [],
          },
          hand: Array.isArray(prev?.hand) ? prev!.hand : [],
          playmatKey: prev?.playmatKey ?? null,
          lifeThemeImage: prev?.lifeThemeImage ?? null,
        });
      });
      const turnOrder = players.map((p) => p.name);
      return { players, turnOrder } as any;
    }),
  setMySeat: (index) => set(() => ({ mySeat: typeof index === "number" ? index : -1 }) as any),
  setRemoteSeat: (id, seat) =>
    set((state) => {
      const normalizedId = typeof id === "string" ? id.trim() : "";
      if (!normalizedId) return {} as any;
      const existingSeats = { ...state.remoteSeats } as Record<string, RemoteSeatState>;
      const seatIndex = typeof seat.seatIndex === "number" ? seat.seatIndex : -1;
      const incomingPlayerKey = seat.playerKey ?? normalizedId;
      const incomingSocketId = typeof seat.socketId === "string" ? seat.socketId : null;
      for (const [key, value] of Object.entries(existingSeats)) {
        if (key === normalizedId) continue;
        const sameIndex = seatIndex >= 0 && value.seatIndex === seatIndex;
        const samePlayerKey = incomingPlayerKey && value.playerKey && value.playerKey === incomingPlayerKey;
        const sameSocket = incomingSocketId && value.socketId && value.socketId === incomingSocketId;
        if (samePlayerKey || sameSocket || (sameIndex && incomingPlayerKey === value.playerKey)) delete existingSeats[key];
      }

      const prev = existingSeats[normalizedId] ?? {
        id: normalizedId,
        name: seat.name ?? `Player`,
        seatIndex: typeof seat.seatIndex === "number" ? seat.seatIndex : -1,
        playerKey: incomingPlayerKey,
        socketId: incomingSocketId,
        zones: { battlefield: [], lands: [], command: [] },
        graveyard: [],
        exile: [],
        hand: [],
        commanderTaxCount: typeof seat.commanderTaxCount === "number" ? seat.commanderTaxCount : null,
        life: typeof seat?.life === "number" ? seat.life : null,
        poison: typeof seat?.poison === "number" ? seat.poison : null,
        lifeThemeIndex: typeof seat?.lifeThemeIndex === "number" ? seat.lifeThemeIndex : null,
        lifeThemeHex: typeof seat?.lifeThemeHex === "string" ? seat.lifeThemeHex : null,
        lifeThemeImage: typeof seat?.lifeThemeImage === "string" ? seat.lifeThemeImage : null,
        playmatKey: typeof seat.playmatKey === "string" ? seat.playmatKey : null,
        currentTurn: typeof seat?.currentTurn === "number" ? seat.currentTurn : null,
        turnOrder: Array.isArray(seat?.turnOrder) ? seat.turnOrder : undefined,
        updatedAt: Date.now(),
      };
      const next: RemoteSeatState = {
        ...prev,
        name: seat.name ?? prev.name,
        seatIndex: typeof seat.seatIndex === "number" ? seat.seatIndex : prev.seatIndex,
        playerKey: incomingPlayerKey,
        socketId: incomingSocketId ?? prev.socketId ?? null,
        zones: {
          battlefield: seat.zones?.battlefield ? seat.zones.battlefield.map((c) => ({ ...c })) : prev.zones.battlefield,
          lands: seat.zones?.lands ? seat.zones.lands.map((c) => ({ ...c })) : prev.zones.lands,
          command: seat.zones?.command ? seat.zones.command.map((c) => ({ ...c })) : prev.zones.command,
        },
        graveyard: seat.graveyard ? seat.graveyard.map((c) => ({ ...c })) : prev.graveyard,
        exile: seat.exile ? seat.exile.map((c) => ({ ...c })) : prev.exile,
        hand: seat.hand ? seat.hand.map((c) => ({ ...c })) : prev.hand,
        commanderTaxCount:
          seat.commanderTaxCount !== undefined
            ? typeof seat.commanderTaxCount === "number"
              ? seat.commanderTaxCount
              : null
            : prev.commanderTaxCount ?? null,
        life: typeof seat.life === "number" ? seat.life : prev.life,
        poison: typeof seat.poison === "number" ? seat.poison : prev.poison,
        lifeThemeIndex: typeof seat.lifeThemeIndex === "number" ? seat.lifeThemeIndex : prev.lifeThemeIndex,
        lifeThemeHex: typeof seat.lifeThemeHex === "string" ? seat.lifeThemeHex : prev.lifeThemeHex,
        lifeThemeImage: typeof seat.lifeThemeImage === "string" ? seat.lifeThemeImage : seat.lifeThemeImage === null ? null : prev.lifeThemeImage,
        playmatKey: typeof seat.playmatKey === "string" ? seat.playmatKey : seat.playmatKey === null ? null : prev.playmatKey,
        currentTurn: typeof seat.currentTurn === "number" ? seat.currentTurn : seat.currentTurn === null ? null : prev.currentTurn,
        turnOrder: Array.isArray(seat.turnOrder) ? seat.turnOrder : prev.turnOrder,
        updatedAt: Date.now(),
      };
      return { remoteSeats: { ...existingSeats, [normalizedId]: next } } as any;
    }),
  clearRemoteSeat: (id) =>
    set((state) => {
      const normalizedId = typeof id === "string" ? id.trim() : "";
      if (!normalizedId || !(normalizedId in state.remoteSeats)) return {} as any;
      const next = { ...state.remoteSeats } as Record<string, RemoteSeatState>;
      delete next[normalizedId];
      return { remoteSeats: next } as any;
    }),
  clearAllRemoteSeats: () => set(() => ({ remoteSeats: {} }) as any),
  setLifeThemeIndex: (idx) =>
    set(() => ({ lifeThemeIndex: typeof idx === "number" ? Math.max(0, Math.floor(idx)) : 0 }) as any),
  setLifeThemeHex: (hex) =>
    set(() => ({ lifeThemeHex: typeof hex === "string" ? hex : null }) as any),
  setLifeThemeImage: (image) =>
    set(() => ({ lifeThemeImage: typeof image === "string" ? image : null }) as any),
  setPlaymatKey: (key) =>
    set((state) => {
      const normalized = typeof key === "string" && key.trim() ? key.trim() : null;
      const nextPlayers = [...state.players];
      if (state.mySeat >= 0 && nextPlayers[state.mySeat]) {
        nextPlayers[state.mySeat] = { ...nextPlayers[state.mySeat], playmatKey: normalized };
      } else {
        nextPlayers[0] = { ...nextPlayers[0], playmatKey: normalized };
      }
      return { playmatKey: normalized, players: nextPlayers } as any;
    }),
}));

(useGame as any).subscribe?.((() => {
  const payload = (useGame as any).getState?.().snapshot?.();
  if (!payload) return;
  try {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("game:local-change", { detail: payload });
      window.dispatchEvent(event);
    }
  } catch {}
}) as () => void);
