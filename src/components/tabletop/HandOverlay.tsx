"use client";
import { useDroppable } from "@dnd-kit/core";
import { useGame, type CardItem } from "../../state/game";
import Card from "./Card";

export default function HandOverlay() {
  const EMPTY_HAND: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);
  const hand = useGame((s: any) => (s?.zones?.hand ? (s.zones.hand as ReadonlyArray<CardItem>) : EMPTY_HAND));
  const { setNodeRef, isOver } = useDroppable({ id: "hand" });

  return (
    <div className="pointer-events-none absolute inset-x-10 bottom-4 z-40">
      <div
        ref={setNodeRef}
        className={`pointer-events-auto mx-auto max-w-4xl rounded-lg border p-2 backdrop-blur ${
          isOver ? "border-amber-500 bg-zinc-900/70" : "border-zinc-800/80 bg-zinc-900/80"
        }`}
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {hand.map((c: CardItem) => (
            <Card key={c.id} card={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
