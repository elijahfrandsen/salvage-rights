import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/client",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
      "/healthz": "http://127.0.0.1:3000",
    },
  },
  build: {
    rollupOptions: { treeshake: false },
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
