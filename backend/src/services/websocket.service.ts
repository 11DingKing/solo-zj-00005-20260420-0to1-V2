import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RoomService } from './room.service';
import { MessageService } from './message.service';
import { extractUserFromToken } from '../middleware/auth';
import type { WebSocketMessage, WebSocketResponse, OnlineUser, JWTPayload, Message } from '../types';

interface ConnectedClient {
  ws: WebSocket;
  user: JWTPayload;
  currentRoomId: string | null;
  socketId: string;
}

export class WebSocketService {
  private clients: Map<string, ConnectedClient> = new Map();
  private roomService: RoomService;
  private messageService: MessageService;

  constructor() {
    this.roomService = new RoomService();
    this.messageService = new MessageService();
  }

  async handleConnection(ws: WebSocket, url: string): Promise<void> {
    const urlObj = new URL(url, 'http://localhost');
    const token = urlObj.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    console.log('WebSocket connection attempt with token:', token?.substring(0, 30) + '...');
    const user = extractUserFromToken(token);
    if (!user) {
      console.log('WebSocket connection rejected: invalid token');
      ws.close(4001, 'Invalid token');
      return;
    }
    console.log('WebSocket connection accepted for user:', user.username);

    const socketId = uuidv4();
    const client: ConnectedClient = {
      ws,
      user,
      currentRoomId: null,
      socketId
    };

    this.clients.set(socketId, client);
    console.log(`User ${user.username} connected with socket ${socketId}`);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        await this.handleMessage(socketId, message);
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendToClient(socketId, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('close', async () => {
      await this.handleDisconnect(socketId);
    });

    ws.on('error', async () => {
      await this.handleDisconnect(socketId);
    });
  }

  private async handleMessage(socketId: string, message: WebSocketMessage): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;

    switch (message.type) {
      case 'join':
        await this.handleJoinRoom(socketId, message.roomId);
        break;
      case 'leave':
        await this.handleLeaveRoom(socketId, message.roomId);
        break;
      case 'message':
        await this.handleChatMessage(socketId, message.roomId, message.content, message.tempId);
        break;
    }
  }

  private async handleJoinRoom(socketId: string, roomId: string): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;

    const room = await this.roomService.getRoomById(roomId);
    if (!room) {
      this.sendToClient(socketId, { type: 'error', message: 'Room not found' });
      return;
    }

    if (client.currentRoomId) {
      await this.handleLeaveRoom(socketId, client.currentRoomId);
    }

    client.currentRoomId = roomId;

    const onlineUser: OnlineUser = {
      userId: client.user.userId,
      nickname: client.user.nickname,
      socketId
    };

    const users = await this.roomService.addUserToRoom(roomId, onlineUser);
    this.broadcastToRoom(roomId, { type: 'users_update', users });

    const recentMessages = await this.messageService.getRecentMessages(roomId, 50);
    this.sendToClient(socketId, { type: 'history', messages: recentMessages });
  }

  private async handleLeaveRoom(socketId: string, roomId: string): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;

    client.currentRoomId = null;

    const users = await this.roomService.removeUserFromRoom(roomId, socketId);
    this.broadcastToRoom(roomId, { type: 'users_update', users });
  }

  private async handleChatMessage(
    socketId: string,
    roomId: string,
    content: string,
    tempId?: string
  ): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;

    if (!content.trim()) {
      if (tempId) {
        this.sendToClient(socketId, {
          type: 'message_ack',
          tempId,
          success: false,
          message: undefined
        });
      }
      return;
    }

    try {
      const message = await this.messageService.saveMessage(
        roomId,
        client.user.userId,
        client.user.nickname,
        content
      );

      if (tempId) {
        this.sendToClient(socketId, {
          type: 'message_ack',
          tempId,
          success: true,
          message
        });
      }

      this.broadcastToRoom(roomId, {
        type: 'new_message',
        message
      }, socketId);

    } catch (error) {
      console.error('Error saving message:', error);
      if (tempId) {
        this.sendToClient(socketId, {
          type: 'message_ack',
          tempId,
          success: false,
          message: undefined
        });
      }
    }
  }

  private async handleDisconnect(socketId: string): Promise<void> {
    const client = this.clients.get(socketId);
    if (!client) return;

    const roomUpdates = await this.roomService.removeUserFromAllRooms(socketId);

    for (const { roomId, users } of roomUpdates) {
      this.broadcastToRoom(roomId, { type: 'users_update', users });
    }

    this.clients.delete(socketId);
    console.log(`Socket ${socketId} disconnected`);
  }

  private sendToClient(socketId: string, response: WebSocketResponse): void {
    const client = this.clients.get(socketId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(response));
    }
  }

  private broadcastToRoom(roomId: string, response: WebSocketResponse, excludeSocketId?: string): void {
    for (const [socketId, client] of this.clients) {
      if (client.currentRoomId === roomId && socketId !== excludeSocketId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(response));
        }
      }
    }
  }
}
