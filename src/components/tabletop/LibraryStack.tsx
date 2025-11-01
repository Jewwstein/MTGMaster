"use client";
import { useState } from "react";
import { useGame } from "../../state/game";

export default function LibraryStack() {
  const count = useGame((s: any) => (s?.zones?.library?.length ?? 0) as number);
  const draw = (n: number) => {
    const api: any = (useGame as any).getState?.();
    api?.draw?.(n);
  };
  const [x, setX] = useState(3);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="text-sm font-semibold text-zinc-300">Library</div>
      <div
        role="button"
        onClick={() => draw(1)}
        className="mt-3 relative h-28 w-20 cursor-pointer select-none"
        title="Click to draw 1"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-md border border-zinc-700 bg-zinc-800 shadow"
            style={{ transform: `translate(${i * 3}px, ${-i * 3}px)` }}
          />
        ))}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-zinc-400">
          {count} cards
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <button
          onClick={() => draw(1)}
          className="rounded-md bg-amber-500 px-2 py-1 font-semibold text-black hover:bg-amber-400"
        >
          Draw 1
        </button>
        <input
          type="number"
          min={1}
          value={x}
          onChange={(e) => setX(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 outline-none"
        />
        <button
          onClick={() => draw(x)}
          className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
        >
          Draw X
        </button>
      </div>
    </div>
  );
}
