/**
 * 一键启动：npm run dev + 等待 Vite/API 就绪 + 自动打开浏览器
 */
import { spawn, exec } from "child_process";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LAN_MODE = process.argv.includes("--lan");
const VITE_PORT = Number(process.env.AGILE_SIM_VITE_PORT) || 5173;
const APP_URL = `http://127.0.0.1:${VITE_PORT}`;
const API_HEALTH = "http://127.0.0.1:5180/api/health";

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return null;
}
const WAIT_MS = 90_000;
const POLL_MS = 400;

function openBrowser(url) {
  const win = process.platform === "win32";
  const cmd = win
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true });
}

async function waitUntilOk(url, label) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        console.log(`[agile-sim start] ${label} 就绪 → ${url}`);
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.warn(`[agile-sim start] 等待 ${label} 超时（${WAIT_MS / 1000}s）：${url}`);
  return false;
}

function runNpmInstall() {
  return new Promise((resolve, reject) => {
    console.log("[agile-sim start] 首次运行，正在 npm install …");
    const p = spawn("npm", ["install"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm install 退出码 ${code}`))));
  });
}

async function main() {
  if (!existsSync(path.join(ROOT, "node_modules"))) {
    await runNpmInstall();
  }

  const lanIp = pickLanIPv4();
  console.log(
    `[agile-sim start] 启动开发服务（前端 ${VITE_PORT} · API 5180${LAN_MODE ? " · 局域网" : ""}）…`
  );
  if (LAN_MODE && lanIp) {
    console.log(`[agile-sim start] 同事浏览器访问：http://${lanIp}:${VITE_PORT}`);
    console.log("[agile-sim start] 请在本机「允许 Node/Vite 通过防火墙」，并保持本窗口不关。");
  } else if (LAN_MODE) {
    console.warn("[agile-sim start] 未检测到局域网 IPv4，请手动 ipconfig 查看本机 IP");
  }
  console.log("[agile-sim start] 按 Ctrl+C 停止\n");

  const dev = spawn("npm", ["run", LAN_MODE ? "dev:lan" : "dev"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  let opened = false;
  const tryOpen = async () => {
    if (opened) return;
    const [viteOk, apiOk] = await Promise.all([
      waitUntilOk(APP_URL, "Vite"),
      waitUntilOk(API_HEALTH, "API"),
    ]);
    if (viteOk && apiOk && !opened) {
      opened = true;
      openBrowser(APP_URL);
      console.log(`[agile-sim start] 已在浏览器打开 ${APP_URL}`);
    } else if (viteOk && !opened) {
      opened = true;
      openBrowser(APP_URL);
      console.log(`[agile-sim start] API 未就绪，仍先打开 ${APP_URL}（页面可能稍后可用）`);
    }
  };

  void tryOpen();

  dev.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    dev.kill("SIGINT");
  });
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
