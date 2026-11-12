let tools = [];
let currentTool = "base64-encode";
let modalState = { type: null, editId: null };
let allLinksCache = [];
let activeLinkCategory = "";
let activeLinkSubcategory = "";
let linksNavBound = false;
let allFilePathsCache = [];
let activeFpCategory = "";
let activeFpSubcategory = "";
let fpNavBound = false;
let allPaCache = [];
let activePaProject = "";
let activePaGroup = "";
let activePaDimMode = "env";
let paNavBound = false;
let uploadTargetGroup = "";
let textEditorState = { path: "", name: "" };
let uploadPasteHandler = null;
let uploadPreviewUrl = "";
let imagePreviewState = { path: "", name: "" };
let imageGallery = { items: [], index: 0 };
let imageViewer = { zoom: 1, panX: 0, panY: 0, naturalW: 0, naturalH: 0 };
let imageViewerDragging = false;
let imageViewerDragStart = { x: 0, y: 0, panX: 0, panY: 0 };
let imageViewerEventsBound = false;
const TP_PAGE_SIZE = 100;
let paActiveTab = "assets";
let tpSession = null;
let tpPage = 1;
let loadingDotsTween = null;
let embeddedUrl = "";
let dailyReportPollTimer = null;
let opsReportTl = null;
let opsReportStepTimer = null;
let opsReportStartedAt = 0;
let opsEcsPollTimer = null;
let opsEcsStatusPollTimer = null;
let allQaNotesCache = [];
let activeQaCategory = "";
let qaCatsBound = false;
let projectsCache = [];
let projectOptionsCache = { assetProjects: [], ganttProjects: [] };
let activeProjectId = "";
let activeProjectOverview = null;

const OPS_REPORT_STEPS = [
  { label: "正在加载配置与环境…", progress: 0.22 },
  { label: "正在拉取 ECS 云监控数据…", progress: 0.48 },
  { label: "正在查询证书到期时间…", progress: 0.72 },
  { label: "正在生成 Markdown 与 Excel…", progress: 0.92 },
];

function getSubcategory(item) {
  if (item.subcategory) return item.subcategory;
  if (item.tags && item.tags.length >= 2) return item.tags[1];
  return "默认";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const REPORT_FIELDS = {
  test_report: [
    { key: "project", label: "项目名称" },
    { key: "version", label: "测试版本" },
    { key: "tester", label: "测试人员" },
    { key: "scope", label: "测试范围", type: "textarea" },
    { key: "results_table", label: "结果表格 (Markdown)", type: "textarea", placeholder: "| 模块 | 用例数 | 通过 | 失败 | 阻塞 |" },
    { key: "issues", label: "遗留问题", type: "textarea" },
    { key: "conclusion", label: "结论", type: "textarea" },
  ],
  performance_report: [
    { key: "project", label: "项目名称" },
    { key: "scenario", label: "测试场景" },
    { key: "environment", label: "测试环境", type: "textarea" },
    { key: "results_table", label: "压测结果 (Markdown)", type: "textarea" },
    { key: "conclusion", label: "结论", type: "textarea" },
  ],
  bug_rate_report: [
    { key: "period", label: "统计周期" },
    { key: "total_bugs", label: "总 Bug 数" },
    { key: "fixed", label: "已修复" },
    { key: "open", label: "未修复" },
    { key: "bug_rate", label: "Bug 率" },
    { key: "module_table", label: "模块分布 (Markdown)", type: "textarea" },
    { key: "severity_table", label: "严重程度 (Markdown)", type: "textarea" },
  ],
};

const FORM_SCHEMAS = {
  "file-paths": [
    { key: "name", label: "名称" },
    { key: "path", label: "路径" },
    { key: "type", label: "类型", type: "select", options: ["directory", "file"] },
    { key: "category", label: "分类" },
    { key: "subcategory", label: "子分类" },
    { key: "tags", label: "标签 (逗号分隔)" },
    { key: "note", label: "备注", type: "textarea" },
  ],
  links: [
    { key: "name", label: "名称" },
    { key: "url", label: "网址" },
    { key: "category", label: "分类" },
    { key: "subcategory", label: "子分类" },
    { key: "problem", label: "适合解决什么问题", type: "textarea" },
    { key: "tags", label: "标签 (逗号分隔)" },
  ],
  "project-assets": [
    { key: "name", label: "名称" },
    { key: "project", label: "项目（一级）" },
    { key: "env_group", label: "环境分组（正常模式二级）" },
    { key: "iter_group", label: "迭代分组（迭代维度二级）" },
    { key: "kind", label: "类型", type: "select", options: ["file", "directory", "url"] },
    { key: "path", label: "本地路径（文件/目录）" },
    { key: "url", label: "网址（类型为 url 时填）" },
    { key: "note", label: "说明", type: "textarea" },
    { key: "tags", label: "标签 (逗号分隔)" },
  ],
  commands: [
    { key: "name", label: "名称" },
    { key: "command", label: "命令", type: "textarea" },
    { key: "category", label: "分类" },
    { key: "note", label: "备注", type: "textarea" },
  ],
  "qa-notes": [
    { key: "title", label: "问题标题" },
    { key: "category", label: "分类（如：安卓 / iOS / 联调 / 环境）" },
    { key: "tags", label: "标签 (逗号分隔)" },
    { key: "problem", label: "问题现象 / 复现", type: "textarea", rows: 4 },
    { key: "solution", label: "解决办法", type: "textarea", rows: 6 },
  ],
};

async function api(path, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 0);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const { timeoutMs: _ignore, ...fetchOpts } = opts;
    const res = await fetch("/api/" + path, {
      headers: { "Content-Type": "application/json" },
      ...fetchOpts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller?.signal,
    });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = res.statusText || "request failed";
    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      return { error: `请求超时（>${Math.round(timeoutMs / 1000)}s）` };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function navigate(pageId, extra) {
  const wasOps = document.getElementById("page-ops")?.classList.contains("active");
  if (wasOps && pageId !== "ops") {
    stopOpsModules();
  }
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = document.getElementById("page-" + pageId);
  if (page) {
    page.classList.add("active");
  } else {
    console.warn("navigate: 页面不存在", pageId);
    const home = document.getElementById("page-home");
    if (home) home.classList.add("active");
    alert("页面未加载完整，请强制刷新（Ctrl+F5）后重试");
    return;
  }
  document.querySelector(".main")?.classList.toggle("main-embedded", pageId === "embedded");
  setNavActive({ pageId });
  if (pageId === "home") {
    renderTodayHome();
    if (typeof enhanceHealthWithRuntime === "function") enhanceHealthWithRuntime();
  }
  if (typeof rememberWorkbenchRoute === "function" && pageId && pageId !== "embedded") {
    rememberWorkbenchRoute({ pageId, projectId: activeProjectId || "" });
  }
  if (extra) extra();
}

function setNavActive({ pageId, toolId } = {}) {
  document.querySelectorAll(".nav-item, .nav-sub-item").forEach(n => n.classList.remove("active"));

  if (toolId) {
    document.querySelector(`.nav-item[data-tool-id="${toolId}"]`)?.classList.add("active");
    document.querySelector(`.nav-sub-item[data-tool-id="${toolId}"]`)?.classList.add("active");
    const group = NAV_GROUPS.find(g => g.items.includes(toolId));
    if (group) document.getElementById(`nav-group-${group.id}`)?.classList.add("is-expanded");
    else if (!NAV_GROUPED_IDS.has(toolId)) {
      document.getElementById("nav-group-other")?.classList.add("is-expanded");
    }
    return;
  }

  if (pageId === "home") {
    document.querySelector('.nav-item[data-page="home"]')?.classList.add("active");
    return;
  }

  const nav = document.querySelector(`.nav-item[data-page="${pageId}"], .nav-sub-item[data-page="${pageId}"]`);
  if (nav) {
    nav.classList.add("active");
    const toolFromNav = nav.getAttribute("data-tool-id");
    if (toolFromNav) {
      const group = NAV_GROUPS.find(g => g.items.includes(toolFromNav));
      if (group) document.getElementById(`nav-group-${group.id}`)?.classList.add("is-expanded");
    }
  }
}

function toggleNavGroup(groupId) {
  document.getElementById(`nav-group-${groupId}`)?.classList.toggle("is-expanded");
}

function parseEntry(entry) {
  if (entry.startsWith("builtin:")) return { type: "builtin", id: entry.slice(8) };
  if (entry.startsWith("integrated:")) return { type: "integrated", id: entry.slice(11) };
  return { type: "unknown", id: entry };
}

async function init() {
  const navEl = document.getElementById("nav");
  if (navEl && !navEl.innerHTML.trim()) {
    navEl.innerHTML = `<div class="nav-item" data-page="home">🏠 今日工作台</div><div class="hint" style="padding:8px 12px">正在加载菜单…</div>`;
  }
  const quickGrid = document.getElementById("today-quick-actions");
  if (quickGrid && !quickGrid.innerHTML.trim()) {
    quickGrid.innerHTML = `<p class="hint">正在加载快捷入口…</p>`;
  }
  const projectGrid = document.getElementById("today-project-cards");
  if (projectGrid && !projectGrid.innerHTML.trim()) {
    projectGrid.innerHTML = `<p class="hint">正在加载项目…</p>`;
  }

  try {
    const res = await api("tools", { timeoutMs: 12000 });
    tools = Array.isArray(res) ? res : Array.isArray(res?.tools) ? res.tools : [];
    if (!tools.length && res?.error) {
      console.warn("加载 tools 失败:", res.error);
    }
  } catch (err) {
    console.warn("加载 tools 异常:", err);
    tools = [];
  }

  try {
    renderNav();
  } catch (err) {
    console.error("renderNav 失败:", err);
    if (navEl) {
      navEl.innerHTML = `<div class="nav-item" data-page="home" onclick="navigate('home'); renderTodayHome()">🏠 今日工作台</div>
        <div class="hint" style="padding:8px 12px;color:#b91c1c">菜单加载失败，请 Ctrl+F5 重试</div>`;
    }
  }

  if (typeof bindGlobalSearch === "function") bindGlobalSearch();
  try {
    await renderTodayHome();
  } catch (err) {
    console.error("renderTodayHome 失败:", err);
  }
  if (typeof enhanceHealthWithRuntime === "function") {
    try {
      await enhanceHealthWithRuntime();
    } catch (_) {}
  }
  bindSearch();
  bindConverters();
  bindReportType();
  try {
    await loadAllLists();
  } catch (err) {
    console.warn("loadAllLists:", err);
  }
  try {
    syncAgileSimLlmToSprite();
  } catch (_) {}
}

function openStaticToolsTimeline() {
  const tool = tools.find(t => t.id === "static-tools-web");
  navigate("embedded", () => loadEmbeddedSite("/tools-site/#timeline", (tool?.name || "静态工具网站") + " · 活动时间轴"));
  setNavActive({ toolId: "static-tools-web" });
}

function openTestScriptRemoteInstall() {
  openTool("test-tool");
  showAdbPanel();
}

async function openTestScriptRechargeCallback() {
  openTool("test-tool");
  await launchRechargeCallback();
}

function openCpuMonitorPage() {
  window.open("/cpu-monitor", "_blank", "noopener");
}

function openTool(toolId) {
  if (toolId === "cpu-monitor") {
    openCpuMonitorPage();
    return;
  }
  if (typeof rememberWorkbenchRoute === "function") {
    const ctx = (() => {
      try { return JSON.parse(sessionStorage.getItem("workbench_project_context") || "{}"); } catch (_) { return {}; }
    })();
    rememberWorkbenchRoute({
      toolId,
      projectId: ctx.projectId || activeProjectId || "",
      projectName: ctx.projectName || "",
      assetProjects: ctx.assetProjects || [],
      ganttProjectIds: ctx.ganttProjectIds || [],
    });
  }
  const tool = tools.find(t => t.id === toolId);
  if (!tool) {
    console.warn("openTool: 未找到工具", toolId, tools);
    // 内置页 fallback：tools 未加载完或 tools.json 未同步时仍可跳转
    const builtinPages = {
      "wechat-appeal": loadWechatAppealPage,
      "clipboard-history": loadClipboardPage,
      "region-record": loadRegionRecordPage,
      "timelapse": loadTimelapsePage,
      "auto-qa": loadAutoQaPage,
      "video-swap": loadVideoSwapPage,
      "biz-flow": loadBizFlowPage,
      "wallpaper": loadWallpaperPage,
      "ai-story": loadAiStoryPage,
      "relax-games": loadRelaxGamesPage,
      "test-info": loadTestInfoPage,
      "maker-lab": loadMakerLabPage,
      "network-capture": loadNetworkCapturePage,
    };
    if (builtinPages[toolId]) {
      const pageId = toolId === "clipboard-history" ? "clipboard" : toolId === "test-tool" ? "test-scripts" : toolId;
      navigate(pageId);
      setNavActive({ toolId });
      builtinPages[toolId]();
      return;
    }
    alert("工具未就绪，请刷新页面（Ctrl+F5）后重试");
    return;
  }
  const { type, id } = parseEntry(tool.entry);
  if (type === "builtin") {
    navigate(id);
    setNavActive({ toolId });
    if (id === "ops") startOpsModules();
    if (id === "test-scripts") showTestScriptHub();
    if (id === "qa-notes") renderQaNotesList();
    if (id === "test-info") loadTestInfoPage();
    if (id === "maker-lab") loadMakerLabPage();
    if (id === "projects") loadProjectsCenter();
    if (id === "wallpaper") loadWallpaperPage();
    if (id === "auto-qa") loadAutoQaPage();
    if (id === "video-swap") loadVideoSwapPage();
    if (id === "biz-flow") loadBizFlowPage();
    if (id === "clipboard") loadClipboardPage();
    if (id === "region-record") loadRegionRecordPage();
    if (id === "timelapse") loadTimelapsePage();
    if (id === "wechat-appeal") loadWechatAppealPage();
    if (id === "ai-story") loadAiStoryPage();
    if (id === "relax-games") loadRelaxGamesPage();
    if (id === "network-capture") loadNetworkCapturePage();
  } else if (type === "integrated") {
    openIntegratedTool(id, tool);
  }
}

async function openIntegratedTool(id, tool) {
  const info = await api("integrated/" + id);
  if (info.error) {
    alert(info.error);
    return;
  }
  if (info.web_url) {
    let embedUrl = info.web_url;
    if (id === "agile-sim-demo" || id === "test_point_generator" || id === "data_verify") {
      showPathLoading(
        id === "data_verify"
          ? "数据验证"
          : id === "test_point_generator"
            ? "测试点生成"
            : "敏捷模拟平台"
      );
      const msg = document.getElementById("loading-msg");
      if (msg) {
        msg.textContent =
          id === "data_verify"
            ? "正在启动数据验证（首次约需 30～90 秒，请稍候）…"
            : id === "test_point_generator"
              ? "正在启动测试点生成（首次约需 30～90 秒，请稍候）…"
              : "正在启动敏捷模拟平台（首次约需 30～90 秒，请稍候）…";
      }
      const warm = await api("agile-sim/warmup", { method: "POST" });
      hidePathLoading();
      if (!warm.ok) {
        alert(warm.error || "敏捷模拟平台未就绪，请确认 Node.js 已安装且 5173/5180 端口未被占用。\n若曾单独运行 npm run dev，请先关闭再试。");
        return;
      }
      // 嵌入页须保留 ?embed=…，不能用 warmup 返回的 /agile-sim/
      if (warm.web_url && id === "agile-sim-demo") embedUrl = warm.web_url;
    }
    let embedTitle = tool.name;
    if (id === "test_point_generator") {
      try {
        const ctx = JSON.parse(sessionStorage.getItem("workbench_project_context") || "{}");
        const u = new URL(embedUrl, window.location.origin);
        if (ctx.projectId) u.searchParams.set("projectId", ctx.projectId);
        if (ctx.projectName) u.searchParams.set("projectName", ctx.projectName);
        if (Array.isArray(ctx.ganttProjectIds) && ctx.ganttProjectIds.length) {
          u.searchParams.set("ganttIds", ctx.ganttProjectIds.join(","));
        }
        u.searchParams.set("_ctx", Date.now().toString(36));
        embedUrl = u.pathname + u.search + u.hash;
        if (ctx.projectName) embedTitle = "测试点生成 · " + ctx.projectName;
      } catch (_) {}
    }
    navigate("embedded", () => loadEmbeddedSite(embedUrl, embedTitle));
    setNavActive({ toolId: tool.id });
  } else {
    navigate("integrated", () => loadIntegrated(id, tool.name, info));
    setNavActive({ toolId: tool.id });
  }
}

function embeddedFrameLooksEmpty(doc) {
  if (!doc?.body) return true;
  const root = doc.getElementById("root");
  if (root) {
    if (root.childNodes.length > 0) return false;
    // React 尚未挂载
    return true;
  }
  const text = (doc.body.innerText || "").replace(/\s+/g, "");
  if (text.length > 16) return false;
  return !doc.body.querySelector(".app, .shell, header, main, table, canvas, svg");
}

function collectGanttPrototypesFromStorage(ganttIds) {
  const ids = new Set((ganttIds || []).map(String).filter(Boolean));
  if (!ids.size) return [];
  try {
    const data = JSON.parse(localStorage.getItem("gantt-schedule-v1") || "{}");
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const out = [];
    const seen = new Set();
    for (const p of projects) {
      if (!ids.has(String(p.id))) continue;
      const links = Array.isArray(p.prototypeLinks) ? p.prototypeLinks : [];
      for (const link of links) {
        const url = String((link && link.url) || "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({
          label: String((link && link.label) || "").trim() || url,
          url,
          ganttName: p.name || "",
        });
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

function syncGanttIndexFromLocalStorage() {
  try {
    const data = JSON.parse(localStorage.getItem("gantt-schedule-v1") || "{}");
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (!projects.length) return;
    api("gantt/project-sync", {
      method: "POST",
      body: {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          archived: !!p.archived,
          zentaoExecutionId: p.zentaoExecutionId || null,
          zentaoLabel: p.zentaoLabel || "",
          prototypeLinks: (Array.isArray(p.prototypeLinks) ? p.prototypeLinks : []).filter(
            (l) => l && String(l.url || "").trim()
          ),
          tasks: tasks
            .filter((t) => String(t.projectId) === String(p.id))
            .map((t) => ({
              name: t.name,
              start: t.start,
              end: t.end,
              status: t.status,
            })),
        })),
      },
    }).catch(() => {});
  } catch (_) {}
}

function pushTpContextToFrame(frame, delayMs) {
  window.setTimeout(() => {
    if (!frame || !frame.contentWindow) return;
    try {
      const ctxRaw = sessionStorage.getItem("workbench_project_context");
      const impRaw = sessionStorage.getItem("tp_gen_import");
      if (!ctxRaw && !impRaw) return;
      const context = ctxRaw ? JSON.parse(ctxRaw) : null;
      frame.contentWindow.postMessage(
        {
          type: "workbench-tp-context",
          context,
          importPayload: impRaw ? JSON.parse(impRaw) : null,
          prototypes: collectGanttPrototypesFromStorage(context?.ganttProjectIds),
        },
        "*"
      );
    } catch (_) {}
  }, delayMs || 0);
}

function loadEmbeddedSite(url, title) {
  const absUrl = url.startsWith("http") ? url : new URL(url, window.location.origin).href;
  try {
    if (absUrl.includes("embed=data-verify")) {
      sessionStorage.setItem("workbench_embed", "data-verify");
    } else if (absUrl.includes("embed=standalone-qa")) {
      sessionStorage.setItem("workbench_embed", "standalone-qa");
    } else {
      sessionStorage.removeItem("workbench_embed");
    }
  } catch (_) {}
  embeddedUrl = absUrl;
  document.getElementById("embedded-title").textContent = title;
  const frame = document.getElementById("embedded-frame");
  const fallback = document.getElementById("embedded-fallback");
  if (fallback) fallback.classList.add("hidden");
  if (!frame) return;

  let settled = false;
  const markOk = () => {
    settled = true;
    if (fallback) fallback.classList.add("hidden");
  };
  const markFail = () => {
    if (settled) return;
    if (fallback) fallback.classList.remove("hidden");
  };

  const inspect = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return null; // 尚未就绪
      // 同源代理下可读；若抛错则视为无法检测
      if (!embeddedFrameLooksEmpty(doc)) return true;
      return false;
    } catch (_) {
      // 跨域不可读：对 /agile-sim/ 同源代理通常不会进这里；
      // 若进了，宁可信任已 load，避免误挡真实页面
      return null;
    }
  };

  let tries = 0;
  const poll = window.setInterval(() => {
    tries += 1;
    const r = inspect();
    if (r === true) {
      window.clearInterval(poll);
      window.clearTimeout(failTimer);
      markOk();
    } else if (r === null && tries >= 3) {
      // 无法探测时不误报失败（常见于短暂跨域检查失败）
      window.clearInterval(poll);
      window.clearTimeout(failTimer);
      markOk();
    }
  }, 700);

  const failTimer = window.setTimeout(() => {
    window.clearInterval(poll);
    const r = inspect();
    if (r === false) markFail();
    else markOk();
  }, 22000);

  frame.onload = () => {
    // 给 React 挂载留时间，再连续探测
    window.setTimeout(() => {
      const r = inspect();
      if (r === true) {
        window.clearInterval(poll);
        window.clearTimeout(failTimer);
        markOk();
      }
    }, 1200);
    pushTpContextToFrame(frame, 700);
    pushTpContextToFrame(frame, 1800);
  };
  frame.onerror = () => {
    window.clearInterval(poll);
    window.clearTimeout(failTimer);
    markFail();
  };
  frame.removeAttribute("src");
  frame.src = absUrl;
}

function openEmbeddedInNewTab() {
  if (embeddedUrl) window.open(embeddedUrl, "_blank");
}

function openEmbeddedFromIntegrated(url) {
  const title = document.getElementById("integrated-title").textContent;
  loadEmbeddedSite(url, title);
  navigate("embedded");
}

async function loadIntegrated(name, title, info) {
  if (!info) info = await api("integrated/" + name);
  document.getElementById("integrated-title").textContent = title;
  document.getElementById("integrated-path").textContent = info.abs_path;
  const siteBtn = info.web_url
    ? `<button class="btn primary" onclick="openEmbeddedFromIntegrated('${info.web_url}')">内嵌打开</button>
       <button class="btn" onclick="window.open('${info.web_url}','_blank')">新窗口打开</button>`
    : "";
  const list = document.getElementById("integrated-files");
  list.innerHTML = `
    <div class="item">
      <div class="item-body">
        <div class="item-title">项目目录</div>
        <div class="item-meta"><code>${escapeHtml(info.path)}</code></div>
      </div>
      <div class="item-actions">
        ${siteBtn}
        <button class="btn primary" onclick="openPath('${info.path.replace(/\\/g, "\\\\")}')">打开目录</button>
      </div>
    </div>
    ${info.files.map(f => `
      <div class="item">
        <div class="item-body">
          <div class="item-title">${escapeHtml(f.name)}</div>
          <div class="item-meta"><code>${escapeHtml(f.path)}</code></div>
        </div>
        <div class="item-actions">
          <button class="btn" onclick="openPath('${f.path.replace(/\\/g, "\\\\")}')">打开</button>
        </div>
      </div>`).join("")}
  `;
}

async function loadAllLists() {
  await loadFilePaths();
  await loadLinks();
  await loadProjectAssets();
  await loadQaNotes();
  await refreshDailyReportPanel();
}

/* ---------- QA 问题集 ---------- */

async function loadQaNotes() {
  const items = await api("qa-notes");
  allQaNotesCache = Array.isArray(items) ? items : [];
  renderQaCategoryChips();
  renderQaNotesList();
}

async function refreshQaNotes() {
  await loadQaNotes();
}

function renderQaCategoryChips() {
  const box = document.getElementById("qa-categories");
  if (!box) return;
  const cats = [];
  const seen = new Set();
  allQaNotesCache.forEach(it => {
    const c = (it.category || "").trim() || "未分类";
    if (!seen.has(c)) {
      seen.add(c);
      cats.push(c);
    }
  });
  cats.sort((a, b) => a.localeCompare(b, "zh"));
  const chips = [
    { name: "全部", value: "" },
    ...cats.map(c => ({ name: c, value: c })),
  ];
  box.innerHTML = chips
    .map(c => {
      const active = activeQaCategory === c.value ? " is-active" : "";
      return `<button type="button" class="qa-cat-chip${active}" data-cat="${escapeHtml(c.value)}">${escapeHtml(c.name)}</button>`;
    })
    .join("");
  if (!qaCatsBound) {
    qaCatsBound = true;
    box.addEventListener("click", e => {
      const btn = e.target.closest(".qa-cat-chip");
      if (!btn) return;
      activeQaCategory = btn.getAttribute("data-cat") || "";
      renderQaCategoryChips();
      renderQaNotesList();
    });
  }
}

function getFilteredQaNotes() {
  const q = (document.getElementById("search-qa-notes")?.value || "").trim().toLowerCase();
  return allQaNotesCache
    .filter(it => {
      const cat = (it.category || "").trim() || "未分类";
      if (activeQaCategory && cat !== activeQaCategory) return false;
      if (!q) return true;
      const tags = Array.isArray(it.tags) ? it.tags.join(" ") : String(it.tags || "");
      const blob = [it.title, it.problem, it.solution, it.category, tags].join(" ").toLowerCase();
      return blob.includes(q);
    })
    .slice()
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
}

function renderQaNotesList() {
  const box = document.getElementById("list-qa-notes");
  const countEl = document.getElementById("qa-count");
  if (!box) return;
  const list = getFilteredQaNotes();
  if (countEl) countEl.textContent = `共 ${list.length} 条`;
  if (!list.length) {
    box.innerHTML = `<div class="qa-empty">暂无记录。点右上角「+ 记录问题」把踩坑与解决办法存下来。</div>`;
    return;
  }
  box.innerHTML = list.map(renderQaNoteItem).join("");
}

function renderQaNoteItem(item) {
  const id = escapeHtml(item.id);
  const title = escapeHtml(item.title || "（无标题）");
  const cat = escapeHtml((item.category || "").trim() || "未分类");
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagHtml = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  const problem = escapeHtml(item.problem || "（未填写）");
  const solution = escapeHtml(item.solution || "（未填写）");
  const time = escapeHtml(item.updated_at || item.created_at || "");
  return `<article class="qa-card" data-id="${id}">
    <header class="qa-card-head" onclick="toggleQaCard(this)">
      <div class="qa-card-title-wrap">
        <span class="qa-card-chevron" aria-hidden="true">▸</span>
        <h3 class="qa-card-title">${title}</h3>
      </div>
      <div class="qa-card-meta">
        <span class="qa-card-cat">${cat}</span>
        ${tagHtml}
        ${time ? `<span class="qa-card-time">${time}</span>` : ""}
      </div>
      <div class="qa-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm" type="button" onclick="showForm('qa-notes','${id}')" title="编辑">✎</button>
        <button class="btn btn-sm danger" type="button" onclick="deleteItem('qa-notes','${id}')" title="删除">✕</button>
      </div>
    </header>
    <div class="qa-card-body">
      <div class="qa-block">
        <div class="qa-block-label">问题</div>
        <pre class="qa-block-text">${problem}</pre>
      </div>
      <div class="qa-block qa-block-solution">
        <div class="qa-block-label">解决办法</div>
        <pre class="qa-block-text">${solution}</pre>
      </div>
    </div>
  </article>`;
}

function toggleQaCard(headEl) {
  const card = headEl?.closest(".qa-card");
  if (!card) return;
  card.classList.toggle("is-open");
}


function setOpsReportPanel(state, msg, actionsHtml) {
  const panel = document.getElementById("ops-report-panel");
  const msgEl = document.getElementById("ops-report-msg");
  const actEl = document.getElementById("ops-report-actions");
  const loader = document.getElementById("ops-report-loader");
  const result = document.getElementById("ops-report-result");
  if (!panel || !msgEl) return;
  panel.classList.remove("hidden", "is-running", "is-ok", "is-error");
  if (state) panel.classList.add(state);
  if (state === "is-running") {
    loader?.classList.remove("hidden");
    result?.classList.add("hidden");
  } else {
    stopOpsReportTimelineAnim();
    loader?.classList.add("hidden");
    result?.classList.remove("hidden");
  }
  msgEl.textContent = msg;
  if (actEl) {
    if (actionsHtml) {
      actEl.innerHTML = actionsHtml;
      actEl.classList.remove("hidden");
    } else {
      actEl.innerHTML = "";
      actEl.classList.add("hidden");
    }
  }
}

function killOpsReportTimeline() {
  if (opsReportTl) {
    opsReportTl.kill();
    opsReportTl = null;
  }
}

function stopOpsReportTimelineAnim() {
  killOpsReportTimeline();
  if (opsReportStepTimer) {
    clearInterval(opsReportStepTimer);
    opsReportStepTimer = null;
  }
}

function _opsReportEls() {
  const loader = document.getElementById("ops-report-loader");
  if (!loader) return {};
  return {
    loader,
    bar: loader.querySelector(".ops-tl-bar"),
    steps: loader.querySelectorAll(".ops-tl-step"),
    msg: document.getElementById("ops-report-loader-msg"),
  };
}

function setOpsReportStepIndex(index, animate) {
  const { steps, bar, msg } = _opsReportEls();
  if (!steps.length) return;
  const i = Math.max(0, Math.min(index, steps.length - 1));
  const cfg = OPS_REPORT_STEPS[i];
  steps.forEach((el, idx) => {
    el.classList.toggle("is-active", idx === i);
    el.classList.toggle("is-done", idx < i);
  });
  if (msg && cfg) msg.textContent = cfg.label;
  if (bar && cfg && typeof gsap !== "undefined") {
    if (animate) {
      gsap.to(bar, { scaleX: cfg.progress, duration: 0.55, ease: "power2.inOut", overwrite: "auto" });
    } else {
      gsap.set(bar, { scaleX: cfg.progress });
    }
  }
  if (typeof gsap !== "undefined") {
    steps.forEach((el, idx) => {
      if (idx <= i) {
        gsap.to(el, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.inOut", overwrite: "auto" });
      } else {
        gsap.to(el, { opacity: 0.28, scale: 0.94, duration: 0.25, ease: "power2.inOut", overwrite: "auto" });
      }
    });
  }
}

function startOpsReportTimelineAnim() {
  stopOpsReportTimelineAnim();
  opsReportStartedAt = Date.now();
  const { bar, steps } = _opsReportEls();
  if (!bar || !steps.length) return;

  if (typeof gsap !== "undefined") {
    gsap.set(steps, { opacity: 0.28, scale: 0.94 });
    gsap.set(bar, { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.to(bar, { scaleX: 0.08, duration: 0.4, ease: "power2.out" });
  }

  setOpsReportStepIndex(0, true);
  opsReportStepTimer = setInterval(() => {
    const elapsed = Date.now() - opsReportStartedAt;
    let idx = 0;
    if (elapsed >= 14000) idx = 3;
    else if (elapsed >= 9000) idx = 2;
    else if (elapsed >= 4500) idx = 1;
    setOpsReportStepIndex(idx, true);
  }, 800);
}

function finishOpsReportTimelineAnim(success) {
  killOpsReportTimeline();
  if (opsReportStepTimer) {
    clearInterval(opsReportStepTimer);
    opsReportStepTimer = null;
  }
  const { bar, steps, msg } = _opsReportEls();
  if (typeof gsap !== "undefined" && bar && steps.length) {
    gsap.to(bar, { scaleX: 1, duration: 0.45, ease: "power2.out" });
    gsap.to(steps, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.06, ease: "power2.out" });
    steps.forEach(el => {
      el.classList.remove("is-active");
      el.classList.add("is-done");
    });
  }
  if (msg) {
    msg.textContent = success ? "报告生成完成" : "生成结束";
  }
}

async function refreshDailyReportPanel() {
  const data = await api("ops/daily-report/status");
  const btn = document.getElementById("btn-daily-report");
  if (btn) btn.disabled = !!data.running;

  if (data.running) {
    setOpsReportPanel("is-running", "");
    if (!opsReportStepTimer) startOpsReportTimelineAnim();
    return;
  }

  const wasRunning = !!opsReportStepTimer;
  if (wasRunning) {
    finishOpsReportTimelineAnim(data.last_result?.ok !== false);
    await new Promise(r => setTimeout(r, 480));
  }
  stopOpsReportTimelineAnim();

  const last = data.last_result;
  if (last && last.ok) {
    const name = last.report_rel ? last.report_rel.split(/[/\\]/).pop() : "报告";
    const excelBtn = last.excel_rel
      ? `<button class="btn" onclick="openPath('${last.excel_rel.replace(/\\/g, "\\\\")}')">打开 Excel</button>`
      : "";
    setOpsReportPanel(
      "is-ok",
      `最近生成：${last.generated_at || last.date || ""} · ${last.instance_count ?? "—"} 台 ECS · ${last.cert_count ?? "—"} 个域名证书`,
      `<button class="btn primary" onclick="openPath('${(last.report_rel || "").replace(/\\/g, "\\\\")}')">打开 Markdown</button>
       ${excelBtn}
       <button class="btn" onclick="openPath('${(data.output_dir || "data/ops_reports").replace(/\\/g, "\\\\")}')">打开目录</button>`
    );
    refreshOpsCerts();
    if (last.instances?.length) {
      renderOpsEcsTable(last.instances);
      setOpsEcsUpdated(last.generated_at ? `更新于 ${last.generated_at}` : "—");
    }
    return;
  }

  if (last && !last.ok) {
    setOpsReportPanel("is-error", `上次失败：${last.error || "未知错误"}`, "");
    return;
  }

  if (data.reports && data.reports.length) {
    const r = data.reports[0];
    setOpsReportPanel(
      "is-ok",
      `已有历史报告：${r.name}（${r.mtime || ""}）`,
      `<button class="btn primary" onclick="openPath('${r.path.replace(/\\/g, "\\\\")}')">打开最新报告</button>
       <button class="btn" onclick="openPath('${(data.output_dir || "data/ops_reports").replace(/\\/g, "\\\\")}')">打开目录</button>`
    );
    return;
  }

  document.getElementById("ops-report-panel")?.classList.add("hidden");
}

function stopDailyReportPoll() {
  if (dailyReportPollTimer) {
    clearInterval(dailyReportPollTimer);
    dailyReportPollTimer = null;
  }
}

function startDailyReportPoll() {
  stopDailyReportPoll();
  dailyReportPollTimer = setInterval(async () => {
    const data = await api("ops/daily-report/status");
    await refreshDailyReportPanel();
    if (!data.running) stopDailyReportPoll();
  }, 1500);
}

async function runDailyReport() {
  const btn = document.getElementById("btn-daily-report");
  if (btn?.disabled) return;
  setOpsReportPanel("is-running", "");
  startOpsReportTimelineAnim();
  const res = await api("ops/daily-report", { method: "POST" });
  if (!res.ok) {
    stopOpsReportTimelineAnim();
    setOpsReportPanel("is-error", res.error || "启动失败");
    return;
  }
  startDailyReportPoll();
}

function stopOpsEcsPoll() {
  if (opsEcsPollTimer) {
    clearInterval(opsEcsPollTimer);
    opsEcsPollTimer = null;
  }
  if (opsEcsStatusPollTimer) {
    clearInterval(opsEcsStatusPollTimer);
    opsEcsStatusPollTimer = null;
  }
}

function fmtPct(v) {
  if (v == null || v === "") return "—";
  return `${Number(v).toFixed(2)}%`;
}

function certLevelClass(level) {
  if (level === "紧急" || level === "过期") return "ops-level-urgent";
  if (level === "关注") return "ops-level-watch";
  if (level === "正常") return "ops-level-normal";
  return "ops-level-fail";
}

function renderOpsEcsTable(instances) {
  const body = document.getElementById("ops-ecs-body");
  if (!body) return;
  if (!instances || !instances.length) {
    body.innerHTML = '<div class="ops-module-hint is-error">暂无 ECS 数据</div>';
    return;
  }
  const mems = instances.map(x => x.memoryPercent).filter(v => v != null);
  const disks = instances.map(x => x.diskPercent).filter(v => v != null);
  const peakMem = mems.length ? Math.max(...mems) : null;
  const peakDisk = disks.length ? Math.max(...disks) : null;
  const rows = instances.map(x => {
    const memHigh = peakMem != null && x.memoryPercent === peakMem;
    const diskHigh = peakDisk != null && x.diskPercent === peakDisk;
    return `<tr>
      <td>${escapeHtml(x.name || "—")}</td>
      <td><code>${escapeHtml(x.instanceId || "—")}</code></td>
      <td><code>${escapeHtml(x.ipSummary || "—")}</code></td>
      <td>${fmtPct(x.cpuPercent)}</td>
      <td class="${memHigh ? "ops-metric-high" : ""}">${fmtPct(x.memoryPercent)}</td>
      <td class="${diskHigh ? "ops-metric-high" : ""}">${fmtPct(x.diskPercent)}</td>
      <td>${escapeHtml(x.statusZh || "—")}</td>
    </tr>`;
  }).join("");
  body.innerHTML = `<div class="ops-table-wrap"><table class="ops-table">
    <thead><tr>
      <th>实例名称</th><th>实例 ID</th><th>公网/IP 摘要</th>
      <th>CPU</th><th>内存</th><th>磁盘</th><th>状态</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderOpsCertsTable(certs) {
  const body = document.getElementById("ops-certs-body");
  if (!body) return;
  if (!certs || !certs.length) {
    body.innerHTML = '<div class="ops-module-hint is-error">暂无证书数据，请点击上方「一键生成每日巡检报告」</div>';
    return;
  }
  const rows = certs.map(r => {
    if (r.status === "ok") {
      const level = r.level || "—";
      return `<tr>
        <td><code>${escapeHtml(r.domain || "—")}</code></td>
        <td>${escapeHtml(r.biz || "—")}</td>
        <td>${escapeHtml(r.expires || r.expires_date || "—")}</td>
        <td>${r.days_left ?? "—"}</td>
        <td><span class="ops-level ${certLevelClass(level)}">${escapeHtml(level)}</span></td>
        <td>${escapeHtml(r.note || "例行监控")}</td>
      </tr>`;
    }
    return `<tr>
      <td><code>${escapeHtml(r.domain || "—")}</code></td>
      <td>${escapeHtml(r.biz || "—")}</td>
      <td>—</td><td>—</td>
      <td><span class="ops-level ops-level-fail">查询失败</span></td>
      <td>${escapeHtml(r.error || "")}</td>
    </tr>`;
  }).join("");
  body.innerHTML = `<div class="ops-table-wrap"><table class="ops-table">
    <thead><tr>
      <th>域名</th><th>业务</th><th>到期时间</th><th>剩余天数</th><th>级别</th><th>说明</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function setOpsEcsUpdated(text) {
  const el = document.getElementById("ops-ecs-updated");
  if (el) el.textContent = text || "—";
}

function setOpsCertsUpdated(text) {
  const el = document.getElementById("ops-certs-updated");
  if (el) el.textContent = text ? `更新于 ${text}` : "—";
}

async function refreshOpsCerts() {
  const data = await api("ops/certs");
  if (data.updated_at) setOpsCertsUpdated(data.updated_at);
  renderOpsCertsTable(data.certs || []);
}

async function pollOpsEcsStatus() {
  const data = await api("ops/ecs-live/status");
  const btn = document.getElementById("btn-ops-ecs-refresh");
  if (btn) btn.disabled = !!data.running;
  if (data.running) {
    setOpsEcsUpdated("正在拉取云监控数据…");
    return;
  }
  if (data.ok && data.instances) {
    setOpsEcsUpdated(data.updated_at ? `更新于 ${data.updated_at}` : "—");
    renderOpsEcsTable(data.instances);
    stopOpsEcsStatusPoll();
    return;
  }
  const err = data.last_result?.error || data.error;
  if (err) {
    document.getElementById("ops-ecs-body").innerHTML =
      `<div class="ops-module-hint is-error">${escapeHtml(err)}</div>`;
    stopOpsEcsStatusPoll();
  }
}

function startOpsEcsStatusPoll() {
  stopOpsEcsStatusPoll();
  opsEcsStatusPollTimer = setInterval(pollOpsEcsStatus, 1500);
  pollOpsEcsStatus();
}

function stopOpsEcsStatusPoll() {
  if (opsEcsStatusPollTimer) {
    clearInterval(opsEcsStatusPollTimer);
    opsEcsStatusPollTimer = null;
  }
}

async function refreshOpsEcs() {
  const cached = await api("ops/ecs-live");
  if (cached.ok && cached.instances?.length) {
    setOpsEcsUpdated(cached.updated_at ? `更新于 ${cached.updated_at}` : "—");
    renderOpsEcsTable(cached.instances);
  } else {
    const body = document.getElementById("ops-ecs-body");
    if (body) body.innerHTML = '<div class="ops-module-hint">正在拉取云监控数据…</div>';
  }
  const res = await api("ops/ecs-live/refresh", { method: "POST" });
  if (!res.ok) {
    if (res.running || res.error === "正在拉取 ECS 数据") {
      startOpsEcsStatusPoll();
      return;
    }
    if (!cached.ok || !cached.instances?.length) {
      document.getElementById("ops-ecs-body").innerHTML =
        `<div class="ops-module-hint is-error">${escapeHtml(res.error)}</div>`;
    }
    return;
  }
  startOpsEcsStatusPoll();
}

function startOpsModules() {
  refreshDailyReportPanel();
  refreshOpsCerts();
  refreshOpsEcs();
  stopOpsEcsPoll();
  opsEcsPollTimer = setInterval(() => refreshOpsEcs(), 60000);
}

function stopOpsModules() {
  stopOpsEcsPoll();
  stopOpsEcsStatusPoll();
}

async function loadFilePaths() {
  allFilePathsCache = await api("file-paths");
  if (!activeFpCategory) {
    const cats = getFpCategories();
    activeFpCategory = cats[0]?.name || "";
    activeFpSubcategory = getFpSubcategories(activeFpCategory)[0]?.name || "默认";
  }
  renderFpCategories();
  renderFpSubcategories();
  renderFilePathsList();
  bindFpNavHover();
}

function getFpCategories() {
  const counts = {};
  allFilePathsCache.forEach(item => {
    const cat = item.category || "其他";
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function getFpSubcategories(category) {
  const counts = {};
  allFilePathsCache
    .filter(item => (item.category || "其他") === category)
    .forEach(item => {
      const sub = getSubcategory(item);
      counts[sub] = (counts[sub] || 0) + 1;
    });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function renderFpCategories() {
  const list = document.getElementById("fp-categories-list");
  if (!list) return;
  const cats = getFpCategories();
  list.innerHTML = cats.map(c =>
    `<div class="link-nav-item ${activeFpCategory === c.name ? "is-active" : ""}" data-category="${escapeHtml(c.name)}" role="button" tabindex="0">${escapeHtml(c.name)}<span class="nav-count">${c.count}</span></div>`
  ).join("");
}

function renderFpSubcategories() {
  const list = document.getElementById("fp-subcategories-list");
  if (!list) return;
  const subs = getFpSubcategories(activeFpCategory);
  if (!subs.some(s => s.name === activeFpSubcategory)) {
    activeFpSubcategory = subs[0]?.name || "默认";
  }
  list.innerHTML = subs.map(s =>
    `<div class="link-nav-item ${activeFpSubcategory === s.name ? "is-active" : ""}" data-subcategory="${escapeHtml(s.name)}" role="button" tabindex="0">${escapeHtml(s.name)}<span class="nav-count">${s.count}</span></div>`
  ).join("");
  alignSubcategoryPanel("fp-categories-list", "fp-subcategories-list");
}

function updateFpCategoryActive() {
  document.querySelectorAll("#fp-categories-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.category === activeFpCategory);
  });
}

function updateFpSubcategoryActive() {
  document.querySelectorAll("#fp-subcategories-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.subcategory === activeFpSubcategory);
  });
}

function bindFpNavHover() {
  if (fpNavBound) return;
  fpNavBound = true;

  const catList = document.getElementById("fp-categories-list");
  const subList = document.getElementById("fp-subcategories-list");

  catList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-category]");
    if (item) setFpCategory(item.dataset.category);
  });

  subList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-subcategory]");
    if (item) setFpSubcategory(item.dataset.subcategory);
  });
}

function setFpCategory(category) {
  if (!category || activeFpCategory === category) return;
  activeFpCategory = category;
  activeFpSubcategory = getFpSubcategories(category)[0]?.name || "默认";
  updateFpCategoryActive();
  renderFpSubcategories();
  renderFilePathsList();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function setFpSubcategory(subcategory) {
  if (!subcategory || activeFpSubcategory === subcategory) return;
  activeFpSubcategory = subcategory;
  updateFpSubcategoryActive();
  renderFilePathsList();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function renderFilePathsList() {
  const q = (document.getElementById("search-file-paths")?.value || "").toLowerCase();
  const filtered = allFilePathsCache.filter(item => {
    const cat = item.category || "其他";
    const sub = getSubcategory(item);
    const matchNav = cat === activeFpCategory && sub === activeFpSubcategory;
    const matchSearch = !q || JSON.stringify(item).toLowerCase().includes(q);
    return matchNav && matchSearch;
  });
  const list = document.getElementById("list-file-paths");
  if (!list) return;
  list.innerHTML = filtered.length
    ? filtered.map(item => renderFilePathItem(item)).join("")
    : `<div class="empty">该分类下暂无路径</div>`;
}

async function refreshFilePaths() {
  allFilePathsCache = await api("file-paths");
  renderFpCategories();
  renderFpSubcategories();
  renderFilePathsList();
}

async function loadLinks() {
  allLinksCache = await api("links");
  if (!activeLinkCategory) {
    const cats = getLinkCategories();
    activeLinkCategory = cats[0]?.name || "";
    activeLinkSubcategory = getSubcategories(activeLinkCategory)[0]?.name || "默认";
  }
  renderLinkCategories();
  renderLinkSubcategories();
  renderLinksList();
  bindLinksNavHover();
}

function getLinkCategories() {
  const counts = {};
  allLinksCache.forEach(item => {
    const cat = item.category || "其他";
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function getSubcategories(category) {
  const counts = {};
  allLinksCache
    .filter(item => (item.category || "其他") === category)
    .forEach(item => {
      const sub = getSubcategory(item);
      counts[sub] = (counts[sub] || 0) + 1;
    });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function renderLinkCategories() {
  const list = document.getElementById("link-categories-list");
  if (!list) return;
  const cats = getLinkCategories();
  list.innerHTML = cats.map(c =>
    `<div class="link-nav-item ${activeLinkCategory === c.name ? "is-active" : ""}" data-category="${escapeHtml(c.name)}" role="button" tabindex="0">${escapeHtml(c.name)}<span class="nav-count">${c.count}</span></div>`
  ).join("");
}

function renderLinkSubcategories() {
  const list = document.getElementById("link-subcategories-list");
  if (!list) return;
  const subs = getSubcategories(activeLinkCategory);
  if (!subs.some(s => s.name === activeLinkSubcategory)) {
    activeLinkSubcategory = subs[0]?.name || "默认";
  }
  list.innerHTML = subs.map(s =>
    `<div class="link-nav-item ${activeLinkSubcategory === s.name ? "is-active" : ""}" data-subcategory="${escapeHtml(s.name)}" role="button" tabindex="0">${escapeHtml(s.name)}<span class="nav-count">${s.count}</span></div>`
  ).join("");
  alignSubcategoryPanel("link-categories-list", "link-subcategories-list");
}

function alignSubcategoryPanel(catListId, subListId) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const activeCat = document.querySelector(`#${catListId} .link-nav-item.is-active`);
      const subList = document.getElementById(subListId);
      if (!activeCat || !subList) {
        if (subList) subList.style.paddingTop = "0px";
        return;
      }
      subList.style.paddingTop = "0px";
      const activeSub = subList.querySelector(".link-nav-item.is-active") || subList.querySelector(".link-nav-item");
      if (!activeSub) return;
      const catTop = activeCat.getBoundingClientRect().top;
      const subTop = activeSub.getBoundingClientRect().top;
      subList.style.paddingTop = `${Math.max(0, catTop - subTop)}px`;
    });
  });
}

function updateCategoryActive() {
  document.querySelectorAll("#link-categories-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.category === activeLinkCategory);
  });
}

function updateSubcategoryActive() {
  document.querySelectorAll("#link-subcategories-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.subcategory === activeLinkSubcategory);
  });
}

function bindLinksNavHover() {
  if (linksNavBound) return;
  linksNavBound = true;

  const catList = document.getElementById("link-categories-list");
  const subList = document.getElementById("link-subcategories-list");

  catList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-category]");
    if (item) setLinkCategory(item.dataset.category);
  });

  subList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-subcategory]");
    if (item) setLinkSubcategory(item.dataset.subcategory);
  });

  window.addEventListener("resize", () => {
    alignSubcategoryPanel("link-categories-list", "link-subcategories-list");
    alignSubcategoryPanel("fp-categories-list", "fp-subcategories-list");
    alignSubcategoryPanel("pa-projects-list", "pa-groups-list");
    if (document.body.classList.contains("bf-wb-open") && typeof alignBizFlowSidePanels === "function") {
      alignBizFlowSidePanels();
    }
  });
}

function setLinkCategory(category) {
  if (!category || activeLinkCategory === category) return;
  activeLinkCategory = category;
  activeLinkSubcategory = getSubcategories(category)[0]?.name || "默认";
  updateCategoryActive();
  renderLinkSubcategories();
  renderLinksList();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function setLinkSubcategory(subcategory) {
  if (!subcategory || activeLinkSubcategory === subcategory) return;
  activeLinkSubcategory = subcategory;
  updateSubcategoryActive();
  renderLinksList();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function renderLinksList() {
  const q = (document.getElementById("search-links")?.value || "").toLowerCase();
  const filtered = allLinksCache.filter(item => {
    const cat = item.category || "其他";
    const sub = getSubcategory(item);
    const matchNav = cat === activeLinkCategory && sub === activeLinkSubcategory;
    const matchSearch = !q || JSON.stringify(item).toLowerCase().includes(q);
    return matchNav && matchSearch;
  });
  const list = document.getElementById("list-links");
  list.innerHTML = filtered.length
    ? filtered.map(item => renderLinkItem(item)).join("")
    : `<div class="empty">该分类下暂无网址</div>`;
}

async function refreshLinks() {
  allLinksCache = await api("links");
  renderLinkCategories();
  renderLinkSubcategories();
  renderLinksList();
}

function getPaGroupField() {
  return activePaDimMode === "iter" ? "iter_group" : "env_group";
}

function getPaGroup(item) {
  const g = item[getPaGroupField()];
  return (g && String(g).trim()) || "默认";
}

function updatePaColTitles() {
  const col2 = document.getElementById("pa-col2-title");
  if (col2) col2.textContent = activePaDimMode === "iter" ? "版本" : "环境";
}

/* ---------- 项目中心 ---------- */
async function loadProjectsCenter(preferredId = "") {
  const [projects, options] = await Promise.all([
    api("projects"),
    api("projects/options"),
  ]);
  projectsCache = Array.isArray(projects) ? projects : [];
  projectOptionsCache = options?.error
    ? { assetProjects: [], ganttProjects: [] }
    : options;
  renderProjectCreateOptions();
  if (preferredId) activeProjectId = preferredId;
  if (!activeProjectId || !projectsCache.some(p => p.id === activeProjectId)) {
    activeProjectId = projectsCache[0]?.id || "";
  }
  renderProjectCards();
  if (activeProjectId) {
    await api(`projects/${activeProjectId}/apply-links`, { method: "POST", body: {} });
    await openProjectDetail(activeProjectId);
  }
  else {
    const detail = document.getElementById("project-center-detail");
    if (detail) detail.innerHTML = '<p class="empty">暂无项目，点击“新建项目”开始关联。</p>';
  }
}

function renderProjectCreateOptions() {
  const assetSel = document.getElementById("project-form-assets");
  const ganttSel = document.getElementById("project-form-gantt");
  if (assetSel) {
    assetSel.innerHTML = (projectOptionsCache.assetProjects || [])
      .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");
  }
  if (ganttSel) {
    ganttSel.innerHTML = (projectOptionsCache.ganttProjects || [])
      .map(item => {
        const extra = item.zentaoLabel ? ` · ${item.zentaoLabel}` : "";
        return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name + extra)}</option>`;
      })
      .join("");
  }
}

async function saveProjectGanttLinks() {
  const project = activeProjectOverview?.project;
  if (!project?.id) return;
  const ids = selectedValues("project-link-gantt");
  const updated = { ...project, gantt_project_ids: ids };
  const res = await api(`projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    body: updated,
  });
  if (res?.error) {
    alert(res.error);
    return;
  }
  await api(`projects/${encodeURIComponent(project.id)}/apply-links`, { method: "POST", body: {} });
  await loadProjectsCenter(project.id);
}

function showProjectCreateForm() {
  document.getElementById("project-create-panel")?.classList.remove("hidden");
  document.getElementById("project-form-name")?.focus();
}

function hideProjectCreateForm() {
  document.getElementById("project-create-panel")?.classList.add("hidden");
}

function selectedValues(selectId) {
  const el = document.getElementById(selectId);
  return el ? [...el.selectedOptions].map(o => o.value).filter(Boolean) : [];
}

async function createProject() {
  const name = document.getElementById("project-form-name")?.value.trim() || "";
  if (!name) {
    alert("请填写项目名称");
    return;
  }
  const aliases = (document.getElementById("project-form-aliases")?.value || "")
    .split(/[,，]/)
    .map(x => x.trim())
    .filter(Boolean);
  const project = await api("projects", {
    method: "POST",
    body: {
      id: `proj_${Date.now().toString(36)}`,
      name,
      aliases,
      asset_projects: selectedValues("project-form-assets"),
      gantt_project_ids: selectedValues("project-form-gantt"),
      status: "active",
      createdAt: new Date().toISOString().slice(0, 19),
    },
  });
  if (project?.error) {
    alert(project.error);
    return;
  }
  await api(`projects/${project.id}/apply-links`, { method: "POST", body: {} });
  hideProjectCreateForm();
  const nameInput = document.getElementById("project-form-name");
  const aliasInput = document.getElementById("project-form-aliases");
  if (nameInput) nameInput.value = "";
  if (aliasInput) aliasInput.value = "";
  await loadProjectsCenter(project.id);
}

function renderProjectCards() {
  const list = document.getElementById("project-center-items");
  if (!list) return;
  list.innerHTML = projectsCache.length
    ? projectsCache
        .map(project => `
          <button type="button"
            class="project-card ${project.id === activeProjectId ? "is-active" : ""}"
            onclick="openProjectDetail('${escapeHtml(project.id)}')">
            <strong>${escapeHtml(project.name || "未命名项目")}</strong>
            <span>${escapeHtml((project.aliases || []).slice(0, 2).join(" / ") || project.id)}</span>
          </button>`)
        .join("")
    : '<p class="empty">暂无项目</p>';
}

async function openProjectDetail(projectId) {
  activeProjectId = projectId;
  rememberLastProjectId(projectId);
  renderProjectCards();
  const detail = document.getElementById("project-center-detail");
  if (!detail) return;
  detail.innerHTML = '<p class="empty">正在汇总项目关联数据…</p>';
  const overview = await api(`projects/${projectId}/overview`);
  if (overview?.error || !overview?.ok) {
    detail.innerHTML = `<p class="empty">${escapeHtml(overview?.error || "加载失败")}</p>`;
    return;
  }
  activeProjectOverview = overview;
  const project = overview.project || {};
  const counts = overview.counts || {};
  const listItems = (items, key) =>
    items?.length
      ? `<ul>${items.slice(0, 6).map(x => `<li>${escapeHtml(x[key] || x.title || x.name || "—")}</li>`).join("")}</ul>`
      : '<p class="hint">暂无关联</p>';
  const iterationItems = (items) => {
    if (!items?.length) return '<p class="hint">暂无关联</p>';
    return `<ul class="project-iteration-list">${items.map(x => {
      const tags = (x.tags || [])
        .map(t => `<span class="project-iteration-tag">${escapeHtml(t)}</span>`)
        .join("");
      return `<li>
        <button type="button" class="project-iteration-link"
          data-iteration-path="${escapeHtml(x.path || "")}"
          data-iteration-title="${escapeHtml(x.title || "文档")}">
          ${escapeHtml(x.title || "未命名")}
        </button>
        ${x.updatedAt ? `<span class="project-iteration-date">${escapeHtml(x.updatedAt)}</span>` : ""}
        ${tags ? `<div class="project-iteration-tags">${tags}</div>` : ""}
      </li>`;
    }).join("")}</ul>`;
  };
  detail.innerHTML = `
    <div class="project-detail-head">
      <div>
        <h2>${escapeHtml(project.name || "未命名项目")}</h2>
        <div class="project-id" title="稳定项目 ID">ID：${escapeHtml(project.id || "")}</div>
      </div>
      <button class="btn" onclick="applyActiveProjectLinks()">重新匹配旧数据</button>
    </div>
    <div class="project-stat-grid">
      <div class="project-stat"><strong>${counts.assets || 0}</strong><span>项目资产</span></div>
      <div class="project-stat"><strong>${counts.gantt || 0}</strong><span>排期表</span></div>
      <div class="project-stat"><strong>${counts.testPoints || 0}</strong><span>测试点记录</span></div>
      <div class="project-stat"><strong>${counts.dataVerify || 0}</strong><span>数据验证记录</span></div>
    </div>
    <div class="project-link-editor">
      <label>
        <span>关联排期表</span>
        <select id="project-link-gantt" multiple size="4">${(projectOptionsCache.ganttProjects || []).map(item => {
          const selected = (project.gantt_project_ids || []).includes(item.id) ? " selected" : "";
          const extra = item.zentaoLabel ? ` · ${item.zentaoLabel}` : "";
          return `<option value="${escapeHtml(item.id)}"${selected}>${escapeHtml((item.name || item.id) + extra)}</option>`;
        }).join("")}</select>
      </label>
      <div>
        <button class="btn primary" type="button" onclick="saveProjectGanttLinks()">保存关联</button>
        <p class="hint">按住 Ctrl 可多选。保存后「打开排期表」会定位到该排期；测试点生成也会带上排期里的原型链接。</p>
      </div>
    </div>
    <div class="project-quick-actions">
      <button class="btn" onclick="openActiveProjectModule('assets')">打开项目资产</button>
      <button class="btn" onclick="openActiveProjectModule('gantt')">打开排期表</button>
      <button class="btn primary" onclick="openActiveProjectModule('testpoints')">生成测试点</button>
      <button class="btn primary" onclick="openActiveProjectModule('data-verify')">数据验证</button>
      <button class="btn" type="button" onclick="openActiveProjectInstall()">远程装包</button>
      <button class="btn primary" type="button" onclick="openSmokeWorkbench()">打开冒烟台</button>
      <button class="btn primary" type="button" onclick="openFuncWorkbench()">打开功能测试台</button>
    </div>
    <section class="project-round-section" id="project-round-section">
      <div class="project-round-head">
        <div>
          <h3>本轮测试</h3>
          <p class="hint">测点 → 装包 / 冒烟 → 记结论（本地留档，方便日报）</p>
        </div>
      </div>
      <div class="project-round-actions">
        <button class="btn primary" type="button" onclick="openActiveProjectModule('testpoints')">① 测点</button>
        <button class="btn" type="button" onclick="openActiveProjectInstall()">② 装包</button>
        <button class="btn" type="button" onclick="openSmokeWorkbench()">② 冒烟</button>
        <button class="btn" type="button" onclick="openFuncWorkbench()">② 功能测</button>
      </div>
      <div class="project-round-form">
        <label>
          <span>结论</span>
          <select id="project-round-status">
            <option value="pass">通过</option>
            <option value="blocked">阻塞</option>
            <option value="fail">未通过</option>
            <option value="wip">进行中</option>
          </select>
        </label>
        <label class="project-round-note">
          <span>备注 / 阻塞说明</span>
          <textarea id="project-round-note" rows="2" placeholder="例如：支付回调未通；装包版本 xxx；阻塞人…"></textarea>
        </label>
        <button class="btn primary" type="button" onclick="saveProjectRoundResult()">保存本轮结论</button>
        <button class="btn" type="button" onclick="copyProjectBugTemplate()">复制缺陷模板</button>
      </div>
      <div id="project-round-list" class="project-round-list hint">正在加载历史结论…</div>
    </section>
    <section class="project-round-section" id="project-patch-verify-section">
      <div class="project-round-head project-patch-head">
        <div>
          <h3>小版本验证</h3>
          <p class="hint">线上单修 / 热修：可选包体 · 已修 bug · 写清验证内容</p>
        </div>
        <button class="btn primary" type="button" onclick="openProjectPatchVerifyModal()">新增验证</button>
      </div>
      <div id="project-patch-verify-list" class="project-round-list hint">正在加载小版本验证…</div>
    </section>
    <section class="project-round-section" id="project-context-section">
      <div class="project-round-head">
        <div>
          <h3>环境 / 账号上下文</h3>
          <p class="hint">从项目资产自动识别（名称/标签含「账号、环境、apk」等）· 打开项目时写入 session</p>
        </div>
      </div>
      <div id="project-context-pack" class="hint">正在识别资产…</div>
    </section>
    <section class="project-round-section" id="project-release-section">
      <div class="project-round-head">
        <div>
          <h3>发版前清单</h3>
          <p class="hint">功能 / 性能 / 安全最小勾选门禁（本地）</p>
        </div>
      </div>
      <div id="project-release-checklist" class="hint">正在加载清单…</div>
    </section>
    <section class="project-round-section" id="project-regression-section">
      <div class="project-round-head">
        <div>
          <h3>回归建议</h3>
          <p class="hint">根据关联甘特未完成任务推荐回归模块（可勾选复制）</p>
        </div>
      </div>
      <div id="project-regression-suggest" class="hint">正在生成建议…</div>
    </section>
    <section class="project-round-section" id="project-install-section">
      <div class="project-round-head">
        <div>
          <h3>装包历史</h3>
          <p class="hint">本项目最近装包记录（远程装包成功/失败后自动写入）</p>
        </div>
      </div>
      <div id="project-install-history" class="hint">正在加载…</div>
    </section>
    <section class="project-smoke-entry" id="project-smoke-entry">
      <div class="project-smoke-entry-main">
        <div>
          <h3>冒烟测试</h3>
          <p class="hint">主流程一键跑 · 用例进度 / 截图 / 报告在独立冒烟台</p>
        </div>
        <button class="btn primary" type="button" onclick="openSmokeWorkbench()">打开冒烟台</button>
      </div>
      <div id="project-smoke-entry-summary" class="project-smoke-entry-summary hint">正在读取最近冒烟状态…</div>
    </section>
    <section class="project-func-entry" id="project-func-entry">
      <div class="project-smoke-entry-main">
        <div>
          <h3>功能测试</h3>
          <p class="hint">对照测试点生成的页面功能点 · 同步用例 · 截图与问题说明可回看</p>
        </div>
        <button class="btn primary" type="button" onclick="openFuncWorkbench()">打开功能测试台</button>
      </div>
      <div id="project-func-entry-summary" class="project-smoke-entry-summary hint">正在读取功能测试状态…</div>
    </section>
    <div class="project-related">
      <section><h3>资产</h3>${listItems(overview.assets, "name")}</section>
      <section><h3>排期</h3>${listItems(overview.ganttProjects, "project_name")}</section>
      <section><h3>测试点</h3>${listItems(overview.testPoints, "title")}</section>
      <section><h3>数据验证</h3>${listItems(overview.dataVerify, "title")}</section>
    </div>
    <section class="project-iteration-section">
      <h3>本次迭代的相关数据</h3>
      <p class="hint">测试常用参考资料，点击标题即可查看</p>
      ${iterationItems(overview.iterationRefs)}
    </section>`;
  detail.querySelectorAll(".project-iteration-link").forEach(btn => {
    btn.addEventListener("click", () => {
      openProjectIterationDoc(btn.dataset.iterationPath || "", btn.dataset.iterationTitle || "文档");
    });
  });
  refreshSmokeEntrySummary();
  refreshFuncEntrySummary();
  refreshProjectRoundList();
  if (typeof refreshProjectPatchVerifyList === "function") refreshProjectPatchVerifyList();
  if (typeof refreshProjectM4Panels === "function") refreshProjectM4Panels();
}

async function applyActiveProjectLinks() {
  if (!activeProjectId) return;
  const res = await api(`projects/${activeProjectId}/apply-links`, {
    method: "POST",
    body: {},
  });
  if (res?.error) {
    alert(res.error);
    return;
  }
  await openProjectDetail(activeProjectId);
}

let projectSmokeRunning = false;
let projectSmokePollTimer = null;
let projectSmokeActiveRunId = "";
let projectSmokePlanCases = [];
let projectSmokeTerminalIdlePolls = 0;
let projectSmokePollStartedAt = 0;

function ensureSmokeWorkbenchShell() {
  let modal = document.getElementById("smoke-workbench-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "smoke-workbench-modal";
  modal.className = "smoke-workbench-modal hidden";
  modal.innerHTML = `
    <div class="smoke-shot-backdrop" onclick="closeSmokeWorkbench()"></div>
    <div class="smoke-workbench-dialog" role="dialog" aria-modal="true" aria-label="冒烟台">
      <div class="smoke-workbench-head">
        <div>
          <h3 id="smoke-workbench-title">冒烟台</h3>
          <p class="hint">一键跑主流程 · 用例实时进度 · 截图与报告归档</p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeSmokeWorkbench()">关闭</button>
      </div>
      <div id="smoke-workbench-stats" class="smoke-workbench-stats"></div>
      <div class="project-smoke-head">
        <label class="project-smoke-headed">
          <input type="checkbox" id="project-smoke-headed" checked>
          <span>有头可视化</span>
        </label>
        <div class="project-smoke-actions" style="margin:0">
          <button class="btn primary" id="project-smoke-run-btn" type="button" onclick="runProjectSmoke()">一键冒烟</button>
          <button class="btn" id="project-smoke-rerun-failed-btn" type="button" onclick="rerunFailedSmokeCases()">重跑失败</button>
          <button class="btn" id="project-smoke-stop-btn" type="button" onclick="stopProjectSmoke()">强制结束</button>
          <button class="btn" type="button" onclick="loadProjectSmokePanel()">刷新结果</button>
          <a class="btn" href="#" onclick="openTool('auto-qa'); return false;">打开业务自动化</a>
        </div>
      </div>
      <div class="smoke-workbench-body">
        <div class="smoke-workbench-col">
          <div id="project-smoke-meta" class="hint">正在加载冒烟配置…</div>
          <div id="project-smoke-cases" class="project-smoke-cases"></div>
          <div id="project-smoke-result" class="project-smoke-result hidden"></div>
        </div>
        <div class="smoke-workbench-col">
          <div id="project-smoke-runs" class="project-smoke-runs"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openSmokeWorkbench() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  const modal = ensureSmokeWorkbenchShell();
  const title = document.getElementById("smoke-workbench-title");
  const name = activeProjectOverview?.project?.name || activeProjectId;
  if (title) title.textContent = `冒烟台 · ${name}`;
  modal.classList.remove("hidden");
  loadProjectSmokePanel();
}

function closeSmokeWorkbench() {
  document.getElementById("smoke-workbench-modal")?.classList.add("hidden");
}

/* ========== 功能测试台（对照测试点生成 · 页面功能） ========== */
let projectFuncRunning = false;
let projectFuncPollTimer = null;
let projectFuncActiveRunId = "";
let projectFuncPlanCases = [];
let projectFuncCasesView = [];
let projectFuncCasesRunId = "";
let projectFuncCasePage = 1;
const PROJECT_FUNC_PAGE_SIZE = 10;

function funcHintCount(item) {
  if (Array.isArray(item?.hints) && item.hints.length) return item.hints.length;
  const fromPlan = (projectFuncPlanCases || []).find(c => String(c.id) === String(item?.id || ""));
  return Array.isArray(fromPlan?.hints) ? fromPlan.hints.length : 0;
}

function funcHintsFor(item) {
  if (Array.isArray(item?.hints) && item.hints.length) return item.hints.map(String);
  const fromPlan = (projectFuncPlanCases || []).find(c => String(c.id) === String(item?.id || ""));
  return Array.isArray(fromPlan?.hints) ? fromPlan.hints.map(String) : [];
}

function funcTotalHints(list) {
  return (list || []).reduce((n, item) => n + funcHintCount(item), 0);
}

function ensureFuncWorkbenchShell() {
  let modal = document.getElementById("func-workbench-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "func-workbench-modal";
  modal.className = "smoke-workbench-modal hidden";
  modal.innerHTML = `
    <div class="smoke-shot-backdrop" onclick="closeFuncWorkbench()"></div>
    <div class="smoke-workbench-dialog" role="dialog" aria-modal="true" aria-label="功能测试台">
      <div class="smoke-workbench-head">
        <div>
          <h3 id="func-workbench-title">功能测试台</h3>
          <p class="hint">从测试点同步页面功能用例 · 进度 / 截图 / 失败说明可回看</p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeFuncWorkbench()">关闭</button>
      </div>
      <div id="func-workbench-stats" class="smoke-workbench-stats"></div>
      <div class="project-smoke-head">
        <label class="project-smoke-headed">
          <input type="checkbox" id="project-func-headed" checked>
          <span>有头可视化</span>
        </label>
        <div class="project-smoke-actions" style="margin:0">
          <button class="btn" type="button" onclick="syncProjectFuncCases()">从测试点同步</button>
          <button class="btn primary" id="project-func-run-btn" type="button" onclick="runProjectFunc()">一键功能测试</button>
          <button class="btn" id="project-func-stop-btn" type="button" onclick="stopProjectFunc()">强制结束</button>
          <button class="btn" type="button" onclick="loadProjectFuncPanel()">刷新结果</button>
          <button class="btn" type="button" onclick="openActiveProjectModule('testpoints')">打开测试点生成</button>
        </div>
      </div>
      <div class="smoke-workbench-body">
        <div class="smoke-workbench-col">
          <div id="project-func-meta" class="hint">正在加载功能测试配置…</div>
          <div id="project-func-cases" class="project-smoke-cases"></div>
          <div id="project-func-result" class="project-smoke-result hidden"></div>
        </div>
        <div class="smoke-workbench-col">
          <div id="project-func-runs" class="project-smoke-runs"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openFuncWorkbench() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  const modal = ensureFuncWorkbenchShell();
  const title = document.getElementById("func-workbench-title");
  const name = activeProjectOverview?.project?.name || activeProjectId;
  if (title) title.textContent = `功能测试台 · ${name}`;
  modal.classList.remove("hidden");
  loadProjectFuncPanel();
}

function closeFuncWorkbench() {
  document.getElementById("func-workbench-modal")?.classList.add("hidden");
}

function renderFuncWorkbenchStats(cases, latest) {
  const box = document.getElementById("func-workbench-stats");
  if (!box) return;
  const list = Array.isArray(cases) ? cases : [];
  const total = list.length;
  const hints = funcTotalHints(projectFuncPlanCases.length ? projectFuncPlanCases : list);
  const passed = list.filter(c => c.status === "passed").length;
  const failed = list.filter(c => c.status === "failed").length;
  const running = list.filter(c => c.status === "running").length;
  const pending = list.filter(c => !c.status || c.status === "pending" || c.status === "skipped").length;
  const latestLabel = latest ? smokeRunStatusLabel(latest) : "尚未执行";
  box.innerHTML = `
    <span class="smoke-stat"><b>${total}</b>用例</span>
    <span class="smoke-stat"><b>${hints}</b>细项</span>
    <span class="smoke-stat ok"><b>${passed}</b>通过</span>
    <span class="smoke-stat bad"><b>${failed}</b>失败</span>
    <span class="smoke-stat run"><b>${running}</b>执行中</span>
    <span class="smoke-stat"><b>${pending}</b>未执行/跳过</span>
    <span class="smoke-stat muted">最近：${escapeHtml(latestLabel)}</span>`;
}

async function refreshFuncEntrySummary() {
  const box = document.getElementById("project-func-entry-summary");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/func`);
  if (!data?.ok) {
    box.textContent = data?.error || "暂无功能测试配置";
    return;
  }
  if (!data.plan) {
    box.innerHTML = `尚未同步用例 <button type="button" class="btn btn-sm" onclick="openFuncWorkbench()">打开功能测试台</button>`;
    return;
  }
  const latest = data.latest;
  const cases = data.cases || data.plan.cases || [];
  const total = (data.plan.cases || []).length || cases.length || 0;
  const hintTotal = (data.plan.cases || []).reduce((n, c) => n + (Array.isArray(c.hints) ? c.hints.length : 0), 0);
  const passed = (cases || []).filter(c => c.status === "passed").length;
  const failed = (cases || []).filter(c => c.status === "failed").length;
  const status = latest ? smokeRunStatusLabel(latest) : "尚未执行";
  const when = latest?.finishedAt || latest?.startedAt || "";
  const synced = data.plan.syncedAt ? `同步于 ${data.plan.syncedAt}` : "未同步";
  box.innerHTML = `
    <span>用例 <b>${total}</b> · 细项 <b>${hintTotal}</b></span>
    <span>${escapeHtml(synced)}</span>
    <span>最近 <b class="aq-run-status ${escapeHtml(latest?.status || "")}">${escapeHtml(status)}</b></span>
    ${when ? `<span>${escapeHtml(when)}</span>` : ""}
    ${passed || failed ? `<span>通过 ${passed} · 失败 ${failed}</span>` : ""}
    <button type="button" class="btn btn-sm" onclick="openFuncWorkbench()">进入功能测试台</button>`;
}

function renderFuncCases(cases, runId) {
  const box = document.getElementById("project-func-cases");
  if (!box) return;
  const list = Array.isArray(cases) && cases.length
    ? cases.map(item => ({
        ...item,
        title: item.title || `${item.module || ""} · ${item.id}`,
        hints: funcHintsFor(item),
        hintResults: Array.isArray(item.hintResults) ? item.hintResults : [],
      }))
    : (projectFuncPlanCases || []).map(item => ({
        id: item.id,
        title: item.title || `${item.module || ""} · ${item.id}`,
        module: item.module || "",
        status: "pending",
        screenshot: "",
        error: "",
        note: "",
        hints: Array.isArray(item.hints) ? item.hints : [],
        hintResults: [],
      }));
  if (!list.length) {
    box.innerHTML = '<p class="hint">暂无用例。请先点「从测试点同步」。</p>';
    projectFuncCasesView = [];
    return;
  }

  const sameBatch =
    projectFuncCasesRunId === (runId || "") &&
    projectFuncCasesView.length === list.length &&
    String(projectFuncCasesView[0]?.id || "") === String(list[0]?.id || "");
  projectFuncCasesView = list;
  projectFuncCasesRunId = runId || "";
  if (!sameBatch) projectFuncCasePage = 1;

  const total = list.length;
  const pageSize = PROJECT_FUNC_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (projectFuncCasePage > pageCount) projectFuncCasePage = pageCount;
  if (projectFuncCasePage < 1) projectFuncCasePage = 1;
  const page = projectFuncCasePage;
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);
  const hintTotal = funcTotalHints(list);

  box.innerHTML = `
    <div class="links-col-title">功能用例进度
      <span class="hint func-case-hint-total">共 ${total} 用例 · ${hintTotal} 细项（${pageSize}/页）</span>
    </div>
    <div class="project-smoke-case-list">
      ${pageItems.map(item => {
        const status = item.status || "pending";
        const hints = Array.isArray(item.hints) ? item.hints : [];
        const shot = item.screenshot && runId
          ? `<button type="button" class="btn btn-sm" onclick="openSmokeScreenshot('${escapeHtml(runId)}','${escapeHtml(item.screenshot)}','${escapeHtml(item.id || "")}')">查看截图</button>`
          : (status === "passed" || status === "failed" ? '<span class="hint">暂无截图</span>' : "");
        const note = item.note || item.error || "";
        const hintBlock = hints.length
          ? `<details class="func-case-hints" ${Array.isArray(item.hintResults) && item.hintResults.length ? "open" : ""}>
              <summary>展开细项 ${hints.length} 条${Array.isArray(item.hintResults) ? ` · 已测定位 ${(item.hintResults || []).filter(h => h.status === "hit").length}` : ""}</summary>
              <ol class="func-hint-list">${hints.map((h, hi) => {
                const hr = Array.isArray(item.hintResults) ? item.hintResults.find(x => Number(x.index) === hi) : null;
                const st = hr?.status || "";
                const cls = st === "hit" ? "hit" : st === "miss" ? "miss" : "";
                const canPreview = runId && item.screenshot;
                return `<li class="func-hint-item ${cls}"
                  data-case="${escapeHtml(item.id || "")}"
                  data-hint="${hi}"
                  ${canPreview ? `title="点击查看：底图 + 该细项区域图" onclick="previewFuncHint('${escapeHtml(runId)}','${escapeHtml(item.id || "")}',${hi})"` : ""}
                ><span class="func-hint-text">${escapeHtml(h)}</span>${hr?.screenshot ? '<span class="func-hint-tag">有区域图</span>' : (st === "miss" ? '<span class="func-hint-tag miss">未定位</span>' : "")}</li>`;
              }).join("")}</ol>
            </details>`
          : '<span class="hint">无细项</span>';
        return `
          <article class="project-smoke-case status-${escapeHtml(status)}">
            <div class="project-smoke-case-main">
              <strong>${escapeHtml(item.id || "")}</strong>
              <span class="project-smoke-case-title">${escapeHtml(item.title || "")}</span>
              <span class="project-smoke-case-status">${smokeCaseStatusLabel(status)}</span>
              <span class="func-case-hint-badge">${hints.length} 细项</span>
            </div>
            <div class="project-smoke-case-actions">
              ${shot}
              ${note ? `<p class="hint">${escapeHtml(note)}</p>` : ""}
              ${hintBlock}
            </div>
          </article>`;
      }).join("")}
    </div>
    ${pageCount > 1 ? `
      <div class="func-case-pager">
        <button type="button" class="btn btn-sm" ${page <= 1 ? "disabled" : ""} onclick="gotoFuncCasePage(${page - 1})">上一页</button>
        <span class="hint">第 ${page} / ${pageCount} 页</span>
        <button type="button" class="btn btn-sm" ${page >= pageCount ? "disabled" : ""} onclick="gotoFuncCasePage(${page + 1})">下一页</button>
      </div>` : ""}`;
}

function gotoFuncCasePage(page) {
  const pageCount = Math.max(1, Math.ceil((projectFuncCasesView.length || 0) / PROJECT_FUNC_PAGE_SIZE));
  projectFuncCasePage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  renderFuncCases(projectFuncCasesView, projectFuncCasesRunId);
}

function stopFuncProgressPoll() {
  if (projectFuncPollTimer) {
    clearInterval(projectFuncPollTimer);
    projectFuncPollTimer = null;
  }
}

async function pollFuncProgress(runId) {
  if (!runId) return null;
  const data = await api(`auto-qa/runs/${encodeURIComponent(runId)}/progress`);
  if (!data?.ok) return null;
  const cases = data.cases || [];
  renderFuncCases(cases, runId);
  renderFuncWorkbenchStats(cases, data.run || { status: data.status || "running", id: runId });
  return { ...data, cases };
}

function finishFuncUi(status, data) {
  stopFuncProgressPoll();
  projectFuncRunning = false;
  const btn = document.getElementById("project-func-run-btn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "一键功能测试";
  }
  const result = document.getElementById("project-func-result");
  if (result) {
    const run = data?.run || {};
    result.classList.remove("hidden");
    result.innerHTML = `
      <strong>${status === "passed" ? "功能测试通过" : "功能测试结束（含失败/跳过）"}</strong>
      ${run.error ? `<p>${escapeHtml(run.error)}</p>` : ""}
      ${run.id ? `<p><button type="button" class="btn btn-sm primary" onclick="openSmokeReportModal('${escapeHtml(run.id)}')">查看报告</button>
      <a class="btn btn-sm" target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/summary">打开摘要</a></p>` : ""}`;
  }
  loadProjectFuncPanel();
  refreshFuncEntrySummary();
}

function startFuncProgressPoll(runId) {
  stopFuncProgressPoll();
  projectFuncActiveRunId = runId;
  pollFuncProgress(runId);
  projectFuncPollTimer = setInterval(async () => {
    const data = await pollFuncProgress(runId);
    if (!data) return;
    const status = data.run?.status || data.status;
    if (status && status !== "running") {
      finishFuncUi(status, data);
    }
  }, 1200);
}

async function syncProjectFuncCases() {
  if (!activeProjectId) return;
  const meta = document.getElementById("project-func-meta");
  if (meta) meta.textContent = "正在从测试点生成同步…";
  const res = await api(`projects/${encodeURIComponent(activeProjectId)}/func/sync`, {
    method: "POST",
    body: {},
  });
  if (!res?.ok) {
    alert(res?.error || "同步失败");
    await loadProjectFuncPanel();
    return;
  }
  alert(`已同步 ${res.caseCount || 0} 条功能用例\n来源：${res.sourceTitle || ""}`);
  await loadProjectFuncPanel();
  refreshFuncEntrySummary();
}

async function runProjectFunc() {
  if (!activeProjectId || projectFuncRunning) return;
  ensureFuncWorkbenchShell();
  const headed = !!document.getElementById("project-func-headed")?.checked;
  projectFuncRunning = true;
  const btn = document.getElementById("project-func-run-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = headed ? "功能测试中（请看浏览器）…" : "功能测试执行中…";
  }
  try {
    const res = await api(`projects/${encodeURIComponent(activeProjectId)}/func/run`, {
      method: "POST",
      body: { headed },
      timeoutMs: 30000,
    });
    if (!res?.ok) {
      throw new Error(res?.error || "启动失败");
    }
    const runId = res.run?.id || "";
    renderFuncCases(res.cases || [], runId);
    renderFuncWorkbenchStats(res.cases || [], res.run);
    if (runId) startFuncProgressPoll(runId);
  } catch (err) {
    projectFuncRunning = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "一键功能测试";
    }
    alert(err.message || String(err));
  }
}

async function stopProjectFunc() {
  if (!activeProjectId) return;
  stopFuncProgressPoll();
  projectFuncRunning = false;
  const btn = document.getElementById("project-func-run-btn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "一键功能测试";
  }
  await api(`projects/${encodeURIComponent(activeProjectId)}/func/stop`, { method: "POST", body: {} });
  await loadProjectFuncPanel();
}

async function loadProjectFuncPanel() {
  ensureFuncWorkbenchShell();
  const meta = document.getElementById("project-func-meta");
  const runsBox = document.getElementById("project-func-runs");
  if (!activeProjectId || !meta || !runsBox) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/func`);
  if (!data?.ok) {
    meta.textContent = data?.error || "加载失败";
    runsBox.innerHTML = "";
    renderFuncCases([], "");
    renderFuncWorkbenchStats([], null);
    return;
  }
  const plan = data.plan;
  projectFuncPlanCases = plan?.cases || [];
  if (!plan) {
    meta.innerHTML = `尚未配置。请点「从测试点同步」拉取「测试点生成」中的页面功能测试点。`;
    renderFuncCases([], "");
    renderFuncWorkbenchStats([], null);
    runsBox.innerHTML = "";
    return;
  }
  const latest = data.latest;
  const runId = latest?.id || "";
  const cases = data.cases || [];
  const planHintTotal = (plan.cases || []).reduce((n, c) => n + (Array.isArray(c.hints) ? c.hints.length : 0), 0);
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const skillLine = skills.length
    ? skills.map(s => `${s.name || s.id}`).join(" · ")
    : "func-qa-engineer · playwright-skill";
  meta.innerHTML = `
    <div class="project-smoke-meta-grid">
      <div><strong>${escapeHtml(plan.name || "功能测试")}</strong></div>
      <div><span class="project-smoke-k">环境</span>${escapeHtml(plan.baseUrl || "（随冒烟方案）")}</div>
      <div><span class="project-smoke-k">用例数</span>${(plan.cases || []).length || 0}</div>
      <div><span class="project-smoke-k">细项数</span>${planHintTotal}（挂在各用例下，点「展开细项」查看）</div>
      <div><span class="project-smoke-k">同步来源</span>${escapeHtml(plan.sourceTitle || "未同步")}</div>
      <div><span class="project-smoke-k">测效 Skill</span>${escapeHtml(skillLine)}</div>
      <div class="hint">判定：${escapeHtml(data.passRule || "可见性细项命中率<40%判失败")} · 同步时间：${escapeHtml(plan.syncedAt || "—")}</div>
    </div>`;
  renderFuncCases(cases.length ? cases : plan.cases, runId);
  renderFuncWorkbenchStats(cases.length ? cases : plan.cases, latest);

  if (latest?.status === "running" && !projectFuncRunning) {
    projectFuncRunning = true;
    const btn = document.getElementById("project-func-run-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "功能测试执行中…";
    }
    startFuncProgressPoll(latest.id);
  }

  const runs = data.runs || [];
  if (!runs.length) {
    runsBox.innerHTML = '<p class="hint">暂无执行记录。同步用例后点「一键功能测试」。</p>';
    return;
  }
  runsBox.innerHTML = `
    <div class="links-col-title">历史记录</div>
    <div class="project-smoke-run-list">
      ${runs.map(run => `
        <article class="project-smoke-run">
          <div class="project-smoke-run-top">
            <strong class="aq-run-status ${escapeHtml(run.status || "")}">${smokeRunStatusLabel(run)}</strong>
            <span>${escapeHtml(run.finishedAt || run.startedAt || "")}</span>
            <span>${run.headed ? "有头" : "无头"}</span>
          </div>
          <div class="project-smoke-run-actions">
            <button type="button" class="btn btn-sm primary" onclick="openSmokeReportModal('${escapeHtml(run.id)}')">查看报告</button>
            <a class="btn btn-sm" target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/summary">摘要</a>
          </div>
          ${run.error ? `<p class="hint">${escapeHtml(run.error)}</p>` : ""}
        </article>`).join("")}
    </div>`;
}

function renderSmokeWorkbenchStats(cases, latest) {
  const box = document.getElementById("smoke-workbench-stats");
  if (!box) return;
  const list = Array.isArray(cases) ? cases : [];
  const total = list.length;
  const passed = list.filter(c => c.status === "passed").length;
  const failed = list.filter(c => c.status === "failed").length;
  const running = list.filter(c => c.status === "running").length;
  const pending = list.filter(c => !c.status || c.status === "pending" || c.status === "skipped").length;
  const latestLabel = latest ? smokeRunStatusLabel(latest) : "尚未执行";
  box.innerHTML = `
    <span class="smoke-stat"><b>${total}</b>用例</span>
    <span class="smoke-stat ok"><b>${passed}</b>通过</span>
    <span class="smoke-stat bad"><b>${failed}</b>失败</span>
    <span class="smoke-stat run"><b>${running}</b>执行中</span>
    <span class="smoke-stat"><b>${pending}</b>未执行/跳过</span>
    <span class="smoke-stat muted">最近：${escapeHtml(latestLabel)}</span>`;
}

async function refreshSmokeEntrySummary() {
  const box = document.getElementById("project-smoke-entry-summary");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke`);
  if (!data?.ok) {
    box.textContent = data?.error || "暂无冒烟配置";
    return;
  }
  if (!data.plan) {
    box.textContent = "该项目尚未配置冒烟方案";
    return;
  }
  const latest = data.latest;
  const cases = data.cases || data.plan.cases || [];
  const total = (data.plan.cases || data.plan.scenarios || []).length || cases.length || 0;
  const passed = (cases || []).filter(c => c.status === "passed").length;
  const failed = (cases || []).filter(c => c.status === "failed").length;
  const status = latest ? smokeRunStatusLabel(latest) : "尚未执行";
  const when = latest?.finishedAt || latest?.startedAt || "";
  box.innerHTML = `
    <span>用例 <b>${total}</b></span>
    <span>最近 <b class="aq-run-status ${escapeHtml(latest?.status || "")}">${escapeHtml(status)}</b></span>
    ${when ? `<span>${escapeHtml(when)}</span>` : ""}
    ${passed || failed ? `<span>通过 ${passed} · 失败 ${failed}</span>` : ""}
    <button type="button" class="btn btn-sm" onclick="openSmokeWorkbench()">进入冒烟台</button>`;
}

function smokeRunStatusLabel(run) {
  if (!run) return "尚未执行";
  if (run.status === "passed") return "通过";
  if (run.status === "failed") return "失败";
  if (run.status === "running") return "执行中";
  return run.status || "未知";
}

function smokeCaseStatusLabel(status) {
  const map = {
    pending: "未执行",
    running: "执行中",
    passed: "已通过",
    failed: "未通过",
    skipped: "已跳过",
  };
  return map[status] || status || "未执行";
}

function smokeCasesLookTerminal(cases) {
  const list = Array.isArray(cases) ? cases : [];
  if (!list.length) return false;
  if (list.some(c => (c.status || "") === "running")) return false;
  const hasFailed = list.some(c => (c.status || "") === "failed");
  const allDone = list.every(c => ["passed", "failed", "skipped"].includes(c.status || ""));
  return hasFailed || allDone;
}

function finishSmokeUi(status, data) {
  stopSmokeProgressPoll();
  projectSmokeRunning = false;
  projectSmokeTerminalIdlePolls = 0;
  const btn = document.getElementById("project-smoke-run-btn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "一键冒烟";
  }
  const rerunBtn = document.getElementById("project-smoke-rerun-failed-btn");
  if (rerunBtn) rerunBtn.disabled = false;
  const result = document.getElementById("project-smoke-result");
  if (result) {
    const run = data?.run || {};
    const report = run.report
      ? `<p><a target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/report/">打开 Playwright HTML 报告</a></p>`
      : "";
    const summary = run.id
      ? `<p><a target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/summary">打开冒烟摘要</a></p>`
      : "";
    const reportBtn = run.id
      ? `<p><button type="button" class="btn btn-sm primary" onclick="openSmokeReportModal('${escapeHtml(run.id)}')">查看冒烟报告</button></p>`
      : "";
    result.classList.remove("hidden");
    result.innerHTML = `
      <strong>${status === "passed" ? "冒烟通过" : "冒烟失败"}</strong>
      ${run.error ? `<p>${escapeHtml(run.error)}</p>` : ""}
      ${reportBtn}
      ${summary}
      ${report}`;
  }
  loadProjectSmokePanel();
}

function smokeCasesFallback(cases) {
  const list = Array.isArray(cases) ? cases.filter(Boolean) : [];
  if (list.length) return list;
  return (projectSmokePlanCases || []).map(item => ({
    id: item.id,
    title: item.title || item.id,
    status: item.status || "pending",
    screenshot: item.screenshot || "",
    error: item.error || "",
  }));
}

function stopSmokeProgressPoll() {
  if (projectSmokePollTimer) {
    clearInterval(projectSmokePollTimer);
    projectSmokePollTimer = null;
  }
}

function renderSmokePlanMeta(plan) {
  const meta = document.getElementById("project-smoke-meta");
  if (!meta || !plan) return;
  const accounts = plan.accounts && typeof plan.accounts === "object" ? plan.accounts : {};
  const accountKeys = Object.keys(accounts);
  const accountRows = accountKeys.map(key => {
    const acc = accounts[key] || {};
    const label = acc.label || key;
    const user = acc.username || "";
    const pass = acc.password || "";
    const note = acc.note || "";
    const sourceDb = acc.sourceDb || "";
    return `
      <div class="project-smoke-account" data-acc-key="${escapeHtml(key)}">
        <span class="project-smoke-acc-label">${escapeHtml(label)}</span>
        <input class="project-smoke-input" data-field="username" value="${escapeHtml(user)}" placeholder="账号" spellcheck="false">
        <input class="project-smoke-input" data-field="password" value="${escapeHtml(pass)}" placeholder="密码" spellcheck="false">
        ${key === "sdk" ? `<input class="project-smoke-input project-smoke-input-sm" data-field="sourceDb" value="${escapeHtml(sourceDb || plan.sdkSourceDb || "lx")}" placeholder="平台lx" title="SDK 绑定平台 sourceDb">` : ""}
        <input class="project-smoke-input project-smoke-input-note" data-field="note" value="${escapeHtml(note)}" placeholder="备注（可选）">
      </div>`;
  }).join("");
  meta.innerHTML = `
    <div class="project-smoke-meta-grid">
      <div><strong>${escapeHtml(plan.name || "业务冒烟")}</strong></div>
      <div class="project-smoke-edit-row">
        <span class="project-smoke-k">原型地址</span>
        <input id="smoke-plan-prototype" class="project-smoke-input project-smoke-input-url" value="${escapeHtml(plan.prototypeUrl || "")}" placeholder="原型 URL">
      </div>
      <div class="project-smoke-edit-row">
        <span class="project-smoke-k">测试环境</span>
        <input id="smoke-plan-baseurl" class="project-smoke-input project-smoke-input-url" value="${escapeHtml(plan.baseUrl || "")}" placeholder="测试环境 URL">
      </div>
      <div><span class="project-smoke-k">用例数</span>${(plan.cases || plan.scenarios || []).length || 0}</div>
      <div class="hint project-smoke-roadmap">
        筹备：OA 审核
        <strong>${escapeHtml((plan.oaAudit && plan.oaAudit.mode) || "api")}</strong>
        ${plan.oaAudit && plan.oaAudit.enabled ? "已启用" : "关闭"}
        · Airtest ${plan.airtest && plan.airtest.enabled ? "已启用" : "占位"}
        · 指标校验 ${plan.dataMetrics && plan.dataMetrics.enabled ? "已启用" : "待测库"}
        （S8–S11：OA 接口审 + 一/二/三级页面验）
      </div>
      <div class="project-smoke-accounts">
        <div class="project-smoke-accounts-head">
          <span class="project-smoke-k">测试账号</span>
          <span class="hint">可改种子账号；保存后单独重跑会用新数据</span>
        </div>
        ${accountRows || '<span class="hint">未配置</span>'}
      </div>
      <div class="project-smoke-plan-actions">
        <button type="button" class="btn primary btn-sm" id="smoke-plan-save-btn" onclick="saveSmokePlanMeta()">保存测试数据</button>
        <span id="smoke-plan-save-hint" class="hint"></span>
      </div>
    </div>`;
}

async function saveSmokePlanMeta() {
  if (!activeProjectId) return;
  const btn = document.getElementById("smoke-plan-save-btn");
  const hint = document.getElementById("smoke-plan-save-hint");
  const accounts = {};
  document.querySelectorAll("#project-smoke-meta .project-smoke-account[data-acc-key]").forEach(row => {
    const key = row.getAttribute("data-acc-key");
    if (!key) return;
    const patch = {};
    row.querySelectorAll("input[data-field]").forEach(input => {
      patch[input.getAttribute("data-field")] = input.value;
    });
    accounts[key] = patch;
  });
  const body = {
    prototypeUrl: document.getElementById("smoke-plan-prototype")?.value || "",
    baseUrl: document.getElementById("smoke-plan-baseurl")?.value || "",
    accounts,
  };
  if (btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
  }
  if (hint) hint.textContent = "";
  try {
    const res = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke/plan`, {
      method: "PUT",
      body,
      timeoutMs: 15000,
    });
    if (!res?.ok) throw new Error(res?.error || "保存失败");
    if (hint) hint.textContent = "已保存，后续冒烟/重跑将使用新数据";
    if (res.plan) renderSmokePlanMeta(res.plan);
  } catch (err) {
    if (hint) hint.textContent = err.message || String(err);
    else alert(err.message || String(err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存测试数据";
    }
  }
}

function renderSmokeCases(cases, runId) {
  const box = document.getElementById("project-smoke-cases");
  if (!box) return;
  const list = smokeCasesFallback(cases);
  const failedIds = list.filter(c => c.status === "failed").map(c => c.id).filter(Boolean);
  const rerunBtn = document.getElementById("project-smoke-rerun-failed-btn");
  if (rerunBtn) {
    rerunBtn.disabled = projectSmokeRunning || !failedIds.length;
    rerunBtn.title = failedIds.length ? `重跑：${failedIds.join(", ")}` : "当前无失败用例";
  }
  if (!list.length) {
    box.innerHTML = '<p class="hint">暂无用例配置</p>';
    return;
  }
  box.innerHTML = `
    <div class="links-col-title">用例进度</div>
    <div class="project-smoke-case-list">
      ${list.map(item => {
        const status = item.status || "pending";
        const shot = item.screenshot && runId
          ? `<button type="button" class="btn btn-sm" onclick="openSmokeScreenshot('${escapeHtml(runId)}','${escapeHtml(item.screenshot)}','${escapeHtml(item.id || "")}')">查看截图</button>`
          : (status === "passed" || status === "failed"
            ? '<span class="hint">暂无截图</span>'
            : "");
        const rerunOne = status === "failed" && item.id
          ? `<button type="button" class="btn btn-sm" onclick="runProjectSmoke({ caseIds: ['${escapeHtml(item.id)}'] })">重跑本条</button>`
          : "";
        return `
          <article class="project-smoke-case status-${escapeHtml(status)}">
            <div class="project-smoke-case-main">
              <strong>${escapeHtml(item.id || "")}</strong>
              ${item.role ? `<span class="project-smoke-case-role">${escapeHtml(item.role)}</span>` : ""}
              <span class="project-smoke-case-title">${escapeHtml(item.title || "")}</span>
              <span class="project-smoke-case-status">${smokeCaseStatusLabel(status)}</span>
            </div>
            <div class="project-smoke-case-actions">
              ${shot}
              ${rerunOne}
              ${item.error ? `<p class="hint">${escapeHtml(item.error)}</p>` : ""}
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

let smokeShotContext = { runId: "", caseId: "", basePath: "", hintResults: [] };

function artifactUrl(runId, relPath) {
  if (!runId || !relPath) return "";
  return `/api/auto-qa/runs/${encodeURIComponent(runId)}/artifact/${String(relPath).split("/").map(encodeURIComponent).join("/")}`;
}

function findFuncCaseForShot(caseId) {
  const fromView = (projectFuncCasesView || []).find(c => String(c.id) === String(caseId));
  if (fromView) return fromView;
  return (projectFuncPlanCases || []).find(c => String(c.id) === String(caseId)) || null;
}

function openSmokeScreenshot(runId, relPath, caseId) {
  if (!runId || !relPath) return;
  const url = artifactUrl(runId, relPath);
  const item = findFuncCaseForShot(caseId);
  const hintResults = Array.isArray(item?.hintResults) ? item.hintResults : [];
  const hints = Array.isArray(item?.hints) && item.hints.length
    ? item.hints
    : hintResults.map(h => h.text || "");
  smokeShotContext = { runId, caseId: caseId || "", basePath: relPath, hintResults };

  let modal = document.getElementById("smoke-shot-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "smoke-shot-modal";
    modal.className = "smoke-shot-modal hidden";
  }
  modal.innerHTML = `
    <div class="smoke-shot-backdrop" onclick="closeSmokeScreenshot()"></div>
    <div class="smoke-shot-dialog smoke-shot-dialog-wide">
      <div class="smoke-shot-head">
        <strong id="smoke-shot-title">用例截图</strong>
        <button type="button" class="btn btn-sm" onclick="closeSmokeScreenshot()">关闭</button>
      </div>
      <div class="smoke-shot-split">
        <div class="smoke-shot-hint-pane">
          <div class="links-col-title">细项（悬停叠区域图）</div>
          <ol id="smoke-shot-hint-list" class="func-hint-list smoke-shot-hint-list"></ol>
          <p class="hint" id="smoke-shot-hint-tip">弹窗内将鼠标移到细项上，右侧底图会叠出对应区域截图；用例列表里需点击细项才会打开本窗</p>
        </div>
        <div class="smoke-shot-stage-pane">
          <div class="smoke-shot-stage" id="smoke-shot-stage">
            <img id="smoke-shot-img" class="smoke-shot-base" alt="用例底图">
            <div id="smoke-shot-overlay-wrap" class="smoke-shot-overlay-wrap hidden">
              <img id="smoke-shot-overlay" alt="细项区域">
              <div id="smoke-shot-box" class="smoke-shot-box"></div>
            </div>
          </div>
          <p class="hint"><a id="smoke-shot-open" href="#" target="_blank" rel="noopener">新窗口打开原图</a></p>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.style.zIndex = "11000";

  const title = document.getElementById("smoke-shot-title");
  const img = document.getElementById("smoke-shot-img");
  const open = document.getElementById("smoke-shot-open");
  const list = document.getElementById("smoke-shot-hint-list");
  if (title) title.textContent = caseId ? `用例截图 · ${caseId}` : "用例截图";
  if (img) img.src = url;
  if (open) open.href = url;
  if (list) {
    if (!hints.length) {
      list.innerHTML = '<li class="hint">暂无细项数据</li>';
    } else {
      list.innerHTML = hints.map((h, hi) => {
        const hr = hintResults.find(x => Number(x.index) === hi) || null;
        const st = hr?.status || "";
        const cls = st === "hit" ? "hit" : st === "miss" ? "miss" : "";
        return `<li class="func-hint-item ${cls}" onmouseenter="previewFuncHint('${escapeHtml(runId)}','${escapeHtml(caseId || "")}',${hi})" onclick="previewFuncHint('${escapeHtml(runId)}','${escapeHtml(caseId || "")}',${hi})">
          <span class="func-hint-text">${escapeHtml(h)}</span>
          ${hr?.screenshot ? '<span class="func-hint-tag">有区域图</span>' : (st === "miss" ? '<span class="func-hint-tag miss">未定位</span>' : "")}
        </li>`;
      }).join("");
    }
  }
  clearFuncHintPreview();
  modal.classList.remove("hidden");
}

function clearFuncHintPreview() {
  const wrap = document.getElementById("smoke-shot-overlay-wrap");
  if (wrap) wrap.classList.add("hidden");
  document.querySelectorAll(".func-hint-item.active").forEach(el => el.classList.remove("active"));
}

function previewFuncHint(runId, caseId, hintIndex) {
  const item = findFuncCaseForShot(caseId);
  const basePath = item?.screenshot || smokeShotContext.basePath;
  if (!runId || !basePath) {
    alert("该用例尚无底图截图，请先执行功能测试");
    return;
  }
  const modal = document.getElementById("smoke-shot-modal");
  const modalOpen = modal && !modal.classList.contains("hidden");
  // 列表点击：打开弹窗；弹窗内悬停：只叠图，不再反复重建弹窗
  if (!modalOpen || smokeShotContext.caseId !== caseId) {
    openSmokeScreenshot(runId, basePath, caseId);
  }
  const hintResults = Array.isArray(item?.hintResults) ? item.hintResults : smokeShotContext.hintResults || [];
  const hr = hintResults.find(x => Number(x.index) === Number(hintIndex));
  const tip = document.getElementById("smoke-shot-hint-tip");
  const list = document.getElementById("smoke-shot-hint-list");
  if (list) {
    [...list.querySelectorAll(".func-hint-item")].forEach((el, i) => {
      el.classList.toggle("active", i === Number(hintIndex));
    });
  }
  const wrap = document.getElementById("smoke-shot-overlay-wrap");
  const overlay = document.getElementById("smoke-shot-overlay");
  const boxEl = document.getElementById("smoke-shot-box");
  if (!wrap || !overlay) return;
  if (!hr || (!hr.screenshot && !hr.box)) {
    wrap.classList.add("hidden");
    if (tip) tip.textContent = hr?.note || "该细项未定位到页面元素，无区域图";
    return;
  }
  const pw = Math.max(1, Number(hr.pageSize?.pageWidth) || 1);
  const ph = Math.max(1, Number(hr.pageSize?.pageHeight) || 1);
  const box = hr.box || { x: 0, y: 0, width: 40, height: 20 };
  const left = (Number(box.x) / pw) * 100;
  const top = (Number(box.y) / ph) * 100;
  const width = (Number(box.width) / pw) * 100;
  const height = (Number(box.height) / ph) * 100;
  wrap.style.left = `${Math.max(0, left)}%`;
  wrap.style.top = `${Math.max(0, top)}%`;
  wrap.style.width = `${Math.max(0.5, width)}%`;
  wrap.style.height = `${Math.max(0.5, height)}%`;
  if (hr.screenshot) {
    overlay.src = artifactUrl(runId, hr.screenshot);
    overlay.classList.remove("hidden");
  } else {
    overlay.removeAttribute("src");
    overlay.classList.add("hidden");
  }
  if (boxEl) boxEl.style.display = "block";
  wrap.classList.remove("hidden");
  if (tip) tip.textContent = hr.note ? `定位词：${hr.note}` : `细项 #${Number(hintIndex) + 1}`;
}

function closeSmokeScreenshot() {
  clearFuncHintPreview();
  const modal = document.getElementById("smoke-shot-modal");
  if (modal) modal.classList.add("hidden");
}

async function pollSmokeProgress(runId) {
  if (!runId) return null;
  const data = await api(`auto-qa/runs/${encodeURIComponent(runId)}/progress`);
  if (!data?.ok) return null;
  const cases = (data.cases && data.cases.length) ? data.cases : smokeCasesFallback([]);
  renderSmokeCases(cases, runId);
  renderSmokeWorkbenchStats(cases, data.run || { status: data.status || "running", id: runId });
  return { ...data, cases };
}

function startSmokeProgressPoll(runId) {
  stopSmokeProgressPoll();
  projectSmokeActiveRunId = runId;
  projectSmokeTerminalIdlePolls = 0;
  projectSmokePollStartedAt = Date.now();
  // 立刻拉一次，避免空窗
  pollSmokeProgress(runId);
  projectSmokePollTimer = setInterval(async () => {
    const data = await pollSmokeProgress(runId);
    if (!data) return;
    const status = data.run?.status || data.status;
    if (status && status !== "running") {
      finishSmokeUi(status, data);
      return;
    }
    const cases = data.cases || [];
    const hasRunning = cases.some(c => (c.status || "") === "running");
    const hasDone = cases.some(c => ["passed", "failed"].includes(c.status || ""));
    const allPending = cases.length > 0 && cases.every(c => {
      const s = c.status || "pending";
      return s === "pending" || s === "skipped";
    });
    // 后端还标 running，但用例已无「执行中」且已有失败/全部终态 → 解锁 UI
    if (smokeCasesLookTerminal(data.cases)) {
      projectSmokeTerminalIdlePolls += 1;
      if (projectSmokeTerminalIdlePolls >= 3) {
        finishSmokeUi("failed", data);
      }
      return;
    }
    projectSmokeTerminalIdlePolls = 0;
    // 一直全 pending：Playwright 多半卡住，75 秒后解锁，避免永远「冒烟中」
    if (allPending && !hasRunning && !hasDone && Date.now() - projectSmokePollStartedAt >= 75000) {
      await stopProjectSmoke(true);
      finishSmokeUi("failed", {
        ...data,
        run: { ...(data.run || {}), status: "failed", error: "长时间无用例进度，已自动结束（多为旧浏览器进程卡住）" },
      });
    }
  }, 1200);
}

async function stopProjectSmoke(silent = false) {
  if (!activeProjectId) return;
  stopSmokeProgressPoll();
  projectSmokeRunning = false;
  const btn = document.getElementById("project-smoke-run-btn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "一键冒烟";
  }
  try {
    const res = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke/stop`, {
      method: "POST",
      body: {},
      timeoutMs: 20000,
    });
    if (!silent) {
      const result = document.getElementById("project-smoke-result");
      if (result) {
        result.classList.remove("hidden");
        result.innerHTML = `<strong>已强制结束</strong><p class="hint">结束任务 ${res?.stopped ?? 0} 个，清理进程 ${res?.killedProcesses ?? 0} 个</p>`;
      }
    }
  } catch (err) {
    if (!silent) alert(err.message || String(err));
  }
  await loadProjectSmokePanel();
}

async function loadProjectSmokePanel() {
  ensureSmokeWorkbenchShell();
  const meta = document.getElementById("project-smoke-meta");
  const runsBox = document.getElementById("project-smoke-runs");
  const headed = document.getElementById("project-smoke-headed");
  if (!activeProjectId || !meta || !runsBox) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke`);
  if (!data?.ok) {
    meta.textContent = data?.error || "加载冒烟配置失败";
    runsBox.innerHTML = "";
    renderSmokeCases([], "");
    renderSmokeWorkbenchStats([], null);
    refreshSmokeEntrySummary();
    return;
  }
  const plan = data.plan;
  if (!plan) {
    meta.innerHTML = "该项目尚未配置冒烟方案。可在 <code>data/smoke_plans.json</code> 增加后刷新。";
    runsBox.innerHTML = "";
    renderSmokeCases([], "");
    renderSmokeWorkbenchStats([], null);
    refreshSmokeEntrySummary();
    return;
  }
  if (headed && typeof plan.defaultHeaded === "boolean" && !projectSmokeRunning) {
    headed.checked = !!plan.defaultHeaded;
  }
  projectSmokePlanCases = _smoke_cases_seed_client(plan);
  renderSmokePlanMeta(plan);

  const latest = data.latest;
  const casesToShow = (data.cases && data.cases.length) ? data.cases : projectSmokePlanCases;
  if (!projectSmokeRunning || latest?.status === "running") {
    renderSmokeCases(
      casesToShow,
      latest?.status === "running" || latest?.status === "passed" || latest?.status === "failed"
        ? (latest?.id || "")
        : "",
    );
  }
  renderSmokeWorkbenchStats(casesToShow, latest);
  refreshSmokeEntrySummary();

  if (latest?.status === "running" && !projectSmokeRunning) {
    projectSmokeRunning = true;
    const btn = document.getElementById("project-smoke-run-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = latest.headed ? "冒烟中（请看弹出的浏览器）…" : "冒烟执行中…";
    }
    document.getElementById("smoke-workbench-modal")?.classList.remove("hidden");
    startSmokeProgressPoll(latest.id);
  }

  const runs = data.runs || [];
  if (!runs.length) {
    runsBox.innerHTML = '<p class="hint">暂无冒烟记录。点击「一键冒烟」开始。</p>';
    return;
  }
  runsBox.innerHTML = `
    <div class="links-col-title">历史记录</div>
    <div class="project-smoke-run-list">
      ${runs.map(run => {
        const report = run.report
          ? `<a class="btn btn-sm" target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/report/">HTML 报告</a>`
          : "";
        const summary = `<a class="btn btn-sm" target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/summary">摘要</a>`;
        const casesBtn = `<button type="button" class="btn btn-sm primary" onclick="openSmokeReportModal('${escapeHtml(run.id)}')">查看报告</button>`;
        return `
          <article class="project-smoke-run">
            <div class="project-smoke-run-top">
              <strong class="aq-run-status ${escapeHtml(run.status || "")}">${smokeRunStatusLabel(run)}</strong>
              <span>${escapeHtml(run.finishedAt || run.startedAt || "")}</span>
              <span>${run.headed ? "有头" : "无头"}</span>
              ${run.source === "skill-manual" || run.engine === "manual" ? "<span>人工 Skill</span>" : ""}
            </div>
            <div class="project-smoke-run-actions">
              ${casesBtn}
              ${summary}
              ${report}
            </div>
            ${run.error ? `<p class="hint">${escapeHtml(run.error)}</p>` : ""}
          </article>`;
      }).join("")}
    </div>`;
}

function _smoke_cases_seed_client(plan) {
  const raw = Array.isArray(plan?.cases) && plan.cases.length
    ? plan.cases
    : (plan?.scenarios || []).map((title, i) => ({ id: `S${i + 1}`, title }));
  return raw.map((item, i) => {
    if (typeof item === "string") {
      return { id: `S${i + 1}`, title: item, role: "", status: "pending", screenshot: "", error: "" };
    }
    const enabled = item.enabled !== false;
    return {
      id: item.id || `S${i + 1}`,
      title: item.title || item.id || `S${i + 1}`,
      role: item.role || "",
      status: enabled ? (item.status || "pending") : "skipped",
      screenshot: item.screenshot || "",
      error: enabled ? (item.error || "") : (item.note || "筹备中，尚未接入本次冒烟"),
      note: item.note || "",
      enabled,
    };
  });
}

async function showSmokeRunCases(runId) {
  await openSmokeReportModal(runId);
}

async function openSmokeReportModal(runId) {
  if (!runId) return;
  const data = await api(`auto-qa/runs/${encodeURIComponent(runId)}/smoke-report`);
  if (!data?.ok) {
    alert(data?.error || "无法加载冒烟报告");
    return;
  }
  const report = data.report || {};
  const ov = report.overview || {};
  let modal = document.getElementById("smoke-report-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "smoke-report-modal";
    modal.className = "smoke-report-modal hidden";
    modal.innerHTML = `
      <div class="smoke-shot-backdrop" onclick="closeSmokeReportModal()"></div>
      <div class="smoke-report-dialog">
        <div class="smoke-shot-head">
          <strong id="smoke-report-title">冒烟报告</strong>
          <button type="button" class="btn btn-sm" onclick="closeSmokeReportModal()">关闭</button>
        </div>
        <div class="smoke-report-tabs">
          <button type="button" class="btn btn-sm primary" id="smoke-report-tab-summary" onclick="switchSmokeReportTab('summary')">用例报告</button>
          <button type="button" class="btn btn-sm" id="smoke-report-tab-pw" onclick="switchSmokeReportTab('pw')">Playwright HTML</button>
        </div>
        <div id="smoke-report-body" class="smoke-report-body"></div>
        <div id="smoke-report-pw" class="smoke-report-pw hidden">
          <iframe id="smoke-report-iframe" title="Playwright HTML Report"></iframe>
          <p class="hint">若空白可 <a id="smoke-report-pw-open" href="#" target="_blank" rel="noopener">新窗口打开</a></p>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  const title = document.getElementById("smoke-report-title");
  const body = document.getElementById("smoke-report-body");
  const iframe = document.getElementById("smoke-report-iframe");
  const pwOpen = document.getElementById("smoke-report-pw-open");
  const reportUrl = `/api/auto-qa/runs/${encodeURIComponent(runId)}/report/`;
  if (title) title.textContent = report.title || "冒烟报告";
  if (pwOpen) pwOpen.href = reportUrl;
  if (iframe) iframe.src = reportUrl;
  if (body) {
    const accounts = (report.accounts || []).map(a => `
      <tr>
        <td>${escapeHtml(a.level || "")}</td>
        <td><code>${escapeHtml(a.username || "")}</code></td>
        <td><code>${escapeHtml(a.password || "")}</code></td>
        <td>${escapeHtml(a.note || "")}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="hint">无新建/配置账号</td></tr>`;
    const cases = (report.cases || []).map(c => {
      const shot = c.screenshot
        ? `<button type="button" class="btn btn-sm" onclick="openSmokeScreenshot('${escapeHtml(runId)}','${escapeHtml(c.screenshot)}','${escapeHtml(c.id || "")}')">截图</button>`
        : "";
      const rerun = c.status === "failed" && c.id
        ? `<button type="button" class="btn btn-sm" onclick="closeSmokeReportModal(); runProjectSmoke({ caseIds: ['${escapeHtml(c.id)}'] })">重跑</button>`
        : "";
      return `
        <tr class="smoke-report-case-${escapeHtml(c.status || "")}">
          <td>${escapeHtml(c.id || "")}</td>
          <td>${escapeHtml(c.role || "")}</td>
          <td>${escapeHtml(c.title || "")}</td>
          <td>${escapeHtml(c.result || smokeCaseStatusLabel(c.status))}</td>
          <td>${escapeHtml(c.note || c.error || "")} ${shot} ${rerun}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="5" class="hint">无用例</td></tr>`;
    const issues = (report.issues || []).map(i => `
      <tr>
        <td>${escapeHtml(i.id || "")}</td>
        <td>${escapeHtml(i.role || "")}</td>
        <td>${escapeHtml(i.step || "")}</td>
        <td>${escapeHtml(i.phenomenon || "")}</td>
        <td>${escapeHtml(i.advice || "")}</td>
      </tr>`).join("");
    const pending = (report.pending || []).map(p => `<li>${escapeHtml(p)}</li>`).join("");
    const failedIds = (report.cases || []).filter(c => c.status === "failed").map(c => c.id).filter(Boolean);
    body.innerHTML = `
      <div class="smoke-report-meta">
        <div><span class="project-smoke-k">环境</span>${report.env ? `<a href="${escapeHtml(report.env)}" target="_blank" rel="noopener">${escapeHtml(report.env)}</a>` : "—"}</div>
        <div><span class="project-smoke-k">原型</span>${report.prototypeUrl ? `<a href="${escapeHtml(report.prototypeUrl)}" target="_blank" rel="noopener">${escapeHtml(report.prototypeUrl)}</a>` : "—"}</div>
        <div><span class="project-smoke-k">范围</span>${escapeHtml(report.scope || "")}</div>
        <div><span class="project-smoke-k">时间</span>${escapeHtml(report.finishedAt || report.startedAt || "")}</div>
      </div>
      <h4>总览</h4>
      <table class="smoke-report-table">
        <thead><tr><th>用例</th><th>通过</th><th>失败</th><th>跳过</th><th>结论</th></tr></thead>
        <tbody><tr>
          <td>${ov.total ?? 0}</td><td>${ov.passed ?? 0}</td><td>${ov.failed ?? 0}</td><td>${ov.skipped ?? 0}</td>
          <td>${escapeHtml(ov.conclusion || "")}</td>
        </tr></tbody>
      </table>
      ${failedIds.length ? `<p><button type="button" class="btn primary btn-sm" onclick="closeSmokeReportModal(); runProjectSmoke({ caseIds: ${JSON.stringify(failedIds)} })">重跑失败用例（${failedIds.join(", ")}）</button></p>` : ""}
      <h4>本次账号</h4>
      <table class="smoke-report-table">
        <thead><tr><th>等级</th><th>账号</th><th>密码</th><th>说明</th></tr></thead>
        <tbody>${accounts}</tbody>
      </table>
      <h4>用例明细</h4>
      <table class="smoke-report-table">
        <thead><tr><th>ID</th><th>角色</th><th>场景</th><th>结果</th><th>备注</th></tr></thead>
        <tbody>${cases}</tbody>
      </table>
      ${issues ? `<h4>失败与建议</h4><table class="smoke-report-table"><thead><tr><th>ID</th><th>角色</th><th>步骤</th><th>现象</th><th>建议</th></tr></thead><tbody>${issues}</tbody></table>` : ""}
      ${pending ? `<h4>未测 / 跳过</h4><ul class="smoke-report-pending">${pending}</ul>` : ""}
      <p class="hint">运行 ID：${escapeHtml(runId)}</p>`;
  }
  renderSmokeCases(report.cases || [], runId);
  switchSmokeReportTab("summary");
  modal.classList.remove("hidden");
}

function switchSmokeReportTab(tab) {
  const body = document.getElementById("smoke-report-body");
  const pw = document.getElementById("smoke-report-pw");
  const tabSummary = document.getElementById("smoke-report-tab-summary");
  const tabPw = document.getElementById("smoke-report-tab-pw");
  const isPw = tab === "pw";
  body?.classList.toggle("hidden", isPw);
  pw?.classList.toggle("hidden", !isPw);
  tabSummary?.classList.toggle("primary", !isPw);
  tabPw?.classList.toggle("primary", isPw);
}

function closeSmokeReportModal() {
  document.getElementById("smoke-report-modal")?.classList.add("hidden");
}

async function runProjectSmoke(opts = {}) {
  if (!activeProjectId || projectSmokeRunning) return;
  ensureSmokeWorkbenchShell();
  document.getElementById("smoke-workbench-modal")?.classList.remove("hidden");
  const headed = !!document.getElementById("project-smoke-headed")?.checked;
  const caseIds = Array.isArray(opts.caseIds) ? opts.caseIds.filter(Boolean) : [];
  const btn = document.getElementById("project-smoke-run-btn");
  const result = document.getElementById("project-smoke-result");
  projectSmokeRunning = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = caseIds.length
      ? (headed ? `重跑 ${caseIds.join(",")}（有头）…` : `重跑 ${caseIds.join(",")}…`)
      : (headed ? "冒烟中（请看弹出的浏览器）…" : "冒烟执行中…");
  }
  const rerunBtn = document.getElementById("project-smoke-rerun-failed-btn");
  if (rerunBtn) rerunBtn.disabled = true;
  if (result) {
    result.classList.remove("hidden");
    result.innerHTML = caseIds.length
      ? `<strong>正在重跑失败用例</strong><p class="hint">${escapeHtml(caseIds.join(", "))}${headed ? " · 有头可视化" : ""}</p>`
      : (headed
        ? '<strong>正在有头可视化冒烟</strong><p class="hint">请留意弹出的 Chromium 窗口；下方用例状态会实时更新。</p>'
        : '<strong>正在无头冒烟</strong><p class="hint">后台执行中，下方用例状态会实时更新。</p>');
  }
  try {
    const res = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke/run`, {
      method: "POST",
      body: { headed, ...(caseIds.length ? { caseIds } : {}) },
      timeoutMs: 30000,
    });
    if (res?.error && !res.run) {
      throw new Error(res.error);
    }
    const run = res.run || {};
    renderSmokeCases(res.cases || run.cases || [], run.id || "");
    if (run.id) {
      startSmokeProgressPoll(run.id);
    } else {
      throw new Error("未返回运行 ID");
    }
  } catch (err) {
    stopSmokeProgressPoll();
    projectSmokeRunning = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "一键冒烟";
    }
    if (rerunBtn) rerunBtn.disabled = false;
    if (result) {
      result.classList.remove("hidden");
      result.innerHTML = `<strong>冒烟失败</strong><p>${escapeHtml(err.message || String(err))}</p>`;
    }
  }
}

async function rerunFailedSmokeCases() {
  if (!activeProjectId || projectSmokeRunning) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/smoke`);
  const cases = data?.cases || data?.latest?.cases || [];
  const failedIds = (cases || []).filter(c => c.status === "failed").map(c => c.id).filter(Boolean);
  if (!failedIds.length) {
    alert("当前没有失败用例可重跑");
    return;
  }
  await runProjectSmoke({ caseIds: failedIds });
}

function openActiveProjectModule(kind) {
  const overview = activeProjectOverview;
  const project = overview?.project;
  if (!project) return;
  const context = {
    projectId: project.id,
    projectName: project.name,
    assetProjects: project.asset_projects || [],
    ganttProjectIds: project.gantt_project_ids || [],
  };
  sessionStorage.setItem("workbench_project_context", JSON.stringify(context));
  if (kind === "assets") {
    activePaProject = project.asset_projects?.[0] || "";
    openTool("project-assets");
    loadProjectAssets();
    return;
  }
  if (kind === "gantt") {
    const gantt = overview.ganttProjects?.[0];
    if (gantt?.project_name) {
      sessionStorage.setItem("gantt-focus-project", gantt.project_name);
    }
    openTool("gantt-chart");
    return;
  }
  const sourceAsset = (overview.assets || []).find(a => a.url) || {};
  if (kind === "testpoints") {
    syncGanttIndexFromLocalStorage();
    sessionStorage.setItem("tp_gen_import", JSON.stringify({
      name: sourceAsset.name || project.name,
      note: sourceAsset.note || "",
      url: sourceAsset.url || "",
      text: "",
      projectId: project.id,
      projectName: project.name,
      assetId: sourceAsset.id || "",
      ganttProjectIds: project.gantt_project_ids || [],
    }));
    openTool("test-point-generator");
    return;
  }
  if (kind === "data-verify") {
    sessionStorage.setItem("dv_handoff_v1", JSON.stringify({
      material: sourceAsset.url || sourceAsset.note || "",
      images: [],
      projectId: project.id,
      projectName: project.name,
      assetId: sourceAsset.id || "",
    }));
    openTool("data-verify");
  }
}

function initProjectAssetsDim() {
  const saved = localStorage.getItem("projectAssetsDimMode") || "env";
  activePaDimMode = saved === "iter" ? "iter" : "env";
  const sel = document.getElementById("project-assets-dim");
  if (sel) sel.value = activePaDimMode;
  updatePaColTitles();
}

function setProjectAssetsDim(mode) {
  const next = mode === "iter" ? "iter" : "env";
  if (activePaDimMode === next) return;
  activePaDimMode = next;
  localStorage.setItem("projectAssetsDimMode", activePaDimMode);
  updatePaColTitles();
  const groups = getPaGroups(activePaProject);
  activePaGroup = groups[0]?.name || "默认";
  renderPaGroups();
  renderProjectAssetsList();
  refreshTpSourceSelect();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

async function loadProjectAssets() {
  initProjectAssetsDim();
  const data = await api("project-assets");
  allPaCache = Array.isArray(data) ? data : [];
  if (data?.error) console.warn("project-assets:", data.error);
  if (!activePaProject) {
    const projects = getPaProjects();
    activePaProject = projects[0]?.name || "";
    activePaGroup = getPaGroups(activePaProject)[0]?.name || "默认";
  }
  renderPaProjects();
  renderPaGroups();
  renderProjectAssetsList();
  refreshTpSourceSelect();
  refreshPaGanttSummary();
  bindPaNav();
}

function switchPaTab(tab) {
  paActiveTab = tab;
  document.querySelectorAll(".pa-tab").forEach(el => {
    el.classList.toggle("is-active", el.dataset.paTab === tab);
  });
  document.getElementById("pa-panel-assets")?.classList.toggle("hidden", tab !== "assets");
  document.getElementById("pa-panel-testpoints")?.classList.toggle("hidden", tab !== "testpoints");
  if (tab === "testpoints") {
    refreshTpSourceSelect();
    tryRestoreTpSession();
  }
}

async function refreshPaGanttSummary() {
  const panel = document.getElementById("pa-gantt-summary");
  if (!panel) return;
  if (!activePaProject) {
    panel.classList.add("hidden");
    return;
  }
  const res = await api("gantt/project-summary?project=" + encodeURIComponent(activePaProject));
  if (!res.found) {
    panel.classList.add("hidden");
    return;
  }
  const taskLine = (res.tasks || []).slice(0, 6).map(t => {
    const range = t.start && t.end ? ` ${t.start.slice(5)}~${t.end.slice(5)}` : "";
    return `${t.name}${range}`;
  }).join(" · ");
  const more = (res.task_count || 0) > 6 ? ` 等共 ${res.task_count} 项` : "";
  panel.innerHTML = `
    <div>
      <strong>甘特排期</strong>
      <span class="pa-gantt-tasks">${escapeHtml(taskLine)}${escapeHtml(more)}</span>
      ${res.updated_at ? `<span style="color:#999;margin-left:8px">同步于 ${escapeHtml(res.updated_at)}</span>` : ""}
    </div>
    <div class="pa-gantt-actions">
      <button type="button" class="btn btn-sm" onclick="openGanttForCurrentProject()">打开甘特图</button>
    </div>`;
  panel.classList.remove("hidden");
}

function openGanttForCurrentProject() {
  if (activePaProject) {
    sessionStorage.setItem("gantt-focus-project", activePaProject);
  }
  openTool("gantt-chart");
}

async function tryRestoreTpSession() {
  if (tpSession?.id) {
    renderTpList();
    return;
  }
  const assets = getTpXmindAssets().filter(a => a.xmind_session_id);
  if (!assets.length) {
    renderTpList();
    return;
  }
  const asset = assets[0];
  const res = await api(`project-assets/xmind/sessions/${asset.xmind_session_id}?page=1&page_size=${TP_PAGE_SIZE}`);
  if (res.error) {
    renderTpList();
    return;
  }
  tpSession = res;
  tpPage = 1;
  const sel = document.getElementById("tp-source-select");
  if (sel) sel.value = asset.id;
  renderTpList();
}

function isXmindAsset(path) {
  return /\.xmind$/i.test(path || "");
}

function getTpXmindAssets() {
  return allPaCache.filter(item => {
    const project = item.project || "未分类";
    const group = getPaGroup(item);
    return project === activePaProject && group === activePaGroup && isXmindAsset(item.path);
  });
}

function refreshTpSourceSelect() {
  const sel = document.getElementById("tp-source-select");
  if (!sel) return;
  const items = getTpXmindAssets();
  const current = sel.value;
  sel.innerHTML = `<option value="">当前分组下的 xmind 文件…</option>` +
    items.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join("");
  if (current && items.some(i => i.id === current)) sel.value = current;
}

function onTpSourceChange() {}

async function parseTpFromPath(path, assetId) {
  const res = await api("project-assets/xmind/parse", {
    method: "POST",
    body: {
      path,
      asset_id: assetId || "",
      project: activePaProject || "未分类",
      group: activePaGroup || "默认",
      dim: activePaDimMode,
    },
  });
  if (res.error) {
    alert("解析失败：" + res.error);
    return;
  }
  applyTpSession(res);
  if (assetId) await refreshProjectAssets();
  refreshTpSourceSelect();
}

async function parseTpFromSelected() {
  const assetId = document.getElementById("tp-source-select")?.value;
  if (!assetId) {
    alert("请先选择 xmind 文件");
    return;
  }
  const item = allPaCache.find(i => i.id === assetId);
  if (!item?.path) return;
  await parseTpFromPath(item.path, assetId);
}

async function parseTpFromUpload(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project", activePaProject || "未分类");
  fd.append("group", activePaGroup || "默认");
  fd.append("dim", activePaDimMode);
  try {
    const res = await fetch("/api/project-assets/xmind/parse", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || data.error) {
      alert("解析失败：" + (data.error || res.statusText));
      return;
    }
    applyTpSession(data);
    await refreshProjectAssets();
    refreshTpSourceSelect();
  } catch (err) {
    alert("解析失败：" + err.message);
  } finally {
    input.value = "";
  }
}

function applyTpSession(data) {
  tpSession = data;
  tpPage = data.page || 1;
  switchPaTab("testpoints");
  renderTpList();
}

async function loadTpPage(page) {
  if (!tpSession?.id) return;
  const res = await api(`project-assets/xmind/sessions/${tpSession.id}?page=${page}&page_size=${TP_PAGE_SIZE}`);
  if (res.error) {
    alert(res.error);
    return;
  }
  tpSession = { ...tpSession, ...res };
  tpPage = page;
  renderTpList();
}

function renderTpList() {
  const list = document.getElementById("tp-list");
  const meta = document.getElementById("tp-meta");
  const pageInfo = document.getElementById("tp-page-info");
  const copyBtn = document.getElementById("tp-copy-btn");
  const prevBtn = document.getElementById("tp-prev-btn");
  const nextBtn = document.getElementById("tp-next-btn");
  if (!list) return;

  if (!tpSession || !tpSession.titles?.length) {
    list.innerHTML = `<li class="tp-empty">${tpSession ? "未解析到测试点标题" : "请选择或上传 xmind 文件"}</li>`;
    if (meta) {
      meta.textContent = tpSession
        ? `${tpSession.file_name || ""} · 共 0 条`
        : `${activePaProject || "—"} · ${activePaGroup || "—"} · 暂无解析结果`;
    }
    if (pageInfo) pageInfo.textContent = "";
    if (copyBtn) copyBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const total = tpSession.total || 0;
  const page = tpPage;
  const pageSize = TP_PAGE_SIZE;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pageCount = tpSession.page_count || Math.max(1, Math.ceil(total / pageSize));

  if (meta) {
    meta.textContent = `${tpSession.file_name || ""} · 画布「${tpSession.sheet || ""}」· 共 ${total} 条`;
  }
  if (pageInfo) {
    pageInfo.textContent = `第 ${start}-${end} 条 / 共 ${total} 条（${page}/${pageCount} 页）`;
  }
  if (copyBtn) copyBtn.disabled = false;
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= pageCount;

  list.innerHTML = tpSession.titles.map((t, i) =>
    `<li>${start + i}. ${escapeHtml(t)}</li>`
  ).join("");
}

function copyTpPage() {
  if (!tpSession?.titles?.length) return;
  const text = tpSession.titles.join("\n");
  copyToClipboard(text)
    .then(() => {
      alert(`已复制 ${tpSession.titles.length} 条用例标题（一行一条，可粘贴到禅道）`);
    })
    .catch((err) => {
      console.error("copyTpPage failed", err);
      alert("复制失败：浏览器未写入剪贴板。请确认页面焦点在本站，或改用 HTTPS/本机允许剪贴板权限后重试。");
    });
}

function tpChangePage(delta) {
  loadTpPage(tpPage + delta);
}

async function openTpFromAssetId(id) {
  const item = allPaCache.find(i => i.id === id);
  if (!item) return;
  switchPaTab("testpoints");
  if (item.xmind_session_id) {
    const res = await api(`project-assets/xmind/sessions/${item.xmind_session_id}?page=1&page_size=${TP_PAGE_SIZE}`);
    if (res.error) {
      if (item.path) await parseTpFromPath(item.path, id);
      return;
    }
    applyTpSession(res);
    return;
  }
  if (item.path) await parseTpFromPath(item.path, id);
}

/** 项目资产 → 测试点生成（写入 sessionStorage 后打开工具） */
async function sendAssetToTestPointGen(id) {
  const item = allPaCache.find(i => i.id === id);
  if (!item) return;
  if (!projectsCache.length) {
    const loaded = await api("projects");
    projectsCache = Array.isArray(loaded) ? loaded : [];
  }
  const linkedProject = projectsCache.find(p =>
    p.id === item.project_id || (p.asset_projects || []).includes(item.project)
  );
  const payload = {
    name: item.name || "",
    note: item.note || "",
    url: item.url || "",
    text: "",
    projectId: linkedProject?.id || item.project_id || "",
    projectName: linkedProject?.name || "",
    assetId: item.id || "",
  };
  // 展示用：尽量还原 URL 里的中文（剪贴板/浏览器常已是 %E6…）
  try {
    if (payload.url && /%[0-9A-Fa-f]{2}/.test(payload.url)) {
      payload.url = decodeURI(payload.url);
    }
  } catch (_) {}
  const path = item.path || "";
  if (isTextAsset(path)) {
    try {
      const res = await api("project-assets/text-file?path=" + encodeURIComponent(path));
      if (res?.content) payload.text = res.content;
    } catch (_) {}
  }
  if (!payload.url && !payload.text && !payload.note) {
    alert("该资产没有可导入的链接或文本说明");
    return;
  }
  try {
    sessionStorage.setItem("tp_gen_import", JSON.stringify(payload));
  } catch (_) {}
  const tool = tools.find(t => t.id === "test-point-generator");
  if (tool) openTool("test-point-generator");
  else alert("未找到「测试点生成」工具");
}

async function sendAssetToDataVerify(id) {
  const item = allPaCache.find(i => i.id === id);
  if (!item) return;
  if (!projectsCache.length) {
    const loaded = await api("projects");
    projectsCache = Array.isArray(loaded) ? loaded : [];
  }
  const linkedProject = projectsCache.find(p =>
    p.id === item.project_id || (p.asset_projects || []).includes(item.project)
  );
  sessionStorage.setItem("workbench_project_context", JSON.stringify({
    projectId: linkedProject?.id || item.project_id || "",
    projectName: linkedProject?.name || "",
    assetId: item.id || "",
  }));
  sessionStorage.setItem("dv_handoff_v1", JSON.stringify({
    material: item.url || item.note || "",
    images: [],
    projectId: linkedProject?.id || item.project_id || "",
    projectName: linkedProject?.name || "",
    assetId: item.id || "",
  }));
  openTool("data-verify");
}

function getPaProjects() {
  const counts = {};
  allPaCache.forEach(item => {
    const p = item.project || "未分类";
    counts[p] = (counts[p] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function getPaGroups(project) {
  const counts = {};
  allPaCache
    .filter(item => (item.project || "未分类") === project)
    .forEach(item => {
      const g = getPaGroup(item);
      counts[g] = (counts[g] || 0) + 1;
    });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function renderPaProjects() {
  const list = document.getElementById("pa-projects-list");
  if (!list) return;
  const projects = getPaProjects();
  list.innerHTML = projects.map(p =>
    `<div class="link-nav-item ${activePaProject === p.name ? "is-active" : ""}" data-project="${escapeHtml(p.name)}" role="button" tabindex="0">${escapeHtml(p.name)}<span class="nav-count">${p.count}</span></div>`
  ).join("");
}

function renderPaGroups() {
  const list = document.getElementById("pa-groups-list");
  if (!list) return;
  const groups = getPaGroups(activePaProject);
  if (!groups.some(g => g.name === activePaGroup)) {
    activePaGroup = groups[0]?.name || "默认";
  }
  list.innerHTML = groups.map(g =>
    `<div class="link-nav-item pa-group-item ${activePaGroup === g.name ? "is-active" : ""}" data-group="${escapeHtml(g.name)}" role="button" tabindex="0">
      <span class="link-nav-label">${escapeHtml(g.name)}</span>
      <span class="nav-count">${g.count}</span>
      <button type="button" class="pa-upload-btn" title="上传文件到此分组" onclick="event.stopPropagation(); openUploadModal(this.closest('.link-nav-item').dataset.group)">↑</button>
    </div>`
  ).join("");
  alignSubcategoryPanel("pa-projects-list", "pa-groups-list");
}

function updatePaProjectActive() {
  document.querySelectorAll("#pa-projects-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.project === activePaProject);
  });
}

function updatePaGroupActive() {
  document.querySelectorAll("#pa-groups-list .link-nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.group === activePaGroup);
  });
}

function bindPaNav() {
  if (paNavBound) return;
  paNavBound = true;

  const projList = document.getElementById("pa-projects-list");
  const groupList = document.getElementById("pa-groups-list");

  projList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-project]");
    if (item) setPaProject(item.dataset.project);
  });

  groupList?.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".link-nav-item[data-group]");
    if (item) setPaGroup(item.dataset.group);
  });
}

function setPaProject(project) {
  if (!project || activePaProject === project) return;
  activePaProject = project;
  activePaGroup = getPaGroups(project)[0]?.name || "默认";
  updatePaProjectActive();
  renderPaGroups();
  renderProjectAssetsList();
  refreshTpSourceSelect();
  refreshPaGanttSummary();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function setPaGroup(group) {
  if (!group || activePaGroup === group) return;
  activePaGroup = group;
  updatePaGroupActive();
  renderProjectAssetsList();
  refreshTpSourceSelect();
  if (window.LinkMotion) LinkMotion.onFilterChange("tab");
}

function getAssetIcon(item) {
  if (item.kind === "url") return "🌐";
  if (item.kind === "directory") return "📁";
  const p = (item.path || "").toLowerCase();
  if (p.endsWith(".xmind")) return "🧠";
  if (p.endsWith(".docx") || p.endsWith(".doc")) return "📝";
  if (p.endsWith(".zip") || p.endsWith(".rar") || p.endsWith(".7z")) return "📦";
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(p)) return "🖼️";
  if (/\.(txt|md|log)$/.test(p)) return "📃";
  return "📄";
}

function isTextAsset(path) {
  return /\.(txt|md|log|json|csv|env|ini|ya?ml|plist)$/i.test(path || "");
}

function isImageAsset(path) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(path || "");
}

function applyImagePreviewTransform() {
  const stage = document.getElementById("image-preview-stage");
  if (!stage) return;
  stage.style.transform = `translate(${imageViewer.panX}px, ${imageViewer.panY}px) scale(${imageViewer.zoom})`;
  const label = document.getElementById("image-preview-zoom-label");
  if (label) label.textContent = Math.round(imageViewer.zoom * 100) + "%";
}

function imagePreviewFit() {
  const viewport = document.getElementById("image-preview-viewport");
  if (!viewport || !imageViewer.naturalW) return;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const scale = Math.min(vw / imageViewer.naturalW, vh / imageViewer.naturalH);
  imageViewer.zoom = scale;
  imageViewer.panX = (vw - imageViewer.naturalW * scale) / 2;
  imageViewer.panY = (vh - imageViewer.naturalH * scale) / 2;
  applyImagePreviewTransform();
}

function imagePreviewSetZoom(zoom) {
  const viewport = document.getElementById("image-preview-viewport");
  if (!viewport || !imageViewer.naturalW) return;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const cx = vw / 2;
  const cy = vh / 2;
  const imgX = (cx - imageViewer.panX) / imageViewer.zoom;
  const imgY = (cy - imageViewer.panY) / imageViewer.zoom;
  imageViewer.zoom = Math.max(0.1, Math.min(8, zoom));
  imageViewer.panX = cx - imgX * imageViewer.zoom;
  imageViewer.panY = cy - imgY * imageViewer.zoom;
  applyImagePreviewTransform();
}

function imagePreviewZoomBy(delta) {
  imagePreviewSetZoom(imageViewer.zoom + delta);
}

function imagePreviewZoomAt(clientX, clientY, factor) {
  const viewport = document.getElementById("image-preview-viewport");
  if (!viewport || !imageViewer.naturalW) return;
  const rect = viewport.getBoundingClientRect();
  const cx = clientX - rect.left;
  const cy = clientY - rect.top;
  const imgX = (cx - imageViewer.panX) / imageViewer.zoom;
  const imgY = (cy - imageViewer.panY) / imageViewer.zoom;
  imageViewer.zoom = Math.max(0.1, Math.min(8, imageViewer.zoom * factor));
  imageViewer.panX = cx - imgX * imageViewer.zoom;
  imageViewer.panY = cy - imgY * imageViewer.zoom;
  applyImagePreviewTransform();
}

function bindImageViewerEvents() {
  if (imageViewerEventsBound) return;
  imageViewerEventsBound = true;
  const viewport = document.getElementById("image-preview-viewport");
  if (!viewport) return;

  viewport.addEventListener("wheel", (e) => {
    if (document.getElementById("image-preview-modal")?.classList.contains("hidden")) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    imagePreviewZoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  viewport.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    imageViewerDragging = true;
    viewport.classList.add("is-dragging");
    imageViewerDragStart = { x: e.clientX, y: e.clientY, panX: imageViewer.panX, panY: imageViewer.panY };
  });

  window.addEventListener("mousemove", (e) => {
    if (!imageViewerDragging) return;
    imageViewer.panX = imageViewerDragStart.panX + (e.clientX - imageViewerDragStart.x);
    imageViewer.panY = imageViewerDragStart.panY + (e.clientY - imageViewerDragStart.y);
    applyImagePreviewTransform();
  });

  window.addEventListener("mouseup", () => {
    imageViewerDragging = false;
    viewport.classList.remove("is-dragging");
  });

  viewport.addEventListener("dblclick", () => {
    if (Math.abs(imageViewer.zoom - 1) < 0.05) {
      imagePreviewFit();
    } else {
      imagePreviewSetZoom(1);
    }
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("image-preview-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
    if (e.key === "Escape") {
      closeImagePreview();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      imagePreviewStep(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      imagePreviewStep(1);
      e.preventDefault();
    } else if (e.key === "+" || e.key === "=") {
      imagePreviewZoomBy(0.25);
      e.preventDefault();
    } else if (e.key === "-" || e.key === "_") {
      imagePreviewZoomBy(-0.25);
      e.preventDefault();
    }
  });
}

function openImageGallery(items, index) {
  const list = (items || []).filter((item) => item && item.src);
  if (!list.length) return;
  imageGallery = {
    items: list,
    index: Math.max(0, Math.min(Number(index) || 0, list.length - 1)),
  };
  showImageGalleryItem();
}

function showImageGalleryItem() {
  bindImageViewerEvents();
  const item = imageGallery.items[imageGallery.index];
  if (!item) return;
  imagePreviewState = { path: item.path || "", name: item.title || "" };
  imageViewer = { zoom: 1, panX: 0, panY: 0, naturalW: 0, naturalH: 0 };
  const total = imageGallery.items.length;
  const title = item.title || item.path || "图片预览";
  document.getElementById("image-preview-title").textContent =
    total > 1 ? `${imageGallery.index + 1} / ${total}  ${title}` : title;
  document.getElementById("image-preview-meta").textContent = "加载中…";
  const prev = document.getElementById("image-preview-prev");
  const next = document.getElementById("image-preview-next");
  if (prev) prev.disabled = total < 2;
  if (next) next.disabled = total < 2;
  const img = document.getElementById("image-preview-img");
  img.onload = () => {
    imageViewer.naturalW = img.naturalWidth;
    imageViewer.naturalH = img.naturalHeight;
    document.getElementById("image-preview-meta").textContent =
      `${img.naturalWidth} × ${img.naturalHeight} px · 左右切换 · 滚轮缩放 · 拖拽平移`;
    imagePreviewFit();
  };
  img.src = item.src;
  document.getElementById("image-preview-modal").classList.remove("hidden");
}

function imagePreviewStep(delta) {
  const total = imageGallery.items.length;
  if (total < 2) return;
  imageGallery.index = (imageGallery.index + delta + total) % total;
  showImageGalleryItem();
}

function openImagePreview(path, name) {
  openImageGallery(
    [{
      src: "/api/project-assets/preview-file?path=" + encodeURIComponent(path),
      title: name || path,
      path,
    }],
    0
  );
}

function openImageInNewTab() {
  const item = imageGallery.items[imageGallery.index];
  if (item?.src) window.open(item.src, "_blank");
}

function openImagePreviewById(id) {
  const item = allPaCache.find(i => i.id === id);
  if (item?.path) openImagePreview(item.path, item.name);
}

function closeImagePreview() {
  document.getElementById("image-preview-modal")?.classList.add("hidden");
  const img = document.getElementById("image-preview-img");
  img?.removeAttribute("src");
  img.onload = null;
  imagePreviewState = { path: "", name: "" };
  imageGallery = { items: [], index: 0 };
  imageViewer = { zoom: 1, panX: 0, panY: 0, naturalW: 0, naturalH: 0 };
}

function openImagePreviewInSystem() {
  if (imagePreviewState.path) openPath(imagePreviewState.path);
}

function mimeToImageExt(mime) {
  const map = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/bmp": ".bmp" };
  return map[mime] || ".png";
}

function formatUploadStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function clearUploadPreview() {
  if (uploadPreviewUrl) {
    URL.revokeObjectURL(uploadPreviewUrl);
    uploadPreviewUrl = "";
  }
  const preview = document.getElementById("upload-paste-preview");
  const placeholder = document.getElementById("upload-paste-placeholder");
  preview?.classList.add("hidden");
  preview?.removeAttribute("src");
  placeholder?.classList.remove("hidden");
}

function showUploadPreview(file) {
  clearUploadPreview();
  const preview = document.getElementById("upload-paste-preview");
  const placeholder = document.getElementById("upload-paste-placeholder");
  if (!preview || !file?.type?.startsWith("image/")) return;
  uploadPreviewUrl = URL.createObjectURL(file);
  preview.src = uploadPreviewUrl;
  preview.classList.remove("hidden");
  placeholder?.classList.add("hidden");
}

function bindUploadPaste() {
  if (uploadPasteHandler) return;
  uploadPasteHandler = async (e) => {
    if (document.getElementById("upload-modal")?.classList.contains("hidden")) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = mimeToImageExt(item.type);
      const file = new File([blob], `截图_${formatUploadStamp()}${ext}`, { type: item.type });
      showUploadPreview(file);
      await doUpload(file);
      return;
    }
  };
  document.addEventListener("paste", uploadPasteHandler);
}

function unbindUploadPaste() {
  if (!uploadPasteHandler) return;
  document.removeEventListener("paste", uploadPasteHandler);
  uploadPasteHandler = null;
}

function openUploadModal(group) {
  uploadTargetGroup = group || activePaGroup || "默认";
  const dimLabel = activePaDimMode === "iter" ? "版本" : "环境";
  document.getElementById("upload-modal-title").textContent = "上传文件";
  document.getElementById("upload-modal-hint").textContent =
    `项目：${activePaProject || "—"} · ${dimLabel}：${uploadTargetGroup}`;
  document.getElementById("upload-file").value = "";
  document.getElementById("upload-note").value = "";
  clearUploadPreview();
  bindUploadPaste();
  document.getElementById("upload-modal").classList.remove("hidden");
  document.getElementById("upload-paste-zone")?.focus();
}

function closeUploadModal() {
  document.getElementById("upload-modal")?.classList.add("hidden");
  unbindUploadPaste();
  clearUploadPreview();
  uploadTargetGroup = "";
}

async function doUpload(file) {
  if (!file) {
    alert("请先选择文件或粘贴图片");
    return;
  }
  const btn = document.getElementById("upload-submit-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "上传中…";
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project", activePaProject || "未分类");
  fd.append("group", uploadTargetGroup || activePaGroup || "默认");
  fd.append("dim", activePaDimMode);
  fd.append("note", document.getElementById("upload-note")?.value || "");

  try {
    const res = await fetch("/api/project-assets/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || data.error) {
      alert("上传失败：" + (data.error || res.statusText));
      return;
    }
    closeUploadModal();
    await refreshProjectAssets(data);
    if (isXmindAsset(data.path)) {
      if (confirm("上传成功。是否解析测试点？")) await parseTpFromPath(data.path, data.id || data.asset_id);
    } else if (isTextAsset(data.path)) {
      if (confirm("上传成功。是否现在打开编辑？")) openTextEditor(data.path, data.name);
    }
  } catch (err) {
    alert("上传失败：" + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "上传";
    }
  }
}

async function submitUpload() {
  const fileInput = document.getElementById("upload-file");
  await doUpload(fileInput?.files?.[0]);
}

async function openTextEditor(path, name) {
  const res = await api("project-assets/text-file?path=" + encodeURIComponent(path));
  if (res.error) {
    alert("无法打开：" + res.error);
    return;
  }
  textEditorState = { path: res.path || path, name: name || path };
  document.getElementById("text-editor-title").textContent = "编辑：" + (name || path);
  document.getElementById("text-editor-content").value = res.content ?? "";
  document.getElementById("text-editor-modal").classList.remove("hidden");
}

function openTextEditorById(id) {
  const item = allPaCache.find(i => i.id === id);
  if (item?.path) openTextEditor(item.path, item.name);
}

function closeTextEditor() {
  document.getElementById("text-editor-modal")?.classList.add("hidden");
  textEditorState = { path: "", name: "" };
}

async function saveTextEditor() {
  const content = document.getElementById("text-editor-content")?.value ?? "";
  const res = await api("project-assets/text-file", {
    method: "PUT",
    body: { path: textEditorState.path, content },
  });
  if (res.error) {
    alert("保存失败：" + res.error);
    return;
  }
  closeTextEditor();
}

function openProjectAsset(id) {
  const item = allPaCache.find(i => i.id === id);
  if (!item) return;
  if (item.kind === "url" && item.url) {
    window.open(item.url, "_blank");
  } else if (item.path && isImageAsset(item.path)) {
    openImagePreview(item.path, item.name);
  } else if (item.path && isTextAsset(item.path)) {
    openTextEditor(item.path, item.name);
  } else if (item.path) {
    openPath(item.path);
  }
}

function renderProjectAssetItem(item) {
  const rawPath = item.path || "";
  const path = escapeHtml(rawPath);
  const rawUrl = item.url || "";
  const url = escapeHtml(rawUrl);
  const name = escapeHtml(item.name);
  const note = escapeHtml(item.note || "");
  const id = escapeHtml(item.id);
  const icon = getAssetIcon(item);
  const safePath = rawPath.replace(/\\/g, "\\\\");
  const subline = item.kind === "url" ? url : path;
  const kindLabel = item.kind === "url" ? "链接" : item.kind === "directory" ? "目录" : "文件";
  const textEditBtn = isTextAsset(rawPath)
    ? `<button class="btn btn-sm" onclick="openTextEditorById('${id}')" title="浏览器内编辑">✎</button>`
    : "";
  const imagePreviewBtn = isImageAsset(rawPath)
    ? `<button class="btn btn-sm" onclick="openImagePreviewById('${id}')" title="浏览器内预览">👁</button>`
    : "";
  const xmindBtn = isXmindAsset(rawPath)
    ? `<button class="btn btn-sm" onclick="openTpFromAssetId('${id}')" title="解析测试点">测</button>`
    : "";
  const sendTpBtn =
    item.kind === "url" || (rawUrl && /^https?:\/\//i.test(rawUrl)) || isTextAsset(rawPath)
      ? `<button class="btn btn-sm" onclick="sendAssetToTestPointGen('${id}')" title="送到测试点生成">→测点</button>`
      : "";
  const sendDvBtn =
    item.kind === "url" || (rawUrl && /^https?:\/\//i.test(rawUrl))
      ? `<button class="btn btn-sm" onclick="sendAssetToDataVerify('${id}')" title="送到数据验证">→验证</button>`
      : "";
  return `<div class="link-bookmark" onclick="openProjectAsset('${id}')" title="${subline}">
    <span class="link-bookmark-icon-fallback" style="display:flex">${icon}</span>
    <div class="link-bookmark-body">
      <div class="link-bookmark-name">${name} <span class="tag">${kindLabel}</span></div>
      ${note ? `<div class="link-bookmark-note">${note}</div>` : ""}
      <div class="link-bookmark-url">${subline}</div>
      ${renderTags(item.tags)}
    </div>
    <div class="link-bookmark-actions" onclick="event.stopPropagation()">
      ${sendDvBtn}
      ${sendTpBtn}
      ${xmindBtn}
      ${imagePreviewBtn}
      ${textEditBtn}
      ${rawPath ? `<button class="btn btn-sm" onclick="copyPath('${safePath}')" title="复制路径">⎘</button>` : ""}
      ${rawUrl ? `<button class="btn btn-sm" onclick="copyText(null,'${rawUrl.replace(/'/g, "\\'")}')" title="复制链接">⎘</button>` : ""}
      <button class="btn btn-sm" onclick="showForm('project-assets','${id}')" title="编辑">✎</button>
      <button class="btn btn-sm danger" onclick="deleteItem('project-assets','${id}')" title="删除">✕</button>
    </div>
  </div>`;
}

function renderProjectAssetsList() {
  const q = (document.getElementById("search-project-assets")?.value || "").toLowerCase();
  const filtered = allPaCache.filter(item => {
    const project = item.project || "未分类";
    const group = getPaGroup(item);
    const matchNav = project === activePaProject && group === activePaGroup;
    const matchSearch = !q || JSON.stringify(item).toLowerCase().includes(q);
    return matchNav && matchSearch;
  });
  const list = document.getElementById("list-project-assets");
  if (!list) return;
  list.innerHTML = filtered.length
    ? filtered.map(item => renderProjectAssetItem(item)).join("")
    : `<div class="empty">该分组下暂无资产，可点右上角新增</div>`;
}

async function refreshProjectAssets(savedItem) {
  const data = await api("project-assets");
  allPaCache = Array.isArray(data) ? data : [];
  if (savedItem) {
    activePaProject = savedItem.project || "未分类";
    const g = (savedItem[getPaGroupField()] || "").trim();
    activePaGroup = g || "默认";
  }
  renderPaProjects();
  renderPaGroups();
  renderProjectAssetsList();
  refreshTpSourceSelect();
  refreshPaGanttSummary();
}

async function renderList(type, renderFn) {
  const items = await api(type);
  const q = (document.getElementById("search-" + type)?.value || "").toLowerCase();
  const filtered = items.filter(item => JSON.stringify(item).toLowerCase().includes(q));
  const list = document.getElementById("list-" + type);
  list.innerHTML = filtered.length
    ? filtered.map(item => renderFn(item)).join("")
    : `<div class="empty">暂无数据，点击上方按钮新增</div>`;
}

function renderTags(tags) {
  if (!tags || !tags.length) return "";
  const arr = Array.isArray(tags) ? tags : tags.split(",").map(s => s.trim());
  return `<div class="item-tags">${arr.map(t => `<span class="tag">${t}</span>`).join("")}</div>`;
}

function renderFilePathItem(item) {
  const rawPath = item.path || "";
  const path = escapeHtml(rawPath);
  const name = escapeHtml(item.name);
  const note = escapeHtml(item.note || "");
  const id = escapeHtml(item.id);
  const icon = item.type === "file" ? "📄" : "📁";
  const safePath = rawPath.replace(/\\/g, "\\\\");
  return `<div class="link-bookmark" onclick="openPath('${safePath}')" title="${path}">
    <span class="link-bookmark-icon-fallback" style="display:flex">${icon}</span>
    <div class="link-bookmark-body">
      <div class="link-bookmark-name">${name}</div>
      ${note ? `<div class="link-bookmark-note">${note}</div>` : ""}
      <div class="link-bookmark-url">${path}</div>
    </div>
    <div class="link-bookmark-actions" onclick="event.stopPropagation()">
      <button class="btn btn-sm" onclick="copyPath('${safePath}')" title="复制">⎘</button>
      <button class="btn btn-sm" onclick="showForm('file-paths','${id}')" title="编辑">✎</button>
      <button class="btn btn-sm danger" onclick="deleteItem('file-paths','${id}')" title="删除">✕</button>
    </div>
  </div>`;
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function getLinkNote(item) {
  const problem = (item.problem || "").trim();
  if (!problem) return "";
  if (problem.endsWith("相关访问入口") || problem.endsWith("常用链接")) return "";
  return problem;
}

function getLinkIcon(item) {
  if (item.icon) return item.icon;
  const domain = getDomain(item.url);
  if (!domain) return "";
  return `https://${domain}/favicon.ico`;
}

function linkIconFallback(img, domain) {
  if (!img.dataset.triedGoogle && domain) {
    img.dataset.triedGoogle = "1";
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
    return;
  }
  img.style.display = "none";
  const fb = img.nextElementSibling;
  if (fb) fb.style.display = "flex";
}

function renderLinkItem(item) {
  const rawUrl = item.url || "";
  const url = escapeHtml(rawUrl);
  const name = escapeHtml(item.name);
  const note = escapeHtml(getLinkNote(item));
  const id = escapeHtml(item.id);
  const domain = escapeHtml(getDomain(rawUrl));
  const icon = escapeHtml(getLinkIcon(item));
  return `<div class="link-bookmark" onclick="window.open('${url}','_blank')" title="${url}">
    <img class="link-bookmark-icon" src="${icon}" alt="" data-domain="${domain}" onerror="linkIconFallback(this,'${domain}')">
    <span class="link-bookmark-icon-fallback" style="display:none">🌐</span>
    <div class="link-bookmark-body">
      <div class="link-bookmark-name">${name}</div>
      ${note ? `<div class="link-bookmark-note">${note}</div>` : ""}
      <div class="link-bookmark-url">${url}</div>
    </div>
    <div class="link-bookmark-actions" onclick="event.stopPropagation()">
      <button class="btn btn-sm" onclick="showForm('links','${id}')" title="编辑">✎</button>
      <button class="btn btn-sm danger" onclick="deleteItem('links','${id}')" title="删除">✕</button>
    </div>
  </div>`;
}

function renderCommandItem(item) {
  return `<div class="item">
    <div class="item-body">
      <div class="item-title">${item.name} <span class="tag">${item.category || ""}</span></div>
      <div class="item-meta"><code>${item.command}</code></div>
      ${item.note ? `<div class="item-note">${item.note}</div>` : ""}
    </div>
    <div class="item-actions">
      <button class="btn" onclick="copyText(null, '${item.command.replace(/'/g, "\\'")}')">复制</button>
      <button class="btn" onclick="showForm('commands','${item.id}')">编辑</button>
      <button class="btn danger" onclick="deleteItem('commands','${item.id}')">删除</button>
    </div>
  </div>`;
}

function bindSearch() {
  document.getElementById("search-file-paths")?.addEventListener("input", () => {
    renderFilePathsList();
    if (window.LinkMotion) LinkMotion.onFilterChange("search");
  });
  document.getElementById("search-links")?.addEventListener("input", () => {
    renderLinksList();
    if (window.LinkMotion) LinkMotion.onFilterChange("search");
  });
  document.getElementById("search-project-assets")?.addEventListener("input", () => {
    renderProjectAssetsList();
    if (window.LinkMotion) LinkMotion.onFilterChange("search");
  });
  document.getElementById("search-qa-notes")?.addEventListener("input", () => {
    renderQaNotesList();
  });
}

function bindConverters() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTool = tab.dataset.tool;
      document.getElementById("converter-input").value = "";
      document.getElementById("converter-output").value = "";
    });
  });
  document.getElementById("btn-convert").addEventListener("click", () => {
    const input = document.getElementById("converter-input").value;
    const fn = converters[currentTool];
    document.getElementById("converter-output").value = fn ? fn(input) : "";
  });
}

function bindReportType() {
  const sel = document.getElementById("report-type");
  const render = () => {
    const fields = REPORT_FIELDS[sel.value] || [];
    document.getElementById("report-fields").innerHTML = fields.map(f =>
      `<div class="form-row">
        <label>${f.label}</label>
        ${f.type === "textarea"
          ? `<textarea id="rf-${f.key}" rows="3" placeholder="${f.placeholder || ""}"></textarea>`
          : `<input id="rf-${f.key}" placeholder="${f.placeholder || ""}">`}
      </div>`
    ).join("");
  };
  sel.addEventListener("change", render);
  render();
}

async function generateReport() {
  const templateId = document.getElementById("report-type").value;
  const fields = REPORT_FIELDS[templateId] || [];
  const data = {};
  fields.forEach(f => { data[f.key] = document.getElementById("rf-" + f.key)?.value || ""; });
  const res = await api("reports/generate", { method: "POST", body: { template_id: templateId, fields: data } });
  document.getElementById("report-output").value = res.content || "";
}

async function openPath(path) {
  showPathLoading(path);
  try {
    const res = await api("open-path", { method: "POST", body: { path } });
    if (res.error) alert(res.error);
  } catch {
    alert("打开失败，请稍后重试");
  } finally {
    hidePathLoading();
  }
}

/* ---------- 测试脚本入口 + ADB 远程装包 ---------- */
let tsInfoCache = null;
let devicePlatform = "android";
let adbSelectedSerial = "";
let adbDevicesCache = [];
let adbLogsBySerial = {};
let adbInstallPollTimer = null;
let adbUiBound = false;
let adbProxyHistory = [];
let adbMirrorActiveSerial = "";
let adbMirrorDeviceSize = { w: 1080, h: 1920 };
let adbMirrorPointer = null;
let adbMirrorStatusTimer = null;

let iosSelectedUdid = "";
let iosDevicesCache = [];
let iosLogsByUdid = {};
let iosInstallPollTimer = null;
let iosUiBound = false;

function appendAdbLog(lines, serial) {
  const key = serial || adbSelectedSerial || "_global";
  const arr = Array.isArray(lines) ? lines : [String(lines || "")];
  const chunk = arr.filter(Boolean).join("\n");
  if (!chunk) return;
  adbLogsBySerial[key] = (adbLogsBySerial[key] ? adbLogsBySerial[key] + "\n" : "") + chunk;
  if (key === adbSelectedSerial || (!adbSelectedSerial && key === "_global")) {
    syncAdbLogView();
  }
}

function syncAdbLogView() {
  const el = document.getElementById("adb-log");
  if (!el) return;
  const key = adbSelectedSerial || "_global";
  el.textContent = adbLogsBySerial[key] || "";
  el.scrollTop = el.scrollHeight;
}

function clearAdbLog() {
  const key = adbSelectedSerial || "_global";
  adbLogsBySerial[key] = "";
  syncAdbLogView();
}

function showTestScriptHub() {
  document.getElementById("ts-hub")?.classList.remove("hidden");
  document.getElementById("ts-adb")?.classList.add("hidden");
  renderTestScriptHub();
}

async function renderTestScriptHub() {
  const grid = document.getElementById("ts-cards");
  if (!grid) return;
  if (!tsInfoCache) {
    tsInfoCache = await api("test-scripts/info");
  }
  const dirPath = (tsInfoCache && tsInfoCache.path) || "integrated/test_tool";
  const fileMap = {};
  (tsInfoCache.files || []).forEach(f => { fileMap[f.name] = f.path; });
  const recharge = tsInfoCache && tsInfoCache.recharge_callback;

  const cards = [
    {
      icon: "📱",
      name: "远程装包",
      cat: "安卓 ADB · iOS USB / IPA",
      action: "showAdbPanel()",
    },
    {
      icon: "🌐",
      name: "网络抓包",
      cat: "请求 · 响应 · 解帧",
      action: "openTool('network-capture')",
    },
    {
      icon: "💳",
      name: "充值回调模拟",
      cat: recharge ? "按账号查单 · 模拟支付回调" : "未找到工具目录",
      action: recharge
        ? "launchRechargeCallback()"
        : `alert('未找到启动充值模拟.bat\\n路径: integrated/test_point_generator/改包系统/充值回调模拟')`,
    },
    {
      icon: "📗",
      name: "Excel → 禅道用例",
      cat: "excel2cast.py",
      action: fileMap["excel2cast.py"]
        ? `openPath('${String(fileMap["excel2cast.py"]).replace(/\\/g, "\\\\")}')`
        : `openPath('${dirPath.replace(/\\/g, "\\\\")}')`,
    },
    {
      icon: "🧩",
      name: "XMind → CSV",
      cat: "xmind2csv.py",
      action: fileMap["xmind2csv.py"]
        ? `openPath('${String(fileMap["xmind2csv.py"]).replace(/\\/g, "\\\\")}')`
        : `openPath('${dirPath.replace(/\\/g, "\\\\")}')`,
    },
    {
      icon: "⚡",
      name: "快捷启动 (CLI)",
      cat: "黑窗口备用入口",
      action: fileMap["快捷启动.bat"]
        ? `openPath('${String(fileMap["快捷启动.bat"]).replace(/\\/g, "\\\\")}')`
        : `alert('未找到快捷启动.bat')`,
    },
    {
      icon: "📁",
      name: "打开脚本目录",
      cat: dirPath,
      action: `openPath('${dirPath.replace(/\\/g, "\\\\")}')`,
    },
  ];

  grid.innerHTML = cards.map(c =>
    `<div class="card" onclick="${c.action}">
      <div class="card-icon">${c.icon}</div>
      <div class="card-name">${escapeHtml(c.name)}</div>
      <div class="card-cat">${escapeHtml(c.cat)}</div>
    </div>`
  ).join("");
}

async function showAdbPanel() {
  document.getElementById("ts-hub")?.classList.add("hidden");
  document.getElementById("ts-adb")?.classList.remove("hidden");
  bindAdbUiOnce();
  bindIosUiOnce();
  await switchDevicePlatform(devicePlatform || "android");
}

async function launchRechargeCallback() {
  showPathLoading("充值回调模拟");
  try {
    const res = await api("test-scripts/recharge-callback/launch", { method: "POST" });
    if (!res.ok) {
      alert(res.error || "启动失败");
      return;
    }
    if (res.url && !res.opened) {
      window.open(res.url, "_blank");
    }
  } catch (e) {
    alert("启动失败: " + (e && e.message ? e.message : e));
  } finally {
    hidePathLoading();
  }
}

function bindAdbUiOnce() {
  if (adbUiBound) return;
  adbUiBound = true;
  const fileInput = document.getElementById("adb-apk-file");
  const dropzone = document.getElementById("adb-dropzone");
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) uploadAndInstallAdbApk(f);
    fileInput.value = "";
  });
  if (dropzone) {
    ["dragenter", "dragover"].forEach(ev => {
      dropzone.addEventListener(ev, e => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(ev => {
      dropzone.addEventListener(ev, e => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
      });
    });
    dropzone.addEventListener("drop", e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) uploadAndInstallAdbApk(f);
    });
    dropzone.addEventListener("click", () => fileInput?.click());
  }
  bindAdbMirrorPointer();
  bindAdbExchangeUiOnce();
  document.getElementById("adb-proxy-host")?.addEventListener("change", rememberAdbProxyFromForm);
  document.getElementById("adb-proxy-port")?.addEventListener("change", rememberAdbProxyFromForm);
}

function bindAdbExchangeUiOnce() {
  const pushInput = document.getElementById("adb-push-file");
  const pushDz = document.getElementById("adb-exchange-dropzone");
  pushInput?.addEventListener("change", () => {
    const f = pushInput.files && pushInput.files[0];
    if (f) adbExchangePushFile(f);
    pushInput.value = "";
  });
  if (pushDz) {
    ["dragenter", "dragover"].forEach(ev => {
      pushDz.addEventListener(ev, e => {
        e.preventDefault();
        pushDz.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(ev => {
      pushDz.addEventListener(ev, e => {
        e.preventDefault();
        pushDz.classList.remove("is-dragover");
      });
    });
    pushDz.addEventListener("drop", e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) adbExchangePushFile(f);
    });
    pushDz.addEventListener("click", () => pushInput?.click());
  }
  const input = document.getElementById("adb-exchange-input");
  input?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = (input.value || "").trim();
      if (/^https?:\/\//i.test(v)) adbExchangeOpenUrl();
      else adbExchangeShareText();
    }
  });
}

function adbExchangeRequireDevice() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return false;
  }
  return true;
}

function showAdbExchangePreview(files) {
  const box = document.getElementById("adb-exchange-preview");
  if (!box) return;
  const list = Array.isArray(files) ? files : files ? [files] : [];
  if (!list.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = list
    .map(f => {
      const rel = f.rel || "";
      const name = f.name || rel;
      const src = "/api/adb/exchange/file?path=" + encodeURIComponent(rel);
      const isImg = /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
      return (
        `<a class="adb-exchange-thumb" href="${src}" target="_blank" title="${name}">` +
        (isImg ? `<img src="${src}" alt="${name}">` : `<span>${name}</span>`) +
        `</a>`
      );
    })
    .join("");
}

function renderAdbMediaList(items) {
  const box = document.getElementById("adb-media-list");
  const btn = document.getElementById("btn-adb-pull-media");
  if (!box) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    box.innerHTML = `<div class="adb-module-hint">暂无最近图片。可点「截屏到电脑」，或先在手机相册拍照/截图后再刷新。</div>`;
    if (btn) btn.disabled = true;
    return;
  }
  box.innerHTML = list
    .map((it, i) => {
      const path = String(it.path || "");
      const name = it.name || path;
      const dir = it.dir || "";
      return (
        `<label class="adb-media-item">` +
        `<input type="checkbox" class="adb-media-check" data-path="${encodeURIComponent(path)}">` +
        `<span class="adb-media-name" title="${path.replace(/"/g, "&quot;")}">${name.replace(/</g, "&lt;")}</span>` +
        `<span class="adb-media-dir">${dir.replace(/</g, "&lt;")}</span>` +
        `</label>`
      );
    })
    .join("");
  const syncBtn = () => {
    if (btn) btn.disabled = !box.querySelector(".adb-media-check:checked");
  };
  box.querySelectorAll(".adb-media-check").forEach(el => el.addEventListener("change", syncBtn));
  syncBtn();
}

async function adbExchangeOpenUrl() {
  if (!adbExchangeRequireDevice()) return;
  const input = document.getElementById("adb-exchange-input");
  let url = (input?.value || "").trim();
  if (!url) {
    alert("请输入链接");
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 打开链接 → " + serial + " ——", serial);
  const res = await api("adb/exchange/open-url", { method: "POST", body: { serial, url } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) appendAdbLog(res.error || "打开失败", serial);
}

async function adbExchangeShareText() {
  if (!adbExchangeRequireDevice()) return;
  const text = (document.getElementById("adb-exchange-input")?.value || "").trim();
  if (!text) {
    alert("请输入要分享的文字");
    return;
  }
  if (/^https?:\/\//i.test(text)) {
    return adbExchangeOpenUrl();
  }
  const serial = adbSelectedSerial;
  appendAdbLog("—— 分享文字 → " + serial + " ——", serial);
  const res = await api("adb/exchange/share-text", { method: "POST", body: { serial, text } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) appendAdbLog(res.error || "分享失败", serial);
}

async function adbExchangeGetClipboard() {
  if (!adbExchangeRequireDevice()) return;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 读取手机剪贴板 → " + serial + " ——", serial);
  const res = await api("adb/exchange/clipboard", { method: "POST", body: { serial } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "读取失败", serial);
    alert(res.error || "读取手机剪贴板失败");
    return;
  }
  const text = res.text || "";
  const input = document.getElementById("adb-exchange-input");
  if (input) input.value = text;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      appendAdbLog("已填入输入框，并复制到电脑剪贴板（" + text.length + " 字）", serial);
    } else {
      appendAdbLog("已填入输入框（浏览器不支持直接写电脑剪贴板，请手动 Ctrl+C）", serial);
    }
  } catch (e) {
    appendAdbLog(
      "已填入输入框，但写入电脑剪贴板失败（可手动全选复制）: " +
        (e && e.message ? e.message : e),
      serial
    );
  }
}

async function adbExchangeScreencap() {
  if (!adbExchangeRequireDevice()) return;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 截屏到电脑 → " + serial + " ——", serial);
  const res = await api("adb/exchange/screencap", { method: "POST", body: { serial } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "截屏失败", serial);
    return;
  }
  showAdbExchangePreview(res);
}

async function adbExchangeListMedia() {
  if (!adbExchangeRequireDevice()) return;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 列出最近图片 → " + serial + " ——", serial);
  const res = await api(
    "adb/exchange/recent-media?serial=" + encodeURIComponent(serial) + "&limit=20"
  );
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "列举失败", serial);
    renderAdbMediaList([]);
    return;
  }
  renderAdbMediaList(res.items || []);
}

async function adbExchangePullSelected() {
  if (!adbExchangeRequireDevice()) return;
  const checks = [
    ...document.querySelectorAll("#adb-media-list .adb-media-check:checked"),
  ];
  const paths = checks
    .map(el => {
      try {
        return decodeURIComponent(el.getAttribute("data-path") || "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  if (!paths.length) {
    alert("请先勾选图片");
    return;
  }
  const serial = adbSelectedSerial;
  appendAdbLog("—— 拉取 " + paths.length + " 个文件 → 电脑 ——", serial);
  const res = await api("adb/exchange/pull", { method: "POST", body: { serial, paths } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "拉取失败", serial);
    return;
  }
  showAdbExchangePreview(res.files || []);
}

async function adbExchangePushFile(file) {
  if (!adbExchangeRequireDevice()) return;
  if (!file) return;
  const serial = adbSelectedSerial;
  appendAdbLog(
    `—— 推送文件: ${file.name}（${(file.size / 1024).toFixed(1)} KB）→ ${serial} ——`,
    serial
  );
  const fd = new FormData();
  fd.append("file", file);
  fd.append("serial", serial);
  try {
    const res = await fetch("/api/adb/exchange/push", { method: "POST", body: fd }).then(r =>
      r.json()
    );
    appendAdbLog(res.logs || [], serial);
    if (!res.ok) appendAdbLog(res.error || "推送失败", serial);
  } catch (e) {
    appendAdbLog("推送失败: " + (e && e.message ? e.message : e), serial);
  }
}

/** 与测试点生成（agile-sim）共用 localStorage 中的 OpenAI 兼容配置 */
function getAgileSimLlmConfig() {
  try {
    const provider = (localStorage.getItem("agile_sim_provider") || "openai").trim();
    if (provider === "cursor") return null;
    const model =
      (localStorage.getItem("agile_sim_openai_model") || "").trim() ||
      (localStorage.getItem("agile_sim_model") || "").trim() ||
      "gpt-4o-mini";
    const apiKey = (localStorage.getItem("agile_sim_api_key") || "").trim();
    if (!apiKey) return null;
    return {
      baseUrl: (localStorage.getItem("agile_sim_base_url") || "https://api.openai.com/v1").trim(),
      apiKey,
      model,
      provider,
      source: "agile-sim",
    };
  } catch {
    return null;
  }
}

function syncAgileSimLlmToSprite() {
  const agile = getAgileSimLlmConfig();
  if (!agile?.apiKey) return Promise.resolve(null);
  return api("auto-qa/sprite/llm-config", {
    method: "PUT",
    body: {
      baseUrl: agile.baseUrl,
      model: agile.model,
      apiKey: agile.apiKey,
      source: "agile-sim",
    },
  }).catch(() => null);
}

let adbLastLogcat = { rel: "", excerpt: "", name: "" };

function setAdbCrashAnalysis(text, isError) {
  const el = document.getElementById("adb-crash-analysis");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", !!isError);
}

function setAdbLogcatDownload(rel, name) {
  const a = document.getElementById("adb-logcat-download");
  const btn = document.getElementById("btn-adb-analyze-logcat");
  if (a) {
    if (rel) {
      a.href =
        "/api/adb/exchange/file?path=" +
        encodeURIComponent(rel) +
        "&download=1";
      a.download = name || "logcat.txt";
      a.classList.remove("hidden");
    } else {
      a.href = "#";
      a.classList.add("hidden");
    }
  }
  if (btn) btn.disabled = !rel;
}

async function adbClearLogcat() {
  if (!adbExchangeRequireDevice()) return;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 清除设备 logcat ——", serial);
  const res = await api("adb/logcat/clear", { method: "POST", body: { serial } });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "清除失败", serial);
    return;
  }
  clearAdbLog();
  appendAdbLog("设备 logcat 已清空，请复现崩溃后再点「抓取日志到 txt」", serial);
  setAdbCrashAnalysis("日志已清除。复现问题后抓取日志即可分析。");
  setAdbLogcatDownload("", "");
  adbLastLogcat = { rel: "", excerpt: "", name: "" };
}

async function adbDumpLogcat() {
  if (!adbExchangeRequireDevice()) return;
  const serial = adbSelectedSerial;
  const btn = document.getElementById("btn-adb-dump-logcat");
  if (btn) btn.disabled = true;
  appendAdbLog("—— 抓取 logcat 保存为 txt ——", serial);
  setAdbCrashAnalysis("正在抓取设备日志…");
  try {
    const res = await api("adb/logcat/dump", { method: "POST", body: { serial } });
    appendAdbLog(res.logs || [], serial);
    if (!res.ok) {
      appendAdbLog(res.error || "抓取失败", serial);
      setAdbCrashAnalysis(res.error || "抓取失败", true);
      return;
    }
    adbLastLogcat = {
      rel: res.rel || "",
      excerpt: res.excerpt || "",
      name: res.name || "logcat.txt",
    };
    setAdbLogcatDownload(adbLastLogcat.rel, adbLastLogcat.name);
    // 自动触发下载
    if (adbLastLogcat.rel) {
      const a = document.createElement("a");
      a.href =
        "/api/adb/exchange/file?path=" +
        encodeURIComponent(adbLastLogcat.rel) +
        "&download=1";
      a.download = adbLastLogcat.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    showAdbExchangePreview({
      rel: res.rel,
      name: res.name,
    });
    if (!res.has_crash_hint) {
      setAdbCrashAnalysis(
        "日志已保存。未明显检测到 FATAL/ANR 关键字，仍将尝试分析（可先「清除日志」→ 复现崩溃 → 再抓取）。"
      );
    }
    // 分析失败不影响已成功保存的 logcat，单独捕获以免误报「抓取失败」
    try {
      await adbAnalyzeLogcat();
    } catch (analyzeErr) {
      const msg =
        analyzeErr && analyzeErr.message ? analyzeErr.message : String(analyzeErr);
      setAdbCrashAnalysis("分析失败: " + msg, true);
      appendAdbLog("分析失败: " + msg, serial);
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    appendAdbLog("抓取失败: " + msg, serial);
    setAdbCrashAnalysis("抓取失败: " + msg, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function adbAnalyzeLogcat() {
  if (!adbLastLogcat.rel && !adbLastLogcat.excerpt) {
    alert("请先抓取日志");
    return;
  }
  let provider = "openai";
  try {
    provider = (localStorage.getItem("agile_sim_provider") || "openai").trim();
  } catch {
    /* ignore */
  }
  if (provider === "cursor") {
    setAdbCrashAnalysis(
      "当前测试点生成使用的是 Cursor 云端模式。崩溃分析需 OpenAI 兼容 API，请在测试点生成页切换到 OpenAI 兼容并填写 Key。",
      true
    );
    return;
  }
  const cfg = getAgileSimLlmConfig();
  // getAgileSimLlmConfig 在未配置 Key / Cursor 模式时会返回 null
  if (!cfg || !cfg.apiKey) {
    setAdbCrashAnalysis(
      "未找到 API Key。请先打开「测试点生成」配置 OpenAI 兼容 Key（与那边共用，此处不重复设置）。",
      true
    );
    return;
  }
  const serial = adbSelectedSerial;
  const btn = document.getElementById("btn-adb-analyze-logcat");
  if (btn) btn.disabled = true;
  setAdbCrashAnalysis("正在用大模型分析崩溃原因（复用测试点生成配置）…");
  appendAdbLog("—— AI 分析 logcat（模型: " + (cfg.model || "default") + "）——", serial);
  try {
    const res = await api("adb/logcat/analyze", {
      method: "POST",
      body: {
        rel: adbLastLogcat.rel,
        excerpt: adbLastLogcat.excerpt,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
      },
    });
    if (!res.ok) {
      setAdbCrashAnalysis(res.error || "分析失败", true);
      appendAdbLog(res.error || "分析失败", serial);
      return;
    }
    setAdbCrashAnalysis(res.analysis || "（无分析结果）");
    appendAdbLog("崩溃分析完成", serial);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    setAdbCrashAnalysis("分析失败: " + msg, true);
    appendAdbLog("分析失败: " + msg, serial);
  } finally {
    if (btn) btn.disabled = !adbLastLogcat.rel;
  }
}

async function loadAdbConfigToForm() {
  const res = await api("adb/config");
  const cfg = res.config || {};
  const portEl = document.getElementById("adb-tcp-port");
  const shareEl = document.getElementById("adb-share-dir");
  const discEl = document.getElementById("adb-disconnect-first");
  const proxyHostEl = document.getElementById("adb-proxy-host");
  const proxyPortEl = document.getElementById("adb-proxy-port");
  if (portEl && cfg.tcp_port != null) portEl.value = cfg.tcp_port;
  if (shareEl) shareEl.value = cfg.apk_share_dir || "";
  if (proxyHostEl) proxyHostEl.value = cfg.proxy_host || "192.168.0.101";
  if (proxyPortEl && cfg.proxy_port != null) proxyPortEl.value = cfg.proxy_port;
  renderAdbProxyHistory(cfg.proxy_history);
  // 多机场景默认不断开全部旧连接，避免互相踢掉
  if (discEl) discEl.checked = false;
}

async function saveAdbConfig() {
  const body = {
    tcp_port: Number(document.getElementById("adb-tcp-port")?.value || 28866),
    apk_share_dir: document.getElementById("adb-share-dir")?.value || "",
    disconnect_before_connect: !!document.getElementById("adb-disconnect-first")?.checked,
    proxy_host: document.getElementById("adb-proxy-host")?.value?.trim() || "192.168.0.101",
    proxy_port: Number(document.getElementById("adb-proxy-port")?.value || 9000),
  };
  const res = await api("adb/config", { method: "PUT", body });
  if (res.error) {
    alert(res.error);
    return;
  }
  appendAdbLog("配置已保存");
  renderAdbProxyHistory((res.config || {}).proxy_history);
  await refreshAdbLatestApk();
}

function renderAdbProxyHistory(items) {
  if (Array.isArray(items)) adbProxyHistory = items.slice();
  const box = document.getElementById("adb-proxy-history");
  if (!box) return;
  const active = document.activeElement;
  if (active && box.contains(active) && active.classList.contains("adb-proxy-note")) return;
  if (!adbProxyHistory.length) {
    box.innerHTML = '<div class="adb-proxy-history-empty">保存或开启代理后会记在这里，点击地址可回填</div>';
    return;
  }
  const curHost = document.getElementById("adb-proxy-host")?.value?.trim() || "";
  const curPort = Number(document.getElementById("adb-proxy-port")?.value || 0);
  box.innerHTML = adbProxyHistory.map((it, i) => {
    const on = it.host === curHost && Number(it.port) === curPort;
    return `<div class="adb-proxy-history-row${on ? " is-active" : ""}">
      <button type="button" class="adb-proxy-history-fill" onclick="applyAdbProxyHistory(${i})" title="点击回填">${escapeHtml(it.host)}:${escapeHtml(String(it.port))}</button>
      <input class="adb-input adb-proxy-note" value="${escapeHtml(it.note || "")}" placeholder="备注" maxlength="80" onchange="saveAdbProxyNote(${i}, this.value)">
      <button type="button" class="adb-proxy-history-del" onclick="deleteAdbProxyHistory(${i})" title="删除">×</button>
    </div>`;
  }).join("");
}

function applyAdbProxyHistory(index) {
  const it = adbProxyHistory[index];
  if (!it) return;
  const hostEl = document.getElementById("adb-proxy-host");
  const portEl = document.getElementById("adb-proxy-port");
  if (hostEl) hostEl.value = it.host;
  if (portEl) portEl.value = it.port;
  renderAdbProxyHistory();
}

async function rememberAdbProxyFromForm() {
  const host = document.getElementById("adb-proxy-host")?.value?.trim();
  const port = Number(document.getElementById("adb-proxy-port")?.value);
  if (!host || !port) return;
  const res = await api("adb/config", { method: "PUT", body: { proxy_host: host, proxy_port: port } });
  if (res.error) return;
  renderAdbProxyHistory((res.config || {}).proxy_history);
}

async function saveAdbProxyNote(index, note) {
  const it = adbProxyHistory[index];
  if (!it) return;
  it.note = String(note || "").trim().slice(0, 80);
  const res = await api("adb/config", { method: "PUT", body: { proxy_history: adbProxyHistory } });
  if (res.error) {
    alert(res.error);
    return;
  }
  renderAdbProxyHistory((res.config || {}).proxy_history);
}

async function deleteAdbProxyHistory(index) {
  adbProxyHistory = adbProxyHistory.filter((_, i) => i !== index);
  const res = await api("adb/config", { method: "PUT", body: { proxy_history: adbProxyHistory } });
  if (res.error) {
    alert(res.error);
    return;
  }
  renderAdbProxyHistory((res.config || {}).proxy_history || adbProxyHistory);
}

async function refreshAdbProxyHistory() {
  const res = await api("adb/config");
  renderAdbProxyHistory((res.config || {}).proxy_history || []);
}

function updateAdbProxyStatusText(enabled, value) {
  const el = document.getElementById("adb-proxy-status");
  if (!el) return;
  const label = el.querySelector(".adb-proxy-status-label");
  const detail = el.querySelector(".adb-proxy-status-detail");
  el.classList.remove("is-on", "is-off", "is-unknown");
  if (!adbSelectedSerial) {
    el.classList.add("is-unknown");
    if (label) label.textContent = "未选设备";
    if (detail) detail.textContent = "";
    return;
  }
  if (enabled) {
    el.classList.add("is-on");
    if (label) label.textContent = "已开启";
    if (detail) detail.textContent = value ? String(value) : "";
  } else {
    el.classList.add("is-off");
    if (label) label.textContent = "已关闭";
    if (detail) detail.textContent = "";
  }
}

function updateAdbProxyButtons() {
  const d = adbDevicesCache.find(x => x.serial === adbSelectedSerial);
  const online = !!(d && d.state === "device");
  const btnOn = document.getElementById("btn-adb-proxy-on");
  const btnOff = document.getElementById("btn-adb-proxy-off");
  if (btnOn) btnOn.disabled = !online;
  if (btnOff) btnOff.disabled = !online;
}

async function refreshAdbProxyStatus() {
  updateAdbProxyButtons();
  if (!adbSelectedSerial) {
    updateAdbProxyStatusText(false, "");
    return;
  }
  try {
    const res = await api("adb/proxy?serial=" + encodeURIComponent(adbSelectedSerial));
    if (!res.ok && res.error) {
      updateAdbProxyStatusText(false, "");
      return;
    }
    updateAdbProxyStatusText(!!res.enabled, res.value || "");
  } catch (_) {
    updateAdbProxyStatusText(false, "");
  }
}

async function setAdbProxy() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const d = adbDevicesCache.find(x => x.serial === adbSelectedSerial);
  if (!d || d.state !== "device") {
    alert("设备离线，无法设置代理");
    return;
  }
  const host = document.getElementById("adb-proxy-host")?.value?.trim() || "192.168.0.101";
  const port = Number(document.getElementById("adb-proxy-port")?.value || 9000);
  const serial = adbSelectedSerial;
  appendAdbLog(`—— 开启抓包代理 ${host}:${port} → ${serial} ——`, serial);
  const res = await api("adb/proxy", {
    method: "POST",
    body: { action: "set", serial, host, port },
  });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "开启代理失败", serial);
    alert(res.error || "开启代理失败");
  }
  await refreshAdbProxyHistory();
  await refreshAdbProxyStatus();
}

async function clearAdbProxy() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const d = adbDevicesCache.find(x => x.serial === adbSelectedSerial);
  if (!d || d.state !== "device") {
    alert("设备离线，无法关闭代理");
    return;
  }
  const serial = adbSelectedSerial;
  appendAdbLog(`—— 关闭抓包代理 → ${serial} ——`, serial);
  const res = await api("adb/proxy", {
    method: "POST",
    body: { action: "clear", serial },
  });
  appendAdbLog(res.logs || [], serial);
  if (!res.ok) {
    appendAdbLog(res.error || "关闭代理失败", serial);
    alert(res.error || "关闭代理失败");
  }
  await refreshAdbProxyStatus();
}

function preferInstallSerial(devices, preferred) {
  const list = devices || [];
  if (preferred && list.some(d => d.serial === preferred)) {
    return preferred;
  }
  // 当前选中 USB，但同机已有无线条目时，切到无线（转无线后 USB 线还插着很常见）
  if (adbSelectedSerial && !String(adbSelectedSerial).includes(":")) {
    const usb = list.find(d => d.serial === adbSelectedSerial);
    if (usb) {
      const twin = list.find(
        d =>
          d.transport === "wireless" &&
          d.state === "device" &&
          ((usb.model && d.model === usb.model) || (usb.product && d.product === usb.product))
      );
      if (twin) return twin.serial;
    }
  }
  if (adbSelectedSerial && list.some(d => d.serial === adbSelectedSerial)) {
    return adbSelectedSerial;
  }
  const wireless = list.find(d => d.transport === "wireless" && d.state === "device");
  if (wireless) return wireless.serial;
  const usb = list.find(d => d.transport === "usb" && d.state === "device");
  if (usb) return usb.serial;
  const any = list.find(d => d.state === "device");
  return any ? any.serial : "";
}

function adbDeviceLabel(d) {
  const brand = d.brand_cn || d.brand || d.manufacturer || "";
  const market = d.market_name || "";
  const model = d.model || d.product || "";
  if (brand && market) return `${brand} · ${market}`;
  if (brand && model) return `${brand} · ${model}`;
  if (market) return market;
  return [model, d.product].filter(Boolean).join(" · ") || "—";
}

function deviceBadgeClass(d) {
  if (!d || d.state !== "device") return "offline";
  return d.transport === "wireless" ? "wireless" : "usb";
}

function deviceBadgeLabel(d) {
  if (!d || d.state !== "device") return d?.state || "offline";
  return d.transport === "wireless" ? "无线" : "USB";
}

function updateAdbDetailPanel() {
  const empty = document.getElementById("adb-detail-empty");
  const detail = document.getElementById("adb-detail");
  const d = adbDevicesCache.find(x => x.serial === adbSelectedSerial);
  if (!adbSelectedSerial || !d) {
    empty?.classList.remove("hidden");
    detail?.classList.add("hidden");
    return;
  }
  empty?.classList.add("hidden");
  detail?.classList.remove("hidden");

  const title = document.getElementById("adb-detail-title");
  const meta = document.getElementById("adb-detail-meta");
  const badge = document.getElementById("adb-detail-badge");
  const btnConnect = document.getElementById("btn-adb-connect");
  const btnDisc = document.getElementById("btn-adb-disconnect");

  if (title) title.textContent = d.serial;
  if (meta) meta.textContent = adbDeviceLabel(d);
  if (badge) {
    badge.className = "adb-badge " + deviceBadgeClass(d);
    badge.textContent = deviceBadgeLabel(d);
  }
  const isWireless = d.transport === "wireless" || (d.serial && d.serial.includes(":"));
  if (btnConnect) {
    btnConnect.disabled = d.state !== "device";
    btnConnect.textContent = isWireless ? "重新连接" : "转无线";
  }
  if (btnDisc) {
    btnDisc.disabled = !isWireless;
  }
  syncAdbLogView();
  refreshAdbMirrorUi();
  updateAdbProxyButtons();
  refreshAdbProxyStatus();
}

function updateAdbMirrorStatusText(extra) {
  const el = document.getElementById("adb-mirror-status");
  if (!el) return;
  if (extra) {
    el.textContent = extra;
    return;
  }
  if (adbMirrorActiveSerial && adbMirrorActiveSerial === adbSelectedSerial) {
    const fps = adbMirrorDeviceSize.fps;
    const w = adbMirrorDeviceSize.w;
    const h = adbMirrorDeviceSize.h;
    el.textContent = fps ? `投屏中 · ${w}×${h} · ${fps} fps` : `投屏中 · ${w}×${h}`;
  } else {
    el.textContent = "未投屏";
  }
}

async function refreshAdbMirrorUi() {
  const btnStart = document.getElementById("btn-adb-mirror-start");
  const btnStop = document.getElementById("btn-adb-mirror-stop");
  const btnScrcpy = document.getElementById("btn-adb-scrcpy");
  const btnScrcpyStop = document.getElementById("btn-adb-scrcpy-stop");
  const canUse = !!adbSelectedSerial;

  if (btnStart) btnStart.disabled = !canUse || (adbMirrorActiveSerial === adbSelectedSerial);
  if (btnStop) btnStop.disabled = !adbMirrorActiveSerial || adbMirrorActiveSerial !== adbSelectedSerial;
  if (btnScrcpy) btnScrcpy.disabled = !canUse;
  if (btnScrcpyStop) btnScrcpyStop.disabled = !canUse;

  if (!canUse) {
    updateAdbMirrorStatusText("未投屏");
    if (btnScrcpyStop) btnScrcpyStop.disabled = true;
    return;
  }

  try {
    const [mirrorSt, scrcpySt] = await Promise.all([
      api("adb/mirror/status?serial=" + encodeURIComponent(adbSelectedSerial)),
      api("adb/scrcpy/status?serial=" + encodeURIComponent(adbSelectedSerial)),
    ]);
    if (mirrorSt.running && adbMirrorActiveSerial === adbSelectedSerial) {
      adbMirrorDeviceSize.w = mirrorSt.width || adbMirrorDeviceSize.w;
      adbMirrorDeviceSize.h = mirrorSt.height || adbMirrorDeviceSize.h;
      adbMirrorDeviceSize.fps = mirrorSt.fps || 0;
      updateAdbMirrorStatusText();
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;
    } else if (adbMirrorActiveSerial !== adbSelectedSerial) {
      updateAdbMirrorStatusText("未投屏");
    }
    if (btnScrcpyStop) btnScrcpyStop.disabled = !scrcpySt.running;
    if (scrcpySt.running && btnScrcpy) btnScrcpy.textContent = "scrcpy 运行中";
    else if (btnScrcpy) btnScrcpy.textContent = "打开 scrcpy";
  } catch (_) {
    updateAdbMirrorStatusText("状态未知");
  }
}

function adbMapMirrorCoords(clientX, clientY) {
  const img = document.getElementById("adb-mirror-img");
  if (!img || img.classList.contains("hidden")) return null;
  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
  const w = adbMirrorDeviceSize.w || 1080;
  const h = adbMirrorDeviceSize.h || 1920;
  return {
    x: Math.round(relX * w),
    y: Math.round(relY * h),
  };
}

function bindAdbMirrorPointer() {
  const viewport = document.getElementById("adb-mirror-viewport");
  if (!viewport || viewport.dataset.bound) return;
  viewport.dataset.bound = "1";

  const onDown = (e) => {
    if (!adbMirrorActiveSerial || adbMirrorActiveSerial !== adbSelectedSerial) return;
    const pt = adbMapMirrorCoords(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    adbMirrorPointer = { ...pt, t: Date.now(), x0: e.clientX, y0: e.clientY };
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
  };

  const onUp = async (e) => {
    if (!adbMirrorPointer || !adbMirrorActiveSerial) return;
    const start = adbMirrorPointer;
    adbMirrorPointer = null;
    const end = adbMapMirrorCoords(e.clientX, e.clientY);
    if (!end) return;
    e.preventDefault();
    const dx = e.clientX - start.x0;
    const dy = e.clientY - start.y0;
    const dist = Math.hypot(dx, dy);
    const serial = adbSelectedSerial;
    if (dist < 12) {
      await api("adb/mirror/tap", { method: "POST", body: { serial, x: end.x, y: end.y } });
    } else {
      const duration = Math.min(800, Math.max(120, Math.round(dist * 1.2)));
      await api("adb/mirror/swipe", {
        method: "POST",
        body: { serial, x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration_ms: duration },
      });
    }
  };

  viewport.addEventListener("pointerdown", onDown);
  viewport.addEventListener("pointerup", onUp);
  viewport.addEventListener("pointercancel", () => { adbMirrorPointer = null; });
}

function startAdbMirrorStatusPoll() {
  if (adbMirrorStatusTimer) clearInterval(adbMirrorStatusTimer);
  adbMirrorStatusTimer = setInterval(() => {
    if (adbMirrorActiveSerial && adbMirrorActiveSerial === adbSelectedSerial) {
      refreshAdbMirrorUi();
    } else if (adbMirrorStatusTimer) {
      clearInterval(adbMirrorStatusTimer);
      adbMirrorStatusTimer = null;
    }
  }, 2000);
}

async function startAdbMirror() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const serial = adbSelectedSerial;
  if (adbMirrorActiveSerial && adbMirrorActiveSerial !== serial) {
    await stopAdbMirror(true);
  }
  appendAdbLog("—— 启动页面投屏: " + serial + " ——", serial);
  const res = await api("adb/mirror/start", { method: "POST", body: { serial } });
  if (!res.ok && res.error) {
    appendAdbLog(res.error, serial);
    alert(res.error);
    return;
  }
  adbMirrorActiveSerial = serial;
  adbMirrorDeviceSize = { w: res.width || 1080, h: res.height || 1920, fps: res.fps || 0 };
  const img = document.getElementById("adb-mirror-img");
  const viewport = document.getElementById("adb-mirror-viewport");
  if (img) {
    img.classList.remove("hidden");
    img.src = "/api/adb/mirror/stream?serial=" + encodeURIComponent(serial) + "&t=" + Date.now();
  }
  viewport?.classList.add("is-mirroring");
  updateAdbMirrorStatusText();
  await refreshAdbMirrorUi();
  startAdbMirrorStatusPoll();
  appendAdbLog("页面投屏已启动（点击画面可操控）", serial);
}

async function stopAdbMirror(silent) {
  const serial = adbMirrorActiveSerial || adbSelectedSerial;
  if (!serial) return;
  await api("adb/mirror/stop", { method: "POST", body: { serial } });
  adbMirrorActiveSerial = "";
  adbMirrorDeviceSize = { w: 1080, h: 1920, fps: 0 };
  const img = document.getElementById("adb-mirror-img");
  const viewport = document.getElementById("adb-mirror-viewport");
  if (img) {
    img.src = "";
    img.classList.add("hidden");
  }
  viewport?.classList.remove("is-mirroring");
  if (adbMirrorStatusTimer) {
    clearInterval(adbMirrorStatusTimer);
    adbMirrorStatusTimer = null;
  }
  updateAdbMirrorStatusText("未投屏");
  await refreshAdbMirrorUi();
  if (!silent) appendAdbLog("页面投屏已停止", serial);
}

async function openAdbScrcpy() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const serial = adbSelectedSerial;
  appendAdbLog("—— 打开 scrcpy: " + serial + " ——", serial);
  const res = await api("adb/scrcpy/start", { method: "POST", body: { serial } });
  if (!res.ok) {
    appendAdbLog(res.error || "启动 scrcpy 失败", serial);
    alert(res.error || "启动 scrcpy 失败");
    return;
  }
  if (res.already_running) {
    appendAdbLog("scrcpy 已在运行（PID " + res.pid + "）", serial);
  } else {
    appendAdbLog("scrcpy 已启动（PID " + res.pid + "）", serial);
  }
  await refreshAdbMirrorUi();
}

async function stopAdbScrcpy() {
  if (!adbSelectedSerial) return;
  const serial = adbSelectedSerial;
  const res = await api("adb/scrcpy/stop", { method: "POST", body: { serial } });
  appendAdbLog(res.was_running ? "已关闭 scrcpy" : "scrcpy 未在运行", serial);
  await refreshAdbMirrorUi();
}

async function adbMirrorKey(key) {
  if (!adbSelectedSerial) {
    alert("请先选择设备");
    return;
  }
  await api("adb/mirror/key", { method: "POST", body: { serial: adbSelectedSerial, key } });
}

function renderAdbDevices(devices, opts = {}) {
  const box = document.getElementById("adb-devices");
  if (!box) return;
  adbDevicesCache = devices || [];
  if (!adbDevicesCache.length) {
    adbSelectedSerial = "";
    box.innerHTML = `<div class="adb-module-time">暂无设备。请用 USB 连接手机并开启调试。</div>`;
    updateAdbDetailPanel();
    return;
  }
  adbSelectedSerial = preferInstallSerial(adbDevicesCache, opts.preferSerial);
  box.innerHTML = adbDevicesCache.map(d => {
    const selected = d.serial === adbSelectedSerial ? " is-selected" : "";
    const meta = adbDeviceLabel(d);
    return `<div class="adb-device-row${selected}" onclick='selectAdbDevice(${JSON.stringify(d.serial)})'>
      <div>
        <div class="adb-device-serial">${escapeHtml(d.serial)}</div>
        <div class="adb-device-meta">${escapeHtml(meta)}</div>
      </div>
      <span class="adb-badge ${deviceBadgeClass(d)}">${escapeHtml(deviceBadgeLabel(d))}</span>
    </div>`;
  }).join("");
  updateAdbDetailPanel();
}

function selectAdbDevice(serial) {
  if (adbMirrorActiveSerial && adbMirrorActiveSerial !== serial) {
    stopAdbMirror(true);
  }
  adbSelectedSerial = serial;
  renderAdbDevices(adbDevicesCache);
}

async function refreshAdbDevices(preferSerial) {
  const statusEl = document.getElementById("adb-status-text");
  const prefer = preferSerial || undefined;
  // 一次 /adb/devices 即可（内含 status）；先出列表，无线重连放到后台，避免记忆里离线 IP 把「加载中」卡死
  let res = await api("adb/devices");
  const status = res.status || {};
  if (statusEl) {
    statusEl.textContent = status.available
      ? (status.version || "adb 可用")
      : (status.error || res.error || "adb 不可用");
  }
  if (status.available === false || (res.error && !res.devices?.length && !status.available)) {
    document.getElementById("adb-devices").innerHTML =
      `<div class="adb-module-time">${escapeHtml(res.error || status.error || "请安装 platform-tools 并加入 PATH")}</div>`;
    adbDevicesCache = [];
    adbSelectedSerial = "";
    updateAdbDetailPanel();
    return;
  }
  if (res.error && !res.devices) {
    document.getElementById("adb-devices").innerHTML =
      `<div class="adb-module-time">${escapeHtml(res.error)}</div>`;
    return;
  }
  renderAdbDevices(res.devices || [], { preferSerial: prefer });

  // 后台补连记忆的无线设备，完成后再刷新列表（不阻塞首屏）
  void (async () => {
    try {
      const recon = await api("adb/reconnect-remembered", { method: "POST", body: {} });
      if (!recon.attempted) return;
      appendAdbLog(recon.logs || [], adbSelectedSerial || "_global");
      if (recon.error && !recon.ok) appendAdbLog(recon.error, adbSelectedSerial || "_global");
      if (Array.isArray(recon.devices) && recon.devices.length) {
        renderAdbDevices(recon.devices, { preferSerial: prefer });
      } else if (recon.ok) {
        const again = await api("adb/devices");
        if (again.devices) renderAdbDevices(again.devices, { preferSerial: prefer });
      }
    } catch (_) {
      /* 重连失败不挡列表 */
    }
  })();
}

async function refreshAdbLatestApk() {
  const meta = document.getElementById("adb-latest-meta");
  const share = document.getElementById("adb-share-dir")?.value || "";
  const q = share ? ("?dir=" + encodeURIComponent(share)) : "";
  const res = await fetch("/api/adb/latest-apk" + q).then(r => r.json()).catch(() => ({ ok: false, error: "请求失败" }));
  if (!meta) return;
  if (!res.ok) {
    meta.textContent = res.error || "未配置共享目录";
    return;
  }
  meta.textContent = `${res.name} · ${res.size_mb} MB`;
}

function adbConnectPayload(extra) {
  return {
    port: Number(document.getElementById("adb-tcp-port")?.value || 28866),
    disconnect_first: !!document.getElementById("adb-disconnect-first")?.checked,
    ...extra,
  };
}

async function runAdbWirelessConnect() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const btn = document.getElementById("btn-adb-connect");
  if (btn) btn.disabled = true;
  const serial = adbSelectedSerial;
  appendAdbLog("—— 转无线: " + serial + " ——", serial);
  try {
    const res = await api("adb/wireless-connect", {
      method: "POST",
      body: adbConnectPayload({ serial }),
    });
    appendAdbLog(res.logs || [], serial);
    const prefer = res.ok && res.target ? res.target : "";
    if (prefer) {
      if (serial !== prefer && adbLogsBySerial[serial]) {
        adbLogsBySerial[prefer] =
          (adbLogsBySerial[prefer] ? adbLogsBySerial[prefer] + "\n" : "") + adbLogsBySerial[serial];
      }
      adbSelectedSerial = prefer;
      appendAdbLog("可继续安装 APK（已切到无线条目）", prefer);
      // 接口已带回 devices 时先立刻画出来，避免刷新慢时仍停在 USB
      if (Array.isArray(res.devices) && res.devices.length) {
        renderAdbDevices(res.devices, { preferSerial: prefer });
      }
    } else if (res.error) {
      appendAdbLog(res.error, serial);
    }
    await refreshAdbDevices(prefer || undefined);
  } finally {
    if (btn) btn.disabled = false;
    updateAdbDetailPanel();
  }
}

async function runAdbConnectAllUsb() {
  const btn = document.getElementById("btn-adb-connect-all");
  if (btn) btn.disabled = true;
  appendAdbLog("—— 全部 USB 转无线 ——", adbSelectedSerial || "_global");
  try {
    const res = await api("adb/wireless-connect", {
      method: "POST",
      body: adbConnectPayload({ all_usb: true }),
    });
    const logKey = adbSelectedSerial || "_global";
    appendAdbLog(res.logs || [], logKey);
    const prefer =
      res.targets && res.targets.length ? res.targets[res.targets.length - 1] : "";
    if (prefer) {
      adbSelectedSerial = prefer;
      if (Array.isArray(res.devices) && res.devices.length) {
        renderAdbDevices(res.devices, { preferSerial: prefer });
      }
    }
    await refreshAdbDevices(prefer || undefined);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function runAdbDisconnect() {
  const serial = adbSelectedSerial;
  if (!serial || !serial.includes(":")) {
    appendAdbLog("当前设备不是无线连接，无需断开", serial);
    return;
  }
  const res = await api("adb/disconnect", { method: "POST", body: { target: serial } });
  appendAdbLog(res.logs || [], serial);
  if (res.error) appendAdbLog(res.error, serial);
  await refreshAdbDevices();
}

function setAdbInstallProgress(text, show) {
  const el = document.getElementById("adb-install-progress");
  if (!el) return;
  if (show === false) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = text || "安装中…";
}

async function pollAdbInstallJob(jobId, serial) {
  if (adbInstallPollTimer) {
    clearInterval(adbInstallPollTimer);
    adbInstallPollTimer = null;
  }
  const logSerial = serial || adbSelectedSerial;
  setAdbInstallProgress("安装进行中，大包可能需要数分钟…", true);
  const tick = async () => {
    const res = await api("adb/install/" + jobId);
    const job = res.job;
    if (!job) {
      clearInterval(adbInstallPollTimer);
      adbInstallPollTimer = null;
      setAdbInstallProgress("", false);
      appendAdbLog(res.error || "安装任务丢失", logSerial);
      return;
    }
    if (job.status === "running") return;
    clearInterval(adbInstallPollTimer);
    adbInstallPollTimer = null;
    setAdbInstallProgress(job.ok ? "安装完成" : "安装失败", true);
    appendAdbLog(job.logs || [], logSerial);
    if (job.hint) appendAdbLog(job.hint, logSerial);
    if (!job.ok && job.error) appendAdbLog(job.error, logSerial);
    if (typeof recordProjectInstallHistory === "function") {
      recordProjectInstallHistory({
        ok: !!job.ok,
        serial: job.serial || logSerial || "",
        path: job.path || "",
        error: job.error || "",
      });
    }
  };
  await tick();
  adbInstallPollTimer = setInterval(tick, 1500);
}

async function installAdbLatestApk() {
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  await saveAdbConfig();
  const serial = adbSelectedSerial;
  appendAdbLog("—— 安装共享目录最新 APK → " + serial + " ——", serial);
  const res = await api("adb/install", {
    method: "POST",
    body: {
      source: "latest",
      serial,
      share_dir: document.getElementById("adb-share-dir")?.value || "",
    },
  });
  if (!res.ok) {
    appendAdbLog(res.error || "无法启动安装", serial);
    return;
  }
  appendAdbLog(res.logs || [], serial);
  await pollAdbInstallJob(res.job_id, serial);
}

async function uploadAndInstallAdbApk(file) {
  if (!file) return;
  if (!adbSelectedSerial) {
    alert("请先选择左侧设备");
    return;
  }
  const name = file.name || "";
  if (!name.toLowerCase().endsWith(".apk")) {
    alert("请选择 .apk 文件");
    return;
  }
  const serial = adbSelectedSerial;
  appendAdbLog(`—— 上传并安装: ${name}（${(file.size / (1024 * 1024)).toFixed(2)} MB）→ ${serial} ——`, serial);
  setAdbInstallProgress("正在上传 APK…", true);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("serial", serial);
  try {
    const res = await fetch("/api/adb/install", { method: "POST", body: fd }).then(r => r.json());
    if (!res.ok) {
      setAdbInstallProgress("", false);
      appendAdbLog(res.error || "上传/启动安装失败", serial);
      return;
    }
    appendAdbLog(res.logs || [], serial);
    await pollAdbInstallJob(res.job_id, serial);
  } catch (e) {
    setAdbInstallProgress("", false);
    appendAdbLog("上传失败: " + (e && e.message ? e.message : e), serial);
  }
}

async function switchDevicePlatform(platform) {
  devicePlatform = platform === "ios" ? "ios" : "android";
  document.getElementById("tab-platform-android")?.classList.toggle("is-active", devicePlatform === "android");
  document.getElementById("tab-platform-ios")?.classList.toggle("is-active", devicePlatform === "ios");
  document.getElementById("platform-android")?.classList.toggle("hidden", devicePlatform !== "android");
  document.getElementById("platform-ios")?.classList.toggle("hidden", devicePlatform !== "ios");
  if (devicePlatform === "android") {
    await loadAdbConfigToForm();
    await refreshAdbDevices();
    // 共享盘扫 APK 可能很慢，不挡设备列表
    void refreshAdbLatestApk();
  } else {
    await loadIosConfigToForm();
    await refreshIosDevices();
    await refreshIosLatestIpa();
  }
}

function appendIosLog(lines, udid) {
  const key = udid || iosSelectedUdid || "_global";
  const arr = Array.isArray(lines) ? lines : [String(lines || "")];
  const chunk = arr.filter(Boolean).join("\n");
  if (!chunk) return;
  iosLogsByUdid[key] = (iosLogsByUdid[key] ? iosLogsByUdid[key] + "\n" : "") + chunk;
  if (key === iosSelectedUdid || (!iosSelectedUdid && key === "_global")) {
    syncIosLogView();
  }
}

function syncIosLogView() {
  const el = document.getElementById("ios-log");
  if (!el) return;
  const key = iosSelectedUdid || "_global";
  el.textContent = iosLogsByUdid[key] || "";
  el.scrollTop = el.scrollHeight;
}

function clearIosLog() {
  const key = iosSelectedUdid || "_global";
  iosLogsByUdid[key] = "";
  syncIosLogView();
}

function bindIosUiOnce() {
  if (iosUiBound) return;
  iosUiBound = true;
  const fileInput = document.getElementById("ios-ipa-file");
  const dropzone = document.getElementById("ios-dropzone");
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) uploadAndInstallIosIpa(f);
    fileInput.value = "";
  });
  if (dropzone) {
    ["dragenter", "dragover"].forEach(ev => {
      dropzone.addEventListener(ev, e => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(ev => {
      dropzone.addEventListener(ev, e => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
      });
    });
    dropzone.addEventListener("drop", e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) uploadAndInstallIosIpa(f);
    });
    dropzone.addEventListener("click", () => fileInput?.click());
  }
  const pushInput = document.getElementById("ios-push-file");
  const pushDz = document.getElementById("ios-exchange-dropzone");
  pushInput?.addEventListener("change", () => {
    const f = pushInput.files && pushInput.files[0];
    if (f) iosExchangePushFile(f);
    pushInput.value = "";
  });
  if (pushDz) {
    ["dragenter", "dragover"].forEach(ev => {
      pushDz.addEventListener(ev, e => {
        e.preventDefault();
        pushDz.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(ev => {
      pushDz.addEventListener(ev, e => {
        e.preventDefault();
        pushDz.classList.remove("is-dragover");
      });
    });
    pushDz.addEventListener("drop", e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) iosExchangePushFile(f);
    });
    pushDz.addEventListener("click", () => pushInput?.click());
  }
}

async function loadIosConfigToForm() {
  const res = await api("ios/config");
  const cfg = res.config || {};
  const shareEl = document.getElementById("ios-share-dir");
  if (shareEl) shareEl.value = cfg.ipa_share_dir || "";
}

async function saveIosConfig() {
  const body = {
    ipa_share_dir: document.getElementById("ios-share-dir")?.value || "",
  };
  const res = await api("ios/config", { method: "PUT", body });
  if (res.error) {
    alert(res.error);
    return;
  }
  appendIosLog("配置已保存");
  await refreshIosLatestIpa();
}

async function refreshIosLatestIpa() {
  const meta = document.getElementById("ios-latest-meta");
  const infoEl = document.getElementById("ios-ipa-info");
  const share = document.getElementById("ios-share-dir")?.value || "";
  const q = share ? "?dir=" + encodeURIComponent(share) : "";
  const res = await api("ios/latest-ipa" + q);
  if (!meta) return;
  if (!res.ok) {
    meta.textContent = res.error || "无最新包";
    if (infoEl) infoEl.textContent = res.error || "无最新包";
    return;
  }
  meta.textContent = `${res.name} · ${res.size_mb} MB · ${res.mtime || ""}`;
  const ipa = res.ipa;
  if (infoEl) {
    if (ipa && ipa.ok) {
      infoEl.textContent =
        `${ipa.app_name || "—"} · ${ipa.bundle_id || "—"} · v${ipa.version || "—"}` +
        (ipa.build ? ` (${ipa.build})` : "") +
        ` · 最低 iOS ${ipa.min_os || "—"}`;
    } else {
      infoEl.textContent = "已找到包，但未能读取 Info.plist";
    }
  }
}

async function refreshIosDevices() {
  const box = document.getElementById("ios-devices");
  const statusEl = document.getElementById("ios-status-text");
  if (box) box.textContent = "加载中…";
  const res = await api("ios/devices");
  const st = res.status || {};
  if (statusEl) {
    statusEl.textContent = st.available
      ? st.version || "pymobiledevice3"
      : st.error || "不可用";
    statusEl.title = st.hint || st.error || "";
  }
  iosDevicesCache = res.devices || [];
  if (!res.ok && !iosDevicesCache.length) {
    if (box) {
      box.innerHTML =
        `<div class="adb-module-hint">${escapeHtml(res.error || st.error || "无法列出设备")}` +
        (st.hint ? `<br>${escapeHtml(st.hint)}` : "") +
        `</div>`;
    }
    updateIosDetailPanel();
    return;
  }
  if (!iosDevicesCache.length) {
    if (box) {
      box.innerHTML = `<div class="adb-module-hint">${escapeHtml(
        st.hint || "未检测到设备。请插线、解锁并信任本机；或开启无线后点「发现无线」。"
      )}</div>`;
    }
    iosSelectedUdid = "";
    updateIosDetailPanel();
    return;
  }
  if (iosSelectedUdid && !iosDevicesCache.some(d => d.udid === iosSelectedUdid)) {
    iosSelectedUdid = "";
  }
  if (!iosSelectedUdid) iosSelectedUdid = iosDevicesCache[0].udid;
  refreshIosDevicesListOnly();
  updateIosDetailPanel();
}

function selectIosDevice(udid) {
  iosSelectedUdid = udid || "";
  refreshIosDevicesListOnly();
  updateIosDetailPanel();
}

function iosConnectionBadge(d) {
  const conn = String(d.connection || "USB");
  const isNet = /network|wifi|wireless/i.test(conn) || d.host;
  return {
    className: isNet ? "adb-badge wireless" : "adb-badge usb",
    text: isNet ? (d.host ? `Wi‑Fi ${d.host}` : "Network") : conn || "USB",
  };
}

function refreshIosDevicesListOnly() {
  const box = document.getElementById("ios-devices");
  if (!box || !iosDevicesCache.length) return;
  box.innerHTML = iosDevicesCache
    .map(d => {
      const selected = d.udid === iosSelectedUdid ? " is-selected" : "";
      const title = d.name || d.udid;
      const sub = [d.product, d.version, d.state === "offline" ? "离线" : ""]
        .filter(Boolean)
        .join(" · ") || d.udid;
      const badge = iosConnectionBadge(d);
      return (
        `<div class="adb-device-row${selected}" onclick='selectIosDevice(${JSON.stringify(d.udid)})'>` +
        `<div>` +
        `<div class="adb-device-serial">${escapeHtml(title)}</div>` +
        `<div class="adb-device-meta">${escapeHtml(sub)}</div>` +
        `</div>` +
        `<span class="${badge.className}">${escapeHtml(badge.text)}</span>` +
        `</div>`
      );
    })
    .join("");
}

function updateIosDetailPanel() {
  const empty = document.getElementById("ios-detail-empty");
  const detail = document.getElementById("ios-detail");
  const d = iosDevicesCache.find(x => x.udid === iosSelectedUdid);
  if (!iosSelectedUdid || !d) {
    empty?.classList.remove("hidden");
    detail?.classList.add("hidden");
    return;
  }
  empty?.classList.add("hidden");
  detail?.classList.remove("hidden");
  const title = document.getElementById("ios-detail-title");
  const meta = document.getElementById("ios-detail-meta");
  const badge = document.getElementById("ios-detail-badge");
  if (title) title.textContent = d.name || d.udid;
  if (meta) {
    meta.textContent = [d.udid, d.product, d.version, d.host ? `@ ${d.host}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (badge) {
    const b = iosConnectionBadge(d);
    badge.className = b.className;
    badge.textContent = b.text;
  }
  syncIosLogView();
}

function setIosInstallProgress(text, show, pct) {
  const el = document.getElementById("ios-install-progress");
  const bar = document.getElementById("ios-install-bar");
  const fill = document.getElementById("ios-install-bar-fill");
  if (!show) {
    el?.classList.add("hidden");
    if (el) el.textContent = "";
    bar?.classList.add("hidden");
    if (fill) fill.style.width = "0%";
    return;
  }
  if (el) {
    el.classList.remove("hidden");
    el.textContent = text || "安装中…";
  }
  if (bar && fill && typeof pct === "number") {
    bar.classList.remove("hidden");
    fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }
}

async function pollIosInstallJob(jobId, udid) {
  if (iosInstallPollTimer) {
    clearInterval(iosInstallPollTimer);
    iosInstallPollTimer = null;
  }
  const logUdid = udid || iosSelectedUdid;
  setIosInstallProgress("安装进行中…", true, 0);
  const tick = async () => {
    const res = await api("ios/install/" + jobId);
    const job = res.job;
    if (!job) {
      clearInterval(iosInstallPollTimer);
      iosInstallPollTimer = null;
      setIosInstallProgress("", false);
      appendIosLog(res.error || "安装任务丢失", logUdid);
      return;
    }
    const pct = typeof job.progress === "number" ? job.progress : null;
    const label = job.progress_text || (pct != null ? `安装中 ${pct}%` : "安装进行中…");
    if (job.status === "running") {
      setIosInstallProgress(label, true, pct != null ? pct : 0);
      return;
    }
    clearInterval(iosInstallPollTimer);
    iosInstallPollTimer = null;
    setIosInstallProgress(job.ok ? "安装完成" : "安装失败", true, job.ok ? 100 : pct || 0);
    appendIosLog(job.logs || [], logUdid);
    if (job.hint) appendIosLog(job.hint, logUdid);
    if (!job.ok && job.error) appendIosLog(job.error, logUdid);
    if (job.ok) iosRefreshApps();
  };
  await tick();
  iosInstallPollTimer = setInterval(tick, 800);
}

function iosForceInstall() {
  return !!document.getElementById("ios-force-install")?.checked;
}

async function installIosLatestIpa(uninstallFirst) {
  if (!iosSelectedUdid) {
    alert("请先选择左侧 iOS 设备");
    return;
  }
  await saveIosConfig();
  const udid = iosSelectedUdid;
  appendIosLog(
    "—— " + (uninstallFirst ? "卸载后重装" : "安装") + "共享目录最新 IPA → " + udid + " ——",
    udid
  );
  const res = await api("ios/install", {
    method: "POST",
    body: {
      source: "latest",
      udid,
      share_dir: document.getElementById("ios-share-dir")?.value || "",
      force: iosForceInstall(),
      uninstall_first: !!uninstallFirst,
    },
  });
  if (!res.ok) {
    appendIosLog(res.error || "无法启动安装", udid);
    if (res.hint) appendIosLog(res.hint, udid);
    appendIosLog(res.logs || [], udid);
    return;
  }
  appendIosLog(res.logs || [], udid);
  await pollIosInstallJob(res.job_id, udid);
}

async function uploadAndInstallIosIpa(file) {
  if (!file) return;
  if (!iosSelectedUdid) {
    alert("请先选择左侧 iOS 设备");
    return;
  }
  const name = file.name || "";
  if (!name.toLowerCase().endsWith(".ipa")) {
    alert("请选择 .ipa 文件");
    return;
  }
  const udid = iosSelectedUdid;
  appendIosLog(
    `—— 上传并安装: ${name}（${(file.size / (1024 * 1024)).toFixed(2)} MB）→ ${udid} ——`,
    udid
  );
  setIosInstallProgress("正在上传 IPA…", true, 0);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("udid", udid);
  if (iosForceInstall()) fd.append("force", "1");
  try {
    const res = await fetch("/api/ios/install", { method: "POST", body: fd }).then(r => r.json());
    if (!res.ok) {
      setIosInstallProgress("", false);
      appendIosLog(res.error || "上传/启动安装失败", udid);
      if (res.hint) appendIosLog(res.hint, udid);
      appendIosLog(res.logs || [], udid);
      return;
    }
    appendIosLog(res.logs || [], udid);
    await pollIosInstallJob(res.job_id, udid);
  } catch (e) {
    setIosInstallProgress("", false);
    appendIosLog("上传失败: " + (e && e.message ? e.message : e), udid);
  }
}

function iosExchangeRequireDevice() {
  if (!iosSelectedUdid) {
    alert("请先选择左侧 iOS 设备");
    return false;
  }
  return true;
}

function showIosExchangePreview(files) {
  const box = document.getElementById("ios-exchange-preview");
  if (!box) return;
  const list = Array.isArray(files) ? files : files ? [files] : [];
  if (!list.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = list
    .map(f => {
      const rel = f.rel || "";
      const name = f.name || rel;
      const src = "/api/ios/file?path=" + encodeURIComponent(rel);
      const isImg = /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(name);
      return (
        `<a class="adb-exchange-thumb" href="${src}" target="_blank" title="${name}">` +
        (isImg ? `<img src="${src}" alt="${name}">` : `<span>${name}</span>`) +
        `</a>`
      );
    })
    .join("");
}

function renderIosMediaList(items) {
  const box = document.getElementById("ios-media-list");
  const btn = document.getElementById("btn-ios-pull-media");
  if (!box) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    box.innerHTML = `<div class="adb-module-hint">暂无条目。可浏览远程目录，或先推文件 / 在手机拍照后再刷新。</div>`;
    if (btn) btn.disabled = true;
    return;
  }
  const udid = iosSelectedUdid;
  box.innerHTML = list
    .map(it => {
      const path = String(it.path || "");
      const name = it.name || path;
      const dir = it.dir || (it.is_dir ? "目录" : "");
      const disabled = it.is_dir ? " disabled" : "";
      const thumbable = it.thumbable || /\.(jpe?g|png|gif|webp)$/i.test(name);
      const thumbSrc =
        thumbable && !it.is_dir
          ? `/api/ios/thumb?udid=${encodeURIComponent(udid)}&path=${encodeURIComponent(path)}`
          : "";
      return (
        `<label class="adb-media-item">` +
        (thumbSrc
          ? `<img class="ios-media-thumb" loading="lazy" src="${thumbSrc}" alt="" onerror="this.outerHTML='<div class=ios-media-thumb-ph>无预览</div>'">`
          : `<div class="ios-media-thumb-ph">${it.is_dir ? "目录" : "文件"}</div>`) +
        `<input type="checkbox" class="ios-media-check"${disabled} data-path="${encodeURIComponent(path)}">` +
        `<span class="adb-media-name" title="${path.replace(/"/g, "&quot;")}">${escapeHtml(name)}</span>` +
        `<span class="adb-media-dir">${escapeHtml(dir)}</span>` +
        `</label>`
      );
    })
    .join("");
  const syncBtn = () => {
    if (btn) btn.disabled = !box.querySelector(".ios-media-check:checked");
  };
  box.querySelectorAll(".ios-media-check").forEach(el => el.addEventListener("change", syncBtn));
  syncBtn();
}

function iosMediaSelectAll() {
  const box = document.getElementById("ios-media-list");
  const btn = document.getElementById("btn-ios-pull-media");
  if (!box) return;
  const checks = [...box.querySelectorAll(".ios-media-check:not(:disabled)")];
  if (!checks.length) return;
  const allOn = checks.every(c => c.checked);
  checks.forEach(c => {
    c.checked = !allOn;
  });
  if (btn) btn.disabled = !box.querySelector(".ios-media-check:checked");
}

async function iosExchangeScreencap() {
  if (!iosExchangeRequireDevice()) return;
  const udid = iosSelectedUdid;
  appendIosLog("—— 截屏到电脑 → " + udid + " ——", udid);
  const res = await api("ios/screencap", { method: "POST", body: { udid } });
  appendIosLog(res.logs || [], udid);
  if (!res.ok) {
    appendIosLog(res.error || "截屏失败", udid);
    alert(res.error || "截屏失败");
    return;
  }
  showIosExchangePreview(res);
}

async function iosExchangeListMedia() {
  if (!iosExchangeRequireDevice()) return;
  const udid = iosSelectedUdid;
  appendIosLog("—— 列出最近图片（扫描 DCIM）→ " + udid + " ——", udid);
  const res = await api("ios/recent-media?udid=" + encodeURIComponent(udid) + "&limit=40");
  appendIosLog(res.logs || [], udid);
  if (!res.ok) {
    appendIosLog(res.error || "列举失败", udid);
    renderIosMediaList([]);
    return;
  }
  renderIosMediaList(res.items || []);
}

async function iosExchangeListDir() {
  if (!iosExchangeRequireDevice()) return;
  const udid = iosSelectedUdid;
  const path = document.getElementById("ios-remote-path")?.value || "/Downloads/Workbench";
  appendIosLog("—— 浏览 " + path + " ——", udid);
  const res = await api(
    "ios/ls?udid=" + encodeURIComponent(udid) + "&path=" + encodeURIComponent(path)
  );
  appendIosLog(res.logs || [], udid);
  if (!res.ok) {
    appendIosLog(res.error || "列举失败", udid);
    renderIosMediaList([]);
    return;
  }
  renderIosMediaList(
    (res.items || []).map(it => ({
      ...it,
      dir: it.is_dir ? "目录" : path,
      thumbable: !it.is_dir && /\.(jpe?g|png|gif|webp)$/i.test(it.name || ""),
    }))
  );
}

async function iosExchangePullSelected() {
  if (!iosExchangeRequireDevice()) return;
  const checks = [...document.querySelectorAll("#ios-media-list .ios-media-check:checked")];
  const paths = checks
    .map(el => {
      try {
        return decodeURIComponent(el.getAttribute("data-path") || "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  if (!paths.length) {
    alert("请先勾选文件");
    return;
  }
  const udid = iosSelectedUdid;
  appendIosLog("—— 拉取 " + paths.length + " 个文件 → 电脑 ——", udid);
  const res = await api("ios/pull", { method: "POST", body: { udid, paths } });
  appendIosLog(res.logs || [], udid);
  if (!res.ok) {
    appendIosLog(res.error || "拉取失败", udid);
    return;
  }
  showIosExchangePreview(res.files || []);
}

async function iosExchangePushFile(file) {
  if (!iosExchangeRequireDevice()) return;
  if (!file) return;
  const udid = iosSelectedUdid;
  appendIosLog(
    `—— 推送文件: ${file.name}（${(file.size / 1024).toFixed(1)} KB）→ ${udid} ——`,
    udid
  );
  const fd = new FormData();
  fd.append("file", file);
  fd.append("udid", udid);
  try {
    const res = await fetch("/api/ios/push", { method: "POST", body: fd }).then(r => r.json());
    appendIosLog(res.logs || [], udid);
    if (!res.ok) appendIosLog(res.error || "推送失败", udid);
  } catch (e) {
    appendIosLog("推送失败: " + (e && e.message ? e.message : e), udid);
  }
}

let iosAppsCache = [];

async function iosRefreshApps() {
  if (!iosExchangeRequireDevice()) return;
  const udid = iosSelectedUdid;
  appendIosLog("—— 刷新已装用户应用 ——", udid);
  const res = await api("ios/apps?udid=" + encodeURIComponent(udid) + "&type=User");
  if (!res.ok) {
    appendIosLog(res.error || "列举应用失败", udid);
    iosAppsCache = [];
    iosRenderAppsFilter();
    return;
  }
  iosAppsCache = res.items || [];
  appendIosLog(`共 ${iosAppsCache.length} 个用户应用`, udid);
  iosRenderAppsFilter();
}

function iosRenderAppsFilter() {
  const box = document.getElementById("ios-apps-list");
  if (!box) return;
  const q = (document.getElementById("ios-apps-filter")?.value || "").trim().toLowerCase();
  const list = !q
    ? iosAppsCache
    : iosAppsCache.filter(
        a =>
          String(a.name || "").toLowerCase().includes(q) ||
          String(a.bundle_id || "").toLowerCase().includes(q)
      );
  if (!list.length) {
    box.innerHTML = `<div class="adb-module-hint">${iosAppsCache.length ? "无匹配应用" : "点「刷新列表」加载已装应用"}</div>`;
    return;
  }
  box.innerHTML = list
    .map(a => {
      const bid = a.bundle_id || "";
      return (
        `<div class="ios-apps-row">` +
        `<div>` +
        `<div>${escapeHtml(a.name || bid)}</div>` +
        `<div class="ios-apps-meta">${escapeHtml(bid)}${a.version ? " · v" + escapeHtml(a.version) : ""}</div>` +
        `</div>` +
        `<button class="btn btn-sm" type="button" onclick='iosUninstallApp(${JSON.stringify(bid)})'>卸载</button>` +
        `</div>`
      );
    })
    .join("");
}

async function iosUninstallApp(bundleId) {
  if (!iosExchangeRequireDevice()) return;
  if (!bundleId) return;
  if (!confirm("确认卸载 " + bundleId + "？")) return;
  const udid = iosSelectedUdid;
  appendIosLog("—— 卸载 " + bundleId + " ——", udid);
  const res = await api("ios/uninstall", {
    method: "POST",
    body: { udid, bundle_id: bundleId },
  });
  appendIosLog(res.logs || [], udid);
  if (!res.ok) appendIosLog(res.error || "卸载失败", udid);
  await iosRefreshApps();
}

async function iosEnableWifi() {
  if (!iosSelectedUdid) {
    alert("请先选择一台 USB 已连接的设备");
    return;
  }
  const udid = iosSelectedUdid;
  appendIosLog("—— 开启无线锁屏 → " + udid + " ——", udid);
  const res = await api("ios/wifi/enable", { method: "POST", body: { udid } });
  appendIosLog(res.logs || [], udid);
  if (!res.ok) {
    appendIosLog(res.error || "开启失败", udid);
    if (res.hint) appendIosLog(res.hint, udid);
    return;
  }
  if (res.device?.host) {
    const hostEl = document.getElementById("ios-wifi-host");
    if (hostEl) hostEl.value = res.device.host;
    appendIosLog("已自动写入无线 IP，可拔线后继续用", udid);
    await refreshIosDevices();
  }
}

async function iosDiscoverWifi() {
  appendIosLog("—— 发现局域网无线设备 ——");
  const body = { timeout: 10 };
  if (iosSelectedUdid) body.udid = iosSelectedUdid;
  const res = await api("ios/wifi/discover", { method: "POST", body });
  appendIosLog(res.logs || []);
  if (!res.ok) {
    appendIosLog(res.error || "发现失败");
    return;
  }
  const devices = res.devices || [];
  if (devices.length && devices[0].udid) {
    iosSelectedUdid = devices[0].udid;
    const hostEl = document.getElementById("ios-wifi-host");
    if (hostEl && devices[0].host) hostEl.value = devices[0].host;
  }
  await refreshIosDevices();
}

async function iosConnectWifi() {
  const host = (document.getElementById("ios-wifi-host")?.value || "").trim();
  if (!host) {
    alert("请填写设备 IP");
    return;
  }
  appendIosLog("—— 手动连接无线 " + host + " ——");
  const res = await api("ios/wifi/connect", {
    method: "POST",
    body: { host, udid: iosSelectedUdid || undefined },
  });
  appendIosLog(res.logs || []);
  if (!res.ok) {
    appendIosLog(res.error || "连接失败");
    if (res.hint) appendIosLog(res.hint);
    return;
  }
  if (res.device?.udid) iosSelectedUdid = res.device.udid;
  await refreshIosDevices();
}

function showPathLoading(path) {
  const overlay = document.getElementById("loading-overlay");
  const msg = document.getElementById("loading-msg");
  if (!overlay) return;
  const name = String(path).split(/[/\\]/).filter(Boolean).pop() || path;
  if (msg) msg.textContent = `正在打开：${name}`;
  overlay.classList.remove("hidden");
  const dots = overlay.querySelectorAll(".loading-dot");
  if (typeof gsap !== "undefined" && dots.length) {
    gsap.set(dots, { scale: 0.55 });
    loadingDotsTween = gsap.to(dots, {
      scale: 1.25,
      duration: 0.35,
      stagger: 0.15,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }
}

function hidePathLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (loadingDotsTween) {
    loadingDotsTween.kill();
    loadingDotsTween = null;
  }
  overlay?.classList.add("hidden");
}

function copyPath(text) {
  copyToClipboard(text).catch((err) => {
    console.error("copyPath failed", err);
    alert("复制失败");
  });
}

/** 可靠写入剪贴板：先 Clipboard API，失败再用 textarea + execCommand */
function copyToClipboard(text) {
  const t = String(text ?? "");
  if (!t) return Promise.reject(new Error("无内容可复制"));

  const fallback = () =>
    new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, t.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("execCommand copy failed"));
      } catch (e) {
        reject(e);
      }
    });

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(t).catch(() => fallback());
  }
  return fallback();
}

function copyText(elId, text) {
  const textVal = text || document.getElementById(elId)?.value || "";
  copyToClipboard(textVal).catch((err) => {
    console.error("copyText failed", err);
    alert("复制失败");
  });
}

async function showForm(type, editId) {
  modalState = { type, editId: editId || null };
  const schema = FORM_SCHEMAS[type];
  document.getElementById("modal-title").textContent = editId ? "编辑" : "新增";
  let data = {};
  if (editId) {
    const items = await api(type);
    const list = Array.isArray(items) ? items : [];
    data = list.find(i => i.id === editId) || {};
  } else if (type === "project-assets") {
    data = {
      project: activePaProject || "",
      env_group: activePaDimMode === "env" && activePaGroup !== "默认" ? activePaGroup : "",
      iter_group: activePaDimMode === "iter" && activePaGroup !== "默认" ? activePaGroup : "",
      kind: "file",
    };
  }
  document.getElementById("modal-form").innerHTML = schema.map(f => {
    let val = data[f.key] || "";
    if (f.key === "tags" && Array.isArray(val)) val = val.join(", ");
    val = escapeHtml(val);
    if (f.type === "textarea") {
      const rows = f.rows || 3;
      return `<div class="form-row"><label>${f.label}</label><textarea id="mf-${f.key}" rows="${rows}">${val}</textarea></div>`;
    }
    if (f.type === "select") {
      return `<div class="form-row"><label>${f.label}</label><select id="mf-${f.key}">${f.options.map(o => `<option ${data[f.key] === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
    }
    return `<div class="form-row"><label>${f.label}</label><input id="mf-${f.key}" value="${val}"></div>`;
  }).join("");
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  modalState = { type: null, editId: null };
}

async function submitForm() {
  const type = modalState.type;
  const editId = modalState.editId;
  const schema = FORM_SCHEMAS[type];
  const body = {};
  schema.forEach(f => {
    let val = document.getElementById("mf-" + f.key)?.value || "";
    if (f.key === "tags") val = val.split(",").map(s => s.trim()).filter(Boolean);
    body[f.key] = val;
  });
  if (type === "qa-notes") {
    body.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (editId) {
      const old = allQaNotesCache.find(i => i.id === editId);
      if (old?.created_at) body.created_at = old.created_at;
    } else {
      body.created_at = body.updated_at;
    }
  }
  let result;
  if (editId) {
    result = await api(`${type}/${editId}`, { method: "PUT", body });
  } else {
    result = await api(type, { method: "POST", body });
  }
  if (result?.error) {
    alert("保存失败：" + result.error + (result.error === "not found" ? "\n\n请重启工作台（终端 Ctrl+C 后重新运行 start.bat）" : ""));
    return;
  }
  closeModal();
  if (type === "links") {
    await refreshLinks();
  } else if (type === "file-paths") {
    await refreshFilePaths();
  } else if (type === "project-assets") {
    await refreshProjectAssets(editId ? null : result);
  } else if (type === "qa-notes") {
    await refreshQaNotes();
  } else {
    await renderList(type, renderCommandItem);
  }
}

async function deleteItem(type, id) {
  if (!confirm("确定删除？")) return;
  await api(`${type}/${id}`, { method: "DELETE" });
  if (type === "links") {
    await refreshLinks();
  } else if (type === "file-paths") {
    await refreshFilePaths();
  } else if (type === "project-assets") {
    await refreshProjectAssets();
  } else if (type === "qa-notes") {
    await refreshQaNotes();
  } else {
    await renderList(type, renderCommandItem);
  }
}

/* ---------- 壁纸管理 ---------- */
const WP_PAGE_SIZES = [12, 24, 48];
let wpCache = { items: [], status: null, page: 1, pageSize: 24 };

function wpFileUrl(path) {
  return "/api/wallpaper/file?path=" + encodeURIComponent(path);
}

function wpOpenAt(index) {
  const items = wpCache.items || [];
  openImageGallery(
    items.map((item) => ({
      src: wpFileUrl(item.path),
      title: item.name || "",
      path: item.path,
    })),
    index
  );
}

function wpSelectedTargets() {
  const targets = [];
  if (document.getElementById("wp-target-desktop")?.checked) targets.push("desktop");
  if (document.getElementById("wp-target-lock")?.checked) targets.push("lock");
  return targets;
}

function wpSetStatus(msg) {
  const el = document.getElementById("wp-status-text");
  if (el) el.textContent = msg || "";
}

function wpPageCount() {
  const total = wpCache.items.length;
  return Math.max(1, Math.ceil(total / Math.max(1, wpCache.pageSize)));
}

function wpClampPage() {
  const pages = wpPageCount();
  if (wpCache.page > pages) wpCache.page = pages;
  if (wpCache.page < 1) wpCache.page = 1;
}

function wpRenderDiagnose(diag) {
  const box = document.getElementById("wp-diagnose");
  if (!box || !diag) return;
  const hb = diag.huabao || {};
  const running = (hb.running || []).length;
  const bad = running || hb.startup;
  const reasons = (diag.reasons || []).map(r => `<li>${escapeHtml(r)}</li>`).join("");
  box.className = "wp-diagnose" + (bad ? " is-warn" : " is-ok");
  box.innerHTML = `
    <div class="wp-diagnose-title">${bad ? "发现锁屏干扰源" : "未发现明显干扰"}</div>
    <div class="wp-diagnose-body">${escapeHtml(diag.likely_cause || "")}</div>
    ${reasons ? `<ul class="wp-diagnose-list">${reasons}</ul>` : ""}
    <div class="wp-diagnose-meta">
      360画报：${hb.installed ? "已安装" : "未安装"}
      · 开机启动：${hb.startup ? "是" : "否"}
      · 进程：${running ? running + " 个" : "无"}
      · 屏保：${diag.screensaver?.active ? `开（${diag.screensaver.timeout || "?"}秒）` : "关"}
      · Windows 聚焦：${diag.spotlight?.enabled ? "开" : "关"}
    </div>`;
}

function wpRenderGrid(items) {
  const grid = document.getElementById("wp-grid");
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = `<div class="empty">目录内暂无图片。请把 jpg/png 放到壁纸目录后点刷新。</div>`;
    wpRenderPager();
    return;
  }
  wpClampPage();
  const size = wpCache.pageSize;
  const start = (wpCache.page - 1) * size;
  const pageItems = items.slice(start, start + size);
  if (!grid.dataset.previewBound) {
    grid.dataset.previewBound = "1";
    grid.addEventListener("click", (event) => {
      const thumb = event.target.closest("[data-wp-index]");
      if (!thumb) return;
      wpOpenAt(Number(thumb.getAttribute("data-wp-index")));
    });
  }
  grid.innerHTML = pageItems.map((item, index) => {
    const path = escapeHtml(item.path);
    const name = escapeHtml(item.name);
    const src = wpFileUrl(item.path);
    const globalIndex = start + index;
    const synced = !!item.inLockSync;
    const syncBtn = synced
      ? `<button class="btn btn-sm wp-sync-on" type="button" onclick="wpLockSync(this.closest('.wp-card').dataset.path, 'remove')">移出同步</button>`
      : `<button class="btn btn-sm" type="button" onclick="wpLockSync(this.closest('.wp-card').dataset.path, 'add')">加入锁屏同步</button>`;
    return `<div class="wp-card${synced ? " is-sync" : ""}" data-path="${path}">
      <div class="wp-thumb" data-wp-index="${globalIndex}" title="查看大图">
        <img src="${src}" alt="${name}" loading="lazy" decoding="async">
        ${synced ? `<span class="wp-sync-badge">锁屏同步</span>` : ""}
      </div>
      <div class="wp-card-body">
        <div class="wp-card-name" title="${name}">${name}</div>
        <div class="wp-card-actions">
          <button class="btn btn-sm primary" type="button" onclick="wpApply(this.closest('.wp-card').dataset.path)">应用所选</button>
          <button class="btn btn-sm" type="button" onclick="wpApply(this.closest('.wp-card').dataset.path, ['desktop'])">仅桌面</button>
          <button class="btn btn-sm" type="button" onclick="wpApply(this.closest('.wp-card').dataset.path, ['lock'])">仅锁屏</button>
          ${syncBtn}
        </div>
      </div>
    </div>`;
  }).join("");
  wpRenderPager();
}

function wpPageNums(page, pages) {
  if (pages <= 9) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }
  const marks = new Set([1, pages, page]);
  for (let i = page - 2; i <= page + 2; i += 1) {
    if (i >= 1 && i <= pages) marks.add(i);
  }
  const list = [...marks].sort((a, b) => a - b);
  const out = [];
  list.forEach((n, idx) => {
    if (idx && n - list[idx - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

function wpRenderPager() {
  const box = document.getElementById("wp-pager");
  if (!box) return;
  const total = wpCache.items.length;
  if (!total) {
    box.innerHTML = "";
    return;
  }
  const pages = wpPageCount();
  const page = wpCache.page;
  const sizeOpts = WP_PAGE_SIZES.map((n) =>
    `<option value="${n}" ${n === wpCache.pageSize ? "selected" : ""}>${n}</option>`
  ).join("");
  const nums = wpPageNums(page, pages).map((n) => {
    if (n === "…") return `<span class="wp-page-ellipsis">…</span>`;
    return `<button type="button" class="wp-page-num${n === page ? " is-on" : ""}" onclick="wpGotoPage(${n})">${n}</button>`;
  }).join("");
  box.innerHTML = `
    <span class="hint">共 ${total} 张 · 第 ${page} / ${pages} 页</span>
    <button type="button" class="btn btn-sm" ${page <= 1 ? "disabled" : ""} onclick="wpGotoPage(${page - 1})">上一页</button>
    <div class="wp-page-nums">${nums}</div>
    <button type="button" class="btn btn-sm" ${page >= pages ? "disabled" : ""} onclick="wpGotoPage(${page + 1})">下一页</button>
    <label class="hint wp-page-jump">跳转到
      <input id="wp-page-jump" class="adb-input" type="number" min="1" max="${pages}" value="${page}"
        onkeydown="if(event.key==='Enter')wpJumpToPage()">
      <button type="button" class="btn btn-sm" onclick="wpJumpToPage()">跳转</button>
    </label>
    <label class="hint">每页
      <select class="adb-input" onchange="wpChangePageSize(this.value)">${sizeOpts}</select>
    </label>`;
}

function wpJumpToPage() {
  const el = document.getElementById("wp-page-jump");
  const pages = wpPageCount();
  let n = parseInt(el?.value, 10);
  if (!Number.isFinite(n)) n = wpCache.page;
  if (n < 1) n = 1;
  if (n > pages) n = pages;
  wpGotoPage(n);
}

function wpUpdateSyncHint(st) {
  const hint = document.getElementById("wp-sync-hint");
  const follow = document.getElementById("wp-lock-follow");
  const s = st || wpCache.status || {};
  const n = s.lock_sync_count ?? (wpCache.items || []).filter((x) => x.inLockSync).length;
  const folder = s.lock_sync_folder || "";
  if (hint) {
    hint.textContent = `锁屏同步：${n} 张` + (folder ? `（${folder}）` : "");
    hint.title = folder || "";
  }
  if (follow && typeof s.lock_follow_random === "boolean") {
    follow.checked = s.lock_follow_random;
  }
}

function wpStatusLine() {
  const st = wpCache.status || {};
  const desk = st.desktop_wallpaper ? st.desktop_wallpaper.split(/[/\\\\]/).pop() : "—";
  const syncN = st.lock_sync_count ?? (wpCache.items || []).filter((x) => x.inLockSync).length;
  return `共 ${wpCache.items.length} 张 · 同步 ${syncN} · 第 ${wpCache.page} / ${wpPageCount()} 页 · 当前桌面：${desk}`;
}

function wpGotoPage(page) {
  const pages = wpPageCount();
  let n = Number(page) || 1;
  if (n < 1) n = 1;
  if (n > pages) n = pages;
  wpCache.page = n;
  wpRenderGrid(wpCache.items);
  wpSetStatus(wpStatusLine());
  document.getElementById("wp-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function wpChangePageSize(value) {
  const n = Number(value) || 24;
  wpCache.pageSize = WP_PAGE_SIZES.includes(n) ? n : 24;
  wpCache.page = 1;
  wpRenderGrid(wpCache.items);
  wpSetStatus(wpStatusLine());
}

async function loadWallpaperPage() {
  wpSetStatus("加载中…");
  const st = await api("wallpaper/status");
  wpCache.status = st;
  wpCache.page = 1;
  const cfg = st.config || {};
  const folderEl = document.getElementById("wp-folder");
  const styleEl = document.getElementById("wp-style");
  if (folderEl) folderEl.value = cfg.folder || "";
  if (styleEl) styleEl.value = cfg.style || "fill";
  wpRenderDiagnose(st.diagnose);
  wpUpdateSyncHint(st);
  const list = await api("wallpaper/images");
  wpCache.items = list.items || [];
  wpRenderGrid(wpCache.items);
  wpSetStatus(wpStatusLine());
}

async function wpRefresh() {
  await loadWallpaperPage();
}

async function wpSaveConfig() {
  const folder = document.getElementById("wp-folder")?.value || "";
  const style = document.getElementById("wp-style")?.value || "fill";
  const lockFollow = !!document.getElementById("wp-lock-follow")?.checked;
  const res = await api("wallpaper/config", {
    method: "PUT",
    body: { folder, style, lock_follow_random: lockFollow },
  });
  if (res.error) {
    alert(res.error);
    return;
  }
  wpSetStatus("配置已保存");
  await loadWallpaperPage();
}

async function wpToggleLockFollow(checked) {
  const res = await api("wallpaper/config", {
    method: "PUT",
    body: { lock_follow_random: !!checked },
  });
  if (res.error) {
    alert(res.error);
    return;
  }
  if (wpCache.status) wpCache.status.lock_follow_random = !!checked;
  wpSetStatus(checked ? "已开启：随机换桌面时同步锁屏" : "已关闭锁屏同步");
}

async function wpLockSync(path, action) {
  if (!path) return;
  wpSetStatus(action === "remove" ? "正在移出同步…" : "正在加入锁屏同步…");
  const res = await api("wallpaper/lock-sync", {
    method: "POST",
    body: { path, action: action === "remove" ? "remove" : "add" },
  });
  if (!res.ok) {
    alert(res.error || "操作失败");
    wpSetStatus("同步目录操作失败");
    return;
  }
  const name = (path || "").split(/[/\\]/).pop();
  wpCache.items = (wpCache.items || []).map((it) => {
    if (it.path === path || it.name === name) {
      return { ...it, inLockSync: action !== "remove" };
    }
    return it;
  });
  if (wpCache.status) {
    wpCache.status.lock_sync_count = res.lockSyncCount ?? wpCache.status.lock_sync_count;
  }
  wpRenderGrid(wpCache.items);
  wpUpdateSyncHint(wpCache.status);
  wpSetStatus(
    action === "remove"
      ? `已移出同步：${name}`
      : `已加入锁屏同步：${name}（共 ${res.lockSyncCount ?? "?"} 张）`
  );
}

async function wpApply(path, targets) {
  if (!path) return;
  const style = document.getElementById("wp-style")?.value || "fill";
  const t = targets || wpSelectedTargets();
  if (!t.length) {
    alert("请至少勾选「应用到桌面」或「应用到锁屏」");
    return;
  }
  wpSetStatus("正在应用…");
  const res = await api("wallpaper/set", { method: "POST", body: { path, targets: t, style } });
  if (!res.ok) {
    const detail = res.results
      ? Object.entries(res.results).map(([k, v]) => `${k}: ${v.error || "ok"}`).join("\n")
      : (res.error || "失败");
    alert(detail);
    wpSetStatus("应用失败");
    return;
  }
  const parts = [];
  if (res.results?.desktop?.ok) parts.push("桌面");
  if (res.results?.lock?.ok) parts.push("锁屏");
  wpSetStatus(`已应用到：${parts.join(" + ") || "完成"}`);
  const diag = await api("wallpaper/diagnose");
  wpRenderDiagnose(diag);
}

async function wpRandomDesktop() {
  wpSetStatus("正在随机更换桌面…");
  const res = await api("wallpaper/random", { method: "POST", body: { quiet: true } });
  if (!res.ok) {
    alert(res.error || "随机更换失败");
    wpSetStatus("随机更换失败");
    return;
  }
  wpSetStatus(res.message || "桌面壁纸已更换");
}

async function wpDisable360() {
  if (!confirm("将结束 360画报进程、删除其开机启动，并关闭系统屏保与 Windows 聚焦锁屏轮换。继续？")) return;
  wpSetStatus("正在关闭干扰…");
  const res = await api("wallpaper/disable-360", { method: "POST" });
  const lines = [...(res.actions || []), ...(res.errors || [])];
  alert(lines.join("\n") || (res.ok ? "完成" : "失败"));
  wpRenderDiagnose(res.diagnose || (await api("wallpaper/diagnose")));
  wpSetStatus(res.ok ? "已关闭 360 画报干扰" : "部分操作失败，见提示");
}

/* ---------- 历史复制记录 ---------- */
let cbCache = { items: [], status: null };
let cbSearchTimer = null;
let cbToastTimer = null;

function cbFileUrl(rel) {
  return "/api/clipboard/file?path=" + encodeURIComponent(rel || "");
}

function cbTypeLabel(type) {
  if (type === "image") return "图片";
  if (type === "files") return "文件";
  return "文字";
}

function cbTypeIcon(type) {
  if (type === "image") return "🖼";
  if (type === "files") return "📎";
  return "Aa";
}

function cbSetStatus(msg) {
  const el = document.getElementById("cb-status-text");
  if (el) el.textContent = msg || "";
}

function cbToast(msg) {
  let el = document.getElementById("cb-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "cb-toast";
    el.className = "cb-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(cbToastTimer);
  cbToastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function cbRenderList(items) {
  const box = document.getElementById("cb-list");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="empty">暂无复制记录。在任意软件里 Ctrl+C 后，这里会自动出现。</div>`;
    return;
  }
  box.innerHTML = items.map((it) => {
    const type = it.type || "text";
    let thumb = `<div class="cb-thumb">${cbTypeIcon(type)}</div>`;
    if (type === "image" && (it.thumb || it.file)) {
      const src = cbFileUrl(it.thumb || it.file);
      thumb = `<div class="cb-thumb"><img src="${src}" alt=""></div>`;
    }
    const names = (it.names || []).join("、");
    const preview = escapeHtml(it.preview || names || "(空)");
    const metaExtra = type === "files"
      ? `${(it.paths || []).length} 个`
      : (type === "text" && it.chars != null ? `${it.chars} 字` : (it.size ? `${Math.round(it.size / 1024)} KB` : ""));
    return `<div class="cb-item" data-id="${escapeHtml(it.id)}" onclick="cbOnItemClick(event, '${escapeHtml(it.id)}', this)">
      ${thumb}
      <div class="cb-body">
        <div class="cb-preview" title="${preview}">${preview}</div>
        <div class="cb-meta">
          <span class="cb-type">${cbTypeLabel(type)}</span>
          <span>${escapeHtml(it.created_at || "")}</span>
          ${metaExtra ? `<span>${escapeHtml(metaExtra)}</span>` : ""}
          ${it.count > 1 ? `<span>×${it.count}</span>` : ""}
        </div>
      </div>
      <div class="cb-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm primary" type="button" onclick="cbRestore('${escapeHtml(it.id)}')">再复制</button>
        <button class="btn btn-sm" type="button" onclick="cbDelete('${escapeHtml(it.id)}')">删除</button>
      </div>
    </div>`;
  }).join("");
}

function cbOnItemClick(ev, id, el) {
  const sel = window.getSelection && window.getSelection();
  if (sel && String(sel.toString() || "").trim()) return;
  cbRestore(id, el);
}

async function loadClipboardPage() {
  cbSetStatus("加载中…");
  const st = await api("clipboard/status");
  if (st.error && !st.ok && st.running === undefined) {
    cbSetStatus(st.error);
    return;
  }
  cbCache.status = st;
  const enabled = document.getElementById("cb-enabled");
  const hotkey = document.getElementById("cb-hotkey");
  if (enabled) enabled.checked = !!st.enabled;
  if (hotkey) hotkey.value = st.hotkey || "ctrl+shift+v";
  const q = document.getElementById("cb-search")?.value || "";
  const list = await api("clipboard/items?q=" + encodeURIComponent(q));
  cbCache.items = list.items || [];
  cbRenderList(cbCache.items);
  const hk = (st.hotkey || "ctrl+shift+v").toUpperCase().replace(/\+/g, " + ");
  cbSetStatus(`共 ${cbCache.items.length} 条 · 监听${st.running && st.enabled ? "中" : "关"} · 快捷键 ${hk}${st.error ? " · " + st.error : ""}`);
}

async function cbRefresh() {
  await loadClipboardPage();
}

function cbOnSearch() {
  clearTimeout(cbSearchTimer);
  cbSearchTimer = setTimeout(() => loadClipboardPage(), 220);
}

async function cbToggleEnabled(on) {
  const res = await api("clipboard/config", { method: "PUT", body: { enabled: !!on } });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  await loadClipboardPage();
}

async function cbSaveHotkey() {
  const hotkey = (document.getElementById("cb-hotkey")?.value || "").trim();
  if (!hotkey) {
    alert("请填写快捷键，例如 ctrl+shift+v");
    return;
  }
  const res = await api("clipboard/config", { method: "PUT", body: { hotkey } });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  cbToast("快捷键已保存");
  await loadClipboardPage();
}

async function cbRestore(id, el) {
  if (!id) return;
  document.querySelectorAll(".cb-item.is-active").forEach((n) => n.classList.remove("is-active"));
  if (el) el.classList.add("is-active");
  const res = await api("clipboard/restore", { method: "POST", body: { id } });
  if (!res.ok) {
    alert(res.error || "复制失败");
    return;
  }
  cbToast(res.warning || "已写入剪贴板，可到别处粘贴");
}

async function cbDelete(id) {
  if (!id) return;
  const res = await api("clipboard/items/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) {
    alert(res.error || "删除失败");
    return;
  }
  await loadClipboardPage();
}

async function cbClearAll() {
  if (!confirm("确认清空全部历史复制记录？")) return;
  const res = await api("clipboard/clear", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "清空失败");
    return;
  }
  cbToast(`已清空 ${res.cleared || 0} 条`);
  await loadClipboardPage();
}

async function cbOpenPopup() {
  const res = await api("clipboard/popup", { method: "POST" });
  if (!res.ok) alert(res.error || "无法打开弹窗");
}

/* ========== 区域录屏 ========== */
let rrCache = { status: null, items: [], pollTimer: null };

function rrFileUrl(rel) {
  return "/api/region-record/file?path=" + encodeURIComponent(rel || "");
}

function rrSetStatus(text) {
  const el = document.getElementById("rr-status-text");
  if (el) el.textContent = text || "";
}

function rrToast(msg) {
  cbToast(msg);
}

function rrRenderList(items) {
  const box = document.getElementById("rr-list");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="empty">暂无录制。按快捷键或点「框选录制」，拖出区域后开始；再按同键停止。</div>`;
    return;
  }
  box.innerHTML = items.map((it) => {
    const thumb = it.thumb
      ? `<div class="cb-thumb"><img src="${rrFileUrl(it.thumb)}" alt=""></div>`
      : `<div class="cb-thumb">🎬</div>`;
    const preview = escapeHtml(it.preview || `${it.width || "?"}×${it.height || "?"}`);
    const sizeKb = it.size ? `${Math.round(it.size / 1024)} KB` : "";
    return `<div class="cb-item" data-id="${escapeHtml(it.id)}">
      ${thumb}
      <div class="cb-body">
        <div class="cb-preview" title="${preview}">${preview}</div>
        <div class="cb-meta">
          <span class="cb-type">${escapeHtml(it.engine || "video")}</span>
          <span>${escapeHtml(it.created_at || "")}</span>
          ${sizeKb ? `<span>${escapeHtml(sizeKb)}</span>` : ""}
          ${it.duration != null ? `<span>${escapeHtml(String(it.duration))}s</span>` : ""}
        </div>
      </div>
      <div class="cb-actions">
        <a class="btn btn-sm primary" href="${rrFileUrl(it.file)}" target="_blank" rel="noopener">打开</a>
        <button class="btn btn-sm" type="button" onclick="rrDelete('${escapeHtml(it.id)}')">删除</button>
      </div>
    </div>`;
  }).join("");
}

function rrStopPoll() {
  if (rrCache.pollTimer) {
    clearInterval(rrCache.pollTimer);
    rrCache.pollTimer = null;
  }
}

function rrMaybePoll(st) {
  rrStopPoll();
  if (st && (st.phase === "recording" || st.phase === "selecting")) {
    rrCache.pollTimer = setInterval(() => loadRegionRecordPage(true), 1200);
  }
}

async function loadRegionRecordPage(quiet) {
  if (!quiet) rrSetStatus("加载中…");
  const st = await api("region-record/status");
  if (st.error && !st.ok && st.running === undefined) {
    rrSetStatus(st.error);
    return;
  }
  rrCache.status = st;
  const enabled = document.getElementById("rr-enabled");
  const hotkey = document.getElementById("rr-hotkey");
  const fps = document.getElementById("rr-fps");
  if (enabled) enabled.checked = !!st.enabled;
  if (hotkey) hotkey.value = st.hotkey || "ctrl+shift+r";
  if (fps && document.activeElement !== fps) fps.value = st.fps || 12;
  const list = await api("region-record/items");
  rrCache.items = list.items || [];
  rrRenderList(rrCache.items);
  const hk = (st.hotkey || "ctrl+shift+r").toUpperCase().replace(/\+/g, " + ");
  const phaseMap = { idle: "空闲", selecting: "框选中", recording: "录制中" };
  let phase = phaseMap[st.phase] || st.phase || "空闲";
  if (st.recording && st.recording.elapsed != null) {
    phase += ` ${st.recording.elapsed}s`;
  }
  const engine = st.ffmpeg ? "ffmpeg" : "本机回退(AVI)";
  rrSetStatus(`共 ${rrCache.items.length} 条 · ${phase} · 快捷键 ${hk} · ${engine}${st.error ? " · " + st.error : ""}`);
  rrMaybePoll(st);
}

async function rrRefresh() {
  await loadRegionRecordPage();
}

async function rrToggleEnabled(on) {
  const res = await api("region-record/config", { method: "PUT", body: { enabled: !!on } });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  await loadRegionRecordPage();
}

async function rrSaveHotkey() {
  const hotkey = (document.getElementById("rr-hotkey")?.value || "").trim();
  if (!hotkey) {
    alert("请填写快捷键，例如 ctrl+shift+r");
    return;
  }
  const res = await api("region-record/config", { method: "PUT", body: { hotkey } });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  rrToast("快捷键已保存");
  await loadRegionRecordPage();
}

async function rrSaveFps() {
  const fps = Number(document.getElementById("rr-fps")?.value || 12);
  const res = await api("region-record/config", { method: "PUT", body: { fps } });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  rrToast("帧率已保存");
  await loadRegionRecordPage();
}

async function rrBeginSelect() {
  const res = await api("region-record/select", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "无法开始框选");
    return;
  }
  rrToast(res.message || "请框选区域");
  await loadRegionRecordPage();
}

async function rrStop() {
  const res = await api("region-record/stop", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "当前未在录制");
    return;
  }
  rrToast("正在停止…");
  setTimeout(() => loadRegionRecordPage(), 800);
}

async function rrDelete(id) {
  if (!id) return;
  const res = await api("region-record/items/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) {
    alert(res.error || "删除失败");
    return;
  }
  await loadRegionRecordPage();
}

async function rrClearAll() {
  if (!confirm("确认清空全部区域录屏？")) return;
  const res = await api("region-record/clear", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "清空失败");
    return;
  }
  rrToast(`已清空 ${res.cleared || 0} 条`);
  await loadRegionRecordPage();
}

async function rrOpenFolder() {
  const res = await api("region-record/open-folder", { method: "POST" });
  if (!res.ok) alert(res.error || "无法打开目录");
}

/* ========== 手机延时摄影 ========== */
const tlCache = { status: null, items: [], pollTimer: null };

function tlSetStatus(text) {
  const el = document.getElementById("tl-status-text");
  if (el) el.textContent = text || "";
}

function tlToast(msg) {
  tlSetStatus(msg);
}

function tlReadForm() {
  return {
    base_url: (document.getElementById("tl-base-url")?.value || "").trim(),
    interval_sec: Number(document.getElementById("tl-interval")?.value || 10),
    count: Number(document.getElementById("tl-count")?.value || 0),
    output_fps: Number(document.getElementById("tl-fps")?.value || 12),
    auto_compose: !!document.getElementById("tl-auto-compose")?.checked,
    ensure_stream: true,
  };
}

function tlFileUrl(rel) {
  return "/api/timelapse/file?path=" + encodeURIComponent(rel || "") + "&t=" + Date.now();
}

function tlRenderLog(job) {
  const el = document.getElementById("tl-job-log");
  if (!el) return;
  const lines = (job && job.logs) || [];
  el.textContent = lines.length ? lines.join("\n") : "尚无运行日志";
  el.scrollTop = el.scrollHeight;
}

function tlRenderList(items) {
  const box = document.getElementById("tl-list");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="cb-empty">还没有延时任务。填好摄像头地址后点「开始拍摄」。</div>`;
    return;
  }
  box.innerHTML = items.map(it => {
    const preview = it.preview_rel
      ? `<img class="cb-thumb" src="${tlFileUrl(it.preview_rel)}" alt="">`
      : `<div class="cb-thumb cb-thumb-empty">📷</div>`;
    const meta = [
      `${it.captured || it.frame_count || 0} 帧`,
      `间隔 ${it.interval_sec || "-"}s`,
      it.status || "",
      it.created_at || "",
    ].filter(Boolean).join(" · ");
    const videoBtn = it.has_video
      ? `<a class="btn btn-sm primary" href="${tlFileUrl(it.video_rel)}" target="_blank" rel="noopener">打开视频</a>`
      : `<button class="btn btn-sm primary" type="button" onclick="tlCompose('${escapeHtml(it.id)}')">合成视频</button>`;
    return `<div class="cb-item">
      ${preview}
      <div class="cb-body">
        <div class="cb-preview" title="${escapeHtml(it.id)}">${escapeHtml(it.id)}</div>
        <div class="cb-meta"><span>${escapeHtml(meta)}</span>
          ${it.base_url ? `<span title="${escapeHtml(it.base_url)}">${escapeHtml(it.base_url)}</span>` : ""}
        </div>
      </div>
      <div class="cb-actions">
        ${videoBtn}
        <button class="btn btn-sm" type="button" onclick="tlDelete('${escapeHtml(it.id)}')">删除</button>
      </div>
    </div>`;
  }).join("");
}

function tlStopPoll() {
  if (tlCache.pollTimer) {
    clearInterval(tlCache.pollTimer);
    tlCache.pollTimer = null;
  }
}

function tlMaybePoll(st) {
  tlStopPoll();
  const running = st && (st.running || (st.job && (st.job.status === "running" || st.job.status === "composing")));
  if (running) {
    tlCache.pollTimer = setInterval(() => loadTimelapsePage(true), 1500);
  }
}

async function loadTimelapsePage(quiet) {
  if (!quiet) tlSetStatus("加载中…");
  const st = await api("timelapse/status");
  if (st.error && !st.ok && st.running === undefined) {
    tlSetStatus(st.error);
    return;
  }
  tlCache.status = st;
  const cfg = st.config || {};
  const urlEl = document.getElementById("tl-base-url");
  const iv = document.getElementById("tl-interval");
  const ct = document.getElementById("tl-count");
  const fps = document.getElementById("tl-fps");
  const ac = document.getElementById("tl-auto-compose");
  if (urlEl && document.activeElement !== urlEl) urlEl.value = cfg.base_url || "";
  if (iv && document.activeElement !== iv) iv.value = cfg.interval_sec ?? 10;
  if (ct && document.activeElement !== ct) ct.value = cfg.count ?? 60;
  if (fps && document.activeElement !== fps) fps.value = cfg.output_fps ?? 12;
  if (ac) ac.checked = cfg.auto_compose !== false;

  const list = await api("timelapse/jobs");
  tlCache.items = list.items || [];
  tlRenderList(tlCache.items);
  tlRenderLog(st.job);

  const job = st.job || {};
  const phase = job.status || (st.running ? "running" : "idle");
  const ff = st.ffmpeg ? "ffmpeg OK" : "未找到 ffmpeg";
  let msg = `共 ${tlCache.items.length} 个任务 · ${phase}`;
  if (job.captured != null && (phase === "running" || phase === "composing")) {
    msg += ` · 已拍 ${job.captured}${job.count ? "/" + job.count : ""}`;
  }
  if (job.last_error) msg += " · " + job.last_error;
  msg += " · " + ff;
  tlSetStatus(msg);
  tlMaybePoll(st);
}

async function tlRefresh() {
  await loadTimelapsePage();
}

async function tlSaveConfig() {
  const body = tlReadForm();
  const res = await api("timelapse/config", { method: "PUT", body });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  tlToast("配置已保存");
  await loadTimelapsePage();
}

async function tlProbe() {
  const body = tlReadForm();
  await api("timelapse/config", { method: "PUT", body });
  const res = await api("timelapse/probe", { method: "POST", body: { base_url: body.base_url } });
  if (!res.ok && !res.reachable) {
    alert((res.error || "检测失败") + (res.hint ? "\n" + res.hint : ""));
    return;
  }
  const streaming = res.streaming || {};
  const active = streaming.isActive || streaming.webStreamingActive;
  tlToast(
    (res.reachable ? "可达" : "未知") +
      (res.provider ? " · " + res.provider : "") +
      (active ? " · 推流中" : " · 未推流") +
      (res.camera ? " · 相机 " + res.camera : "")
  );
}

async function tlEnsureStream() {
  const body = tlReadForm();
  const res = await api("timelapse/ensure-stream", { method: "POST", body: { base_url: body.base_url } });
  if (!res.ok) {
    alert((res.error || "启动推流失败") + (res.hint ? "\n" + res.hint : ""));
    return;
  }
  tlToast(res.already ? "推流已在运行" : res.started ? "已启动推流" : "已就绪");
}

async function tlPreview() {
  const body = tlReadForm();
  tlToast("正在拉一帧…");
  const res = await api("timelapse/preview", { method: "POST", body: { base_url: body.base_url, ensure: true } });
  const img = document.getElementById("tl-preview-img");
  if (!res.ok) {
    if (img) img.classList.add("hidden");
    alert((res.error || "预览失败") + (res.logs ? "\n" + (res.logs || []).slice(0, 3).join("\n") : ""));
    return;
  }
  if (img) {
    img.src = res.url || tlFileUrl(res.rel);
    img.classList.remove("hidden");
  }
  tlToast(`预览成功 ${Math.round((res.size || 0) / 1024)} KB`);
}

async function tlStart() {
  const body = tlReadForm();
  if (!body.base_url) {
    alert("请填写摄像头地址，例如 http://192.168.0.108:8080");
    return;
  }
  const res = await api("timelapse/start", { method: "POST", body });
  if (!res.ok) {
    alert(res.error || "无法启动");
    return;
  }
  tlToast("任务已启动 " + (res.job_id || ""));
  await loadTimelapsePage();
}

async function tlStop() {
  const res = await api("timelapse/stop", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "当前没有运行中的任务");
    return;
  }
  tlToast("正在停止…");
  setTimeout(() => loadTimelapsePage(), 800);
}

async function tlCompose(id) {
  if (!id) return;
  tlToast("合成中…");
  const fps = Number(document.getElementById("tl-fps")?.value || 12);
  const res = await api("timelapse/jobs/" + encodeURIComponent(id) + "/compose", {
    method: "POST",
    body: { fps },
  });
  if (!res.ok) {
    alert(res.error || "合成失败");
    return;
  }
  tlToast(`合成完成 ${Math.round((res.size || 0) / 1024 / 1024 * 100) / 100} MB`);
  await loadTimelapsePage();
}

async function tlDelete(id) {
  if (!id) return;
  if (!confirm("删除该延时任务及全部帧？")) return;
  const res = await api("timelapse/jobs/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) {
    alert(res.error || "删除失败");
    return;
  }
  await loadTimelapsePage();
}

async function tlClearAll() {
  if (!confirm("确认清空全部延时任务？")) return;
  const res = await api("timelapse/clear", { method: "POST" });
  if (!res.ok) {
    alert(res.error || "清空失败");
    return;
  }
  tlToast(`已清空 ${res.cleared || 0} 个`);
  await loadTimelapsePage();
}

async function tlOpenFolder() {
  const res = await api("timelapse/open-folder", { method: "POST" });
  if (!res.ok) alert(res.error || "无法打开目录");
}

/* ========== 业务自动化（方案展示） ========== */
let aqCache = null;
let aqActiveLineId = "overview";
let aqRuntime = { modules: [], runs: [], latestByModule: {} };
let aqRunningModuleId = "";
const AQ_SPRITE_HISTORY_KEY = "workbench.autoQa.sprite.history";
const AQ_SPRITE_SETTINGS_KEY = "workbench.autoQa.sprite.settings";
let aqSpriteHistory = [];

async function loadAutoQaPage() {
  const banner = document.getElementById("aq-eval-banner");
  const list = document.getElementById("aq-biz-list");
  if (!banner || !list) return;
  banner.textContent = "加载方案中…";
  const data = await api("auto-qa-plans");
  if (data.error) {
    banner.textContent = "加载失败：" + data.error;
    return;
  }
  aqCache = data;
  if (!data.businessLines?.some((l) => l.id === aqActiveLineId)) {
    aqActiveLineId = data.businessLines?.[0]?.id || "overview";
  }
  renderAutoQaEval();
  renderAutoQaBizList();
  renderAutoQaMain();
  await loadAutoQaModules();
  initAutoQaSprite();
}

function renderAutoQaEval() {
  const banner = document.getElementById("aq-eval-banner");
  if (!banner || !aqCache?.evalSummary) return;
  const e = aqCache.evalSummary;
  const b = e.breakdown || {};
  banner.innerHTML = `
    <div class="aq-eval-score">质量评分 <strong>${escapeHtml(e.score)}</strong> / 100</div>
    <div class="aq-eval-dims">
      清晰度 ${b.clarity ?? "—"} · 简洁性 ${b.simplicity ?? "—"} · 可行性 ${b.feasibility ?? "—"} · 兼容性 ${b.compatibility ?? "—"}
    </div>
    <p class="aq-eval-note">${escapeHtml(e.note || "")}</p>
  `;
}

function renderAutoQaBizList() {
  const list = document.getElementById("aq-biz-list");
  if (!list || !aqCache) return;
  list.innerHTML = (aqCache.businessLines || []).map((line) => `
    <button type="button" class="link-nav-item${line.id === aqActiveLineId ? " is-active" : ""}"
      onclick="selectAutoQaLine('${escapeHtml(line.id)}')">
      <span class="link-nav-label">${escapeHtml(line.name)}</span>
    </button>
  `).join("");
}

function selectAutoQaLine(lineId) {
  aqActiveLineId = lineId;
  renderAutoQaBizList();
  renderAutoQaMain();
  renderAutoQaModules();
}

async function loadAutoQaModules() {
  const data = await api("auto-qa/modules");
  aqRuntime = data?.ok
    ? data
    : { modules: [], runs: [], latestByModule: {} };
  renderAutoQaModules();
}

function autoQaRunLabel(run) {
  if (!run) return "尚未执行";
  if (run.status === "passed") return "最近通过";
  if (run.status === "failed") return "最近失败";
  return "执行中";
}

function renderAutoQaModules() {
  const box = document.getElementById("aq-modules");
  if (!box) return;
  const all = aqRuntime.modules || [];
  const modules = aqActiveLineId === "overview"
    ? all
    : all.filter(item => item.businessLine === aqActiveLineId);
  if (!modules.length) {
    box.innerHTML = '<p class="aq-empty">当前业务线暂无模块。网页模块可从测试点同步，软件模块可添加 Airtest 脚本。</p>';
    return;
  }
  box.innerHTML = modules.map(module => {
    const run = (aqRuntime.latestByModule || {})[module.id];
    const engine = module.engine === "airtest" ? "airtest" : "playwright";
    const engineLabel = engine === "airtest" ? "Airtest" : "Playwright";
    const source = engine === "airtest"
      ? module.scriptPath || "未配置 .air 路径"
      : module.baseUrl || `测试点记录 ${module.sourceRecordId || "未关联"}`;
    const running = aqRunningModuleId === module.id;
    const report = run?.report && run.engine === "playwright"
      ? `<a class="btn btn-sm" target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/report/">查看报告</a>`
      : "";
    return `
      <article class="aq-module">
        <div class="aq-module-top">
          <div>
            <span class="aq-engine-tag ${engine}">${engineLabel}</span>
            <div class="aq-module-name">${escapeHtml(module.name || "未命名模块")}</div>
          </div>
        </div>
        <div class="aq-module-meta">
          ${module.projectName ? `${escapeHtml(module.projectName)} · ` : ""}
          ${escapeHtml(source)}
        </div>
        <div class="aq-module-actions">
          <button class="btn primary btn-sm" type="button"
            ${running ? "disabled" : ""}
            onclick="runAutoQaModule('${escapeHtml(module.id)}')">
            ${running ? "执行中…" : "运行模块"}
          </button>
          ${report}
          <span class="aq-run-status ${escapeHtml(run?.status || "")}">${autoQaRunLabel(run)}</span>
        </div>
      </article>`;
  }).join("");
}

async function syncAutoQaPlaywright() {
  const res = await api("auto-qa/modules/sync-playwright", {
    method: "POST",
    body: {},
  });
  if (!res.ok) {
    alert(res.error || "同步失败");
    return;
  }
  await loadAutoQaModules();
  alert(res.added ? `已新增 ${res.added} 个 Playwright 模块` : "已同步，没有新的 Playwright 脚本");
}

function showAutoQaAirtestForm() {
  document.getElementById("aq-airtest-form")?.classList.remove("hidden");
  document.getElementById("aq-air-name")?.focus();
}

function hideAutoQaAirtestForm() {
  document.getElementById("aq-airtest-form")?.classList.add("hidden");
}

async function createAutoQaAirtestModule() {
  const name = document.getElementById("aq-air-name")?.value.trim() || "";
  const scriptPath = document.getElementById("aq-air-script")?.value.trim() || "";
  if (!name || !scriptPath) {
    alert("请填写模块名称和 .air 脚本路径");
    return;
  }
  const res = await api("auto-qa/modules", {
    method: "POST",
    body: {
      name,
      engine: "airtest",
      businessLine: document.getElementById("aq-air-line")?.value || "oa-pc",
      scriptPath,
      device: document.getElementById("aq-air-device")?.value.trim() || "",
      packageName: document.getElementById("aq-air-package")?.value.trim() || "",
    },
  });
  if (!res.ok) {
    alert(res.error || "保存失败");
    return;
  }
  hideAutoQaAirtestForm();
  ["aq-air-name", "aq-air-script", "aq-air-device", "aq-air-package"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
  await loadAutoQaModules();
}

async function runAutoQaModule(moduleId) {
  if (aqRunningModuleId) return;
  aqRunningModuleId = moduleId;
  renderAutoQaModules();
  const result = document.getElementById("aq-run-result");
  if (result) {
    result.classList.remove("hidden");
    result.innerHTML = "<strong>正在执行自动化模块，请稍候…</strong>";
  }
  try {
    const res = await api(`auto-qa/modules/${encodeURIComponent(moduleId)}/run`, {
      method: "POST",
      body: {},
    });
    const run = res.run || {};
    if (result) {
      const report = run.report && run.engine === "playwright"
        ? `<p><a target="_blank" href="/api/auto-qa/runs/${encodeURIComponent(run.id)}/report/">打开 Playwright HTML 报告</a></p>`
        : "";
      result.innerHTML = `
        <strong>${res.ok ? "执行通过" : "执行失败"}</strong>
        ${run.error ? `<p>${escapeHtml(run.error)}</p>` : ""}
        ${report}
        <pre>${escapeHtml(run.output || "无控制台输出")}</pre>`;
    }
  } catch (err) {
    if (result) result.innerHTML = `<strong>执行失败</strong><p>${escapeHtml(err.message || String(err))}</p>`;
  } finally {
    aqRunningModuleId = "";
    await loadAutoQaModules();
  }
}

function loadAutoQaSpriteSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(AQ_SPRITE_SETTINGS_KEY) || "{}");
    const own = data && typeof data === "object" ? data : {};
    if ((own.apiKey || "").trim()) {
      return { ...own, source: own.source || "sprite" };
    }
    const agile = getAgileSimLlmConfig();
    if (agile) return agile;
    return own;
  } catch {
    return {};
  }
}

function updateAutoQaSpriteModeHint(extra) {
  const hint = document.getElementById("aq-sprite-mode-hint");
  if (!hint) return;
  const settings = loadAutoQaSpriteSettings();
  const hasKey = !!(settings.apiKey || "").trim();
  const model = (settings.model || "deepseek-chat").trim();
  const sourceLabel = settings.source === "agile-sim" ? "，复用测试点生成配置" : "";
  hint.textContent = hasKey
    ? `当前：大模型模式（${model}${sourceLabel}）`
    : "当前：本地知识模式。未配置 API Key；若已在测试点生成里配置，刷新本页后会自动复用，也可在「模型设置」单独填写。";
  if (extra) hint.textContent += ` ${extra}`;
}

function initAutoQaSprite() {
  const settings = loadAutoQaSpriteSettings();
  const base = document.getElementById("aq-sprite-base");
  const model = document.getElementById("aq-sprite-model");
  const key = document.getElementById("aq-sprite-key");
  if (base) base.value = settings.baseUrl || "https://api.deepseek.com/v1";
  if (model) model.value = settings.model || "deepseek-chat";
  if (key) key.value = settings.source === "sprite" ? (settings.apiKey || "") : "";
  updateAutoQaSpriteModeHint();
  syncAgileSimLlmToSprite().then(() => updateAutoQaSpriteModeHint());
  try {
    const saved = JSON.parse(localStorage.getItem(AQ_SPRITE_HISTORY_KEY) || "[]");
    aqSpriteHistory = Array.isArray(saved) ? saved.slice(-30) : [];
  } catch {
    aqSpriteHistory = [];
  }
  if (!aqSpriteHistory.length) {
    aqSpriteHistory = [{
      role: "assistant",
      content: "我是业务精灵。可以问我 OA、商务、会长、SDK、充值与分佣流程，也可以让我推荐 Playwright 或 Airtest 模块。",
    }];
  }
  renderAutoQaSpriteHistory();
  loadAutoQaSpriteSharedHistory();
  const input = document.getElementById("aq-sprite-input");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendAutoQaSpriteMessage();
      }
    });
  }
}

async function loadAutoQaSpriteSharedHistory() {
  try {
    const res = await api("auto-qa/sprite/state");
    if (res.ok && Array.isArray(res.history) && res.history.length) {
      aqSpriteHistory = res.history.slice(-30);
      persistAutoQaSpriteHistory();
      renderAutoQaSpriteHistory();
    }
  } catch (_) {}
}

function renderAutoQaSpriteHistory() {
  const box = document.getElementById("aq-sprite-chat");
  if (!box) return;
  box.innerHTML = aqSpriteHistory.map(item =>
    `<div class="aq-sprite-msg ${item.role === "user" ? "user" : "assistant"}">${escapeHtml(item.content || "")}</div>`
  ).join("");
  box.scrollTop = box.scrollHeight;
}

function persistAutoQaSpriteHistory() {
  try {
    localStorage.setItem(AQ_SPRITE_HISTORY_KEY, JSON.stringify(aqSpriteHistory.slice(-30)));
  } catch (_) {}
}

function toggleAutoQaSpriteSettings() {
  document.getElementById("aq-sprite-settings")?.classList.toggle("hidden");
}

function saveAutoQaSpriteSettings() {
  const settings = {
    baseUrl: document.getElementById("aq-sprite-base")?.value.trim() || "",
    model: document.getElementById("aq-sprite-model")?.value.trim() || "",
    apiKey: document.getElementById("aq-sprite-key")?.value.trim() || "",
  };
  localStorage.setItem(AQ_SPRITE_SETTINGS_KEY, JSON.stringify(settings));
  document.getElementById("aq-sprite-settings")?.classList.add("hidden");
  updateAutoQaSpriteModeHint();
}

function renderAutoQaSpriteRecommendations(items) {
  const box = document.getElementById("aq-sprite-recommendations");
  if (!box) return;
  box.innerHTML = (items || []).map(item => `
    <div class="aq-sprite-rec">
      <span>${item.engine === "airtest" ? "🖥️" : "🌐"} ${escapeHtml(item.name || item.id)}</span>
      <button class="btn btn-sm primary" type="button" onclick="runAutoQaModule('${escapeHtml(item.id)}')">确认运行</button>
    </div>
  `).join("");
}

async function sendAutoQaSpriteMessage() {
  const input = document.getElementById("aq-sprite-input");
  const send = document.getElementById("aq-sprite-send");
  const message = input?.value.trim() || "";
  if (!message || send?.disabled) return;
  aqSpriteHistory.push({ role: "user", content: message });
  input.value = "";
  renderAutoQaSpriteHistory();
  if (send) {
    send.disabled = true;
    send.textContent = "思考中…";
  }
  const settings = loadAutoQaSpriteSettings();
  try {
    const res = await api("auto-qa/sprite/chat", {
      method: "POST",
      body: {
        message,
        history: aqSpriteHistory.slice(-10),
        config: settings,
      },
    });
    if (res.ok && Array.isArray(res.history)) {
      aqSpriteHistory = res.history.slice(-30);
    } else {
      aqSpriteHistory.push({
        role: "assistant",
        content: res.error || "暂时无法回答",
      });
    }
    renderAutoQaSpriteRecommendations(res.recommendations || []);
    updateAutoQaSpriteModeHint();
  } catch (err) {
    aqSpriteHistory.push({ role: "assistant", content: `请求失败：${err.message || err}` });
  } finally {
    persistAutoQaSpriteHistory();
    renderAutoQaSpriteHistory();
    if (send) {
      send.disabled = false;
      send.textContent = "发送";
    }
    input?.focus();
  }
}

async function launchAutoQaDesktopSprite() {
  const res = await api("auto-qa/sprite/launch", { method: "POST", body: {} });
  if (!res.ok) {
    alert(res.error || "桌面精灵启动失败");
    return;
  }
  alert(res.status === "already_running" ? "桌面精灵已经在运行" : "桌面精灵已启动");
}

function renderAutoQaMain() {
  const adviceEl = document.getElementById("aq-line-advice");
  const solEl = document.getElementById("aq-solutions");
  if (!adviceEl || !solEl || !aqCache) return;

  const line = (aqCache.businessLines || []).find((l) => l.id === aqActiveLineId);
  const advice = (aqCache.lineAdvice || {})[aqActiveLineId] || {};
  const recommended = aqCache.evalSummary?.recommended;

  adviceEl.innerHTML = `
    <div class="aq-advice-head">
      <h2>${escapeHtml(line?.name || "业务线")}</h2>
      <span class="aq-plat">${escapeHtml(line?.platform || "")}</span>
    </div>
    <p class="aq-desc">${escapeHtml(line?.desc || "")}</p>
    <div class="aq-tags">
      ${(line?.roles || []).map((r) => `<span class="aq-tag">${escapeHtml(r)}</span>`).join("")}
    </div>
    <div class="aq-flows">
      ${(line?.flows || []).map((f) => `<span class="aq-flow">${escapeHtml(f)}</span>`).join("")}
    </div>
    <h3 class="aq-advice-title">${escapeHtml(advice.headline || "方案建议")}</h3>
    <p class="aq-advice-body">${escapeHtml(advice.body || "")}</p>
    <ol class="aq-next">
      ${(advice.next || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
    </ol>
  `;

  const sols = (aqCache.solutions || []).filter(
    (s) => !s.forLines || s.forLines.includes(aqActiveLineId)
  );
  solEl.innerHTML = sols.map((s) => {
    const isRec = s.id === recommended;
    const links = [
      s.github ? `<a href="${escapeHtml(s.github)}" target="_blank" rel="noopener">GitHub</a>` : "",
      s.githubAlt ? `<a href="${escapeHtml(s.githubAlt)}" target="_blank" rel="noopener">相关</a>` : "",
    ].filter(Boolean).join(" · ");
    return `
      <article class="aq-sol${isRec ? " is-recommended" : ""}">
        <div class="aq-sol-top">
          <div>
            <span class="aq-sol-tag">${escapeHtml(s.tag || "")}</span>
            <h3>${escapeHtml(s.name)}</h3>
          </div>
          <div class="aq-fit">契合度 <strong>${escapeHtml(s.fitScore)}</strong></div>
        </div>
        <div class="aq-match">
          ${(s.match || []).map((m) => `<span class="aq-chip">${escapeHtml(m)}</span>`).join("")}
        </div>
        <div class="aq-cols">
          <div>
            <div class="aq-col-title">优点</div>
            <ul>${(s.pros || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="aq-col-title">注意</div>
            <ul>${(s.cons || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
          </div>
        </div>
        <p class="aq-phase">${escapeHtml(s.phase || "")}</p>
        <div class="aq-links">${links}</div>
      </article>
    `;
  }).join("") || `<p class="aq-empty">该业务线暂无单独方案，请看总览。</p>`;
}

function resolveMarkdownAssetUrl(src, baseDir) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:|\/api\/)/i.test(raw)) return raw;
  let abs = raw;
  if (baseDir && !/^[a-zA-Z]:[\\/]/.test(raw) && !raw.startsWith("\\\\")) {
    const sep = baseDir.includes("\\") ? "\\" : "/";
    abs = baseDir.replace(/[\\/]+$/, "") + sep + raw.replace(/^\.\//, "").replace(/\//g, sep);
  }
  return "/api/test-info/file?path=" + encodeURIComponent(abs);
}

function renderSimpleMarkdown(md, opts = {}) {
  const baseDir = opts.baseDir || "";
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableBuf = [];

  const flushList = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };
  const flushTable = () => {
    if (!inTable) return;
    const rows = tableBuf.filter((r) => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(r));
    if (rows.length) {
      out.push("<table>");
      rows.forEach((row, idx) => {
        const cells = row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const tag = idx === 0 ? "th" : "td";
        out.push("<tr>" + cells.map((c) => `<${tag}>${inlineMd(c)}</${tag}>`).join("") + "</tr>");
      });
      out.push("</table>");
    }
    tableBuf = [];
    inTable = false;
  };
  const inlineMd = (s) => escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const url = resolveMarkdownAssetUrl(src.replace(/&amp;/g, "&"), baseDir);
      const safeAlt = escapeHtml(alt || "");
      if (!url) return safeAlt || "[图片]";
      return `<a class="ti-md-img-link" href="${url}" target="_blank" rel="noopener" title="点击查看大图"><img class="ti-md-img" src="${url}" alt="${safeAlt}" loading="lazy"></a>`;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flushList();
      flushTable();
      if (inCode) {
        out.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      flushList();
      inTable = true;
      tableBuf.push(line);
      i++;
      continue;
    }
    if (inTable) flushTable();

    if (/^---+\s*$/.test(line)) {
      flushList();
      out.push("<hr>");
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushList();
      const lv = h[1].length;
      out.push(`<h${lv}>${inlineMd(h[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushList();
      out.push(`<blockquote><p>${inlineMd(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) { flushList(); out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ""))}</li>`);
      i++;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) { flushList(); out.push("<ol>"); inOl = true; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ""))}</li>`);
      i++;
      continue;
    }
    if (!line.trim()) {
      flushList();
      i++;
      continue;
    }
    flushList();
    out.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }
  flushList();
  flushTable();
  if (inCode) out.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
  return out.join("\n");
}

async function openProjectIterationDoc(path, title) {
  const modal = document.getElementById("aq-doc-modal");
  const body = document.getElementById("aq-doc-body");
  const titleEl = document.getElementById("aq-doc-title");
  const meta = document.getElementById("aq-doc-meta");
  if (!modal || !body) return;
  if (titleEl) titleEl.textContent = title || "文档";
  if (meta) meta.textContent = "加载中…";
  body.innerHTML = "<p>加载中…</p>";
  modal.classList.remove("hidden");
  const data = await api("project-docs/content?path=" + encodeURIComponent(path));
  if (!data?.ok || data.error) {
    body.innerHTML = `<p>${escapeHtml(data?.error || "加载失败")}</p>`;
    if (meta) meta.textContent = path;
    return;
  }
  if (titleEl) titleEl.textContent = title || data.title || "文档";
  const bits = [];
  if (data.updatedAt) bits.push("更新 " + data.updatedAt);
  if (data.path) bits.push(data.path);
  if (meta) meta.textContent = bits.join(" · ");
  body.innerHTML = renderSimpleMarkdown(data.markdown || "");
  body.scrollTop = 0;
}

/* ========== 测试信息库 ========== */
	let testInfoCache = { items: [], categories: [], scan: {}, course: {}, backend: {}, frontend: {} };
	let testInfoCat = "知识手册";
	let testInfoTrack = "";
	let testInfoBound = false;
	
	function bindTestInfoUiOnce() {
	  if (testInfoBound) return;
	  testInfoBound = true;
	  document.getElementById("search-test-info")?.addEventListener("input", () => renderTestInfoList());
	}

	function testInfoHasTracks(cat) {
	  return cat === "课程资料" || cat === "后端知识" || cat === "前端知识";
	}

	function testInfoTracksFor(cat) {
	  if (cat === "课程资料") return (testInfoCache.course && testInfoCache.course.tracks) || [];
	  if (cat === "后端知识") return (testInfoCache.backend && testInfoCache.backend.tracks) || [];
	  if (cat === "前端知识") return (testInfoCache.frontend && testInfoCache.frontend.tracks) || [];
	  return [];
	}
	
	async function loadTestInfoPage() {
	  bindTestInfoUiOnce();
	  const box = document.getElementById("list-test-info");
	  if (box) box.innerHTML = `<div class="empty">加载中…</div>`;
	  try {
	    const data = await api("test-info/catalog");
	    testInfoCache = data || { items: [], categories: [], course: {}, backend: {}, frontend: {} };
	    const cats = testInfoCache.categories || [];
	    if (!cats.some(c => c.name === testInfoCat) && cats[0]) testInfoCat = cats[0].name;
	    renderTestInfoCategories();
	    renderTestInfoTracks();
	    renderTestInfoList();
	    const meta = document.getElementById("ti-scan-meta");
	    if (meta) {
	      const s = testInfoCache.scan || {};
	      const c = testInfoCache.course || {};
	      const b = testInfoCache.backend || {};
	      const f = testInfoCache.frontend || {};
	      const bits = [];
	      if (b.updatedAt) bits.push(`后端索引：${b.count || 0} 条 · ${b.updatedAt}`);
	      else bits.push("后端索引未生成（可点「重建后端索引」）");
	      if (f.updatedAt) bits.push(`前端索引：${f.count || 0} 条 · ${f.updatedAt}`);
	      else bits.push("前端索引未生成（可点「重建前端索引」）");
	      if (c.updatedAt) bits.push(`课程索引：${c.count || 0} 条 · ${c.updatedAt}`);
	      else bits.push("课程索引未生成（可点「重建课程索引」）");
	      bits.push(s.updatedAt ? `本机扫描：${s.count || 0} 条 · ${s.updatedAt}` : "尚未扫描本机");
	      meta.textContent = bits.join("\n");
	    }
	  } catch (err) {
	    if (box) box.innerHTML = `<div class="empty">${escapeHtml(err.message || String(err))}</div>`;
	  }
	}
	
	function renderTestInfoCategories() {
	  const box = document.getElementById("ti-categories");
	  if (!box) return;
	  const cats = testInfoCache.categories || [];
	  box.innerHTML = cats.map(c => {
	    const active = c.name === testInfoCat ? " is-active" : "";
	    return `<button type="button" class="links-nav-item${active}" onclick='selectTestInfoCat(${JSON.stringify(c.name)})'>${escapeHtml(c.name)} <span class="ti-count">${c.count || 0}</span></button>`;
	  }).join("");
	}
	
	function selectTestInfoCat(name) {
	  testInfoCat = name;
	  if (!testInfoHasTracks(name)) testInfoTrack = "";
	  renderTestInfoCategories();
	  renderTestInfoTracks();
	  renderTestInfoList();
	}

	function renderTestInfoTracks() {
	  const box = document.getElementById("ti-tracks");
	  if (!box) return;
	  const show = testInfoHasTracks(testInfoCat);
	  box.classList.toggle("hidden", !show);
	  if (!show) {
	    box.innerHTML = "";
	    return;
	  }
	  const tracks = testInfoTracksFor(testInfoCat);
	  const chips = [
	    { id: "", name: "全部", count: (testInfoCache.items || []).filter(x => x.category === testInfoCat).length },
	    ...tracks.map(t => ({ id: t.name, name: t.name, count: t.count })),
	  ];
	  box.innerHTML = chips.map(t => {
	    const active = (t.id || "") === (testInfoTrack || "") ? " is-active" : "";
	    return `<button type="button" class="ti-track-chip${active}" onclick='selectTestInfoTrack(${JSON.stringify(t.id || "")})'>${escapeHtml(t.name)} <span class="ti-count">${t.count || 0}</span></button>`;
	  }).join("");
	}

	function selectTestInfoTrack(name) {
	  testInfoTrack = name || "";
	  renderTestInfoTracks();
	  renderTestInfoList();
	}
	
	function renderTestInfoList() {
	  const box = document.getElementById("list-test-info");
	  if (!box) return;
	  const q = (document.getElementById("search-test-info")?.value || "").trim().toLowerCase();
	  let items = (testInfoCache.items || []).filter(it => it.category === testInfoCat);
	  if (testInfoHasTracks(testInfoCat) && testInfoTrack) {
	    items = items.filter(it => (it.track || it.note || "") === testInfoTrack);
	  }
	  if (q) {
	    items = items.filter(it => {
	      const blob = [it.title, it.note, it.track, it.summary, it.path, it.url, it.ext, it.rel].join(" ").toLowerCase();
	      return blob.includes(q);
	    });
	  }
	  if (!items.length) {
	    let tip = "该分类下暂无条目";
	    if (testInfoCat === "本机资料") tip = "暂无本机资料，请点「扫描本机」";
	    if (testInfoCat === "课程资料") tip = "暂无课程资料，请确认课件目录存在后点「重建课程索引」";
	    if (testInfoCat === "后端知识") tip = "暂无后端知识，请确认桌面「后端学习用」存在后点「重建后端索引」";
	    if (testInfoCat === "前端知识") tip = "暂无前端知识，请点「重建前端索引」生成手册索引";
	    box.innerHTML = `<div class="empty">${tip}</div>`;
	    return;
	  }
	  box.innerHTML = items.map(it => {
	    const meta = [
	      it.track || "",
	      it.ext && it.ext !== "url" ? it.ext : "",
	      it.size_mb != null ? it.size_mb + " MB" : "",
	      it.mtime || "",
	      (!it.track && it.note) ? it.note : "",
	    ].filter(Boolean).join(" · ");
	    const summary = (it.summary || "").trim();
	    const openBtn = it.kind === "link"
	      ? `<button class="btn btn-sm primary" type="button" onclick='openTestInfoItem(${JSON.stringify(it.id)})'>打开链接</button>`
	      : `<button class="btn btn-sm primary" type="button" onclick='openTestInfoItem(${JSON.stringify(it.id)})'>查阅</button>`;
	    const summaryBlock = (testInfoHasTracks(testInfoCat) || summary)
	      ? `<div class="ti-summary" title="${escapeHtml(summary)}">${escapeHtml(summary || "暂无摘要")}</div>`
	      : "";
	    return `<div class="item ti-item">
	      <div class="item-body">
	        <div class="item-title">${escapeHtml(it.title || "")}</div>
	        <div class="item-meta">${escapeHtml(meta)}</div>
	      </div>
	      ${summaryBlock}
	      <div class="item-actions">${openBtn}</div>
	    </div>`;
	  }).join("");
	}

function findTestInfoItem(id) {
  return (testInfoCache.items || []).find(x => x.id === id);
}

async function openTestInfoItem(id) {
  const it = findTestInfoItem(id);
  if (!it) return;
  if (it.kind === "link" && it.url) {
    window.open(it.url, "_blank", "noopener");
    return;
  }
  const ext = (it.ext || "").toLowerCase();
  if (ext === ".pdf") {
    const url = "/api/test-info/file?path=" + encodeURIComponent(it.path);
    window.open(url, "_blank", "noopener");
    return;
  }
  if (ext === ".md" || ext === ".txt" || ext === ".markdown") {
    await openTestInfoText(it.path, it.title);
    return;
  }
  // docx/epub 等：用系统打开或下载
  const open = await api("open-path", { method: "POST", body: { path: it.path } });
  if (open?.error) {
    const url = "/api/test-info/file?path=" + encodeURIComponent(it.path);
    window.open(url, "_blank", "noopener");
  }
}

async function openTestInfoText(path, title) {
  const modal = document.getElementById("aq-doc-modal");
  const body = document.getElementById("aq-doc-body");
  const titleEl = document.getElementById("aq-doc-title");
  const meta = document.getElementById("aq-doc-meta");
  if (!modal || !body) return;
  if (titleEl) titleEl.textContent = title || "测试信息";
  if (meta) meta.textContent = "加载中…";
  body.innerHTML = "<p>加载中…</p>";
  modal.classList.remove("hidden");
  const data = await api("test-info/content?path=" + encodeURIComponent(path));
  if (!data?.ok || data.error) {
    body.innerHTML = `<p>${escapeHtml(data?.error || "加载失败")}</p>`;
    if (meta) meta.textContent = path;
    return;
  }
  if (titleEl) titleEl.textContent = title || data.title || "测试信息";
  const bits = [];
  if (data.updatedAt) bits.push("更新 " + data.updatedAt);
  if (data.rel || data.path) bits.push(data.rel || data.path);
  if (meta) meta.textContent = bits.join(" · ");
  body.innerHTML = data.ext === ".md" || data.ext === ".markdown"
    ? renderSimpleMarkdown(data.markdown || "", {
        baseDir: (data.path || path || "").replace(/[\\/][^\\/]+$/, ""),
      })
    : `<pre class="ti-pre">${escapeHtml(data.markdown || "")}</pre>`;
  body.scrollTop = 0;
}

async function scanTestInfoLocal() {
  const btnHint = document.getElementById("ti-scan-meta");
  if (btnHint) btnHint.textContent = "正在扫描 F 盘配置目录（可能需几十秒）…";
  showPathLoading("扫描测试资料");
  try {
    const res = await api("test-info/scan", { method: "POST", body: {} });
    hidePathLoading();
    if (!res?.ok && res?.error) {
      alert(res.error);
      return;
    }
    if (res.catalog) testInfoCache = res.catalog;
    else await loadTestInfoPage();
    testInfoCat = "本机资料";
    testInfoTrack = "";
    renderTestInfoCategories();
    renderTestInfoTracks();
    renderTestInfoList();
    const meta = document.getElementById("ti-scan-meta");
    if (meta) meta.textContent = `扫描完成：${res.count || 0} 条 · ${res.updatedAt || ""} · ${res.elapsedSec || "?"}s`;
    if (res.errors?.length) {
      console.warn("test-info scan errors", res.errors.slice(0, 5));
    }
  } catch (err) {
    hidePathLoading();
    alert(err.message || String(err));
  }
}

async function rebuildTestInfoCourse() {
  const btnHint = document.getElementById("ti-scan-meta");
  if (btnHint) btnHint.textContent = "正在重建课程索引…";
  showPathLoading("重建课程索引");
  try {
    const res = await api("test-info/rebuild-course", { method: "POST", body: {} });
    hidePathLoading();
    if (!res?.ok) {
      alert(res?.error || "重建失败");
      return;
    }
    if (res.catalog) testInfoCache = res.catalog;
    else await loadTestInfoPage();
    testInfoCat = "课程资料";
    testInfoTrack = "";
    renderTestInfoCategories();
    renderTestInfoTracks();
    renderTestInfoList();
    const meta = document.getElementById("ti-scan-meta");
    if (meta) {
      meta.textContent = `课程索引已更新：${res.count || 0} 条 · ${res.updatedAt || ""}`;
    }
  } catch (err) {
    hidePathLoading();
    alert(err.message || String(err));
  }
}

async function rebuildTestInfoBackend() {
  const btnHint = document.getElementById("ti-scan-meta");
  if (btnHint) btnHint.textContent = "正在重建后端知识索引…";
  showPathLoading("重建后端索引");
  try {
    const res = await api("test-info/rebuild-backend", { method: "POST", body: {} });
    hidePathLoading();
    if (!res?.ok) {
      alert(res?.error || "重建失败");
      return;
    }
    if (res.catalog) testInfoCache = res.catalog;
    else await loadTestInfoPage();
    testInfoCat = "后端知识";
    testInfoTrack = "";
    renderTestInfoCategories();
    renderTestInfoTracks();
    renderTestInfoList();
    const meta = document.getElementById("ti-scan-meta");
    if (meta) {
      meta.textContent = `后端索引已更新：${res.count || 0} 条 · ${res.updatedAt || ""}`;
    }
  } catch (err) {
    hidePathLoading();
    alert(err.message || String(err));
  }
}

async function rebuildTestInfoFrontend() {
  const btnHint = document.getElementById("ti-scan-meta");
  if (btnHint) btnHint.textContent = "正在重建前端知识索引…";
  showPathLoading("重建前端索引");
  try {
    const res = await api("test-info/rebuild-frontend", { method: "POST", body: {} });
    hidePathLoading();
    if (!res?.ok) {
      alert(res?.error || "重建失败");
      return;
    }
    if (res.catalog) testInfoCache = res.catalog;
    else await loadTestInfoPage();
    testInfoCat = "前端知识";
    testInfoTrack = "";
    renderTestInfoCategories();
    renderTestInfoTracks();
    renderTestInfoList();
    const meta = document.getElementById("ti-scan-meta");
    if (meta) {
      meta.textContent = `前端索引已更新：${res.count || 0} 条 · ${res.updatedAt || ""}`;
    }
  } catch (err) {
    hidePathLoading();
    alert(err.message || String(err));
  }
}

async function openAutoQaRequirements() {
  const modal = document.getElementById("aq-doc-modal");
  const body = document.getElementById("aq-doc-body");
  const title = document.getElementById("aq-doc-title");
  const meta = document.getElementById("aq-doc-meta");
  if (!modal || !body) return;
  body.innerHTML = "<p>加载中…</p>";
  meta.textContent = "";
  modal.classList.remove("hidden");
  const data = await api("auto-qa/requirements");
  if (data.error) {
    body.innerHTML = `<p>${escapeHtml(data.error)}</p>`;
    return;
  }
  if (title) title.textContent = data.title || "需求文档";
  const bits = [];
  if (data.updatedAt) bits.push("更新 " + data.updatedAt);
  if (data.path) bits.push(data.path);
  if (data.skillPath) bits.push("Skill: " + data.skillPath);
  if (meta) meta.textContent = bits.join(" · ");
  body.innerHTML = renderSimpleMarkdown(data.markdown || "");
  body.scrollTop = 0;
}

function closeAutoQaRequirements() {
  document.getElementById("aq-doc-modal")?.classList.add("hidden");
}

function openWechatAppealEntry() {
  navigate("wechat-appeal");
  setNavActive({ toolId: "wechat-appeal" });
  loadWechatAppealPage();
}

/* ---------- 微信链接申诉 ---------- */
let waItemsCache = [];
let waSelectedIds = new Set();
let waJobPollTimer = null;
let waStatusLabels = {};

function waShotUrl(rel) {
  if (!rel) return "";
  return "/api/wechat-appeal/screenshot?path=" + encodeURIComponent(rel);
}

function waStatusClass(st) {
  if (st === "done") return "wa-st-done";
  if (st === "skipped") return "wa-st-skipped";
  if (st === "failed") return "wa-st-failed";
  if (st === "checking" || st === "appealing") return "wa-st-running";
  return "wa-st-pending";
}

function waSetStatus(text) {
  const el = document.getElementById("wa-status-text");
  if (el) el.textContent = text || "";
}

function waSetLog(lines) {
  const el = document.getElementById("wa-log");
  if (!el) return;
  const arr = Array.isArray(lines) ? lines : [String(lines || "")];
  el.textContent = arr.filter(Boolean).join("\n");
  el.scrollTop = el.scrollHeight;
}

function waRenderPreflight(pf) {
  const box = document.getElementById("wa-preflight");
  if (!box || !pf) return;
  const ok = pf.ok && pf.airtest_ok;
  const cls = ok ? "wa-pf-ok" : "wa-pf-warn";
  const parts = [];
  parts.push(pf.airtest_ok ? "Airtest 就绪" : "Airtest: " + (pf.airtest_error || "不可用"));
  parts.push(pf.cert_dir_ok ? "证件目录 OK" : "证件目录缺失");
  parts.push(pf.game_screenshot_dir_ok ? "游戏截图目录 OK" : "游戏截图目录缺失");
  parts.push("模板 " + (pf.template_count || 0) + " 张");
  box.className = "wa-preflight " + cls;
  box.innerHTML = `<strong>${ok ? "环境就绪" : "环境检查"}</strong> · ${escapeHtml(parts.join(" · "))} · ${escapeHtml(pf.hint || "")}`;
}

function waRenderTable(items) {
  const tbody = document.getElementById("wa-tbody");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="wa-empty">暂无链接，请在上方粘贴后添加</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(it => {
    const st = it.status || "pending";
    const label = waStatusLabels[st] || st;
    const shots = it.screenshots || {};
    const thumbParts = [];
    if (shots.wechat) thumbParts.push(`<a href="${waShotUrl(shots.wechat)}" target="_blank" title="微信">微</a>`);
    if (shots.browser) thumbParts.push(`<a href="${waShotUrl(shots.browser)}" target="_blank" title="浏览器">浏</a>`);
    if (shots.submit) thumbParts.push(`<a href="${waShotUrl(shots.submit)}" target="_blank" title="提交">提</a>`);
    const checked = waSelectedIds.has(it.id) ? " checked" : "";
    const canRun = !["checking", "appealing"].includes(st);
    return `<tr data-id="${escapeHtml(it.id)}">
      <td><input type="checkbox" class="wa-row-check" data-id="${escapeHtml(it.id)}"${checked}${canRun ? "" : " disabled"}></td>
      <td class="wa-url" title="${escapeHtml(it.url)}">${escapeHtml(it.url)}</td>
      <td><span class="wa-status ${waStatusClass(st)}">${escapeHtml(label)}</span></td>
      <td class="wa-remark">${escapeHtml(it.remark || "")}</td>
      <td class="wa-shots">${thumbParts.join(" ") || "—"}</td>
      <td class="wa-actions">
        <button class="btn btn-sm" type="button" data-wa-run="${escapeHtml(it.id)}"${canRun ? "" : " disabled"}>申诉</button>
        <button class="btn btn-sm" type="button" data-wa-del="${escapeHtml(it.id)}">删除</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".wa-row-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      if (cb.checked) waSelectedIds.add(id);
      else waSelectedIds.delete(id);
    });
  });
  tbody.querySelectorAll("[data-wa-run]").forEach(btn => {
    btn.addEventListener("click", () => waRunOne(btn.dataset.waRun));
  });
  tbody.querySelectorAll("[data-wa-del]").forEach(btn => {
    btn.addEventListener("click", () => waDeleteItem(btn.dataset.waDel));
  });
}

async function loadWechatAppealPage() {
  waSetStatus("加载中…");
  const [pf, data] = await Promise.all([
    api("wechat-appeal/preflight"),
    api("wechat-appeal/items"),
  ]);
  waRenderPreflight(pf);
  waItemsCache = data.items || [];
  waStatusLabels = data.status_labels || {};
  waRenderTable(waItemsCache);
  const job = data.job || {};
  if (job.status === "running") {
    if (job.logs?.length) waSetLog(job.logs);
    waStartJobPoll(job.id);
    waSetStatus(`运行中 ${job.done || 0}/${job.total || 0}${job.current_url ? " · " + job.current_url : ""} · 按 P 强制停止`);
  } else {
    waStopJobPoll();
    waSetStatus(`共 ${waItemsCache.length} 条`);
    if (job.logs?.length) waSetLog(job.logs);
  }
  waBindOnce();
}

function waBindOnce() {
  if (window._waBound) return;
  window._waBound = true;
  document.addEventListener("keydown", e => {
    if (e.key !== "p" && e.key !== "P") return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (!waJobPollTimer) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
    e.preventDefault();
    waStopJob("P 键");
  });
}

async function waRefresh() {
  await loadWechatAppealPage();
}

async function waAddUrls() {
  const ta = document.getElementById("wa-url-input");
  const raw = (ta?.value || "").trim();
  if (!raw) {
    alert("请先输入链接");
    return;
  }
  const res = await api("wechat-appeal/items", { method: "POST", body: { urls: raw } });
  if (!res.ok) {
    alert(res.error || "添加失败");
    return;
  }
  if (res.duplicates?.length) {
    alert(`已添加 ${res.added?.length || 0} 条\n以下链接已在列表中：\n${res.duplicates.join("\n")}`);
  }
  if (ta) ta.value = "";
  await loadWechatAppealPage();
}

function waToggleSelectAll(on) {
  waSelectedIds.clear();
  if (on) {
    waItemsCache.forEach(it => {
      if (!["checking", "appealing"].includes(it.status)) waSelectedIds.add(it.id);
    });
  }
  waRenderTable(waItemsCache);
  const all = document.getElementById("wa-select-all");
  if (all) all.checked = !!on;
}

async function waRunSelected() {
  const ids = [...waSelectedIds];
  if (!ids.length) {
    alert("请先勾选要申诉的链接");
    return;
  }
  if (!confirm(`将对 ${ids.length} 条链接执行申诉流程，期间请勿操作键鼠（按 P 键可随时强制停止）。继续？`)) return;
  await waStartRun(ids);
}

async function waRunOne(id) {
  if (!id) return;
  if (!confirm("对该链接执行申诉流程，期间请勿操作键鼠（按 P 键可随时强制停止）。继续？")) return;
  await waStartRun([id]);
}

async function waStartRun(ids) {
  const res = await api("wechat-appeal/run", { method: "POST", body: { ids } });
  if (!res.ok) {
    alert(res.error || "启动失败");
    return;
  }
  waSetLog(["任务已启动…", `job=${res.job_id || ""}`]);
  waStartJobPoll(res.job_id);
  // 不要立刻整页重载清空日志；轮询会持续刷新
  waSetStatus(`运行中 0/${res.total || ids.length} · 按 P 强制停止`);
}

function waStartJobPoll(jobId) {
  waStopJobPoll();
  waJobPollTimer = setInterval(() => waPollJob(jobId), 1500);
  waPollJob(jobId);
}

function waStopJobPoll() {
  if (waJobPollTimer) {
    clearInterval(waJobPollTimer);
    waJobPollTimer = null;
  }
}

async function waPollJob(jobId) {
  let data;
  try {
    data = await api("wechat-appeal/job/" + encodeURIComponent(jobId || ""));
  } catch (e) {
    waSetLog([`轮询失败（服务可能已断开）: ${e.message || e}`, "请重新运行 start.bat"]);
    waStopJobPoll();
    return;
  }
  const job = data.job;
  if (!job) {
    waStopJobPoll();
    return;
  }
  if (job.logs?.length) waSetLog(job.logs);
  else waSetLog(["任务运行中，等待日志…"]);
  waSetStatus(
    job.status === "running"
      ? `运行中 ${job.done || 0}/${job.total || 0}${job.current_url ? " · " + job.current_url : ""} · 按 P 强制停止`
      : job.status === "stopped"
        ? `已停止 ${job.done || 0}/${job.total || 0}`
        : `已完成 ${job.done || 0}/${job.total || 0}`
  );
  const list = await api("wechat-appeal/items");
  waItemsCache = list.items || [];
  waRenderTable(waItemsCache);
  if (job.status !== "running") {
    waStopJobPoll();
  }
}

async function waStopJob(source) {
  const res = await api("wechat-appeal/stop", { method: "POST", body: { source: source || "按钮" } });
  if (!res.ok) alert(res.error || "停止失败");
  else waSetLog((document.getElementById("wa-log")?.textContent || "") + "\n" + (res.message || "已强制停止"));
}

async function waDeleteItem(id) {
  if (!id || !confirm("确定删除该记录？")) return;
  const res = await api("wechat-appeal/items/" + encodeURIComponent(id), { method: "DELETE" });
  if (!res.ok) alert(res.error || "删除失败");
  waSelectedIds.delete(id);
  await loadWechatAppealPage();
}

let aiStoryCache = null;
let aiStoryLlmCache = null;

function maskApiKey(key) {
  const s = String(key || "").trim();
  if (!s) return "（未配置）";
  if (s.length <= 10) return "********";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

async function resolveAiStoryLlmConfig() {
  const agile = typeof getAgileSimLlmConfig === "function" ? getAgileSimLlmConfig() : null;
  if (agile?.apiKey || agile?.baseUrl) {
    return {
      baseUrl: agile.baseUrl || "",
      model: agile.model || "",
      apiKey: agile.apiKey || "",
      source: "测试点生成（浏览器）",
    };
  }
  try {
    const res = await api("auto-qa/sprite/llm-config");
    if (res?.ok && res.config) {
      return {
        baseUrl: res.config.baseUrl || "",
        model: res.config.model || "",
        apiKey: res.config.apiKey || "",
        source: res.config.source === "agile-sim" ? "已同步的测试点生成配置" : "业务精灵配置",
      };
    }
  } catch (_) {}
  return { baseUrl: "", model: "", apiKey: "", source: "" };
}

function renderAiStoryLlmPanel(cfg) {
  const box = document.getElementById("ai-story-llm-panel");
  if (!box) return;
  aiStoryLlmCache = cfg || {};
  const hasAny = !!(cfg.baseUrl || cfg.model || cfg.apiKey);
  if (!hasAny) {
    box.innerHTML = `<div class="hint">尚未在测试点生成配置 OpenAI 兼容 API。请先到「测试点生成」保存地址 / 模型 / Key，再回到本页刷新。</div>`;
    return;
  }
  box.innerHTML = `
    <div class="ai-story-llm-row">
      <span class="ai-story-llm-label">来源</span>
      <code>${escapeHtml(cfg.source || "工作台")}</code>
    </div>
    <div class="ai-story-llm-row">
      <span class="ai-story-llm-label">API 地址</span>
      <code title="${escapeHtml(cfg.baseUrl || "")}">${escapeHtml(cfg.baseUrl || "—")}</code>
      <button class="btn btn-sm" type="button" onclick="aiStoryCopyLlmField('baseUrl')">复制</button>
    </div>
    <div class="ai-story-llm-row">
      <span class="ai-story-llm-label">模型</span>
      <code title="${escapeHtml(cfg.model || "")}">${escapeHtml(cfg.model || "—")}</code>
      <button class="btn btn-sm" type="button" onclick="aiStoryCopyLlmField('model')">复制</button>
    </div>
    <div class="ai-story-llm-row">
      <span class="ai-story-llm-label">API Key</span>
      <code>${escapeHtml(maskApiKey(cfg.apiKey))}</code>
      <button class="btn btn-sm" type="button" onclick="aiStoryCopyLlmField('apiKey')" ${cfg.apiKey ? "" : "disabled"}>复制 Key</button>
    </div>
    <p class="hint">建议用途：AI Story → 模型配置 → OpenAI 兼容 → 仅用于文案改写 / 分镜。出图与视频请另配。</p>
  `;
}

async function aiStoryCopyText(text, okMsg) {
  const value = String(text || "").trim();
  if (!value) {
    alert("没有可复制的内容");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    alert(okMsg || "已复制到剪贴板");
  } catch (_) {
    prompt("复制失败，请手动全选复制：", value);
  }
}

function aiStoryCopyLlmField(field) {
  const cfg = aiStoryLlmCache || {};
  if (field === "baseUrl") return aiStoryCopyText(cfg.baseUrl, "已复制 API 地址");
  if (field === "model") return aiStoryCopyText(cfg.model, "已复制模型名");
  if (field === "apiKey") {
    if (!cfg.apiKey) return alert("当前没有可用的 API Key");
    return aiStoryCopyText(cfg.apiKey, "已复制 API Key（请仅粘贴到本机 AI Story）");
  }
}

function aiStoryCopyLlmBundle() {
  const cfg = aiStoryLlmCache || {};
  if (!cfg.baseUrl && !cfg.model) {
    alert("没有可复制的地址/模型，请先在测试点生成配置");
    return;
  }
  const text = [
    `API 地址：${cfg.baseUrl || ""}`,
    `模型：${cfg.model || ""}`,
    "API Key：请在工作台本页点「复制 Key」后粘贴到 AI Story（本条不含 Key）",
    "用途：文案改写 / 分镜生成（OpenAI 兼容）",
  ].join("\n");
  return aiStoryCopyText(text, "已复制地址和模型，请再到本页复制 Key");
}

async function loadAiStoryPage() {
  const box = document.getElementById("ai-story-status");
  if (box) box.innerHTML = `<div class="hint">正在检测本地服务…</div>`;
  try {
    const [res, llm] = await Promise.all([
      api("ai-story/status"),
      resolveAiStoryLlmConfig(),
    ]);
    aiStoryCache = res;
    const running = !!res.running;
    if (box) {
      box.innerHTML = `
      <div class="ai-story-badge ${running ? "is-on" : "is-off"}">
        ${running ? "● 服务已就绪" : "○ 服务未启动"}
      </div>
      <div class="ai-story-meta">
        <div><strong>地址</strong>：<code>${escapeHtml(res.url || "http://127.0.0.1:3000")}</code></div>
        <div><strong>部署目录</strong>：<code>${escapeHtml(res.dir || "integrated/ai_story")}</code></div>
        <div><strong>许可证</strong>：${escapeHtml(res.license || "")}</div>
        ${running ? "" : `<div class="hint">请先启动 Docker Desktop，再点「启动 Docker」或运行 start.bat</div>`}
      </div>
    `;
    }
    renderAiStoryLlmPanel(llm);
  } catch (err) {
    if (box) box.innerHTML = `<div class="hint">状态检测失败：${escapeHtml(err.message || String(err))}</div>`;
    renderAiStoryLlmPanel(await resolveAiStoryLlmConfig());
  }
}

async function aiStoryStart() {
  const res = await api("ai-story/start", { method: "POST", body: {} });
  if (!res.ok) {
    alert(res.error || "启动失败");
    return;
  }
  alert(res.message || "已触发启动，请稍候再点「刷新状态」");
  setTimeout(() => loadAiStoryPage(), 4000);
}

function aiStoryOpenEmbedded() {
  const url = aiStoryCache?.url || "http://127.0.0.1:3000";
  if (!aiStoryCache?.running) {
    if (!confirm("检测到 AI Story 可能未启动，仍要尝试打开吗？")) return;
  }
  navigate("embedded", () => loadEmbeddedSite(url, "AI Story"));
  setNavActive({ toolId: "ai-story" });
}

function aiStoryOpenExternal() {
  const url = aiStoryCache?.url || "http://127.0.0.1:3000";
  window.open(url, "_blank");
}

async function aiStoryOpenFolder() {
  const path = aiStoryCache?.dir || "integrated/ai_story";
  const res = await api("open-path", { method: "POST", body: { path } });
  if (res.error) alert(res.error);
}

/* ========== 解压小游戏 ========== */
let relaxGamesCache = null;

function renderRelaxGamesModes(res) {
  const box = document.getElementById("relax-games-modes");
  if (!box) return;
  const modes = Array.isArray(res?.modes) ? res.modes : [];
  if (!modes.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML =
    '<h3 class="relax-games-modes-title">直接启动某一模式</h3>' +
    '<div class="game-launch-grid">' +
    modes
      .filter(m => m.id !== "launcher")
      .map(m => {
        const disabled = m.ready === false;
        return (
          '<button type="button" class="game-launch-card' +
          (disabled ? " is-disabled" : "") +
          '" ' +
          (disabled ? "disabled" : `onclick="relaxGamesLaunch('${escapeHtml(m.id)}')"`) +
          ">" +
          '<span class="game-launch-icon">🎯</span>' +
          '<span class="game-launch-info"><strong>' +
          escapeHtml(m.name) +
          "</strong><small>" +
          (disabled ? "脚本缺失" : "独立窗口") +
          "</small></span>" +
          '<span class="game-launch-arrow">›</span></button>'
        );
      })
      .join("") +
    "</div>";
}

async function loadRelaxGamesPage() {
  const box = document.getElementById("relax-games-status");
  if (box) box.innerHTML = `<div class="hint">正在检测…</div>`;
  try {
    const res = await api("relax-games/status");
    relaxGamesCache = res;
    const pygameOk = !!res.pygameInstalled;
    if (box) {
      box.innerHTML = `
      <div class="ai-story-badge ${pygameOk ? "is-on" : "is-off"}">
        ${pygameOk ? "● pygame 已就绪" : "○ 未安装 pygame"}
      </div>
      <div class="ai-story-meta">
        <div><strong>目录</strong>：<code>${escapeHtml(res.dir || "integrated/relax-games")}</code></div>
        <div><strong>入口</strong>：<code>${escapeHtml(res.runScript || "run.py")}</code></div>
        ${pygameOk ? "" : `<div class="hint">首次使用请点「安装依赖」，或运行 start.bat 自动安装</div>`}
      </div>`;
    }
    renderRelaxGamesModes(res);
  } catch (err) {
    if (box) box.innerHTML = `<div class="hint">状态检测失败：${escapeHtml(err.message || String(err))}</div>`;
  }
}

async function relaxGamesLaunch(mode) {
  const res = await api("relax-games/launch", { method: "POST", body: { mode: mode || "launcher" } });
  if (!res.ok) {
    if (res.needPygame && confirm((res.error || "缺少 pygame") + "\n\n是否现在安装？")) {
      return relaxGamesInstallPygame(true, mode);
    }
    alert(res.error || "启动失败");
    return;
  }
  if (res.message) {
    const toast = document.createElement("div");
    toast.className = "hint";
    toast.textContent = res.message;
    toast.style.marginTop = "8px";
    document.getElementById("relax-games-status")?.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}

async function relaxGamesInstallPygame(andLaunchMode = false, mode = "launcher") {
  const res = await api("relax-games/install", { method: "POST", body: {} });
  if (!res.ok) {
    alert(res.error || "安装失败");
    return;
  }
  alert(res.message || "pygame 安装完成");
  await loadRelaxGamesPage();
  if (andLaunchMode) await relaxGamesLaunch(mode);
}

async function relaxGamesOpenFolder() {
  const path = relaxGamesCache?.dir || "integrated/relax-games";
  const res = await api("open-path", { method: "POST", body: { path } });
  if (res.error) alert(res.error);
}

/* ========== 业务主流程台 ========== */
let bfPlan = null;
let bfRuns = [];
let bfActiveRunId = "";
let bfActiveRun = null;
let bfActiveArtifacts = [];
let bfArtifactsTsv = "";
let bfFocusStepId = "F1";
let bfMetaCache = { fields: {}, hints: {} };
/** 一键开跑勾选：默认空，勾选分组=跑该组全部子步骤 */
let bfCheckedIds = new Set();

/** 各步骤/分组：左侧输入字段 + 右侧产出键 */
const BF_FIELD_LABELS = {
  oaBaseUrl: "OA 地址",
  oaUser: "OA 账号",
  oaPassword: "OA 密码",
  businessPrefix: "一级渠道商务账号",
  businessPassword: "一级渠道商务密码",
  deviceId: "商务设备码 deviceId",
  bizWebBaseUrl: "商务网页地址",
  presidentPrefix: "会长账号前缀",
  presidentPassword: "一级会长初始密码",
  channelDeviceId: "会长设备码 deviceId",
  channelNewPassword: "会长改密后密码",
  profileMobile: "完善信息手机号",
  profileRealName: "完善信息实名",
  profileIdCardNo: "完善信息身份证号",
  gameId: "申请游戏 ID",
  idCardFront: "固定证件正面路径",
  idCardBack: "固定证件背面路径",
};

const BF_STEP_IO = {
  F1: {
    inputs: ["oaUser", "oaPassword", "businessPrefix"],
    outputs: ["oaToken", "bizAccount", "bizPassword"],
  },
  "F1-1": {
    inputs: ["oaUser", "oaPassword"],
    outputs: ["oaToken"],
  },
  "F1-2": {
    inputs: ["businessPrefix", "businessPassword"],
    outputs: ["bizAccount", "bizPassword"],
  },
  F2: {
    inputs: ["deviceId", "bizWebBaseUrl", "presidentPrefix", "presidentPassword"],
    outputs: ["presidentAccount", "presidentPasswordOut"],
  },
  "F2-1": {
    inputs: ["deviceId", "bizWebBaseUrl"],
    outputs: ["bizLoginOk"],
  },
  "F2-2": {
    inputs: ["presidentPrefix", "presidentPassword"],
    outputs: ["presidentAccount", "presidentPasswordOut"],
  },
  F3: {
    inputs: ["channelDeviceId", "channelNewPassword", "profileMobile", "profileRealName", "profileIdCardNo", "idCardFront", "idCardBack"],
    outputs: ["presidentSession"],
  },
  "F3-1": {
    inputs: ["channelDeviceId"],
    outputs: ["presidentSession"],
  },
  "F3-2": {
    inputs: ["channelNewPassword"],
    outputs: ["presidentNewPassword"],
  },
  "F3-3": {
    inputs: ["profileMobile", "profileRealName", "profileIdCardNo", "idCardFront", "idCardBack"],
    outputs: ["presidentProfile"],
  },
  F4: {
    inputs: ["oaUser", "oaPassword"],
    outputs: ["oaAudit"],
  },
  F5: {
    inputs: ["gameId"],
    outputs: ["gameApply"],
  },
  F8: {
    inputs: ["gameId"],
    outputs: ["playerAccount", "payOrder"],
  },
  "F8-1": { inputs: ["gameId"], outputs: ["playerAccount"] },
  "F8-2": { inputs: [], outputs: ["playerIdCard"] },
  "F8-3": { inputs: [], outputs: ["playerRole"] },
  "F8-4": { inputs: [], outputs: ["payOrder"] },
  F9: {
    inputs: [],
    outputs: ["payCallback"],
  },
};

const BF_OUTPUT_LABELS = {
  oaToken: "OA Token",
  bizAccount: "一级渠道商务账号",
  bizPassword: "一级渠道商务密码",
  bizLoginOk: "商务登录结果",
  presidentAccount: "一级会长账号",
  presidentPasswordOut: "一级会长密码",
  presidentSession: "会长登录会话",
  presidentNewPassword: "会长新密码",
  presidentProfile: "会长完善信息",
  oaAudit: "OA 审核结果",
  gameApply: "申请游戏结果",
  playerAccount: "玩家账号",
  playerIdCard: "玩家实名",
  playerRole: "玩家角色",
  payOrder: "支付订单号",
  payCallback: "支付回调结果",
};

function openBizFlowPage() {
  const modal = ensureBizFlowWorkbenchShell();
  modal.classList.remove("hidden");
  document.body.classList.add("bf-wb-open");
  bfFocusStepId = "F1";
  loadBizFlowPage();
}

function openBizRolePage() {
  window.open("/biz-role", "_blank", "noopener");
}

function openAutoControlPanel() {
  window.open("/auto-control", "_blank", "noopener");
}

function openSeedScriptPage() {
  window.open("/seed-script", "_blank", "noopener");
}

function closeBizFlowPage() {
  document.getElementById("biz-flow-workbench-modal")?.classList.add("hidden");
  document.body.classList.remove("bf-wb-open");
}

function ensureBizFlowWorkbenchShell() {
  let modal = document.getElementById("biz-flow-workbench-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "biz-flow-workbench-modal";
  modal.className = "biz-flow-workbench-modal hidden";
  modal.innerHTML = `
    <div class="bf-wb-backdrop" onclick="closeBizFlowPage()"></div>
    <div class="bf-wb-dialog" role="dialog" aria-modal="true" aria-label="主流程台">
      <div class="bf-wb-head">
        <div>
          <h3 id="bf-wb-title">主流程台</h3>
          <p class="hint">OA 渠道商务主链路 · 静默全接口 / 展示可视化 · 造数可复制（不是「新商务·浏览器主路径」那个模块）</p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeBizFlowPage()">关闭</button>
      </div>
      <div class="bf-wb-body" id="bf-wb-body"></div>
    </div>`;
  document.body.appendChild(modal);
  const source = document.getElementById("page-biz-flow");
  const body = modal.querySelector("#bf-wb-body");
  if (source && body) {
    // 把独立页内容挪进弹层，保持原有 id，便于脚本复用
    while (source.firstChild) body.appendChild(source.firstChild);
  }
  return modal;
}

async function loadBizFlowPage() {
  const planRes = await api("biz-flow/plans");
  bfPlan = planRes?.plan || null;
  const title = document.getElementById("bf-page-title");
  const sub = document.getElementById("bf-page-sub");
  const hint = document.getElementById("bf-strategy-hint");
  if (title) title.textContent = bfPlan?.name || "主流程台";
  const wbTitle = document.getElementById("bf-wb-title");
  if (wbTitle) wbTitle.textContent = bfPlan?.name || "主流程台";
  if (sub) {
    sub.textContent = "静默=全接口只看状态；展示=浏览器有头可视化；造数落表可复制查询";
  }
  if (hint) {
    const ds = bfPlan?.dataStrategy || {};
    hint.innerHTML = `造数策略：优先 <strong>${escapeHtml(ds.prefer || "flow")}</strong>（业务流程），库造数作兜底。${escapeHtml(ds.note || "")}<br>说明：左入参 / 右产出固定三列；点中某步骤后，左右面板<strong>顶边与该步骤对齐</strong>（如点 F8 则与 F8 平齐）。`;
  }
  const targetSel = document.getElementById("bf-target");
  const modeSel = document.getElementById("bf-mode");
  if (targetSel && bfPlan?.defaultTarget) targetSel.value = bfPlan.defaultTarget;
  if (modeSel && bfPlan?.defaultMode) modeSel.value = bfPlan.defaultMode;

  if (!bfFocusStepId) bfFocusStepId = "F1";

  await loadBizFlowMeta();

  const runsRes = await api("biz-flow/runs?limit=20");
  bfRuns = runsRes?.runs || [];
  if (!bfActiveRunId && bfRuns[0]) bfActiveRunId = bfRuns[0].id;
  renderBizFlowRuns();
  if (bfActiveRunId) await selectBizFlowRun(bfActiveRunId);
  else {
    bfActiveRun = null;
    bfActiveArtifacts = [];
    renderBizFlowSteps(null);
    renderBizFlowOutputs();
  }
  await loadBizFlowArtifacts();
}

function bfResolveIo(stepId) {
  const id = stepId || bfFocusStepId || "F1";
  if (BF_STEP_IO[id]) return { id, ...BF_STEP_IO[id] };
  const steps = bfActiveRun?.steps || bfPlan?.steps || [];
  const step = steps.find(s => s.id === id);
  if (step?.parentId && BF_STEP_IO[step.parentId]) {
    return { id, ...BF_STEP_IO[step.parentId] };
  }
  return { id, inputs: Object.keys(BF_FIELD_LABELS), outputs: [] };
}

function setBizFlowFocus(stepId, opts = {}) {
  const id = String(stepId || "F1");
  bfFocusStepId = id;
  if (!opts.skipMeta) renderBizFlowMetaFields();
  if (!opts.skipSteps) {
    document.querySelectorAll("#bf-steps .bf-step").forEach(el => {
      el.classList.toggle("is-focus", el.getAttribute("data-step-id") === id);
    });
  }
  if (!opts.skipOutputs) renderBizFlowOutputs();
  const metaScope = document.getElementById("bf-meta-scope");
  const outScope = document.getElementById("bf-output-scope");
  const steps = bfActiveRun?.steps || bfPlan?.steps || [];
  const step = steps.find(s => s.id === id);
  const title = step ? `${step.id} · ${step.title || ""}` : id;
  if (metaScope) metaScope.textContent = title;
  if (outScope) outScope.textContent = title;
  if (!opts.skipAlign) {
    requestAnimationFrame(() => alignBizFlowSidePanels(id));
  }
}

/** 左右入参/产出顶边与焦点步骤顶边平齐（三列布局） */
function alignBizFlowSidePanels(stepId) {
  const sid = stepId || bfFocusStepId;
  const stepEl = document.querySelector(`#bf-steps .bf-step[data-step-id="${sid}"]`);
  const stepsCol = document.querySelector(".bf-col-steps");
  const metaCol = document.getElementById("bf-col-meta");
  const outCol = document.getElementById("bf-col-output");
  if (!stepEl || !stepsCol || !metaCol || !outCol) return;
  if (window.matchMedia && window.matchMedia("(max-width: 1100px)").matches) {
    metaCol.style.marginTop = "";
    outCol.style.marginTop = "";
    return;
  }

  const freeze = (el) => {
    el.style.transition = "none";
  };
  const unfreeze = (el) => {
    // 强制回流后再恢复过渡，避免归零动画闪一下
    void el.offsetHeight;
    el.style.transition = "";
  };

  freeze(metaCol);
  freeze(outCol);
  metaCol.style.marginTop = "0px";
  outCol.style.marginTop = "0px";

  const apply = () => {
    const delta = Math.max(
      0,
      Math.round(stepEl.getBoundingClientRect().top - stepsCol.getBoundingClientRect().top),
    );
    metaCol.style.marginTop = `${delta}px`;
    outCol.style.marginTop = `${delta}px`;
  };

  stepEl.scrollIntoView({ block: "nearest", behavior: "auto" });
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      unfreeze(metaCol);
      unfreeze(outCol);
    });
  });
}

async function loadBizFlowMeta() {
  const box = document.getElementById("bf-meta-fields");
  if (!box) return;
  const data = await api("biz-flow/meta");
  if (!data?.ok) {
    box.innerHTML = `<p class="hint">${escapeHtml(data?.error || "加载测试数据失败")}</p>`;
    return;
  }
  bfMetaCache = {
    fields: data.fields || {},
    hints: data.hints || {},
  };
  renderBizFlowMetaFields();
}

function renderBizFlowMetaFields() {
  const box = document.getElementById("bf-meta-fields");
  if (!box) return;
  const io = bfResolveIo(bfFocusStepId);
  const fields = bfMetaCache.fields || {};
  const hints = bfMetaCache.hints || {};
  const keys = (io.inputs && io.inputs.length) ? io.inputs : Object.keys(BF_FIELD_LABELS);
  if (!keys.length) {
    box.innerHTML = '<p class="hint">当前步骤无额外入参（沿用上游步骤产出）。</p>';
    return;
  }
  box.innerHTML = keys.map(key => {
    const label = BF_FIELD_LABELS[key] || key;
    const readonly = key === "oaBaseUrl" ? "readonly" : "";
    const inputType = /password|Password/.test(key) ? "password" : "text";
    return `
      <div class="bf-meta-row">
        <label class="bf-meta-label">${escapeHtml(label)}</label>
        <input class="bf-meta-input" type="${inputType}" data-meta-key="${escapeHtml(key)}" value="${escapeHtml(fields[key] || "")}" ${readonly} spellcheck="false">
        <div class="hint">${escapeHtml(hints[key] || "")}</div>
      </div>`;
  }).join("");
  const metaScope = document.getElementById("bf-meta-scope");
  const steps = bfActiveRun?.steps || bfPlan?.steps || [];
  const step = steps.find(s => s.id === bfFocusStepId);
  if (metaScope) {
    metaScope.textContent = step
      ? `${step.id} · ${step.title || ""}`
      : `${bfFocusStepId || "F1"}`;
  }
}

async function saveBizFlowMeta() {
  const box = document.getElementById("bf-meta-fields");
  const hint = document.getElementById("bf-meta-save-hint");
  const btn = document.getElementById("bf-meta-save-btn");
  if (!box) return;
  const fields = { ...(bfMetaCache.fields || {}) };
  box.querySelectorAll("[data-meta-key]").forEach(el => {
    fields[el.getAttribute("data-meta-key")] = el.value;
  });
  if (btn) btn.disabled = true;
  try {
    const res = await api("biz-flow/meta", { method: "PUT", body: { fields } });
    if (!res?.ok) {
      alert(res?.error || "保存失败");
      return;
    }
    bfMetaCache.fields = fields;
    if (hint) hint.textContent = "已保存";
    await loadBizFlowMeta();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openBizFlowRunsModal() {
  const modal = document.getElementById("bf-runs-modal");
  if (!modal) return;
  renderBizFlowRuns();
  modal.classList.remove("hidden");
}

function closeBizFlowRunsModal() {
  document.getElementById("bf-runs-modal")?.classList.add("hidden");
}

function openBizFlowArtifactsModal() {
  const modal = document.getElementById("bf-artifacts-modal");
  if (!modal) return;
  loadBizFlowArtifacts();
  modal.classList.remove("hidden");
}

function closeBizFlowArtifactsModal() {
  hideBizFlowArtifactForm();
  document.getElementById("bf-artifacts-modal")?.classList.add("hidden");
}

let bfEnvActiveId = "oa";
let bfEnvCache = { environments: [] };

async function openBizFlowEnvModal() {
  const modal = document.getElementById("bf-env-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  await loadBizFlowEnv();
}

function closeBizFlowEnvModal() {
  document.getElementById("bf-env-modal")?.classList.add("hidden");
}

async function loadBizFlowEnv() {
  const data = await api("biz-flow/env");
  if (!data?.ok) {
    const tbody = document.getElementById("bf-env-tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="hint">${escapeHtml(data?.error || "加载失败")}</td></tr>`;
    return;
  }
  bfEnvCache = data;
  if (!bfEnvCache.environments?.some(e => e.id === bfEnvActiveId)) {
    bfEnvActiveId = bfEnvCache.environments?.[0]?.id || "oa";
  }
  renderBizFlowEnvNav();
  renderBizFlowEnvTable();
}

function renderBizFlowEnvNav() {
  const nav = document.getElementById("bf-env-nav");
  if (!nav) return;
  const envs = bfEnvCache.environments || [];
  const groups = [];
  envs.forEach(env => {
    const g = env.group || "环境";
    if (!groups.includes(g)) groups.push(g);
  });
  nav.innerHTML = groups.map(group => {
    const items = envs.filter(e => (e.group || "环境") === group).map(env => `
      <button type="button" class="bf-env-nav-item${env.id === bfEnvActiveId ? " is-active" : ""}"
        onclick="selectBizFlowEnv('${escapeHtml(env.id)}')">
        <span>${escapeHtml(env.name)}</span>
        <em>${escapeHtml(env.desc || "")}</em>
      </button>`).join("");
    return `<div class="bf-env-nav-group"><div class="bf-env-nav-label">${escapeHtml(group)}</div>${items}</div>`;
  }).join("");
}

function selectBizFlowEnv(envId) {
  bfEnvActiveId = String(envId || "oa");
  const hint = document.getElementById("bf-env-save-hint");
  if (hint) hint.textContent = "";
  renderBizFlowEnvNav();
  renderBizFlowEnvTable();
}

function renderBizFlowEnvTable() {
  const env = (bfEnvCache.environments || []).find(e => e.id === bfEnvActiveId) || bfEnvCache.environments?.[0];
  const title = document.getElementById("bf-env-title");
  const desc = document.getElementById("bf-env-desc");
  const tbody = document.getElementById("bf-env-tbody");
  if (title) title.textContent = env?.name || "环境变量";
  if (desc) desc.textContent = env?.desc || "";
  if (!tbody) return;
  const vars = env?.variables || [];
  if (!vars.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="hint">该环境暂无变量</td></tr>';
    return;
  }
  tbody.innerHTML = vars.map(item => {
    const type = item.secret ? "password" : "text";
    const ro = item.readonly ? "readonly" : "";
    return `<tr>
      <td><code>${escapeHtml(item.label || item.key)}</code></td>
      <td>${escapeHtml(item.hint || "")}</td>
      <td><input class="bf-env-input" type="${type}" data-env-key="${escapeHtml(item.key)}"
        value="${escapeHtml(item.value || "")}" ${ro} spellcheck="false"></td>
    </tr>`;
  }).join("");
}

async function saveBizFlowEnv(closeAfter) {
  const hint = document.getElementById("bf-env-save-hint");
  const tbody = document.getElementById("bf-env-tbody");
  if (!tbody) return;
  const values = {};
  tbody.querySelectorAll("[data-env-key]").forEach(el => {
    values[el.getAttribute("data-env-key")] = el.value;
  });
  const res = await api("biz-flow/env", {
    method: "PUT",
    body: { envId: bfEnvActiveId, values },
  });
  if (!res?.ok) {
    if (hint) hint.textContent = res?.error || "保存失败";
    alert(res?.error || "保存失败");
    return;
  }
  if (hint) hint.textContent = "已保存";
  await loadBizFlowEnv();
  await loadBizFlowMeta();
  if (closeAfter) closeBizFlowEnvModal();
}

function renderBizFlowRuns() {
  const box = document.getElementById("bf-runs");
  if (!box) return;
  if (!bfRuns.length) {
    box.innerHTML = '<p class="hint">暂无运行。点上方「一键开跑」创建。</p>';
    return;
  }
  box.innerHTML = bfRuns.map(run => `
    <article class="bf-run-card${run.id === bfActiveRunId ? " is-active" : ""}" onclick="selectBizFlowRun('${escapeHtml(run.id)}'); closeBizFlowRunsModal();">
      <div><strong>${escapeHtml(run.targetLabel || run.target || "")}</strong>
        · ${run.mode === "display" ? "展示" : "静默"}
        · <span class="bf-status ${escapeHtml(run.status || "")}">${escapeHtml(run.status || "")}</span>
      </div>
      <div class="hint">${escapeHtml(run.id)} · ${escapeHtml(run.createdAt || "")}</div>
    </article>
  `).join("");
}

async function selectBizFlowRun(runId) {
  bfActiveRunId = runId;
  renderBizFlowRuns();
  const data = await api(`biz-flow/runs/${encodeURIComponent(runId)}`);
  if (!data?.ok) {
    bfActiveRun = null;
    bfActiveArtifacts = [];
    renderBizFlowSteps(null);
    renderBizFlowOutputs();
    return;
  }
  bfActiveRun = data.run;
  bfActiveArtifacts = data.artifacts || [];
  if (!bfFocusStepId) bfFocusStepId = "F1";
  renderBizFlowSteps(data.run);
  renderBizFlowMetaFields();
  renderBizFlowOutputs();
}

function bfStatusLabel(status) {
  return ({
    pending: "待执行",
    ready: "就绪",
    running: "进行中",
    waiting_sms: "待填验证码",
    passed: "已通过",
    failed: "失败",
    skipped: "跳过",
  })[status] || status || "—";
}

async function promptBizFlowSms(res) {
  const mobile = res?.mobile || "";
  const hint = res?.smsHint || res?.error || "请输入短信验证码";
  const uni = String(res?.usedUniversalSms || res?.universalSmsCode || "888999").trim();
  const code = window.prompt(
    `${hint}\n手机：${mobile || "未知"}\n（测试万能码可填 ${uni}）`,
    uni,
  );
  if (code == null) return null;
  const trimmed = String(code).trim();
  return trimmed || null;
}

async function executeBizFlowApi(runId, stepId, body = {}) {
  const mode = document.getElementById("bf-mode")?.value || "silent";
  let payload = { mode, ...body };
  for (let i = 0; i < 3; i += 1) {
    const res = await api(`biz-flow/runs/${encodeURIComponent(runId)}/execute/${encodeURIComponent(stepId)}`, {
      method: "POST",
      body: payload,
    });
    if (res?.usedUniversalSms || res?.smsNote) {
      try {
        appendBizFlowRunLog(res.smsNote || `已使用万能验证码 ${res.usedUniversalSms}`, res?.ok ? "ok" : "warn");
      } catch (_e) { /* 非一键开跑时无日志窗 */ }
    }
    if (res?.prereq) {
      try { bfLogPrereq(res.prereq); } catch (_e) { /* 非一键开跑时无日志窗 */ }
    }
    if (res?.needSms || (
      !res?.ok && /验证码|请先填写|请先短信/.test(String(res?.error || ""))
    )) {
      // 后端已自动试过万能码仍失败时，才弹窗；默认填入万能码
      // 兼容：接口只返回错误文案、未标 needSms 时也弹输入框
      const code = await promptBizFlowSms(res);
      if (!code) {
        return { ok: false, cancelled: true, error: "已取消填写短信验证码", ...res };
      }
      payload = { ...payload, smsCode: code };
      continue;
    }
    return res;
  }
  return { ok: false, error: "短信验证码重试次数过多" };
}

function bfGetPlanSteps() {
  return bfActiveRun?.steps || bfPlan?.steps || [];
}

function bfStepChildren(parentId, steps = bfGetPlanSteps()) {
  return steps.filter(s => s.parentId === parentId && s.enabled !== false);
}

function bfSyncGroupChecks(steps = bfGetPlanSteps()) {
  steps.filter(s => s.kind === "group").forEach(group => {
    const kids = bfStepChildren(group.id, steps);
    if (!kids.length) return;
    const checkedKids = kids.filter(k => bfCheckedIds.has(k.id));
    if (checkedKids.length === kids.length) bfCheckedIds.add(group.id);
    else bfCheckedIds.delete(group.id);
  });
}

function toggleBizFlowStepCheck(stepId, checked) {
  const steps = bfGetPlanSteps();
  const step = steps.find(s => s.id === stepId);
  if (!step || step.enabled === false) return;
  const on = !!checked;
  if (step.kind === "group") {
    if (on) bfCheckedIds.add(step.id);
    else bfCheckedIds.delete(step.id);
    bfStepChildren(step.id, steps).forEach(child => {
      if (on) bfCheckedIds.add(child.id);
      else bfCheckedIds.delete(child.id);
    });
  } else {
    if (on) bfCheckedIds.add(step.id);
    else bfCheckedIds.delete(step.id);
    if (step.parentId) {
      const kids = bfStepChildren(step.parentId, steps);
      const allOn = kids.length && kids.every(k => bfCheckedIds.has(k.id));
      if (allOn) bfCheckedIds.add(step.parentId);
      else bfCheckedIds.delete(step.parentId);
    }
  }
  renderBizFlowSteps(bfActiveRun);
}

function bfCheckAllSteps(on) {
  const steps = bfGetPlanSteps().filter(s => s.enabled !== false);
  bfCheckedIds = new Set();
  if (on) {
    steps.forEach(s => bfCheckedIds.add(s.id));
  }
  renderBizFlowSteps(bfActiveRun);
}

function bfUpdateCheckCount() {
  const el = document.getElementById("bf-check-count");
  if (!el) return;
  const steps = bfGetPlanSteps();
  const queue = bfBuildRunQueue(steps);
  if (!queue.length) {
    el.textContent = "未勾选 · 一键开跑前请先勾选";
    return;
  }
  el.textContent = `已勾选将跑 ${queue.length} 项：${queue.map(q => q.id).join("、")}`;
}

function bfGroupId(id) {
  const m = String(id || "").match(/^(F\d+)/);
  return m ? m[1] : String(id || "");
}

const BF_PARENT_GROUP = {
  F2: "F1",
  F3: "F2",
  F4: "F2",
  F5: "F3",
  F8: "F5",
  F9: "F8",
  F11: "F5",
  F12: "F11",
  F13: "F12",
  F14: "F13",
  F15: "F14",
  F16: "F13",
  F17: "F16",
  F18: "F17",
  F19: "F18",
  F20: "F19",
};

const BF_GROUP_TITLES = {
  F1: "OA 创建一级渠道商务",
  F2: "商务登录并创建一级会长",
  F3: "会长登录 / 改密 / 完善信息",
  F4: "OA 审核一级会长",
  F5: "一级会长申请游戏",
  F8: "一级玩家 SDK",
  F9: "一级玩家模拟支付",
  F11: "一级创建二级会长",
  F12: "二级会长登录/改密/协议",
  F13: "二级会长申请游戏",
  F14: "二级玩家 SDK",
  F15: "二级玩家模拟支付",
  F16: "二级创建三级会长",
  F17: "三级会长登录/改密/协议",
  F18: "三级会长申请游戏",
  F19: "三级玩家 SDK",
  F20: "三级玩家模拟支付",
};

function bfIsL1BizArtifact(item) {
  const role = String(item?.role || "");
  if (!item?.account) return false;
  if (["会长", "二级", "三级", "新商务"].some((x) => role.includes(x))) return false;
  return role.includes("渠道商务") || role === "一级商务" || role === "一级渠道商务" || role.includes("商务");
}

function bfArtifactMatcher(groupId) {
  return (item) => {
    const role = String(item?.role || "");
    if (!item?.account) return false;
    if (groupId === "F1") return bfIsL1BizArtifact(item);
    if (groupId === "F2" || groupId === "F3" || groupId === "F4") {
      return role.includes("一级会长") && !role.includes("二级") && !role.includes("三级");
    }
    if (groupId === "F5") {
      return role.includes("申请游戏");
    }
    if (groupId === "F8" || groupId === "F9") {
      return role.includes("玩家") && !role.includes("二级") && !role.includes("三级");
    }
    if (groupId === "F11" || groupId === "F12" || groupId === "F13") return role.includes("二级会长");
    if (groupId === "F14" || groupId === "F15") return role.includes("玩家") && role.includes("二级");
    if (groupId === "F16" || groupId === "F17" || groupId === "F18") return role.includes("三级会长");
    if (groupId === "F19" || groupId === "F20") return role.includes("玩家") && role.includes("三级");
    return false;
  };
}

async function bfExpandQueueWithPrereqs(queue, target) {
  const selected = new Set((queue || []).map((q) => bfGroupId(q.id)));
  const data = await api(`biz-flow/artifacts?target=${encodeURIComponent(target || "")}`);
  const items = data?.items || [];
  const notes = [];
  const missing = [];
  const reused = new Set();

  function fill(groupId) {
    const parent = BF_PARENT_GROUP[groupId];
    if (!parent || selected.has(parent) || missing.includes(parent) || reused.has(parent)) return;
    const hit = items.find(bfArtifactMatcher(parent));
    if (hit) {
      reused.add(parent);
      const when = hit.createdAt ? ` · ${hit.createdAt}` : "";
      notes.push(`已有 ${parent} 数据 ${hit.account}${when}，跳过补跑`);
      return;
    }
    fill(parent);
    if (!missing.includes(parent)) {
      missing.push(parent);
      notes.push(`未找到 ${parent} 数据，先自动执行 ${parent}`);
    }
  }

  [...selected].forEach(fill);
  if (!missing.length) return { queue, notes };
  const extra = missing.map((id) => ({
    id,
    title: `${BF_GROUP_TITLES[id] || id}（自动补跑）`,
  }));
  return { queue: [...extra, ...queue], notes };
}

function bfLogPrereq(prereq) {
  if (!prereq) return;
  if (prereq.reused && prereq.account) {
    appendBizFlowRunLog(`复用历史账号 ${prereq.account}${prereq.fromRunId ? `（${prereq.fromRunId}）` : ""}`, "ok");
  }
  if (prereq.autoRan) {
    appendBizFlowRunLog(`未找到前置数据，已自动补跑 ${prereq.autoRan}${prereq.account ? `，账号 ${prereq.account}` : ""}`, "warn");
  } else if (prereq.autoRanF1) {
    appendBizFlowRunLog(`未找到历史 F1 数据，已自动补跑 F1${prereq.account ? `，账号 ${prereq.account}` : ""}`, "warn");
  }
}
function bfBuildRunQueue(steps = bfGetPlanSteps()) {
  const titles = {
    F1: "OA 创建一级渠道商务",
    F2: "商务登录并创建一级会长",
    F3: "一级会长登录/改密/完善信息",
    F4: "OA 审核一级会长",
    F5: "一级会长申请游戏",
    F8: "一级玩家 SDK（注册/实名/角色/下单）",
    F9: "一级玩家模拟支付",
    F11: "一级创建二级会长",
    F12: "二级会长登录/改密/协议",
    F13: "二级会长申请游戏",
    F14: "二级玩家 SDK",
    F15: "二级玩家模拟支付",
    F16: "二级创建三级会长",
    F17: "三级会长登录/改密/协议",
    F18: "三级会长申请游戏",
    F19: "三级玩家 SDK",
    F20: "三级玩家模拟支付",
  };
  const queue = [];
  const seen = new Set();
  const enabled = steps.filter(s => s.enabled !== false);

  for (const step of enabled) {
    if (step.parentId) continue; // 子步骤在分组逻辑里处理
    if (step.kind === "group") {
      const kids = bfStepChildren(step.id, enabled);
      if (bfCheckedIds.has(step.id)) {
        queue.push({ id: step.id, title: step.title || titles[step.id] || step.id });
        seen.add(step.id);
        kids.forEach(k => seen.add(k.id));
      } else {
        kids.forEach(k => {
          if (bfCheckedIds.has(k.id) && !seen.has(k.id)) {
            queue.push({ id: k.id, title: k.title || k.id });
            seen.add(k.id);
          }
        });
      }
      continue;
    }
    if (bfCheckedIds.has(step.id) && !seen.has(step.id)) {
      queue.push({ id: step.id, title: step.title || titles[step.id] || step.id });
      seen.add(step.id);
    }
  }
  return queue;
}

function renderBizFlowSteps(run) {
  const box = document.getElementById("bf-steps");
  const meta = document.getElementById("bf-run-meta");
  if (meta) {
    meta.textContent = run
      ? `${run.id} · ${run.mode === "display" ? "展示模式" : "静默模式"} · 当前 ${run.currentStepId || "—"}`
      : "尚未创建运行 · 勾选后一键开跑 · 点击步骤切换左右数据";
  }
  if (!box) return;
  const steps = run?.steps || bfPlan?.steps || [];
  if (!steps.length) {
    box.innerHTML = '<p class="hint">暂无步骤配置</p>';
    bfUpdateCheckCount();
    return;
  }
  if (!bfFocusStepId || !steps.some(s => s.id === bfFocusStepId)) {
    bfFocusStepId = steps.find(s => s.id === "F1")?.id || steps[0].id;
  }
  bfSyncGroupChecks(steps);
  box.innerHTML = steps.map(step => {
    const st = step.status || (step.enabled === false ? "skipped" : "pending");
    const current = run && run.currentStepId === step.id;
    const isChild = !!step.parentId;
    const isGroup = step.kind === "group";
    const isFocus = step.id === bfFocusStepId;
    const disabled = step.enabled === false;
    const engines = (step.engines && step.engines.length)
      ? step.engines.join("/")
      : (step.engine || (isGroup ? "group" : "api"));
    const sid = escapeHtml(step.id || "");
    const checked = bfCheckedIds.has(step.id);
    return `
      <div class="bf-step${current ? " is-current" : ""}${isChild ? " is-child" : ""}${isGroup ? " is-group" : ""}${isFocus ? " is-focus" : ""}${disabled ? " is-disabled" : ""}"
           data-step-id="${sid}"
           onclick="setBizFlowFocus('${sid}')">
        <label class="bf-step-check" onclick="event.stopPropagation()" title="勾选后参与一键开跑">
          <input type="checkbox"
            data-step-check="${sid}"
            ${checked ? "checked" : ""}
            ${disabled ? "disabled" : ""}
            onchange="toggleBizFlowStepCheck('${sid}', this.checked)">
        </label>
        <div class="bf-step-id">${sid}</div>
        <div>
          <div class="bf-step-title">${escapeHtml(step.title || "")}</div>
          <div class="bf-step-role">${escapeHtml(step.role || "")}${engines ? ` · ${escapeHtml(engines)}` : ""}</div>
          <span class="bf-status ${escapeHtml(st)}">${escapeHtml(bfStatusLabel(st))}</span>
        </div>
        <div class="bf-step-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-sm" onclick="showBizFlowStepDetail('${escapeHtml(run?.id || "")}','${sid}')">详细信息</button>
          ${run && step.enabled !== false ? `
            <button type="button" class="btn btn-sm primary" onclick="executeBizFlowStep('${escapeHtml(run.id)}','${sid}')">执行</button>
          ` : ""}
        </div>
      </div>`;
  }).join("");
  box.querySelectorAll("[data-step-check]").forEach(input => {
    const sid = input.getAttribute("data-step-check");
    const step = steps.find(s => s.id === sid);
    if (!step || step.kind !== "group") return;
    const kids = bfStepChildren(sid, steps);
    const n = kids.filter(k => bfCheckedIds.has(k.id)).length;
    input.indeterminate = n > 0 && n < kids.length;
  });
  bfUpdateCheckCount();
  renderBizFlowMetaFields();
  renderBizFlowOutputs();
  requestAnimationFrame(() => alignBizFlowSidePanels(bfFocusStepId));
}

function bfParseStepDetail(step) {
  if (!step) return null;
  const raw = step.detail;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_e) {
    return { text: String(raw) };
  }
}

function bfFindArtifact(pred) {
  return (bfActiveArtifacts || []).find(pred) || null;
}

function bfCollectOutputs(focusId) {
  const io = bfResolveIo(focusId);
  const steps = bfActiveRun?.steps || [];
  const byId = Object.fromEntries(steps.map(s => [s.id, s]));
  const detailOf = (sid) => bfParseStepDetail(byId[sid]);
  const values = {};

  const f11 = detailOf("F1-1");
  const f12 = detailOf("F1-2");
  const token = f11?.result?.token || f11?.token || "";
  if (token) values.oaToken = token;

  const bizArt = bfFindArtifact(a => a.stepId === "F1-2" || /渠道商务/.test(a.role || ""));
  const bizAccount = f12?.result?.account || bizArt?.account || "";
  const bizPassword = f12?.result?.password || bizArt?.password || "";
  if (bizAccount) values.bizAccount = bizAccount;
  if (bizPassword) values.bizPassword = bizPassword;

  const f21 = detailOf("F2-1");
  if (f21) values.bizLoginOk = f21.result?.ok === false ? (f21.result?.error || "失败") : (f21.result?.ok ? "成功" : (byId["F2-1"]?.status || "—"));

  const f22 = detailOf("F2-2");
  const presidentArt = bfFindArtifact(a => a.stepId === "F2-2" || /一级会长/.test(a.role || ""));
  const presidentAccount = f22?.result?.account || presidentArt?.account || "";
  const presidentPasswordOut = f22?.result?.password || presidentArt?.password || "";
  if (presidentAccount) values.presidentAccount = presidentAccount;
  if (presidentPasswordOut) values.presidentPasswordOut = presidentPasswordOut;

  const f31 = detailOf("F3-1");
  if (f31 || byId["F3-1"]?.status === "passed") {
    values.presidentSession = byId["F3-1"]?.status === "passed" ? "已登录" : (f31?.result?.error || byId["F3-1"]?.status || "—");
  }
  const f32 = detailOf("F3-2");
  if (f32 || byId["F3-2"]) {
    values.presidentNewPassword = (bfMetaCache.fields || {}).channelNewPassword || f32?.result?.newPassword || "—";
  }
  if (byId["F3-3"]?.status === "passed") values.presidentProfile = "已完善";
  if (byId["F4"]?.status === "passed") values.oaAudit = "审核通过";
  else if (byId["F4"]?.status === "failed") values.oaAudit = byId["F4"]?.error || "失败";

  const f5 = detailOf("F5");
  if (f5 || byId["F5"]) values.gameApply = byId["F5"]?.status === "passed" ? "申请成功" : (byId["F5"]?.error || byId["F5"]?.status || "—");

  const playerArt = bfFindArtifact(a => /玩家/.test(a.role || "") || /^F8/.test(a.stepId || ""));
  if (playerArt?.account) values.playerAccount = playerArt.account;

  const f84 = detailOf("F8-4");
  const payNo = f84?.result?.out_trade_no || f84?.result?.pay_order_number || f84?.result?.orderNo;
  if (payNo) values.payOrder = payNo;
  if (byId["F8-2"]?.status === "passed") values.playerIdCard = "已实名";
  if (byId["F8-3"]?.status === "passed") values.playerRole = "已上传角色";

  const f9 = detailOf("F9");
  if (f9 || byId["F9"]) {
    values.payCallback = byId["F9"]?.status === "passed" ? "回调成功" : (byId["F9"]?.error || byId["F9"]?.status || "—");
  }

  // 分组时合并子步骤 detail 里的通用字段
  const focusStep = byId[focusId];
  if (focusStep?.kind === "group") {
    steps.filter(s => s.parentId === focusId).forEach(child => {
      const d = detailOf(child.id);
      if (d?.result?.token && !values.oaToken) values.oaToken = d.result.token;
      if (d?.result?.account && child.id === "F1-2") values.bizAccount = d.result.account;
    });
  }

  return (io.outputs || []).map(key => ({
    key,
    label: BF_OUTPUT_LABELS[key] || key,
    value: values[key],
  }));
}

function renderBizFlowOutputs() {
  const box = document.getElementById("bf-step-outputs");
  if (!box) return;
  const focusId = bfFocusStepId || "F1";
  const steps = bfActiveRun?.steps || bfPlan?.steps || [];
  const step = steps.find(s => s.id === focusId);
  const rows = bfCollectOutputs(focusId);
  const hasRun = !!bfActiveRun;
  const filled = rows.filter(r => r.value != null && String(r.value).trim() !== "");
  if (!rows.length) {
    box.innerHTML = `<p class="hint">步骤 ${escapeHtml(focusId)} 未配置产出字段。</p>`;
    return;
  }
  box.innerHTML = `
    <div class="bf-output-head">${escapeHtml(step ? `${step.id} · ${step.title || ""}` : focusId)}</div>
    <div class="bf-output-list">
      ${rows.map(r => {
        const empty = r.value == null || String(r.value).trim() === "";
        return `
          <div class="bf-output-row${empty ? " is-empty" : ""}">
            <div class="bf-output-label">${escapeHtml(r.label)}</div>
            <div class="bf-output-value">${empty
              ? `<span class="hint">${hasRun ? "尚未产出" : "执行后显示"}</span>`
              : `<code title="${escapeHtml(String(r.value))}">${escapeHtml(String(r.value))}</code>`}</div>
            ${empty ? "" : `<button type="button" class="btn btn-sm" onclick="copyText(decodeURIComponent('${encodeURIComponent(String(r.value))}'))">复制</button>`}
          </div>`;
      }).join("")}
    </div>
    ${!hasRun ? '<p class="hint" style="margin-top:10px">提示：先「一键开跑」或选一条运行记录，产出才会写入右侧。</p>' : ""}
    ${hasRun && !filled.length ? '<p class="hint" style="margin-top:10px">当前焦点步骤还没有产出，可点中间「执行」或查看子步骤。</p>' : ""}
  `;
}

function ensureBizFlowRunProgressModal() {
  let modal = document.getElementById("bf-run-progress-modal");
  // 挂到主流程台对话框内部，避免被主流程弹层挡住
  const host =
    document.querySelector("#biz-flow-workbench-modal:not(.hidden) .bf-wb-dialog") ||
    document.querySelector("#biz-flow-workbench-modal .bf-wb-dialog") ||
    document.body;
  if (modal) {
    if (host && modal.parentElement !== host) host.appendChild(modal);
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "bf-run-progress-modal";
  modal.className = "bf-run-progress-modal hidden";
  modal.innerHTML = `
    <div class="bf-run-progress-backdrop"></div>
    <div class="bf-run-progress-dialog" role="dialog" aria-modal="true" aria-label="主流程执行中">
      <div class="bf-run-progress-head">
        <div>
          <h3>主流程执行中</h3>
          <p class="hint" id="bf-run-progress-sub">准备开始…</p>
        </div>
        <div class="bf-run-progress-badge" id="bf-run-progress-badge">—</div>
      </div>
      <div class="bf-run-progress-current" id="bf-run-progress-current">当前步骤：—</div>
      <div class="bf-run-progress-log" id="bf-run-progress-log"></div>
      <div class="bf-run-progress-actions">
        <button type="button" class="btn btn-sm primary" id="bf-run-progress-close" disabled onclick="closeBizFlowRunProgress()">关闭</button>
      </div>
    </div>`;
  host.appendChild(modal);
  return modal;
}

function openBizFlowRunProgress(totalSteps, titleText) {
  const modal = ensureBizFlowRunProgressModal();
  modal.classList.remove("hidden");
  // 强制提到最前，防止被其它层盖住
  modal.style.zIndex = "20000";
  modal.style.display = "flex";
  const log = document.getElementById("bf-run-progress-log");
  if (log) log.innerHTML = "";
  const closeBtn = document.getElementById("bf-run-progress-close");
  if (closeBtn) closeBtn.disabled = true;
  const badge = document.getElementById("bf-run-progress-badge");
  if (badge) badge.textContent = `0 / ${totalSteps}`;
  const sub = document.getElementById("bf-run-progress-sub");
  if (sub) sub.textContent = titleText || "执行进行中，请勿关闭页面";
  const cur = document.getElementById("bf-run-progress-current");
  if (cur) cur.textContent = "当前步骤：准备中…";
}

function closeBizFlowRunProgress() {
  const modal = document.getElementById("bf-run-progress-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

function finishBizFlowRunProgress(ok) {
  const closeBtn = document.getElementById("bf-run-progress-close");
  if (closeBtn) closeBtn.disabled = false;
  const sub = document.getElementById("bf-run-progress-sub");
  if (sub) sub.textContent = ok ? "执行结束，可关闭弹窗" : "执行结束（有失败/暂停），可关闭弹窗查看详情";
}

function appendBizFlowRunLog(message, level = "info") {
  const log = document.getElementById("bf-run-progress-log");
  if (!log) return;
  const now = new Date();
  const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, "0"))
    .join(":");
  const row = document.createElement("div");
  row.className = `bf-run-log-line is-${level}`;
  row.textContent = `[${ts}] ${message}`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function setBizFlowRunProgress(index, total, stepId, title) {
  const badge = document.getElementById("bf-run-progress-badge");
  if (badge) badge.textContent = `${index} / ${total}`;
  const cur = document.getElementById("bf-run-progress-current");
  if (cur) cur.textContent = `当前步骤：${stepId}${title ? ` · ${title}` : ""}（第 ${index}/${total} 步）`;
}

async function startBizFlowRun() {
  const mode = document.getElementById("bf-mode")?.value || "silent";
  const target = document.getElementById("bf-target")?.value || "lx";
  const btn = document.getElementById("bf-start-btn");
  const rawQueue = bfBuildRunQueue();
  if (!rawQueue.length) {
    alert("请先勾选要开跑的步骤（可勾选分组 F1，或只勾 F1-1 / F1-2）");
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "执行中…";
  }
  const expanded = await bfExpandQueueWithPrereqs(rawQueue, target);
  const queue = expanded.queue;
  openBizFlowRunProgress(queue.length, `一键开跑进行中（${queue.length} 项）`);
  for (const note of expanded.notes || []) {
    appendBizFlowRunLog(note, "warn");
  }
  appendBizFlowRunLog(
    `创建运行 · 目标 ${target} · 模式 ${mode === "display" ? "展示" : "静默"} · 勾选 ${rawQueue.map(q => q.id).join("、")}`,
  );
  let endedOk = true;
  try {
    const res = await api("biz-flow/runs", {
      method: "POST",
      body: {
        mode,
        target,
        note: `勾选开跑：${queue.map(q => q.id).join(",")}`,
      },
    });
    if (!res?.ok) {
      endedOk = false;
      appendBizFlowRunLog(res?.error || "创建运行失败", "error");
      alert(res?.error || "创建失败");
      return;
    }
    bfActiveRunId = res.run.id;
    appendBizFlowRunLog(`运行已创建：${res.run.id}`, "ok");

    for (let i = 0; i < queue.length; i += 1) {
      const step = queue[i];
      setBizFlowRunProgress(i + 1, queue.length, step.id, step.title);
      appendBizFlowRunLog(`开始 ${step.id} ${step.title}`);
      const exec = await executeBizFlowApi(res.run.id, step.id);
      if (exec?.cancelled) {
        endedOk = false;
        appendBizFlowRunLog(`${step.id} 已取消填写短信，流程暂停`, "warn");
        alert(`${step.id} 已停在短信验证码步骤，可稍后对该步骤点「执行」继续`);
        break;
      }
      if (!exec?.ok) {
        endedOk = false;
        const err = exec?.error || `${step.id} 失败`;
        appendBizFlowRunLog(`${step.id} 失败：${err}`, "error");
        alert(err);
        break;
      }
      appendBizFlowRunLog(`${step.id} 通过`, "ok");
    }

    appendBizFlowRunLog("本轮一键开跑结束");
    await loadBizFlowPage();
  } catch (err) {
    endedOk = false;
    appendBizFlowRunLog(err?.message || String(err), "error");
    alert(err?.message || String(err));
  } finally {
    finishBizFlowRunProgress(endedOk);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "一键开跑（仅勾选步骤）";
    }
  }
}

async function markBizFlowStep(runId, stepId, status) {
  const res = await api(`biz-flow/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}`, {
    method: "POST",
    body: { status },
  });
  if (!res?.ok) {
    alert(res?.error || "更新失败");
    return;
  }
  bfActiveRun = res.run;
  renderBizFlowSteps(res.run);
  const runsRes = await api("biz-flow/runs?limit=20");
  bfRuns = runsRes?.runs || [];
  renderBizFlowRuns();
}

async function executeBizFlowStep(runId, stepId) {
  openBizFlowRunProgress(1, `单步执行 ${stepId}`);
  setBizFlowRunProgress(1, 1, stepId, "");
  appendBizFlowRunLog(`开始执行 ${stepId}`);
  let endedOk = true;
  try {
    const res = await executeBizFlowApi(runId, stepId);
    if (res?.cancelled) {
      endedOk = false;
      appendBizFlowRunLog(`${stepId} 已取消填写短信`, "warn");
      await loadBizFlowPage();
      return;
    }
    if (!res?.ok) {
      endedOk = false;
      appendBizFlowRunLog(`${stepId} 失败：${res?.error || "未知错误"}`, "error");
      alert(res?.error || `执行 ${stepId} 失败`);
    } else {
      appendBizFlowRunLog(`${stepId} 通过`, "ok");
    }
    await loadBizFlowPage();
  } catch (err) {
    endedOk = false;
    appendBizFlowRunLog(err?.message || String(err), "error");
    alert(err?.message || String(err));
  } finally {
    finishBizFlowRunProgress(endedOk);
  }
}

function bfFormatJsonBlock(obj) {
  if (obj == null || obj === "") return "（无）";
  if (typeof obj === "string") return obj;
  try {
    return JSON.stringify(obj, null, 2);
  } catch (_e) {
    return String(obj);
  }
}

function bfExtractLastHttp(detail) {
  if (!detail || typeof detail !== "object") return null;
  if (detail.lastHttp && typeof detail.lastHttp === "object") return detail.lastHttp;
  if (detail.request != null || detail.response != null) {
    return {
      url: detail.url,
      method: detail.method,
      httpStatus: detail.httpStatus,
      request: detail.request,
      response: detail.response,
    };
  }
  const r = detail.result;
  if (!r || typeof r !== "object") return null;
  if (r.lastHttp && typeof r.lastHttp === "object") return r.lastHttp;
  if (r.request != null || r.response != null) {
    return {
      url: r.url || r.path,
      method: r.method,
      httpStatus: r.httpStatus,
      request: r.request,
      response: r.response,
    };
  }
  if (r.login && typeof r.login === "object") {
    const login = r.login;
    return {
      url: login.url,
      method: login.method,
      httpStatus: login.httpStatus,
      request: login.request,
      response: login.response,
      label: "login",
    };
  }
  if (r.response != null) {
    return { httpStatus: r.httpStatus, response: r.response };
  }
  return null;
}

function bfRenderDetailSection(title, content, emptyHint) {
  const text = bfFormatJsonBlock(content);
  const isEmpty = text === "（无）";
  return `
    <div class="bf-detail-section">
      <h4>${escapeHtml(title)}</h4>
      ${emptyHint && isEmpty ? `<p class="hint">${escapeHtml(emptyHint)}</p>` : ""}
      <pre class="bf-detail-pre${isEmpty ? " is-empty" : ""}">${escapeHtml(text)}</pre>
    </div>`;
}

function bfCollectChildHttp(run, groupId) {
  const steps = run?.steps || [];
  return steps
    .filter(s => s.parentId === groupId)
    .map(child => {
      const detail = bfParseStepDetail(child);
      return {
        id: child.id,
        title: child.title || "",
        status: child.status || "—",
        error: child.error || "",
        lastHttp: bfExtractLastHttp(detail),
        detail,
      };
    });
}

function bfRenderChildHttpBlock(child) {
  const lh = child.lastHttp;
  const head = `${child.id}${child.title ? ` · ${child.title}` : ""} · ${child.status}`;
  let html = `<div class="bf-detail-child">
    <div class="bf-detail-child-head">${escapeHtml(head)}</div>`;
  if (child.error) {
    html += `<p class="hint" style="color:#b33">错误：${escapeHtml(child.error)}</p>`;
  }
  if (lh?.url || lh?.httpStatus != null) {
    html += `<div class="bf-detail-meta" style="margin-bottom:8px">
      ${lh.httpStatus != null ? `<span>HTTP：${escapeHtml(String(lh.httpStatus))}</span>` : ""}
      ${lh.url ? `<span>URL：${escapeHtml(String(lh.url))}</span>` : ""}
    </div>`;
  }
  html += bfRenderDetailSection("请求体", lh?.request, "该子步骤暂无请求体（历史运行或尚未写入）");
  html += bfRenderDetailSection("响应体", lh?.response, "该子步骤暂无响应体");
  html += `</div>`;
  return html;
}

async function showBizFlowStepDetail(runId, stepId) {
  let step = null;
  let run = null;
  if (runId) {
    const data = await api(`biz-flow/runs/${encodeURIComponent(runId)}`);
    run = data?.run;
    step = (run?.steps || []).find(s => s.id === stepId);
  } else {
    step = (bfPlan?.steps || []).find(s => s.id === stepId);
  }
  const modal = document.getElementById("bf-detail-modal");
  const title = document.getElementById("bf-detail-title");
  const body = document.getElementById("bf-detail-body");
  if (!modal || !body) return;
  if (title) title.textContent = `${step?.id || stepId} · ${step?.title || "步骤详情"}`;

  const parsed = bfParseStepDetail(step);
  const isGroup = step?.kind === "group" || !!(run?.steps || []).some(s => s.parentId === stepId);
  const status = step?.status || "—";
  const err = step?.error || parsed?.error || "";

  let html = `
    <div class="bf-detail-meta">
      <span>状态：<strong>${escapeHtml(status)}</strong></span>
      ${isGroup ? `<span>类型：分组（汇总子步骤）</span>` : ""}
      ${run?.target ? `<span>平台：${escapeHtml(run.target)}</span>` : ""}
      ${run?.mode ? `<span>模式：${escapeHtml(run.mode)}</span>` : ""}
      ${parsed?.system ? `<span>系统：${escapeHtml(parsed.system)}</span>` : ""}
    </div>`;

  if (err) {
    html += `<div class="bf-detail-section"><h4>错误</h4><pre class="bf-detail-pre">${escapeHtml(err)}</pre></div>`;
  }

  if (isGroup) {
    const children = bfCollectChildHttp(run, stepId);
    html += `<p class="hint" style="margin:0 0 12px">分组步骤本身不发 HTTP；下面是各子步骤最近一次请求/响应。</p>`;
    if (!children.length) {
      html += `<p class="hint">暂无子步骤</p>`;
    } else {
      html += children.map(bfRenderChildHttpBlock).join("");
    }
    const summary = typeof parsed?.text === "string" ? parsed.text : (step?.detail || "");
    if (summary) {
      html += bfRenderDetailSection("分组汇总", summary);
    }
  } else {
    const lastHttp = bfExtractLastHttp(parsed);
    let html = `
    <div class="bf-detail-meta">
      <span>状态：<strong>${escapeHtml(status)}</strong></span>
      ${run?.target ? `<span>平台：${escapeHtml(run.target)}</span>` : ""}
      ${run?.mode ? `<span>模式：${escapeHtml(run.mode)}</span>` : ""}
      ${parsed?.system ? `<span>系统：${escapeHtml(parsed.system)}</span>` : ""}
      ${lastHttp?.httpStatus != null ? `<span>HTTP：${escapeHtml(String(lastHttp.httpStatus))}</span>` : ""}
      ${lastHttp?.url ? `<span>URL：${escapeHtml(String(lastHttp.url))}</span>` : ""}
    </div>`;

    if (err) {
      html += `<div class="bf-detail-section"><h4>错误</h4><pre class="bf-detail-pre">${escapeHtml(err)}</pre></div>`;
    }
    html += bfRenderDetailSection(
      "最近一次 · 请求体",
      lastHttp?.request,
      "本步尚未执行，或历史记录未保存请求体；重新执行该步骤后可查看",
    );
    html += bfRenderDetailSection(
      "最近一次 · 响应体",
      lastHttp?.response,
      "本步尚未执行，或暂无响应记录",
    );

    const metaRest = parsed && typeof parsed === "object"
      ? Object.fromEntries(
          Object.entries(parsed).filter(([k]) => !["lastHttp", "request", "response", "result"].includes(k)),
        )
      : null;
    const hasMeta = metaRest && Object.keys(metaRest).length > 0;
    if (hasMeta || parsed?.result) {
      html += bfRenderDetailSection(
        "步骤详情（其它字段）",
        {
          ...(hasMeta ? metaRest : {}),
          ...(parsed?.result ? { result: parsed.result } : {}),
        },
      );
    } else if (typeof parsed?.text === "string") {
      html += bfRenderDetailSection("步骤详情", parsed.text);
    } else if (!parsed && step?.detail) {
      html += bfRenderDetailSection("步骤详情", String(step.detail));
    }
    body.innerHTML = html;
    modal.classList.remove("hidden");
    return;
  }

  body.innerHTML = html;
  modal.classList.remove("hidden");
}

function closeBizFlowDetail() {
  document.getElementById("bf-detail-modal")?.classList.add("hidden");
}

async function loadBizFlowArtifacts() {
  const q = document.getElementById("bf-art-q")?.value.trim() || "";
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  const data = await api(`biz-flow/artifacts?${qs.toString()}`);
  bfArtifactsTsv = data?.tsv || "";
  const tbody = document.getElementById("bf-art-tbody");
  if (!tbody) return;
  const items = data?.items || [];
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="hint">暂无记录</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.createdAt || "")}</td>
      <td>${escapeHtml(item.target || item.platform || "")}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${escapeHtml(item.role || "")}</td>
      <td><code>${escapeHtml(item.account || "")}</code></td>
      <td><code>${escapeHtml(item.password || "")}</code></td>
      <td>${escapeHtml(item.source || "")}</td>
      <td>${escapeHtml(item.stepId || "")}</td>
      <td>${escapeHtml(item.note || "")}</td>
      <td><button type="button" class="btn btn-sm" onclick="copyText('${escapeHtml((item.account || "") + (item.password ? "\\t" + item.password : ""))}')">复制</button></td>
    </tr>
  `).join("");
}

function showBizFlowArtifactForm() {
  document.getElementById("bf-art-form")?.classList.remove("hidden");
}
function hideBizFlowArtifactForm() {
  document.getElementById("bf-art-form")?.classList.add("hidden");
}

async function saveBizFlowArtifact() {
  const role = document.getElementById("bf-art-role")?.value.trim() || "";
  const account = document.getElementById("bf-art-account")?.value.trim() || "";
  const password = document.getElementById("bf-art-password")?.value.trim() || "";
  const note = document.getElementById("bf-art-note")?.value.trim() || "";
  if (!role && !account) {
    alert("请至少填角色或账号");
    return;
  }
  const res = await api("biz-flow/artifacts", {
    method: "POST",
    body: {
      runId: bfActiveRunId || "",
      target: document.getElementById("bf-target")?.value || "",
      type: "account",
      role,
      account,
      password,
      note,
      source: "manual",
      stepId: "",
    },
  });
  if (!res?.ok) {
    alert(res?.error || "保存失败");
    return;
  }
  hideBizFlowArtifactForm();
  ["bf-art-role", "bf-art-account", "bf-art-password", "bf-art-note"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  await loadBizFlowArtifacts();
}

async function copyBizFlowArtifactsTsv() {
  const text = bfArtifactsTsv || "";
  if (!text) {
    alert("没有可复制的数据");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("已复制表格（TSV，可粘贴到 Excel）");
  } catch {
    prompt("复制以下内容：", text);
  }
}

function copyText(text) {
  const raw = String(text || "").replace(/\\t/g, "\t");
  navigator.clipboard?.writeText(raw).catch(() => prompt("复制：", raw));
}

init();
