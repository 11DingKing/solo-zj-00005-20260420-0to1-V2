import { create } from 'zustand';
import { User } from '../types';
import { authAPI, setUnauthorizedCallback } from '../lib/api';
import { tokenStorage } from '../lib/tokenStorage';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  initializeFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  initializeFromStorage: () => {
    const storedToken = tokenStorage.get();
    if (storedToken) {
      set({
        token: storedToken,
        isAuthenticated: true
      });
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await authAPI.login(username, password) as any;
      
      tokenStorage.set(result.token);
      
      set({
        user: result.user,
        token: result.token,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error: any) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username: string, password: string, nickname?: string) => {
    set({ isLoading: true });
    try {
      await authAPI.register(username, password, nickname);
      set({ isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    tokenStorage.remove();
    set({
      user: null,
      token: null,
      isAuthenticated: false
    });
  },

  checkAuth: async () => {
    const token = get().token || tokenStorage.get();
    if (!token) {
      set({
        token: null,
        isAuthenticated: false
      });
      return;
    }
    
    try {
      const result = await authAPI.getMe() as any;
      set({ 
        user: result.user, 
        isAuthenticated: true,
        token: token
      });
    } catch {
      tokenStorage.remove();
      set({
        user: null,
        token: null,
        isAuthenticated: false
      });
    }
  }
}));

setUnauthorizedCallback(() => {
  const state = useAuthStore.getState();
  state.logout();
});
