"use client";
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { useGame, type ZoneId, type CardItem, type GameState } from "../../state/game";
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
  playmat?: { filePath: string; name?: string | null } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const cards = useGame((s: any) => (s?.zones && s.zones[id]) ? (s.zones[id] as ReadonlyArray<CardItem>) : EMPTY_CARDS);
  const apiRef = React.useRef<any>(null);
  React.useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  });
  const handleToggle = (cardId: string) => apiRef.current?.toggleTap?.(cardId);
  const handleTopToBottom = () => apiRef.current?.moveTopLibraryToBottom?.();
  const handleShuffle = () => apiRef.current?.shuffleLibrary?.();
  const handleToLibTop = (cid: string) => apiRef.current?.moveAnyToLibraryTop?.(cid);
  const handleToLibBottom = (cid: string) => apiRef.current?.moveAnyToLibraryBottom?.(cid);
  const [menu, setMenu] = React.useState<{open:boolean; x:number; y:number; cardId?:string}>({open:false,x:0,y:0});
  const [scryOpen, setScryOpen] = React.useState(false);
  const [scryN, setScryN] = React.useState(1);

  const battlefield = id === "battlefield";
  const backgroundStyle = React.useMemo(() => {
    if (!playmat?.filePath) return undefined;
    return {
      backgroundImage: `url(${playmat.filePath})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundColor: "rgba(12, 10, 16, 0.65)",
      backgroundBlendMode: "overlay",
    } as const;
  }, [playmat?.filePath]);

  return (
    <div
      id={`zone-${id}`}
      ref={setNodeRef}
      className={`rounded-md border border-zinc-800 bg-zinc-900/60 p-2 ${
        isDragging && isOver ? "ring-2 ring-amber-500" : ""
      } ${className ?? ""}`}
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
              ? "flex gap-2 overflow-x-auto whitespace-nowrap"
              : "flex h-full flex-wrap content-start gap-2")
          }
          style={backgroundStyle}
        >
          {cards.map((c: CardItem) => (
            <div key={c.id} onContextMenu={(e)=>{e.preventDefault(); setMenu({open:true,x:e.clientX,y:e.clientY,cardId:c.id});}}>
              <Card
                card={c}
                onClick={id === "lands" ? () => handleToggle(c.id) : undefined}
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
