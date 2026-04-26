import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_PROXY_API_TARGET || 'http://localhost:3001'
  const wsTarget = env.VITE_PROXY_WS_TARGET || 'ws://localhost:3001'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      watch: {
        usePolling: true
      },
      proxy: {
        '/auth': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/rooms': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      }
    }
  }
})
