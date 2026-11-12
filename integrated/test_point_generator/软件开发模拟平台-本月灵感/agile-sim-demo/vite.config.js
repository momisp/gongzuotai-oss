import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5180",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      "/generated": {
        target: "http://127.0.0.1:5180",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
