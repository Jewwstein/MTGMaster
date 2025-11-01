"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">{session?.user?.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Create Game</h2>
            <p className="mt-1 text-sm text-zinc-400">Start a new room for up to 4 players.</p>
            <button
              onClick={() => router.push(`/room/${Math.random().toString(36).slice(2, 7).toUpperCase()}`)}
              className="mt-4 rounded-md bg-amber-500 px-4 py-2 font-semibold text-black hover:bg-amber-400"
            >
              Create Room
            </button>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Join Game</h2>
            <p className="mt-1 text-sm text-zinc-400">Enter a room code shared by a friend.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ROOM"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => roomCode && router.push(`/room/${roomCode}`)}
                className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-black hover:bg-amber-400"
              >
                Join
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Decks</h2>
            <p className="mt-1 text-sm text-zinc-400">Build and manage your Commander decks.</p>
            <Link
              href="/decks"
              className="mt-4 inline-block rounded-md border border-zinc-700 px-4 py-2 font-semibold hover:bg-zinc-800"
            >
              Open Decks
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
