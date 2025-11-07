"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePageTheme, PageKey } from "@/hooks/usePageTheme";
import PageThemeControls from "@/components/theme/PageThemeControls";

type RoomSummary = {
  roomCode: string;
  name: string | null;
  status: string;
  updatedAt?: string | null;
};

export default function DashboardPage() {
  const themeManager = usePageTheme('dashboard' as PageKey);
  const { theme } = themeManager;
  const { data: session } = useSession();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [closingRoom, setClosingRoom] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const normalized = Array.isArray(data?.rooms)
        ? (data.rooms
            .map((room: any): RoomSummary | null => {
              if (!room || typeof room.roomCode !== "string") return null;
              const name = typeof room.name === "string" && room.name.trim().length > 0 ? room.name.trim() : null;
              const status = typeof room.status === "string" ? room.status : "active";
              const updatedAt = typeof room.updatedAt === "string" ? room.updatedAt : room.updatedAt ? String(room.updatedAt) : null;
              return {
                roomCode: room.roomCode,
                name,
                status,
                updatedAt,
              };
            })
            .filter(Boolean) as RoomSummary[])
        : [];
      setRooms(normalized);
    } catch (error) {
      console.error("Failed to load rooms", error);
      setRoomsError("Failed to load rooms");
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRooms();
  }, [refreshRooms]);

  const handleJoinRoom = useCallback(
    (code: string) => {
      if (!code) return;
      router.push(`/room/${code}`);
    },
    [router],
  );

  const handleCloseRoom = useCallback(
    async (code: string) => {
      if (!code || closingRoom === code) return;
      setClosingRoom(code);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "closed" }),
        });
        if (!res.ok) {
          let message = `status ${res.status}`;
          try {
            const payload = await res.json();
            if (payload?.error) message = String(payload.error);
          } catch {}
          throw new Error(message);
        }
        setRooms((prev) => prev.filter((room) => room.roomCode !== code));
      } catch (error) {
        console.error("Failed to close room", error);
        setRoomsError("Failed to close room");
        await refreshRooms();
      } finally {
        setClosingRoom(null);
      }
    },
    [closingRoom, refreshRooms],
  );

  return (
    <div 
      className="min-h-screen bg-gray-900 text-white"
      style={{
        backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
        '--accent-color': theme.accentColor || '#f59e0b'
      } as React.CSSProperties}
    >
      <PageThemeControls manager={themeManager} />
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

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 sm:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Room Management</h2>
                <p className="mt-1 text-sm text-zinc-400">View active rooms, join lobbies, or close rooms that are no longer needed.</p>
              </div>
              <button
                onClick={refreshRooms}
                disabled={roomsLoading}
                className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800 disabled:opacity-60"
                type="button"
              >
                Refresh
              </button>
            </div>

            {roomsError && <div className="mt-3 text-sm text-rose-400">{roomsError}</div>}
            {roomsLoading && <div className="mt-3 text-sm text-zinc-400">Loading rooms…</div>}

            {!roomsLoading && rooms.length === 0 && !roomsError && (
              <div className="mt-3 text-sm text-zinc-500">No active rooms available. Create a room or check back later.</div>
            )}

            {!roomsLoading && rooms.length > 0 && (
              <div className="mt-4 space-y-2">
                {rooms.map((room) => (
                  <div key={room.roomCode} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-200">{room.name ?? room.roomCode}</div>
                      <div className="text-xs text-zinc-500">Code: {room.roomCode}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleJoinRoom(room.roomCode)}
                        className="rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-black hover:bg-amber-400"
                        type="button"
                      >
                        Join Lobby
                      </button>
                      <button
                        onClick={() => handleCloseRoom(room.roomCode)}
                        disabled={closingRoom === room.roomCode}
                        className="rounded-md border border-rose-500 px-3 py-1 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                        type="button"
                      >
                        Close Room
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
