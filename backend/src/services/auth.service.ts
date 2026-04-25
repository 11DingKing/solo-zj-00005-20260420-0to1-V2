import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getMongoDB } from '../db/mongodb';
import type { User, JWTPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 10;

export class AuthService {
  async register(username: string, password: string, nickname: string): Promise<User> {
    const db = getMongoDB();
    const usersCollection = db.collection<User>('users');

    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user: User = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      nickname: nickname || username,
      createdAt: new Date()
    };

    await usersCollection.insertOne(user);
    return user;
  }

  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    const db = getMongoDB();
    const usersCollection = db.collection<User>('users');

    const user = await usersCollection.findOne({ username });
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid username or password');
    }

    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      nickname: user.nickname
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return { user, token };
  }

  async getUserById(userId: string): Promise<User | null> {
    const db = getMongoDB();
    const usersCollection = db.collection<User>('users');
    return usersCollection.findOne({ id: userId });
  }
}
