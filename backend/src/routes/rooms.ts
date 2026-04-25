import { Hono } from "hono";
import { RoomService } from "../services/room.service";
import { MessageService } from "../services/message.service";
import { authMiddleware } from "../middleware/auth";

const roomService = new RoomService();
const messageService = new MessageService();

export const roomsRouter = new Hono();

roomsRouter.use("*", authMiddleware);

roomsRouter.post("/", async (c) => {
  try {
    const user = c.get("user");
    const { name, description, maxUsers } = await c.req.json();

    if (!name) {
      return c.json({ error: "Room name is required" }, 400);
    }

    const room = await roomService.createRoom(
      name,
      description || "",
      maxUsers || 100,
      user.userId,
    );

    return c.json(
      {
        message: "Room created successfully",
        room,
      },
      201,
    );
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create room" }, 400);
  }
});

roomsRouter.get("/", async (c) => {
  try {
    const user = c.get("user");
    const rooms = await roomService.getAllRoomsWithDetails(user.userId);
    return c.json({ rooms });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to get rooms" }, 500);
  }
});

roomsRouter.get("/:roomId", async (c) => {
  try {
    const roomId = c.req.param("roomId");
    const room = await roomService.getRoomById(roomId);

    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }

    const onlineUsers = await roomService.getOnlineUsers(roomId);

    return c.json({
      room,
      onlineUsers: onlineUsers.length,
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to get room" }, 500);
  }
});

roomsRouter.get("/:roomId/messages", async (c) => {
  try {
    const roomId = c.req.param("roomId");
    const beforeStr = c.req.query("before");
    const limit = parseInt(c.req.query("limit") || "50", 10);

    const room = await roomService.getRoomById(roomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }

    let messages;
    if (beforeStr) {
      const before = new Date(beforeStr);
      messages = await messageService.getMessagesByPage(roomId, before, limit);
    } else {
      messages = await messageService.getRecentMessages(roomId, limit);
    }

    return c.json({ messages, hasMore: messages.length === limit });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to get messages" }, 500);
  }
});

roomsRouter.get("/:roomId/users", async (c) => {
  try {
    const roomId = c.req.param("roomId");

    const room = await roomService.getRoomById(roomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }

    const users = await roomService.getOnlineUsers(roomId);

    return c.json({ users });
  } catch (error: any) {
    return c.json(
      { error: error.message || "Failed to get online users" },
      500,
    );
  }
});
