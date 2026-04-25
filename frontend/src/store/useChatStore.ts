import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, OptimisticMessage, OnlineUser, ChatRoom } from '../types';
import { wsManager } from '../lib/websocket';
import { roomsAPI } from '../lib/api';

interface ChatState {
  currentRoom: ChatRoom | null;
  messages: OptimisticMessage[];
  onlineUsers: OnlineUser[];
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  
  setCurrentRoom: (room: ChatRoom | null) => void;
  joinRoom: (room: ChatRoom, token: string) => Promise<void>;
  leaveRoom: () => void;
  sendMessage: (content: string, userId: string, nickname: string) => void;
  resendMessage: (tempId: string) => void;
  loadOlderMessages: (roomId: string) => Promise<void>;
  initWebSocketHandlers: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentRoom: null,
  messages: [],
  onlineUsers: [],
  hasMoreMessages: true,
  isLoadingMessages: false,

  setCurrentRoom: (room) => set({ currentRoom: room }),

  joinRoom: async (room, token) => {
    if (!wsManager.isConnected()) {
      await wsManager.connect(token);
    }

    const state = get();
    if (state.currentRoom?.id === room.id) {
      return;
    }

    if (state.currentRoom) {
      wsManager.send({ type: 'leave', roomId: state.currentRoom.id });
    }

    set({ 
      currentRoom: room, 
      messages: [], 
      onlineUsers: [],
      hasMoreMessages: true 
    });

    wsManager.send({ type: 'join', roomId: room.id });
  },

  leaveRoom: () => {
    const { currentRoom } = get();
    if (currentRoom) {
      wsManager.send({ type: 'leave', roomId: currentRoom.id });
    }
    set({ 
      currentRoom: null, 
      messages: [], 
      onlineUsers: [],
      hasMoreMessages: true 
    });
  },

  sendMessage: (content, userId, nickname) => {
    const { currentRoom } = get();
    if (!currentRoom) return;

    const tempId = uuidv4();
    const optimisticMessage: OptimisticMessage = {
      id: '',
      tempId,
      roomId: currentRoom.id,
      userId,
      nickname,
      content,
      timestamp: new Date().toISOString(),
      status: 'sending'
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage]
    }));

    wsManager.send({
      type: 'message',
      roomId: currentRoom.id,
      content,
      tempId
    });
  },

  resendMessage: (tempId) => {
    const { currentRoom, messages } = get();
    if (!currentRoom) return;

    const message = messages.find(m => m.tempId === tempId);
    if (!message) return;

    set((state) => ({
      messages: state.messages.map(m => 
        m.tempId === tempId ? { ...m, status: 'sending' as const } : m
      )
    }));

    wsManager.send({
      type: 'message',
      roomId: currentRoom.id,
      content: message.content,
      tempId
    });
  },

  loadOlderMessages: async (roomId) => {
    const { isLoadingMessages, messages, hasMoreMessages } = get();
    
    if (isLoadingMessages || !hasMoreMessages) return;

    set({ isLoadingMessages: true });

    try {
      const oldestMessage = messages[0];
      const before = oldestMessage ? oldestMessage.timestamp : undefined;
      
      const result = await roomsAPI.getMessages(roomId, before);
      
      const newMessages: OptimisticMessage[] = result.messages.map((m: Message) => ({
        ...m,
        tempId: m.id,
        status: 'sent' as const
      }));

      set((state) => ({
        messages: [...newMessages, ...state.messages],
        hasMoreMessages: result.hasMore,
        isLoadingMessages: false
      }));
    } catch (error) {
      console.error('Failed to load older messages:', error);
      set({ isLoadingMessages: false });
    }
  },

  initWebSocketHandlers: () => {
    const removeHandler = wsManager.addMessageHandler((message) => {
      switch (message.type) {
        case 'history':
          const historyMessages: OptimisticMessage[] = message.messages.map(m => ({
            ...m,
            tempId: m.id,
            status: 'sent' as const
          }));
          set((state) => {
            if (state.messages.length === 0) {
              return { messages: historyMessages };
            }
            const existingIds = new Set(state.messages.map(m => m.id));
            const newMessages = historyMessages.filter(m => !existingIds.has(m.id));
            return { messages: [...newMessages, ...state.messages] };
          });
          break;

        case 'new_message':
          const newMessage: OptimisticMessage = {
            ...message.message,
            tempId: message.message.id,
            status: 'sent' as const
          };
          set((state) => {
            const exists = state.messages.some(m => m.id === newMessage.id);
            if (exists) return state;
            return { messages: [...state.messages, newMessage] };
          });
          break;

        case 'message_ack':
          set((state) => ({
            messages: state.messages.map(m => {
              if (m.tempId === message.tempId) {
                if (message.success && message.message) {
                  return {
                    ...m,
                    ...message.message,
                    status: 'sent' as const
                  };
                } else {
                  return { ...m, status: 'failed' as const };
                }
              }
              return m;
            })
          }));
          break;

        case 'users_update':
          set({ onlineUsers: message.users });
          break;

        case 'error':
          console.error('WebSocket error:', message.message);
          break;
      }
    });

    return removeHandler;
  }
}));
