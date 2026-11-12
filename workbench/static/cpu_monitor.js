/* CPU 占用监控独立页 */

const CPU_TAG = {
  normal: "应用",
  system: "系统",
  protected: "工作台",
  blocked: "禁止",
};

let cpuPollTimer = null;
let cpuPendingKill = null;

function cpuEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function cpuApi(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    headers: { "Content-Type": "application/json" },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `接口返回异常（${res.status}）` };
  }
}

function formatCpuTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

function renderCpuRows(processes) {
  const tbody = document.getElementById("cpu-tbody");
  if (!tbody) return;
  if (!processes?.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="cpu-empty">暂无进程数据</td></tr>';
    return;
  }
  tbody.innerHTML = processes
    .map((p, i) => {
      const rank = i + 1;
      const top = rank <= 5 ? " cpu-row-top5" : "";
      const killBtn = p.killable
        ? `<button type="button" class="cpu-kill-btn" title="结束进程" onclick="openCpuKillModal(${p.pid})">×</button>`
        : `<span class="cpu-kill-disabled" title="${cpuEscape(p.consequence)}">—</span>`;
      return `<tr class="cpu-row${top}" data-pid="${p.pid}">
        <td class="cpu-col-rank">${rank <= 5 ? `<strong>${rank}</strong>` : rank}</td>
        <td class="cpu-col-name" title="${cpuEscape(p.name)}">${cpuEscape(p.name)}</td>
        <td class="cpu-col-pid">${p.pid}</td>
        <td class="cpu-col-cpu">${p.cpu.toFixed(1)}</td>
        <td class="cpu-col-mem">${p.memory_mb.toFixed(1)}</td>
        <td class="cpu-col-th">${p.threads}</td>
        <td class="cpu-col-tag"><span class="cpu-tag cpu-tag-${p.category}">${CPU_TAG[p.category] || p.category}</span></td>
        <td class="cpu-col-act">${killBtn}</td>
      </tr>`;
    })
    .join("");
}

async function loadCpuMonitorPage() {
  const data = await cpuApi("cpu-monitor/processes");
  const totalEl = document.getElementById("cpu-total");
  const metaEl = document.getElementById("cpu-meta");
  if (!data?.ok) {
    if (metaEl) metaEl.textContent = data?.error || "加载失败";
    return;
  }
  if (totalEl) totalEl.textContent = `总 CPU ${data.total_cpu}%`;
  if (metaEl) {
    const hint = data.sampling ? " · 扫描中…" : data.sample_count < 2 ? " · 第二轮起 CPU 百分比更准确" : "";
    metaEl.textContent = `${data.count} 个进程 · 更新 ${formatCpuTime(data.updated_at)} · 采样 #${data.sample_count || 0}${hint}`;
  }
  renderCpuRows(data.processes);
}

function openCpuKillModal(pid) {
  cpuApi("cpu-monitor/processes").then((data) => {
    const proc = (data.processes || []).find((p) => p.pid === pid);
    if (!proc) {
      alert("进程已不存在，请刷新列表");
      loadCpuMonitorPage();
      return;
    }
    if (!proc.killable) {
      alert(proc.consequence || "该进程无法结束");
      return;
    }
    cpuPendingKill = proc;
    const target = document.getElementById("cpu-kill-target");
    const warn = document.getElementById("cpu-kill-warn");
    const hint = document.getElementById("cpu-kill-hint");
    const confirmBtn = document.getElementById("cpu-kill-confirm");
    if (target) {
      target.innerHTML = `确定结束 <strong>${cpuEscape(proc.name)}</strong>（PID ${proc.pid}）？<br>当前 CPU ${proc.cpu.toFixed(1)}% · 内存 ${proc.memory_mb.toFixed(1)} MB`;
    }
    if (warn) {
      if (proc.category === "system" || proc.elevated) {
        warn.classList.remove("hidden");
        const title = proc.elevated ? "高权限/模拟器进程 · 关闭说明" : "系统类进程 · 关闭后果";
        warn.innerHTML = `<strong>${title}</strong><p>${cpuEscape(proc.consequence)}</p>`;
      } else {
        warn.classList.add("hidden");
        warn.innerHTML = "";
      }
    }
    if (hint) {
      hint.textContent =
        proc.elevated
          ? "该进程通常需更高权限；若结束失败，请按上方说明从 MuMu 客户端退出。"
          : proc.category === "normal"
            ? proc.consequence
            : proc.category === "system"
              ? "请再次确认：上述后果可能在结束后立即或稍后发生。"
              : "";
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent =
        proc.category === "system" || proc.elevated ? "我已了解后果，确认结束" : "确认结束";
    }
    document.getElementById("cpu-kill-modal")?.classList.remove("hidden");
  });
}

function closeCpuKillModal() {
  cpuPendingKill = null;
  document.getElementById("cpu-kill-modal")?.classList.add("hidden");
}

async function cleanupMumuOrphans() {
  if (!confirm("通过 MuMu 官方 CLI 关闭全部模拟器实例（含崩溃残留的 Headless 虚拟机）？\n\n适合：双开自动化时 MuMu 崩溃、界面没了但 MuMuVMMHeadless 还在占 CPU/内存。\n\n不会删除模拟器数据。")) {
    return;
  }
  const res = await cpuApi("cpu-monitor/mumu-cleanup", { method: "POST", body: {} });
  if (!res?.ok) {
    alert(res?.error || "清理失败");
    return;
  }
  let msg = res.message || "已清理";
  if (res.mumu_after > 0) {
    msg += `\n\n仍有 ${res.mumu_after} 个 MuMu 相关进程未退出，可重启电脑或管理员运行工作台后手动结束。`;
  }
  alert(msg);
  loadCpuMonitorPage();
}

async function confirmCpuKill() {
  if (!cpuPendingKill) return;
  const btn = document.getElementById("cpu-kill-confirm");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "结束中…";
  }
  const res = await cpuApi("cpu-monitor/kill", {
    method: "POST",
    body: { pid: cpuPendingKill.pid },
  });
  closeCpuKillModal();
  if (!res?.ok) {
    alert(res?.error || "结束失败");
  } else {
    alert(res.message || "已结束");
  }
  loadCpuMonitorPage();
}

function startCpuPoll() {
  stopCpuPoll();
  loadCpuMonitorPage();
  cpuPollTimer = setInterval(loadCpuMonitorPage, 1500);
}

function stopCpuPoll() {
  if (cpuPollTimer) {
    clearInterval(cpuPollTimer);
    cpuPollTimer = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCpuPoll();
  else startCpuPoll();
});

startCpuPoll();
