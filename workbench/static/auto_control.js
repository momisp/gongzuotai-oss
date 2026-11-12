/* 自动化控制面板 */
(function () {
  let pollTimer = null;
  let acShotItems = [];
  let acShotIndex = 0;
  let acShotZoom = 1;
  let overviewCache = null;
  let watchingRunId = "";

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(opts && opts.headers) },
      ...opts,
      body: opts && opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    const ct = String(res.headers.get("content-type") || "");
    let data = {};
    const raw = await res.text();
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      const hint =
        res.status === 404
          ? "接口 404：工作台进程可能未加载新代码，请重启 workbench（8765）后 Ctrl+F5"
          : ct.includes("html")
            ? "返回了 HTML 而非 JSON（多半是旧进程/路由未注册），请重启工作台"
            : "响应非 JSON";
      data = { ok: false, error: `${hint}（HTTP ${res.status}）` };
    }
    if (!res.ok && data.ok !== false) data.ok = false;
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 展示用中文；原始码保留在括号/title，便于对照日志 */
  const ZH = {
    status: {
      passed: "通过",
      failed: "失败",
      cancelled: "已取消",
      running: "执行中",
      queued: "排队中",
      pending: "待执行",
      skipped: "已跳过",
      stub: "未接线",
      stub_stop: "阻断",
      blocked: "阻断",
      dryrun: "预演",
      skip: "不判定",
      unknown: "未知",
    },
    engineState: {
      PASS: "通过",
      FAIL: "失败",
      BLOCKED: "阻断",
      DRYRUN: "预演",
      SKIP: "不判定",
    },
    failClass: {
      product: "产品缺陷",
      env: "环境问题",
      data: "数据前置",
      automation: "自动化本身",
    },
    target: { lx: "龙翔", yq: "游趣", hw: "汇玩" },
    source: { manual: "手动", retry: "重试", auto_retry: "自动重试", batch_retry: "批量重试", schedule: "定时", api: "接口触发" },
    engine: {
      sql: "数据库查询",
      sdk: "SDK 接口",
      callback: "支付回调",
      sql_assert: "数据库断言",
      form_admin: "总后台表单",
      form_guild: "会长端表单",
      pw_admin: "Playwright·总后台",
      pw_guild: "Playwright·会长端",
    },
    wiring: { wired: "已接线", stub: "未接线（占位）" },
  };

  function zhMap(map, code, fallback) {
    const c = String(code ?? "").trim();
    if (!c) return fallback || "—";
    return map[c] || map[c.toLowerCase()] || fallback || c;
  }

  /** 中文主文案 + 英文码提示（无法改掉的技术字段） */
  function zhWithCode(zh, code) {
    const c = String(code ?? "").trim();
    if (!c) return esc(zh || "—");
    if (!zh || zh === c) return `<code class="ac-code" title="${esc(c)}">${esc(c)}</code>`;
    return `${esc(zh)} <code class="ac-code" title="原始标识">${esc(c)}</code>`;
  }

  function statusTag(st, run) {
    const stop = String((run && run.stopReason) || "");
    const s = stop === "stub_stop" ? "stub_stop" : String(st || "");
    const zh = zhMap(ZH.status, s, s || "—");
    return `<span class="ac-tag ${esc(s)}" title="${esc(s)}">${esc(zh)}${
      s && zh !== s ? ` <span class="ac-code-inline">${esc(s)}</span>` : ""
    }</span>`;
  }

  function engineStateOf(step) {
    const raw = String((step && step.engineState) || "").trim().toUpperCase();
    if (raw) return raw;
    const d = String((step && step.detail) || "");
    const m = d.match(/^\[(PASS|FAIL|BLOCKED|DRYRUN|SKIP)\]/);
    if (m) return m[1];
    const st = String((step && step.status) || "");
    if (st === "passed") return "PASS";
    if (st === "failed") return "FAIL";
    if (st === "stub") return "BLOCKED";
    return "";
  }

  function sceneTitleBrief(title) {
    const t = String(title || "").trim();
    const m = t.match(/^(BS-\d+(?:\/\d+)*)/);
    if (m) return m[1];
    return t.length > 16 ? t.slice(0, 16) : t || "—";
  }

  function sceneStateView(step) {
    const es = engineStateOf(step);
    if (es === "BLOCKED") return { cls: "warn", zh: "阻断" };
    if (es === "DRYRUN") return { cls: "warn", zh: "预演" };
    if (es === "SKIP") return { cls: "warn", zh: "不判定" };
    if (es === "FAIL" || step.status === "failed") return { cls: "bad", zh: "失败" };
    if (es === "PASS" || step.status === "passed") return { cls: "ok", zh: "通过" };
    const st = String(step.status || "pending");
    return { cls: "warn", zh: zhMap(ZH.status, st, st) };
  }

  function isV1reg(id) {
    return String(id || "").startsWith("v1reg_");
  }

  function retryBadge(run) {
    const n = Number((run && run.autoRetryCount) || 0);
    const max = Number((run && run.retryMax) || 3);
    if (!n) return "";
    return `<span class="ac-badge-retry" title="自动重试 ${n}/${max}">重试 ${n}/${max}</span>`;
  }

  function engineLabel(code) {
    return zhWithCode(zhMap(ZH.engine, code), code);
  }

  function wiringTag(code) {
    const c = String(code || "");
    const zh = zhMap(ZH.wiring, c, c || "—");
    const cls = c === "stub" ? "stub" : "passed";
    return `<span class="ac-tag ${cls}" title="${esc(c)}">${esc(zh)}${
      c ? ` <span class="ac-code-inline">${esc(c)}</span>` : ""
    }</span>`;
  }

  function targetLabel(code) {
    return zhWithCode(zhMap(ZH.target, code), code);
  }

  function sourceLabel(code) {
    return zhWithCode(zhMap(ZH.source, code), code);
  }

  function switchTab(name) {
    document.querySelectorAll(".ac-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === name);
    });
    ["overview", "tasks", "pipeline", "data-assert", "settings"].forEach((t) => {
      const el = $(`ac-panel-${t}`);
      if (el) el.classList.toggle("hidden", t !== name);
    });
    if (name === "tasks") {
      if (!taskQueryTouched) {
        const qEl = $("ac-filter-q");
        if (qEl) qEl.value = "";
      }
      loadTasks();
    }
    if (name === "pipeline") loadPipelines();
    if (name === "settings") loadSettings();
    if (name === "data-assert") loadDataAssert();
  }

  function reportUrl(runId) {
    return `/auto-control/report/${encodeURIComponent(runId)}`;
  }

  function renderAlerts(health) {
    const box = $("ac-alerts");
    const alerts = (health && health.alerts) || [];
    if (!alerts.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = alerts.map((a) => `<div>· ${esc(a)}</div>`).join("");
  }

  function renderQueue(queue) {
    const el = $("ac-queue");
    if (!queue || !queue.length) {
      el.textContent = "暂无排队任务";
      return;
    }
    el.innerHTML = queue
      .map(
        (q, i) =>
          `<div class="ac-queue-item">#${i + 1} <code class="ac-code">${esc(q.id)}</code> · ${targetLabel(
            q.target
          )} · ${esc(q.queuedAt || "")}</div>`
      )
      .join("");
  }

  function bizVarsOf(run) {
    if (run && Array.isArray(run.displayVars) && run.displayVars.length) return run.displayVars;
    return [];
  }

  function renderBizVars(run, elId) {
    const el = $(elId);
    if (!el) return;
    const vars = bizVarsOf(run);
    if (!vars.length) {
      el.innerHTML = "<span class='hint'>暂无业务参数</span>";
      return;
    }
    const prefer = new Set(["game", "promote", "payAmount", "withdrawAmount", "account", "guildLogin", "adminLogin", "payOrder"]);
    const list = vars.filter((v) => prefer.has(v.key)).concat(vars.filter((v) => !prefer.has(v.key)));
    el.innerHTML = list
      .map(
        (v) => `<div class="ac-biz-item"><div class="l">${esc(v.label || "")}</div><div class="v">${esc(v.value || "—")}</div></div>`
      )
      .join("");
  }

  function bizBrief(run) {
    const vars = bizVarsOf(run);
    const get = (k) => {
      const hit = vars.find((v) => v.key === k);
      return hit && hit.value && hit.value !== "—" ? hit.value : "";
    };
    const parts = [get("game"), get("promote"), get("payAmount") ? `充${get("payAmount")}` : "", get("withdrawAmount") && !String(get("withdrawAmount")).includes("档") ? `提${get("withdrawAmount")}` : ""].filter(Boolean);
    if (parts.length) return parts.join(" · ");
    const m = (run && run.metrics) || {};
    const o = (run && run.options) || {};
    if (m.page || o.page) return m.page || o.page;
    const bits = [
      m.gameName || o.gameName || (m.gameId || o.gameId ? `游戏${m.gameId || o.gameId}` : ""),
      m.promoteAccount || o.promoteAccount || "",
      m.payAmount != null ? `充¥${m.payAmount}` : "",
      m.withdrawAmount != null ? `提¥${m.withdrawAmount}` : "",
    ].filter(Boolean);
    return bits.join(" · ") || "—";
  }

  function renderCurrent(cur) {
    const el = $("ac-current");
    const card = el.closest(".ac-card-current");
    if (!cur) {
      if (card) card.classList.remove("is-live");
      el.innerHTML = "空闲 — 等待新任务";
      watchingRunId = "";
      renderBizVars(null, "ac-biz-vars");
      return;
    }
    watchingRunId = cur.id || "";
    if (card) card.classList.toggle("is-live", cur.status === "running");
    const step = (cur.steps || []).find((s) => s.id === cur.currentStepId) || {};
    el.innerHTML = `
      <div><strong>${esc(cur.pipelineName || cur.pipelineId)}</strong> · ${targetLabel(cur.target)}</div>
      <div>运行 ID：<code class="ac-code">${esc(cur.id)}</code> ${statusTag(cur.status)} ${retryBadge(cur)}</div>
      <div>当前步骤：${esc(cur.currentStepId || "—")} ${esc(step.title || "")}</div>
      <div>执行方式：${engineLabel(step.engine || "")} · 开始：${esc(cur.startedAt || "")}</div>
      ${cur.error ? `<div class="ac-error">${esc(cur.error)}</div>` : ""}
    `;
  }

  function renderMetrics(stats) {
    const t = (stats && stats.today) || {};
    $("ac-metrics").innerHTML = `
      <div class="ac-metric ok"><div class="n">${t.success || 0}</div><div class="l">今日成功</div></div>
      <div class="ac-metric bad"><div class="n">${t.failed || 0}</div><div class="l">今日失败</div></div>
      <div class="ac-metric"><div class="n">${t.queued || 0}</div><div class="l">排队中</div></div>
      <div class="ac-metric"><div class="n">${t.active || 0}</div><div class="l">进行中</div></div>
    `;
  }

  function renderSteps(run, pipeline) {
    const el = $("ac-steps");
    const defs = (pipeline && pipeline.steps) || [];
    const byId = {};
    (run && run.steps ? run.steps : []).forEach((s) => {
      byId[s.id] = s;
    });
    const list = (run && run.steps && run.steps.length ? run.steps : defs).map((s) => {
      const live = byId[s.id] || s;
      return live;
    });
    if (!list.length) {
      el.innerHTML = "<span class='hint'>暂无步骤</span>";
      return;
    }
    el.innerHTML = list
      .map((s) => {
        const st = s.status || (s.wiring === "stub" ? "stub" : "pending");
        const stZh = zhMap(ZH.status, st, st);
        const engZh = zhMap(ZH.engine, s.engine, s.engine || "");
        const pulse = st === "running" ? `<span class="ac-step-pulse" title="执行中"></span>` : "";
        return `<div class="ac-step ${esc(st)}" title="${esc(s.error || s.detail || "")}">
          ${pulse}
          ${(s.title || "").startsWith("场景") ? "" : `<div class="id">${esc(s.id)}</div>`}
          <div>${esc(s.title)}</div>
          <div class="st">${esc(stZh)}${st && stZh !== st ? ` <span class="ac-code-inline">${esc(st)}</span>` : ""} · ${esc(
            engZh || "—"
          )}${s.engine && engZh !== s.engine ? ` <span class="ac-code-inline">${esc(s.engine)}</span>` : ""}</div>
        </div>`;
      })
      .join("");
  }

  function renderThroughput(rows) {
    const el = $("ac-throughput");
    if (!el) return;
    const data = rows || [];
    el.innerHTML = data
      .map((r) => {
        const ok = r.success || 0;
        const bad = r.failed || 0;
        const sum = ok + bad;
        const okW = sum ? Math.round((100 * ok) / sum) : 0;
        const badW = sum ? 100 - okW : 0;
        const segs = [
          okW ? `<i class="ok" style="width:${okW}%"></i>` : "",
          badW ? `<i class="bad" style="width:${badW}%"></i>` : "",
        ].join("");
        return `<div class="ac-bar-row" title="成功 ${ok} · 失败 ${bad}"><span>${esc(r.hour)}</span>
          <div class="ac-bar">${segs}</div>
          <span>${ok}/${bad}</span></div>`;
      })
      .join("");
  }

  function projLabel(run) {
    const id = String((run && (run.pipelineId || run.id)) || "");
    if (id.startsWith("v1reg")) return "新商务";
    if (/^(money|coin|guild)/.test(id)) return "充值提现";
    if (id.startsWith("oa_inner")) return "OA";
    return "其他";
  }

  function renderSceneCard() {
    const el = $("ac-scene-steps");
    const sub = $("ac-scene-sub");
    const titleEl = $("ac-scene-title");
    if (!el) return;
    Promise.all([
      api("/api/auto-control/pipelines"),
      api("/api/auto-control/runs?limit=50"),
    ])
      .then(([pipes, data]) => {
        const pipe = ((pipes && pipes.pipelines) || []).find((p) => p.id === "v1reg_scene_full");
        if (titleEl && pipe && pipe.name) titleEl.textContent = pipe.name;
        const runs = (data && data.runs) || [];
        const last = runs.find((r) => r.pipelineId === "v1reg_scene_full");
        if (!last) {
          el.innerHTML = `<span class="hint">尚未运行；点右上「跑一次全量回归」执行</span>`;
          return;
        }
        const t = last.finishedAt || last.startedAt || "";
        const stZh = last.stopReason === "stub_stop" ? "阻断" : zhMap(ZH.status, last.status, last.status);
        if (sub) sub.textContent = `最近：${t} · ${stZh} · ${last.pipelineName || ""}`;
        const rows = (last.steps || [])
          .map((s) => {
            const view = sceneStateView(s);
            return `<div class="sc-row"><span class="${view.cls}">●</span><span title="${esc(s.title || "")}">${esc(
              sceneTitleBrief(s.title)
            )}</span><span class="st ${view.cls}">${esc(view.zh)}</span></div>`;
          })
          .join("");
        el.innerHTML = rows || `<span class="hint">尚未运行</span>`;
      })
      .catch(() => {});
  }

  async function enqueueSceneFull() {
    const btn = $("ac-run-scene-full");
    try {
      const h = await api("/api/auto-control/health");
      const writeOn = !!(h && h.v1reg && h.v1reg.writeEnabled);
      if (writeOn) {
        const alerts = ((h.v1reg && h.v1reg.alerts) || []).join("\n") || "将执行真实业务写操作（绑定/审核/建渠道/改设置后恢复）";
        if (!confirm(`写闸门已开启，确认跑一次全量回归？\n\n${alerts}`)) return;
      }
    } catch (_) {
      /* 预检失败不挡手动确认 */
    }
    if (btn) { btn.disabled = true; btn.textContent = "入队中…"; }
    try {
      const out = await api("/api/auto-control/runs", {
        method: "POST",
        body: { profile: "A", target: "lx", pipelineId: "v1reg_scene_full", options: {}, source: "manual" },
      });
      if (!out.ok) { alert(out.error || "入队失败"); return; }
      await refreshOverview();
      renderSceneCard();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "▶ 跑一次全量回归"; }
    }
  }

  function renderStats(stats) {
    const el = $("ac-stats");
    const rows = [
      ["当日", stats.today],
      ["本周", stats.week],
      ["本月", stats.month],
    ];
    el.innerHTML = `<table><thead><tr><th></th><th>成功</th><th>失败</th><th>进行中</th><th>排队</th><th>成功率</th></tr></thead><tbody>
      ${rows
        .map(([name, s]) => {
          s = s || {};
          return `<tr><td>${name}</td><td>${s.success || 0}</td><td>${s.failed || 0}</td><td>${s.active || 0}</td><td>${s.queued || 0}</td><td>${s.successRate || 0}%</td></tr>`;
        })
        .join("")}
    </tbody></table>`;
  }

  function renderRisk(rows) {
    const el = $("ac-risk");
    if (!el) return;
    const data = rows || [];
    const max = Math.max(1, ...data.map((r) => r.failed || 0));
    el.innerHTML = data
      .map((r) => {
        const w = Math.round((100 * (r.failed || 0)) / max);
        const dayShort = String(r.day || "").slice(5);
        return `<div class="ac-bar-row" data-day="${esc(r.day)}" style="cursor:pointer" title="点此筛失败">
          <span>${esc(dayShort)}</span>
          <div class="ac-bar"><i class="bad" style="width:${w}%"></i></div>
          <span>${r.failed || 0}</span></div>`;
      })
      .join("");
    el.querySelectorAll("[data-day]").forEach((node) => {
      node.onclick = () => {
        switchTab("tasks");
        $("ac-filter-status").value = "failed";
        loadTasks({ day: node.getAttribute("data-day"), resetPage: true });
      };
    });
  }

  let pipeItems = [];
  let pipeSort = "created";
  let pipeSchedules = {};
  let focusedPipeId = "";
  let pipePage = 1;
  let pipePageSize = 10;

  let pipeModalId = "";

  function pipeSupportsStepPick(pipelineId, pipe) {
    if (!pipelineId || (pipe && pipe.placeholder)) return false;
    // OA 仍用每行「执行」单页跑；其它可跑流水线支持勾选子集
    return pipelineId !== "oa_inner_tab_keep_filter";
  }

  function pipeStepsHtml(steps, pipelineId, opts) {
    const canRun = pipelineId === "oa_inner_tab_keep_filter";
    const canCheck = !!(opts && opts.selectable);
    return (steps || [])
      .map((s) => {
        const apis = (s.apis || [])
          .map((a) => {
            const method = a.method || "";
            const path = a.path || "";
            const tab = method === "页面tab" ? " is-tab" : "";
            const assert = method === "断言" ? " is-assert" : "";
            const known = { 通过: "passed", 未通过: "failed", 跳过: "skipped", 没跑成: "failed" };
            const tail = known[path]
              ? `<span class="ac-tag ${known[path]}">${esc(path)}</span>`
              : path
                ? `<code class="ac-code">${esc(path)}</code>`
                : "";
            return `<div class="ac-pipe-api${tab}${assert}"><span class="ac-tag">${esc(method)}</span> ${esc(
              a.name || ""
            )} ${tail}</div>`;
          })
          .join("");
        const runBtn = canRun
          ? `<button type="button" class="btn btn-sm ac-step-run" data-oa-step="${esc(s.id)}">执行</button>`
          : "";
        const check = canCheck
          ? `<label class="ac-pipe-step-check" title="勾选后跑一次"><input type="checkbox" data-pipe-step="${esc(
              s.id
            )}" checked></label>`
          : "";
        const rowClass = ["ac-pipe-row", runBtn ? "has-run" : "", check ? "has-check" : ""]
          .filter(Boolean)
          .join(" ");
        return `<div class="ac-pipe-block">
        <div class="${rowClass}">
          ${check}
          <strong>${esc(s.id)}</strong>
          <span>${esc(s.title)}</span>
          <span class="ac-pipe-engine">${engineLabel(s.engine)}</span>
          ${wiringTag(s.wiring)}
          ${runBtn}
        </div>
        ${apis ? `<div class="ac-pipe-apis">${apis}</div>` : ""}
      </div>`;
      })
      .join("");
  }

  function selectedPipeStepIds() {
    return Array.from(document.querySelectorAll("#ac-pipe-modal-steps [data-pipe-step]:checked"))
      .map((el) => el.getAttribute("data-pipe-step") || "")
      .filter(Boolean);
  }

  function syncPipeCheckAll() {
    const all = $("ac-pipe-check-all");
    const boxes = Array.from(document.querySelectorAll("#ac-pipe-modal-steps [data-pipe-step]"));
    if (!all || !boxes.length) return;
    const on = boxes.filter((b) => b.checked).length;
    all.checked = on === boxes.length;
    all.indeterminate = on > 0 && on < boxes.length;
    const hint = $("ac-pipe-check-hint");
    if (hint) hint.textContent = `已选 ${on}/${boxes.length} 步 · 点「跑一次」只跑勾选步骤`;
  }

  function pipePageCount() {
    return Math.max(1, Math.ceil(pipeItems.length / pipePageSize) || 1);
  }

  function pipePageNums(page, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const marks = new Set([1, pages, page]);
    for (let i = page - 1; i <= page + 1; i += 1) {
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

  function renderPipePager() {
    const box = $("ac-pipe-pager");
    if (!box) return;
    const total = pipeItems.length;
    if (!total) {
      box.innerHTML = "";
      return;
    }
    const pages = pipePageCount();
    const page = pipePage;
    const sizes = [10, 20, 50]
      .map((n) => `<option value="${n}"${n === pipePageSize ? " selected" : ""}>${n}</option>`)
      .join("");
    const nums = pipePageNums(page, pages)
      .map((n) =>
        n === "…"
          ? `<span class="ac-page-ellipsis">…</span>`
          : `<button type="button" class="ac-page-num${n === page ? " is-on" : ""}" data-pipe-page="${n}">${n}</button>`
      )
      .join("");
    box.innerHTML = `
      <span class="hint">共 ${total} 条 · 第 ${page} / ${pages} 页</span>
      <button type="button" class="btn btn-sm" data-pipe-nav="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <div class="ac-page-nums">${nums}</div>
      <button type="button" class="btn btn-sm" data-pipe-nav="next" ${page >= pages ? "disabled" : ""}>下一页</button>
      <label class="hint ac-page-jump">跳转到
        <input id="ac-pipe-jump" type="number" min="1" max="${pages}" value="${page}">
        <button type="button" class="btn btn-sm" id="ac-pipe-jump-btn">跳转</button>
      </label>
      <label class="hint">每页
        <select id="ac-pipe-size">${sizes}</select>
      </label>`;
    box.querySelectorAll("[data-pipe-page]").forEach((btn) => {
      btn.onclick = () => gotoPipePage(Number(btn.getAttribute("data-pipe-page")));
    });
    const prev = box.querySelector("[data-pipe-nav='prev']");
    const next = box.querySelector("[data-pipe-nav='next']");
    if (prev) prev.onclick = () => gotoPipePage(page - 1);
    if (next) next.onclick = () => gotoPipePage(page + 1);
    const jumpBtn = $("ac-pipe-jump-btn");
    if (jumpBtn) jumpBtn.onclick = jumpPipePage;
    const jump = $("ac-pipe-jump");
    if (jump) jump.onkeydown = (ev) => { if (ev.key === "Enter") jumpPipePage(); };
    const size = $("ac-pipe-size");
    if (size) {
      size.onchange = () => {
        pipePageSize = Number(size.value) || 10;
        pipePage = 1;
        renderPipeList();
      };
    }
  }

  function gotoPipePage(n) {
    const pages = pipePageCount();
    let page = Number(n) || 1;
    if (page < 1) page = 1;
    if (page > pages) page = pages;
    pipePage = page;
    renderPipeList();
  }

  function jumpPipePage() {
    const el = $("ac-pipe-jump");
    gotoPipePage(el ? el.value : pipePage);
  }

  function renderPipeList() {
    const body = $("ac-pipe-body");
    if (!body) return;
    const pages = pipePageCount();
    if (pipePage > pages) pipePage = pages;
    const start = (pipePage - 1) * pipePageSize;
    const rows = sortedPipeItems().slice(start, start + pipePageSize);
    if (!rows.length) {
      body.innerHTML = `<p class="hint">暂无流水线</p>`;
      renderPipePager();
      return;
    }
    body.innerHTML = rows
      .map((pipe) => {
        const tag = pipe.placeholder ? `<span class="ac-day-tag">占位</span>` : "";
        const runBtn = pipe.placeholder
          ? ""
          : `<button class="btn btn-sm primary" type="button" data-pipe-run="${esc(pipe.id || "")}">跑一次</button>`;
        const steps = Number(pipe.stepCount != null ? pipe.stepCount : (pipe.steps || []).length);
        const stub = Number(pipe.stubCount || 0);
        const sch = schedOf(pipe.id);
        const scheduled = !!(sch.configured && sch.enabled);
        const when = scheduled ? sch.time : sch.configured ? `${sch.time} 未启用` : "未定时";
        const note = pipe.placeholder && pipe.note ? `<div class="ac-pipe-note">${esc(pipe.note)}</div>` : "";
        const kind = pipe.placeholder ? "is-placeholder" : "is-runnable";
        return `<article class="ac-pipe-card ${kind}${scheduled ? " is-scheduled" : ""}">
          <div class="ac-pipe-main">
            <div class="ac-pipe-idline">
              <div class="ac-pipe-name">${tag}${esc(pipe.name || "未命名流水线")}</div>
              <code class="ac-code">${esc(pipe.id || "")}</code>
              ${note}
            </div>
            <div class="ac-pipe-when">${esc(when)}</div>
            <div class="ac-pipe-meta"><span>步骤 ${steps}</span><span>未接线 ${stub}</span></div>
            <div class="ac-pipe-ops">
              <button class="btn btn-sm" type="button" data-pipe-open="${esc(pipe.id || "")}">详情</button>
              ${runBtn}
            </div>
          </div>
          ${schedRow(pipe)}
        </article>`;
      })
      .join("");
    body.querySelectorAll("[data-pipe-open]").forEach((btn) => {
      btn.onclick = () => openPipeModal(btn.getAttribute("data-pipe-open"));
    });
    body.querySelectorAll("[data-pipe-run]").forEach((btn) => {
      btn.onclick = () => startPipeline(btn.getAttribute("data-pipe-run"));
    });
    body.querySelectorAll("[data-sched-save]").forEach((btn) => {
      btn.onclick = () => savePipeSchedule(btn.getAttribute("data-sched-save"));
    });
    renderPipePager();
  }

  function sortedPipeItems() {
    const items = pipeItems.slice();
    if (pipeSort !== "time") {
      return items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }
    return items.sort((a, b) => {
      const ta = pipeSchedules[a.id] && pipeSchedules[a.id].configured ? pipeSchedules[a.id].time : "99:99";
      const tb = pipeSchedules[b.id] && pipeSchedules[b.id].configured ? pipeSchedules[b.id].time : "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function schedOf(id) {
    return pipeSchedules[id] || { enabled: false, time: "09:00", target: "lx", profile: "B", enablePayout: true };
  }

  function schedRow(pipe) {
    const sch = schedOf(pipe.id);
    const mode = scheduleModeFrom(sch.profile, sch.enablePayout);
    const range = pipe.placeholder
      ? ""
      : `<label class="bf-field"><span>范围</span>
          <select data-sched-mode="${esc(pipe.id)}">
            <option value="main"${mode === "main" ? " selected" : ""}>整条主链</option>
            <option value="recharge"${mode === "recharge" ? " selected" : ""}>仅充值～分佣</option>
            <option value="settle"${mode === "settle" ? " selected" : ""}>结算～提现</option>
          </select>
        </label>`;
    const extra = pipe.placeholder ? "" : sch.lastError || "";
    return `<div class="ac-pipe-sched">
        <label class="ac-check"><input type="checkbox" data-sched-on="${esc(pipe.id)}"${sch.enabled ? " checked" : ""}> 定时</label>
        <label class="bf-field"><span>执行时间</span><input type="time" data-sched-time="${esc(pipe.id)}" value="${esc(sch.time || "09:00")}"></label>
        <label class="bf-field"><span>平台</span>
          <select data-sched-target="${esc(pipe.id)}">
            <option value="lx"${sch.target === "lx" ? " selected" : ""}>龙翔</option>
            <option value="yq"${sch.target === "yq" ? " selected" : ""}>游趣</option>
            <option value="hw"${sch.target === "hw" ? " selected" : ""}>汇玩</option>
          </select>
        </label>
        ${range}
        <button class="btn btn-sm" type="button" data-sched-save="${esc(pipe.id)}">保存定时</button>
        <span class="hint">${esc(extra)}</span>
      </div>`;
  }

  async function savePipeSchedule(id) {
    const on = document.querySelector(`[data-sched-on="${id}"]`);
    const time = document.querySelector(`[data-sched-time="${id}"]`);
    const target = document.querySelector(`[data-sched-target="${id}"]`);
    const modeEl = document.querySelector(`[data-sched-mode="${id}"]`);
    const pipe = pipeItems.find((item) => item.id === id);
    const prev = schedOf(id);
    const opts = modeEl
      ? scheduleOptsFromMode(modeEl.value)
      : { profile: prev.profile || "A", enablePayout: false };
    const res = await api("/api/auto-control/schedule", {
      method: "PUT",
      body: {
        pipelineId: id,
        enabled: !!(on && on.checked),
        time: (time && time.value) || "09:00",
        target: (target && target.value) || prev.target || "lx",
        profile: pipe && pipe.placeholder ? "A" : opts.profile,
        enablePayout: pipe && pipe.placeholder ? false : opts.enablePayout,
      },
    });
    if (!res.ok) {
      alert(res.error || "保存定时失败");
      return;
    }
    applyScheduleItems(res.items);
    renderPipeList();
    await refreshOverview();
  }

  function applyScheduleItems(items) {
    pipeSchedules = {};
    (items || []).forEach((item) => {
      if (item && item.pipelineId) pipeSchedules[item.pipelineId] = item;
    });
  }

  function openPipeModal(id) {
    const pipe = pipeItems.find((item) => item.id === id) || pipeItems[0];
    if (!pipe) return;
    pipeModalId = pipe.id || "";
    $("ac-pipe-modal-title").textContent = pipe.name || "流水线详情";
    const stubN = Number(pipe.stubCount || 0);
    $("ac-pipe-modal-desc").textContent =
      pipe.id === "oa_inner_tab_keep_filter"
        ? "点某一行的执行，只跑这一页，并先点击进入该页面。外面的跑一次会逐页做。默认在桌面分身里点（不抢主桌面鼠标）：设置里点「启动分身」，并在分身窗口里打开 OA、进到工作台、最大化。"
        : pipe.placeholder
          ? pipe.note || "占位，接口稍后接入"
          : stubN
            ? `未接线 ${stubN} 步`
            : "步骤均已接线";
    const selectable = pipeSupportsStepPick(pipe.id, pipe);
    const toolbar = $("ac-pipe-modal-toolbar");
    if (toolbar) toolbar.classList.toggle("hidden", !selectable);
    const runBtn = $("ac-pipe-modal-run");
    if (runBtn) {
      runBtn.classList.toggle("hidden", !!pipe.placeholder);
      runBtn.disabled = !!pipe.placeholder;
    }
    const stepsEl = $("ac-pipe-modal-steps");
    stepsEl.innerHTML = pipeStepsHtml(pipe.steps, pipe.id, { selectable });
    stepsEl.querySelectorAll("[data-oa-step]").forEach((btn) => {
      btn.onclick = () => startPipeStep(pipe.id, btn.getAttribute("data-oa-step"));
    });
    stepsEl.querySelectorAll("[data-pipe-step]").forEach((box) => {
      box.onchange = () => syncPipeCheckAll();
    });
    const checkAll = $("ac-pipe-check-all");
    if (checkAll) {
      checkAll.checked = true;
      checkAll.indeterminate = false;
      checkAll.onchange = () => {
        const on = !!checkAll.checked;
        stepsEl.querySelectorAll("[data-pipe-step]").forEach((box) => {
          box.checked = on;
        });
        syncPipeCheckAll();
      };
    }
    if (selectable) syncPipeCheckAll();
    $("ac-pipe-modal-doc").innerHTML =
      `文档：<a href="/api/auto-qa/requirements" target="_blank" rel="noopener">业务自动化需求</a>` +
      ` · 步骤细节见仓库 <code>workbench/docs/接口自动化步骤-充值到提现-框架.md</code>` +
      ` · 灰色码为程序内部标识（<code>wired</code>=已接线、<code>stub</code>=未接线）`;
    $("ac-pipe-modal").classList.remove("hidden");
  }

  function closePipeModal() {
    const el = $("ac-pipe-modal");
    if (el) el.classList.add("hidden");
    pipeModalId = "";
  }

  async function loadPipelines() {
    const data = await api("/api/auto-control/pipelines");
    const body = $("ac-pipe-body");
    if (!data || !data.ok) {
      pipeItems = [];
      if (body) body.innerHTML = `<p class="hint">${esc((data && data.error) || "流水线加载失败")}</p>`;
      renderPipePager();
      return;
    }
    pipeItems = data.pipelines || [];
    const sched = await api("/api/auto-control/schedule");
    if (sched && sched.ok) applyScheduleItems(sched.items);
    renderPipeList();
  }

  async function refreshOverview() {
    const data = await api("/api/auto-control/overview");
    if (!data.ok) {
      $("ac-alerts").classList.remove("hidden");
      $("ac-alerts").textContent = data.error || "加载总览失败";
      return;
    }
    overviewCache = data;
    const timeEl = $("ac-time");
    if (timeEl) timeEl.textContent = data.time || "—";
    renderAlerts(data.health);
    renderQueue(data.queue);
    renderCurrent(data.current);
    renderMetrics(data.stats);
    renderDayline();
    renderSceneCard();
    renderStats(data.stats);
    renderRisk(data.risk7d);
    renderHotspots(data.hotspots);
    const latest = (data.latestRun && data.latestRun.id) ? data.latestRun : null;
    const lastEl = $("ac-ov-last");
    if (lastEl) {
      lastEl.textContent = latest
        ? `最近运行：${latest.pipelineName || latest.pipelineId || ""} · ${(latest.finishedAt || latest.startedAt || "").slice(5, 16)} · ${latest.status}`
        : "最近运行：—";
    }
    const pipePanel = $("ac-panel-pipeline");
    const editing = document.activeElement && pipePanel && pipePanel.contains(document.activeElement);
    if (pipePanel && !pipePanel.classList.contains("hidden") && !editing) loadPipelines();
  }

  function renderDayline() {
    const el = $("ac-dayline");
    if (!el) return;
    const plan = (overviewCache && overviewCache.dayPlan) || [];
    if (!plan.length) {
      el.innerHTML = `<span class="hint">还没有启用定时的流水线。到「流水线」页，在每条后面设时间并勾选定时。</span>`;
      return;
    }
    el.innerHTML = plan
      .map((item) => {
        const on = item.id === focusedPipeId ? " is-on" : "";
        const tag = item.placeholder ? `<span class="ac-day-tag">占位</span>` : "";
        return `<button type="button" class="ac-day-chip${on}" data-day-focus="${esc(item.id)}">
          <div class="ac-day-time">${esc(item.time || "")}</div>
          <div class="ac-day-name">${esc(item.name || "")}</div>
          ${tag}
        </button>`;
      })
      .join("");
    el.querySelectorAll("[data-day-focus]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-day-focus") || "";
        focusedPipeId = focusedPipeId === id ? "" : id;
        renderDayline();
        renderFocus();
      };
    });
  }

  function renderFocus() {
    if (!$("ac-steps")) return;
    const title = $("ac-steps-title");
    const hint = $("ac-steps-hint");
    const bizHint = $("ac-biz-hint");
    const vars = $("ac-biz-vars");
    const catalog = (overviewCache && overviewCache.catalog) || [];
    const pipe = catalog.find((item) => item.id === focusedPipeId);
    if (!pipe) {
      if (title) title.textContent = "流水线步骤";
      if (hint) hint.textContent = "点上面一条流水线查看步骤";
      const steps = $("ac-steps");
      if (steps) steps.innerHTML = `<span class="hint">未选中流水线</span>`;
      if (bizHint) bizHint.textContent = "焦点不在流水线上，这里不显示";
      if (vars) vars.innerHTML = "";
      return;
    }
    if (title) title.textContent = pipe.name || "流水线步骤";
    if (hint) {
      hint.textContent = pipe.note || (pipe.placeholder ? "占位，接口稍后接入" : "充值 → 分佣 → 结算 → 提现 → 审核 → 打款");
    }
    const current = overviewCache && overviewCache.current;
    const live = current && current.pipelineId === pipe.id ? current : null;
    renderSteps(live, pipe);
    const latestMap = (overviewCache && overviewCache.latestByPipeline) || {};
    const bizRun = live && live.displayVars ? live : latestMap[pipe.id];
    if (bizHint) {
      bizHint.textContent = pipe.placeholder
        ? "占位流水线还没有业务参数"
        : "游戏 / 会长 / 充值 / 提现 / 登录账号（密码不展示明文）";
    }
    renderBizVars(bizRun, "ac-biz-vars");
  }

  function renderHotspots(items) {
    const el = $("ac-hotspots");
    if (!el) return;
    const list = items || [];
    if (!list.length) {
      el.innerHTML = `<span class="hint">近 7 日暂无失败热点</span>`;
      return;
    }
    el.innerHTML = list
      .map((h) => {
        const title = `${h.stepId || ""}${h.stepTitle ? " · " + h.stepTitle : ""}`;
        return `<div class="ac-hot-row" data-step="${esc(h.stepId || "")}" data-q="${esc(h.fingerprint || "")}" title="点击筛选失败任务">
          <span class="cnt">×${esc(String(h.count || 0))}</span>
          <span class="proj">${esc(projLabel({ pipelineId: h.pipelineId, id: h.pipelineId }))}</span>
          <div>
            <strong>${esc(title)}</strong>
            <div class="err">${esc(h.sampleError || "")}</div>
          </div>
          <span class="hint">${esc(String(h.lastAt || "").slice(5, 16))}</span>
        </div>`;
      })
      .join("");
    el.querySelectorAll("[data-step]").forEach((node) => {
      node.onclick = () => {
        switchTab("tasks");
        $("ac-filter-status").value = "failed";
        const qEl = $("ac-filter-q");
        if (qEl) {
          taskQueryTouched = true;
          qEl.value = node.getAttribute("data-q") || node.getAttribute("data-step") || "";
        }
        loadTasks({ stepId: node.getAttribute("data-step") || "", resetPage: true });
      };
    });
  }

  let taskQueryTouched = false;
  let taskPage = 1;
  let taskPageSize = 10;
  let taskTotal = 0;
  let taskExtra = {};

  function taskQuery() {
    const el = $("ac-filter-q");
    if (!el || !taskQueryTouched) return "";
    return el.value.trim();
  }

  function taskPageCount() {
    return Math.max(1, Math.ceil(taskTotal / taskPageSize) || 1);
  }

  function renderTasksPager() {
    const box = $("ac-tasks-pager");
    if (!box) return;
    if (!taskTotal) {
      box.innerHTML = "";
      return;
    }
    const pages = taskPageCount();
    const page = taskPage;
    const sizes = [10, 20, 50]
      .map((n) => `<option value="${n}"${n === taskPageSize ? " selected" : ""}>${n}</option>`)
      .join("");
    const nums = pipePageNums(page, pages)
      .map((n) =>
        n === "…"
          ? `<span class="ac-page-ellipsis">…</span>`
          : `<button type="button" class="ac-page-num${n === page ? " is-on" : ""}" data-task-page="${n}">${n}</button>`
      )
      .join("");
    box.innerHTML = `
      <span class="hint">共 ${taskTotal} 条 · 第 ${page} / ${pages} 页</span>
      <button type="button" class="btn btn-sm" data-task-nav="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <div class="ac-page-nums">${nums}</div>
      <button type="button" class="btn btn-sm" data-task-nav="next" ${page >= pages ? "disabled" : ""}>下一页</button>
      <label class="hint ac-page-jump">跳转到
        <input id="ac-task-jump" type="number" min="1" max="${pages}" value="${page}">
        <button type="button" class="btn btn-sm" id="ac-task-jump-btn">跳转</button>
      </label>
      <label class="hint">每页
        <select id="ac-task-size">${sizes}</select>
      </label>`;
    box.querySelectorAll("[data-task-page]").forEach((btn) => {
      btn.onclick = () => gotoTaskPage(Number(btn.getAttribute("data-task-page")));
    });
    const prev = box.querySelector("[data-task-nav='prev']");
    const next = box.querySelector("[data-task-nav='next']");
    if (prev) prev.onclick = () => gotoTaskPage(page - 1);
    if (next) next.onclick = () => gotoTaskPage(page + 1);
    const jumpBtn = $("ac-task-jump-btn");
    if (jumpBtn) jumpBtn.onclick = jumpTaskPage;
    const jump = $("ac-task-jump");
    if (jump) jump.onkeydown = (ev) => { if (ev.key === "Enter") jumpTaskPage(); };
    const size = $("ac-task-size");
    if (size) {
      size.onchange = () => {
        taskPageSize = Number(size.value) || 10;
        taskPage = 1;
        loadTasks(taskExtra);
      };
    }
  }

  function gotoTaskPage(n) {
    const pages = taskPageCount();
    let page = Number(n) || 1;
    if (page < 1) page = 1;
    if (page > pages) page = pages;
    taskPage = page;
    loadTasks(taskExtra);
  }

  function jumpTaskPage() {
    const el = $("ac-task-jump");
    gotoTaskPage(el ? el.value : taskPage);
  }

  async function loadTasks(extra) {
    if (extra && (extra.resetPage || extra.day || extra.stepId)) {
      taskPage = 1;
    }
    if (extra && typeof extra === "object") {
      taskExtra = {
        day: extra.day || taskExtra.day || "",
        stepId: extra.stepId || (extra.resetPage ? "" : taskExtra.stepId) || "",
      };
      if (extra.day != null && extra.day === "") taskExtra.day = "";
      if (extra.stepId != null && extra.stepId === "" && extra.resetPage) taskExtra.stepId = "";
    }
    const statusRaw = $("ac-filter-status").value;
    const q = taskQuery();
    const day = (extra && extra.day != null ? extra.day : taskExtra.day) || "";
    const stepId = (extra && extra.stepId != null ? extra.stepId : taskExtra.stepId) || "";
    const offset = (taskPage - 1) * taskPageSize;
    const qs = new URLSearchParams({
      limit: String(taskPageSize),
      offset: String(offset),
    });
    if (statusRaw === "stub_stop") {
      qs.set("stopReason", "stub_stop");
    } else if (statusRaw === "failed") {
      qs.set("status", "failed");
      qs.set("excludeStopReason", "stub_stop");
    } else if (statusRaw) {
      qs.set("status", statusRaw);
    }
    if (q) qs.set("q", q);
    if (day) qs.set("day", day);
    if (stepId) qs.set("stepId", stepId);
    const data = await api(`/api/auto-control/runs?${qs}`);
    const body = $("ac-tasks-body");
    if (!data.ok) {
      body.innerHTML = `<tr><td colspan="8" class="hint">${esc(data.error || "加载失败")}</td></tr>`;
      taskTotal = 0;
      renderTasksPager();
      return;
    }
    taskTotal = Number(data.total || 0);
    const pages = taskPageCount();
    if (taskPage > pages) {
      taskPage = pages;
      return loadTasks(taskExtra);
    }
    const runs = data.runs || [];
    if (!runs.length) {
      body.innerHTML = `<tr><td colspan="8" class="hint">暂无运行记录</td></tr>`;
      renderTasksPager();
      return;
    }
    body.innerHTML = runs
      .map((r) => {
        const t = r.finishedAt || r.startedAt || r.queuedAt || "";
        const shortId = String(r.id || "").replace(/^acr_\d{8}_/, "");
        const brief = bizBrief(r);
        const targetCell = isV1reg(r.pipelineId)
          ? `<span title="新商务不按单平台">—（三平台）</span>`
          : targetLabel(r.target);
        return `<tr>
          <td>${esc(t)}</td>
          <td><a href="#" data-open="${esc(r.id)}" title="${esc(r.id)}"><code class="ac-code">${esc(shortId)}</code></a></td>
          <td>${targetCell}</td>
          <td><div class="ac-biz-brief"><strong>${esc(r.pipelineName || r.pipelineId || "—")}</strong>${brief ? `<div class="hint" title="${esc(brief)}">${esc(brief)}</div>` : ""}</div></td>
          <td>${statusTag(r.status, r)} ${retryBadge(r)}</td>
          <td>${esc(r.currentStepId || "—")}</td>
          <td>${sourceLabel(r.source || "")}</td>
          <td class="ac-col-ops"><div class="ac-ops">
            <button class="btn btn-sm" type="button" data-open="${esc(r.id)}">详情</button>
            <a class="btn btn-sm" href="${reportUrl(r.id)}" target="_blank" rel="noopener">报告</a>
            <button class="btn btn-sm" type="button" data-retry="${esc(r.id)}">重试</button>
          </div></td>
        </tr>`;
      })
      .join("");
    body.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        openDrawer(btn.getAttribute("data-open"));
      };
    });
    body.querySelectorAll("[data-retry]").forEach((btn) => {
      btn.onclick = async () => {
        const res = await api(`/api/auto-control/runs/${encodeURIComponent(btn.getAttribute("data-retry"))}/retry`, {
          method: "POST",
          body: {},
        });
        if (!res.ok) alert(res.error || "重试失败");
        await refreshOverview();
        loadTasks(taskExtra);
      };
    });
    renderTasksPager();
  }

  function collectAssertions(run) {
    const list = [];
    (run.steps || []).forEach((s) => {
      (s.assertions || []).forEach((a) => {
        list.push({
          stepId: s.id,
          stepTitle: s.title,
          name: a.name,
          expected: a.expected,
          actual: a.actual,
          passed: !!a.passed,
        });
      });
    });
    if (!list.length && Array.isArray(run.assertions)) {
      run.assertions.forEach((a) => list.push(a));
    }
    // 旧跑次：用 metrics 兜底展示分佣关键项
    if (!list.length && run.metrics) {
      const m = run.metrics;
      if (m.expectedCommission != null || m.sumMoney != null) {
        list.push({
          stepId: "S6",
          stepTitle: "分佣断言",
          name: "分成金额 sum_money（旧跑次摘要）",
          expected: String(m.expectedCommission ?? "—"),
          actual: String(m.sumMoney ?? "—"),
          passed: run.status === "passed",
        });
      }
      if (m.account) {
        list.push({
          stepId: "S4",
          stepTitle: "玩家注册～下单",
          name: "玩家账号",
          expected: "非空",
          actual: String(m.account),
          passed: true,
        });
      }
      if (m.payOrder) {
        list.push({
          stepId: "S5",
          stepTitle: "模拟支付回调",
          name: "订单号",
          expected: "有订单",
          actual: String(m.payOrder),
          passed: true,
        });
      }
    }
    return list;
  }

  function renderAssertions(run) {
    const list = collectAssertions(run);
    const box = $("ac-drawer-assertions");
    if (!list.length) {
      box.innerHTML =
        "<p class='hint'>本跑次无断言明细。请再跑一次「档 A」以生成期望/实际对照；也可点上方「打开测试报告」。</p>";
      return;
    }
    const passN = list.filter((a) => a.passed).length;
    const failN = list.length - passN;
    box.innerHTML = `<p class="hint">共 ${list.length} 条 · 通过 ${passN} · 失败 ${failN}</p>
      <table class="ac-assert-table"><thead><tr>
        <th>步骤</th><th>断言</th><th>期望</th><th>实际</th><th>结果</th>
      </tr></thead><tbody>
      ${list
        .map(
          (a) => `<tr class="${a.passed ? "pass" : "fail"}">
          <td>${esc(a.stepId || "")}<br><span class="hint">${esc(a.stepTitle || "")}</span></td>
          <td>${esc(a.name || "")}</td>
          <td>${esc(a.expected ?? "")}</td>
          <td>${esc(a.actual ?? "")}</td>
          <td><strong>${a.passed ? "通过" : "失败"}</strong></td>
        </tr>`
        )
        .join("")}
      </tbody></table>`;
  }

  function prettyJson(text) {
    const raw = text == null || text === "" ? "—" : String(text);
    const mark = "…(已截断)";
    let body = raw;
    let suffix = "";
    if (body.endsWith(mark)) {
      body = body.slice(0, -mark.length).trimEnd();
      suffix = "\n…(已截断)";
    }
    try {
      return JSON.stringify(JSON.parse(body), null, 2) + suffix;
    } catch (err) {
      return raw;
    }
  }

  function apisHtml(step) {
    const list = step.apis || [];
    if (!list.length) return "";
    return `<div class="ac-api-list">${list
      .map((a) => {
        const flag = a.skipped ? "未单独请求" : a.ok === true ? "通过" : a.ok === false ? "失败" : "";
        return `<div class="ac-api-line">
          <span class="ac-tag">${esc(a.method || "")}</span>
          <strong>${esc(a.name || "")}</strong>
          <code class="ac-code">${esc(a.path || "")}</code>
          ${flag ? `<span class="ac-tag ${a.ok === false ? "failed" : "passed"}">${esc(flag)}</span>` : ""}
          ${a.note ? `<div class="hint">${esc(a.note)}</div>` : ""}
          ${
            a.request || a.response
              ? `<div class="hint">请求</div><pre class="ac-exchange">${esc(prettyJson(a.request))}</pre>
                 <div class="hint">响应</div><pre class="ac-exchange">${esc(prettyJson(a.response))}</pre>`
              : ""
          }
        </div>`;
      })
      .join("")}</div>`;
  }

  async function openDrawer(runId) {
    const data = await api(`/api/auto-control/runs/${encodeURIComponent(runId)}?lines=200`);
    if (!data.ok) {
      alert(data.error || "加载失败");
      return;
    }
    const run = data.run || {};
    $("ac-drawer").classList.remove("hidden");
    $("ac-drawer-title").textContent = run.id || "运行详情";
    const stShow = run.stopReason === "stub_stop" ? "stub_stop" : run.status;
    const metaLines = [
      `状态：${zhMap(ZH.status, stShow, stShow)}（${run.status || "—"}）`,
      `流水线：${run.pipelineName || run.pipelineId || "—"}`,
      isV1reg(run.pipelineId)
        ? "平台：—（三平台）"
        : `平台：${zhMap(ZH.target, run.target, run.target)}（${run.target || "—"}）`,
      `触发来源：${zhMap(ZH.source, run.source, run.source)}（${run.source || "—"}）`,
      Number(run.autoRetryCount) ? `自动重试：第 ${run.autoRetryCount}/${run.retryMax || 3} 次` : "",
      run.autoRetryOf ? `源自：${run.autoRetryOf}` : "",
      run.autoRetriedAs ? `已再入队：${run.autoRetriedAs}` : "",
      `开始：${run.startedAt || "—"}`,
      `结束：${run.finishedAt || "—"}`,
      run.error ? `错误：${run.error}` : "",
      run.failClass ? `失败分类：${zhMap(ZH.failClass, run.failClass, run.failClass)}` : "",
      run.reportPath ? `报告路径：${run.reportPath}` : "",
      run.evidenceFile ? `证据文件：${run.evidenceFile}` : "",
      run.prevDiff && run.prevDiff.length ? `与上次对比新坏：${run.prevDiff.map((x) => x.title || x.id).join(" · ")}` : "",
    ].filter(Boolean);
    $("ac-drawer-meta").textContent = metaLines.join("\n");
    renderBizVars(run, "ac-drawer-vars");
    renderAssertions(run);
    acShotItems = [];
    $("ac-drawer-steps").innerHTML = (run.steps || [])
      .map((s) => {
        const es = engineStateOf(s);
        const stZh = es ? zhMap(ZH.engineState, es, es) : zhMap(ZH.status, s.status, s.status);
        const eng = engineLabel(s.engine || "");
        const showMoneyS4Hint = s.id === "S4" && !isV1reg(run.pipelineId);
        const shots = (s.screenshots || [])
          .map((sh) => {
            const url = sh.url || (sh.file ? `/api/auto-control/runs/${encodeURIComponent(run.id)}/shots/${sh.file}` : "");
            if (!url) return "";
            const idx = acShotItems.length;
            acShotItems.push({ url, name: sh.name || "截图" });
            return `<button type="button" class="ac-shot" data-ac-shot="${idx}">
              <img src="${esc(url)}" alt="${esc(sh.name || "")}">
              <span>${esc(sh.name || "截图")}</span>
            </button>`;
          })
          .join("");
        const subs = Array.isArray(s.subSteps) ? s.subSteps : [];
        const subHtml = subs.length
          ? `<details class="ac-substeps" ${subs.some((x) => String(x.state || "").toUpperCase() !== "PASS") ? "open" : ""}>
              <summary class="hint">子步骤 ${subs.length} 项（默认展开非通过）</summary>
              <table class="ac-table" style="margin-top:6px"><thead><tr><th>状态</th><th>标题</th><th>说明</th></tr></thead><tbody>
              ${subs
                .map((x) => {
                  const xs = String(x.state || "").toUpperCase();
                  return `<tr class="${xs === "FAIL" ? "bad" : xs === "PASS" ? "" : "warn"}"><td>${esc(
                    zhMap(ZH.engineState, xs, xs || "—")
                  )}</td><td>${esc(x.title || "")}</td><td class="hint">${esc(x.detail || "")}</td></tr>`;
                })
                .join("")}
              </tbody></table></details>`
          : "";
        return `<div class="ac-step ${esc(s.status)}" style="max-width:none;margin-bottom:6px">
            ${(s.title || "").startsWith("场景") || (s.title || "").startsWith("BS-") ? "" : `<strong>${esc(s.id)}</strong> `}${esc(s.title)} · ${esc(stZh)}${
          es ? ` <span class="ac-code-inline">${esc(es)}</span>` : s.status ? ` <span class="ac-code-inline">${esc(s.status)}</span>` : ""
        }${s.failClass ? ` · <span class="ac-tag">${esc(zhMap(ZH.failClass, s.failClass, s.failClass))}</span>` : ""}
            <div class="hint">执行方式：${eng}</div>
            <div>${esc(s.detail || "")}</div>
            ${s.error ? `<div style="color:#b91c1c">${esc(s.error)}</div>` : ""}
            ${(s.assertions || []).length ? `<div class="hint">断言 ${(s.assertions || []).length} 条</div>` : ""}
            ${shots ? `<div class="ac-shots">${shots}</div>` : ""}
            ${
              (s.traces || [])
                .map((tr) => {
                  const url = tr.url || (tr.file ? `/api/auto-control/runs/${encodeURIComponent(run.id)}/traces/${tr.file}` : "");
                  if (!url) return "";
                  return `<a class="btn btn-sm ac-trace-dl" href="${esc(url)}" download>下载 Trace · ${esc(tr.name || tr.file || "trace.zip")}</a>`;
                })
                .join("") || ""
            }
            ${showMoneyS4Hint ? `<div class="hint">玩家段按接口实调：注册、登录、实名、上传角色、提交支付。与 Apifox「玩家充值」是同一批接口；本跑次没有另出 Apifox HTML，结果列在下面。</div>` : ""}
            ${subHtml}
            ${apisHtml(s)}
          </div>`;
      })
      .join("");
    $("ac-drawer-log").textContent = (data.logTail || []).join("\n") || "（无日志）";
    $("ac-drawer-log-dl").href = `/api/auto-control/runs/${encodeURIComponent(runId)}/log`;
    $("ac-drawer-report").href = reportUrl(runId);
    const ev = run.evidence || {};
    const evEl = $("ac-drawer-evidence");
    if (evEl) {
      const miss = (ev.missing || []).length ? `缺项：${(ev.missing || []).join(" · ")}` : "证据包齐全（或仅缺可选项）";
      const traces = (ev.traceFiles || [])
        .map((tr) => `<a href="${esc(tr.url)}" download>${esc(tr.name || tr.file)}</a>`)
        .join(" · ");
      const bizEv = run.evidenceFile
        ? ` · <a href="/api/auto-control/v1reg-evidence/${encodeURIComponent(String(run.evidenceFile).split(/[/\\\\]/).pop())}" download>下载业务证据 JSON</a>`
        : "";
      evEl.innerHTML = `证据：shots ${(ev.shotCount || 0)} 张 · Trace ${(ev.traceCount || 0)} · ${esc(miss)}${bizEv}${
        traces ? `<div class="ac-trace-list">Trace：${traces}</div>` : ""
      }`;
    }
    const ticketBtn = $("ac-drawer-ticket-product");
    const zentaoBtn = $("ac-drawer-ticket-zentao");
    const badClass = String(run.failClass || "");
    const blockTicket = badClass === "env" || badClass === "automation" || run.stopReason === "stub_stop";
    const canTicket = (run.status === "failed" || run.status === "cancelled") && !blockTicket;
    if (ticketBtn) {
      ticketBtn.disabled = !canTicket;
      ticketBtn.title = blockTicket ? `环境/自动化类失败不提缺陷（${badClass || run.stopReason || ""}）` : "";
      ticketBtn.onclick = () => submitTicket(runId, "product");
    }
    if (zentaoBtn) {
      zentaoBtn.disabled = !canTicket;
      zentaoBtn.title = ticketBtn ? ticketBtn.title : "";
      zentaoBtn.onclick = () => submitTicket(runId, "zentao");
    }
  }

  async function submitTicket(runId, system) {
    const res = await api(`/api/auto-control/runs/${encodeURIComponent(runId)}/ticket`, {
      method: "POST",
      body: { system },
    });
    if (!res.ok) {
      alert(res.error || "提单失败");
      return;
    }
    if (res.draft && system === "zentao") {
      const text = `${res.title || ""}\n\n${res.description || ""}\n\n指派：${res.assigneeLabel || ""} (${res.assignee || ""})`;
      try {
        await navigator.clipboard.writeText(text);
        alert("禅道草稿已复制到剪贴板");
      } catch (e) {
        prompt("请复制禅道草稿标题：", res.title || "");
      }
      return;
    }
    alert(res.title ? `已提单：${res.title}` : "提单成功");
  }

  async function loadSettings() {
    const data = await api("/api/auto-control/settings");
    const st = $("ac-token-status");
    if (!st) return;
    if (!data.ok) {
      st.textContent = data.error || "加载失败";
      return;
    }
    if (data.apifoxTokenConfigured) {
      const src = data.apifoxTokenFromEnv ? "环境变量" : "本地文件";
      st.innerHTML = `已配置（${esc(src)}）· <code>${esc(data.apifoxTokenMasked || "")}</code>`;
    } else {
      st.textContent = "未配置";
    }
    const note = $("ac-settings-note");
    if (note && data.note) note.textContent = data.note;
    const wh = $("ac-webhook-status");
    if (wh) {
      if (!data.webhookConfigured) {
        wh.textContent = "未配置";
      } else {
        const bits = [data.webhookUrlMasked || ""];
        if (data.webhookIsDingTalk) bits.unshift("钉钉");
        if (data.webhookSecretConfigured) bits.push(`加签已配(${data.webhookSecretMasked || "***"})`);
        else if (data.webhookIsDingTalk) bits.push("加签未配（若机器人开了加签则推送会失败）");
        if (data.webhookKeyword) bits.push(`关键词「${data.webhookKeyword}」`);
        wh.textContent = `已配置 · ${bits.join(" · ")}`;
      }
    }
    const setChk = (id, v) => {
      const el = $(id);
      if (el) el.checked = !!v;
    };
    setChk("ac-wh-failed", data.webhookNotifyFailed !== false);
    setChk("ac-wh-stub", data.webhookNotifyStub !== false);
    setChk("ac-wh-passed", !!data.webhookNotifyPassed);
    const dedupe = $("ac-wh-dedupe");
    if (dedupe) dedupe.value = String(data.webhookDedupeMinutes != null ? data.webhookDedupeMinutes : 15);
    const kw = $("ac-webhook-keyword");
    if (kw && !kw.value) kw.value = data.webhookKeyword || "";
    const layout = $("ac-evidence-layout");
    if (layout && data.evidenceLayout) layout.textContent = data.evidenceLayout;
    const bridgePath = $("ac-bridge-path");
    if (bridgePath && data.apifoxBridgePath) bridgePath.textContent = data.apifoxBridgePath;
    const childChk = $("ac-oa-child");
    if (childChk) childChk.checked = data.oaUseChildSession !== false;
    renderChildStatus(data.childSession || {});
    await loadSchedule();
    await loadBridge();
  }

  function renderChildStatus(st) {
    const el = $("ac-child-status");
    if (!el) return;
    if (!st || st.ok === false) {
      el.textContent = (st && st.error) || "读不到分身状态";
      return;
    }
    const bits = [];
    if (st.ready && st.sessionId != null) {
      bits.push(`已连接 · 会话 ${st.sessionId}`);
      bits.push(st.ownedByWorkbench ? "工作台窗口" : "其他客户端（如 BetterGI）");
    } else if (st.hostRunning) {
      bits.push(st.hostDetail || "窗口已开，正在连接…");
    } else if (!st.doorOpen) {
      bits.push("远程桌面门未开（需先放开开关）");
    } else if (st.enabled) {
      bits.push("门已开，分身未连接");
    } else {
      bits.push("未启用 / 未连接");
    }
    if (!st.hostExeExists) bits.push("缺少分身程序");
    el.textContent = bits.join(" · ");
  }

  async function refreshChildStatus() {
    const data = await api("/api/auto-control/child-session");
    renderChildStatus(data || {});
    const chk = $("ac-oa-child");
    if (chk && data && typeof data.oaUseChildSession === "boolean") {
      chk.checked = data.oaUseChildSession;
    }
  }

  async function saveChildSetting() {
    const body = { oaUseChildSession: !!($("ac-oa-child") && $("ac-oa-child").checked) };
    const res = await api("/api/auto-control/settings", { method: "PUT", body });
    const st = $("ac-child-save-status");
    if (!res.ok) {
      if (st) st.textContent = res.error || "保存失败";
      alert(res.error || "保存失败");
      return;
    }
    if (st) st.textContent = body.oaUseChildSession ? "已保存：走桌面分身" : "已保存：在主桌面跑（会抢鼠标）";
    renderChildStatus(res.childSession || {});
  }

  async function startChildHost() {
    const st = $("ac-child-save-status");
    if (st) st.textContent = "正在启动分身…";
    const res = await api("/api/auto-control/child-session/start", { method: "POST", body: {} });
    renderChildStatus(res || {});
    if (!res.ok) {
      if (st) st.textContent = res.error || "启动失败";
      alert(res.error || "启动分身失败");
      return;
    }
    if (st) st.textContent = res.message || "分身已就绪";
  }

  async function stopChildHost() {
    if (!confirm("关闭分身后，分身里正在跑的程序会一起没掉。确定关闭？")) return;
    const st = $("ac-child-save-status");
    const res = await api("/api/auto-control/child-session/stop", { method: "POST", body: {} });
    renderChildStatus(res || {});
    if (!res.ok) {
      if (st) st.textContent = res.error || "关闭失败";
      alert(res.error || "关闭分身失败");
      return;
    }
    if (st) st.textContent = res.message || "已关闭";
  }

  async function loadBridge() {
    const el = $("ac-bridge-vars");
    if (!el) return;
    const data = await api("/api/auto-control/apifox-bridge");
    if (!data.ok) {
      el.textContent = data.error || "加载失败";
      return;
    }
    el.textContent = JSON.stringify(data.vars || {}, null, 2);
  }

  async function previewWebhook() {
    const data = await api("/api/auto-control/webhook/preview");
    const box = $("ac-webhook-preview");
    if (!box) return;
    box.classList.remove("hidden");
    const note = data.imageNote
      ? `\n\n（${data.imageNote}${data.willAttachShot ? ` · 本跑次将附 ${data.shotName}` : ""}）`
      : "";
    box.textContent = (data.preview || data.error || "无预览") + note;
  }

  async function cleanupRuns() {
    if (!confirm("清理 14 天前的跑次目录与索引（至少保留最近 20 条）？")) return;
    const res = await api("/api/auto-control/cleanup", { method: "POST", body: { keepDays: 14, keepMin: 20 } });
    const st = $("ac-maint-status");
    if (st) st.textContent = res.ok ? `已清理 ${(res.removed || []).length} 条，保留 ${res.kept}` : res.error || "清理失败";
  }

  async function batchRetry() {
    const res = await api("/api/auto-control/batch-retry", { method: "POST", body: {} });
    const st = $("ac-maint-status");
    if (!res.ok) {
      if (st) st.textContent = res.error || "无可重试";
      alert(res.error || "批量重试失败");
      return;
    }
    if (st) st.textContent = `已入队 ${((res.run || {}).id) || ""}`;
    await refreshOverview();
    loadTasks();
  }

  async function saveWebhook(clear) {
    const body = {
      notifyFailed: !!($("ac-wh-failed") && $("ac-wh-failed").checked),
      notifyStub: !!($("ac-wh-stub") && $("ac-wh-stub").checked),
      notifyPassed: !!($("ac-wh-passed") && $("ac-wh-passed").checked),
      dedupeMinutes: Number(($("ac-wh-dedupe") && $("ac-wh-dedupe").value) || 15),
      webhookKeyword: (($("ac-webhook-keyword") && $("ac-webhook-keyword").value) || "").trim(),
    };
    if (clear) {
      body.webhookUrl = "";
      body.webhookSecret = "";
      body.webhookKeyword = "";
    } else {
      const typed = (($("ac-webhook-url") && $("ac-webhook-url").value) || "").trim();
      if (typed) body.webhookUrl = typed;
      const sec = (($("ac-webhook-secret") && $("ac-webhook-secret").value) || "").trim();
      if (sec) body.webhookSecret = sec;
    }
    const res = await api("/api/auto-control/webhook", { method: "PUT", body });
    if (!res.ok) {
      alert(res.error || "保存失败");
      return;
    }
    const input = $("ac-webhook-url");
    if (input) input.value = "";
    const secEl = $("ac-webhook-secret");
    if (secEl) secEl.value = "";
    await loadSettings();
    await refreshOverview();
    alert(clear ? "已清除 Webhook" : "Webhook 设置已保存");
  }

  async function testWebhook() {
    const res = await api("/api/auto-control/webhook/test", { method: "POST", body: {} });
    if (!res.ok) {
      alert(res.error || "测试推送失败");
      return;
    }
    alert("已发送测试消息，请到钉钉群查看");
  }

  function scheduleModeFrom(profile, enablePayout) {
    const p = String(profile || "B").toUpperCase();
    if (p === "A") return "recharge";
    if (enablePayout) return "main";
    return "settle";
  }

  function scheduleOptsFromMode(mode) {
    if (mode === "recharge") return { profile: "A", enablePayout: false };
    if (mode === "settle") return { profile: "B", enablePayout: false };
    return { profile: "B", enablePayout: true };
  }

  async function loadSchedule() {
    const box = $("ac-sched-status");
    const data = await api("/api/auto-control/schedule");
    if (!data || !data.ok) {
      if (box) box.textContent = (data && data.error) || "定时配置加载失败";
      return;
    }
    const enabled = $("ac-sched-enabled");
    const time = $("ac-sched-time");
    const target = $("ac-sched-target");
    const modeEl = $("ac-sched-mode");
    if (enabled) enabled.checked = !!data.enabled;
    if (time) time.value = data.time || "09:00";
    if (target) target.value = data.target || "lx";
    if (modeEl) modeEl.value = scheduleModeFrom(data.profile, data.enablePayout);
    if (box) {
      const modeLabel =
        scheduleModeFrom(data.profile, data.enablePayout) === "main"
          ? "整条主链"
          : scheduleModeFrom(data.profile, data.enablePayout) === "recharge"
            ? "仅充值～分佣"
            : "结算～提现（不打款）";
      const bits = [
        data.enabled ? `已启用，每天 ${data.time}` : `未启用 · 预定每天 ${data.time || "09:00"}`,
        modeLabel,
      ];
      if (data.lastFiredOn) bits.push(`最近触发 ${data.lastFiredOn}`);
      if (data.lastError) bits.push(data.lastError);
      box.textContent = bits.join(" · ");
    }
  }

  async function saveSchedule() {
    const box = $("ac-sched-status");
    const mode = ($("ac-sched-mode") && $("ac-sched-mode").value) || "main";
    const opts = scheduleOptsFromMode(mode);
    const res = await api("/api/auto-control/schedule", {
      method: "PUT",
      body: {
        pipelineId: "money_recharge_to_withdraw",
        enabled: !!($("ac-sched-enabled") && $("ac-sched-enabled").checked),
        time: ($("ac-sched-time") && $("ac-sched-time").value) || "09:00",
        profile: opts.profile,
        target: ($("ac-sched-target") && $("ac-sched-target").value) || "lx",
        enablePayout: opts.enablePayout,
      },
    });
    if (!res.ok) {
      if (box) box.textContent = res.error || "保存失败";
      return;
    }
    await loadSchedule();
  }

  async function saveToken(clear) {
    const input = $("ac-apifox-token");
    const token = clear ? "" : (input && input.value) || "";
    if (!clear && !String(token).trim()) {
      alert("请先粘贴 Token，或点「清除本地文件」");
      return;
    }
    const res = await api("/api/auto-control/settings", {
      method: "PUT",
      body: { apifoxToken: token },
    });
    if (!res.ok) {
      alert(res.error || "保存失败");
      return;
    }
    if (input) input.value = "";
    await loadSettings();
    await refreshOverview();
    alert(clear || res.cleared ? "已清除本地 Token 文件" : "已保存");
  }

  function closeDrawer() {
    $("ac-drawer").classList.add("hidden");
  }

  async function startRun(profile, options, pipelineId) {
    const target = $("ac-target").value || "lx";
    const res = await api("/api/auto-control/runs", {
      method: "POST",
      body: {
        profile,
        target,
        pipelineId: pipelineId || "money_recharge_to_withdraw",
        options: options || {},
      },
    });
    if (!res.ok) {
      alert(res.error || "入队失败");
      return;
    }
    switchTab("overview");
    await refreshOverview();
    loadTasks({ resetPage: true });
  }

  function startPipeStep(pipelineId, stepId) {
    closePipeModal();
    return startRun("A", { stepId: stepId || "" }, pipelineId);
  }

  function profileOptsForSteps(pipe, stepIds) {
    const steps = (pipe && pipe.steps) || [];
    const byId = Object.fromEntries(steps.map((s) => [String(s.id), s]));
    const picked = (stepIds || []).map((id) => byId[id]).filter(Boolean);
    const needsB = picked.some((s) => {
      const profiles = s.profiles || ["A", "B"];
      return profiles.includes("B") && !profiles.includes("A");
    });
    const needPayout = picked.some((s) => s.id === "S11" || s.requiresPayout);
    if (needsB || needPayout) {
      return { profile: "B", options: { enablePayout: needPayout || picked.length === 0 } };
    }
    // 未传子集 / 全选主链时默认档 B + 打款（与列表「跑一次」一致）
    if (!stepIds || !stepIds.length) {
      return { profile: "B", options: { enablePayout: true } };
    }
    return { profile: "A", options: { enablePayout: false } };
  }

  function pipeTamperWithdrawOpt() {
    const el = $("ac-pipe-tamper-wd");
    return !!(el && el.checked);
  }

  async function startPipeline(pipelineId, stepIds, extraOpts) {
    const pid = pipelineId || "money_recharge_to_withdraw";
    const extra = extraOpts && typeof extraOpts === "object" ? extraOpts : {};
    if (pid === "oa_inner_tab_keep_filter") return startRun("A", { ...extra }, pid);
    if (pid === "guild_seed_ready") {
      const opts = { ...extra };
      if (stepIds && stepIds.length) opts.stepIds = stepIds;
      return startRun("A", opts, pid);
    }
    const pipe = pipeItems.find((item) => item.id === pid);
    const ids = Array.isArray(stepIds) ? stepIds.filter(Boolean) : null;
    if (ids && !ids.length) {
      alert("请至少勾选一个步骤");
      return;
    }
    const { profile, options } = profileOptsForSteps(pipe, ids);
    if (ids && ids.length) options.stepIds = ids;
    Object.assign(options, extra);
    return startRun(profile, options, pid);
  }

  async function runPipeModalOnce() {
    const pid = pipeModalId;
    if (!pid) {
      alert("请先打开流水线详情");
      return;
    }
    const pipe = pipeItems.find((item) => item.id === pid);
    if (pipe && pipe.placeholder) {
      alert("占位流水线暂不可跑");
      return;
    }
    const extra = {};
    if (pipeTamperWithdrawOpt()) {
      extra.tamperWithdrawSumMoney = 2;
    }
    if (!pipeSupportsStepPick(pid, pipe)) {
      closePipeModal();
      return startPipeline(pid, null, extra);
    }
    const ids = selectedPipeStepIds();
    if (!ids.length) {
      alert("请至少勾选一个步骤");
      return;
    }
    if (extra.tamperWithdrawSumMoney && !ids.includes("S9")) {
      if (!confirm("已勾选「S9后金额改成2」，但未勾选 S9，篡改不会生效。仍要继续？")) return;
    }
    closePipeModal();
    return startPipeline(pid, ids, extra);
  }

  /** 一键主链 = 档 B + 开启打款，跑完充值→提现主要步骤 */
  function startMainChain() {
    return startRun("B", { enablePayout: true });
  }

  async function stopRun() {
    const id = watchingRunId || (overviewCache && overviewCache.current && overviewCache.current.id);
    if (!id) {
      alert("当前没有执行中的任务");
      return;
    }
    const res = await api(`/api/auto-control/runs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} });
    if (!res.ok) alert(res.error || "取消失败");
    await refreshOverview();
  }

  function setupPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    const sec = Number($("ac-poll").value || 0);
    if (sec > 0) {
      pollTimer = setInterval(refreshOverview, sec * 1000);
    }
  }

  function setAcShotZoom(zoom) {
    acShotZoom = Math.max(0.2, Math.min(6, zoom));
    const img = $("ac-shot-img");
    if (img) img.style.transform = `scale(${acShotZoom})`;
    const label = $("ac-shot-zoom-label");
    if (label) label.textContent = Math.round(acShotZoom * 100) + "%";
  }

  function showAcShot() {
    const item = acShotItems[acShotIndex];
    if (!item) return;
    const img = $("ac-shot-img");
    const title = $("ac-shot-title");
    if (title) title.textContent = `${acShotIndex + 1} / ${acShotItems.length}  ${item.name || "截图"}`;
    setAcShotZoom(1);
    if (img) img.src = item.url;
    const prev = $("ac-shot-prev");
    const next = $("ac-shot-next");
    if (prev) prev.disabled = acShotItems.length < 2;
    if (next) next.disabled = acShotItems.length < 2;
  }

  function openAcShot(index) {
    if (!acShotItems.length) return;
    acShotIndex = Math.max(0, Math.min(index, acShotItems.length - 1));
    $("ac-shot-modal").classList.remove("hidden");
    showAcShot();
  }

  function closeAcShot() {
    const modal = $("ac-shot-modal");
    if (modal) modal.classList.add("hidden");
    const img = $("ac-shot-img");
    if (img) img.removeAttribute("src");
  }

  function stepAcShot(delta) {
    if (acShotItems.length < 2) return;
    acShotIndex = (acShotIndex + delta + acShotItems.length) % acShotItems.length;
    showAcShot();
  }

  /* —— 数据准确性断言 —— */
  let daSceneId = "";
  let daMetricId = "";
  let daCatalogId = "";
  let daView = "list";
  let daCache = null;
  let daDetail = null;

  function yuanText(v) {
    if (v == null || v === "") return "—";
    return `¥${Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function daValueKind(unit, format) {
    const u = String(unit || "").trim().toLowerCase();
    const f = String(format || "").trim().toLowerCase();
    if (u === "%" || u === "percent" || u === "pct" || u === "rate" || f === "percent" || f === "pct" || f === "rate" || f === "ratio") {
      return "percent";
    }
    if (u === "number" || u === "count" || u === "int" || f === "number" || f === "count" || f === "int" || f === "integer") {
      return "number";
    }
    if (u === "text" || f === "text" || f === "url" || f === "identity" || f === "string") {
      return "text";
    }
    return "money";
  }

  function trimDaNumber(n) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Number(n.toFixed(4)));
  }

  function formatDaCheckValue(v, unit, format) {
    if (v == null || v === "") return "—";
    const kind = daValueKind(unit, format);
    if (kind === "text") return String(v);
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
    if (Number.isNaN(n)) return String(v);
    if (kind === "percent") return `${trimDaNumber(n)}%`;
    if (kind === "number") return trimDaNumber(n);
    return yuanText(n);
  }

  function layerValText(L) {
    if (!L) return "—";
    const fmt = (daDetail && daDetail.metric && daDetail.metric.format) || "";
    // 旧 lastAssert 可能仍是 unit=yuan / valueText 空，按当前指标 format 重算
    if (L.valueYuan != null && L.valueYuan !== "") {
      return formatDaCheckValue(L.valueYuan, L.unit, fmt);
    }
    if (L.valueText != null && String(L.valueText) !== "") {
      return formatDaCheckValue(L.valueText, L.unit, fmt);
    }
    return "—";
  }

  function showDaView(view) {
    daView = view === "detail" ? "detail" : "list";
    const list = $("ac-da-view-list");
    const detail = $("ac-da-view-detail");
    if (list) list.classList.toggle("hidden", daView !== "list");
    if (detail) detail.classList.toggle("hidden", daView !== "detail");
  }

  function daCatalogById(id) {
    return ((daCache && daCache.catalogs) || []).find((c) => c.id === id) || null;
  }

  function daScenesForCatalog(catalogId) {
    const cat = daCatalogById(catalogId);
    const ids = new Set((cat && cat.scenes ? cat.scenes : []).map((s) => s.id));
    return ((daCache && daCache.scenes) || []).filter((s) => {
      if (ids.size) return ids.has(s.id);
      return String(s.catalog || "") === catalogId;
    });
  }

  function daRollupBadge(status) {
    if (status === "pass") return `<span class="ac-da-badge pass">一致</span>`;
    if (status === "fail") return `<span class="ac-da-badge fail">不一致</span>`;
    if (status === "mixed") return `<span class="ac-da-badge muted">部分完成</span>`;
    if (status === "empty") return `<span class="ac-da-badge muted">待接入</span>`;
    return `<span class="ac-da-badge muted">未断言</span>`;
  }

  function renderDaCatalogList() {
    const box = $("ac-da-catalogs");
    if (!box || !daCache) return;
    const rows = daCache.catalogs || [];
    if (!rows.length) {
      box.innerHTML = `<tr><td colspan="5" class="hint">暂无数据源</td></tr>`;
      return;
    }
    box.innerHTML = rows
      .map((c) => {
        const sceneNames = (c.scenes || []).map((s) => s.name || s.id).join("、") || "—";
        const proto = c.previewUrl
          ? `<a class="btn btn-sm" href="${esc(c.previewUrl)}" target="_blank" rel="noopener">原型</a>`
          : "";
        return `<tr>
          <td><strong>${esc(c.name || c.id)}</strong></td>
          <td class="ac-da-cat-summary">${esc(c.summary || c.sourceNote || "—")}</td>
          <td>${esc(sceneNames)} · ${Number(c.metricCount || 0)} 指标</td>
          <td>${daRollupBadge(c.assertStatus)}</td>
          <td class="ac-da-cat-ops">
            ${proto}
            <button type="button" class="btn btn-sm primary" data-da-open="${esc(c.id)}">详情</button>
          </td>
        </tr>`;
      })
      .join("");
    box.querySelectorAll("[data-da-open]").forEach((btn) => {
      btn.onclick = () => openDaCatalog(btn.getAttribute("data-da-open"));
    });
  }

  function openDaCatalog(catalogId) {
    if (!catalogId) return;
    daCatalogId = catalogId;
    const cat = daCatalogById(catalogId);
    const nameEl = $("ac-da-catalog-name");
    if (nameEl) nameEl.textContent = (cat && cat.name) || catalogId;
    const scenes = daScenesForCatalog(catalogId);
    const sel = $("ac-da-scene");
    if (sel) {
      sel.innerHTML = scenes
        .map((s) => `<option value="${esc(s.id)}">${esc(s.name || s.id)}</option>`)
        .join("");
      daSceneId = scenes[0] ? scenes[0].id : "";
      if (daSceneId) sel.value = daSceneId;
      sel.onchange = () => {
        daSceneId = sel.value;
        daMetricId = "";
        renderDaMetricList();
        clearDaDetail();
        const first = daFirstMetricInScene(daSceneId);
        if (first) selectDaMetric(first.id);
      };
    }
    showDaView("detail");
    renderDaMetricList();
    const first = daFirstMetricInScene(daSceneId);
    if (first) selectDaMetric(first.id);
    else clearDaDetail();
  }

  function daFirstMetricInScene(sceneId) {
    if (!daCache) return null;
    const raw = (daCache.metrics || []).filter((m) => !sceneId || m.scene === sceneId);
    const list = daOrderedMetrics(raw, sceneId);
    return list[0] || null;
  }

  async function loadDataAssert() {
    const st = $("ac-da-status");
    const st2 = $("ac-da-status-detail");
    if (st) st.textContent = "加载中…";
    const ov = await api("/api/auto-control/data-assert/overview");
    if (!ov.ok) {
      if (st) st.textContent = ov.error || "加载失败";
      return;
    }
    daCache = ov;
    renderDaCatalogList();
    if (daView === "detail" && daCatalogId) {
      openDaCatalog(daCatalogId);
    } else {
      showDaView("list");
    }
    if (st) st.textContent = `${(ov.catalogs || []).length} 个数据源`;
    if (st2) st2.textContent = st ? st.textContent : "";
  }

  function daMetricFormat(metricId, last) {
    const m = (daCache && daCache.metrics || []).find((x) => x.id === metricId);
    return (
      (m && m.format) ||
      (daDetail && daDetail.metric && daDetail.metric.id === metricId && daDetail.metric.format) ||
      (last && last.format) ||
      ""
    );
  }

  function daAssertValue(last, metricId) {
    if (!last) return "";
    const fmt = daMetricFormat(metricId || (last && last.metricId) || daMetricId, last);
    const layers = last.layers || {};
    for (const key of ["L3", "L1", "L4"]) {
      const L = layers[key] || {};
      if (L.valueYuan != null && L.valueYuan !== "") {
        return formatDaCheckValue(L.valueYuan, L.unit, fmt);
      }
      if (L.valueText != null && String(L.valueText) !== "") {
        return formatDaCheckValue(L.valueText, L.unit, fmt);
      }
    }
    if (last.value != null && String(last.value) !== "") {
      return formatDaCheckValue(last.value, "", fmt);
    }
    return "";
  }

  function daStatusBadge(last, metricId) {
    if (!last || !last.status) {
      return `<span class="ac-da-badge muted" title="尚未断言">未断言</span>`;
    }
    if (last.status === "pass") {
      const v = daAssertValue(last, metricId);
      const label = v ? `一致（${v}）` : "一致";
      return `<span class="ac-da-badge pass" title="${esc(label)}">${esc(label)}</span>`;
    }
    const raw = String(last.conclusion || "不一致");
    const shortFail = raw.length > 18 ? `${raw.slice(0, 16)}…` : raw;
    return `<span class="ac-da-badge fail" title="${esc(raw)}">${esc(shortFail)}</span>`;
  }

  function syncDaMetricAssert(metricId, last) {
    if (!daCache || !metricId || !last) return;
    const m = (daCache.metrics || []).find((x) => x.id === metricId);
    if (!m) return;
    const fmt = m.format || last.format || "";
    m.lastAssert = {
      status: last.status || "",
      conclusion: last.status === "pass" ? "一致" : last.conclusion || "",
      assertedAt: last.assertedAt || "",
      format: fmt,
      useFixture: last.useFixture,
      value: daAssertValue(last, metricId),
      layers: last.layers || null,
    };
  }

  const DA_PERIODS = [
    { key: "today", label: "本日" },
    { key: "yesterday", label: "昨日" },
    { key: "week", label: "本周" },
    { key: "month", label: "本月" },
    { key: "7d", label: "近7天" },
    { key: "30d", label: "近30天" },
    { key: "prev7", label: "上七天" },
  ];

  function daOrderedMetrics(list, sceneId) {
    const sid = sceneId || daSceneId;
    const scene = ((daCache && daCache.scenes) || []).find((s) => s.id === sid);
    const order = (scene && scene.metrics) || [];
    if (!order.length) return list;
    const rank = new Map(order.map((id, i) => [String(id), i]));
    return list.slice().sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : 10000;
      const rb = rank.has(b.id) ? rank.get(b.id) : 10000;
      if (ra !== rb) return ra - rb;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh");
    });
  }

  function daPeriodMembers(groupId, list) {
    if (!groupId) return [];
    return DA_PERIODS.map((p) => {
      const id = `${groupId}_${p.key}`;
      const m = (list || []).find((x) => x.id === id);
      return m ? { key: p.key, label: p.label, metric: m } : null;
    }).filter(Boolean);
  }

  function daGroupAssert(members) {
    const lasts = (members || []).map((x) => x.metric && x.metric.lastAssert).filter(Boolean);
    if (!lasts.length) return null;
    if (lasts.some((x) => x.status === "fail")) {
      return lasts.find((x) => x.status === "fail") || lasts[0];
    }
    if (lasts.every((x) => x.status === "pass")) return lasts[0];
    return lasts[0];
  }

  /** 四时段族收成一行；其余保持原样。 */
  function daSidebarEntries(list) {
    const seen = new Set();
    const out = [];
    for (const m of list) {
      const group = m.periodGroup;
      if (group) {
        if (seen.has(group)) continue;
        const members = daPeriodMembers(group, list);
        if (members.length >= 2) {
          seen.add(group);
          const primary =
            (members.find((x) => x.key === "today") || members[0]).metric;
          out.push({
            kind: "period",
            group,
            id: primary.id,
            name: primary.displayName || m.displayName || m.name,
            members,
            metric: primary,
          });
          continue;
        }
      }
      out.push({ kind: "single", id: m.id, name: m.name, metric: m, members: [] });
    }
    return out;
  }

  function daCurrentList() {
    if (!daCache) return [];
    const sceneIds = new Set(daScenesForCatalog(daCatalogId).map((s) => s.id));
    let list = (daCache.metrics || []).filter((m) => {
      if (daSceneId) return m.scene === daSceneId;
      if (sceneIds.size) return sceneIds.has(m.scene);
      return true;
    });
    return daOrderedMetrics(list);
  }

  function renderDaMetricList() {
    const box = $("ac-da-metrics");
    if (!box || !daCache) return;
    const list = daCurrentList();
    if (!list.length) {
      box.innerHTML = '<p class="hint">当前场景暂无指标（可先补 Mapping）</p>';
      return;
    }
    const entries = daSidebarEntries(list);
    box.innerHTML = entries
      .map((entry) => {
        const m = entry.metric;
        const modeZh = m.mode === "computed" ? "经计算" : "直通";
        const memberIds = (entry.members || []).map((x) => x.metric.id);
        const active =
          m.id === daMetricId || memberIds.includes(daMetricId) ? " active" : "";
        const badgeSrc =
          entry.kind === "period" ? daGroupAssert(entry.members) : m.lastAssert;
        const sub =
          entry.kind === "period"
            ? `${modeZh} · 四时段`
            : `${modeZh} · ${m.format || "—"}`;
        return `<button type="button" class="ac-da-metric${active}" data-id="${esc(entry.id)}">
          <div class="ac-da-metric-top">
            <div class="t">${esc(entry.name)}</div>
            ${daStatusBadge(badgeSrc, m.id)}
          </div>
          <div class="s">${esc(sub)}</div>
        </button>`;
      })
      .join("");
    box.querySelectorAll(".ac-da-metric").forEach((btn) => {
      btn.onclick = () => selectDaMetric(btn.getAttribute("data-id"));
    });
  }

  function renderDaPeriodTabs(metric) {
    const tabs = $("ac-da-period-tabs");
    if (!tabs) return;
    const group = metric && metric.periodGroup;
    const members = group ? daPeriodMembers(group, daCurrentList()) : [];
    if (!group || members.length < 2) {
      tabs.classList.add("hidden");
      tabs.innerHTML = "";
      return;
    }
    tabs.classList.remove("hidden");
    const cur = metric.periodKey || "";
    tabs.innerHTML = members
      .map((p) => {
        const active = p.key === cur || p.metric.id === daMetricId ? " active" : "";
        return `<button type="button" class="ac-da-period-btn${active}" data-id="${esc(p.metric.id)}" role="tab" aria-selected="${active ? "true" : "false"}">${esc(p.label)}</button>`;
      })
      .join("");
    tabs.querySelectorAll(".ac-da-period-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        if (id && id !== daMetricId) selectDaMetric(id);
      };
    });
  }

  function clearDaDetail() {
    daDetail = null;
    const title = $("ac-da-title");
    const meta = $("ac-da-meta");
    const layers = $("ac-da-layers");
    const tabs = $("ac-da-period-tabs");
    if (title) title.textContent = "选择左侧指标";
    if (meta) meta.textContent = "";
    if (layers) layers.innerHTML = "";
    if (tabs) {
      tabs.classList.add("hidden");
      tabs.innerHTML = "";
    }
  }

  async function selectDaMetric(id) {
    daMetricId = id;
    renderDaMetricList();
    const st = $("ac-da-status-detail") || $("ac-da-status");
    if (st) st.textContent = "拉取四层数据…";
    const detail = await api(`/api/auto-control/data-assert/metrics/${encodeURIComponent(id)}?fixture=1`);
    if (!detail.ok) {
      if (st) st.textContent = detail.error || "拉取失败";
      return;
    }
    daDetail = detail;
    syncDaMetricAssert(id, detail.lastAssert);
    renderDaMetricList();
    renderDaDetail(detail);
    if (st) st.textContent = detail.lastAssert
      ? `上次断言：${detail.lastAssert.status} · ${detail.lastAssert.assertedAt || ""}`
      : "已加载四层（可点「对当前指标断言」）";
  }

  function mismatchSet(last) {
    const set = new Set();
    (last && last.mismatches ? last.mismatches : []).forEach((m) => {
      const p = String(m.pair || "");
      if (p.includes("L1")) set.add("L1");
      if (p.includes("L2")) set.add("L2");
      if (p.includes("L3")) set.add("L3");
      if (p.includes("L4")) set.add("L4");
    });
    return set;
  }

  function renderDaDetail(detail) {
    const m = detail.metric || {};
    const last = detail.lastAssert;
    // 有上次断言结果时，右侧校验值与左侧徽章同源，避免 fixture 预览 vs live 结果对不上
    const layers = (last && last.layers) || detail.layers || {};
    const title = $("ac-da-title");
    const meta = $("ac-da-meta");
    const periodLabel = m.periodLabel ? ` · ${m.periodLabel}` : "";
    const srcTag =
      last && last.layers
        ? last.useFixture === false
          ? " · 展示上次 live"
          : " · 展示上次 fixture"
        : "";
    if (title) {
      title.textContent = m.displayName || m.name || m.id || "指标";
    }
    if (meta) {
      meta.textContent = `${m.mode === "computed" ? "经计算" : "直通"} · ${m.format || "—"}${periodLabel}${srcTag}`;
    }
    renderDaPeriodTabs(m);
    const bad = mismatchSet(last);
    const order = ["L1", "L2", "L3", "L4"];
    const box = $("ac-da-layers");
    if (!box) return;
    const valCol = (L) =>
      `<aside class="ac-da-layer-val" aria-label="校验值">
        <span class="ac-da-val-label">校验值</span>
        <div class="ac-da-val${L && L.valueText ? " is-text" : ""}">${esc(layerValText(L))}</div>
      </aside>`;
    const foldThumbs = (html, count, label) => {
      if (!html || !count) return "";
      return `<div class="ac-da-fold">
        <button type="button" class="btn btn-sm ac-da-fold-btn" aria-expanded="false" data-label="${esc(label)}">
          展开查阅${esc(label)}（${count}）
        </button>
        <div class="ac-da-thumbs ac-da-fold-body is-collapsed">${html}</div>
      </div>`;
    };
    box.innerHTML = order
      .map((key) => {
        const L = layers[key] || {};
        const mis = bad.has(key) ? " is-mismatch" : "";
        if (key === "L1") {
          return `<article class="ac-da-layer${mis}" data-layer="L1">
            <div class="ac-da-layer-main">
              <h4>1. 数据来源</h4>
              <dl>
                <dt>库</dt><dd>${esc(L.db || "—")}</dd>
                <dt>表</dt><dd><span class="ac-da-mono">${esc(L.table || "—")}</span></dd>
                <dt>字段</dt><dd><span class="ac-da-mono">${esc(L.field || "—")}</span></dd>
                <dt>条件</dt><dd>${esc(L.conditionSummary || "—")}</dd>
                <dt>原始值</dt><dd><span class="ac-da-mono">${esc(L.raw ?? "—")} ${esc(L.unit || "")}</span></dd>
                <dt>采样</dt><dd>${esc(L.sampledAt || "—")} · ${esc(L.source || "")}</dd>
                ${L.error ? `<dt>说明</dt><dd>${esc(L.error)}</dd>` : ""}
              </dl>
            </div>
            ${valCol(L)}
          </article>`;
        }
        if (key === "L2") {
          const proto = L.prototype || {};
          const shots = (proto.screenshots || []).filter((s) => s && s.url);
          const thumbs = shots
            .map((s) => {
              const name = String(s.rel || "").split("/").pop() || "原型图";
              return `<figure class="ac-da-thumb" data-proto-shot="1" data-src="${esc(s.url)}">
                <img src="${esc(s.url)}" alt="${esc(name)}" loading="lazy">
                <figcaption class="cap">${esc(name)}</figcaption>
              </figure>`;
            })
            .join("");
          return `<article class="ac-da-layer${mis}" data-layer="L2">
            <div class="ac-da-layer-main">
              <h4>2. 统计公式 / 算法</h4>
              <p class="ac-da-formula"><strong>${esc(L.text || "—")}</strong></p>
              ${L.expr ? `<p><span class="ac-da-mono">${esc(L.expr)}</span></p>` : ""}
              <div class="ac-settings-actions ac-da-actions-row">
                <button type="button" class="btn btn-sm" id="ac-da-open-formula-proto">查阅本公式原型</button>
              </div>
              ${foldThumbs(thumbs, shots.length, "对照截图")}
            </div>
            ${valCol(L)}
          </article>`;
        }
        if (key === "L3") {
          return `<article class="ac-da-layer${mis}" data-layer="L3">
            <div class="ac-da-layer-main">
              <h4>3. 接口数据</h4>
              <dl>
                <dt>接口</dt>
                <dd class="ac-da-api-dd">
                  <span class="ac-da-mono">${esc(L.method || "")} ${esc(L.path || "")}</span>
                  <button type="button" class="btn btn-sm" id="ac-da-open-http">查阅本次请求</button>
                </dd>
                <dt>字段</dt><dd><span class="ac-da-mono">${esc(L.jsonPath || "—")}</span></dd>
                <dt>原始值</dt><dd><span class="ac-da-mono">${esc(L.raw ?? "—")} ${esc(L.unit || "")}</span></dd>
                <dt>状态</dt><dd>${esc(L.httpStatus ?? "—")} · ${esc(L.source || "")}</dd>
              </dl>
            </div>
            ${valCol(L)}
          </article>`;
        }
        const ev = L.evidence || {};
        const evHtml = ev.url
          ? `<figure class="ac-da-thumb" data-proto-shot="1" data-src="${esc(ev.url)}">
                <img src="${esc(ev.url)}" alt="页面证据" loading="lazy">
                <figcaption class="cap">页面实装截图</figcaption>
              </figure>`
          : "";
        return `<article class="ac-da-layer${mis}" data-layer="L4">
          <div class="ac-da-layer-main">
            <h4>4. 页面数据</h4>
            <dl>
              <dt>页面</dt><dd>${esc(L.page || "—")}</dd>
              <dt>区域</dt><dd>${esc(L.region || "—")}</dd>
              <dt>展示文案</dt><dd><strong>${esc(L.displayText || "—")}</strong></dd>
              <dt>定位</dt><dd><span class="ac-da-mono">${esc(L.locator || "—")}</span></dd>
              <dt>采集</dt><dd>${esc(L.capture || "dom")} · ${esc(L.screenshotNote || "")}</dd>
            </dl>
            ${foldThumbs(evHtml, ev.url ? 1 : 0, "页面证据图")}
          </div>
          ${valCol(L)}
        </article>`;
      })
      .join("");
    const btn = $("ac-da-open-formula-proto");
    if (btn) btn.onclick = () => openDaProto("formula");
    const httpBtn = $("ac-da-open-http");
    if (httpBtn) httpBtn.onclick = () => openDaHttpExchange();
    box.querySelectorAll(".ac-da-fold-btn").forEach((el) => {
      el.onclick = () => {
        const fold = el.closest(".ac-da-fold");
        const body = fold && fold.querySelector(".ac-da-fold-body");
        if (!body) return;
        const open = body.classList.toggle("is-collapsed") === false;
        const label = el.getAttribute("data-label") || "截图";
        const n = body.querySelectorAll(".ac-da-thumb").length;
        el.setAttribute("aria-expanded", open ? "true" : "false");
        el.textContent = open ? `收起${label}` : `展开查阅${label}（${n}）`;
      };
    });
    box.querySelectorAll("[data-proto-shot]").forEach((el) => {
      el.onclick = () => {
        const src = el.getAttribute("data-src") || (el.querySelector("img") && el.querySelector("img").src);
        if (src) window.open(src, "_blank", "noopener");
      };
    });
  }

  function prettyJson(v) {
    if (v == null || v === "") return "（无）";
    if (typeof v === "string") {
      try {
        return JSON.stringify(JSON.parse(v), null, 2);
      } catch (_e) {
        return v;
      }
    }
    try {
      return JSON.stringify(v, null, 2);
    } catch (_e) {
      return String(v);
    }
  }

  function openDaHttpExchange() {
    const drawer = $("ac-da-proto-drawer");
    const body = $("ac-da-proto-body");
    const title = $("ac-da-proto-title");
    if (!drawer || !body) return;
    const layers =
      (daDetail && daDetail.lastAssert && daDetail.lastAssert.layers) ||
      (daDetail && daDetail.layers) ||
      {};
    const L3 = layers.L3 || {};
    const ex = L3.exchange || {};
    const req = ex.request || {};
    const resp = ex.response || {};
    const extracted = ex.extracted || {};
    const name = (daDetail && daDetail.metric && daDetail.metric.name) || "";
    if (title) title.textContent = `本次请求 · ${name || L3.path || "接口"}`;

    let html = `<p class="hint">来源：${esc(ex.source || L3.source || "—")} · 抽取字段 ${esc(
      extracted.jsonPath || L3.jsonPath || "—"
    )} = <span class="ac-da-mono">${esc(String(extracted.raw ?? L3.raw ?? "—"))} ${esc(
      extracted.unit || L3.unit || ""
    )}</span></p>`;
    if (ex.doc || L3.doc) {
      html += `<p><a class="btn btn-sm" href="${esc(ex.doc || L3.doc)}" target="_blank" rel="noopener">打开接口文档</a></p>`;
    }

    html += `<section class="ac-da-http-block">
      <h4>请求 Request</h4>
      <dl class="ac-da-http-meta">
        <dt>方法</dt><dd><span class="ac-da-mono">${esc(req.method || L3.method || "—")}</span></dd>
        <dt>URL</dt><dd><span class="ac-da-mono">${esc(req.url || `${L3.method || ""} ${L3.path || ""}` || "—")}</span></dd>
        <dt>Path</dt><dd><span class="ac-da-mono">${esc(req.path || L3.path || "—")}</span></dd>
      </dl>
      <h5>Query</h5>
      <pre class="ac-da-http-pre">${esc(prettyJson(req.query && Object.keys(req.query).length ? req.query : null))}</pre>
      <h5>Headers</h5>
      <pre class="ac-da-http-pre">${esc(prettyJson(req.headers && Object.keys(req.headers).length ? req.headers : null))}</pre>
      <h5>Body（请求体）</h5>
      <pre class="ac-da-http-pre">${esc(prettyJson(req.body))}</pre>
    </section>`;

    html += `<section class="ac-da-http-block">
      <h4>响应 Response</h4>
      <dl class="ac-da-http-meta">
        <dt>状态</dt><dd><span class="ac-da-mono">${esc(String(resp.status ?? L3.httpStatus ?? "—"))}</span></dd>
      </dl>
      <h5>Headers</h5>
      <pre class="ac-da-http-pre">${esc(prettyJson(resp.headers && Object.keys(resp.headers || {}).length ? resp.headers : null))}</pre>
      <h5>Body（响应体）</h5>
      <pre class="ac-da-http-pre">${esc(prettyJson(resp.body))}</pre>
    </section>`;

    body.innerHTML = html;
    drawer.classList.remove("hidden");
  }

  async function runDaAssertScene() {
    const sel = $("ac-da-scene");
    const sceneId = (sel && sel.value) || "";
    if (!sceneId) return;
    const btn = $("ac-da-assert-scene-live");
    const st = $("ac-da-status-detail") || $("ac-da-status");
    if (btn) { btn.disabled = true; btn.textContent = "全量断言中…（约 1 分钟）"; }
    if (st) st.textContent = "场景全量 live 断言中（逐项 SQL+HTTP，请勿关闭页面）…";
    try {
      const out = await api(`/api/auto-control/data-assert/scenes/${encodeURIComponent(sceneId)}/assert`, {
        method: "POST",
        body: { fixture: false },
      });
      if (!out.ok) {
        if (st) st.textContent = out.error || "场景断言失败";
        return;
      }
      if (st) st.textContent = `场景 live 断言完成：${out.pass}/${out.total} 通过 · ${out.assertedAt}`;
      const ov = await api("/api/auto-control/data-assert/overview");
      if (ov.ok) { daCache = ov; renderDaCatalogList(); }
      renderDaMetricList();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "▶ 全量 live 断言"; }
    }
  }

  async function runDaAssert(useFixture = true) {
    if (!daMetricId) return;
    const st = $("ac-da-status-detail") || $("ac-da-status");
    if (st) st.textContent = useFixture ? "fixture 断言中…" : "live 断言中（SQL+HTTP）…";
    const out = await api(`/api/auto-control/data-assert/metrics/${encodeURIComponent(daMetricId)}/assert`, {
      method: "POST",
      body: { fixture: !!useFixture },
    });
    if (!out.ok) {
      if (st) st.textContent = out.error || "断言失败";
      return;
    }
    if (daDetail) daDetail.lastAssert = out;
    syncDaMetricAssert(out.metricId || daMetricId, out);
    renderDaMetricList();
    renderDaDetail({ ...(daDetail || {}), layers: out.layers, lastAssert: out, metric: (daDetail && daDetail.metric) || { id: out.metricId, name: out.name, mode: out.mode, format: out.format } });
    const modeTag = out.useFixture === false ? "live" : "fixture";
    if (st) st.textContent = `${modeTag} · ${out.status} · ${out.conclusion}`;
    // 刷新列表汇总徽章
    const ov = await api("/api/auto-control/data-assert/overview");
    if (ov.ok) {
      daCache = ov;
      renderDaCatalogList();
    }
  }

  async function openDaProto(kind) {
    const drawer = $("ac-da-proto-drawer");
    const body = $("ac-da-proto-body");
    const title = $("ac-da-proto-title");
    if (!drawer || !body) return;
    let html = "";
    if (kind === "formula" && daDetail) {
      const L2 = (daDetail.layers || {}).L2 || {};
      const proto = L2.prototype || {};
      if (title) title.textContent = `公式原型 · ${(daDetail.metric && daDetail.metric.name) || ""}`;
      html += `<p class="ac-da-formula"><strong>${esc(L2.text || "")}</strong></p>`;
      if (L2.expr) html += `<p><span class="ac-da-mono">${esc(L2.expr)}</span></p>`;
      if (proto.previewUrl) {
        html += `<p><a class="btn btn-sm" href="${esc(proto.previewUrl)}" target="_blank" rel="noopener">打开原型预览页</a></p>`;
      }
      html += `<h4>对照图</h4>`;
      (proto.screenshots || []).forEach((s) => {
        const name = String(s.rel || "").split("/").pop() || "截图";
        html += `<figure class="ac-da-proto-figure"><img src="${esc(s.url)}" alt="${esc(name)}"><figcaption class="cap">${esc(name)}</figcaption></figure>`;
      });
      if (proto.bizDoc) {
        const sceneId = (daDetail.metric && daDetail.metric.scene) || daSceneId;
        const sc = await api(`/api/auto-control/data-assert/scenes/${encodeURIComponent(sceneId)}`);
        if (sc.ok && sc.scene && sc.scene.bizDocText) {
          html += `<h4>业务说明摘录</h4><pre>${esc(sc.scene.bizDocText)}</pre>`;
        } else {
          html += `<p class="hint">业务说明路径：${esc(proto.bizDoc)}</p>`;
        }
      }
    } else {
      const sceneId = daSceneId || (daDetail && daDetail.metric && daDetail.metric.scene) || "";
      if (title) title.textContent = "场景原型 / 业务说明";
      if (!sceneId) {
        html = '<p class="hint">请先选择场景</p>';
      } else {
        const sc = await api(`/api/auto-control/data-assert/scenes/${encodeURIComponent(sceneId)}`);
        if (!sc.ok) html = `<p class="hint">${esc(sc.error || "加载失败")}</p>`;
        else {
          const scene = sc.scene || {};
          if (scene.previewUrl) {
            html += `<p><a class="btn btn-sm" href="${esc(scene.previewUrl)}" target="_blank" rel="noopener">打开原型预览页</a></p>`;
          }
          html += `<h4>场景截图</h4>`;
          const items = scene.screenshotItems || [];
          if (!items.length) html += `<p class="hint">未配置场景截图</p>`;
          items.forEach((s) => {
            const url = `/api/auto-control/data-assert/asset?path=${encodeURIComponent(s.rel)}&scene=${encodeURIComponent(sceneId)}`;
            const name = String(s.rel || "").split("/").pop() || "截图";
            html += `<figure class="ac-da-proto-figure"><img src="${esc(url)}" alt="${esc(name)}"><figcaption class="cap">${esc(name)}</figcaption></figure>`;
          });
          if (scene.bizDocText) html += `<h4>业务说明</h4><pre>${esc(scene.bizDocText)}</pre>`;
        }
      }
    }
    body.innerHTML = html || '<p class="hint">暂无材料</p>';
    drawer.classList.remove("hidden");
  }

  function closeDaProto() {
    const drawer = $("ac-da-proto-drawer");
    if (drawer) drawer.classList.add("hidden");
  }

  function bind() {
    document.querySelectorAll(".ac-tab").forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });
    $("ac-refresh").onclick = () => refreshOverview();
    const runMain = $("ac-run-main");
    if (runMain) runMain.onclick = () => startMainChain();
    const runA = $("ac-run-a");
    if (runA) runA.onclick = () => startRun("A");
    const runB = $("ac-run-b");
    if (runB) runB.onclick = () => startRun("B", { enablePayout: false });
    $("ac-stop").onclick = () => stopRun();
    const stopOv = $("ac-stop-ov");
    if (stopOv) stopOv.onclick = () => stopRun();
    $("ac-poll").onchange = setupPoll;
    $("ac-tasks-refresh").onclick = () => loadTasks({ resetPage: true });
    $("ac-filter-status").onchange = () => loadTasks({ resetPage: true });
    const filterQ = $("ac-filter-q");
    const clearAutofill = () => {
      if (!taskQueryTouched && filterQ) filterQ.value = "";
    };
    clearAutofill();
    filterQ.addEventListener("input", () => {
      taskQueryTouched = true;
    });
    filterQ.onkeydown = (e) => {
      if (e.key === "Enter") {
        taskQueryTouched = true;
        loadTasks({ resetPage: true });
      }
    };
    setTimeout(clearAutofill, 400);
    setTimeout(clearAutofill, 1200);
    $("ac-drawer-close").onclick = closeDrawer;
    $("ac-drawer-mask").onclick = closeDrawer;
    const shotHost = $("ac-drawer-steps");
    if (shotHost) {
      shotHost.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-ac-shot]");
        if (!btn) return;
        openAcShot(Number(btn.getAttribute("data-ac-shot")));
      });
    }
    const shotClose = $("ac-shot-close");
    if (shotClose) shotClose.onclick = closeAcShot;
    const shotMask = $("ac-shot-mask");
    if (shotMask) shotMask.onclick = closeAcShot;
    const shotPrev = $("ac-shot-prev");
    if (shotPrev) shotPrev.onclick = () => stepAcShot(-1);
    const shotNext = $("ac-shot-next");
    if (shotNext) shotNext.onclick = () => stepAcShot(1);
    const shotIn = $("ac-shot-zoom-in");
    if (shotIn) shotIn.onclick = () => setAcShotZoom(acShotZoom * 1.25);
    const shotOut = $("ac-shot-zoom-out");
    if (shotOut) shotOut.onclick = () => setAcShotZoom(acShotZoom / 1.25);
    const shotFit = $("ac-shot-fit");
    if (shotFit) shotFit.onclick = () => setAcShotZoom(1);
    const shotView = $("ac-shot-view");
    if (shotView) {
      shotView.addEventListener("wheel", (ev) => {
        if ($("ac-shot-modal").classList.contains("hidden")) return;
        ev.preventDefault();
        setAcShotZoom(acShotZoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12));
      }, { passive: false });
    }
    document.addEventListener("keydown", (ev) => {
      const modal = $("ac-shot-modal");
      if (!modal || modal.classList.contains("hidden")) return;
      if (ev.key === "Escape") closeAcShot();
      else if (ev.key === "ArrowLeft") stepAcShot(-1);
      else if (ev.key === "ArrowRight") stepAcShot(1);
      else if (ev.key === "+" || ev.key === "=") setAcShotZoom(acShotZoom * 1.25);
      else if (ev.key === "-" || ev.key === "_") setAcShotZoom(acShotZoom / 1.25);
      else return;
      ev.preventDefault();
    });
    const pipeClose = $("ac-pipe-modal-close");
    if (pipeClose) pipeClose.onclick = closePipeModal;
    const pipeRun = $("ac-pipe-modal-run");
    if (pipeRun) pipeRun.onclick = () => runPipeModalOnce();
    const pipeMask = $("ac-pipe-modal-mask");
    if (pipeMask) pipeMask.onclick = closePipeModal;
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closePipeModal();
    });
    const openSettings = $("ac-open-settings");
    if (openSettings) openSettings.onclick = () => switchTab("settings");
    const daRefresh = $("ac-da-refresh");
    if (daRefresh) daRefresh.onclick = () => loadDataAssert();
    const daBack = $("ac-da-back");
    if (daBack) {
      daBack.onclick = () => {
        showDaView("list");
        loadDataAssert();
      };
    }
    const daAssert = $("ac-da-assert");
    if (daAssert) daAssert.onclick = () => runDaAssert(true);
    const daAssertLive = $("ac-da-assert-live");
    if (daAssertLive) daAssertLive.onclick = () => runDaAssert(false);
    const daAssertSceneLive = $("ac-da-assert-scene-live");
    if (daAssertSceneLive) daAssertSceneLive.onclick = () => runDaAssertScene();
    const ovSceneRun = $("ac-run-scene-full");
    if (ovSceneRun) ovSceneRun.onclick = () => enqueueSceneFull();
    const daProto = $("ac-da-open-proto");
    if (daProto) daProto.onclick = () => openDaProto("scene");
    const daProtoClose = $("ac-da-proto-close");
    if (daProtoClose) daProtoClose.onclick = closeDaProto;
    const daProtoMask = $("ac-da-proto-mask");
    if (daProtoMask) daProtoMask.onclick = closeDaProto;
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      const d = $("ac-da-proto-drawer");
      if (d && !d.classList.contains("hidden")) closeDaProto();
    });
    const saveBtn = $("ac-save-token");
    if (saveBtn) saveBtn.onclick = () => saveToken(false);
    const schedBtn = $("ac-save-schedule");
    if (schedBtn) schedBtn.onclick = () => saveSchedule();
    const clearBtn = $("ac-clear-token");
    if (clearBtn) clearBtn.onclick = () => {
      if (confirm("确认清除本机 workbench/.apifox_token？")) saveToken(true);
    };
    const saveChild = $("ac-save-child");
    if (saveChild) saveChild.onclick = () => saveChildSetting();
    const refreshChild = $("ac-refresh-child");
    if (refreshChild) refreshChild.onclick = () => refreshChildStatus();
    const startChild = $("ac-start-child");
    if (startChild) startChild.onclick = () => startChildHost();
    const stopChild = $("ac-stop-child");
    if (stopChild) stopChild.onclick = () => stopChildHost();
    const saveWh = $("ac-save-webhook");
    if (saveWh) saveWh.onclick = () => saveWebhook(false);
    const testWh = $("ac-test-webhook");
    if (testWh) testWh.onclick = () => testWebhook();
    const clearWh = $("ac-clear-webhook");
    if (clearWh) clearWh.onclick = () => {
      if (confirm("确认清除 Webhook URL 与加签密钥？")) saveWebhook(true);
    };
    const previewWh = $("ac-preview-webhook");
    if (previewWh) previewWh.onclick = () => previewWebhook();
    const refreshBridge = $("ac-refresh-bridge");
    if (refreshBridge) refreshBridge.onclick = async () => {
      await api("/api/auto-control/apifox-bridge", { method: "POST", body: {} });
      await loadBridge();
    };
    const batchBtn = $("ac-batch-retry");
    if (batchBtn) batchBtn.onclick = () => batchRetry();
    const cleanBtn = $("ac-cleanup-runs");
    if (cleanBtn) cleanBtn.onclick = () => cleanupRuns();
    const showTok = $("ac-show-token");
    if (showTok) {
      showTok.onchange = () => {
        const input = $("ac-apifox-token");
        if (input) input.type = showTok.checked ? "text" : "password";
      };
    }
    const sortBtn = $("ac-pipe-sort");
    if (sortBtn) {
      sortBtn.onclick = () => {
        pipeSort = pipeSort === "time" ? "created" : "time";
        sortBtn.textContent = pipeSort === "time" ? "按创建时间" : "按执行时间";
        const hint = $("ac-pipe-sort-hint");
        if (hint) {
          hint.textContent = pipeSort === "time"
            ? "当前按执行时间，从早到晚。1 点的排在 2 点前面；没设时间的排在最后。"
            : "当前按创建时间。";
        }
        pipePage = 1;
        renderPipeList();
      };
    }
    const bizToggle = $("ac-biz-toggle");
    if (bizToggle) {
      bizToggle.onclick = () => {
        const card = $("ac-biz-card");
        const body = $("ac-biz-body");
        if (!card || !body) return;
        const open = card.classList.contains("is-collapsed");
        card.classList.toggle("is-collapsed", !open);
        body.hidden = !open;
        bizToggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
    }
  }

  bind();
  setupPoll();
  refreshOverview();
})();
