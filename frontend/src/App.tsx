import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LobbyPage from './pages/LobbyPage';
import ChatRoomPage from './pages/ChatRoomPage';

function App() {
  const { token, isAuthenticated, checkAuth, initializeFromStorage } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeFromStorage();
    setIsInitialized(true);
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isInitialized && token && !isAuthenticated) {
      checkAuth();
    }
  }, [isInitialized, token, isAuthenticated, checkAuth]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={token ? <Navigate to="/" replace /> : <LoginPage />} 
      />
      <Route 
        path="/register" 
        element={token ? <Navigate to="/" replace /> : <RegisterPage />} 
      />
      <Route 
        path="/" 
        element={token ? <LobbyPage /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/room/:roomId" 
        element={token ? <ChatRoomPage /> : <Navigate to="/login" replace />} 
      />
    </Routes>
  );
}

export default App;
