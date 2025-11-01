"use client";
import React from "react";
import { DndContext, DragEndEvent, rectIntersection, DragStartEvent, useSensor, useSensors, PointerSensor, DragMoveEvent, useDroppable } from "@dnd-kit/core";
import Zone from "./Zone";
import Card from "./Card";
import LibraryStack from "./LibraryStack";
import { useGame, type ZoneId, type GameState } from "../../state/game";
import { getSocket } from "../../lib/socket";
import { useParams } from "next/navigation";
import HandOverlay from "./HandOverlay";

export default function Tabletop() {
  const params = useParams<{ code: string }>();
  const roomCode = (params?.code ?? "").toString().toUpperCase();
  const [dragging, setDragging] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pointer = React.useRef<{x:number; y:number}>({x:0,y:0});
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

function PlayersGrid({ dragging }: { dragging: boolean }) {
  // Force legacy single-seat rendering for stability
  return (
    <>
      <div className="relative max-h-[420px] rounded-lg border border-zinc-800 bg-zinc-900 p-3 overflow-auto">
        <Zone
          id="battlefield"
          title="Battlefield"
          className="h-full min-h-[400px]"
          isDragging={dragging}
          innerClassName="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] auto-rows-[7rem] gap-2"
        />
      </div>
      <div>
        <Zone id="lands" title="Lands" className="min-h-[120px]" isDragging={dragging} noWrap />
      </div>
    </>
  );
}

// Removed PlayerPanel/SeatZone: legacy single-seat layout only




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

        {/* Center: Multi-seat grid */}
        <div className="flex h-full flex-col gap-3">
          <PlayersGrid dragging={dragging} />
        </div>

        {/* Right: Command Zone above Library stack */}
        <div className="flex h-full flex-col gap-3">
          <Zone id="command" title="Command Zone" className="min-h-[100px]" isDragging={dragging} />
          <div className="flex-1" />
          <LibraryStack />
        </div>

        {/* Floating Hand overlay */}
        <HandOverlay />
      </div>
    </DndContext>
  );
}

function LifeCommanderLeft() {
  const params2 = useParams<{ code: string }>();
  const roomCode = (params2?.code ?? "").toString().toUpperCase();
  const life = useGame((s: any) => (s && s.life) ?? 40);
  const poison = useGame((s: any) => (s && s.poison) ?? 0);
  const tax = useGame((s: any) => (s && s.commanderTaxCount) ?? 0);
  const doIncLife = (n: number) => { const api: any = (useGame as any).getState?.(); api?.incLife?.(n); };
  const doIncPoison = (n: number) => { const api: any = (useGame as any).getState?.(); api?.incPoison?.(n); };
  const doIncTax = (n: number) => { const api: any = (useGame as any).getState?.(); api?.incCommanderTax?.(n); };
  const taxTotal = tax * 2;
  const socket = React.useMemo(() => getSocket(), []);
  const [rolling, setRolling] = React.useState<{die:number; value?:number; by?:string} | null>(null);
  const [diceLog, setDiceLog] = React.useState<{ die:number; value:number; by:string }[]>([]);
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
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h3 className="text-xs font-semibold text-zinc-300">Life & Commander</h3>
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
                    <stop offset="0%" stopColor="#0b1220" />
                    <stop offset="100%" stopColor="#0a1a33" />
                  </linearGradient>
                </defs>
                <polygon points="50,3 86,20 97,58 72,94 28,94 3,58 14,20" fill="url(#d20grad)" stroke="#3b82f6" strokeWidth="3" />
                <polyline points="50,3 72,94 28,94 50,3" fill="none" stroke="#60a5fa" strokeOpacity="0.35" strokeWidth="2" />
                <polyline points="86,20 3,58 97,58 14,20" fill="none" stroke="#60a5fa" strokeOpacity="0.35" strokeWidth="2" />
              </svg>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-2xl font-extrabold text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.35)]">
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
      <div className="mt-3 rounded border border-zinc-800 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Commander Tax</span>
          <span className="text-lg font-bold">{taxTotal}</span>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => doIncTax(1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">+ Cast</button>
          <button onClick={() => doIncTax(-1)} className="rounded border border-zinc-700 px-2 py-1 text-[10px] hover:bg-zinc-800">- Cast</button>
        </div>
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
