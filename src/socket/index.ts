import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "../utils/jwt";

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  // Authenticate every socket connection using the same JWT access token
  // used for REST requests, passed via the `auth` handshake payload.
  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Missing auth token"));
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user?.sub as string;
    // Each user joins a private room so the server can target notifications
    // with `io.to(userId).emit(...)` from anywhere (controllers, jobs, etc.)
    socket.join(userId);

    // Agency/client "rooms" allow broadcasting workspace-wide events, e.g.
    // "a new post was created for this client" to everyone with access.
    const clientId = socket.data.user?.clientId as string | undefined;
    if (clientId) socket.join(`client:${clientId}`);

    socket.on("disconnect", () => {
      // no-op for now; presence tracking can hook in here later
    });
  });

  return io;
}

/** Access the shared Socket.IO instance from controllers/services/jobs. */
export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO has not been initialized yet");
  return io;
}
