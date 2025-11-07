import type { NextApiRequest } from "next";
import type { NextApiResponseServerIO } from "../../types/next";
import { Server as IOServer } from "socket.io";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server as any, {
      path: "/api/socket-io",
    });

    const presenceByRoom = new Map<string, Map<string, string>>();

    const normalizeRoom = (roomCode: string) => (roomCode ?? "").toString().trim().toUpperCase();
    const normalizeName = (name: string) => (typeof name === "string" ? name.trim() : "");

    io.on("connection", (socket) => {
      const removePresence = (room: string | null | undefined, nameKey?: string | null) => {
        if (!room) return;
        const upperRoom = normalizeRoom(room);
        if (!upperRoom) return;
        if (!nameKey) {
          const existingKey = socket.data?.nameKey as string | undefined;
          if (existingKey) nameKey = existingKey;
        }
        if (!nameKey) return;
        const roomMap = presenceByRoom.get(upperRoom);
        if (!roomMap) return;
        if (roomMap.get(nameKey) === socket.id) {
          roomMap.delete(nameKey);
          if (roomMap.size === 0) {
            presenceByRoom.delete(upperRoom);
          }
        }
      };

      socket.on("join", (roomCode: string, displayName: string) => {
        const room = normalizeRoom(roomCode);
        if (!room) return;
        const rawName = normalizeName(displayName);
        const safeName = rawName || "Player";
        const nameKey = safeName.toLowerCase();

        let roomMap = presenceByRoom.get(room);
        if (!roomMap) {
          roomMap = new Map();
          presenceByRoom.set(room, roomMap);
        }

        const existingSocketId = roomMap.get(nameKey);
        if (existingSocketId && existingSocketId !== socket.id) {
          roomMap.delete(nameKey);
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          const previousName = existingSocket?.data?.displayName || safeName;
          const previousKey = typeof existingSocket?.data?.nameKey === "string" ? existingSocket.data.nameKey : nameKey;
          io.to(room).emit("presence", { id: existingSocketId, name: previousName, key: previousKey, type: "leave" });
          if (existingSocket) {
            existingSocket.leave(room);
            if (existingSocket.data) {
              if (existingSocket.data.roomCode === room) existingSocket.data.roomCode = null;
              if (existingSocket.data.nameKey === nameKey) existingSocket.data.nameKey = null;
            }
          }
        }

        socket.join(room);
        socket.data.displayName = safeName;
        socket.data.roomCode = room;
        socket.data.nameKey = nameKey;

        roomMap.set(nameKey, socket.id);
        io.to(room).emit("presence", { id: socket.id, name: safeName, key: nameKey, type: "join" });
      });

      socket.on("leave", (roomCode: string) => {
        const room = normalizeRoom(roomCode);
        if (!room) return;
        const displayName = socket.data?.displayName || "Player";
        const key = typeof socket.data?.nameKey === "string" ? (socket.data.nameKey as string) : normalizeName(displayName).toLowerCase();
        socket.leave(room);
        removePresence(room, key);
        if (socket.data) {
          if (socket.data.roomCode === room) socket.data.roomCode = null;
          if (socket.data.nameKey === key) socket.data.nameKey = null;
        }
        io.to(room).emit("presence", { id: socket.id, name: displayName, key, type: "leave" });
      });

      socket.on("message", (roomCode: string, payload: any) => {
        io.to(roomCode).emit("message", { from: socket.id, payload });
      });

      socket.on("state", (roomCode: string, payload: any) => {
        if (!roomCode) return;
        const body = typeof payload === "object" && payload ? { ...payload } : {};
        body.from = socket.id;
        body.playerKey = socket.data.nameKey;
        socket.to(roomCode).emit("state", roomCode, body);
      });

      // Broadcast dice rolls (scoped to room when roomCode provided)
      socket.on("dice", (roomOrPayload: any, maybePayload?: any) => {
        let roomCode: string | null = null;
        let payload: any = roomOrPayload;
        if (typeof roomOrPayload === "string") {
          roomCode = roomOrPayload;
          payload = maybePayload;
        }
        const die = Number(payload?.die || 20);
        const value = Number(payload?.value || 1);
        const by = socket.data.displayName || "Player";
        if (roomCode) io.to(roomCode).emit("dice", { die, value, by });
        else io.emit("dice", { die, value, by });
      });

      socket.on("disconnect", () => {
        const room = socket.data?.roomCode as string | undefined;
        const displayName = socket.data?.displayName || "Player";
        const nameKey = socket.data?.nameKey as string | undefined;
        if (room && nameKey) {
          removePresence(room, nameKey);
          io.to(normalizeRoom(room)).emit("presence", { id: socket.id, name: displayName, key: nameKey, type: "disconnect" });
        }
      });
    });

    res.socket.server.io = io;
  }
  res.end();
}
