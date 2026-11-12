/**
 * 每日巡检：
 * - 无 config.yaml：基于「已打开的大窗」截图 + metrics.json 中带 openCertExpiry 的 HTTPS 证书页快照 + 页面信息生成报告并发钉钉文字简报（不需 AK；截图仅落本地/Excel）
 * - 有 config.yaml：额外跑 auto-inspection(API)，与浏览器快照合并后推送
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  app,
  dialog,
  BrowserWindow,
  shell,
  ipcMain,
} = require("electron");
const {
  fetchPeerCertificateFromHttpsUrl,
  formatCertDistinguishedName,
} = require("./certTls.js");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function runCmd(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ out, err, code });
      else
        reject(
          new Error(
            `命令退出码 ${code}\n${err || ""}\n${out || ""}`.trim() || "未知错误",
          ),
        );
    });
  });
}

function runCmdAllowCodes(executable, args, options, okCodes) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (okCodes.includes(code)) resolve({ out, err, code });
      else
        reject(
          new Error(
            `命令退出码 ${code}\n${err || ""}\n${out || ""}`.trim() || "未知错误",
          ),
        );
    });
  });
}

function findLatestReportMd(logsDir) {
  if (!fs.existsSync(logsDir)) return null;
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("report_") && f.endsWith(".md"))
    .map((f) => ({
      f,
      t: fs.statSync(path.join(logsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(logsDir, files[0].f) : null;
}

/** @returns {{ id?: string; name?: string; account?: string; url?: string; openCertExpiry?: boolean }[]} */
function loadAllMetrics() {
  try {
    const p = path.join(__dirname, "metrics.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j.metrics) ? j.metrics : [];
  } catch {
    return [];
  }
}

function normalizeComparableUrl(raw) {
  try {
    const u = new URL(String(raw || "").trim());
    let pth = u.pathname.replace(/\/+$/, "");
    const host = u.hostname.toLowerCase();
    if (!host) return "";
    return `${host}${pth}`;
  } catch {
    return "";
  }
}

/**
 * 控制台当前 URL → metrics.json 中「入口 url」前缀最长匹配的一条（便于归入台账行）
 * @param {string} pageUrl
 */
function findMetricForPanelUrl(pageUrl, metrics) {
  const p = normalizeComparableUrl(pageUrl);
  if (!p) return null;
  /** @type {null | typeof metrics[number]} */
  let best = null;
  let bestLen = -1;
  /** @type {string} */
  let pageHost = "";
  try {
    pageHost = new URL(String(pageUrl).trim()).hostname.toLowerCase();
  } catch {
    pageHost = "";
  }
  for (const m of metrics) {
    if (!m || !m.url) continue;
    const mu = normalizeComparableUrl(m.url);
    if (!mu) continue;
    if (p === mu || p.startsWith(`${mu}/`)) {
      const score = mu.length;
      if (score > bestLen) {
        bestLen = score;
        best = m;
      }
    }
  }
  if (best) return best;
  if (pageHost) {
    const cand = metrics.filter((m) => {
      try {
        return (
          !!m.url &&
          new URL(String(m.url).trim()).hostname.toLowerCase() === pageHost
        );
      } catch {
        return false;
      }
    });
    if (cand.length === 1) return cand[0];
  }
  return null;
}

/** @returns {(null|string|number|boolean)[][] | null} */
function loadDomainRowsFromRepo() {
  const p = path.join(repoRoot(), "domain-inventory.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    let rows = j.domainRows ?? j.rows;
    if (!Array.isArray(rows)) return null;
    rows = rows.filter((r) => Array.isArray(r));
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

/**
 * metrics 台账与本番抓拍（控制台 / HTTPS 证书）对齐
 * @param {{kind:string;metricId?:string;path?:null|string;panel?:import("electron").BrowserWindow|null;host?:string;certValidToZh?:string;error?:string}[]} captures
 */
function buildInventoryAttachments(captures, allMetrics) {
  /** @type {Record<string, { screenshotPath?: string; httpsExpiry?: string; inspectNote?: string }>} */
  const byId = {};

  /** @param {string} mid */
  function touch(mid) {
    if (!mid) return null;
    if (!byId[mid]) byId[mid] = {};
    return byId[mid];
  }

  for (const c of captures) {
    if (c.kind === "panel" && c.panel) {
      let pageUrl = "";
      try {
        if (!c.panel.isDestroyed())
          pageUrl = c.panel.webContents.getURL() || "";
      } catch (_) {
        pageUrl = "";
      }
      const m = findMetricForPanelUrl(pageUrl, allMetrics);
      const mid = m && m.id != null ? String(m.id) : "";
      const slot = touch(mid);
      if (slot && c.path && typeof c.path === "string")
        slot.screenshotPath = c.path;
    } else if (c.kind === "cert" && c.metricId != null && c.metricId !== "") {
      const slot = touch(String(c.metricId));
      if (!slot) continue;
      if (c.path) slot.screenshotPath = c.path;
      if (c.certValidToZh) slot.httpsExpiry = c.certValidToZh;
      if (c.host) slot.inspectNote = `域名 ${c.host}`;
    } else if (c.kind === "cert_error" && c.metricId != null && c.metricId !== "") {
      const slot = touch(String(c.metricId));
      if (!slot) continue;
      const err = String(c.error || "证书读取失败");
      slot.inspectNote = slot.inspectNote
        ? `${slot.inspectNote}；${err}`
        : err;
    }
  }
  return byId;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 生成与侧栏「证书」弹窗风格接近的页面并截图，供 Excel 报告路径引用（钉钉侧默认不再发图）。
 */
async function captureHttpsCertPagePng(shotsDir, stamp, index, metricName, httpsUrl, cert) {
  const host = new URL(httpsUrl).hostname;
  const issuedTo = formatCertDistinguishedName(cert.subject);
  const issuedBy = formatCertDistinguishedName(cert.issuer);
  const fromTs = cert.valid_from
    ? new Date(cert.valid_from).toLocaleString("zh-CN", { hour12: false })
    : String(cert.valid_from || "—");
  const toTs = cert.valid_to
    ? new Date(cert.valid_to).toLocaleString("zh-CN", { hour12: false })
    : String(cert.valid_to || "—");

  const title = `${escapeHtml(metricName)} · HTTPS 证书`;
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>` +
    `*{box-sizing:border-box}body{margin:0;background:#6b6b6b;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:Segoe UI,Microsoft Yahei,sans-serif;color:#222}` +
    `.card{width:492px;background:#fefefe;border-radius:10px;padding:26px 30px;border:2px solid #e2e6eb;}` +
    `.t{font-weight:680;font-size:18px;color:#323232;margin-bottom:12px;line-height:1.45}` +
    `.h{font-size:21px;color:#646464;margin-bottom:18px;line-height:1.35;text-align:center}` +
    `.k{color:#757575;line-height:1.75;font-size:14px;} .v{font-weight:400;color:#2b2e33}` +
    `.line{margin:10px 0 14px;color:#ccc;height:2px;background:#eaeaea;width:98%}` +
    `.foot{margin-top:16px;line-height:1.55;color:#9a9a9a;font-size:12px}` +
    `.tag{display:inline-block;padding:6px 10px;background:#eaf3fb;color:#3567b5;border-radius:6px;margin-bottom:8px;font-size:13px}` +
    `</style></head><body><div class="card"><div class="tag">与服务端握手读取</div>` +
    `<div class="t">${title}</div>` +
    `<div class="h">${escapeHtml(host)}</div>` +
    `<div><div class="k">颁发对象</div><div class="v">${escapeHtml(issuedTo)}</div></div>` +
    `<div class="line"></div>` +
    `<div><div class="k">颁发者</div><div class="v">${escapeHtml(issuedBy)}</div></div>` +
    `<div class="line"></div>` +
    `<div><div class="k">有效期起始</div><div class="v">${escapeHtml(fromTs)}</div></div>` +
    `<div style="margin-top:10px;"><div class="k">截止日期</div><div class="v">${escapeHtml(toTs)}</div></div>` +
    `<div class="foot">说明：内容与浏览器核对证书时一致（PEM）；若报错请排查证书链、系统时间或被代理/MITM。</div>` +
    `</div></body></html>`;

  const win = new BrowserWindow({
    width: 560,
    height: 620,
    show: false,
    backgroundColor: "#6b6b6b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 120));
    let img = await win.webContents.capturePage();
    try {
      const { width, height } = img.getSize();
      const maxW = 960;
      if (width > maxW && height > 0) {
        const tw = maxW;
        const th = Math.max(1, Math.round((height * maxW) / width));
        img = img.resize({ width: tw, height: th });
      }
    } catch (_) {
      /* keep original */
    }
    const picPath = path.join(shotsDir, `cert-${stamp}-${index}.jpg`);
    fs.writeFileSync(picPath, img.toJPEG(70));
    return picPath;
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

/**
 * 无 OpenAPI ECS 快照时仍为钉钉拼装「简报体」短文（与含 ECS 时同级字段 manifest.dingTalkBriefText）。
 * @param {string} reportTitle
 * @param {{ kind: string }[]} captures
 */
function buildBrowserOnlyDingTalkBrief(reportTitle, captures) {
  const panels = captures.filter((c) => c.kind === "panel");
  const certs = captures.filter((c) => c.kind === "cert");
  const certErrs = captures.filter((c) => c.kind === "cert_error");

  const lines = [
    `【${reportTitle}】`,
    "",
    "1. 实例总数：本轮为控制台页面 + HTTPS/TLS（未跑 API ECS/云监控时无云监控取值）。详情请查 Excel「巡检摘要 / Sheet1」及截图路径列。",
    "",
    "2. 核心指标概览（本地快照已生成，钉钉仅推送本简报不写图）：",
    `   • 控制台窗口快照：${panels.length} 张`,
    `   • HTTPS 证书快照：${certs.length} 项`,
  ];
  if (certErrs.length) {
    lines.push(`   • 证书读取失败：${certErrs.length} 项`);
  }
  lines.push("", "3. 重点问题：");
  if (certErrs.length) {
    for (const c of certErrs) {
      const nm = String(c.metricName || "HTTPS/TLS").trim();
      lines.push(`   • 「${nm}」${String(c.error || "").trim() || "读取失败"}`);
    }
    lines.push("   （过程与抓拍顺序见 Excel「巡检过程明细」及台账中的截图路径。）");
  } else {
    lines.push("   未发现证书抓取失败条目；过程与快照路径见 Excel「巡检过程明细 / 巡检摘要」。");
  }
  lines.push(
    "",
    "4. 次日计划：维持登录态下例行巡检；云监控简报需启用运维/auto-inspection/config.yaml（AK 放环境变量）并在本机可调通 DescribeMetricLast。",
  );
  return lines.join("\n");
}

/** 巡检记录 Excel 存放目录（与每日巡检导出一致）。 */
function inspectionExcelDir() {
  return path.join(app.getPath("userData"), "ops-snapshots");
}

/** 枚举本地巡检导出 xlsx（新→旧）。 */
function listInspectionExcelRecords() {
  const dir = inspectionExcelDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".xlsx")) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch (_) {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({
      name,
      path: full,
      mtimeMs: st.mtimeMs,
      mtimeZh: new Date(st.mtimeMs).toLocaleString("zh-CN", { hour12: false }),
    });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

let inspectionRecordsIpcRegistered = false;

function registerInspectionRecordsIpc() {
  if (inspectionRecordsIpcRegistered) return;
  inspectionRecordsIpcRegistered = true;

  ipcMain.handle("ops-inspection-records:list", () =>
    listInspectionExcelRecords(),
  );
  ipcMain.handle("ops-inspection-records:open", async (_e, fp) => {
    if (!fp || typeof fp !== "string") return "路径无效";
    const errText = await shell.openPath(fp);
    return errText || "";
  });
  ipcMain.handle("ops-inspection-records:reveal", (_e, fp) => {
    if (!fp || typeof fp !== "string") return;
    try {
      shell.showItemInFolder(fp);
    } catch (_) {
      /* ignore */
    }
  });
}

/**
 * @param {import("electron").BrowserWindow | null} parent
 */
function openInspectionRecordsWindow(parent) {
  registerInspectionRecordsIpc();
  const win = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: !!(parent && !parent.isDestroyed()),
    width: 720,
    height: 520,
    minimizable: true,
    maximizable: true,
    title: "运维巡检记录",
    webPreferences: {
      preload: path.join(__dirname, "inspection-records-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "inspection-records.html"));
}

/**
 * @param {import("electron").BrowserWindow[]} panels
 * @param {{
 *   kind: "panel" | "cert" | "cert_error";
 *   path?: string | null;
 *   panel?: import("electron").BrowserWindow | null;
 *   metricName?: string;
 *   metricId?: string;
 *   url?: string;
 *   host?: string;
 *   error?: string;
 *   certValidToZh?: string;
 * }[]} captures
 */
function buildBrowserSnapshotMarkdown(panels, captures) {
  const t = new Date().toLocaleString("zh-CN", { hour12: false });
  const lines = [
    "# 浏览器巡检 · 已登录控制台",
    "",
    `**生成时间**：${t}`,
    "",
    "说明：以下为当前 Electron **各主体大窗**页面与 **HTTPS 证书页（握手读取）** 的信息；对应截图路径写入 Excel「巡检过程明细」列，本地 Markdown 中与下列小节顺序一致。",
    "",
  ];
  if (!captures.length) {
    lines.push("_当前没有可截取的条目。请先点击侧栏打开控制台并保持窗口可见，或在 metrics.json 中配置 HTTPS 巡检项。_");
    return lines.join("\n");
  }
  captures.forEach((c, i) => {
    const n = i + 1;
    if (c.kind === "cert") {
      lines.push(`## ${n}. ${c.metricName || "HTTPS证书"}（握手读取快照）`);
      lines.push(`- **域名**：${c.host || "—"}`);
      lines.push(`- **入口 URL**：${c.url || "—"}`);
      lines.push("");
      return;
    }
    if (c.kind === "cert_error") {
      lines.push(`## ${n}. ${c.metricName || "HTTPS证书"}（读取失败）`);
      lines.push(`- **入口 URL**：${c.url || "—"}`);
      lines.push(`- **错误**：${c.error || "未知错误"}`);
      lines.push("");
      return;
    }
    const p = c.panel;
    let url = "";
    let winTitle = "";
    try {
      if (p && !p.isDestroyed()) {
        url = p.webContents.getURL() || "";
        winTitle = (p.getTitle && p.getTitle()) || "";
      }
    } catch (_) {
      /* ignore */
    }
    const acc = p && p.opsAccountLabel ? String(p.opsAccountLabel) : "—";
    lines.push(`## ${n}. 控制台窗口 · 主体 ${acc}`);
    lines.push(`- **窗口标题**：${winTitle}`);
    lines.push(`- **页面地址**：${url}`);
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * @param {{ getShell: () => Electron.BrowserWindow | null, getAccountPanels?: () => Electron.BrowserWindow[] }} w
 */
async function runDailyInspection(w) {
  const root = repoRoot();
  const autoRoot = path.join(root, "auto-inspection");
  const dingDir = path.join(root, "钉钉报告推送");
  const configYaml = path.join(autoRoot, "config.yaml");
  const sendScript = path.join(dingDir, "send_ops_report.py");
  const py = process.env.OPS_PYTHON || "python";
  const hasApiConfig = fs.existsSync(configYaml);

  if (!fs.existsSync(sendScript)) {
    await dialog.showMessageBox({
      type: "error",
      title: "每日巡检",
      message: "未找到钉钉推送脚本",
      detail: dingDir,
    });
    return;
  }

  const envPath = path.join(dingDir, ".env");
  const envPathAlt = path.join(dingDir, "env");
  if (!fs.existsSync(envPath) && !fs.existsSync(envPathAlt)) {
    await dialog.showMessageBox({
      type: "warning",
      title: "每日巡检",
      message: "未找到钉钉 Webhook 配置",
      detail: `请在「钉钉报告推送」目录下创建 .env 或 env，填写 DINGTALK_WEBHOOK（可选 DINGTALK_SECRET）。`,
    });
    return;
  }

  const shotsDir = path.join(app.getPath("userData"), "ops-snapshots");
  fs.mkdirSync(shotsDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const panels =
    w.getAccountPanels && typeof w.getAccountPanels === "function"
      ? w.getAccountPanels()
      : [];

  /** @type {{ kind: string; path?: string | null; panel?: import("electron").BrowserWindow | null; metricName?: string; metricId?: string; url?: string; host?: string; error?: string; certValidToZh?: string }[]} */
  const captures = [];
  let idx = 0;
  for (const panel of panels) {
    if (!panel || panel.isDestroyed() || !panel.isVisible()) continue;
    try {
      const img = await panel.webContents.capturePage();
      let outImg = img;
      try {
        const { width, height } = img.getSize();
        const maxW = 960;
        if (width > maxW && height > 0) {
          const tw = maxW;
          const th = Math.max(1, Math.round((height * maxW) / width));
          outImg = img.resize({ width: tw, height: th });
        }
      } catch (_) {
        outImg = img;
      }
      const picPath = path.join(shotsDir, `panel-${stamp}-${idx}.jpg`);
      fs.writeFileSync(picPath, outImg.toJPEG(68));
      captures.push({ kind: "panel", path: picPath, panel });
      idx += 1;
    } catch (_) {
      /* skip */
    }
  }

  const allMetrics = loadAllMetrics();
  const certMetrics = allMetrics.filter(
    (m) => m && m.openCertExpiry && typeof m.url === "string",
  );
  let certIdx = 0;
  for (const m of certMetrics) {
    const metricName = String(m.name || "HTTPS证书").trim();
    const u = String(m.url || "").trim();
    if (!u.startsWith("https://")) {
      captures.push({
        kind: "cert_error",
        path: null,
        panel: null,
        metricId: m.id != null ? String(m.id) : "",
        metricName,
        url: u,
        host: "",
        error: "证书巡检仅支持 https:// 开头的地址",
      });
      continue;
    }
    try {
      const cert = await fetchPeerCertificateFromHttpsUrl(u);
      const host = new URL(u).hostname;
      const picPath = await captureHttpsCertPagePng(
        shotsDir,
        stamp,
        certIdx,
        metricName,
        u,
        cert,
      );
      const validToZh = cert.valid_to
        ? new Date(cert.valid_to).toLocaleString("zh-CN", { hour12: false })
        : String(cert.valid_to || "");
      captures.push({
        kind: "cert",
        path: picPath,
        panel: null,
        metricId: m.id != null ? String(m.id) : "",
        metricName,
        url: u,
        host,
        certValidToZh: validToZh,
      });
      certIdx += 1;
    } catch (e) {
      captures.push({
        kind: "cert_error",
        path: null,
        panel: null,
        metricId: m.id != null ? String(m.id) : "",
        metricName,
        url: u,
        host: "",
        error: String((e && e.message) || e || "读取失败"),
      });
    }
  }

  const hasHttpsCertConfigured = certMetrics.length > 0;

  if (!captures.length && !hasApiConfig && !hasHttpsCertConfigured) {
    await dialog.showMessageBox({
      type: "warning",
      title: "每日巡检",
      message: "当前无可用条目，且未配置 API / HTTPS 证书巡检项。",
      detail:
        "请先点击侧栏打开至少一个大窗并登录，或在 metrics.json 为某条指标设置 openCertExpiry；也可复制 auto-inspection/config.example.yaml 为 config.yaml 启用 API 巡检。",
    });
    return;
  }

  if (!captures.length && !hasApiConfig) {
    await dialog.showMessageBox({
      type: "warning",
      title: "每日巡检",
      message: "巡检明细为空（未截取到控制台，且证书项全部失败或未配置）。",
      detail:
        "请打开至少一个控制台大窗后重试；若仅有 HTTPS 条目，请检查网络与 TLS 是否正常。",
    });
    return;
  }

  const titleTag = new Date().toISOString().slice(0, 16).replace("T", "-").replace(/:/g, "");
  const reportTitle = `大派对运维日检-${titleTag}`;

  const ecsDashPath = path.join(shotsDir, `ecs-dashboard-${stamp}.json`);

  let browserMd = buildBrowserSnapshotMarkdown(panels, captures);
  /** @type {string | null} */
  let apiReportPath = null;
  /** @type {object | null} */
  let ecsDashboard = null;

  if (hasApiConfig) {
    const dcn = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    const ecsDateCn = `${dcn.getFullYear()}-${pad2(dcn.getMonth() + 1)}-${pad2(dcn.getDate())}`;
    const ecsApiTitle = `大派对应用分组-ECS巡检日报 ${ecsDateCn}`;
    try {
      await runCmdAllowCodes(
        py,
        [
          "-m",
          "inspection.runner",
          "--no-dingtalk",
          "--config",
          configYaml,
          "--title",
          ecsApiTitle,
          "--dashboard-json",
          ecsDashPath,
        ],
        { cwd: autoRoot, env: process.env },
        [0, 1],
      );
      apiReportPath = findLatestReportMd(path.join(autoRoot, "logs"));
    } catch (e) {
      await dialog.showMessageBox({
        type: "error",
        title: "巡检失败",
        message: "执行 auto-inspection 失败（已跳过 API 段落，仅发送浏览器/TLS 快照部分）",
        detail: String(e.message || e),
      });
      apiReportPath = null;
    }
  }

  try {
    if (fs.existsSync(ecsDashPath)) {
      ecsDashboard = JSON.parse(fs.readFileSync(ecsDashPath, "utf8"));
    }
  } catch (_) {
    ecsDashboard = null;
  }

  let finalMdPath = path.join(shotsDir, `report-combined-${stamp}.md`);

  if (apiReportPath && fs.existsSync(apiReportPath)) {
    const apiBody = fs.readFileSync(apiReportPath, "utf8");
    const combined =
      browserMd +
      "\n\n---\n\n# OpenAPI 自动巡检（ECS/云监控）\n\n" +
      apiBody;
    fs.writeFileSync(finalMdPath, combined, "utf8");
  } else {
    fs.writeFileSync(finalMdPath, browserMd, "utf8");
  }

  /** @type {object[]} */
  const manifestRows = [];
  let seq = 0;
  for (const c of captures) {
    seq += 1;
    if (c.kind === "panel") {
      const p = c.panel;
      let url = "";
      let winTitle = "";
      try {
        if (p && !p.isDestroyed()) {
          url = p.webContents.getURL() || "";
          winTitle = (p.getTitle && p.getTitle()) || "";
        }
      } catch (_) {
        /* ignore */
      }
      const subj = p && p.opsAccountLabel ? String(p.opsAccountLabel) : "—";
      manifestRows.push({
        index: seq,
        type: "控制台窗口",
        subject: subj,
        windowTitle: winTitle,
        url,
        image: c.path || "",
        error: "",
      });
    } else if (c.kind === "cert") {
      manifestRows.push({
        index: seq,
        type: "HTTPS证书页",
        subject: c.metricName || "",
        windowTitle: c.host ? `域名 ${c.host}` : "",
        url: c.url || "",
        image: c.path || "",
        error: "",
      });
    } else if (c.kind === "cert_error") {
      manifestRows.push({
        index: seq,
        type: "HTTPS证书页",
        subject: c.metricName || "",
        windowTitle: "",
        url: c.url || "",
        image: "",
        error: c.error || "",
      });
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeTag = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const manifestPath = path.join(shotsDir, `report-manifest-${stamp}.json`);
  /** 对齐《ECS_应用分组巡检简报》命名习惯；详尽版式仍以导出 Excel 为准。 */
  const xlsxFilename = ecsDashboard
    ? `ECS_应用分组巡检简报_${dateTag}_${timeTag}.xlsx`
    : `Daily_Inspection_Report_${dateTag}_${timeTag}.xlsx`;
  const xlsxPath = path.join(shotsDir, xlsxFilename);

  const invAttach = buildInventoryAttachments(captures, allMetrics);
  const inventorySheet = allMetrics.map((m) => {
    const mid = m.id != null ? String(m.id) : "";
    const a = mid ? invAttach[mid] || {} : {};
    return {
      metricId: mid,
      instance: String(m.name || ""),
      account: String(m.account || ""),
      remark: String(m.url || ""),
      ecsCpu: m.ecsCpu != null ? m.ecsCpu : "",
      ecsMemory: m.ecsMemory != null ? m.ecsMemory : "",
      ecsDiskSystem: m.ecsDiskSystem != null ? m.ecsDiskSystem : "",
      ecsDiskData: m.ecsDiskData != null ? m.ecsDiskData : "",
      ecsExpireAt: m.ecsExpireAt != null ? m.ecsExpireAt : "",
      screenshotPath: a.screenshotPath || "",
      httpsExpiry: a.httpsExpiry || "",
      inspectNote: a.inspectNote || "",
    };
  });

  let dingTalkBriefText = "";
  if (ecsDashboard) {
    const b = ecsDashboard.dingTalkBriefText;
    if (b != null && String(b).trim())
      dingTalkBriefText = String(b).trim();
  }
  if (!dingTalkBriefText)
    dingTalkBriefText = buildBrowserOnlyDingTalkBrief(reportTitle, captures);

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        title: reportTitle,
        generatedAt: now.toISOString(),
        generatedAtZh: now.toLocaleString("zh-CN", { hour12: false }),
        dingTalkBriefText,
        rows: manifestRows,
        inventory: inventorySheet,
        domainRows: loadDomainRowsFromRepo(),
        ecsDashboard,
      },
      null,
      2,
    ),
    "utf8",
  );

  const sendArgs = [
    sendScript,
    "--title",
    reportTitle,
    "--notes",
    finalMdPath,
    "--manifest-json",
    manifestPath,
    "--excel",
    xlsxPath,
    "--no-images",
  ];

  try {
    await runCmd(py, sendArgs, { cwd: dingDir, env: process.env });
  } catch (e) {
    await dialog.showMessageBox({
      type: "error",
      title: "钉钉发送失败",
      message: String(e.message || e),
      detail:
        "请确认钉钉报告推送目录已 pip install -r requirements.txt（含 openpyxl），且 env / .env 中 Webhook 正确。",
    });
    return;
  }

  await dialog.showMessageBox({
    type: "info",
    title: "每日巡检",
    message: `已完成并推送到钉钉；已生成本地 Excel（含日期后缀）。`,
    detail:
      (captures.filter((x) => x.path).length
        ? `本地已保存快照 ${captures.filter((x) => x.path).length} 张（写入 Excel/Markdown）。钉钉本次仅推送文字简报。`
        : "无快照文件。") +
      (hasApiConfig && apiReportPath ? " 已合并 API 巡检结果。" : " 当前主要为浏览器/TLS 巡检。") +
      `\n\nExcel：\n${xlsxPath}\n\nMarkdown：\n${finalMdPath}`,
  });

  try {
    shell.showItemInFolder(xlsxPath);
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  runDailyInspection,
  registerInspectionRecordsIpc,
  openInspectionRecordsWindow,
};
