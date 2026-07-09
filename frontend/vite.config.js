import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:5002",
        ws: true,              // 🔥 REQUIRED FOR WEBSOCKETS
        changeOrigin: true
      }
    },
  },
})
