import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { roomsAPI } from '../lib/api';
import type { ChatRoom, OptimisticMessage, OnlineUser } from '../types';

export default function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const {
    currentRoom,
    messages,
    onlineUsers,
    hasMoreMessages,
    isLoadingMessages,
    setCurrentRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    resendMessage,
    loadOlderMessages,
    initWebSocketHandlers
  } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [prevMessagesLength, setPrevMessagesLength] = useState(0);

  const roomData = location.state?.room as ChatRoom | undefined;

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (isAtBottom && messages.length > prevMessagesLength) {
      scrollToBottom();
    }
    setPrevMessagesLength(messages.length);
  }, [messages, isAtBottom, prevMessagesLength, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);

    if (scrollTop === 0 && hasMoreMessages && !isLoadingMessages && roomId) {
      loadOlderMessages(roomId);
    }
  }, [hasMoreMessages, isLoadingMessages, roomId, loadOlderMessages]);

  useEffect(() => {
    const removeHandler = initWebSocketHandlers();
    return removeHandler;
  }, [initWebSocketHandlers]);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    const setupRoom = async () => {
      try {
        setLoading(true);
        setError('');

        if (roomData) {
          setCurrentRoom(roomData);
        } else {
          const result = await roomsAPI.getById(roomId);
          setCurrentRoom(result.room);
        }

        if (token) {
          await joinRoom(roomData || { id: roomId } as ChatRoom, token);
        }
      } catch (err: any) {
        setError(err.message || '无法加载聊天室');
      } finally {
        setLoading(false);
      }
    };

    setupRoom();

    return () => {
      leaveRoom();
    };
  }, [roomId, roomData, token, setCurrentRoom, joinRoom, leaveRoom, navigate]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !user) return;

    sendMessage(inputValue.trim(), user.id, user.nickname);
    setInputValue('');
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleBack = () => {
    leaveRoom();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">进入聊天室中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <p className="text-gray-800 font-medium mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            返回聊天大厅
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="text-gray-600 hover:text-gray-800 p-2 rounded-md hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-800">
                {currentRoom?.name || '聊天室'}
              </h1>
              {currentRoom?.description && (
                <p className="text-xs text-gray-500">{currentRoom.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>{onlineUsers.length} 在线</span>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        <div className="flex-1 flex flex-col bg-white m-4 rounded-lg shadow-sm overflow-hidden">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="message-list flex-1 overflow-y-auto p-4 space-y-4"
          >
            {isLoadingMessages && (
              <div className="text-center py-2">
                <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  加载历史消息中...
                </div>
              </div>
            )}

            {!hasMoreMessages && messages.length > 0 && (
              <div className="text-center py-2 text-sm text-gray-400">
                — 没有更多消息了 —
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>开始聊天吧</p>
              </div>
            ) : (
              messages.map((message: OptimisticMessage) => {
                const isOwnMessage = message.userId === user?.id;
                
                return (
                  <div
                    key={message.tempId || message.id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md ${isOwnMessage ? 'order-2' : ''}`}>
                      <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                        <span className="text-xs font-medium text-gray-600">
                          {message.nickname}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      
                      <div
                        className={`px-4 py-2 rounded-lg ${
                          isOwnMessage
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}
                      >
                        <p className="break-words">{message.content}</p>
                      </div>

                      <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                        {message.status === 'sending' && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                            发送中
                          </span>
                        )}
                        {message.status === 'sent' && (
                          <span className="text-xs text-green-500">已发送</span>
                        )}
                        {message.status === 'failed' && (
                          <button
                            onClick={() => resendMessage(message.tempId)}
                            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            点击重发
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-100 p-4">
            <form onSubmit={handleSend} className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="输入消息..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                发送
              </button>
            </form>
          </div>
        </div>

        <div className="w-64 bg-white m-4 ml-0 rounded-lg shadow-sm hidden lg:flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">在线用户 ({onlineUsers.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {onlineUsers.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">暂无在线用户</p>
            ) : (
              <div className="space-y-1">
                {onlineUsers.map((u: OnlineUser) => (
                  <div
                    key={u.socketId}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50"
                  >
                    <div className="relative">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-sm">
                          {u.nickname.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <span className="text-sm text-gray-700 truncate">
                      {u.nickname}
                      {u.userId === user?.id && (
                        <span className="text-xs text-blue-500 ml-1">(你)</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
