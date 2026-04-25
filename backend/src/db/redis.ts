import { createClient, RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let client: RedisClientType;

export async function connectRedis(): Promise<RedisClientType> {
  if (client && client.isReady) return client;

  client = createClient({
    url: REDIS_URL,
  });

  client.on("error", (err) => console.error("Redis Client Error:", err));
  client.on("connect", () => console.log("Connected to Redis"));

  await client.connect();
  return client;
}

export function getRedis(): RedisClientType {
  if (!client || !client.isReady) {
    throw new Error("Redis not connected. Call connectRedis first.");
  }
  return client;
}

export const REDIS_KEYS = {
  onlineUsers: (roomId: string) => `room:${roomId}:users`,
  recentMessages: (roomId: string) => `room:${roomId}:messages`,
  userSockets: (userId: string) => `user:${userId}:sockets`,
  userLastRead: (userId: string, roomId: string) =>
    `user:${userId}:room:${roomId}:lastRead`,
  roomLastMessage: (roomId: string) => `room:${roomId}:lastMessage`,
};
