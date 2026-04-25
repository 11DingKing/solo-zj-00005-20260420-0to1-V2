import { createMiddleware } from 'hono/factory';
import * as jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    c.set('user', payload);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

export const extractUserFromToken = (token: string): JWTPayload | null => {
  try {
    console.log('Verifying token:', token.substring(0, 30) + '...');
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    console.log('Token verified successfully, userId:', payload.userId);
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
};
