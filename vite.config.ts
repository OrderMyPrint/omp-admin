import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The admin calls the API through its own /api path (Vite proxy in development,
// a Vercel rewrite in production), so the staff session cookie is first-party.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:4000", changeOrigin: false } },
  },
  preview: { port: 5173 },
});
