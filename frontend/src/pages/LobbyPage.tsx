import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { roomsAPI } from '../lib/api';
import type { ChatRoom } from '../types';

export default function LobbyPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomMaxUsers, setNewRoomMaxUsers] = useState(100);
  const [createError, setCreateError] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const loadRooms = async () => {
    try {
      setLoading(true);
      const result = await roomsAPI.getAll();
      setRooms(result.rooms || []);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!newRoomName.trim()) {
      setCreateError('请输入房间名称');
      return;
    }

    try {
      await roomsAPI.create(newRoomName, newRoomDesc, newRoomMaxUsers);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomMaxUsers(100);
      loadRooms();
    } catch (err: any) {
      setCreateError(err.message || '创建房间失败');
    }
  };

  const enterRoom = (room: ChatRoom) => {
    navigate(`/room/${room.id}`, { state: { room } });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">聊天大厅</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">欢迎，{user?.nickname || user?.username}</span>
            <button
              onClick={logout}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              退出登录
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">聊天室列表</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            + 创建房间
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            暂无聊天室，点击上方按钮创建第一个房间！
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                onClick={() => enterRoom(room)}
                className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-semibold text-gray-800 truncate">{room.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    room.onlineUsers > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {room.onlineUsers} 在线
                  </span>
                </div>
                {room.description && (
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">{room.description}</p>
                )}
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>最大人数: {room.maxUsers}</span>
                  <span>{formatDate(room.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-6">创建聊天室</h3>
            
            {createError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateRoom}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="roomName">
                  房间名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="roomName"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入房间名称"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="roomDesc">
                  房间描述
                </label>
                <textarea
                  id="roomDesc"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="请输入房间描述（可选）"
                />
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="maxUsers">
                  最大人数
                </label>
                <input
                  type="number"
                  id="maxUsers"
                  value={newRoomMaxUsers}
                  onChange={(e) => setNewRoomMaxUsers(parseInt(e.target.value) || 100)}
                  min={2}
                  max={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError('');
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
