const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const path = require("path");
const si = require("systeminformation");
const { getProcessTraffic } = require("./process_net");

let mainWindow = null;

/** CPU 型号/核心数：不变，只采一次 */
let cachedCpuStatic = null;
/** 磁盘容量：变化慢，定时刷新 */
let cachedFsSize = null;
let cachedFsSizeAt = 0;
/** GPU 信息：变化慢 */
let cachedGraphics = null;
let cachedGraphicsAt = 0;
/** 主频：不必每轮都采 */
let cachedCpuSpeed = null;
let cachedCpuSpeedAt = 0;

const FS_TTL_MS = 15000;
const GFX_TTL_MS = 20000;
const SPEED_TTL_MS = 10000;

/** 避免 Windows 下个别 si 调用长时间不返回，拖死整次采集 */
async function withTimeout(promiseOrFn, ms, fallback) {
  try {
    const p = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    return await Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
    ]);
  } catch {
    return fallback;
  }
}

function setChineseApplicationMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: "关于「" + app.name + "」" },
              { type: "separator" },
              { role: "services", label: "服务" },
              { type: "separator" },
              { role: "hide", label: "隐藏 " + app.name },
              { role: "hideOthers", label: "隐藏其他" },
              { role: "unhide", label: "显示全部" },
              { type: "separator" },
              { role: "quit", label: "退出" }
            ]
          }
        ]
      : [
          {
            label: "文件",
            submenu: [{ role: "quit", label: "退出" }]
          }
        ]),
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle", label: "粘贴并匹配样式" },
              { role: "delete", label: "删除" },
              { role: "selectAll", label: "全选" },
              { type: "separator" },
              {
                label: "语音",
                submenu: [
                  { role: "startSpeaking", label: "开始朗读" },
                  { role: "stopSpeaking", label: "停止朗读" }
                ]
              }
            ]
          : [
              { role: "delete", label: "删除" },
              { type: "separator" },
              { role: "selectAll", label: "全选" }
            ])
      ]
    },
    {
      label: "查看",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { role: "toggledevtools", label: "切换开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        ...(isMac ? [{ role: "zoom", label: "缩放" }, { type: "separator" }, { role: "front", label: "前置全部窗口" }] : []),
        { role: "close", label: "关闭" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于工具小站",
          click: async () => {
            const win = BrowserWindow.getFocusedWindow() || mainWindow;
            await dialog.showMessageBox(win || undefined, {
              type: "info",
              title: "关于",
              message: "工具小站",
              detail: "常用开发小工具 · 桌面版（Electron）"
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const indexPath = path.join(__dirname, "..", "index.html");
  mainWindow.loadFile(indexPath);
}

async function buildSnapshot() {
  const now = Date.now();

  if (!cachedCpuStatic) {
    cachedCpuStatic = await withTimeout(
      () => si.cpu(),
      8000,
      { brand: "", cores: 0, physicalCores: 0 }
    );
  }
  const cpuInfo = cachedCpuStatic;

  if (!cachedFsSize || now - cachedFsSizeAt > FS_TTL_MS) {
    const fs = await withTimeout(() => si.fsSize(), 12000, []);
    cachedFsSize = fs;
    cachedFsSizeAt = now;
  }
  const fsSize = cachedFsSize || [];

  if (!cachedGraphics || now - cachedGraphicsAt > GFX_TTL_MS) {
    const g = await withTimeout(
      () => si.graphics().catch(() => ({ controllers: [] })),
      3500,
      { controllers: [] }
    );
    cachedGraphics = g;
    cachedGraphicsAt = now;
  }
  const graphics = cachedGraphics || { controllers: [] };

  if (!cachedCpuSpeed || now - cachedCpuSpeedAt > SPEED_TTL_MS) {
    const s = await withTimeout(() => si.cpuCurrentSpeed(), 6000, { avg: 0, min: 0, max: 0 });
    cachedCpuSpeed = s;
    cachedCpuSpeedAt = now;
  }
  const cpuSpeed = cachedCpuSpeed || { avg: 0 };

  /** 每轮只拉 CPU 占用、内存、网速（其余走缓存），减轻 WMI/枚举对 CPU 的压力 */
  const [cpuLoad, mem, networkStats] = await Promise.all([
    withTimeout(() => si.currentLoad(), 8000, { currentLoad: 0 }),
    withTimeout(() => si.mem(), 8000, { total: 1, used: 0, available: 0 }),
    withTimeout(() => si.networkStats().catch(() => []), 3500, [])
  ]);

  const cpuPct =
    typeof cpuLoad.currentLoad === "number" && !Number.isNaN(cpuLoad.currentLoad)
      ? Math.min(100, Math.round(cpuLoad.currentLoad * 10) / 10)
      : 0;

  const memTotal = mem.total || 1;
  const memUsed = mem.used || 0;
  const memUsedPct = Math.round((memUsed / memTotal) * 1000) / 10;

  const nets = Array.isArray(networkStats) ? networkStats : [];
  const netRows = nets
    .filter((n) => n && n.iface && !/^lo/i.test(n.iface) && !/^Loopback/i.test(n.iface))
    .map((n) => ({
      iface: n.iface,
      rxSec: Math.round((n.rx_sec || 0) * 8) / 8,
      txSec: Math.round((n.tx_sec || 0) * 8) / 8
    }));

  const disks = (fsSize || []).map((d) => ({
    fs: d.fs || "",
    mount: d.mount || "",
    type: d.type || "",
    size: d.size || 0,
    used: d.used || 0,
    use: typeof d.use === "number" ? Math.round(d.use * 10) / 10 : 0
  }));

  const controllers = (graphics && graphics.controllers) || [];
  const gpuList = controllers.slice(0, 4).map((c) => ({
    model: c.model || c.name || "",
    vendor: c.vendor || "",
    vram: c.vram || c.vramDynamic || null,
    utilizationGpu: c.utilizationGpu != null ? c.utilizationGpu : null
  }));

  return {
    cpu: {
      loadPct: cpuPct,
      speedGhz: cpuSpeed.avg ? Math.round(cpuSpeed.avg * 100) / 100 : 0,
      brand: cpuInfo.brand || "",
      cores: cpuInfo.cores || 0,
      physicalCores: cpuInfo.physicalCores || 0
    },
    mem: {
      total: memTotal,
      used: memUsed,
      available: mem.available || 0,
      usedPct: memUsedPct
    },
    disks,
    networks: netRows,
    gpus: gpuList,
    ts: Date.now()
  };
}

const SKIP_IFACE = /^(lo|loopback|docker|veth|br-|vmware|virtualbox|hyper-v|npcap|wintun|tailscale|zerotier)/i;

function isUsefulIface(name) {
  if (!name) return false;
  return !SKIP_IFACE.test(name);
}

async function buildTrafficRank() {
  const sampleMs = 1000;

  const stats1 = await withTimeout(() => si.networkStats("*").catch(() => []), 5000, []);

  await new Promise((r) => setTimeout(r, sampleMs));

  const stats2 = await withTimeout(() => si.networkStats("*").catch(() => []), 5000, []);

  const map2 = new Map((Array.isArray(stats2) ? stats2 : []).map((s) => [s.iface, s]));
  const interfaces = (Array.isArray(stats1) ? stats1 : [])
    .filter((s) => s && isUsefulIface(s.iface))
    .map((s1) => {
      const s2 = map2.get(s1.iface) || s1;
      const ms = Math.max(sampleMs, (s2.ms || sampleMs));
      const rxSec = Math.max(0, Math.round(((s2.rx_bytes || 0) - (s1.rx_bytes || 0)) * 1000 / ms));
      const txSec = Math.max(0, Math.round(((s2.tx_bytes || 0) - (s1.tx_bytes || 0)) * 1000 / ms));
      return {
        name: s1.iface,
        rxSec,
        txSec,
        totalSec: rxSec + txSec,
        bytesRecv: s2.rx_bytes || 0,
        bytesSent: s2.tx_bytes || 0,
        bytesTotal: (s2.rx_bytes || 0) + (s2.tx_bytes || 0)
      };
    })
    .filter((r) => r.totalSec > 0 || r.bytesRecv > 0 || r.bytesSent > 0)
    .sort((a, b) => b.totalSec - a.totalSec);

  const procTraffic = await getProcessTraffic(sampleMs, si);

  const totalRecv = interfaces.reduce((s, n) => s + (n.bytesRecv || 0), 0);
  const totalSent = interfaces.reduce((s, n) => s + (n.bytesSent || 0), 0);

  return {
    interfaces,
    processes: procTraffic.processes,
    processTrafficMethod: procTraffic.method,
    processTrafficNote: procTraffic.note,
    totals: {
      bytesRecv: totalRecv,
      bytesSent: totalSent,
      bytesTotal: totalRecv + totalSent
    },
    sampleMs,
    ts: Date.now()
  };
}

ipcMain.handle("sysmon:get-traffic-rank", async () => {
  try {
    const data = await withTimeout(buildTrafficRank(), 20000, null);
    if (!data) {
      return { ok: false, error: "采集超时，请稍后重试。" };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("sysmon:get-stats", async () => {
  try {
    const data = await withTimeout(buildSnapshot(), 25000, null);
    if (!data) {
      return {
        ok: false,
        error: "采集超时（本机 WMI/网卡信息响应过慢）。请稍后重试，或重启桌面版后再试。"
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

app.whenReady().then(() => {
  setChineseApplicationMenu();
  createWindow();
  /** 后台预热 CPU 型号信息，避免首次打开监控时与磁盘/GPU 采集叠在一起 */
  withTimeout(() => si.cpu(), 8000, null).then((c) => {
    if (c && typeof c === "object") cachedCpuStatic = c;
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
