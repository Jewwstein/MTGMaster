"use client";
import Image from "next/image";
import { usePreview } from "./PreviewProvider";

export default function PreviewPanel() {
  const { img, name, loading } = usePreview();
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="text-sm font-semibold text-zinc-300">Card Preview</h2>
      <div className="mt-2 grid max-h-[50vh] place-items-center overflow-auto">
        {loading && (
          <div className="py-10 text-sm text-zinc-400">Loading...</div>
        )}
        {!loading && img && (
          <Image
            src={img}
            alt={name ?? "Card"}
            width={600}
            height={840}
            className="h-auto w-auto max-h-[48vh]"
            unoptimized
            priority
          />
        )}
        {!loading && !img && (
          <div className="py-10 text-sm text-zinc-500">Hover a card to preview</div>
        )}
      </div>
    </div>
  );
}
