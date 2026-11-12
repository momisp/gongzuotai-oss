const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let spriteWindow = null;
let expanded = false;

const SIZE = {
  collapsed: { width: 120, height: 148 },
  expanded: { width: 360, height: 500 },
};

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

function placeBottomRight(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.max(area.x, area.x + area.width - width - 18),
    y: Math.max(area.y, area.y + area.height - height - 18),
  };
}

function applyWindowSize(isExpanded) {
  if (!spriteWindow || spriteWindow.isDestroyed()) return;
  expanded = isExpanded;
  const size = isExpanded ? SIZE.expanded : SIZE.collapsed;
  const pos = placeBottomRight(size.width, size.height);
  spriteWindow.setBounds({ ...pos, ...size }, true);
  spriteWindow.webContents.send("sprite:size-changed", isExpanded);
}

function createSpriteWindow() {
  const size = SIZE.collapsed;
  const pos = placeBottomRight(size.width, size.height);
  spriteWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: pos.x,
    y: pos.y,
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: SIZE.expanded.width,
    maxHeight: SIZE.expanded.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "sprite-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  spriteWindow.setAlwaysOnTop(true, "floating");
  spriteWindow.loadFile(path.join(__dirname, "sprite.html"));
  spriteWindow.once("ready-to-show", () => spriteWindow.show());
  spriteWindow.on("closed", () => {
    spriteWindow = null;
  });
}

app.whenReady().then(createSpriteWindow);

app.on("second-instance", () => {
  if (!spriteWindow) return;
  if (spriteWindow.isMinimized()) spriteWindow.restore();
  spriteWindow.show();
  spriteWindow.focus();
});

app.on("window-all-closed", () => app.quit());

async function fetchSharedLlmConfig() {
  try {
    const res = await fetch("http://127.0.0.1:8765/api/auto-qa/sprite/llm-config", {
      signal: AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch {
    return { ok: false, configured: false, config: {} };
  }
}

ipcMain.handle("sprite:llm-config", async () => fetchSharedLlmConfig());

ipcMain.handle("sprite:chat", async (_event, payload) => {
  try {
    const body = { ...(payload || {}) };
    const cfg = body.config && typeof body.config === "object" ? body.config : {};
    if (!String(cfg.apiKey || "").trim()) {
      const shared = await fetchSharedLlmConfig();
      if (shared?.ok && shared.config?.apiKey) {
        body.config = shared.config;
      }
    }
    const res = await fetch("http://127.0.0.1:8765/api/auto-qa/sprite/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(125000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return data;
  } catch (error) {
    return {
      ok: false,
      error: `无法连接工作台：${error.message || error}。请先启动个人工作台。`,
    };
  }
});

ipcMain.handle("sprite:state", async () => {
  try {
    const res = await fetch("http://127.0.0.1:8765/api/auto-qa/sprite/state", {
      signal: AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch {
    return { ok: false, history: [] };
  }
});

ipcMain.handle("sprite:run-module", async (_event, moduleId) => {
  try {
    const safeId = encodeURIComponent(String(moduleId || ""));
    const res = await fetch(`http://127.0.0.1:8765/api/auto-qa/modules/${safeId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(310000),
    });
    return await res.json();
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.on("sprite:minimize", () => spriteWindow?.minimize());
ipcMain.on("sprite:close", () => {
  if (spriteWindow && !spriteWindow.isDestroyed()) {
    spriteWindow.close();
  }
  app.quit();
});
ipcMain.handle("sprite:toggle-size", () => {
  applyWindowSize(!expanded);
  return { expanded: !expanded };
});
