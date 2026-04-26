import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server as WebSocketServer, WebSocket } from "ws";
import { connectMongoDB } from "./db/mongodb";
import { connectRedis } from "./db/redis";
import { authRouter } from "./routes/auth";
import { roomsRouter } from "./routes/rooms";
import { authMiddleware } from "./middleware/auth";
import { WebSocketService } from "./services/websocket.service";

const app = new Hono();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/auth", authRouter);
app.route("/rooms", roomsRouter);

app.get("/protected", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json({ message: "Protected route", user });
});

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function convertHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function main() {
  console.log("Starting chat server...");

  await connectMongoDB();
  await connectRedis();

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      console.log("HTTP request:", req.method, req.url);
      try {
        const body = await readBody(req);
        const headers = convertHeaders(req);
        
        const protocol = req.socket.encrypted ? "https" : "http";
        const host = headers.get("host") || "localhost";
        const url = `${protocol}://${host}${req.url}`;

        const request = new Request(url, {
          method: req.method,
          headers,
          body: req.method !== "GET" && req.method !== "HEAD" && body.length > 0 ? body : undefined,
        });

        const response = await app.fetch(request);

        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        const responseBody = await response.text();
        console.log("HTTP response:", response.status);
        res.end(responseBody);
      } catch (error) {
        console.error("Error handling HTTP request:", error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    },
  );

  const wss = new WebSocketServer({ noServer: true });
  const webSocketService = new WebSocketService();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("WebSocket connection event received");
    webSocketService.handleConnection(ws, req.url || "");
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  server.on("upgrade", (request, socket, head) => {
    console.log("Upgrade request received for:", request.url);

    if (request.url?.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      console.log("Rejecting upgrade request for non-WS path");
      socket.destroy();
    }
  });

  server.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.syscall !== "listen") {
      throw error;
    }

    switch (error.code) {
      case "EACCES":
        console.error(`Port ${PORT} requires elevated privileges`);
        process.exit(1);
      case "EADDRINUSE":
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      default:
        throw error;
    }
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    wss.close(() => {
      console.log("WebSocket server closed");
      server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    });
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
