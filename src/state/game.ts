import { create } from "zustand";

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
  x?: number; // battlefield position
  y?: number; // battlefield position
  counters?: number; // +1/+1 counters
  labels?: string[]; // e.g., ["hexproof","haste"]
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
    };
    hand: CardItem[]; // private; not synced in realtime
  }>;
  // seats / order (used for seat names/ordering)
  turnOrder: string[];
  currentTurn: number; // index into turnOrder (optional usage)
  // local client seat index (matched by name)
  mySeat: number;
  draw: (n?: number) => void;
  moveCard: (cardId: string, to: ZoneId, index?: number) => void;
  setBattlefieldPos: (cardId: string, x: number, y: number) => void;
  toggleTap: (cardId: string) => void;
  incCounter: (cardId: string, delta: number) => void;
  toggleLabel: (cardId: string, label: string) => void;
  moveAnyToLibraryTop: (cardId: string) => void;
  moveAnyToLibraryBottom: (cardId: string) => void;
  moveTopLibraryToBottom: () => void;
  addToken: (name?: string, to?: ZoneId) => void;
  moveToZone: (cardId: string, to: ZoneId) => void;
  putOnTopLibrary: (cardId: string) => void;
  putOnBottomLibrary: (cardId: string) => void;
  drawSeven: () => void;
  mulliganLondon: (bottomCount: number) => void;
  mulliganSevenForSeven: () => void;
  untapAll: () => void;
  incLife: (n: number) => void;
  incPoison: (n: number) => void;
  incCommanderTax: (n: number) => void;
  incCommanderDamage: (opponent: string, n: number) => void;
  loadDeckFromNames: (cards: { name: string; count: number }[], commanders: string[]) => void;
  // turn/stack controls removed
  // persistence
  snapshot: () => any;
  hydrate: (snap: any) => void;
  // seats / names
  setSeatName: (index: number, name: string) => void;
  setSeats: (names: string[]) => void;
  setTurnOrder: (order: string[]) => void;
  setMySeat: (index: number) => void;
};

function uid() {
  return Math.random().toString(36).slice(2);
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

// Ensure no duplicate card ids across zones; keep last placement wins by zone order below
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
    for (const c of zonesIn[z] ?? []) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out[z].push(c);
      }
    }
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

export const useGame = create<GameState>((set, get) => ({
  zones: {
    library: initialDeck,
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
      zones: { battlefield: [], lands: [], command: [] },
      hand: [],
    },
  ],
  turnOrder: ["Player 1", "Player 2", "Player 3", "Player 4"],
  currentTurn: 0,
  mySeat: -1,
  draw: (n = 1) =>
    set((state) => {
      const lib = [...state.zones.library];
      const hand = [...state.zones.hand];
      for (let i = 0; i < n && lib.length > 0; i++) {
        const top = lib.shift()!;
        hand.push(top);
      }
      const zones = normalizeZones({ ...state.zones, library: lib, hand });
      return { zones } as any;
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
      // leaving battlefield: drop coords
      const leavingBattlefield = fromZone === "battlefield";
      const cleaned: CardItem = leavingBattlefield ? { ...card, x: undefined, y: undefined } : card;
      const toArr = [...zones[to]];
      if (index == null || index < 0 || index > toArr.length) toArr.push(cleaned);
      else toArr.splice(index, 0, cleaned);
    }),
  setBattlefieldPos: (cardId, x, y) =>
    set((state) => {
      const seat = state.mySeat;
      if (seat >= 0 && state.players[seat]) {
        const players = [...state.players];
        const p = { ...players[seat] } as any;
        const arr = (p.zones?.battlefield ?? []).map((c: CardItem) => (c.id === cardId ? { ...c, x, y } : c));
        p.zones = { ...p.zones, battlefield: arr };
        players[seat] = p;
        const legacy = seat === 0 ? normalizeZones({ ...state.zones, battlefield: arr }) : state.zones;
        return { players, zones: legacy } as any;
      }
      const zones = { ...state.zones } as Record<ZoneId, CardItem[]>;
      const arr = zones.battlefield.map((c) => (c.id === cardId ? { ...c, x, y } : c));
      const zonesOut = normalizeZones({ ...zones, battlefield: arr });
      return { zones: zonesOut } as any;
    }),
  toggleTap: (cardId) =>
    set((state) => {
      const seat = state.mySeat;
      if (seat >= 0 && state.players[seat]) {
        const players = [...state.players];
        const p = { ...players[seat] } as any;
        let found = false;
        const bf = (p.zones?.battlefield ?? []).map((c: CardItem) => (c.id === cardId ? ((found = true), { ...c, tapped: !c.tapped }) : c));
        const lands = (p.zones?.lands ?? []).map((c: CardItem) => (c.id === cardId ? ((found = true), { ...c, tapped: !c.tapped }) : c));
        if (found) {
          p.zones = { ...p.zones, battlefield: bf, lands };
          players[seat] = p;
          const legacy = seat === 0 ? normalizeZones({ ...state.zones, battlefield: bf, lands }) : state.zones;
          return { players, zones: legacy } as any;
        }
      }
      const z = { ...state.zones } as Record<ZoneId, CardItem[]>;
      for (const k of Object.keys(z) as ZoneId[]) {
        const i = z[k].findIndex((c) => c.id === cardId);
        if (i >= 0) {
          z[k] = z[k].map((c, idx) => (idx === i ? { ...c, tapped: !c.tapped } : c));
          break;
        }
      }
      return { zones: z } as any;
    }),
  incCounter: (cardId, delta) =>
    set((state) => {
      const z = { ...state.zones } as Record<ZoneId, CardItem[]>;
      for (const k of Object.keys(z) as ZoneId[]) {
        const i = z[k].findIndex((c) => c.id === cardId);
        if (i >= 0) {
          z[k] = z[k].map((c, idx) =>
            idx === i ? { ...c, counters: Math.max(0, (c.counters ?? 0) + delta) } : c
          );
          break;
        }
      }
      return { zones: z } as any;
    }),
  toggleLabel: (cardId, label) =>
    set((state) => {
      const z = { ...state.zones } as Record<ZoneId, CardItem[]>;
      for (const k of Object.keys(z) as ZoneId[]) {
        const i = z[k].findIndex((c) => c.id === cardId);
        if (i >= 0) {
          z[k] = z[k].map((c, idx) => {
            if (idx !== i) return c;
            const cur = Array.isArray(c.labels) ? c.labels : [];
            const has = cur.includes(label);
            return { ...c, labels: has ? cur.filter((x) => x !== label) : [...cur, label] };
          });
          break;
        }
      }
      return { zones: z } as any;
    }),
  moveAnyToLibraryTop: (cardId) =>
    set((state) => {
      const z = { ...state.zones } as Record<ZoneId, CardItem[]>;
      let found: CardItem | null = null;
      for (const k of Object.keys(z) as ZoneId[]) {
        const idx = z[k].findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          [found] = z[k].splice(idx, 1);
          break;
        }
      }
      if (found) {
        const clean: CardItem = { ...found };
        delete (clean as any).x;
        delete (clean as any).y;
        clean.tapped = false;
        z.library = [clean, ...z.library];
      }
      return { zones: z } as any;
    }),
  moveAnyToLibraryBottom: (cardId) =>
    set((state) => {
      const z = { ...state.zones } as Record<ZoneId, CardItem[]>;
      let found: CardItem | null = null;
      for (const k of Object.keys(z) as ZoneId[]) {
        const idx = z[k].findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          [found] = z[k].splice(idx, 1);
          break;
        }
      }
      if (found) {
        const clean: CardItem = { ...found };
        delete (clean as any).x;
        delete (clean as any).y;
        clean.tapped = false;
        z.library = [...z.library, clean];
      }
      return { zones: z } as any;
    }),
  moveTopLibraryToBottom: () =>
    set((state) => {
      if (state.zones.library.length <= 1) return {} as any;
      const [top, ...rest] = state.zones.library;
      return { zones: { ...state.zones, library: [...rest, top] } } as any;
    }),
  addToken: (name = "Token", to: ZoneId = "battlefield") =>
    set((state) => {
      const seat = state.mySeat;
      if (seat >= 0 && state.players[seat]) {
        const players = [...state.players];
        const p = { ...players[seat] } as any;
        const z = { ...p.zones } as any;
        z[to] = [...(z[to] ?? []), { id: uid(), name }];
        p.zones = z;
        players[seat] = p;
        const legacy = seat === 0 ? normalizeZones({ ...state.zones, [to]: z[to] }) : state.zones;
        return { players, zones: legacy } as any;
      }
      const zones = state.zones as Record<ZoneId, CardItem[]>;
      const zonesOut = normalizeZones({ ...zones, [to]: [...zones[to], { id: uid(), name }] });
      return { zones: zonesOut } as any;
    }),
  moveToZone: (cardId, to) => {
    const fn = (get() as any).moveCard as (id: string, to: ZoneId) => void;
    fn(cardId, to);
  },
  putOnTopLibrary: (cardId) => {
    const fn = (get() as any).moveAnyToLibraryTop as (id: string) => void;
    fn(cardId);
  },
  putOnBottomLibrary: (cardId) => {
    const fn = (get() as any).moveAnyToLibraryBottom as (id: string) => void;
    fn(cardId);
  },
  drawSeven: () =>
    set((state) => {
      const lib = [...state.zones.library];
      const hand: CardItem[] = [];
      for (let i = 0; i < 7 && lib.length > 0; i++) {
        const top = lib.shift()!;
        hand.push(top);
      }
      const zones = normalizeZones({ ...state.zones, library: lib, hand });
      return { zones } as any;
    }),
  // London mulligan: put N cards from current hand to bottom of library, then redraw to 7
  mulliganLondon: (bottomCount: number) =>
    set((state) => {
      const lib = [...state.zones.library];
      const hand = [...state.zones.hand];
      // put chosen bottomCount from current hand onto bottom of library (take last N for now)
      const putCount = Math.min(bottomCount, hand.length);
      const toBottom = hand.splice(-putCount, putCount);
      const newLib = [...lib, ...toBottom];
      // draw up to 7
      while (hand.length < 7 && newLib.length > 0) {
        hand.push(newLib.shift()!);
      }
      const zones = normalizeZones({ ...state.zones, library: newLib, hand });
      return { zones } as any;
    }),
  // Simple 7-for-7: put entire hand on bottom, then draw 7 fresh
  mulliganSevenForSeven: () =>
    set((state) => {
      const lib = [...state.zones.library];
      const hand = [...state.zones.hand];
      const newLib = [...lib, ...hand];
      const newHand: CardItem[] = [];
      for (let i = 0; i < 7 && newLib.length > 0; i++) newHand.push(newLib.shift()!);
      const zones = normalizeZones({ ...state.zones, library: newLib, hand: newHand });
      return { zones } as any;
    }),
  untapAll: () =>
    set((state) => {
      const zones = state.zones as Record<ZoneId, CardItem[]>;
      const battlefield = zones.battlefield.map((c) => ({ ...c, tapped: false }));
      const lands = zones.lands.map((c) => ({ ...c, tapped: false }));
      const out = normalizeZones({ ...zones, battlefield, lands });
      return { zones: out } as any;
    }),
  incLife: (n) => set((state) => ({ life: Math.max(0, state.life + n) })),
  incPoison: (n) =>
    set((state) => ({ poison: Math.max(0, state.poison + n) })),
  incCommanderTax: (n) =>
    set((state) => ({ commanderTaxCount: Math.max(0, state.commanderTaxCount + n) })),
  incCommanderDamage: (opponent, n) =>
    set((state) => {
      const cur = state.commanderDamage[opponent] ?? 0;
      const next = Math.max(0, cur + n);
      return { commanderDamage: { ...state.commanderDamage, [opponent]: next } } as any;
    }),
  loadDeckFromNames: (cards, commanders) =>
    set((state) => {
      const lib: CardItem[] = [];
      for (const { name, count } of cards) {
        const n = Math.max(0, Math.floor(count));
        for (let i = 0; i < n; i++) lib.push({ id: uid(), name });
      }
      const command: CardItem[] = commanders.map((name) => ({ id: uid(), name }));
      const zones = normalizeZones({
        ...state.zones,
        library: lib,
        hand: [],
        battlefield: [],
        lands: [],
        graveyard: [],
        exile: [],
        command,
      });
      return { zones } as any;
    }),
  snapshot: () => {
    const s = get();
    // During migration, always derive players from legacy zones to prevent empty players overriding real zones
    const players = [
      {
        id: "p1",
        name: "Player 1",
        zones: {
          battlefield: s.zones.battlefield,
          lands: s.zones.lands,
          command: s.zones.command,
        },
        hand: s.zones.hand,
      },
    ];
    return {
      zones: s.zones,
      life: s.life,
      poison: s.poison,
      commanderTaxCount: s.commanderTaxCount,
      commanderDamage: s.commanderDamage,
      players,
      turnOrder: s.turnOrder,
      currentTurn: s.currentTurn,
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
              zones: { battlefield: zones.battlefield, lands: zones.lands, command: zones.command },
              hand: zones.hand,
            },
          ];
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
        } as any;
      } catch {
        return {} as any;
      }
    }),
  setSeatName: (index, name) =>
    set((state) => {
      const players = [...state.players];
      while (players.length <= index) {
        players.push({ id: `p${players.length + 1}`, name: `Player ${players.length + 1}` as string, zones: { battlefield: [], lands: [], command: [] }, hand: [] });
      }
      players[index] = { ...players[index], name };
      const turnOrder = [...state.turnOrder];
      while (turnOrder.length <= index) turnOrder.push(`Player ${turnOrder.length + 1}`);
      turnOrder[index] = name || `Player ${index + 1}`;
      return { players, turnOrder } as any;
    }),
  setSeats: (names) =>
    set((state) => {
      const players = names.map((n, i) => ({
        id: state.players[i]?.id ?? `p${i + 1}`,
        name: n || `Player ${i + 1}`,
        zones: state.players[i]?.zones ?? { battlefield: [], lands: [], command: [] },
        hand: state.players[i]?.hand ?? [],
      }));
      const turnOrder = players.map((p) => p.name);
      return { players, turnOrder } as any;
    }),
  setTurnOrder: (order) =>
    set((state) => {
      const turnOrder = Array.isArray(order) && order.length > 0 ? order : state.turnOrder;
      return { turnOrder } as any;
    }),
  setMySeat: (index) => set(() => ({ mySeat: typeof index === "number" ? index : -1 }) as any),
}));
