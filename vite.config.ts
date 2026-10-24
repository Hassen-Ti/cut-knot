import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the packaged Electron file:// load works.
  // The browser build keeps "/" unless ELECTRON=1 (see `dist:win`).
  base: process.env.ELECTRON === '1' ? './' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
