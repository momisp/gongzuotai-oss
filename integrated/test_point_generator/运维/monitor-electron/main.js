const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  dialog,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { URL } = require("url");
const {
  fetchPeerCertificateFromHttpsUrl,
  formatCertDistinguishedName,
} = require("./certTls.js");
const {
  runDailyInspection,
  registerInspectionRecordsIpc,
  openInspectionRecordsWindow,
} = require("./dailyInspect.js");

let shellWin = null;
/** @type {Map<string, BrowserWindow>} partitionKey -> 大窗 */
const panelByAccount = new Map();
/** 本机曾打开过的控制台分区（含已关闭的大窗），退出时一并 flush，避免只关了窗口丢分区未写入 */
const knownOpsPartitionKeys = new Set();
/** 磁吸时左右排列顺序（partitionKey） */
const accountOrder = [];

let snapEnabled = true;
let snapTimer = null;

/** 生成 session partition 用的安全 key（与 account 一一对应） */
function partitionKeyForAccount(account) {
  const raw = (account && String(account).trim()) || "default";
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "default";
  return safe;
}

/** 默认 UA 含 “Electron”，部分站点会区别对待；与同内核 Chrome 对齐利于控制台会话稳定 */
let cachedChromeLikeUA;
function chromeLikeUserAgent() {
  if (cachedChromeLikeUA) return cachedChromeLikeUA;
  const chrome = process.versions.chrome || "";
  const ver = chrome || "131.0.0.0";
  const platformBits =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10_15_7"
      : process.platform === "win32"
        ? "Windows NT 10.0; Win64; x64"
        : "X11; Linux x86_64";
  cachedChromeLikeUA = `Mozilla/5.0 (${platformBits}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
  return cachedChromeLikeUA;
}

function ensureChromeLikeUaForOpsPartition(pKey) {
  try {
    session.fromPartition(`persist:ops-${pKey}`).setUserAgent(chromeLikeUserAgent());
  } catch (_) {
    /* ignore */
  }
}

/** 阿里云等站点常把 SSO 记在 localStorage；仅 flush Cookie 仍会掉登录 */
function flushSessionsDomStorageToDisk() {
  const sessDone = new Set();
  /** @param {Electron.Session | null | undefined} s */
  function one(s) {
    if (!s) return;
    try {
      if (sessDone.has(s)) return;
      sessDone.add(s);
      s.flushStorageData();
    } catch (_) {
      /* ignore */
    }
  }
  for (const bw of BrowserWindow.getAllWindows()) {
    try {
      if (!bw.isDestroyed()) one(bw.webContents.session);
    } catch (_) {
      /* ignore */
    }
  }
  one(session.defaultSession);
  for (const key of knownOpsPartitionKeys) {
    one(session.fromPartition(`persist:ops-${key}`));
  }
}

async function flushAllCookieStores() {
  const tasks = [session.defaultSession.cookies.flushStore()];
  for (const key of knownOpsPartitionKeys) {
    tasks.push(session.fromPartition(`persist:ops-${key}`).cookies.flushStore());
  }
  await Promise.all(tasks.map((p) => p.catch(() => {})));
}

function snapAllPanelsToShell() {
  if (!snapEnabled) return;
  if (!shellWin || shellWin.isDestroyed()) return;
  const b = shellWin.getBounds();
  let x = b.x + b.width;
  for (const key of accountOrder) {
    const w = panelByAccount.get(key);
    if (!w || w.isDestroyed() || !w.isVisible()) continue;
    const wb = w.getBounds();
    const wid = Math.max(wb.width, 720);
    w.setBounds({ x, y: b.y, width: wid, height: b.height }, false);
    x += wid;
  }
}

function scheduleSnapPanel() {
  if (!snapEnabled) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => snapAllPanelsToShell(), 80);
}

function wireShellSnapHandlers() {
  if (!shellWin || shellWin.isDestroyed()) return;
  shellWin.removeAllListeners("move");
  shellWin.removeAllListeners("resize");
  shellWin.on("move", scheduleSnapPanel);
  shellWin.on("resize", scheduleSnapPanel);
}

function getOrCreatePanelForAccount(rawAccount) {
  const pKey = partitionKeyForAccount(rawAccount);
  knownOpsPartitionKeys.add(pKey);
  ensureChromeLikeUaForOpsPartition(pKey);
  let w = panelByAccount.get(pKey);
  if (w && !w.isDestroyed()) return w;

  const label = (rawAccount && String(rawAccount).trim()) || "默认";
  w = new BrowserWindow({
    width: 1100,
    height: 880,
    show: false,
    title: `阿里云 · ${label}`,
    webPreferences: {
      partition: `persist:ops-${pKey}`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  w.on("closed", () => {
    panelByAccount.delete(pKey);
    const i = accountOrder.indexOf(pKey);
    if (i >= 0) accountOrder.splice(i, 1);
    setTimeout(() => snapAllPanelsToShell(), 50);
  });
  /** 标题栏：网页原标题 + 「 · 主体账号」 */
  w.opsAccountLabel = label;
  const applyPanelTitle = (pageTitle) => {
    const base = pageTitle || "阿里云控制台";
    const suffix = w.opsAccountLabel ? ` · ${w.opsAccountLabel}` : "";
    if (!w.isDestroyed()) w.setTitle(base + suffix);
  };
  w.webContents.on("page-title-updated", (_e, pageTitle) => {
    applyPanelTitle(pageTitle);
  });
  w.webContents.on("did-finish-load", () => {
    applyPanelTitle(w.webContents.getTitle());
  });
  panelByAccount.set(pKey, w);
  return w;
}

function getAllAccountPanels() {
  return Array.from(panelByAccount.values()).filter(
    (win) => win && !win.isDestroyed(),
  );
}

/** 中文顶部菜单（取代默认英文 File / Edit …） */
function buildApplicationMenu() {
  const isMac = process.platform === "darwin";

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about", label: "关于" },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: "隐藏 " + app.name },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    });
  }

  template.push({
    label: "文件",
    submenu: isMac
      ? [{ role: "close", label: "关闭窗口" }]
      : [{ role: "quit", label: "退出" }],
  });

  template.push({
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
          ]
        : [{ role: "delete", label: "删除" }, { role: "selectAll", label: "全选" }]),
    ],
  });

  template.push({
    label: "视图",
    submenu: [
      { role: "reload", label: "重新加载" },
      { role: "forceReload", label: "强制重新加载" },
      { role: "toggleDevTools", label: "开发者工具" },
      { type: "separator" },
      { role: "resetZoom", label: "实际大小" },
      { role: "zoomIn", label: "放大" },
      { role: "zoomOut", label: "缩小" },
      { type: "separator" },
      { role: "togglefullscreen", label: "全屏" },
    ],
  });

  template.push({
    label: "窗口",
    submenu: [
      { role: "minimize", label: "最小化" },
      { role: "zoom", label: isMac ? "缩放" : "最大化" },
      ...(isMac ? [{ type: "separator" }, { role: "front", label: "前置全部窗口" }] : []),
      { role: "close", label: "关闭" },
    ],
  });

  template.push({
    label: "运维",
    submenu: [
      {
        label: "每日巡检",
        click: async () => {
          await runDailyInspection({
            getShell: () => shellWin,
            getAccountPanels: () => getAllAccountPanels(),
          });
        },
      },
      {
        label: "运维巡检记录",
        click: () => {
          openInspectionRecordsWindow(shellWin);
        },
      },
      { type: "separator" },
      {
        label: "侧栏与大窗磁吸排布",
        type: "checkbox",
        checked: snapEnabled,
        click: (mi) => {
          snapEnabled = !!mi.checked;
          if (snapEnabled) snapAllPanelsToShell();
        },
      },
    ],
  });

  template.push({
    label: "帮助",
    submenu: [
      {
        label: "关于本程序",
        click: async () => {
          await dialog.showMessageBox({
            type: "info",
            title: "关于",
            message: "运维监控 · Electron 外壳",
            detail:
              "不同「主体账号」使用独立会话窗口，Cookie 互不干扰，可同时保持多账号登录。",
          });
        },
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * 退出前持久化会话：
 * - session.flushStorageData：localStorage / SessionStorage 等 DOM 存储落盘（阿里云 SSO 常依赖）
 * - cookies.flushStore：Cookie 立即写盘
 * - 再短暂等待，最后 app.quit（勿用 process.exit/app.exit）
 *
 * 注意：勿把 before-quit 写成 async——Electron 不会等待异步完成，易出现「preventDefault 后仍会提前退出 /
 * 与用户数据未写完」。（见 electron issues / 手册：须在同步处理器里调用 preventDefault，再用 Promise 收尾。）
 */
let isGraceQuit = false;
app.on("before-quit", (event) => {
  if (isGraceQuit) return;
  event.preventDefault();
  isGraceQuit = true;

  flushSessionsDomStorageToDisk();
  flushAllCookieStores()
    .then(() => new Promise((r) => setTimeout(r, 1200)))
    .catch(() => {})
    .finally(() => {
      app.quit();
    });
});

/** 兜底：将要退出时再同步刷 DOM 存储（cookie 已由 before-quit 链尽量 flush） */
app.on("will-quit", () => {
  try {
    flushSessionsDomStorageToDisk();
  } catch (_) {
    /* ignore */
  }
});

function createShellWindow() {
  shellWin = new BrowserWindow({
    width: 300,
    height: 720,
    minWidth: 260,
    minHeight: 400,
    title: "运维监控指标",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  shellWin.loadFile(path.join(__dirname, "renderer.html"));
  wireShellSnapHandlers();
}

ipcMain.handle("read-metrics", async () => {
  const p = path.join(__dirname, "metrics.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
});

function remarksFilePath() {
  const shared = path.resolve(__dirname, "..", "..", "..", "..", "data", "metric_remarks.json");
  if (fs.existsSync(shared)) return shared;
  return path.join(app.getPath("userData"), "metric-remarks.json");
}

/**
 * 使用系统独立消息框（不挂 parent），避免 Windows 上对侧栏外壳窗口模态阻塞导致无法点开「运维」菜单。
 */
async function showHttpsCertExpiryDialog(httpsUrl) {
  try {
    const cert = await fetchPeerCertificateFromHttpsUrl(httpsUrl);
    const host = new URL(httpsUrl).hostname;
    const issuedTo = formatCertDistinguishedName(cert.subject);
    const issuedBy = formatCertDistinguishedName(cert.issuer);
    const fromTs = cert.valid_from
      ? new Date(cert.valid_from).toLocaleString("zh-CN", { hour12: false })
      : String(cert.valid_from || "—");
    const toTs = cert.valid_to
      ? new Date(cert.valid_to).toLocaleString("zh-CN", { hour12: false })
      : String(cert.valid_to || "—");

    await dialog.showMessageBox({
      type: "info",
      title: "HTTPS 证书（与服务端握手读取）",
      message: `${host}`,
      detail: [
        `颁发对象：`,
        `${issuedTo}`,
        ``,
        `颁发者：`,
        `${issuedBy}`,
        ``,
        `有效期起始：`,
        `${fromTs}`,
        ``,
        `截止日期：`,
        `${toTs}`,
        ``,
        `说明：Chromium/Electron 无法由程序直接打开内置「证书查看者」窗口，此处内容与浏览器核对证书时一致（均为服务端返回的 PEM）。若报错请检查证书链、系统时间或被代理/MITM。`,
      ].join("\n"),
    });
  } catch (e) {
    await dialog.showMessageBox({
      type: "warning",
      title: "读取证书失败",
      message: String(e && e.message ? e.message : e),
      detail: `${httpsUrl}\n\n若为自签名或私有 CA，可把 certTls.js 中 rejectUnauthorized 临时改为 false 仅作调试（不推荐长期使用）。`,
    });
  }
}

function readRemarksMap() {
  try {
    const p = remarksFilePath();
    if (!fs.existsSync(p)) return {};
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return typeof j === "object" && j !== null ? j : {};
  } catch {
    return {};
  }
}

function writeRemarksMap(obj) {
  fs.writeFileSync(remarksFilePath(), JSON.stringify(obj, null, 2), "utf8");
}

ipcMain.handle("get-remark", (_evt, id) => {
  if (!id) return "";
  return String(readRemarksMap()[id] || "");
});

ipcMain.handle("save-remark", (_evt, payload) => {
  const id = payload && payload.id ? String(payload.id) : "";
  if (!id) return false;
  const text = payload.text != null ? String(payload.text) : "";
  const all = readRemarksMap();
  all[id] = text;
  writeRemarksMap(all);
  return true;
});

ipcMain.on("open-metric", (_evt, payload) => {
  const url = typeof payload === "string" ? payload : payload?.url;
  const account =
    typeof payload === "object" && payload != null
      ? String(payload.account || "")
      : "";
  const openCertExpiry =
    typeof payload === "object" &&
    payload != null &&
    !!payload.openCertExpiry;

  if (!url || typeof url !== "string") return;

  const pKey = partitionKeyForAccount(account);
  if (!accountOrder.includes(pKey)) accountOrder.push(pKey);

  const w = getOrCreatePanelForAccount(account);
  w.loadURL(url);
  w.show();
  w.focus();
  setTimeout(() => snapAllPanelsToShell(), 120);

  if (openCertExpiry) {
    void showHttpsCertExpiryDialog(url);
  }
});

ipcMain.on("open-external", (_evt, url) => {
  if (!url || typeof url !== "string") return;
  shell.openExternal(url);
});

app.whenReady().then(() => {
  registerInspectionRecordsIpc();
  if (process.env.OPS_DEBUG) {
    console.log("[ops-monitor-shell] userData =", app.getPath("userData"));
  }
  createShellWindow();
  buildApplicationMenu();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createShellWindow();
      buildApplicationMenu();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
