"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (socket) return socket;
  socket = io({ path: "/api/socket-io" });
  return socket;
}
