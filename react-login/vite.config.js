import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // './' makes asset links relative, so the built index.html also works
  // when opened directly as a file (file://) — not only when served.
  base: './',
  // host: true exposes the dev server on the local network (0.0.0.0),
  // so a phone on the same WiFi can open it via the laptop's IP.
  server: {
    host: true,
  },
})
