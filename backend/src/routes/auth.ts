import { Hono } from 'hono';
import { AuthService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';

const authService = new AuthService();

export const authRouter = new Hono();

authRouter.post('/register', async (c) => {
  try {
    const { username, password, nickname } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    const user = await authService.register(username, password, nickname || username);
    
    return c.json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      }
    }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || 'Registration failed' }, 400);
  }
});

authRouter.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    const { user, token } = await authService.login(username, password);
    
    return c.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      },
      token
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Login failed' }, 401);
  }
});

authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});
