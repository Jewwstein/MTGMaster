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

    io.on("connection", (socket) => {
      socket.on("join", (roomCode: string, displayName: string) => {
        socket.join(roomCode);
        socket.data.displayName = displayName;
        io.to(roomCode).emit("presence", { id: socket.id, name: displayName, type: "join" });
      });

      socket.on("leave", (roomCode: string) => {
        socket.leave(roomCode);
        io.to(roomCode).emit("presence", { id: socket.id, name: socket.data.displayName, type: "leave" });
      });

      socket.on("message", (roomCode: string, payload: any) => {
        io.to(roomCode).emit("message", { from: socket.id, payload });
      });

      socket.on("state", (roomCode: string, payload: any) => {
        if (!roomCode) return;
        const body = typeof payload === "object" && payload ? { ...payload } : {};
        body.from = socket.id;
        io.to(roomCode).emit("state", roomCode, body);
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
        // best effort; room unknown
      });
    });

    res.socket.server.io = io;
  }
  res.end();
}
