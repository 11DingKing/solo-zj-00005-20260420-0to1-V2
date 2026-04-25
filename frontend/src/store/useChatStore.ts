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
  hasUnreadMessages: boolean;
  unreadMessageCount: number;
  
  setCurrentRoom: (room: ChatRoom | null) => void;
  joinRoom: (room: ChatRoom, token: string) => Promise<void>;
  leaveRoom: () => void;
  sendMessage: (content: string, userId: string, nickname: string) => void;
  resendMessage: (tempId: string) => void;
  loadOlderMessages: (roomId: string) => Promise<number>;
  initWebSocketHandlers: () => () => void;
  markMessagesRead: () => void;
}

export const useChatStore = create<ChatState>((set, get) => {
  let removeReconnectHandler: (() => void) | null = null;

  const handleReconnect = () => {
    const { currentRoom } = get();
    const token = wsManager.getCurrentToken();
    console.log('WebSocket reconnected, currentRoom:', currentRoom?.id);
    
    if (currentRoom && token) {
      console.log('Rejoining room after reconnect:', currentRoom.id);
      wsManager.send({ type: 'join', roomId: currentRoom.id });
    }
  };

  return {
    currentRoom: null,
    messages: [],
    onlineUsers: [],
    hasMoreMessages: true,
    isLoadingMessages: false,
    hasUnreadMessages: false,
    unreadMessageCount: 0,

    setCurrentRoom: (room) => set({ currentRoom: room }),

    joinRoom: async (room, token) => {
      if (!wsManager.isConnected()) {
        await wsManager.connect(token);
      }

      if (!removeReconnectHandler) {
        removeReconnectHandler = wsManager.addReconnectHandler(handleReconnect);
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
        hasMoreMessages: true,
        hasUnreadMessages: false,
        unreadMessageCount: 0
      });

      try {
        set({ isLoadingMessages: true });
        const result = await roomsAPI.getMessages(room.id, undefined, 50);
        const historyMessages: OptimisticMessage[] = result.messages.map((m: Message) => ({
          ...m,
          tempId: m.id,
          status: 'sent' as const
        }));
        
        set({ 
          messages: historyMessages, 
          hasMoreMessages: result.hasMore,
          isLoadingMessages: false 
        });
      } catch (error) {
        console.error('Failed to load initial messages:', error);
        set({ isLoadingMessages: false });
      }

      wsManager.send({ type: 'join', roomId: room.id });
    },

    leaveRoom: () => {
      const { currentRoom } = get();
      if (currentRoom) {
        wsManager.send({ type: 'leave', roomId: currentRoom.id });
      }
      if (removeReconnectHandler) {
        removeReconnectHandler();
        removeReconnectHandler = null;
      }
      set({ 
        currentRoom: null, 
        messages: [], 
        onlineUsers: [],
        hasMoreMessages: true,
        hasUnreadMessages: false,
        unreadMessageCount: 0
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

    loadOlderMessages: async (roomId): Promise<number> => {
      const { isLoadingMessages, messages, hasMoreMessages } = get();
      
      if (isLoadingMessages || !hasMoreMessages) return 0;

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

        const loadedCount = newMessages.length;

        set((state) => ({
          messages: [...newMessages, ...state.messages],
          hasMoreMessages: result.hasMore,
          isLoadingMessages: false
        }));

        return loadedCount;
      } catch (error) {
        console.error('Failed to load older messages:', error);
        set({ isLoadingMessages: false });
        return 0;
      }
    },

    markMessagesRead: () => {
      set({ hasUnreadMessages: false, unreadMessageCount: 0 });
    },

    initWebSocketHandlers: () => {
      const removeMessageHandler = wsManager.addMessageHandler((message) => {
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
              return { 
                messages: [...state.messages, newMessage],
              };
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

      return () => {
        removeMessageHandler();
        if (removeReconnectHandler) {
          removeReconnectHandler();
          removeReconnectHandler = null;
        }
      };
    }
  };
});
