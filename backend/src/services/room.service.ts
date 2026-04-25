import { v4 as uuidv4 } from 'uuid';
import { getMongoDB } from '../db/mongodb';
import { getRedis, REDIS_KEYS } from '../db/redis';
import type { ChatRoom, OnlineUser } from '../types';

export class RoomService {
  async createRoom(name: string, description: string, maxUsers: number, createdBy: string): Promise<ChatRoom> {
    const db = getMongoDB();
    const roomsCollection = db.collection<ChatRoom>('chatRooms');

    const existingRoom = await roomsCollection.findOne({ name });
    if (existingRoom) {
      throw new Error('Room name already exists');
    }

    const room: ChatRoom = {
      id: uuidv4(),
      name,
      description,
      maxUsers: maxUsers || 100,
      createdBy,
      createdAt: new Date()
    };

    await roomsCollection.insertOne(room);
    return room;
  }

  async getAllRooms(): Promise<(ChatRoom & { onlineUsers: number })[]> {
    const db = getMongoDB();
    const redis = getRedis();
    const roomsCollection = db.collection<ChatRoom>('chatRooms');

    const rooms = await roomsCollection.find().sort({ createdAt: -1 }).toArray();

    const roomsWithOnline = await Promise.all(
      rooms.map(async (room) => {
        const usersKey = REDIS_KEYS.onlineUsers(room.id);
        const onlineUsers = await redis.sCard(usersKey);
        return {
          ...room,
          onlineUsers
        };
      })
    );

    return roomsWithOnline;
  }

  async getRoomById(roomId: string): Promise<ChatRoom | null> {
    const db = getMongoDB();
    const roomsCollection = db.collection<ChatRoom>('chatRooms');
    return roomsCollection.findOne({ id: roomId });
  }

  async getOnlineUsers(roomId: string): Promise<OnlineUser[]> {
    const redis = getRedis();
    const usersKey = REDIS_KEYS.onlineUsers(roomId);
    const userStrings = await redis.sMembers(usersKey);
    return userStrings.map(s => JSON.parse(s) as OnlineUser);
  }

  async addUserToRoom(roomId: string, user: OnlineUser): Promise<OnlineUser[]> {
    const redis = getRedis();
    const usersKey = REDIS_KEYS.onlineUsers(roomId);
    
    console.log(`[RoomService] Adding user ${user.nickname} to room ${roomId}`);
    console.log(`[RoomService] Redis key: ${usersKey}`);
    
    const currentUsers = await this.getOnlineUsers(roomId);
    console.log(`[RoomService] Current online users in room ${roomId}: ${currentUsers.length}`);
    
    const existingUser = currentUsers.find(u => u.userId === user.userId);
    
    if (existingUser) {
      console.log(`[RoomService] Removing existing user entry for ${user.nickname}`);
      await redis.sRem(usersKey, JSON.stringify(existingUser));
    }
    
    const userJson = JSON.stringify(user);
    console.log(`[RoomService] Adding user to Redis: ${userJson}`);
    const addResult = await redis.sAdd(usersKey, userJson);
    console.log(`[RoomService] Redis sAdd result: ${addResult}`);
    
    const updatedUsers = await this.getOnlineUsers(roomId);
    console.log(`[RoomService] Updated online users: ${updatedUsers.length}`);
    
    return updatedUsers;
  }

  async removeUserFromRoom(roomId: string, socketId: string): Promise<OnlineUser[]> {
    const redis = getRedis();
    const usersKey = REDIS_KEYS.onlineUsers(roomId);
    
    const currentUsers = await this.getOnlineUsers(roomId);
    const userToRemove = currentUsers.find(u => u.socketId === socketId);
    
    if (userToRemove) {
      await redis.sRem(usersKey, JSON.stringify(userToRemove));
    }
    
    return this.getOnlineUsers(roomId);
  }

  async removeUserFromAllRooms(socketId: string): Promise<{ roomId: string; users: OnlineUser[] }[]> {
    const redis = getRedis();
    const roomKeys = await redis.keys('room:*:users');
    const results: { roomId: string; users: OnlineUser[] }[] = [];

    for (const key of roomKeys) {
      const currentUsers: OnlineUser[] = (await redis.sMembers(key)).map(s => JSON.parse(s));
      const userToRemove = currentUsers.find(u => u.socketId === socketId);
      
      if (userToRemove) {
        await redis.sRem(key, JSON.stringify(userToRemove));
        const roomId = key.split(':')[1];
        const remainingUsers = await this.getOnlineUsers(roomId);
        results.push({ roomId, users: remainingUsers });
      }
    }

    return results;
  }
}
