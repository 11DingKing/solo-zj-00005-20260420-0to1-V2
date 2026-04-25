export interface User {
  id: string;
  username: string;
  password: string;
  nickname: string;
  createdAt: Date;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  createdBy: string;
  createdAt: Date;
}

export interface RoomLastMessage {
  id: string;
  content: string;
  nickname: string;
  timestamp: Date;
}

export interface ChatRoomWithDetails extends ChatRoom {
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
  timestamp: Date;
}

export interface OnlineUser {
  userId: string;
  nickname: string;
  socketId: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  nickname: string;
}

export type WebSocketMessage =
  | { type: "join"; roomId: string }
  | { type: "leave"; roomId: string }
  | { type: "message"; roomId: string; content: string; tempId?: string }
  | { type: "typing"; roomId: string; isTyping: boolean };

export type WebSocketResponse =
  | { type: "message_ack"; tempId: string; success: boolean; message?: Message }
  | { type: "new_message"; message: Message }
  | { type: "users_update"; users: OnlineUser[] }
  | { type: "history"; messages: Message[] }
  | { type: "error"; message: string };
