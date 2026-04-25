import { v4 as uuidv4 } from 'uuid';
import { getMongoDB } from '../db/mongodb';
import { getRedis, REDIS_KEYS } from '../db/redis';
import type { Message } from '../types';

const CACHED_MESSAGE_COUNT = 100;

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
