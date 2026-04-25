import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app';

let client: MongoClient;
let db: Db;

export async function connectMongoDB(): Promise<Db> {
  if (db) return db;
  
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  
  console.log('Connected to MongoDB');
  
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('chatRooms').createIndex({ id: 1 }, { unique: true });
  await db.collection('messages').createIndex({ id: 1 }, { unique: true });
  await db.collection('messages').createIndex({ roomId: 1, timestamp: -1 });
  
  return db;
}

export function getMongoDB(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongoDB first.');
  }
  return db;
}
