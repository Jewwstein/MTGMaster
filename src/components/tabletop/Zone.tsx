"use client";
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { useGame, type ZoneId, type CardItem, type GameState } from "../../state/game";
import { playSound } from "../../lib/sound";
import Card from "./Card";

const EMPTY_CARDS: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);

export default function Zone({
  id,
  title,
  className,
  isDragging = false,
  noWrap = false,
  innerClassName,
  playmat,
}: {
  id: ZoneId;
  title: string;
  className?: string;
  isDragging?: boolean;
  noWrap?: boolean;
  innerClassName?: string;
  playmat?: {
    filePath: string;
    name?: string | null;
    adjustment?: { zoom: number; position: { x: number; y: number } } | null;
  } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const cards = useGame((s: any) => (s?.zones && s.zones[id]) ? (s.zones[id] as ReadonlyArray<CardItem>) : EMPTY_CARDS);
  const apiRef = React.useRef<any>(null);
  React.useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  });
  const handleToggle = (cardId: string) => {
    apiRef.current?.toggleTap?.(cardId);
    playSound("tap");
  };
  const handleTopToBottom = () => apiRef.current?.moveTopLibraryToBottom?.();
  const handleShuffle = () => apiRef.current?.shuffleLibrary?.();
  const handleToLibTop = (cid: string) => apiRef.current?.moveAnyToLibraryTop?.(cid);
  const handleToLibBottom = (cid: string) => apiRef.current?.moveAnyToLibraryBottom?.(cid);
  const handleClone = (cid: string) => apiRef.current?.cloneCard?.(cid);
  const [menu, setMenu] = React.useState<{open:boolean; x:number; y:number; cardId?:string}>({open:false,x:0,y:0});
  const [scryOpen, setScryOpen] = React.useState(false);
  const [scryN, setScryN] = React.useState(1);

  const battlefield = id === "battlefield";
  const backgroundStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!playmat?.filePath) return undefined;
    const zoom = Math.min(Math.max(playmat.adjustment?.zoom ?? 1, 1), 4);
    const posX = Math.min(Math.max(playmat.adjustment?.position?.x ?? 50, 0), 100);
    const posY = Math.min(Math.max(playmat.adjustment?.position?.y ?? 50, 0), 100);
    return {
      backgroundImage: `url(${playmat.filePath})`,
      backgroundSize: `${Math.round(zoom * 100)}% auto`,
      backgroundPosition: `${Math.round(posX)}% ${Math.round(posY)}%`,
      backgroundRepeat: "no-repeat",
      backgroundColor: "rgba(12, 10, 16, 0.65)",
      backgroundBlendMode: "overlay",
    };
  }, [playmat?.filePath, playmat?.adjustment?.zoom, playmat?.adjustment?.position?.x, playmat?.adjustment?.position?.y]);
  
  // Determine if this zone should be semi-transparent
  const isTransparentZone = !["battlefield", "lands", "hand"].includes(id);

  const zoneStyle: React.CSSProperties = {
    backgroundColor: isTransparentZone ? "rgba(15, 15, 23, 0.35)" : "rgba(24, 24, 27, 0.92)",
    backdropFilter: isTransparentZone ? "blur(6px)" : undefined,
    WebkitBackdropFilter: isTransparentZone ? "blur(6px)" : undefined,
    transition: "background-color 0.2s ease, backdrop-filter 0.2s ease",
  };

  const contentStyle: React.CSSProperties = {
    ...(backgroundStyle || {}),
    backgroundColor: isTransparentZone ? "rgba(24, 24, 27, 0.22)" : undefined,
    borderRadius: isTransparentZone ? "0.375rem" : undefined,
    height: "100%",
    transition: "background-color 0.2s ease",
  };

  return (
    <div
      id={`zone-${id}`}
      ref={setNodeRef}
      className={`rounded-md border border-zinc-800/80 p-2 transition-all duration-200 ${
        isDragging && isOver ? "ring-2 ring-amber-500" : ""
      } ${className ?? ""}`}
      style={zoneStyle}
    >
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
        <span>{title}</span>
        {id === "library" && (
          <div className="flex items-center gap-2 font-normal">
            {apiRef.current?.shuffleLibrary && (
              <button onClick={handleShuffle} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Shuffle</button>
            )}
            <button onClick={handleTopToBottom} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Top→Bottom</button>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400">Scry</span>
              <button onClick={() => setScryN((n: number)=>Math.max(1,n-1))} className="rounded border border-zinc-700 px-2 text-[11px] leading-5 hover:bg-zinc-800">-</button>
              <span className="w-4 text-center">{scryN}</span>
              <button onClick={() => setScryN((n: number)=>Math.min(10,n+1))} className="rounded border border-zinc-700 px-2 text-[11px] leading-5 hover:bg-zinc-800">+</button>
              <button onClick={() => setScryOpen(true)} className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-black hover:bg-amber-400">Open</button>
            </div>
          </div>
        )}
      </div>
      {battlefield ? (
        <div
          id="zone-battlefield-canvas"
          className="relative h-full min-h-[360px] overflow-hidden rounded"
          style={backgroundStyle}
        >
          {playmat?.filePath && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-900/30 via-zinc-900/40 to-zinc-950/60" />}
          {cards.map((c: CardItem) => (
            <div
              key={c.id}
              className="absolute"
              style={{ left: (c.x ?? 0), top: (c.y ?? 0) }}
              onContextMenu={(e)=>{
                e.preventDefault();
                setMenu({open:true,x:e.clientX,y:e.clientY,cardId:c.id});
              }}
            >
              <Card card={c} onClick={() => handleToggle(c.id)} />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={
            innerClassName ??
            (noWrap
              ? 'flex gap-2 overflow-x-auto whitespace-nowrap hover:opacity-100'
              : 'flex h-full flex-wrap content-start gap-2 hover:opacity-100')
          }
          style={contentStyle}
        >
          {cards.map((c: CardItem) => (
            <div key={c.id} onContextMenu={(e)=>{e.preventDefault(); setMenu({open:true,x:e.clientX,y:e.clientY,cardId:c.id});}}>
              <Card
                card={c}
                onClick={id === "lands" ? () => handleToggle(c.id) : undefined}
                sizeClass={id === "command" ? "w-36 h-52" : undefined}
              />
            </div>
          ))}
        </div>
      )}
      {menu.open && (
        <div
          className="fixed z-50 rounded border border-zinc-800 bg-zinc-900 text-xs shadow font-mtgmasters"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={()=>setMenu((m: {open:boolean;x:number;y:number;cardId?:string})=>({...m,open:false}))}
        >
          {battlefield && (
            <button
              className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
              onClick={() => {
                if (menu.cardId) handleClone(menu.cardId);
                setMenu((m: {open:boolean;x:number;y:number;cardId?:string})=>({...m,open:false}));
              }}
            >Clone</button>
          )}
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={() => {
              if (menu.cardId) handleToLibTop(menu.cardId);
              setMenu((m: {open:boolean;x:number;y:number;cardId?:string})=>({...m,open:false}));
            }}
          >Put on Top of Library</button>
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={() => {
              if (menu.cardId) handleToLibBottom(menu.cardId);
              setMenu((m: {open:boolean;x:number;y:number;cardId?:string})=>({...m,open:false}));
            }}
          >Put on Bottom of Library</button>
        </div>
      )}
      {scryOpen && id === "library" && (
        <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/70 p-2 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-zinc-300">Scry up to {scryN}</div>
            <button onClick={()=>setScryOpen(false)} className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800">Close</button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTopToBottom}
              className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            >Bottom Top</button>
            <div className="text-zinc-400">Use Bottom Top up to {scryN} times</div>
          </div>
        </div>
      )}
    </div>
  );
}
