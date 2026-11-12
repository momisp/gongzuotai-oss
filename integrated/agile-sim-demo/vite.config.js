import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://127.0.0.1:5180";
const PROXY_OPTS = {
  target: API_TARGET,
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
};

export default defineConfig(({ mode }) => {
  const isWorkbench = mode === "workbench";
  const base = isWorkbench ? "/agile-sim/" : "/";

  const proxy = isWorkbench
    ? {
        "/agile-sim/api": {
          ...PROXY_OPTS,
          rewrite: (p) => p.replace(/^\/agile-sim\/api/, "/api"),
        },
        "/agile-sim/generated": {
          ...PROXY_OPTS,
          rewrite: (p) => p.replace(/^\/agile-sim\/generated/, "/generated"),
        },
      }
    : {
        "/api": PROXY_OPTS,
        "/generated": PROXY_OPTS,
      };

  return {
    base,
    plugins: [react()],
    resolve: {
      // 保持 junction 路径，避免 @fs 解析到桌面真实路径（中文目录更易出问题）
      preserveSymlinks: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy,
      // 内嵌时页面经 8765 代理，HMR 仍直连 Vite 端口
      hmr: isWorkbench
        ? { host: "127.0.0.1", port: 5173, protocol: "ws" }
        : undefined,
    },
  };
});
