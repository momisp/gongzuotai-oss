/* 今日工作台 + 侧栏分组 + 健康检查（PRD M1/M3，从 app.js 热区抽出）
 * 依赖全局：api / escapeHtml / tools / projectsCache / activeProjectId /
 *          parseEntry / setNavActive / openTool / loadProjectsCenter /
 *          openTestScriptRemoteInstall / syncGanttIndexFromLocalStorage
 */
/** 侧栏按测试工作流分组（PRD M1 / UX-01） */
const NAV_GROUPS = [
  {
    id: "project",
    label: "项目",
    expanded: true,
    items: ["projects", "project-assets"],
  },
  {
    id: "design",
    label: "设计用例",
    expanded: true,
    items: ["test-point-generator", "data-verify", "reports"],
  },
  {
    id: "exec",
    label: "执行装包",
    expanded: true,
    items: ["test-tool", "network-capture"],
  },
  {
    id: "auto",
    label: "自动化",
    expanded: true,
    items: ["auto-qa", "video-swap", "performance"],
  },
  {
    id: "ops",
    label: "运维",
    expanded: false,
    items: ["ops", "gantt-chart", "monitor-electron", "static-tools-web"],
  },
  {
    id: "knowledge",
    label: "知识",
    expanded: false,
    items: ["qa-notes", "test-info", "maker-lab"],
  },
  {
    id: "system",
    label: "系统",
    expanded: false,
    items: [
      "file-paths",
      "links",
      "converters",
      "clipboard-history",
      "region-record",
      "timelapse",
      "cpu-monitor",
      "wechat-appeal",
    ],
  },
  {
    id: "leisure",
    label: "休闲",
    expanded: false,
    items: ["relax-games", "wallpaper", "ai-story"],
  },
];

const NAV_GROUPED_IDS = new Set(NAV_GROUPS.flatMap(g => g.items));

/** 今日工作台顶部少量全局快捷（UX-02） */
const TODAY_QUICK_ACTIONS = [
  { id: "projects", name: "项目中心", cat: "资产 · 排期 · 测点", icon: "🗂️", action: "openTool('projects')" },
  { id: "test-remote-install", name: "远程装包", cat: "安卓 ADB · iOS", icon: "📱", action: "openTestScriptRemoteInstall()" },
  { id: "ops", name: "运维工作区", cat: "巡检 · 日报 · ECS", icon: "🛠", action: "openTool('ops')" },
  { id: "auto-qa", name: "业务自动化", cat: "全流程 · 截图留档", icon: "🤖", action: "openTool('auto-qa')" },
  { id: "network-capture", name: "网络抓包", cat: "请求 · 响应 · 解帧", icon: "⇄", action: "openTool('network-capture')" },
];

const WB_LAST_PROJECT_KEY = "workbench_last_project_id";
const WB_PINNED_PROJECTS_KEY = "workbench_pinned_project_ids";

function resolveNavToolItem(id, enabled) {
  const tool = enabled.find(t => t.id === id);
  if (!tool) return null;
  const { type, id: entryId } = parseEntry(tool.entry);
  return {
    id: tool.id,
    name: tool.name,
    icon: tool.icon,
    pageId: type === "builtin" ? entryId : "integrated",
  };
}

function renderNavToolItem(item, className = "nav-sub-item") {
  return `<div class="${className}" data-page="${item.pageId}" data-tool-id="${item.id}" onclick="openTool('${item.id}')">${item.icon || "📌"} ${item.name}</div>`;
}

function getPinnedProjectIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(WB_PINNED_PROJECTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function setPinnedProjectIds(ids) {
  localStorage.setItem(WB_PINNED_PROJECTS_KEY, JSON.stringify([...new Set(ids.map(String))]));
}

function rememberLastProjectId(projectId) {
  if (!projectId) return;
  localStorage.setItem(WB_LAST_PROJECT_KEY, String(projectId));
}

function togglePinProject(projectId, ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  const id = String(projectId || "");
  if (!id) return;
  const pinned = getPinnedProjectIds();
  const next = pinned.includes(id) ? pinned.filter(x => x !== id) : [id, ...pinned];
  setPinnedProjectIds(next);
  renderTodayHome();
}

function renderNav() {
  const nav = document.getElementById("nav");
  const enabled = tools.filter(t => t.enabled);
  const used = new Set();

  let html = `<div class="nav-item" data-page="home" onclick="navigate('home'); renderTodayHome()">${"🏠"} 今日工作台</div>`;

  for (const group of NAV_GROUPS) {
    const items = group.items
      .map(id => {
        const item = resolveNavToolItem(id, enabled);
        if (item) used.add(id);
        return item;
      })
      .filter(Boolean);
    if (!items.length) continue;
    const expanded = group.expanded ? " is-expanded" : "";
    html += `
      <div class="nav-group${expanded}" id="nav-group-${group.id}">
        <div class="nav-group-head" onclick="toggleNavGroup('${group.id}')">
          <span>${escapeHtml(group.label)}</span>
          <span class="nav-group-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="nav-group-body">
          ${items.map(item => renderNavToolItem(item)).join("")}
        </div>
      </div>`;
  }

  const otherTools = enabled.filter(t => !used.has(t.id) && !NAV_GROUPED_IDS.has(t.id));
  if (otherTools.length) {
    html += `
      <div class="nav-group" id="nav-group-other">
        <div class="nav-group-head" onclick="toggleNavGroup('other')">
          <span>其他</span>
          <span class="nav-group-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="nav-group-body" id="nav-other-body">
          ${otherTools.map(t => {
            const item = resolveNavToolItem(t.id, enabled);
            return item ? renderNavToolItem(item) : "";
          }).join("")}
        </div>
      </div>`;
  }

  nav.innerHTML = html;
  setNavActive({ pageId: "home" });
}

function sortProjectsForToday(projects) {
  const pinned = new Set(getPinnedProjectIds());
  const lastId = localStorage.getItem(WB_LAST_PROJECT_KEY) || "";
  return [...projects].sort((a, b) => {
    const ap = pinned.has(a.id) ? 0 : 1;
    const bp = pinned.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.id === lastId && b.id !== lastId) return -1;
    if (b.id === lastId && a.id !== lastId) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh");
  });
}

async function renderTodayHome() {
  const projectGrid = document.getElementById("today-project-cards");
  const quickGrid = document.getElementById("today-quick-actions");
  if (quickGrid) {
    quickGrid.innerHTML = TODAY_QUICK_ACTIONS.map(t =>
      `<div class="card card-compact" onclick="${t.action}">
        <div class="card-icon">${t.icon || "📌"}</div>
        <div class="card-name">${escapeHtml(t.name)}</div>
        <div class="card-cat">${escapeHtml(t.cat)}</div>
      </div>`
    ).join("");
  }
  if (!projectGrid) return;

  projectGrid.innerHTML = '<p class="empty">正在加载项目…</p>';
  try {
    const projects = await api("projects");
    projectsCache = Array.isArray(projects) ? projects : [];
  } catch (_) {
    projectsCache = [];
  }

  if (!projectsCache.length) {
    projectGrid.innerHTML = `
      <div class="today-empty">
        <p>暂无项目。先在项目中心创建，之后这里会显示「继续测试」卡片。</p>
        <button type="button" class="btn primary" onclick="openTool('projects')">去项目中心</button>
      </div>`;
    await renderWorkbenchHealth();
    if (typeof enhanceHealthWithRuntime === "function") await enhanceHealthWithRuntime();
    renderContinueLastRoute();
    await renderTodayProcessPanel();
    await refreshTodayInsertedBadge();
    return;
  }

  const pinned = new Set(getPinnedProjectIds());
  const lastId = localStorage.getItem(WB_LAST_PROJECT_KEY) || "";
  const list = sortProjectsForToday(projectsCache).slice(0, 8);
  projectGrid.innerHTML = list.map(p => {
    const isPinned = pinned.has(p.id);
    const isLast = p.id === lastId;
    const aliases = (p.aliases || []).slice(0, 2).join(" / ");
    const meta = [
      isLast ? "最近打开" : "",
      `${(p.asset_projects || []).length} 资产组`,
      `${(p.gantt_project_ids || []).length} 排期`,
    ].filter(Boolean).join(" · ");
    return `
      <article class="today-project-card${isLast ? " is-recent" : ""}">
        <div class="today-project-head">
          <div>
            <h3>${escapeHtml(p.name || "未命名项目")}</h3>
            <p class="today-project-meta">${escapeHtml(aliases || p.id)} · ${escapeHtml(meta)}</p>
          </div>
          <button type="button" class="btn btn-ghost today-pin-btn" title="${isPinned ? "取消钉选" : "钉选到顶部"}"
            onclick="togglePinProject('${escapeHtml(p.id)}', event)">${isPinned ? "📌" : "📍"}</button>
        </div>
        <div class="today-project-actions">
          <button type="button" class="btn primary" onclick="openTodayProject('${escapeHtml(p.id)}')">打开项目</button>
          <button type="button" class="btn" onclick="openTodayProjectAction('${escapeHtml(p.id)}','testpoints')">测点</button>
          <button type="button" class="btn" onclick="openTodayProjectAction('${escapeHtml(p.id)}','install')">装包</button>
          <button type="button" class="btn" onclick="openTodayProjectAction('${escapeHtml(p.id)}','ops')">运维</button>
        </div>
      </article>`;
  }).join("");

  await renderWorkbenchHealth();
  if (typeof enhanceHealthWithRuntime === "function") await enhanceHealthWithRuntime();
  renderContinueLastRoute();
  await renderTodayProcessPanel();
  await refreshTodayInsertedBadge();
}

/** 今日工作台：插入测试角标（有 inserted 且未完成则显示） */
async function refreshTodayInsertedBadge() {
  const badge = document.getElementById("today-inserted-badge");
  if (!badge) return;
  try {
    const data = await api("test-process", { timeoutMs: 8000 });
    const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
    const n = tracks.filter(t => t.inserted && t.status !== "done").length;
    if (n > 0) {
      badge.textContent = `插入 ${n}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (_) {
    badge.classList.add("hidden");
  }
}

function closeActiveTestTimeline() {
  document.getElementById("active-test-timeline-modal")?.classList.add("hidden");
}

async function openActiveTestTimeline() {
  const modal = document.getElementById("active-test-timeline-modal");
  const body = document.getElementById("active-test-timeline-body");
  if (!modal || !body) return;
  modal.classList.remove("hidden");
  body.innerHTML = '<p class="hint">加载时间轴…</p>';
  let data;
  try {
    data = await api("test-process", { timeoutMs: 8000 });
  } catch (err) {
    body.innerHTML = `<p class="empty">加载失败：${escapeHtml(err.message || err)}</p>`;
    return;
  }
  if (data?.error) {
    body.innerHTML = `<p class="empty">${escapeHtml(data.error)}</p>`;
    return;
  }

  const stages = Array.isArray(data.stages) ? data.stages : [];
  const stageById = Object.fromEntries(stages.map(s => [s.id, s]));
  const statusLabel = { doing: "进行中", done: "已完成", paused: "暂停", blocked: "阻塞" };
  const tracks = Array.isArray(data.tracks) ? [...data.tracks] : [];

  // 时间轴：进行中优先，其次插入未完成，再按更新时间倒序
  const active = tracks.filter(t => t.status === "doing" || (t.inserted && t.status !== "done"));
  const rest = tracks.filter(t => !active.includes(t));
  const byUpdated = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  active.sort((a, b) => {
    if (!!a.inserted !== !!b.inserted) return a.inserted ? -1 : 1;
    return byUpdated(a, b);
  });
  rest.sort(byUpdated);
  const ordered = [...active, ...rest];

  const insertedCount = ordered.filter(t => t.inserted && t.status !== "done").length;
  const sub = document.getElementById("active-test-timeline-sub");
  if (sub) {
    sub.textContent = insertedCount
      ? `共 ${ordered.length} 条轨道 · 其中 ${insertedCount} 条为插入测试（橙色高亮）`
      : `共 ${ordered.length} 条轨道 · 当前无插入测试`;
  }

  if (!ordered.length) {
    body.innerHTML = '<p class="empty">暂无测试轨道（data/test_process.json）</p>';
    return;
  }

  const nowLabel = new Date().toLocaleString("zh-CN", { hour12: false });
  body.innerHTML = `
    <div class="today-timeline-now">今天 · ${escapeHtml(nowLabel)}</div>
    <ol class="today-timeline">
      ${ordered
        .map(t => {
          const stageName = stageById[t.stageId]?.name || t.stageId || "未设置";
          const isInserted = !!t.inserted && t.status !== "done";
          const isDoing = t.status === "doing";
          const openBtn = t.projectId
            ? `<button type="button" class="btn primary" onclick="closeActiveTestTimeline(); openTodayProject('${escapeHtml(t.projectId)}')">打开项目</button>`
            : "";
          const protoBtn = t.prototypeUrl
            ? `<a class="btn" href="${escapeHtml(t.prototypeUrl)}" target="_blank" rel="noopener">原型</a>`
            : "";
          const tags = [
            isInserted ? '<span class="today-tl-tag is-inserted">插入</span>' : "",
            isDoing ? '<span class="today-tl-tag is-doing">进行中</span>' : "",
            `<span class="today-tl-tag">${escapeHtml(statusLabel[t.status] || t.status || "-")}</span>`,
          ]
            .filter(Boolean)
            .join("");
          return `
        <li class="today-timeline-item${isInserted ? " is-inserted" : ""}${isDoing ? " is-doing" : ""}">
          <div class="today-timeline-dot" aria-hidden="true"></div>
          <div class="today-timeline-card">
            <div class="today-timeline-card-top">
              <h3>${escapeHtml(t.name || t.projectName || "未命名")}</h3>
              <div class="today-timeline-tags">${tags}</div>
            </div>
            <p class="today-timeline-meta">
              ${escapeHtml(stageName)}
              ${t.updatedAt ? ` · ${escapeHtml(t.updatedAt)}` : ""}
              ${t.projectName ? ` · ${escapeHtml(t.projectName)}` : ""}
            </p>
            ${t.note ? `<p class="today-timeline-note">${escapeHtml(t.note)}</p>` : ""}
            <div class="today-timeline-actions">${openBtn}${protoBtn}</div>
          </div>
        </li>`;
        })
        .join("")}
    </ol>`;
  await refreshTodayInsertedBadge();
}

async function renderTodayProcessPanel() {
  const stagesEl = document.getElementById("today-process-stages");
  const tracksEl = document.getElementById("today-process-tracks");
  if (!stagesEl || !tracksEl) return;

  stagesEl.innerHTML = '<p class="hint">加载测试流程…</p>';
  tracksEl.innerHTML = "";
  let data;
  try {
    data = await api("test-process", { timeoutMs: 8000 });
  } catch (err) {
    stagesEl.innerHTML = `<p class="empty">流程加载失败：${escapeHtml(err.message || err)}</p>`;
    return;
  }
  if (data?.error) {
    stagesEl.innerHTML = `<p class="empty">${escapeHtml(data.error)}</p>`;
    return;
  }

  const stages = Array.isArray(data.stages) ? [...data.stages].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const stageById = Object.fromEntries(stages.map(s => [s.id, s]));

  const hotStageId = tracks.find(t => t.status === "doing")?.stageId || "smoke";
  const stageNodes = stages.map((s, idx) => {
    const dels = (s.deliverables || []).map(d => `<li>${escapeHtml(d)}</li>`).join("");
    const isHot = s.id === hotStageId;
    return `
      <li class="today-mindmap-node">
        <details class="today-mindmap-branch${isHot ? " is-hot" : ""}"${isHot ? " open" : ""}>
          <summary>
            <span class="stage-order">${s.order || idx + 1}</span>
            <span>${escapeHtml(s.name || "")}</span>
          </summary>
          <ul class="today-mindmap-leaves">${dels || "<li>暂无交付物说明</li>"}</ul>
        </details>
      </li>`;
  }).join("");
  stagesEl.innerHTML = stageNodes
    ? `<div class="today-mindmap">
        <div class="today-mindmap-root">测试流程</div>
        <ul class="today-mindmap-tree">${stageNodes}</ul>
      </div>`
    : '<p class="empty">暂无阶段定义（data/test_process.json）</p>';

  const statusLabel = { doing: "进行中", done: "已完成", paused: "暂停", blocked: "阻塞" };
  const sortedTracks = [...tracks].sort((a, b) => {
    const rank = { doing: 0, blocked: 1, paused: 2, done: 3 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
  });

  tracksEl.innerHTML = sortedTracks.map(t => {
    const curIdx = stages.findIndex(s => s.id === t.stageId);
    const curName = stageById[t.stageId]?.name || t.stageId || "未设置";
    const dots = stages.map((s, i) => {
      let cls = "todo";
      if (curIdx < 0) cls = "todo";
      else if (i < curIdx) cls = "done";
      else if (i === curIdx) cls = "current";
      return `<span class="today-process-dot ${cls}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>`;
    }).join("");
    const isCurrent = t.status === "doing";
    const isInserted = !!t.inserted && t.status !== "done";
    const openBtn = t.projectId
      ? `<button type="button" class="btn primary" onclick="openTodayProject('${escapeHtml(t.projectId)}')">打开项目</button>`
      : "";
    const protoBtn = t.prototypeUrl
      ? `<a class="btn" href="${escapeHtml(t.prototypeUrl)}" target="_blank" rel="noopener">原型</a>`
      : "";
    const insertTag = isInserted ? '<span class="today-tl-tag is-inserted">插入</span> ' : "";
    return `
      <details class="today-process-track${isCurrent ? " is-current" : ""}${isInserted ? " is-inserted" : ""}"${isCurrent || isInserted ? " open" : ""}>
        <summary>
          <div class="track-summary-main">
            <h3>${insertTag}${escapeHtml(t.name || t.projectName || "未命名")}</h3>
            <p class="track-summary-line">
              ${escapeHtml(curName)} · ${escapeHtml(statusLabel[t.status] || t.status || "-")}
              ${t.updatedAt ? ` · ${escapeHtml(t.updatedAt)}` : ""}
            </p>
          </div>
        </summary>
        <div class="today-process-track-body">
          <p class="track-meta">
            ${t.note ? `${escapeHtml(t.note)}<br>` : ""}
            ${t.artifactDir ? `产出：${escapeHtml(t.artifactDir)}` : ""}
          </p>
          <div class="today-process-dots">${dots}</div>
          <div class="today-process-track-actions">
            ${openBtn}
            ${protoBtn}
          </div>
        </div>
      </details>`;
  }).join("") || '<p class="empty">暂无项目进度轨道</p>';
}

function renderContinueLastRoute() {
  const host = document.getElementById("today-continue-route");
  if (!host || typeof readWorkbenchRoute !== "function") return;
  const route = readWorkbenchRoute();
  if (!route?.toolId || route.toolId === "home") {
    host.innerHTML = "";
    return;
  }
  const label = route.projectName
    ? `${route.toolId} · ${route.projectName}`
    : route.toolId;
  host.innerHTML = `
    <button type="button" class="btn primary" onclick="restoreWorkbenchLastRoute()">继续上次：${escapeHtml(label)}</button>
    <button type="button" class="btn" onclick="localStorage.removeItem('workbench_last_route_v1'); renderContinueLastRoute()">清除</button>`;
}

async function openTodayProject(projectId) {
  rememberLastProjectId(projectId);
  openTool("projects");
  await loadProjectsCenter(projectId);
}

async function openTodayProjectAction(projectId, kind) {
  rememberLastProjectId(projectId);
  const project = (projectsCache || []).find(p => p.id === projectId);
  if (!project) {
    await openTodayProject(projectId);
    return;
  }
  const context = {
    projectId: project.id,
    projectName: project.name,
    assetProjects: project.asset_projects || [],
    ganttProjectIds: project.gantt_project_ids || [],
  };
  sessionStorage.setItem("workbench_project_context", JSON.stringify(context));
  activeProjectId = projectId;

  if (kind === "install") {
    openTestScriptRemoteInstall();
    return;
  }
  if (kind === "ops") {
    openTool("ops");
    return;
  }
  if (kind === "testpoints") {
    syncGanttIndexFromLocalStorage();
    sessionStorage.setItem("tp_gen_import", JSON.stringify({
      name: project.name,
      note: "",
      url: "",
      text: "",
      projectId: project.id,
      projectName: project.name,
      assetId: "",
      ganttProjectIds: project.gantt_project_ids || [],
    }));
    openTool("test-point-generator");
  }
}

async function renderWorkbenchHealth() {
  const box = document.getElementById("workbench-health");
  if (!box) return;
  box.innerHTML = '<p class="hint">正在检查服务状态…</p>';
  let data;
  try {
    data = await api("workbench-health", { timeoutMs: 8000 });
  } catch (err) {
    box.innerHTML = `<div class="health-card is-bad"><strong>工作台 API</strong><span>不可达：${escapeHtml(err.message || err)}</span></div>`;
    return;
  }
  if (data?.error) {
    box.innerHTML = `<div class="health-card is-bad"><strong>健康检查失败</strong><span>${escapeHtml(data.error)}</span></div>`;
    return;
  }

  const pill = (ok) => `<span class="health-pill ${ok ? "ok" : "bad"}">${ok ? "正常" : "异常"}</span>`;
  const agile = data.agileSim || {};
  const adb = data.adb || {};
  const devices = Array.isArray(adb.devices) ? adb.devices : [];
  const deviceText = adb.ok
    ? (devices.length ? `${devices.length} 台：${devices.map(d => d.serial || d.id || "?").slice(0, 3).join(", ")}` : "无设备")
    : (adb.error || "ADB 不可用");
  const pathWarn = agile.pathWarning
    ? `<p class="hint health-path-warn">⚠️ ${escapeHtml(agile.pathWarning)}</p>`
    : "";
  const backups = Array.isArray(data.backups) ? data.backups : [];
  const backupText = backups.length
    ? `最近备份：${escapeHtml(backups[0].createdAt || backups[0].id || "")}`
    : "尚无备份";

  box.innerHTML = `
    <div class="health-grid">
      <div class="health-card is-ok"><strong>工作台</strong>${pill(true)}<span>本页服务可用</span></div>
      <div class="health-card ${agile.pathOk === false ? "is-bad" : (agile.vite?.ok ? "is-ok" : "is-bad")}">
        <strong>测点 Vite :5173</strong>${pill(!!agile.vite?.ok)}
        <span>${agile.vite?.ok ? "workbench 模式就绪" : "未启动或非 /agile-sim/ 模式"}</span>
      </div>
      <div class="health-card ${agile.api?.ok ? "is-ok" : "is-bad"}">
        <strong>测点 API :5180</strong>${pill(!!agile.api?.ok)}
        <span>${agile.api?.ok ? "健康" : "未就绪（打开测点时会自动 warmup）"}</span>
      </div>
      <div class="health-card ${adb.ok ? "is-ok" : "is-bad"}">
        <strong>ADB</strong>${pill(!!adb.ok)}
        <span>${escapeHtml(deviceText)}</span>
      </div>
    </div>
    <p class="hint health-hint">真实路径：${escapeHtml(agile.resolved || agile.dir || "-")}${agile.exists === false ? "（目录不存在）" : ""}</p>
    ${pathWarn}
    <p class="hint">${backupText} · ${escapeHtml(data.hint || "")}</p>
    <div class="health-actions">
      <button type="button" class="btn" onclick="renderWorkbenchHealth()">刷新状态</button>
      <button type="button" class="btn primary" onclick="createWorkbenchDataBackup()">备份 data</button>
      <button type="button" class="btn" onclick="copyWorkbenchHealth()">复制诊断信息</button>
    </div>`;
  box.dataset.healthJson = JSON.stringify(data);
}

function copyWorkbenchHealth() {
  const box = document.getElementById("workbench-health");
  const raw = box?.dataset?.healthJson || "";
  const text = raw || "暂无健康检查数据，请先刷新状态";
  navigator.clipboard?.writeText(text).then(
    () => alert("已复制诊断信息"),
    () => prompt("复制以下内容：", text)
  );
}

async function createWorkbenchDataBackup() {
  const note = window.prompt("备份备注（可空）", "手动备份") || "";
  const res = await api("data-backup", { method: "POST", body: { note } });
  if (res?.error || res?.ok === false) {
    alert(res?.error || "备份失败");
    return;
  }
  alert(`已备份 ${res.fileCount || (res.copied || []).length || 0} 个文件到 ${res.dir || "data/backups"}`);
  await renderWorkbenchHealth();
}

function reloadEmbeddedFrame() {
  const frame = document.getElementById("embedded-frame");
  if (!frame || !embeddedUrl) return;
  loadEmbeddedSite(embeddedUrl, document.getElementById("embedded-title")?.textContent || "嵌入站点");
}

function copyEmbeddedFailHint() {
  const title = document.getElementById("embedded-title")?.textContent || "";
  const text = [
    `嵌入页失败：${title}`,
    `URL: ${embeddedUrl || "(empty)"}`,
    "建议：Ctrl+F5 / 新窗口打开 / 重启 start.bat / 查看健康检查 Vite·API",
  ].join("\n");
  navigator.clipboard?.writeText(text).then(
    () => alert("已复制失败信息"),
    () => prompt("复制以下内容：", text)
  );
}

/** @deprecated 兼容旧调用 */
function renderToolCards() {
  renderTodayHome();
}
