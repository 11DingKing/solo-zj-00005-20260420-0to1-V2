export interface User {
  id: string;
  username: string;
  nickname: string;
}

export interface RoomLastMessage {
  id: string;
  content: string;
  nickname: string;
  timestamp: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  createdBy: string;
  createdAt: string;
  onlineUsers: number;
  lastMessage?: RoomLastMessage;
  unreadCount: number;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  nickname: string;
  content: string;
  timestamp: string;
}

export interface OptimisticMessage extends Message {
  tempId: string;
  status: "sending" | "sent" | "failed";
}

export interface OnlineUser {
  userId: string;
  nickname: string;
  socketId: string;
}

export type WebSocketMessage =
  | { type: "join"; roomId: string }
  | { type: "leave"; roomId: string }
  | { type: "message"; roomId: string; content: string; tempId?: string };

export type WebSocketResponse =
  | { type: "message_ack"; tempId: string; success: boolean; message?: Message }
  | { type: "new_message"; message: Message }
  | { type: "users_update"; users: OnlineUser[] }
  | { type: "history"; messages: Message[] }
  | { type: "error"; message: string };
