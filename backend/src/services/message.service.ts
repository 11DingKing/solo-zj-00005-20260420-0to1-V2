import { v4 as uuidv4 } from 'uuid';
import { getMongoDB } from '../db/mongodb';
import { getRedis, REDIS_KEYS } from '../db/redis';
import type { Message } from '../types';

const CACHED_MESSAGE_COUNT = 100;

export interface RoomLastMessage {
  id: string;
  content: string;
  nickname: string;
  timestamp: Date;
}

export class MessageService {
  async saveMessage(
    roomId: string,
    userId: string,
    nickname: string,
    content: string
  ): Promise<Message> {
    console.log(`[MessageService] Saving message from ${nickname} to room ${roomId}: ${content.substring(0, 50)}...`);
    
    const db = getMongoDB();
    const redis = getRedis();
    const messagesCollection = db.collection<Message>('messages');

    const message: Message = {
      id: uuidv4(),
      roomId,
      userId,
      nickname,
      content,
      timestamp: new Date()
    };

    console.log(`[MessageService] Inserting message into MongoDB: ${message.id}`);
    const insertResult = await messagesCollection.insertOne(message);
    console.log(`[MessageService] MongoDB insert result: acknowledged=${insertResult.acknowledged}`);

    const cacheKey = REDIS_KEYS.recentMessages(roomId);
    console.log(`[MessageService] Caching message to Redis key: ${cacheKey}`);
    await redis.lPush(cacheKey, JSON.stringify(message));
    await redis.lTrim(cacheKey, 0, CACHED_MESSAGE_COUNT - 1);

    const lastMessage: RoomLastMessage = {
      id: message.id,
      content: message.content,
      nickname: message.nickname,
      timestamp: message.timestamp
    };
    await redis.set(REDIS_KEYS.roomLastMessage(roomId), JSON.stringify(lastMessage));

    console.log(`[MessageService] Message saved successfully: ${message.id}`);
    return message;
  }

  async getRecentMessages(roomId: string, limit: number = 50): Promise<Message[]> {
    const redis = getRedis();
    const cacheKey = REDIS_KEYS.recentMessages(roomId);

    const cachedMessages = await redis.lRange(cacheKey, 0, limit - 1);
    if (cachedMessages.length > 0) {
      return cachedMessages.map(s => JSON.parse(s) as Message);
    }

    return this.getMessagesFromDB(roomId, 0, limit);
  }

  async getMessagesByPage(roomId: string, before: Date, limit: number = 50): Promise<Message[]> {
    return this.getMessagesFromDB(roomId, 0, limit, before);
  }

  async getLastMessage(roomId: string): Promise<RoomLastMessage | null> {
    const redis = getRedis();
    const cached = await redis.get(REDIS_KEYS.roomLastMessage(roomId));
    
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp)
      };
    }

    const db = getMongoDB();
    const messagesCollection = db.collection<Message>('messages');
    
    const lastMessage = await messagesCollection
      .find({ roomId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    if (lastMessage.length > 0) {
      const result: RoomLastMessage = {
        id: lastMessage[0].id,
        content: lastMessage[0].content,
        nickname: lastMessage[0].nickname,
        timestamp: lastMessage[0].timestamp
      };
      await redis.set(REDIS_KEYS.roomLastMessage(roomId), JSON.stringify(result));
      return result;
    }

    return null;
  }

  async getUnreadCount(roomId: string, userId: string): Promise<number> {
    const redis = getRedis();
    const lastReadKey = REDIS_KEYS.userLastRead(userId, roomId);
    const lastReadStr = await redis.get(lastReadKey);

    const db = getMongoDB();
    const messagesCollection = db.collection<Message>('messages');

    let query: any = { roomId, userId: { $ne: userId } };
    
    if (lastReadStr) {
      const lastRead = new Date(lastReadStr);
      query.timestamp = { $gt: lastRead };
    }

    const count = await messagesCollection.countDocuments(query);
    return count;
  }

  async updateUserLastRead(roomId: string, userId: string, timestamp: Date): Promise<void> {
    const redis = getRedis();
    const lastReadKey = REDIS_KEYS.userLastRead(userId, roomId);
    await redis.set(lastReadKey, timestamp.toISOString());
  }

  private async getMessagesFromDB(
    roomId: string,
    skip: number,
    limit: number,
    before?: Date
  ): Promise<Message[]> {
    const db = getMongoDB();
    const messagesCollection = db.collection<Message>('messages');

    const query: any = { roomId };
    if (before) {
      query.timestamp = { $lt: before };
    }

    const messages = await messagesCollection
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return messages.reverse();
  }
}
