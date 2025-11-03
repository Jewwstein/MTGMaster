import Link from "next/link";
import Image from "next/image";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400","700" ] });

function Mana({ sym }: { sym: "W"|"U"|"B"|"R"|"G" }) {
  return (
    <Image
      src={`https://svgs.scryfall.io/card-symbols/${sym}.svg`}
      alt={`${sym} mana`}
      width={80}
      height={80}
      className="h-16 w-16 drop-shadow-[0_0_12px_rgba(250,204,21,0.35)]"
    />
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-black px-6 py-16 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 text-center">
        <h1 className={`text-6xl sm:text-7xl md:text-8xl font-extrabold tracking-tight drop-shadow-[0_0_18px_rgba(250,204,21,0.25)] ${cinzel.className}`}>
          MTGMasters
        </h1>
        <p className="max-w-2xl text-lg md:text-xl text-zinc-300">
          Where friends become enemies.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Mana sym="W" />
          <Mana sym="U" />
          <Mana sym="B" />
          <Mana sym="R" />
          <Mana sym="G" />
        </div>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-md bg-amber-500 px-8 py-3 text-lg font-semibold text-black shadow-lg hover:bg-amber-400"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-8 py-3 text-lg font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
