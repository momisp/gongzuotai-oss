/* 视频替换任务（自动化）· P0～P2 */
(function () {
  const vsState = {
    projects: [],
    flow: [],
    guide: null,
    activeId: "",
    detail: null,
    tab: "overview",
    pollTimer: null,
    pollTick: 0,
    pollSig: "",
    listFp: "",
    compareMode: "shots",
    arkKindFilter: "",
    shotKindFilter: "",
    shotOnlyMarked: false,
    // —— 工作台式两栏（界面改版）新增状态 ——
    scene: "s1", // 顶部 Stepper：s1 分镜审 / s2 包复查 / s3 全片验收 / s4 素材
    segIdx: 0, // S1 当前分镜在筛选后列表中的下标
    arkIdx: 0, // S2 当前包下标
    mediaIdx: 0, // S4 当前素材下标
    cmpVersion: "", // S3 右片版本
    cmpRel: "", // S3 右片被素材浏览指定时的 rel
    stageT0: 0, // 当前段在全片时间轴上的起点，用于把播放时间换算成绝对时间
    layout: { mode: "balanced", split: 58, sidebar: false },
    play: { sync: true, autoNext: false, rate: 1, ab: { on: false, a: null, b: null } },
    draftTimer: null, // 草稿防抖定时器
    savedAt: "", // 最近一次自动保存时间（HH:MM:SS）
  };

  function vsFmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  function vsFileUrl(projectId, rel) {
    return (
      "/api/video-swap/file?project=" +
      encodeURIComponent(projectId || "") +
      "&path=" +
      encodeURIComponent(rel || "")
    );
  }

  function vsStatusLabel(job) {
    const s = (job && job.status) || "idle";
    if (s === "running") return "进行中";
    if (s === "stale") return "已中断";
    if (s === "queued") return "已排队";
    if (s === "failed") return "失败";
    if (s === "done") return "已完成";
    return "空闲";
  }

  // 轮询保护：连续 N 次（× 2.5s ≈ 10 分钟）状态仍为 running 且进度/消息无变化就停
  const VS_POLL_MAX_TICKS = 240;

  function vsJobSig(job) {
    return [job.status, job.progress, job.message, job.step, job.segment_i].join("|");
  }

  function vsStopPoll() {
    if (vsState.pollTimer) {
      clearInterval(vsState.pollTimer);
      vsState.pollTimer = null;
    }
  }

  function vsMarkInterrupted(reason) {
    // 停止轮询并把状态胶囊标成「中断」，提示可重新送方舟
    vsStopPoll();
    vsState.pollTick = 0;
    const pill = document.getElementById("vs-status-pill");
    if (pill) {
      pill.textContent = "已中断";
      pill.className = "vs-status-pill vs-stale";
    }
    const msg = document.getElementById("vs-progress-msg");
    if (msg) msg.textContent = reason || "任务疑似中断（长时间无进度变化），可重新送方舟或点「复位」。";
    const step = document.getElementById("vs-step-label");
    if (step) step.textContent = "任务已中断，等待处理";
    const hit = (vsState.projects || []).find((x) => x.id === vsState.activeId);
    if (hit && hit.job) {
      hit.job = Object.assign({}, hit.job, { status: "stale", message: reason || "" });
    }
    vsRenderProjectList(true);
  }

  function vsRefreshResetBtn(job) {
    // 仅在 running / stale 时显示「任务卡住了？点此复位」
    const btn = document.getElementById("vs-job-reset");
    if (!btn) return;
    const s = (job && job.status) || "idle";
    btn.classList.toggle("hidden", !(s === "running" || s === "stale"));
  }

  window.vsResetStuckJob = async function vsResetStuckJob() {
    const id = vsState.activeId;
    if (!id) return;
    if (!confirm("确认把这个任务复位为「空闲」？日志与错误码会保留，之后可重新送方舟。")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(id) + "/progress/reset", {
      method: "POST",
      body: {},
    });
    if (!res || !res.ok) {
      alert((res && res.error) || "复位失败");
      return;
    }
    vsStopPoll();
    vsState.pollTick = 0;
    vsState.pollSig = "";
    const job = res.job || { status: "idle", progress: 0, message: "" };
    if (vsState.detail) vsState.detail.job = job;
    const hit = (vsState.projects || []).find((x) => x.id === id);
    if (hit) hit.job = job;
    vsRenderProjectList(true);
    const pill = document.getElementById("vs-status-pill");
    if (pill) {
      pill.textContent = vsStatusLabel(job);
      pill.className = "vs-status-pill vs-" + (job.status || "idle");
    }
    const step = document.getElementById("vs-step-label");
    if (step) step.textContent = "流程待命";
    const pct = document.getElementById("vs-progress-pct");
    if (pct) pct.textContent = "0%";
    const fill = document.getElementById("vs-progress-fill");
    if (fill) fill.style.width = "0%";
    const msg = document.getElementById("vs-progress-msg");
    if (msg) msg.textContent = job.message || "已复位，可重新送方舟";
    const errBox = document.getElementById("vs-error-box");
    if (errBox) {
      errBox.classList.add("hidden");
      errBox.textContent = "";
    }
    vsRefreshResetBtn(job);
  };

  function vsMaybePoll(job) {
    vsStopPoll();
    // 注意：这里不要重置 pollTick，否则每轮轮询都会把「无变化」计数清零
    vsState.pollSig = job ? vsJobSig(job) : "";
    if (job && job.status === "running") {
      vsState.pollTimer = setInterval(() => {
        vsPollProgressOnly();
      }, 2500);
    }
  }

  async function vsPollProgressOnly() {
    const id = vsState.activeId;
    if (!id) return;
    try {
      const res = await api("video-swap/projects/" + encodeURIComponent(id) + "/progress", {
        timeoutMs: 8000,
      });
      if (!res || !res.ok || !res.job) return;
      // 轮询保护：签名不变就累计 tick，超过阈值判定为中断
      const sig = vsJobSig(res.job);
      if (sig !== vsState.pollSig) {
        vsState.pollSig = sig;
        vsState.pollTick = 0;
      } else {
        vsState.pollTick = (vsState.pollTick || 0) + 1;
      }
      if (vsState.detail) {
        vsState.detail.job = res.job;
        // 只刷新进度条/状态，不重拉分镜与成片列表
        const p = vsState.detail;
        const pill = document.getElementById("vs-status-pill");
        if (pill) {
          pill.textContent = vsStatusLabel(res.job);
          pill.className = "vs-status-pill vs-" + (res.job.status || "idle");
        }
        const step = document.getElementById("vs-step-label");
        const pct = document.getElementById("vs-progress-pct");
        const fill = document.getElementById("vs-progress-fill");
        const msg = document.getElementById("vs-progress-msg");
        const progress = Number(res.job.progress) || 0;
        let stepText = res.job.step_label || (res.job.status === "running" ? "处理中…" : "流程待命");
        if (res.job.segment_i != null && res.job.segment_n != null) {
          stepText += `（${res.job.segment_i}/${res.job.segment_n} 段）`;
        }
        if (step) step.textContent = stepText;
        if (pct) pct.textContent = progress + "%";
        if (fill) fill.style.width = Math.max(0, Math.min(100, progress)) + "%";
        if (msg) msg.textContent = res.job.message || "";
        vsRefreshResetBtn(res.job);
        vsMaybePoll(res.job);
        // 后端已收敛为 stale：直接按中断处理，不再空转轮询
        if (res.job.status === "stale") {
          vsMarkInterrupted(res.job.message || "任务已中断（心跳超时），可重新送方舟。");
          return;
        }
        // 前端兜底：长时间无变化也停（后端心跳失效时）
        if ((vsState.pollTick || 0) >= VS_POLL_MAX_TICKS) {
          vsMarkInterrupted("任务疑似中断（超过 10 分钟无进度变化），可重新送方舟或点「复位」。");
          return;
        }
        // 列表卡片上的进度也同步
        const hit = (vsState.projects || []).find((x) => x.id === id);
        if (hit) hit.job = res.job;
        vsRenderProjectList();
      } else {
        vsSelectProject(id, true);
      }
    } catch (_) {
      /* 进度轮询失败不打断页面 */
    }
  }

  function vsSimpleMarkdown(md) {
    const lines = String(md || "").split(/\r?\n/);
    const out = [];
    let inCode = false;
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.startsWith("```")) {
        if (inCode) {
          out.push("</code></pre>");
          inCode = false;
        } else {
          out.push("<pre class=\"vs-md-code\"><code>");
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        out.push(escapeHtml(line) + "\n");
        continue;
      }
      if (/^\|/.test(line) && /^\|/.test(lines[i + 1] || "")) {
        if (!inTable) {
          out.push('<div class="vs-md-table-wrap"><table class="vs-md-table">');
          inTable = true;
        }
        const cells = line.split("|").slice(1, -1);
        const isSep = cells.every((c) => /^[\s:-]+$/.test(c));
        if (isSep) continue;
        const tag = out[out.length - 1].includes("<th") || out[out.length - 1].includes("</thead>") ? "td" : "th";
        if (tag === "th" && !out[out.length - 1].includes("<thead")) out.push("<thead>");
        if (tag === "td" && out[out.length - 1].includes("</thead>") === false && out.some((x) => x === "<thead>")) {
          // close thead once we hit body
        }
        const row =
          "<tr>" +
          cells.map((c) => `<${tag}>${escapeHtml(c.trim())}</${tag}>`).join("") +
          "</tr>";
        if (tag === "th") {
          out.push(row);
          // peek next sep then close thead
          if (/^\|/.test(lines[i + 1] || "") && (lines[i + 1] || "").includes("---")) {
            out.push("</thead><tbody>");
          }
        } else {
          out.push(row);
        }
        if (!/^\|/.test(lines[i + 1] || "")) {
          out.push("</tbody></table></div>");
          inTable = false;
        }
        continue;
      }
      if (inTable) {
        out.push("</tbody></table></div>");
        inTable = false;
      }
      if (/^### /.test(line)) {
        out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
        continue;
      }
      if (/^## /.test(line)) {
        out.push(`<h2 id="vs-h-${escapeHtml(line.slice(3).slice(0, 24))}">${escapeHtml(line.slice(3))}</h2>`);
        continue;
      }
      if (/^# /.test(line)) {
        out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
        continue;
      }
      if (/^> /.test(line)) {
        out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`);
        continue;
      }
      if (/^- \[ \] /.test(line)) {
        out.push(`<div class="vs-check">☐ ${escapeHtml(line.slice(6))}</div>`);
        continue;
      }
      if (/^- \[x\] /i.test(line)) {
        out.push(`<div class="vs-check">☑ ${escapeHtml(line.slice(6))}</div>`);
        continue;
      }
      if (/^[-*] /.test(line)) {
        out.push(`<li>${inlineMd(line.slice(2))}</li>`);
        continue;
      }
      if (/^\d+\. /.test(line)) {
        out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ""))}</li>`);
        continue;
      }
      if (!line.trim()) {
        out.push("<br>");
        continue;
      }
      out.push(`<p>${inlineMd(line)}</p>`);
    }
    if (inCode) out.push("</code></pre>");
    if (inTable) out.push("</tbody></table></div>");
    return out.join("\n");
  }

  function inlineMd(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return s;
  }

  async function vsLoadGuide(force) {
    if (vsState.guide && !force) return vsState.guide;
    const res = await api("video-swap/guide");
    if (res && res.ok) {
      vsState.guide = res;
      const inline = document.getElementById("vs-guide-toc-inline");
      if (inline && res.toc) {
        inline.textContent = res.toc.map((t) => t.title.replace(/^第.+?：/, "")).join(" → ");
      }
      const toc = document.getElementById("vs-guide-toc");
      if (toc) {
        toc.innerHTML = (res.toc || [])
          .map(
            (t) => `
          <div class="vs-guide-card">
            <strong>${escapeHtml(t.title)}</strong>
            <span>${escapeHtml(t.summary || "")}</span>
          </div>`
          )
          .join("");
      }
      const body = document.getElementById("vs-guide-body");
      if (body) body.innerHTML = vsSimpleMarkdown(res.markdown || "");
    }
    return vsState.guide;
  }

  window.vsShowGuide = async function vsShowGuide(openTab) {
    await vsLoadGuide(true);
    if (openTab) {
      if (!vsState.detail) {
        // still show guide in empty state via switching after select first
        if (vsState.projects[0]) await vsSelectProject(vsState.projects[0].id);
      }
      vsOpenMore("guide");
    }
  };

  /** 新浏览器标签打开独立工作台页（更大、少被侧栏挤）。 */
  window.vsOpenStandalone = function vsOpenStandalone() {
    if (document.body && document.body.classList.contains("vs-standalone-body")) {
      alert("当前已是独立页。可用地址栏分享，或点「← 工作台首页」回主站。");
      return;
    }
    const q = new URLSearchParams();
    if (vsState.activeId) q.set("project", vsState.activeId);
    if (vsState.scene) q.set("scene", vsState.scene);
    const url = "/video-swap" + (q.toString() ? "?" + q.toString() : "");
    window.open(url, "_blank", "noopener");
  };

  /** 读取 ?project=&scene=（独立页深链）。 */
  function vsReadUrlBoot() {
    try {
      const q = new URLSearchParams(location.search || "");
      const project = (q.get("project") || "").trim();
      const scene = (q.get("scene") || "").trim().toLowerCase();
      return {
        project: project,
        scene: ["s1", "s2", "s3", "s4"].indexOf(scene) >= 0 ? scene : "",
      };
    } catch (_) {
      return { project: "", scene: "" };
    }
  }

  /** 打开界面使用说明书弹层（与「业务流程说明」不同）。 */
  window.vsShowManual = async function vsShowManual() {
    const modal = document.getElementById("vs-manual-modal");
    const body = document.getElementById("vs-manual-body");
    if (!modal || !body) {
      alert("说明书弹层未加载，请 Ctrl+F5 强刷后重试。");
      return;
    }
    body.innerHTML = `<p class="hint">加载说明书…</p>`;
    modal.classList.remove("hidden");
    const res = await api("video-swap/manual");
    if (!res || !res.ok) {
      body.innerHTML = `<p class="hint">${escapeHtml((res && res.error) || "加载失败")}</p>`;
      return;
    }
    body.innerHTML = vsSimpleMarkdown(res.markdown || "");
    body.scrollTop = 0;
  };

  window.vsCloseManual = function vsCloseManual(ev) {
    // 点遮罩关闭；按钮直接 vsCloseManual() 无 event
    if (ev && ev.target && ev.target.id !== "vs-manual-modal") return;
    const modal = document.getElementById("vs-manual-modal");
    if (modal) modal.classList.add("hidden");
  };

  /** 展开「更多」区（旧 Tab 功能收在这里，不丢功能）并切到指定 Tab。 */
  window.vsOpenMore = function vsOpenMore(tab) {
    const more = document.getElementById("vs-more");
    if (more) more.open = true;
    vsSwitchTab(tab || "overview");
    if (more && more.scrollIntoView) more.scrollIntoView({ block: "nearest" });
  };

  window.loadVideoSwapPage = async function loadVideoSwapPage(quiet) {
    try {
      // 工作台布局：先读本地偏好再渲染，避免首帧闪动
      vsState.layout = vsLoadLayout();
      vsApplyLayout();
      vsInitSplitter();
      vsInitKeys();
      vsLoadGuide();
      const boot = vsReadUrlBoot();
      if (boot.project) vsState.activeId = boot.project;
      if (boot.scene) vsState.scene = boot.scene;
      const res = await api("video-swap/projects");
      if (!res.ok && res.error) {
        const list = document.getElementById("vs-project-list");
        if (list) list.innerHTML = `<div class="hint">${escapeHtml(res.error)}</div>`;
        return;
      }
      vsState.projects = res.projects || [];
      vsState.flow = res.flow || [];
      const count = document.getElementById("vs-proj-count");
      if (count) count.textContent = `${vsState.projects.length} 个`;
      vsRenderProjectList();
      if (!vsState.activeId && vsState.projects.length) {
        vsState.activeId = vsState.projects[0].id;
      }
      if (vsState.activeId) {
        await vsSelectProject(vsState.activeId, !!quiet);
        if (boot.scene) await vsSetScene(boot.scene);
      }
    } catch (err) {
      const list = document.getElementById("vs-project-list");
      if (list) list.innerHTML = `<div class="hint">加载失败：${escapeHtml(err.message || String(err))}</div>`;
    }
  };

  window.vsRefresh = async function vsRefresh(quiet) {
    await loadVideoSwapPage(quiet);
  };

  function vsListFingerprint() {
    // 只取影响视觉的字段；其他变化（如 logs）不触发整段 innerHTML 重建
    return (vsState.projects || [])
      .map((p) => {
        const job = p.job || {};
        const lo = p.latest_output || {};
        return [
          p.id,
          job.status || "idle",
          job.progress || 0,
          lo.version || "",
          lo.size || 0,
          p.id === vsState.activeId ? "1" : "0",
        ].join(":");
      })
      .join("||");
  }

  function vsRenderProjectList(force) {
    const box = document.getElementById("vs-project-list");
    if (!box) return;
    if (!vsState.projects.length) {
      vsState.listFp = "";
      box.innerHTML = `<div class="hint">暂无项目。可点右上角「新建项目」。</div>`;
      return;
    }
    // 指纹未变则跳过重建，避免每 2.5s 全量重绘导致运行中卡片抖动
    const fp = vsListFingerprint();
    if (!force && fp === vsState.listFp) return;
    vsState.listFp = fp;
    box.innerHTML = vsState.projects
      .map((p) => {
        const job = p.job || {};
        const running = job.status === "running";
        const stale = job.status === "stale";
        const failed = job.status === "failed";
        const latest = p.latest_output;
        const meta = latest
          ? `${escapeHtml(latest.version || "")} · ${vsFmtSize(latest.size)}`
          : "暂无成片";
        return `
        <button type="button" class="vs-proj-item${p.id === vsState.activeId ? " is-active" : ""}${running ? " is-running" : ""}${stale ? " is-stale" : ""}${failed ? " is-failed" : ""}"
          onclick="vsSelectProject('${escapeHtml(p.id)}')">
          <div class="vs-proj-name">
            ${escapeHtml(p.name)}
            ${running ? '<span class="vs-spinner" title="进行中"></span>' : ""}
            ${stale ? '<span class="vs-stale-dot" title="已中断">!</span>' : ""}
            ${failed ? '<span class="vs-fail-dot" title="失败">!</span>' : ""}
          </div>
          <div class="vs-proj-meta">${escapeHtml(p.subtitle || "")}</div>
          <div class="vs-proj-meta">${escapeHtml(meta)}${p.recommended_version ? " · 基线 " + escapeHtml(p.recommended_version) : ""}</div>
        </button>`;
      })
      .join("");
  }

  window.vsSelectProject = async function vsSelectProject(id, quiet) {
    vsState.activeId = id;
    vsRenderProjectList();
    const empty = document.getElementById("vs-empty");
    const detail = document.getElementById("vs-detail");
    if (!quiet) {
      if (empty) empty.textContent = "加载中…";
      if (empty) empty.classList.remove("hidden");
      if (detail) detail.classList.add("hidden");
    }
    try {
      const res = await api("video-swap/projects/" + encodeURIComponent(id), { timeoutMs: 45000 });
      if (!res || !res.ok) {
        if (empty) empty.textContent = (res && res.error) || "加载失败";
        if (detail) detail.classList.add("hidden");
        return;
      }
      vsState.detail = res.project;
      if (empty) empty.classList.add("hidden");
      if (detail) detail.classList.remove("hidden");
      vsRenderDetail();
      vsMaybePoll(res.project.job);
    } catch (err) {
      if (empty) empty.textContent = "加载失败：" + (err.message || String(err));
      if (detail) detail.classList.add("hidden");
    }
  };

  function vsRenderDetail() {
    const p = vsState.detail;
    if (!p) return;
    const title = document.getElementById("vs-title");
    const sub = document.getElementById("vs-subtitle");
    if (title) title.textContent = p.name || p.id;
    if (sub) {
      sub.textContent =
        (p.subtitle || "") +
        (p.recommended_version ? " · 基线 " + p.recommended_version : "") +
        (p.notes ? " · " + p.notes : "");
    }

    const job = p.job || {};
    const pill = document.getElementById("vs-status-pill");
    if (pill) {
      pill.textContent = vsStatusLabel(job);
      pill.className = "vs-status-pill vs-" + (job.status || "idle");
    }
    const step = document.getElementById("vs-step-label");
    const pct = document.getElementById("vs-progress-pct");
    const fill = document.getElementById("vs-progress-fill");
    const msg = document.getElementById("vs-progress-msg");
    const errBox = document.getElementById("vs-error-box");
    const progress = Number(job.progress) || 0;
    let stepText = job.step_label || (job.status === "running" ? "处理中…" : "流程待命");
    if (job.segment_i != null && job.segment_n != null) {
      stepText += `（${job.segment_i}/${job.segment_n} 段）`;
    }
    if (step) step.textContent = stepText;
    if (pct) pct.textContent = progress + "%";
    if (fill) fill.style.width = Math.max(0, Math.min(100, progress)) + "%";
    if (msg) msg.textContent = job.message || (job.updated_at ? "更新于 " + job.updated_at : "");
    if (errBox) {
      if ((job.status === "failed" || job.status === "stale") && (job.error_code || job.message)) {
        errBox.classList.remove("hidden");
        const head = job.status === "stale" ? "已中断" : "失败";
        errBox.innerHTML = `<strong>${head}</strong> ${escapeHtml(job.error_code || "")}<br>${escapeHtml(job.message || "")}`;
      } else {
        errBox.classList.add("hidden");
        errBox.textContent = "";
      }
    }
    vsRefreshResetBtn(job);

    const flowBox = document.getElementById("vs-flow");
    const flow = p.flow && p.flow.length ? p.flow : vsState.flow;
    if (flowBox) {
      const cur = job.step || "";
      const done = job.status === "done";
      flowBox.innerHTML = (flow || [])
        .map((s) => {
          let cls = "vs-flow-step";
          if (done || s.id === "done" && job.status === "done") cls += " is-done";
          else if (cur && s.id === cur) cls += job.status === "failed" ? " is-failed" : " is-active";
          else if (cur) {
            const ids = flow.map((x) => x.id);
            if (ids.indexOf(s.id) < ids.indexOf(cur)) cls += " is-done";
          }
          return `<div class="${cls}"><span class="vs-flow-dot"></span>${escapeHtml(s.label || s.id)}</div>`;
        })
        .join("");
    }

    vsRenderOverview(p);
    vsRenderCostumes(p);
    vsRenderSources(p);
    vsRenderOutputs(p);
    vsRenderReports(p);
    vsRenderLogs(p);
    vsLoadGuide();
    vsSwitchTab(vsState.tab || "overview");
    // 工作台两栏：STAGE（常驻视频）+ CONTEXT（随场景/当前段）
    document.querySelectorAll(".vs-step").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-scene") === (vsState.scene || "s1"));
    });
    vsRenderStage();
    vsRenderContext();
  }

  function vsPickRecommended(p) {
    const rec = String(p.recommended_version || "").toLowerCase();
    const outs = (p.outputs || []).filter((o) => !o.is_silent && !o.is_compare);
    if (rec) {
      const hit = outs.find((o) => String(o.version || "").toLowerCase() === rec);
      if (hit) return hit;
    }
    return outs[0] || p.latest_output || null;
  }

  function vsRenderOverview(p) {
    const box = document.getElementById("vs-overview");
    if (!box) return;
    const c = p.counts || {};
    const pick = vsPickRecommended(p);
    const guide = vsState.guide;
    box.innerHTML = `
      <div class="vs-stat-row">
        <div class="vs-stat"><b>${c.costumes || 0}</b><span>定妆照</span></div>
        <div class="vs-stat"><b>${c.sources || 0}</b><span>原片</span></div>
        <div class="vs-stat"><b>${(p.outputs || []).filter((o) => !o.is_compare).length}</b><span>成片</span></div>
        <div class="vs-stat"><b>${(p.reports || []).length}</b><span>报告</span></div>
      </div>
      <div class="vs-mini-flow">
        ${(guide && guide.toc ? guide.toc : [])
          .map((t, i) => `<span><i>${i + 1}</i>${escapeHtml(t.title.replace(/^第.+?：/, ""))}</span>`)
          .join("<em>→</em>")}
        <button type="button" class="btn btn-sm" onclick="vsOpenMore('guide')">打开流程说明</button>
      </div>
      ${
        pick
          ? `<div class="vs-hero-media">
              <div class="vs-hero-meta">
                <strong>推荐基线成片</strong>
                <span>${escapeHtml(pick.label || pick.name)} · ${escapeHtml(pick.version || "")} · ${vsFmtSize(pick.size)}</span>
                <span class="hint">${escapeHtml(pick.mtime || "")}</span>
                <span class="hint">${escapeHtml(pick.rel || "")}</span>
              </div>
              <div class="vs-hero-actions">
                <button type="button" class="btn primary" onclick="vsPreview('${escapeHtml(p.id)}','${escapeHtml(pick.rel)}','video','${escapeHtml(pick.name)}')">播放基线成片</button>
                <button type="button" class="btn" onclick="vsBuildCompare()">生成对照（前12秒）</button>
                <a class="btn" href="${vsFileUrl(p.id, pick.rel)}" download>下载</a>
              </div>
            </div>`
          : `<div class="hint">尚无成片。请按「流程说明」完成定妆、切段与生成。</div>`
      }
      ${p.notes ? `<p class="vs-note">${escapeHtml(p.notes)}</p>` : ""}
      <p class="hint">固定目录：<code>${escapeHtml(p.root || "")}</code></p>
    `;
  }

  function vsRenderCostumes(p) {
    const box = document.getElementById("vs-costumes");
    if (!box) return;
    const items = p.costumes || [];
    if (!items.length) {
      box.innerHTML = `<div class="hint">未找到定妆照。标准：每角色正面/侧面/背面/面部特写四张，放入定妆照/角色*_过审向_仅配色/。</div>`;
      return;
    }
    const groups = {};
    items.forEach((it) => {
      const g = it.group || "未分组";
      if (!groups[g]) groups[g] = [];
      groups[g].push(it);
    });
    box.innerHTML = Object.keys(groups)
      .map((g) => {
        const cards = groups[g]
          .map(
            (it) => `
          <button type="button" class="vs-thumb" onclick="vsPreview('${escapeHtml(p.id)}','${escapeHtml(it.rel)}','image','${escapeHtml(it.label || it.name)}')">
            <img src="${vsFileUrl(p.id, it.rel)}" alt="${escapeHtml(it.name)}" loading="lazy">
            <span>${escapeHtml(it.name)}</span>
          </button>`
          )
          .join("");
        return `<details class="vs-group" open><summary>${escapeHtml(g)} · ${groups[g].length} 张</summary><div class="vs-grid">${cards}</div></details>`;
      })
      .join("");
  }

  function vsMediaCard(p, it, badge) {
    const url = vsFileUrl(p.id, it.rel);
    return `
      <div class="vs-media-card">
        <div class="vs-media-main">
          <div class="vs-media-title">
            <strong>${escapeHtml(it.label || it.name)}</strong>
            <span class="vs-badge">${escapeHtml(badge || it.version || "")}</span>
            ${it.is_compare ? '<span class="vs-badge vs-badge-cmp">对照</span>' : ""}
            ${it.is_silent ? '<span class="vs-badge">无声</span>' : ""}
          </div>
          <div class="vs-media-meta hint">${vsFmtSize(it.size)} · ${escapeHtml(it.mtime || "")} · ${escapeHtml(it.rel || "")}</div>
        </div>
        <div class="vs-media-actions">
          <button type="button" class="btn primary" onclick="vsPreview('${escapeHtml(p.id)}','${escapeHtml(it.rel)}','video','${escapeHtml(it.name)}')">播放</button>
          <a class="btn" href="${url}" download>下载</a>
          <a class="btn" href="${url}" target="_blank" rel="noopener">新窗口</a>
        </div>
      </div>`;
  }

  function vsRenderSources(p) {
    const box = document.getElementById("vs-sources");
    if (!box) return;
    const items = p.sources || [];
    if (!items.length) {
      box.innerHTML = `<div class="hint">未登记原片。放入参考视频/ 并在项目登记 source_videos。</div>`;
      return;
    }
    box.innerHTML = items.map((it) => vsMediaCard(p, it, "原片")).join("");
  }

  function vsRenderOutputs(p) {
    const box = document.getElementById("vs-outputs");
    if (!box) return;
    const groups = p.version_groups || [];
    if (!groups.length) {
      box.innerHTML = `<div class="hint">暂无成片版本</div>`;
      return;
    }
    box.innerHTML = groups
      .map((g) => {
        const items = (g.items || []).map((it) => vsMediaCard(p, it, g.is_baseline ? g.version + " · 基线" : g.version)).join("");
        return `
        <details class="vs-group" ${g.is_baseline ? "open" : ""}>
          <summary>
            <strong>${escapeHtml(g.version)}</strong>
            ${g.is_baseline ? '<span class="vs-badge">推荐基线</span>' : ""}
            <span class="hint">${(g.items || []).length} 个文件</span>
            ${
              !g.is_baseline
                ? `<button type="button" class="btn btn-sm" onclick="event.preventDefault();vsSetBaseline('${escapeHtml(g.version)}')">设为基线</button>`
                : ""
            }
          </summary>
          ${items}
        </details>`;
      })
      .join("");
  }

  /* ==========================================================================
   * 工作台两栏（界面改版）
   *   顶部 Stepper：S1 分镜对照审核 / S2 送方舟包复查 / S3 全片对照验收 / S4 素材浏览
   *   左 STAGE：视频区常驻（只换 src + video.load()，不重建整页 DOM）
   *   右 CONTEXT：材料区随场景与当前段变化
   * 取代原来的「对照页 3 子 Tab + 几十张纵向重卡片」。
   * ========================================================================== */

  const VS_SCENES = [
    { id: "s1", name: "分镜对照审核" },
    { id: "s2", name: "送方舟包复查" },
    { id: "s3", name: "全片对照验收" },
    { id: "s4", name: "素材浏览" },
  ];
  const VS_LAYOUT_KEY = "vs_layout_v1";
  const VS_ACCEPT_KEY = "vs_accept_v1";
  const VS_ACCEPT_ITEMS = [
    { id: "face", label: "表情自然" },
    { id: "orient", label: "朝向正确" },
    { id: "hand", label: "手部无畸变" },
    { id: "camera", label: "运镜连贯" },
    { id: "scene", label: "未换景" },
  ];

  // ---------- 布局：三档模式 + 拖拽分隔条 + localStorage ----------

  /** 读取本地布局偏好（均衡 / 视频最大化 / 面板优先 + 比例 + 侧栏收起）。 */
  function vsLoadLayout() {
    const def = { mode: "balanced", split: 58, sidebar: false };
    try {
      const raw = localStorage.getItem(VS_LAYOUT_KEY);
      if (!raw) return def;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return def;
      return {
        mode: ["balanced", "video", "panel"].indexOf(obj.mode) >= 0 ? obj.mode : "balanced",
        split: Math.max(30, Math.min(80, Number(obj.split) || 58)),
        sidebar: !!obj.sidebar,
      };
    } catch (_) {
      return def;
    }
  }

  /** 写入本地布局偏好（键 vs_layout_v1）。 */
  function vsSaveLayout() {
    try {
      localStorage.setItem(VS_LAYOUT_KEY, JSON.stringify(vsState.layout));
    } catch (_) {
      /* localStorage 不可用时静默降级 */
    }
  }

  /** 把 vsState.layout 应用到 DOM（两栏比例 / 模式 / 侧栏收起）。 */
  function vsApplyLayout() {
    const wb = document.getElementById("vs-workbench");
    const lay = document.getElementById("vs-layout");
    const ctx = document.getElementById("vs-context");
    const sp = document.getElementById("vs-splitter");
    const mode = vsState.layout.mode || "balanced";
    const split = vsState.layout.split || 58;
    if (wb) {
      wb.classList.toggle("is-video-max", mode === "video");
      wb.classList.toggle("is-panel-first", mode === "panel");
      if (mode === "balanced") {
        wb.style.gridTemplateColumns = split + "fr 8px " + (100 - split) + "fr";
      } else {
        wb.style.gridTemplateColumns = "";
      }
    }
    if (ctx) ctx.classList.toggle("hidden", mode === "video");
    if (sp) sp.classList.toggle("hidden", mode !== "balanced");
    if (lay) lay.classList.toggle("is-sidebar-collapsed", !!vsState.layout.sidebar);
    document.querySelectorAll(".vs-lm").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-mode") === mode);
    });
    const tgl = document.getElementById("vs-sidebar-toggle");
    if (tgl) tgl.textContent = vsState.layout.sidebar ? "项目栏 »" : "« 项目栏";
  }

  /** 切换三档布局模式：balanced / video / panel。 */
  window.vsSetLayoutMode = function vsSetLayoutMode(mode) {
    vsState.layout.mode = mode || "balanced";
    vsApplyLayout();
    vsSaveLayout();
  };

  /** 收起/展开左侧项目栏（快捷键 Ctrl/Cmd+B）。 */
  window.vsToggleSidebar = function vsToggleSidebar() {
    vsState.layout.sidebar = !vsState.layout.sidebar;
    vsApplyLayout();
    vsSaveLayout();
  };

  let vsSplitterInited = false;

  /** 初始化分隔条拖拽（只绑一次；双击回到 58% 均衡）。 */
  function vsInitSplitter() {
    if (vsSplitterInited) return;
    const sp = document.getElementById("vs-splitter");
    if (!sp) return;
    vsSplitterInited = true;
    const wb = document.getElementById("vs-workbench");
    let dragging = false;
    const onMove = (ev) => {
      if (!dragging || !wb) return;
      const rect = wb.getBoundingClientRect();
      if (!rect.width) return;
      const pct = ((ev.clientX || 0) - rect.left) / rect.width * 100;
      vsState.layout.split = Math.round(Math.max(30, Math.min(80, pct)));
      vsState.layout.mode = "balanced";
      vsApplyLayout();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("vs-dragging");
      vsSaveLayout();
    };
    sp.addEventListener("mousedown", (ev) => {
      if (vsState.layout.mode !== "balanced") {
        vsState.layout.mode = "balanced";
        vsApplyLayout();
      }
      dragging = true;
      document.body.classList.add("vs-dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      ev.preventDefault();
    });
    sp.addEventListener("dblclick", () => {
      vsState.layout.mode = "balanced";
      vsState.layout.split = 58;
      vsApplyLayout();
      vsSaveLayout();
    });
  }

  let vsKeysInited = false;

  /** 全局快捷键：\ 视频最大化、Shift+\ 面板优先、Ctrl/Cmd+B 收起项目栏、←/→ 上下段。 */
  function vsInitKeys() {
    if (vsKeysInited) return;
    vsKeysInited = true;
    document.addEventListener("keydown", (ev) => {
      const wb = document.getElementById("vs-workbench");
      if (!wb || !wb.offsetParent) return; // 不在视频替换页：不拦截
      const t = ev.target || {};
      const tag = String(t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable) return;
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "b" || ev.key === "B")) {
        ev.preventDefault();
        vsToggleSidebar();
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "\\" || ev.key === "|") {
        ev.preventDefault();
        if (ev.shiftKey) vsSetLayoutMode(vsState.layout.mode === "panel" ? "balanced" : "panel");
        else vsSetLayoutMode(vsState.layout.mode === "video" ? "balanced" : "video");
        return;
      }
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        vsSegStep(-1);
        return;
      }
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        vsSegStep(1);
      }
    });
  }

  // ---------- 场景数据：当前场景的「段」列表 ----------

  /** S1 的分镜段（受分类筛选 / 只看已标记影响）。 */
  function vsShotSegments() {
    const p = vsState.detail;
    if (!p) return [];
    const sc = p.shot_compare || {};
    if (!sc.enabled) return [];
    const filter = vsState.shotKindFilter || "";
    const onlyMarked = !!vsState.shotOnlyMarked;
    return (sc.items || []).filter((s) => {
      if (filter && s.kind !== filter) return false;
      if (onlyMarked && !s.marked) return false;
      return true;
    });
  }

  /** S2 的送方舟包（受后端 ark.kinds 驱动的分类筛选影响，失效筛选自动作废）。 */
  function vsArkSegments() {
    const p = vsState.detail;
    if (!p) return [];
    const ark = (p.shot_compare && p.shot_compare.ark_packs) || p.ark_packs || { items: [], kinds: [] };
    const items = ark.items || [];
    const kinds = ark.kinds || [];
    let f = vsState.arkKindFilter || "";
    if (f && kinds.length && kinds.indexOf(f) < 0) f = "";
    return f ? items.filter((x) => x.kind === f) : items;
  }

  /** S4 的素材（定妆照 + 原片 + 成片，保持顺序）。 */
  function vsMediaSegments() {
    const p = vsState.detail;
    if (!p) return [];
    const list = [];
    (p.costumes || []).forEach((it) => list.push({ group: "定妆照", item: it, isImage: true }));
    (p.sources || []).forEach((it) => list.push({ group: "原片", item: it, isImage: false }));
    (p.outputs || []).forEach((it) => list.push({ group: "成片", item: it, isImage: false }));
    return list;
  }

  /** 取送方舟包数据与闸门/覆盖状态，供 STAGE 告警条与 CONTEXT 共用。 */
  function vsArkData(p) {
    const sc = (p && p.shot_compare) || {};
    const ark = sc.ark_packs && sc.ark_packs.items ? sc.ark_packs : ((p && p.ark_packs) || { items: [], kinds: [], total: 0 });
    const arkItems = ark.items || [];
    const arkKinds = ark.kinds && ark.kinds.length ? ark.kinds : [];
    const coverage = ark.coverage || null;
    const gates = ark.gates || sc.gates || ((p && p.gates) || {});
    const canBuild = gates.can_build !== false && !!(gates.shot_review && gates.shot_review.ok);
    const coverageOk = !coverage || !!coverage.skipped || !!coverage.ok;
    const canSend = coverageOk && !!(gates.can_send || (gates.ark_review && gates.ark_review.ok));
    return { sc, ark, arkItems, arkKinds, coverage, gates, canBuild, coverageOk, canSend };
  }

  /** 闸门状态条（闸门1 分镜审 / 已拼包 / 闸门2 包复查）。 */
  function vsGateBannerHtml(d) {
    const g = d.gates || {};
    return `
      <div class="vs-gate-banner">
        <div class="vs-gate-item${g.shot_review && g.shot_review.ok ? " is-ok" : " is-block"}">
          闸门1 分镜审 ${g.shot_review && g.shot_review.ok ? "✓" : "×"}
          <span class="hint">${escapeHtml((g.shot_review && (g.shot_review.ok ? g.shot_review.at : g.shot_review.reason)) || "请先保存分镜标记并点「保存并确认闸门1」")}</span>
        </div>
        <div class="vs-gate-item${g.packs_built && g.packs_built.ok ? " is-ok" : ""}">
          已拼包 ${g.packs_built && g.packs_built.ok ? "✓ " + (g.packs_built.count || 0) : "×"}
        </div>
        <div class="vs-gate-item${g.ark_review && g.ark_review.ok ? " is-ok" : " is-block"}">
          闸门2 包复查 ${g.ark_review && g.ark_review.ok ? "✓" : "×"}
          <span class="hint">${escapeHtml((g.ark_review && (g.ark_review.ok ? g.ark_review.at : g.ark_review.reason)) || "")}</span>
        </div>
      </div>`;
  }

  /** 分镜覆盖告警条（今早新增，不得回退）：完整绿条 / 不完整红条 + 明细。 */
  function vsCoverageBannerHtml(d) {
    const c = d.coverage;
    if (!c || c.skipped) return "";
    const ok = !!c.ok;
    const exp = c.expected_count || 0;
    const miss = c.missing_count || 0;
    const dup = c.dup_count || 0;
    const extra = c.extra_count || 0;
    const covered = c.covered_count || 0;
    const detail = [
      miss ? `缺段（${miss}）：${(c.missing || []).join("、")}` : "",
      dup ? `重复（${dup}）：${(c.dup || []).join("、")}` : "",
      extra ? `过期（${extra}）：${(c.extra || []).join("、")}` : "",
    ]
      .filter(Boolean)
      .map((t) => `<div class="vs-cov-line">${escapeHtml(t)}</div>`)
      .join("");
    if (ok) {
      return `
      <div class="vs-coverage is-ok">
        <strong>分镜覆盖完整 ${covered}/${exp}</strong>
        <span class="hint">（空镜不送方舟，未计入）</span>
      </div>`;
    }
    return `
      <div class="vs-coverage is-bad">
        <div class="vs-coverage-head">
          <strong>分镜覆盖不完整 ${covered}/${exp}</strong>
          <span>缺 ${miss} 段 · 重复 ${dup} 段 · 过期 ${extra} 段</span>
          <span class="hint">已硬编进闸门：不修好不能过闸门2 / 送方舟</span>
        </div>
        ${detail ? `<details class="vs-coverage-detail"><summary>展开明细</summary>${detail}</details>` : ""}
        <div class="hint">${escapeHtml(c.reason || "")}</div>
      </div>`;
  }

  // ---------- STAGE：常驻视频区 ----------

  /** 给 <video> 换源（同源自建跳过，换源后 video.load()）。 */
  function vsSetVideoSrc(video, src) {
    if (!video) return;
    const cur = video.getAttribute("src") || "";
    if (src === cur) return;
    if (!src) {
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch (_) {
        /* 忽略：无源时 load 可能抛错 */
      }
      return;
    }
    video.setAttribute("src", src);
    try {
      video.load();
    } catch (_) {
      /* 忽略 */
    }
  }

  /** 在无源时于视频框内显示占位文案；有源时移除占位。 */
  function vsSetCellEmpty(cellId, text) {
    const cell = document.getElementById(cellId);
    if (!cell) return;
    const frame = cell.querySelector(".vs-video-frame");
    if (!frame) return;
    let ph = frame.querySelector(".vs-frame-empty");
    if (!text) {
      if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
      return;
    }
    if (!ph) {
      ph = document.createElement("div");
      ph.className = "vs-frame-empty";
      frame.appendChild(ph);
    }
    ph.textContent = text;
  }

  /** 分类 → 稳定配色（同一分类始终同色）。 */
  function vsKindColor(kind) {
    const s = String(kind || "-");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return "hsl(" + h + " 62% 70%)";
  }

  function vsFmtTime(t) {
    const s = Math.max(0, Number(t) || 0);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
  }

  function vsStageLeftVideo() {
    return document.getElementById("vs-video-left");
  }

  function vsStageRightVideo() {
    return document.getElementById("vs-video-right");
  }

  /** 右格是否参与双屏（S4 单播放器时为 false）。 */
  function vsStageVisibleRight() {
    if ((vsState.scene || "s1") === "s4") return false;
    const cell = document.getElementById("vs-cell-right");
    return !!(cell && !cell.classList.contains("hidden"));
  }

  /** 渲染左 STAGE：只换视频 src 与文案，不重建整页 DOM。 */
  function vsRenderStage() {
    const p = vsState.detail;
    const scene = vsState.scene || "s1";
    const leftV = vsStageLeftVideo();
    const rightV = vsStageRightVideo();
    const duoview = document.getElementById("vs-duoview");
    const titleEl = document.getElementById("vs-stage-title");
    const subEl = document.getElementById("vs-stage-sub");
    const leftT = document.getElementById("vs-left-title");
    const rightT = document.getElementById("vs-right-title");
    const banner = document.getElementById("vs-stage-banner");
    const segEl = document.getElementById("vs-ctl-seg");
    if (!p || !leftV || !rightV || !duoview) return;
    if (banner) banner.innerHTML = "";

    let title = "—";
    let sub = "";
    let leftSrc = "";
    let rightSrc = "";
    let leftTitle = "参考";
    let rightTitle = "生成";
    let single = false;
    let count = 1;
    let idx = 0;
    let tlItems = [];

    if (scene === "s1") {
      const segs = vsShotSegments();
      count = segs.length;
      idx = count ? Math.max(0, Math.min(vsState.segIdx || 0, count - 1)) : 0;
      vsState.segIdx = idx;
      title = "S1 · 分镜对照审核（闸门1）";
      const s = segs[idx];
      if (!s) {
        sub =
          p.shot_compare && p.shot_compare.enabled === false
            ? (p.shot_compare.message || "本项目未配置分镜对照")
            : "没有匹配的分镜段（试试清空分类筛选 / 取消「只看已标记」）";
      } else {
        sub = `${s.name || s.label || s.id} · 初分 ${s.kind || "-"} · 第 ${idx + 1}/${count} 段`;
        leftSrc = s.has_shot ? vsFileUrl(p.id, s.shot_rel) : "";
        rightSrc = s.has_gen ? vsFileUrl(p.id, s.gen_rel) : "";
        vsState.stageT0 = Number(s.t0) || 0;
      }
      leftTitle = "分镜原片（硬切段）";
      rightTitle = "生成段";
      tlItems = segs.map((it) => ({
        label: it.name || it.label || it.id || "",
        kind: it.kind,
        t0: Number(it.t0) || 0,
        t1: Number(it.t1) || 0,
        missing: !it.has_gen,
      }));
    } else if (scene === "s2") {
      const d = vsArkData(p);
      const segs = vsArkSegments();
      count = segs.length;
      idx = count ? Math.max(0, Math.min(vsState.arkIdx || 0, count - 1)) : 0;
      vsState.arkIdx = idx;
      title = "S2 · 送方舟包复查（闸门2）";
      const x = segs[idx];
      if (banner) banner.innerHTML = vsCoverageBannerHtml(d) + vsGateBannerHtml(d);
      if (!x) {
        sub = "还没有送方舟包。先在 S1 保存人工判断，再点「按人工判断拼包」。";
      } else {
        sub = `${x.name || x.rel} · ${x.kind || "-"} · ${Number(x.duration || 0).toFixed(1)}s · 第 ${idx + 1}/${count} 包`;
        leftSrc = x.rel ? vsFileUrl(p.id, x.rel) : "";
        rightSrc = x.has_gen && x.gen_rel ? vsFileUrl(p.id, x.gen_rel) : "";
        let acc = 0;
        tlItems = (x.parts || []).map((pt) => {
          const t0 = acc;
          const dur = Number(pt && (pt.dur != null ? pt.dur : pt.duration)) || 0;
          acc += dur;
          return { label: (pt && (pt.name || pt.label)) || "", kind: x.kind, t0: t0, t1: acc, missing: false };
        });
      }
      vsState.stageT0 = 0;
      leftTitle = "送方舟参考片（原拼包）";
      rightTitle = "生成后（按 parts 拼回）";
    } else if (scene === "s3") {
      const sources = p.sources || [];
      const left = sources[0] || null;
      const right = vsPickCmpOutput(p);
      title = "S3 · 全片对照验收";
      count = 1;
      idx = 0;
      vsState.stageT0 = 0;
      leftSrc = left ? vsFileUrl(p.id, left.rel) : "";
      rightSrc = right ? vsFileUrl(p.id, right.rel) : "";
      leftTitle = "原片全片";
      rightTitle = right ? "成片 · " + (right.version || right.label || "") : "成片（无可播放版本）";
      sub = left || right ? "左右并排看全片，右片可在右侧切换版本" : "需要原片 + 成片才能并排预览";
      tlItems = [];
    } else {
      const list = vsMediaSegments();
      count = list.length;
      idx = count ? Math.max(0, Math.min(vsState.mediaIdx || 0, count - 1)) : 0;
      vsState.mediaIdx = idx;
      title = "S4 · 素材浏览";
      single = true;
      vsState.stageT0 = 0;
      const m = list[idx];
      if (!m) {
        sub = "暂无素材（定妆照 / 原片 / 成片都为空）";
      } else {
        sub = `${m.group} · ${m.item.label || m.item.name || ""} · 第 ${idx + 1}/${count}`;
        leftSrc = vsFileUrl(p.id, m.item.rel);
      }
      leftTitle = "选中素材";
      tlItems = [];
    }

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    if (leftT) leftT.textContent = leftTitle;
    if (rightT) rightT.textContent = rightTitle;
    if (segEl) segEl.textContent = count ? `第 ${idx + 1}/${count}` : "—";

    duoview.classList.toggle("is-single", !!single);
    const cellRight = document.getElementById("vs-cell-right");
    if (cellRight) cellRight.classList.toggle("hidden", !!single);

    vsSetVideoSrc(leftV, leftSrc);
    vsSetVideoSrc(rightV, single ? "" : rightSrc);
    vsSetCellEmpty("vs-cell-left", leftSrc ? "" : scene === "s4" ? "未选中素材" : "无参考片");
    if (!single) vsSetCellEmpty("vs-cell-right", rightSrc ? "" : scene === "s1" ? "尚未生成对应段" : "尚无生成对照");

    leftV.playbackRate = vsState.play.rate || 1;
    rightV.playbackRate = vsState.play.rate || 1;
    vsRenderTimeline(tlItems, idx);
    vsBindStageEvents();
    vsStageBindSync();
    vsUpdateCtlTime();
    vsSyncPlayBtn();
  }

  /** 段时间轴缩略条：按 t0/t1 比例铺分类配色，当前段高亮，缺生成段斜纹，点击跳转。 */
  function vsRenderTimeline(items, curIdx) {
    const tl = document.getElementById("vs-timeline");
    if (!tl) return;
    if (!items || !items.length) {
      tl.innerHTML = "";
      tl.classList.add("hidden");
      return;
    }
    tl.classList.remove("hidden");
    const minT = Math.min.apply(null, items.map((i) => Number(i.t0) || 0));
    const maxT = Math.max.apply(null, items.map((i) => Number(i.t1) || 0));
    const span = Math.max(0.001, maxT - minT);
    tl.innerHTML = items
      .map((it, i) => {
        const w = (((Number(it.t1) || 0) - (Number(it.t0) || 0)) / span) * 100;
        const tip = `${it.label || "段 " + (i + 1)} · ${it.kind || "-"} · ${(Number(it.t0) || 0).toFixed(1)}s–${(Number(it.t1) || 0).toFixed(1)}s${it.missing ? " · 缺生成段" : ""}`;
        return `<button type="button" class="vs-tl-seg${i === curIdx ? " is-cur" : ""}${it.missing ? " is-missing" : ""}"
          style="width:${Math.max(0.6, w).toFixed(3)}%;background:${vsKindColor(it.kind)}"
          title="${escapeHtml(tip)}" onclick="vsTimelineClick(${i})"><span>${escapeHtml(it.label || String(i + 1))}</span></button>`;
      })
      .join("");
  }

  /** 时间轴点击：S2 跳到该 part 的包内累积偏移；其它场景切到该段。 */
  window.vsTimelineClick = function vsTimelineClick(i) {
    if ((vsState.scene || "s1") === "s2") {
      vsSeekPart(i);
      return;
    }
    vsSegGoto(i);
  };

  // ---------- STAGE：统一播放控制条 ----------

  let vsStageBound = false;

  /** 绑定两个常驻 <video> 的监听（只绑一次；空数据时事件不触发，不报错）。 */
  function vsBindStageEvents() {
    if (vsStageBound) return;
    const l = vsStageLeftVideo();
    const r = vsStageRightVideo();
    if (!l || !r) return;
    vsStageBound = true;
    l.addEventListener("timeupdate", vsOnStageTime);
    l.addEventListener("loadedmetadata", vsUpdateCtlTime);
    l.addEventListener("play", vsSyncPlayBtn);
    l.addEventListener("pause", vsSyncPlayBtn);
    l.addEventListener("ended", vsOnStageEnded);
  }

  /** 时间更新：刷新时间显示、A-B 循环、Context 时间锚点高亮。 */
  function vsOnStageTime() {
    const l = vsStageLeftVideo();
    if (!l) return;
    vsUpdateCtlTime();
    const ab = vsState.play.ab || {};
    if (ab.on && ab.a != null && ab.b != null) {
      const t = Number(l.currentTime) || 0;
      if (t >= ab.b) {
        try {
          l.currentTime = ab.a;
        } catch (_) {
          /* 忽略 */
        }
        const r = vsStageRightVideo();
        if (r && r.src && vsStageVisibleRight() && vsState.play.sync) {
          try {
            r.currentTime = ab.a;
          } catch (_) {
            /* 忽略 */
          }
        }
      }
    }
    vsHighlightTimeAnchors((vsState.stageT0 || 0) + (Number(l.currentTime) || 0));
  }

  /** 播放结束：开启「自动续播」时自动切下一段并继续播。 */
  function vsOnStageEnded() {
    vsSyncPlayBtn();
    if (!vsState.play.autoNext) return;
    const scene = vsState.scene || "s1";
    if (scene === "s1" || scene === "s2" || scene === "s4") vsSegStep(1, true);
  }

  /** 刷新控制条时间文本。 */
  function vsUpdateCtlTime() {
    const l = vsStageLeftVideo();
    const el = document.getElementById("vs-ctl-time");
    if (!l || !el) return;
    const dur = Number(l.duration);
    el.textContent = `${vsFmtTime(l.currentTime)} / ${Number.isFinite(dur) ? vsFmtTime(dur) : "0:00.0"}`;
  }

  /** 同步播放按钮文案。 */
  function vsSyncPlayBtn() {
    const btn = document.getElementById("vs-ctl-play");
    const l = vsStageLeftVideo();
    if (!btn || !l) return;
    btn.textContent = l.paused ? "▶ 播放" : "⏸ 暂停";
  }

  /** 左/右同步开关生效：复用并强化原有 vsBindPairSync。 */
  function vsStageBindSync() {
    const root = document.getElementById("vs-duoview");
    const l = vsStageLeftVideo();
    const r = vsStageRightVideo();
    if (!root || !l || !r) return;
    if (!vsState.play.sync || !vsStageVisibleRight() || !r.getAttribute("src")) {
      vsUnbindPairSync(root);
      return;
    }
    vsBindPairSync(root, l, r);
  }

  /** 播放 / 暂停（双屏时同时带动右片）。 */
  window.vsPlayToggle = async function vsPlayToggle() {
    const l = vsStageLeftVideo();
    const r = vsStageRightVideo();
    const btn = document.getElementById("vs-ctl-play");
    if (!l || !l.getAttribute("src")) return;
    const dual = vsStageVisibleRight() && !!r.getAttribute("src");
    if (!l.paused || (dual && !r.paused)) {
      l.pause();
      if (dual) r.pause();
      vsUnbindPairSync(document.getElementById("vs-duoview"));
      vsSyncPlayBtn();
      return;
    }
    try {
      await vsVideoReady(l);
      let t = l.currentTime || 0;
      if (l.ended) t = 0;
      if (dual) {
        await vsVideoReady(r);
        await Promise.all([vsVideoSeek(l, t), vsVideoSeek(r, t)]);
        try {
          await l.play();
        } catch (_) {
          /* 忽略自动播放限制 */
        }
        try {
          await r.play();
        } catch (_) {
          /* 忽略 */
        }
        vsStageBindSync();
      } else {
        await vsVideoSeek(l, t);
        try {
          await l.play();
        } catch (_) {
          /* 忽略 */
        }
      }
    } catch (err) {
      console.warn("vsPlayToggle", err);
    }
    vsSyncPlayBtn();
  };

  /** 上一段 / 下一段（S1 切分镜、S2 切包、S4 切素材；S3 无“段”概念）。 */
  window.vsSegStep = async function vsSegStep(delta, autoplay) {
    const scene = vsState.scene || "s1";
    const step = Number(delta) || 0;
    if (!step) return;
    if (scene === "s3") return;
    if (scene === "s1") {
      const segs = vsShotSegments();
      if (!segs.length) return;
      await vsFlushShotDraft(true);
      vsState.segIdx = Math.max(0, Math.min(segs.length - 1, (vsState.segIdx || 0) + step));
    } else if (scene === "s2") {
      const segs = vsArkSegments();
      if (!segs.length) return;
      vsState.arkIdx = Math.max(0, Math.min(segs.length - 1, (vsState.arkIdx || 0) + step));
    } else {
      const list = vsMediaSegments();
      if (!list.length) return;
      vsState.mediaIdx = Math.max(0, Math.min(list.length - 1, (vsState.mediaIdx || 0) + step));
    }
    vsRenderStage();
    vsRenderContext();
    if (autoplay) vsPlayToggle();
  };

  /** 直接跳到第 i 段（时间轴 / 段列表点击）。 */
  window.vsSegGoto = async function vsSegGoto(i) {
    const idx = Number(i) || 0;
    const scene = vsState.scene || "s1";
    if (scene === "s1") {
      await vsFlushShotDraft(true);
      vsState.segIdx = idx;
    } else if (scene === "s2") {
      vsState.arkIdx = idx;
    } else if (scene === "s4") {
      vsState.mediaIdx = idx;
    } else {
      return;
    }
    vsRenderStage();
    vsRenderContext();
    vsPlayToggle();
  };

  /** 倍速。 */
  window.vsSetRate = function vsSetRate(v) {
    const rate = Number(v) || 1;
    vsState.play.rate = rate;
    const l = vsStageLeftVideo();
    const r = vsStageRightVideo();
    if (l) l.playbackRate = rate;
    if (r) r.playbackRate = rate;
  };

  /** 左右同步开关。 */
  window.vsToggleSync = function vsToggleSync(on) {
    vsState.play.sync = !!on;
    vsStageBindSync();
  };

  /** 自动续播开关。 */
  window.vsToggleAutoNext = function vsToggleAutoNext(on) {
    vsState.play.autoNext = !!on;
  };

  /** A-B 循环：第一次设 A，第二次设 B 并开始循环，第三次清除。 */
  window.vsToggleAB = function vsToggleAB() {
    const l = vsStageLeftVideo();
    const btn = document.getElementById("vs-ctl-ab");
    const ab = vsState.play.ab;
    if (!l || !ab) return;
    if (ab.on || ab.b != null) {
      ab.on = false;
      ab.a = null;
      ab.b = null;
      if (btn) {
        btn.textContent = "A-B 循环";
        btn.classList.remove("is-on");
      }
      return;
    }
    const t = Number(l.currentTime) || 0;
    if (ab.a == null) {
      ab.a = t;
      if (btn) {
        btn.textContent = `设 B 点（A=${vsFmtTime(ab.a)}）`;
        btn.classList.add("is-on");
      }
      return;
    }
    if (t <= ab.a + 0.2) {
      ab.a = t;
      if (btn) btn.textContent = `设 B 点（A=${vsFmtTime(ab.a)}）`;
      return;
    }
    ab.b = t;
    ab.on = true;
    if (btn) btn.textContent = `循环 ${vsFmtTime(ab.a)}–${vsFmtTime(ab.b)}（点此清除）`;
  };

  /** S2：跳到 parts[i] 在包内的累积偏移起点。 */
  window.vsSeekPart = function vsSeekPart(i) {
    const segs = vsArkSegments();
    const x = segs[vsState.arkIdx || 0];
    if (!x) return;
    const parts = x.parts || [];
    let acc = 0;
    for (let k = 0; k < i && k < parts.length; k++) {
      acc += Number(parts[k] && (parts[k].dur != null ? parts[k].dur : parts[k].duration)) || 0;
    }
    const l = vsStageLeftVideo();
    const r = vsStageRightVideo();
    if (l) {
      try {
        l.currentTime = acc;
      } catch (_) {
        /* 忽略 */
      }
      l.play().catch(() => {});
    }
    if (r && r.getAttribute("src") && vsStageVisibleRight() && vsState.play.sync) {
      try {
        r.currentTime = acc;
      } catch (_) {
        /* 忽略 */
      }
      r.play().catch(() => {});
    }
    vsHighlightTimeAnchors(acc);
  };

  /** 播放进度 → Context 时间锚点条目高亮 + scrollIntoView（不夺焦点）。 */
  function vsHighlightTimeAnchors(t) {
    const ctx = document.getElementById("vs-context");
    if (!ctx) return;
    const nodes = ctx.querySelectorAll("[data-anchor-t0]");
    if (!nodes.length) return; // 空数据：不注册、不报错
    let hit = null;
    nodes.forEach((n) => {
      const a = Number(n.getAttribute("data-anchor-t0"));
      const b = Number(n.getAttribute("data-anchor-t1"));
      const on = Number.isFinite(t) && t >= a && t < b;
      n.classList.toggle("is-playing", !!on);
      if (on) hit = n;
    });
    if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: "nearest" });
  }

  // ---------- CONTEXT：随场景/当前段变化的材料区 ----------

  /** S3 右片：优先用 S4「设为对照源」指定的文件，其次指定版本，最后推荐基线。 */
  function vsPickCmpOutput(p) {
    const outs = (p.outputs || []).filter((o) => !o.is_silent && !o.is_compare);
    if (vsState.cmpRel) {
      const forced = (p.outputs || []).find((o) => o.rel === vsState.cmpRel) || outs.find((o) => o.rel === vsState.cmpRel);
      if (forced) return forced;
    }
    if (vsState.cmpVersion) {
      const hit = outs.find((o) => String(o.version || "").toLowerCase() === String(vsState.cmpVersion).toLowerCase());
      if (hit) return hit;
    }
    return vsPickRecommended(p);
  }

  function vsAcceptKey(p) {
    return VS_ACCEPT_KEY + ":" + ((p && p.id) || "");
  }

  function vsAcceptLoad(p) {
    try {
      return JSON.parse(localStorage.getItem(vsAcceptKey(p)) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  /** S3 验收清单勾选（仅本地 localStorage 记录，不改后端）。 */
  window.vsToggleAccept = function vsToggleAccept(id, checked) {
    const p = vsState.detail;
    if (!p) return;
    const data = vsAcceptLoad(p);
    data[id] = !!checked;
    try {
      localStorage.setItem(vsAcceptKey(p), JSON.stringify(data));
    } catch (_) {
      /* 忽略 */
    }
    const lab = document.getElementById("vs-accept-count");
    if (lab) {
      const n = Object.keys(data).filter((k) => data[k]).length;
      lab.textContent = `${n}/${VS_ACCEPT_ITEMS.length}`;
    }
  };

  /** 切换 S3 右侧对比版本。 */
  window.vsPickCmpVersion = function vsPickCmpVersion(version) {
    vsState.cmpVersion = version || "";
    vsState.cmpRel = "";
    vsRenderStage();
    vsRenderContext();
  };

  /** S4：把某个原片/成片直接设为 S3 的对照右片。 */
  window.vsUseAsRight = function vsUseAsRight(rel) {
    vsState.cmpRel = rel || "";
    vsState.cmpVersion = "";
    vsState.scene = "s3";
    document.querySelectorAll(".vs-step").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-scene") === "s3");
    });
    vsRenderStage();
    vsRenderContext();
  };

  /** S4：选中素材（单播放器）。 */
  window.vsPickMedia = function vsPickMedia(i) {
    vsState.mediaIdx = Number(i) || 0;
    vsRenderStage();
    vsRenderContext();
    vsPlayToggle();
  };

  /** 渲染右 CONTEXT：四张映射表之一。 */
  function vsRenderContext() {
    const p = vsState.detail;
    const box = document.getElementById("vs-context");
    if (!box) return;
    if (!p) {
      box.innerHTML = `<div class="vs-ctx-empty hint">选择左侧项目后，这里显示当前段的材料。</div>`;
      return;
    }
    const scene = vsState.scene || "s1";
    if (scene === "s1") box.innerHTML = vsContextS1(p);
    else if (scene === "s2") box.innerHTML = vsContextS2(p);
    else if (scene === "s3") box.innerHTML = vsContextS3(p);
    else box.innerHTML = vsContextS4(p);
    vsHighlightTimeAnchors((vsState.stageT0 || 0) + (Number((vsStageLeftVideo() || {}).currentTime) || 0));
  }

  /** S1 CONTEXT：段档案 + 人工判断单选组 + 问题/说明/提示词 + 批处理 + 段列表 + 闸门1。 */
  function vsContextS1(p) {
    const sc = p.shot_compare || {};
    if (!sc.enabled) {
      return `<div class="vs-ctx-empty hint">${escapeHtml(sc.message || "本项目未配置分镜对照。琵琶曲/花鼓灯已支持。")}</div>`;
    }
    const segs = vsShotSegments();
    const kinds = sc.kinds || [];
    const filter = vsState.shotKindFilter || "";
    const onlyMarked = !!vsState.shotOnlyMarked;
    const kindOpts = [`<option value="">全部分类</option>`]
      .concat(kinds.map((k) => `<option value="${escapeHtml(k)}"${filter === k ? " selected" : ""}>${escapeHtml(k)}</option>`))
      .join("");
    const humanOpts =
      sc.human_kind_options && sc.human_kind_options.length
        ? sc.human_kind_options
        : [{ id: "角色一", label: "角色一" }, { id: "角色二", label: "角色二" }, { id: "双人同镜", label: "双人同镜" }, { id: "空镜", label: "空镜" }];
    if (!segs.length) {
      return `
        <div class="vs-ctx-filter">
          <label>分类 <select id="vs-shot-kind" class="adb-input" onchange="vsShotFilter()">${kindOpts}</select></label>
          <label class="adb-check"><input type="checkbox" id="vs-shot-only-marked" ${onlyMarked ? "checked" : ""} onchange="vsShotFilter()"> 只看已标记</label>
        </div>
        <div class="vs-ctx-empty hint">没有匹配的分镜段（当前筛选：${escapeHtml(filter || "全部")}${onlyMarked ? " · 只看已标记" : ""}）</div>`;
    }
    const idx = Math.max(0, Math.min(vsState.segIdx || 0, segs.length - 1));
    vsState.segIdx = idx;
    const s = segs[idx] || {};
    const t0 = Number(s.t0) || 0;
    const t1 = Number(s.t1) || 0;
    const typeSel = (sc.issue_types || [])
      .map((t) => `<option value="${escapeHtml(t.id)}"${s.issue_type === t.id ? " selected" : ""}>${escapeHtml(t.label)}</option>`)
      .join("");
    const kindBtns = humanOpts
      .map(
        (o) =>
          `<button type="button" class="vs-kind-btn${(s.human_kind || "") === o.id ? " is-on" : ""}" data-kind="${escapeHtml(o.id)}" onclick="vsPickHumanKind(this)">${escapeHtml(o.label)}</button>`
      )
      .join("");
    const segRows = segs
      .map((it, i) => {
        const a = Number(it.t0) || 0;
        const b = Number(it.t1) || 0;
        const cur = i === idx;
        return `<button type="button" class="vs-seg-row${cur ? " is-cur" : ""}${it.marked ? " is-marked" : ""}${!it.has_gen ? " is-missing" : ""}"
          data-anchor-t0="${a}" data-anchor-t1="${b}" onclick="vsSegGoto(${i})">
          <span class="vs-seg-dot" style="background:${vsKindColor(it.kind)}"></span>
          <span class="vs-seg-name">${escapeHtml(it.name || it.label || it.id || "")}</span>
          <span class="hint">${a.toFixed(1)}–${b.toFixed(1)}s · ${escapeHtml(it.kind || "-")}${it.human_kind ? " → " + escapeHtml(it.human_kind) : ""}</span>
        </button>`;
      })
      .join("");
    const batchOpts = humanOpts
      .map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`)
      .join("");
    const queued = (p.job || {}).status === "queued" || ((p.job || {}).status === "running" && /排队重跑/.test((p.job || {}).message || ""));
    return `
      <div class="vs-ctx-filter">
        <label>分类 <select id="vs-shot-kind" class="adb-input" onchange="vsShotFilter()">${kindOpts}</select></label>
        <label class="adb-check"><input type="checkbox" id="vs-shot-only-marked" ${onlyMarked ? "checked" : ""} onchange="vsShotFilter()"> 只看已标记</label>
        <label>批量改判
          <select id="vs-batch-kind" class="adb-input"><option value="">（选分类）</option>${batchOpts}</select>
        </label>
        <button type="button" class="btn btn-sm" onclick="vsBatchReclassify()">将筛出的 ${segs.length} 段统一改判</button>
      </div>

      <div class="vs-ctx-card" data-shot-id="${escapeHtml(s.id || "")}">
        <div class="vs-ctx-head">
          <strong>${escapeHtml(s.name || s.label || s.id || "")}</strong>
          <span class="hint">${t0.toFixed(1)}s – ${t1.toFixed(1)}s · 时长 ${Math.max(0, t1 - t0).toFixed(1)}s</span>
        </div>
        <div class="vs-ctx-meta">
          <span class="vs-badge">初分 ${escapeHtml(s.kind || "-")}</span>
          ${s.human_kind_overridden ? `<span class="vs-badge vs-badge-warn">与初分不同</span>` : ""}
          ${!s.has_gen ? `<span class="vs-badge vs-badge-warn">缺生成段</span>` : ""}
          ${
            s.pack_strategy === "concat"
              ? `<span class="vs-badge" title="${escapeHtml((s.pack_with || []).join(" + "))}">拼包 ${escapeHtml(s.pack_id || "")}</span>`
              : s.pack_strategy === "pad_fallback"
                ? `<span class="vs-badge vs-badge-warn">将循环垫（无可拼）</span>`
                : ""
          }
        </div>

        <div class="vs-ctx-block">
          <div class="vs-ctx-label">人工判断（点一次即生效，自动保存）</div>
          <div class="vs-kind-group" role="radiogroup">${kindBtns}</div>
          <input type="hidden" class="vs-shot-human-kind" value="${escapeHtml(s.human_kind || "")}">
        </div>

        <div class="vs-ctx-block">
          <label class="vs-ctx-field">问题类型
            <select class="vs-shot-type adb-input" onchange="vsShotAutoSave()">
              <option value="">（未选）</option>
              ${typeSel}
            </select>
          </label>
          <label class="vs-ctx-field">问题说明
            <textarea class="vs-shot-note adb-input" rows="2" placeholder="例如：朝向背对、漂景成亮房间…" oninput="vsShotAutoSave()">${escapeHtml(s.note || "")}</textarea>
          </label>
        </div>

        <div class="vs-ctx-block">
          <div class="vs-ctx-label">
            分镜说明
            ${s.has_desc ? `<span class="vs-badge">${escapeHtml(s.desc_source === "auto" ? "自动" : s.desc_source === "manual" ? "手改" : "已填")}</span>` : `<span class="hint">未填</span>`}
            <button type="button" class="btn btn-sm" onclick="vsDescribeCurrentShot()" ${s.has_shot ? "" : "disabled"}>自动描述此段</button>
          </div>
          <div class="vs-desc-grid">
            <label>镜头 <textarea class="vs-shot-camera adb-input" rows="2" placeholder="景别/运镜" oninput="vsShotAutoSave()">${escapeHtml(s.camera || "")}</textarea></label>
            <label>场景 <textarea class="vs-shot-scene adb-input" rows="2" placeholder="环境/道具/光线" oninput="vsShotAutoSave()">${escapeHtml(s.scene || "")}</textarea></label>
            <label>角色 <textarea class="vs-shot-character adb-input" rows="2" placeholder="谁在画面、朝向" oninput="vsShotAutoSave()">${escapeHtml(s.character || "")}</textarea></label>
            <label>动作 <textarea class="vs-shot-action adb-input" rows="2" placeholder="主要动作/表演" oninput="vsShotAutoSave()">${escapeHtml(s.action || "")}</textarea></label>
          </div>
        </div>

        <label class="vs-ctx-field">本段提示词${s.prompt_overridden ? ' <span class="vs-badge">已改</span>' : ""}
          <textarea class="vs-shot-prompt adb-input" rows="4" placeholder="该段送 Seedance 的提示词，可改后自动保存" oninput="vsShotAutoSave()">${escapeHtml(s.prompt || "")}</textarea>
        </label>

        <label class="vs-shot-mark vs-ctx-check">
          <input type="checkbox" class="vs-shot-check" ${s.marked ? "checked" : ""} onchange="vsShotAutoSave()">
          勾选为问题段（计入重跑队列）
        </label>
      </div>

      <div class="vs-ctx-block">
        <div class="vs-ctx-label">段列表（随播放高亮 · 点即跳转）</div>
        <div class="vs-seg-list">${segRows}</div>
      </div>

      <div class="vs-ctx-foot">
        <div class="vs-foot-left">
          <span id="vs-autosave-label" class="hint">${vsState.savedAt ? "已自动保存 · " + vsState.savedAt : "草稿会在停止输入 0.8 秒后自动保存"}</span>
        </div>
        <div class="vs-foot-right">
          <button type="button" class="btn btn-sm" onclick="vsDescribeMissing()">自动描述缺失段</button>
          <button type="button" class="btn btn-sm" onclick="vsQueueReswap()">重跑已标记分段</button>
          ${queued ? `<button type="button" class="btn btn-sm" onclick="vsCancelReswap()">取消排队</button>` : ""}
          <button type="button" class="btn btn-sm primary" onclick="vsConfirmShotReview()">保存并确认闸门1</button>
        </div>
      </div>`;
  }

  /** S2 CONTEXT：包档案 + parts 列表 + QA 组 + 内联重送 + 底部常驻操作。 */
  function vsContextS2(p) {
    const d = vsArkData(p);
    const segs = vsArkSegments();
    const arkKinds = d.arkKinds;
    let arkFilter = vsState.arkKindFilter || "";
    if (arkFilter && arkKinds.length && arkKinds.indexOf(arkFilter) < 0) arkFilter = "";
    const arkKindOpts = [`<option value="">全部分类</option>`]
      .concat(arkKinds.map((k) => `<option value="${escapeHtml(k)}"${arkFilter === k ? " selected" : ""}>${escapeHtml(k)}</option>`))
      .join("");
    const gates = d.gates || {};
    const canBuild = d.canBuild;
    const coverageOk = d.coverageOk;
    const canSend = d.canSend;
    const qaMarks = d.ark.qa_marks || [
      { id: "ok", label: "可用" },
      { id: "orient_wrong", label: "朝向错误" },
      { id: "scene_drift", label: "换景" },
      { id: "sensitive", label: "敏感" },
      { id: "portrait", label: "肖像化" },
    ];
    if (!segs.length) {
      return `
        <div class="vs-ctx-filter">
          <label>分类 <select id="vs-ark-kind" class="adb-input" onchange="vsArkFilter()">${arkKindOpts}</select></label>
          <button type="button" class="btn btn-sm" onclick="vsBuildArkPacks()" ${canBuild ? "" : "disabled"} title="${canBuild ? "按人工判断拼包" : escapeHtml((gates.shot_review && gates.shot_review.reason) || "闸门1未过")}">按人工判断拼包</button>
        </div>
        <div class="vs-ctx-empty hint">还没有送方舟包。先在 S1 保存人工判断，再点「按人工判断拼包」。</div>`;
    }
    const idx = Math.max(0, Math.min(vsState.arkIdx || 0, segs.length - 1));
    vsState.arkIdx = idx;
    const x = segs[idx] || {};
    const hasGen = !!x.has_gen && !!x.gen_rel;
    let acc = 0;
    const partRows = (x.parts || [])
      .map((pt, i) => {
        const t0 = acc;
        const dur = Number(pt && (pt.dur != null ? pt.dur : pt.duration)) || 0;
        acc += dur;
        return `<button type="button" class="vs-part-row" data-anchor-t0="${t0}" data-anchor-t1="${t0 + dur}" onclick="vsSeekPart(${i})">
          <span class="vs-part-idx">${i + 1}</span>
          <span class="vs-part-name">${escapeHtml((pt && (pt.name || pt.label)) || String(pt))}</span>
          <span class="hint">${t0.toFixed(1)}s → ${(t0 + dur).toFixed(1)}s · ${dur.toFixed(1)}s</span>
        </button>`;
      })
      .join("");
    const riskHtml = (x.risk_tags || []).map((t) => `<span class="vs-badge vs-badge-warn">${escapeHtml(t)}</span>`).join("");
    const qaHtml = qaMarks
      .map(
        (m) =>
          `<button type="button" class="btn btn-sm${x.qa_mark === m.id ? " primary" : ""}" onclick="vsArkQaMark(this,'${escapeHtml(m.id)}')">${escapeHtml(m.label)}</button>`
      )
      .join("");
    const packRows = segs
      .map((it, i) => {
        const cur = i === idx;
        return `<button type="button" class="vs-seg-row${cur ? " is-cur" : ""}${it.sent_to_ark ? "" : " is-missing"}"
          onclick="vsSegGoto(${i})">
          <span class="vs-seg-dot" style="background:${vsKindColor(it.kind)}"></span>
          <span class="vs-seg-name">${escapeHtml(it.name || it.rel || "")}</span>
          <span class="hint">${Number(it.duration || 0).toFixed(1)}s · ${escapeHtml(it.kind || "-")}${it.sent_to_ark ? " · 已送" : " · 未送"}</span>
        </button>`;
      })
      .join("");
    return `
      <div class="vs-ctx-filter">
        <label>分类 <select id="vs-ark-kind" class="adb-input" onchange="vsArkFilter()">${arkKindOpts}</select></label>
        <span class="hint">共 ${d.ark.total != null ? d.ark.total : d.arkItems.length} 包 · 第 ${idx + 1}/${segs.length}</span>
      </div>

      <div class="vs-shot-card vs-ctx-card" data-ark-id="${escapeHtml(x.id || x.rel || "")}" data-ark-rel="${escapeHtml(x.rel || "")}">
        <div class="vs-ctx-head">
          <strong>${escapeHtml(x.name || x.rel || "")}</strong>
          <span class="hint">${Number(x.duration || 0).toFixed(1)}s · ${(x.parts || []).length} 段</span>
        </div>
        <div class="vs-ctx-meta">
          <span class="vs-badge">${escapeHtml(x.kind || "-")}</span>
          <span class="vs-badge">${escapeHtml(x.strategy || "concat")}</span>
          <span class="vs-badge${x.send_mode === "per_part" ? " vs-badge-warn" : ""}">${escapeHtml(x.send_mode || "pack")}</span>
          <span class="vs-badge${x.sent_to_ark ? "" : " vs-badge-warn"}">${x.sent_to_ark ? "已送方舟" : "未送方舟"}</span>
          ${x.need_pad ? `<span class="vs-badge vs-badge-warn">循环垫</span>` : ""}
          ${hasGen ? `<span class="vs-badge">可对照</span>` : `<span class="vs-badge vs-badge-warn">尚未生成</span>`}
          ${x.qa_mark ? `<span class="vs-badge vs-badge-cmp">验收:${escapeHtml(x.qa_mark)}</span>` : ""}
        </div>
        <div class="vs-risk-row">
          ${riskHtml || '<span class="hint">无自动风险标签</span>'}
          ${x.look_set ? `<span class="hint">look: ${escapeHtml(x.look_set)}</span>` : ""}
          ${x.patch ? `<span class="hint">补丁: ${escapeHtml(x.patch)}</span>` : ""}
        </div>

        <div class="vs-ctx-block">
          <div class="vs-ctx-label">parts（点击跳到包内该段起点）</div>
          <div class="vs-seg-list">${partRows || '<div class="hint">该包没有 parts 记录</div>'}</div>
        </div>

        <div class="vs-ctx-block">
          <div class="vs-ctx-label">对照验收</div>
          <div class="vs-qa-row">${qaHtml}</div>
        </div>

        <div class="vs-ctx-actions">
          <button type="button" class="btn btn-sm" onclick="vsOpenResend(this)">重送（内联展开）</button>
          <button type="button" class="btn btn-sm" onclick="vsSyncDual(this)">左右同步播放/暂停</button>
        </div>
        <div id="vs-resend-drawer" class="vs-resend-drawer hidden"></div>
      </div>

      <div class="vs-ctx-block">
        <div class="vs-ctx-label">本分类的包（点即切换）</div>
        <div class="vs-seg-list">${packRows}</div>
      </div>

      <div class="vs-ctx-foot">
        <div class="vs-foot-left">
          <span class="hint">闸门2 未过则不能送方舟；覆盖不完整时亦阻断</span>
        </div>
        <div class="vs-foot-right">
          <button type="button" class="btn btn-sm" onclick="vsBuildArkPacks()" ${canBuild ? "" : "disabled"} title="${canBuild ? "按人工判断拼包" : escapeHtml((gates.shot_review && gates.shot_review.reason) || "闸门1未过")}">按人工判断拼包</button>
          <button type="button" class="btn btn-sm" onclick="vsConfirmArkReview()" ${segs.length && coverageOk ? "" : "disabled"} title="${coverageOk ? "逐包复查后确认闸门2" : escapeHtml((d.coverage && d.coverage.reason) || "分镜覆盖不完整")}">确认包已审</button>
          <button type="button" class="btn btn-sm primary" onclick="vsSendArkPacks()" ${canSend ? "" : "disabled"} title="${canSend ? "用当前已拼好的包直接送 Seedance，不重拼" : escapeHtml((!coverageOk && d.coverage && d.coverage.reason) || (gates.ark_review && gates.ark_review.reason) || "闸门2未过")}">送方舟生成</button>
        </div>
      </div>`;
  }

  /** S3 CONTEXT：版本切换 + 验收清单 + 报告 + 设为基线。 */
  function vsContextS3(p) {
    const groups = p.version_groups || [];
    const right = vsPickCmpOutput(p);
    const accept = vsAcceptLoad(p);
    const doneN = VS_ACCEPT_ITEMS.filter((it) => accept[it.id]).length;
    const versionRows = groups.length
      ? groups
          .map((g) => {
            const on = right && String(right.version || "") === String(g.version || "");
            return `<button type="button" class="vs-ver-row${on ? " is-cur" : ""}" onclick="vsPickCmpVersion('${escapeHtml(g.version || "")}')">
              <strong>${escapeHtml(g.version || "")}</strong>
              ${g.is_baseline ? '<span class="vs-badge">基线</span>' : ""}
              <span class="hint">${(g.items || []).length} 个文件${on ? " · 正在对照" : ""}</span>
            </button>`;
          })
          .join("")
      : `<div class="hint">暂无成片版本</div>`;
    const acceptHtml = VS_ACCEPT_ITEMS.map(
      (it) =>
        `<label class="vs-accept-item"><input type="checkbox" ${accept[it.id] ? "checked" : ""} onchange="vsToggleAccept('${escapeHtml(it.id)}', this.checked)"> ${escapeHtml(it.label)}</label>`
    ).join("");
    const reports = (p.reports || []).length
      ? (p.reports || [])
          .slice(0, 6)
          .map(
            (it) =>
              `<div class="vs-report-mini"><strong>${escapeHtml(it.label || it.name)}</strong><span class="hint">${escapeHtml(it.mtime || "")}</span>
               <a class="btn btn-sm" href="${vsFileUrl(p.id, it.rel)}" target="_blank" rel="noopener">打开</a></div>`
          )
          .join("")
      : `<div class="hint">暂无报告</div>`;
    return `
      <div class="vs-ctx-block">
        <div class="vs-ctx-label">右片版本（点击切换）</div>
        <div class="vs-seg-list">${versionRows}</div>
        ${vsState.cmpRel ? `<div class="hint">当前右片由素材浏览指定：${escapeHtml(vsState.cmpRel)} <button type="button" class="btn btn-sm" onclick="vsPickCmpVersion('${escapeHtml(p.recommended_version || "")}')">回到基线</button></div>` : ""}
      </div>

      <div class="vs-ctx-block">
        <div class="vs-ctx-label">验收检查清单 <span id="vs-accept-count" class="hint">${doneN}/${VS_ACCEPT_ITEMS.length}</span></div>
        <div class="vs-accept-list">${acceptHtml}</div>
        <div class="hint">仅本地记录（localStorage），不写后端；用于人工逐项打勾。</div>
      </div>

      <div class="vs-ctx-block">
        <div class="vs-ctx-label">报告</div>
        ${reports}
      </div>

      <div class="vs-ctx-foot">
        <div class="vs-foot-left"><span class="hint">对照锁基线后再进入下一轮</span></div>
        <div class="vs-foot-right">
          <button type="button" class="btn btn-sm" onclick="vsBuildCompare()">生成前12秒对照</button>
          <button type="button" class="btn btn-sm primary" onclick="vsSetBaseline('${escapeHtml(right && right.version ? right.version : "")}')">设为基线</button>
        </div>
      </div>`;
  }

  /** S4 CONTEXT：素材网格 + 选中项元信息（原片/成片可设为对照源）。 */
  function vsContextS4(p) {
    const list = vsMediaSegments();
    if (!list.length) {
      return `<div class="vs-ctx-empty hint">暂无素材。定妆照放入「定妆照/角色*_过审向_仅配色/」，原片放入「参考视频/」。</div>`;
    }
    const idx = Math.max(0, Math.min(vsState.mediaIdx || 0, list.length - 1));
    vsState.mediaIdx = idx;
    const m = list[idx] || {};
    const it = m.item || {};
    const grid = list
      .map((row, i) => {
        const on = i === idx;
        if (row.isImage) {
          return `<button type="button" class="vs-thumb${on ? " is-cur" : ""}" onclick="vsPickMedia(${i})">
            <img src="${vsFileUrl(p.id, row.item.rel)}" alt="${escapeHtml(row.item.name || "")}" loading="lazy">
            <span>${escapeHtml(row.item.name || "")}</span></button>`;
        }
        return `<button type="button" class="vs-thumb is-video${on ? " is-cur" : ""}" onclick="vsPickMedia(${i})">
          <span class="vs-thumb-ph">▶</span>
          <span>${escapeHtml(row.item.label || row.item.name || "")}</span>
          <span class="hint">${escapeHtml(row.group)} · ${vsFmtSize(row.item.size)}</span></button>`;
      })
      .join("");
    const canUse = m.group === "原片" || m.group === "成片";
    return `
      <div class="vs-ctx-block">
        <div class="vs-ctx-label">素材（${list.length}）· 选中第 ${idx + 1} 个</div>
        <div class="vs-grid">${grid}</div>
      </div>
      <div class="vs-ctx-card">
        <div class="vs-ctx-head"><strong>${escapeHtml(it.label || it.name || "")}</strong><span class="hint">${escapeHtml(m.group || "")}</span></div>
        <div class="vs-ctx-meta hint">${vsFmtSize(it.size)} · ${escapeHtml(it.mtime || "")}</div>
        <div class="hint">${escapeHtml(it.rel || "")}</div>
        <div class="vs-ctx-actions">
          <a class="btn btn-sm" href="${vsFileUrl(p.id, it.rel)}" download>下载</a>
          <a class="btn btn-sm" href="${vsFileUrl(p.id, it.rel)}" target="_blank" rel="noopener">新窗口</a>
          ${canUse ? `<button type="button" class="btn btn-sm" onclick="vsUseAsRight('${escapeHtml(it.rel || "")}')">设为 S3 对照右片</button>` : ""}
        </div>
      </div>`;
  }

  // ---------- CONTEXT：草稿自动保存与闸门1 ----------

  /** 读取 CONTEXT 表单里当前段的草稿。 */
  function vsReadContextShotDraft() {
    const ctx = document.getElementById("vs-context");
    if (!ctx) return null;
    const host = ctx.querySelector("[data-shot-id]");
    if (!host) return null;
    const id = host.getAttribute("data-shot-id");
    if (!id) return null;
    const q = (sel) => host.querySelector(sel);
    const val = (sel) => {
      const el = q(sel);
      return el ? el.value || "" : "";
    };
    const chk = q(".vs-shot-check");
    return {
      id: id,
      body: {
        marked: !!(chk && chk.checked),
        issue_type: val(".vs-shot-type"),
        note: val(".vs-shot-note"),
        prompt: val(".vs-shot-prompt"),
        camera: val(".vs-shot-camera"),
        scene: val(".vs-shot-scene"),
        character: val(".vs-shot-character"),
        action: val(".vs-shot-action"),
        human_kind: val(".vs-shot-human-kind"),
        source: "manual",
      },
    };
  }

  /** 构造 shots/issues 的 items：以服务端数据为底，覆盖当前段的表单值。 */
  function vsBuildIssuesPayload(overlay) {
    const p = vsState.detail || {};
    const sc = p.shot_compare || {};
    const items = {};
    (sc.items || []).forEach((s) => {
      if (!s || !s.id) return;
      items[s.id] = {
        marked: !!s.marked,
        issue_type: s.issue_type || "",
        note: s.note || "",
        prompt: s.prompt || "",
        camera: s.camera || "",
        scene: s.scene || "",
        character: s.character || "",
        action: s.action || "",
        human_kind: s.human_kind || "",
        source: "manual",
      };
    });
    if (overlay && overlay.id) {
      items[overlay.id] = Object.assign({}, items[overlay.id] || {}, overlay.body || {});
    }
    return items;
  }

  /** 输入防抖 800ms 自动保存草稿。 */
  window.vsShotAutoSave = function vsShotAutoSave() {
    if (vsState.draftTimer) clearTimeout(vsState.draftTimer);
    vsState.draftTimer = setTimeout(() => {
      vsState.draftTimer = null;
      vsFlushShotDraft(true);
    }, 800);
  };

  /** 落盘当前段草稿；成功则更新「已自动保存 · HH:MM:SS」。 */
  async function vsFlushShotDraft(silent) {
    const p = vsState.detail;
    if (!p) return false;
    if ((vsState.scene || "s1") !== "s1") return false;
    const cur = vsReadContextShotDraft();
    if (!cur) return false;
    const items = vsBuildIssuesPayload(cur);
    try {
      const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/issues", {
        method: "POST",
        body: { items },
      });
      if (!res || !res.ok) {
        if (!silent) alert((res && res.error) || "保存失败");
        return false;
      }
      if (res.shot_compare) p.shot_compare = res.shot_compare;
      vsState.savedAt = new Date().toTimeString().slice(0, 8);
      const lab = document.getElementById("vs-autosave-label");
      if (lab) lab.textContent = "已自动保存 · " + vsState.savedAt;
      return true;
    } catch (err) {
      if (!silent) alert("保存失败：" + (err.message || String(err)));
      return false;
    }
  }

  /** 人工判断单选项：一次点击完成，随后触发自动保存。 */
  window.vsPickHumanKind = function vsPickHumanKind(btn) {
    if (!btn) return;
    const group = btn.closest ? btn.closest(".vs-kind-group") : null;
    if (!group) return;
    const kind = btn.getAttribute("data-kind") || "";
    group.querySelectorAll(".vs-kind-btn").forEach((b) => {
      b.classList.toggle("is-on", b === btn);
    });
    const host = group.parentElement ? group.parentElement.querySelector(".vs-shot-human-kind") : null;
    if (host) host.value = kind;
    vsShotAutoSave();
  };

  /** 批处理：把筛选出的 N 段统一改判为某个分类。 */
  window.vsBatchReclassify = async function vsBatchReclassify() {
    const p = vsState.detail;
    if (!p) return;
    const sel = document.getElementById("vs-batch-kind");
    const kind = sel ? sel.value : "";
    const segs = vsShotSegments();
    if (!segs.length) {
      alert("没有筛出的分镜段");
      return;
    }
    if (!kind) {
      alert("先在「批量改判」下拉里选一个分类");
      return;
    }
    if (!confirm(`将筛选出的 ${segs.length} 段统一改判为「${kind}」？\n（只改人工判断，其它字段保留）`)) return;
    const items = vsBuildIssuesPayload(vsReadContextShotDraft());
    segs.forEach((s) => {
      if (!s.id) return;
      items[s.id] = Object.assign({}, items[s.id] || {}, { human_kind: kind, source: "manual" });
    });
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/issues", {
      method: "POST",
      body: { items },
    });
    if (!res || !res.ok) {
      alert((res && res.error) || "批量改判失败");
      return;
    }
    await vsSelectProject(p.id, true);
    alert(`已把 ${segs.length} 段统一改判为「${kind}」`);
  };

  /** 显式保存（不确认闸门，只写草稿）。 */
  window.vsSaveShotIssues = async function vsSaveShotIssues() {
    const p = vsState.detail;
    if (!p) return;
    const items = vsBuildIssuesPayload(vsReadContextShotDraft());
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/issues", {
      method: "POST",
      body: { items },
    });
    if (!res || !res.ok) {
      alert((res && res.error) || "保存失败");
      return;
    }
    if (res.shot_compare) p.shot_compare = res.shot_compare;
    vsState.savedAt = new Date().toTimeString().slice(0, 8);
    const sc = res.shot_compare || {};
    vsRenderStage();
    vsRenderContext();
    alert(
      "草稿已保存。\n" +
        `人工改判 ${sc.judge_diff_count || 0} 段 · 问题说明 ${sc.note_count || 0} 段 · 勾选重跑 ${sc.marked_count || 0} 段\n` +
        "注意：自动保存/保存草稿 ≠ 闸门1；需点「保存并确认闸门1」才写入 shot_review_confirmed_at。"
    );
  };

  /** 闸门1：显式确认才写 shot_review_confirmed_at（POST /gates/shot-review）。 */
  window.vsConfirmShotReview = async function vsConfirmShotReview() {
    const p = vsState.detail;
    if (!p) return;
    if (!confirm("确认已逐段审核完分镜（闸门1）？\n确认后才允许拼包送方舟。")) return;
    await vsFlushShotDraft(true);
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/gates/shot-review", {
      method: "POST",
      body: {},
    });
    if (!res || !res.ok) {
      alert((res && res.error) || "闸门1 确认失败");
      return;
    }
    p.shot_compare = p.shot_compare || {};
    if (res.gates) {
      p.shot_compare.gates = res.gates;
      if (p.shot_compare.ark_packs) p.shot_compare.ark_packs.gates = res.gates;
    }
    vsRenderStage();
    vsRenderContext();
    alert("闸门1 已确认（" + (res.at || "") + "），可以去 S2 拼包了。");
  };

  /** 对当前段做自动描述。 */
  window.vsDescribeCurrentShot = async function vsDescribeCurrentShot() {
    const p = vsState.detail;
    if (!p) return;
    const segs = vsShotSegments();
    const s = segs[vsState.segIdx || 0];
    if (!s || !s.id) return;
    await vsFlushShotDraft(true);
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/describe", {
      method: "POST",
      body: { ids: [s.id], only_missing: false, force: true },
    });
    if (!res || !res.ok) {
      alert((res && res.error) || "自动描述失败");
      return;
    }
    if (res.shot_compare) p.shot_compare = res.shot_compare;
    vsRenderContext();
    if (res.failed) {
      const e0 = (res.errors && res.errors[0] && res.errors[0].error) || "";
      if (/429|RateLimit|RPM/i.test(e0)) {
        alert("自动描述失败：方舟视觉接口触发每分钟限流（RPM/429）。请等 1～2 分钟再试。");
      } else {
        alert("描述有失败：" + e0.slice(0, 180));
      }
    }
  };

  /** 切换场景（顶部 Stepper）。 */
  window.vsSetScene = async function vsSetScene(scene) {
    if (!scene) return;
    if ((vsState.scene || "s1") === "s1" && scene !== "s1") await vsFlushShotDraft(true);
    vsState.scene = scene;
    vsState.compareMode = scene === "s1" ? "shots" : scene === "s2" ? "ark" : "full";
    document.querySelectorAll(".vs-step").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-scene") === scene);
    });
    if (!vsState.detail) return;
    vsRenderStage();
    vsRenderContext();
  };

  /** 兼容入口：原「对照」页渲染，现在等价于刷新工作台两栏。 */
  function vsRenderCompare(p) {
    if (p) vsState.detail = p;
    vsRenderStage();
    vsRenderContext();
  }

  window.vsCompareMode = function vsCompareMode(mode) {
    vsState.compareMode = mode;
    // 旧「全片对照/分镜对照/送方舟的视频」三个子 Tab → 顶部 Stepper 的场景
    const map = { full: "s3", shots: "s1", ark: "s2" };
    vsSetScene(map[mode] || "s1");
  };

  window.vsArkFilter = function vsArkFilter() {
    const kind = document.getElementById("vs-ark-kind");
    vsState.arkKindFilter = kind ? kind.value : "";
    if (vsState.detail) vsRenderCompare(vsState.detail);
  };

  window.vsBuildArkPacks = async function vsBuildArkPacks() {
    const p = vsState.detail;
    if (!p) return;
    if (!confirm("将按当前人工判断重新拼包（覆盖 输出/送方舟/），不会调用方舟；重拼后需重新确认闸门2。继续？")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/ark-packs", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "拼包失败");
      if (res.gates) {
        p.shot_compare = p.shot_compare || {};
        p.shot_compare.gates = res.gates;
        if (p.shot_compare.ark_packs) p.shot_compare.ark_packs.gates = res.gates;
      }
      vsRenderCompare(p);
      return;
    }
    if (res.shot_compare) p.shot_compare = res.shot_compare;
    else if (res.ark_packs) {
      p.shot_compare = p.shot_compare || {};
      p.shot_compare.ark_packs = res.ark_packs;
    }
    if (res.gates) {
      p.shot_compare = p.shot_compare || {};
      p.shot_compare.gates = res.gates;
      if (p.shot_compare.ark_packs) p.shot_compare.ark_packs.gates = res.gates;
    }
    vsState.compareMode = "ark";
    vsRenderCompare(p);
    alert(res.message || `已合成 ${res.built || 0} 包（未送方舟）`);
  };

  window.vsConfirmArkReview = async function vsConfirmArkReview() {
    const p = vsState.detail;
    if (!p) return;
    if (!confirm("确认已逐包复查（分类/吃镜/风险标签），允许送方舟？")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/gates/ark-review", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "确认失败");
      if (res.ark_packs) {
        p.shot_compare = p.shot_compare || {};
        p.shot_compare.ark_packs = res.ark_packs;
        vsRenderCompare(p);
      }
      return;
    }
    p.shot_compare = p.shot_compare || {};
    if (res.ark_packs) p.shot_compare.ark_packs = res.ark_packs;
    if (res.gates) {
      p.shot_compare.gates = res.gates;
      if (p.shot_compare.ark_packs) p.shot_compare.ark_packs.gates = res.gates;
    }
    vsRenderCompare(p);
    alert("闸门2已确认，可以点「送方舟生成」。");
  };

  window.vsArkQaMark = async function vsArkQaMark(btn, mark) {
    const p = vsState.detail;
    if (!p) return;
    const card = btn && btn.closest && btn.closest(".vs-shot-card");
    const rel = card && card.getAttribute("data-ark-rel");
    if (!rel) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/ark-packs/qa", {
      method: "POST",
      body: { rel, mark },
    });
    if (!res.ok) {
      alert(res.error || "标记失败");
      return;
    }
    if (res.ark_packs) {
      p.shot_compare = p.shot_compare || {};
      p.shot_compare.ark_packs = res.ark_packs;
    }
    vsRenderCompare(p);
  };

  window.vsOpenResend = function vsOpenResend(btn) {
    const p = vsState.detail;
    if (!p) return;
    const card = btn && btn.closest && btn.closest(".vs-shot-card");
    const rel = card && card.getAttribute("data-ark-rel");
    if (!rel) return;
    const items = p.shot_compare?.ark_packs?.items || [];
    const x = items.find((it) => it.rel === rel || it.id === rel) || {};
    const box = document.getElementById("vs-resend-drawer");
    if (!box) return;
    const look = x.look_set || "";
    const mode = x.send_mode || "pack";
    const patch = x.patch || "";
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="vs-resend-panel">
        <header><strong>重送抽屉</strong><button type="button" class="btn btn-sm" onclick="vsCloseResend()">关闭</button></header>
        <p class="hint">${escapeHtml(x.name || rel)}</p>
        <label>look 套装 <input id="vs-resend-look" class="adb-input" value="${escapeHtml(look)}" /></label>
        <label>补丁路径 <input id="vs-resend-patch" class="adb-input" value="${escapeHtml(patch)}" placeholder="提示词/分段补丁_背身蹲姿转头.txt" /></label>
        <label>送法
          <select id="vs-resend-mode" class="adb-input">
            <option value="pack"${mode === "pack" ? " selected" : ""}>整包</option>
            <option value="per_part"${mode === "per_part" ? " selected" : ""}>逐段</option>
          </select>
        </label>
        <label class="vs-shot-mark"><input type="checkbox" id="vs-resend-sanitize" /> 参考片降敏预处理</label>
        <label>备注 <input id="vs-resend-note" class="adb-input" placeholder="如：朝向拧断重送" /></label>
        <p class="hint">写入 resend_queue.json；强制 require_reference_video=true，不会丢掉视频参考。</p>
        <button type="button" class="btn primary" onclick="vsQueueResend('${escapeHtml(rel)}')">加入重送队列</button>
      </div>`;
  };

  window.vsCloseResend = function vsCloseResend() {
    const box = document.getElementById("vs-resend-drawer");
    if (box) {
      box.classList.add("hidden");
      box.innerHTML = "";
    }
  };

  window.vsQueueResend = async function vsQueueResend(rel) {
    const p = vsState.detail;
    if (!p || !rel) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/ark-packs/resend", {
      method: "POST",
      body: {
        rel,
        look_set: document.getElementById("vs-resend-look")?.value || "",
        patch: document.getElementById("vs-resend-patch")?.value || "",
        send_mode: document.getElementById("vs-resend-mode")?.value || "pack",
        sanitize: !!document.getElementById("vs-resend-sanitize")?.checked,
        note: document.getElementById("vs-resend-note")?.value || "",
      },
    });
    if (!res.ok) {
      alert(res.error || "入队失败");
      return;
    }
    vsCloseResend();
    alert(`已入重送队列（共 ${res.queue_len || 1}）\nlook=${res.item?.look_set || "-"}\nmode=${res.item?.send_mode || "-"}`);
  };

  window.vsSendArkPacks = async function vsSendArkPacks() {
    const p = vsState.detail;
    if (!p) return;
    const n = (p.shot_compare?.ark_packs?.items || p.ark_packs?.items || []).length;
    if (!n) {
      alert("还没有现成包，请先点「按人工判断拼包」。");
      return;
    }
    if (!confirm(`将直接用当前 ${n} 个现成包送方舟 Seedance（不重拼，强制视频参考）。过程可能较久，可看顶部进度。继续？`)) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/ark-packs/send", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "送方舟启动失败");
      if (res.gates || res.ark_packs) {
        p.shot_compare = p.shot_compare || {};
        if (res.ark_packs) p.shot_compare.ark_packs = res.ark_packs;
        if (res.gates) {
          p.shot_compare.gates = res.gates;
          if (p.shot_compare.ark_packs) p.shot_compare.ark_packs.gates = res.gates;
        }
        vsRenderCompare(p);
      }
      return;
    }
    // 新任务开始：清零轮询计数，避免沿用上次任务的「无变化」累计
    vsState.pollTick = 0;
    vsState.pollSig = "";
    if (res.job) p.job = res.job;
    if (res.ark_packs) {
      p.shot_compare = p.shot_compare || {};
      p.shot_compare.ark_packs = res.ark_packs;
    }
    vsState.compareMode = "ark";
    vsRenderCompare(p);
    vsRefreshResetBtn(p.job || { status: "running" });
    vsMaybePoll(p.job || { status: "running" });
    alert(res.message || "已开始送方舟");
  };

  window.vsShotFilter = function vsShotFilter() {
    const kind = document.getElementById("vs-shot-kind");
    const only = document.getElementById("vs-shot-only-marked");
    vsState.shotKindFilter = kind ? kind.value : "";
    vsState.shotOnlyMarked = !!(only && only.checked);
    if (vsState.detail) vsRenderCompare(vsState.detail);
  };

  function vsCollectShotDrafts() {
    const box = document.getElementById("vs-shot-list");
    if (!box) return {};
    const items = {};
    box.querySelectorAll(".vs-shot-card").forEach((card) => {
      const id = card.getAttribute("data-shot-id");
      if (!id) return;
      const marked = !!card.querySelector(".vs-shot-check")?.checked;
      const issue_type = card.querySelector(".vs-shot-type")?.value || "";
      const note = card.querySelector(".vs-shot-note")?.value || "";
      const prompt = card.querySelector(".vs-shot-prompt")?.value || "";
      const camera = card.querySelector(".vs-shot-camera")?.value || "";
      const scene = card.querySelector(".vs-shot-scene")?.value || "";
      const character = card.querySelector(".vs-shot-character")?.value || "";
      const action = card.querySelector(".vs-shot-action")?.value || "";
      const human_kind = card.querySelector(".vs-shot-human-kind")?.value || "";
      items[id] = { marked, issue_type, note, prompt, camera, scene, character, action, human_kind, source: "manual" };
    });
    return items;
  }

  window.vsShotDraft = function vsShotDraft(el) {
    const card = el && el.closest(".vs-shot-card");
    if (!card) return;
    const marked = !!card.querySelector(".vs-shot-check")?.checked;
    card.classList.toggle("is-marked", marked);
  };

  window.vsSaveShotIssues = async function vsSaveShotIssues() {
    const p = vsState.detail;
    if (!p) return;
    const items = vsCollectShotDrafts();
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/issues", {
      method: "POST",
      body: { items },
    });
    if (!res.ok) {
      alert(res.error || "保存失败");
      return;
    }
    if (res.shot_compare) p.shot_compare = res.shot_compare;
    vsRenderCompare(p);
    const sc = res.shot_compare || {};
    alert(
      "已保存。\n" +
        `人工改判 ${sc.judge_diff_count || 0} 段 · 问题说明 ${sc.note_count || 0} 段 · 勾选重跑 ${sc.marked_count || 0} 段\n` +
        "（「勾选重跑」才会计入重跑队列；只改下拉/说明不算问题段）"
    );
  };

  window.vsDescribeShot = async function vsDescribeShot(btn) {
    const p = vsState.detail;
    if (!p) return;
    const card = btn?.closest?.(".vs-shot-card");
    const id = card?.getAttribute("data-shot-id");
    if (!id) return;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "描述中…";
    try {
      const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/describe", {
        method: "POST",
        body: { ids: [id], only_missing: false, force: true },
      });
      if (!res.ok) {
        alert(res.error || "自动描述失败");
        return;
      }
      if (res.shot_compare) p.shot_compare = res.shot_compare;
      vsRenderCompare(p);
      if (res.failed) {
        const e0 = (res.errors && res.errors[0] && res.errors[0].error) || "";
        if (/429|RateLimit|RPM/i.test(e0)) {
          alert(
            "自动描述失败：方舟视觉接口触发每分钟限流（RPM/429）。\n\n" +
              "点一次「自动描述」大约只请求 1 次；若刚才失败重试、或批量描述、或其它任务也在用同一端点，会叠满额度。\n\n" +
              "请等 1～2 分钟再试；先审镜头不必依赖自动描述。"
          );
        } else {
          alert("描述有失败：" + e0.slice(0, 180));
        }
      }
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  window.vsDescribeMissing = async function vsDescribeMissing() {
    const p = vsState.detail;
    if (!p) return;
    const missing = (p.shot_compare?.items || []).filter((s) => s.has_shot && !s.has_desc).length;
    if (!missing) {
      alert("当前没有缺失说明的段。若要整页重跑，可对单段点「自动描述此段」。");
      return;
    }
    if (!confirm(`将对 ${missing} 段缺失说明的分镜抽帧并调用多模态自动填写（镜头/场景/角色/动作）。可能需要几分钟，继续？`)) {
      return;
    }
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/describe", {
      method: "POST",
      body: { only_missing: true, force: false },
    });
    if (!res.ok) {
      alert(res.error || "批量描述失败");
      return;
    }
    if (res.shot_compare) p.shot_compare = res.shot_compare;
    vsRenderCompare(p);
    alert(`自动描述完成：成功 ${res.updated || 0}，失败 ${res.failed || 0}`);
  };

  window.vsQueueReswap = async function vsQueueReswap() {
    const p = vsState.detail;
    if (!p) return;
    const items = vsCollectShotDrafts();
    const save = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/issues", {
      method: "POST",
      body: { items },
    });
    if (!save.ok) {
      alert(save.error || "保存标记失败");
      return;
    }
    const marked = Object.values(items).filter((x) => x.marked).length;
    if (!marked) {
      alert("请先勾选至少一段问题分镜，并填写问题类型/说明");
      if (save.shot_compare) p.shot_compare = save.shot_compare;
      vsRenderCompare(p);
      return;
    }
    if (
      !confirm(
        `将 ${marked} 个已标记问题段写入重跑队列？\n\n只排队、不会自动开始跑 Seedance。\n需要我执行时再在对话里说「按队列重跑」。`
      )
    ) {
      return;
    }
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/reswap", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "排队失败");
      return;
    }
    alert(`已写入队列 ${res.count} 段（未开跑）\n${res.queue_file || ""}`);
    await vsSelectProject(p.id, true);
    vsState.compareMode = "shots";
    vsSwitchTab("compare");
  };

  window.vsCancelReswap = async function vsCancelReswap() {
    const p = vsState.detail;
    if (!p) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/shots/reswap/cancel", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "取消失败");
      return;
    }
    await vsSelectProject(p.id, true);
    vsState.compareMode = "shots";
    vsSwitchTab("compare");
  };

  const vsSyncBind = new WeakMap();

  function vsVideoSeek(video, time) {
    return new Promise((resolve) => {
      const target = Math.max(0, Number(time) || 0);
      const dur = Number(video.duration);
      const clamped = Number.isFinite(dur) && dur > 0 ? Math.min(target, Math.max(0, dur - 0.05)) : target;
      if (video.ended || Math.abs((video.currentTime || 0) - clamped) > 0.04) {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener("seeked", finish);
          resolve();
        };
        video.addEventListener("seeked", finish);
        try {
          video.currentTime = clamped;
        } catch (_) {
          finish();
          return;
        }
        setTimeout(finish, 400);
      } else {
        resolve();
      }
    });
  }

  function vsVideoReady(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("canplay", done);
        resolve();
      };
      video.addEventListener("loadeddata", done);
      video.addEventListener("canplay", done);
      try {
        video.load();
      } catch (_) {}
      setTimeout(done, 800);
    });
  }

  function vsUnbindPairSync(root) {
    const prev = vsSyncBind.get(root);
    if (!prev) return;
    prev.master.removeEventListener("timeupdate", prev.onTime);
    prev.master.removeEventListener("ended", prev.onEnded);
    prev.master.removeEventListener("pause", prev.onPause);
    vsSyncBind.delete(root);
  }

  function vsBindPairSync(root, master, slave) {
    vsUnbindPairSync(root);
    const onTime = () => {
      if (master.paused) return;
      const drift = Math.abs((slave.currentTime || 0) - (master.currentTime || 0));
      if (drift > 0.25) {
        try {
          slave.currentTime = master.currentTime;
        } catch (_) {}
      }
      if (slave.paused) {
        slave.play().catch(() => {});
      }
    };
    const onEnded = () => {
      slave.pause();
      vsUnbindPairSync(root);
      if (root._vsSyncBtn) root._vsSyncBtn.textContent = "左右同步播放/暂停";
    };
    const onPause = () => {
      if (!slave.paused) slave.pause();
    };
    master.addEventListener("timeupdate", onTime);
    master.addEventListener("ended", onEnded);
    master.addEventListener("pause", onPause);
    vsSyncBind.set(root, { master, slave, onTime, onEnded, onPause });
  }

  window.vsSyncDual = async function vsSyncDual(btn) {
    const root =
      (btn && btn.closest(".vs-shot-card")) ||
      (btn && btn.closest(".vs-dual-block")) ||
      (btn && btn.parentElement);
    if (!root) return;
    const vids = [...root.querySelectorAll(".vs-dual video")];
    if (vids.length < 2) return;
    const [left, right] = vids;
    root._vsSyncBtn = btn;

    const anyPlaying = !left.paused || !right.paused;
    if (anyPlaying) {
      left.pause();
      right.pause();
      vsUnbindPairSync(root);
      if (btn) btn.textContent = "左右同步播放/暂停";
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "准备中…";
    }

    document.querySelectorAll(".vs-shot-card video, .vs-dual-block video").forEach((v) => {
      if (v !== left && v !== right && !v.paused) v.pause();
    });

    try {
      await Promise.all([vsVideoReady(left), vsVideoReady(right)]);

      let t = left.currentTime || 0;
      const nearEnd = (v) => {
        const d = Number(v.duration);
        return v.ended || (Number.isFinite(d) && d > 0 && (v.currentTime || 0) >= d - 0.2);
      };
      if (nearEnd(left) || nearEnd(right)) t = 0;

      left.pause();
      right.pause();
      await Promise.all([vsVideoSeek(left, t), vsVideoSeek(right, t)]);

      try {
        await left.play();
      } catch (_) {
        await vsVideoSeek(left, t);
        await left.play();
      }
      try {
        await right.play();
      } catch (_) {
        await vsVideoSeek(right, left.currentTime || t);
        await right.play();
      }

      vsBindPairSync(root, left, right);
      if (btn) btn.textContent = "同步暂停";
    } catch (err) {
      left.pause();
      right.pause();
      vsUnbindPairSync(root);
      if (btn) btn.textContent = "左右同步播放/暂停";
      console.warn("vsSyncDual", err);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  function vsRenderReports(p) {
    const box = document.getElementById("vs-reports");
    if (!box) return;
    const items = p.reports || [];
    if (!items.length) {
      box.innerHTML = `<div class="hint">暂无报告</div>`;
      return;
    }
    box.innerHTML = items
      .map(
        (it) => `
      <details class="vs-report-card" open>
        <summary>
          <strong>${escapeHtml(it.label || it.name)}</strong>
          <span class="hint">${escapeHtml(it.mtime || "")} · ${vsFmtSize(it.size)}</span>
        </summary>
        <div class="vs-report-html">${vsSimpleMarkdown(it.preview || "")}</div>
        <a class="btn" href="${vsFileUrl(p.id, it.rel)}" target="_blank" rel="noopener">打开原文件</a>
      </details>`
      )
      .join("");
  }

  function vsRenderLogs(p) {
    const el = document.getElementById("vs-log");
    if (!el) return;
    const parts = [];
    const job = p.job || {};
    if ((job.events || []).length) {
      parts.push(
        "—— 任务事件 ——\n" +
          job.events
            .map((e) => `[${e.ts || ""}][${e.level || "info"}][${e.step || ""}] ${e.message || ""}${e.error_code ? " · " + e.error_code : ""}`)
            .join("\n")
      );
    } else if ((job.logs || []).length) {
      parts.push("—— 任务进度日志 ——\n" + job.logs.join("\n"));
    }
    (p.file_logs || []).forEach((f) => {
      parts.push(`—— ${f.name}（尾部）· ${f.mtime || ""} ——\n${f.tail || "(空)"}`);
    });
    el.textContent = parts.length ? parts.join("\n\n") : "暂无日志。可点「标记开始 / 演示进度」，或由 Agent 上报 progress。";
  }

  window.vsSwitchTab = function vsSwitchTab(tab) {
    vsState.tab = tab;
    document.querySelectorAll(".vs-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    ["overview", "guide", "costumes", "sources", "outputs", "reports", "logs"].forEach((id) => {
      const panel = document.getElementById("vs-tab-" + id);
      if (panel) panel.classList.toggle("hidden", id !== tab);
    });
    // 旧「对照」Tab 已并入顶部 Stepper：这里做等价映射，避免老入口失效
    if (tab === "compare") {
      const map = { full: "s3", shots: "s1", ark: "s2" };
      vsSetScene(map[vsState.compareMode] || "s1");
      return;
    }
    if (tab === "guide") vsLoadGuide(true);
  };

  window.vsPreview = function vsPreview(projectId, rel, kind, title) {
    const modal = document.getElementById("vs-preview-modal");
    const body = document.getElementById("vs-preview-body");
    const t = document.getElementById("vs-preview-title");
    if (!modal || !body) return;
    if (t) t.textContent = title || "预览";
    const url = vsFileUrl(projectId, rel);
    if (kind === "image") body.innerHTML = `<img src="${url}" alt="">`;
    else body.innerHTML = `<video controls autoplay src="${url}"></video>`;
    modal.classList.remove("hidden");
  };

  window.vsClosePreview = function vsClosePreview() {
    const modal = document.getElementById("vs-preview-modal");
    const body = document.getElementById("vs-preview-body");
    if (body) body.innerHTML = "";
    if (modal) modal.classList.add("hidden");
  };

  window.vsOpenFolder = async function vsOpenFolder() {
    const id = vsState.activeId;
    if (!id) {
      alert("请先选择项目");
      return;
    }
    const res = await api("video-swap/projects/" + encodeURIComponent(id) + "/open-folder", {
      method: "POST",
      body: {},
    });
    if (!res.ok) alert(res.error || "打开失败");
  };

  window.vsSetBaseline = async function vsSetBaseline(version) {
    const p = vsState.detail;
    if (!p) return;
    const ver =
      version ||
      prompt("将哪个版本设为推荐基线？", p.recommended_version || (vsPickRecommended(p) || {}).version || "v5");
    if (!ver) return;
    if (!confirm(`确认把「${p.name}」基线设为 ${ver}？\n不会删除其它版本文件。`)) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/baseline", {
      method: "POST",
      body: { version: ver },
    });
    if (!res.ok) {
      alert(res.error || "设置失败");
      return;
    }
    await vsSelectProject(p.id);
  };

  window.vsBuildCompare = async function vsBuildCompare() {
    const p = vsState.detail;
    if (!p) return;
    if (!confirm("用 ffmpeg 生成前 12 秒左右对照片（原片 | 基线成片）？")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/compare", {
      method: "POST",
      body: { version: p.recommended_version || "", duration: 12 },
      timeoutMs: 200000,
    });
    if (!res.ok) {
      alert(res.error || "生成失败");
      await vsSelectProject(p.id, true);
      return;
    }
    alert("对照已生成：\n" + (res.path || ""));
    await vsSelectProject(p.id);
    vsSwitchTab("compare");
  };

  window.vsRunDemo = async function vsRunDemo() {
    const p = vsState.detail;
    if (!p) return;
    if (!confirm("演示完整进度条（不调用 Seedance，约数秒）？")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/demo", {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      alert(res.error || "无法开始演示");
      return;
    }
    vsMaybePoll({ status: "running" });
    setTimeout(() => vsSelectProject(p.id, true), 400);
  };

  window.vsMarkJob = async function vsMarkJob(action) {
    const p = vsState.detail;
    if (!p) return;
    if (action === "start" && !confirm("标记任务开始？\n真实换角请按「流程说明」由 Agent/脚本执行，并持续上报 progress。")) return;
    const res = await api("video-swap/projects/" + encodeURIComponent(p.id) + "/mark", {
      method: "POST",
      body: { action },
    });
    if (!res.ok) alert(res.error || "操作失败");
    await vsSelectProject(p.id, true);
    if (action === "start") vsMaybePoll({ status: "running" });
  };

  window.vsCreateProject = async function vsCreateProject() {
    const name = prompt("新项目名称（如：新片试换）");
    if (!name) return;
    const res = await api("video-swap/projects", {
      method: "POST",
      body: { name },
    });
    if (!res.ok) {
      alert(res.error || "创建失败");
      return;
    }
    alert("已创建项目骨架目录，请按流程说明放入定妆照与原片。");
    await vsRefresh();
    if (res.project && res.project.id) await vsSelectProject(res.project.id);
    vsSwitchTab("guide");
  };
})();
