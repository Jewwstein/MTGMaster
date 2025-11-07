"use client";
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { useGame, type CardItem } from "../../state/game";
import Card from "./Card";

export default function HandOverlay() {
  const EMPTY_HAND: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);
  const hand = useGame((s: any) => (s?.zones?.hand ? (s.zones.hand as ReadonlyArray<CardItem>) : EMPTY_HAND));
  const { setNodeRef, isOver } = useDroppable({ id: "hand" });
  const dragInfoRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleDragPointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {}
    dragInfoRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }, [offset.x, offset.y]);

  const handleDragPointerMove = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfoRef.current;
    if (!info || info.pointerId !== event.pointerId) return;
    const next = {
      x: info.originX + (event.clientX - info.startX),
      y: info.originY + (event.clientY - info.startY),
    };
    setOffset(next);
  }, []);

  const handleDragPointerUp = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfoRef.current;
    if (!info || info.pointerId !== event.pointerId) return;
    dragInfoRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-0 z-40 flex justify-center pb-2"
      style={{
        left: "calc(280px + 1rem - 5%)",
        right: "calc(220px + 1rem + 5%)",
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
    >
      <div
        ref={setNodeRef}
        className={`pointer-events-auto rounded-2xl border px-4 pb-4 pt-3 backdrop-blur ${
          isOver ? "border-amber-500 bg-zinc-900/60" : "border-zinc-800/80 bg-zinc-900/75"
        }`}
        style={{ maxWidth: "min(1100px, 80vw)", position: "relative" }}
      >
        <button
          type="button"
          aria-label="Move hand overlay"
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-lg text-zinc-300 shadow cursor-grab active:cursor-grabbing"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
        >
          ☰
        </button>
        <div className="flex items-center gap-4 overflow-x-auto">
          {hand.map((c: CardItem) => (
            <div key={c.id}>
              <Card card={c} sizeClass="w-[7.25rem] h-[10rem]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
