/* M4 增强：全局搜索 / 记忆入口 / 缺陷模板 / 发版清单 / 运行时开关 / 上下文包
 * 依赖：api / escapeHtml / openTool / openTodayProject / navigate / activeProjectId /
 *       activeProjectOverview / renderWorkbenchHealth（可被增强）
 */
const WB_LAST_ROUTE_KEY = "workbench_last_route_v1";
let _globalSearchTimer = null;

function rememberWorkbenchRoute(payload) {
  try {
    localStorage.setItem(WB_LAST_ROUTE_KEY, JSON.stringify({
      ...payload,
      at: Date.now(),
    }));
  } catch (_) {}
}

function readWorkbenchRoute() {
  try {
    const raw = JSON.parse(localStorage.getItem(WB_LAST_ROUTE_KEY) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch (_) {
    return null;
  }
}

async function restoreWorkbenchLastRoute() {
  const route = readWorkbenchRoute();
  if (!route) return;
  // 首页本身就不恢复，避免打断今日工作台
  if (route.toolId && route.toolId !== "home") {
    const skip = new Set(["relax-games", "wallpaper", "ai-story"]);
    if (skip.has(route.toolId)) return;
    if (route.projectId) {
      try {
        sessionStorage.setItem("workbench_project_context", JSON.stringify({
          projectId: route.projectId,
          projectName: route.projectName || "",
          assetProjects: route.assetProjects || [],
          ganttProjectIds: route.ganttProjectIds || [],
        }));
      } catch (_) {}
    }
    // 延迟一拍，等 tools/nav 就绪
    setTimeout(() => {
      try {
        openTool(route.toolId);
      } catch (_) {}
    }, 80);
  }
}

function hardenGlobalSearchAgainstAutofill(input) {
  if (!input) return;
  // 浏览器常在加载后把「保存的密码/URL」灌进首个可见输入框；只读 + 延后清空可挡大部分自动填充
  const unlock = () => {
    if (input.hasAttribute("readonly")) input.removeAttribute("readonly");
  };
  input.addEventListener("focus", unlock);
  input.addEventListener("pointerdown", unlock);
  const scrub = () => {
    const v = String(input.value || "").trim();
    // 明显是 URL / 域名残渣时清掉（例如 volces.com）
    if (!v) return;
    if (/^https?:\/\//i.test(v) || /\.(com|cn|net|org|io)(\/|$)/i.test(v)) {
      input.value = "";
    }
  };
  scrub();
  setTimeout(scrub, 50);
  setTimeout(scrub, 300);
  setTimeout(scrub, 1000);
}

function bindGlobalSearch() {
  const input = document.getElementById("global-search-input");
  const panel = document.getElementById("global-search-panel");
  if (!input || !panel || input.dataset.bound === "1") return;
  input.dataset.bound = "1";
  hardenGlobalSearchAgainstAutofill(input);

  const hide = () => panel.classList.add("hidden");
  const show = () => panel.classList.remove("hidden");

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(_globalSearchTimer);
    if (!q) {
      panel.innerHTML = "";
      hide();
      return;
    }
    _globalSearchTimer = setTimeout(async () => {
      const data = await api("global-search?q=" + encodeURIComponent(q));
      renderGlobalSearchResults(data);
      show();
    }, 180);
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      input.blur();
      hide();
    }
  });

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".global-search")) hide();
  });

  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "k") {
      ev.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function renderGlobalSearchResults(data) {
  const panel = document.getElementById("global-search-panel");
  if (!panel) return;
  const groups = data?.groups || [];
  if (!groups.length) {
    panel.innerHTML = '<div class="global-search-empty">无匹配结果</div>';
    return;
  }
  panel.innerHTML = groups.map(g => `
    <div class="global-search-group">
      <div class="global-search-group-title">${escapeHtml(g.label)}</div>
      ${(g.items || []).map((it, idx) => `
        <button type="button" class="global-search-item"
          data-g="${escapeHtml(g.key)}" data-i="${idx}">
          <strong>${escapeHtml(it.title || "")}</strong>
          <span>${escapeHtml(it.subtitle || "")}</span>
        </button>`).join("")}
    </div>`).join("");

  panel.querySelectorAll(".global-search-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const g = groups.find(x => x.key === btn.dataset.g);
      const item = g?.items?.[Number(btn.dataset.i)];
      if (item) openGlobalSearchHit(item);
    });
  });
}

async function openGlobalSearchHit(item) {
  document.getElementById("global-search-panel")?.classList.add("hidden");
  const action = item.action || {};
  if (action.type === "project" && action.projectId) {
    await openTodayProject(action.projectId);
    return;
  }
  if (action.type === "url" && action.url) {
    window.open(action.url, "_blank", "noopener");
    return;
  }
  if (action.type === "tool" && action.toolId) {
    openTool(action.toolId);
  }
}

async function applyProjectContextPack(projectId) {
  if (!projectId) return null;
  const data = await api(`projects/${encodeURIComponent(projectId)}/context-pack`);
  if (!data?.ok) return null;
  try {
    sessionStorage.setItem("workbench_context_pack", JSON.stringify(data));
  } catch (_) {}
  return data;
}

function renderProjectContextPack(data) {
  const box = document.getElementById("project-context-pack");
  if (!box) return;
  if (!data?.ok) {
    box.innerHTML = '<p class="hint">上下文包加载失败</p>';
    return;
  }
  const pack = data.pack || {};
  const section = (title, list, field) => {
    if (!list?.length) return "";
    return `<div class="ctx-pack-block"><strong>${escapeHtml(title)}</strong><ul>${
      list.slice(0, 5).map(x => {
        const main = x[field] || x.name || x.note || "—";
        const sub = [x.env, x.note].filter(Boolean).join(" · ");
        return `<li><code>${escapeHtml(main)}</code>${sub ? ` <span class="hint">${escapeHtml(sub)}</span>` : ""}</li>`;
      }).join("")
    }</ul></div>`;
  };
  const html = [
    section("账号资产", pack.accounts, "name"),
    section("环境", pack.envs, "env"),
    section("域名 / URL", pack.urls, "url"),
    section("包路径", pack.packages, "path"),
  ].filter(Boolean).join("");
  box.innerHTML = html || '<p class="hint">未识别到账号/环境/包资产。可在项目资产名称或标签中写「账号」「环境」「apk」等关键词。</p>';
}

async function refreshProjectReleaseChecklist() {
  const box = document.getElementById("project-release-checklist");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/release-checklist`);
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  const items = data.items || [];
  const done = items.filter(i => i.checked).length;
  box.innerHTML = `
    <div class="release-check-meta hint">已勾选 ${done}/${items.length}${data.updatedAt ? " · 更新于 " + escapeHtml(data.updatedAt) : ""}</div>
    <div class="release-check-list">
      ${items.map(it => `
        <label class="release-check-item">
          <input type="checkbox" data-check-id="${escapeHtml(it.id)}" ${it.checked ? "checked" : ""}>
          <span class="release-check-group">${escapeHtml(it.group)}</span>
          <span>${escapeHtml(it.title)}</span>
        </label>`).join("")}
    </div>
    <button type="button" class="btn primary" onclick="saveProjectReleaseChecklist()">保存发版清单</button>`;
}

async function saveProjectReleaseChecklist() {
  if (!activeProjectId) return;
  const checked = [...document.querySelectorAll("#project-release-checklist input[data-check-id]:checked")]
    .map(el => el.getAttribute("data-check-id"));
  const res = await api(`projects/${encodeURIComponent(activeProjectId)}/release-checklist`, {
    method: "PUT",
    body: { checked },
  });
  if (res?.error) {
    alert(res.error);
    return;
  }
  await refreshProjectReleaseChecklist();
}

async function copyProjectBugTemplate() {
  if (!activeProjectId) {
    alert("请先打开项目");
    return;
  }
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/bug-template`);
  if (data?.error || !data?.markdown) {
    alert(data?.error || "生成失败");
    return;
  }
  navigator.clipboard?.writeText(data.markdown).then(
    () => alert(`已复制缺陷模板（含 ${data.failedCount || 0} 条冒烟失败）`),
    () => prompt("复制以下内容：", data.markdown)
  );
}

async function renderRuntimeToggles() {
  const box = document.getElementById("runtime-toggles");
  if (!box) return;
  const data = await api("workbench-runtime");
  const cfg = data?.config || {};
  const rows = [
    ["timelineSync", "活动时间轴同步"],
    ["clipboardHistory", "剪贴板历史热键"],
    ["regionRecord", "区域录屏热键"],
    ["cpuMonitor", "CPU 监控采样"],
  ];
  box.innerHTML = `
    <div class="runtime-toggle-list">
      ${rows.map(([key, label]) => `
        <label class="runtime-toggle-item">
          <input type="checkbox" data-rt="${key}" ${cfg[key] ? "checked" : ""}>
          <span>${label}</span>
        </label>`).join("")}
    </div>
    <button type="button" class="btn" onclick="saveRuntimeToggles()">保存后台开关</button>
    <p class="hint">关闭后需重启 start.bat 生效</p>`;
}

async function saveRuntimeToggles() {
  const body = {};
  document.querySelectorAll("#runtime-toggles input[data-rt]").forEach(el => {
    body[el.getAttribute("data-rt")] = !!el.checked;
  });
  const res = await api("workbench-runtime", { method: "PUT", body });
  if (res?.error) {
    alert(res.error);
    return;
  }
  alert(res.hint || "已保存");
  await renderRuntimeToggles();
}

async function enhanceHealthWithRuntime() {
  await renderRuntimeToggles();
  const host = document.getElementById("workbench-selfcheck-wrap");
  if (host && !host.dataset.ready) {
    host.dataset.ready = "1";
    host.innerHTML = `
      <button type="button" class="btn" onclick="runWorkbenchSelfcheck()">一键自检</button>
      <div id="workbench-selfcheck" class="workbench-selfcheck"></div>`;
  }
}

/** 供 openProjectDetail 末尾调用 */
async function refreshProjectM4Panels() {
  if (!activeProjectId) return;
  const pack = await applyProjectContextPack(activeProjectId);
  renderProjectContextPack(pack);
  await refreshProjectReleaseChecklist();
  await refreshProjectRegressionSuggest();
  await refreshProjectInstallHistory();
}

async function refreshProjectRegressionSuggest() {
  const box = document.getElementById("project-regression-suggest");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/regression-suggest`);
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    box.innerHTML = '<p class="hint">暂无建议。可先在甘特图维护未完成任务，或同步排期索引。</p>';
    return;
  }
  box.innerHTML = `
    <div class="release-check-list">
      ${items.map((it, idx) => `
        <label class="release-check-item">
          <input type="checkbox" data-reg-idx="${idx}" ${it.checked ? "checked" : ""}>
          <span class="release-check-group">${escapeHtml(it.status || "todo")}</span>
          <span><strong>${escapeHtml(it.module)}</strong>
            <span class="hint"> · ${escapeHtml(it.reason || "")}${it.end ? " · 截止 " + escapeHtml(it.end) : ""}</span>
          </span>
        </label>`).join("")}
    </div>
    <button type="button" class="btn" onclick="copySelectedRegression()">复制已勾选回归清单</button>`;
  box._regItems = items;
}

function copySelectedRegression() {
  const box = document.getElementById("project-regression-suggest");
  const items = box?._regItems || [];
  const selected = [...document.querySelectorAll("#project-regression-suggest input[data-reg-idx]:checked")]
    .map(el => items[Number(el.getAttribute("data-reg-idx"))])
    .filter(Boolean);
  if (!selected.length) {
    alert("请先勾选模块");
    return;
  }
  const name = activeProjectOverview?.project?.name || activeProjectId || "";
  const text = [
    `【回归清单】${name}`,
    ...selected.map((s, i) => `${i + 1}. ${s.module}${s.end ? `（截止 ${s.end}）` : ""}`),
    "",
    `生成于 ${new Date().toLocaleString()}`,
  ].join("\n");
  navigator.clipboard?.writeText(text).then(
    () => alert(`已复制 ${selected.length} 项`),
    () => prompt("复制：", text)
  );
}

async function refreshProjectInstallHistory() {
  const box = document.getElementById("project-install-history");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/install-history`);
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    box.innerHTML = '<p class="hint">暂无装包记录。在「远程装包」成功或失败后会自动归档到当前项目。</p>';
    return;
  }
  box.innerHTML = `<ul class="project-round-history">${items.slice(0, 10).map(it => `
    <li>
      <span class="round-status ${it.ok ? "round-status-pass" : "round-status-fail"}">${it.ok ? "成功" : "失败"}</span>
      <span class="round-time">${escapeHtml(it.at || "")}</span>
      <span class="round-note">${escapeHtml(it.apkName || it.apkPath || "—")} · ${escapeHtml(it.serial || "无 serial")}${it.error ? " · " + escapeHtml(it.error) : ""}</span>
    </li>`).join("")}</ul>`;
}

async function recordProjectInstallHistory(payload) {
  let projectId = activeProjectId;
  try {
    const ctx = JSON.parse(sessionStorage.getItem("workbench_project_context") || "{}");
    projectId = ctx.projectId || projectId;
  } catch (_) {}
  if (!projectId) return;
  const apkPath = payload.path || payload.apkPath || "";
  const apkName = payload.apkName || (apkPath ? String(apkPath).split(/[/\\]/).pop() : "");
  await api(`projects/${encodeURIComponent(projectId)}/install-history`, {
    method: "POST",
    body: {
      ok: !!payload.ok,
      serial: payload.serial || "",
      apkName,
      apkPath,
      error: payload.error || "",
      note: payload.note || "",
    },
  }).catch(() => {});
}

async function runWorkbenchSelfcheck() {
  const box = document.getElementById("workbench-selfcheck");
  if (box) box.innerHTML = '<p class="hint">正在自检…</p>';
  const data = await api("workbench-selfcheck", { timeoutMs: 10000 });
  if (!box) {
    alert(data?.ok ? `自检通过 ${data.passed}/${data.total}` : `自检未全过 ${data?.passed}/${data?.total}`);
    return;
  }
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  box.innerHTML = `
    <div class="selfcheck-summary ${data.ok ? "is-ok" : "is-bad"}">
      ${data.ok ? "全部通过" : "存在异常"} · ${data.passed}/${data.total} · ${escapeHtml(data.at || "")}
    </div>
    <ul class="selfcheck-list">
      ${(data.checks || []).map(c => `
        <li class="${c.ok ? "ok" : "bad"}">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.detail || "")}</span>
        </li>`).join("")}
    </ul>`;
}
