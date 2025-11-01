import Link from "next/link";
import Image from "next/image";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400","700" ] });

function Mana({ sym }: { sym: "W"|"U"|"B"|"R"|"G" }) {
  return (
    <Image
      src={`https://svgs.scryfall.io/card-symbols/${sym}.svg`}
      alt={`${sym} mana`}
      width={40}
      height={40}
      className="h-10 w-10"
    />
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className={`text-5xl md:text-6xl font-extrabold tracking-tight ${cinzel.className}`}>
          MTGMasters
        </h1>
        <p className="mt-4 text-zinc-300">
          Online Commander tabletop with decks, zones, and realtime play.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Mana sym="W" />
          <Mana sym="U" />
          <Mana sym="B" />
          <Mana sym="R" />
          <Mana sym="G" />
        </div>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-md bg-amber-500 px-6 py-3 font-semibold text-black shadow hover:bg-amber-400"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-6 py-3 font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
