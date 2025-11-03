"use client";
import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { useGame, type CardItem } from "../../state/game";
import Card from "./Card";

export default function HandOverlay() {
  const EMPTY_HAND: ReadonlyArray<CardItem> = Object.freeze([] as CardItem[]);
  const hand = useGame((s: any) => (s?.zones?.hand ? (s.zones.hand as ReadonlyArray<CardItem>) : EMPTY_HAND));
  const { setNodeRef, isOver } = useDroppable({ id: "hand" });
  const apiRef = React.useRef<any>(null);
  React.useEffect(() => {
    apiRef.current = (useGame as any).getState?.();
  });
  const [menu, setMenu] = React.useState<{ open: boolean; x: number; y: number; cardId: string | null }>({ open: false, x: 0, y: 0, cardId: null });

  const closeMenu = React.useCallback(() => {
    setMenu((prev) => ({ ...prev, open: false, cardId: null }));
  }, []);

  const handleToTop = React.useCallback(() => {
    if (menu.cardId) apiRef.current?.moveAnyToLibraryTop?.(menu.cardId);
    closeMenu();
  }, [menu.cardId, closeMenu]);

  const handleToBottom = React.useCallback(() => {
    if (menu.cardId) apiRef.current?.moveAnyToLibraryBottom?.(menu.cardId);
    closeMenu();
  }, [menu.cardId, closeMenu]);

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
            <div
              key={c.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ open: true, x: e.clientX, y: e.clientY, cardId: c.id });
              }}
            >
              <Card card={c} suppressContextMenu />
            </div>
          ))}
        </div>
      </div>
      {menu.open && (
        <div
          className="pointer-events-auto fixed z-50 rounded border border-zinc-800 bg-zinc-900 text-xs shadow font-mtgmasters"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={closeMenu}
        >
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={handleToTop}
          >Put on Top of Library</button>
          <button
            className="block w-full px-3 py-1 text-left hover:bg-zinc-800"
            onClick={handleToBottom}
          >Put on Bottom of Library</button>
        </div>
      )}
    </div>
  );
}
