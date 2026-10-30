import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.OTTO_API || 'http://127.0.0.1:8000',      // OTTO_API: point at a backend on another port
        changeOrigin: true,
        // When the backend isn't running, say so instead of a bare "500".
        configure: proxy => {
          proxy.on('error', (_err, _req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ detail: "Otto's server isn't reachable — start the backend: uvicorn app.main:app --port 8000" }));
            }
          });
        },
      },
    },
  },
});
