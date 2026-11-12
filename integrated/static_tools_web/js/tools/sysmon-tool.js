(function () {
  const HISTORY_MAX = 60;
  const THRESH = { cpu: 85, mem: 85, disk: 90 };

  function fmtBytes(n) {
    if (!Number.isFinite(n) || n < 0) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return (i === 0 ? Math.round(v) : v.toFixed(i >= 3 ? 2 : 1)) + " " + u[i];
  }

  function fmtRate(bytesPerSec) {
    if (!Number.isFinite(bytesPerSec)) return "—";
    return fmtBytes(bytesPerSec) + "/s";
  }

  function drawSparkline(canvas, values, color, maxY) {
    if (!canvas || !values.length) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#eef2f6";
    ctx.fillRect(0, 0, w, h);
    const max =
      maxY != null && maxY > 0
        ? maxY
        : Math.max(100, ...values.map((v) => (Number.isFinite(v) ? v : 0))) * 1.05 || 100;
    const step = w / Math.max(values.length - 1, 1);
    ctx.beginPath();
    ctx.strokeStyle = color || "#3498db";
    ctx.lineWidth = 1.5;
    values.forEach((v, i) => {
      const x = i * step;
      const val = Number.isFinite(v) ? v : 0;
      const y = h - (Math.min(max, Math.max(0, val)) / max) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function buildAlerts(data) {
    const tips = [];
    if (data.cpu.loadPct >= THRESH.cpu) {
      tips.push({
        level: "warn",
        text: "CPU 使用率较高（≥" + THRESH.cpu + "%）。可尝试：关闭占用 CPU 的浏览器标签/后台程序；检查任务管理器中的「启动」项。"
      });
    }
    if (data.mem.usedPct >= THRESH.mem) {
      tips.push({
        level: "warn",
        text:
          "内存占用较高（≥" +
          THRESH.mem +
          "%）。可尝试：关闭不用的应用；若常开大型 IDE/虚拟机，考虑增加物理内存。"
      });
    }
    (data.disks || []).forEach((d) => {
      if (d.use >= THRESH.disk) {
        tips.push({
          level: "warn",
          text:
            "磁盘「" +
            (d.mount || d.fs) +
            "」空间紧张（≥" +
            THRESH.disk +
            "%）。可尝试：清理下载/回收站；用系统「存储」分析大文件；卸载不用的软件。"
        });
      }
    });
    return tips;
  }

  function renderBrowserFallback(container) {
    container.innerHTML =
      "<h2>本机性能</h2>" +
      "<p>在浏览器中无法读取 CPU、内存、磁盘等系统信息（浏览器安全限制）。</p>" +
      "<div class=\"sysmon-fallback\">" +
      "<p><strong>请使用桌面版：</strong>在本项目 <code>desktop</code> 目录执行 <code>npm install</code> 后运行 <code>npm start</code>，即可在窗口内使用与任务管理器「性能」类似的监控与提示。</p>" +
      "</div>" +
      (typeof navigator !== "undefined" && navigator.deviceMemory
        ? "<p class=\"sysmon-hint\">当前浏览器报告的粗略设备内存约 <strong>" +
          navigator.deviceMemory +
          " GB</strong>（仅供参考）。</p>"
        : "") +
      "<p class=\"sysmon-hint\">Web 版其它工具不受影响，可继续正常使用。</p>";
  }

  function renderSysmonTool(container) {
    const api = typeof window !== "undefined" ? window.toolsDesktop : undefined;
    if (!api || typeof api.getStats !== "function") {
      renderBrowserFallback(container);
      return;
    }

    container.innerHTML =
      "<h2>本机性能</h2>" +
      "<p>数据来自本机，约每 4 秒刷新（降低对本机 CPU 占用）；高占用时会给出处理建议。</p>" +
      '<div id="sysmonAlerts" class="sysmon-alerts" aria-live="polite"></div>' +
      '<div class="sysmon-layout">' +
      '<nav id="sysmonNav" class="sysmon-sidebar" aria-label="监控分类">' +
      '<p class="sysmon-loading" id="sysmonLoading">正在读取本机信息…</p>' +
      "</nav>" +
      '<div class="sysmon-main">' +
      '<div id="sysmonTitle" class="sysmon-title">准备中…</div>' +
      '<canvas id="sysmonChart" class="sysmon-chart" width="640" height="180" aria-label="使用率曲线"></canvas>' +
      '<div id="sysmonDetail" class="sysmon-detail"></div>' +
      "</div></div>" +
      '<p id="sysmonErr" class="sysmon-err" role="status"></p>';

    const navEl = container.querySelector("#sysmonNav");
    const titleEl = container.querySelector("#sysmonTitle");
    const chartEl = container.querySelector("#sysmonChart");
    const detailEl = container.querySelector("#sysmonDetail");
    const alertsEl = container.querySelector("#sysmonAlerts");
    const errEl = container.querySelector("#sysmonErr");

    const state = {
      tab: "cpu",
      diskIndex: 0,
      cpuHist: [],
      memHist: [],
      netHist: [],
      diskUseHist: [],
      gpuUtilHist: [],
      last: null
    };

    function setTab(tab, diskIdx) {
      if (tab === "disk" && typeof diskIdx === "number" && diskIdx !== state.diskIndex) {
        state.diskUseHist = [];
      }
      state.tab = tab;
      if (typeof diskIdx === "number") state.diskIndex = diskIdx;
      navEl.querySelectorAll(".sysmon-nav-item").forEach((btn) => {
        const t = btn.getAttribute("data-tab");
        const di = btn.getAttribute("data-disk-index");
        const on =
          t === state.tab && (state.tab !== "disk" || Number(di) === state.diskIndex);
        btn.classList.toggle("active", on);
      });
      paint();
    }

    function paint() {
      const d = state.last;
      if (!d) return;

      if (state.tab === "cpu") {
        titleEl.textContent = "CPU · " + (d.cpu.brand || "处理器");
        drawSparkline(chartEl, state.cpuHist, "#3498db", 100);
        detailEl.innerHTML =
          '<dl class="sysmon-metric-grid">' +
          "<dt>利用率</dt><dd>" +
          d.cpu.loadPct +
          "%</dd>" +
          "<dt>基准速度</dt><dd>" +
          (d.cpu.speedGhz ? d.cpu.speedGhz + " GHz" : "—") +
          "</dd>" +
          "<dt>逻辑处理器</dt><dd>" +
          (d.cpu.cores || "—") +
          "</dd>" +
          "<dt>物理核心</dt><dd>" +
          (d.cpu.physicalCores || "—") +
          "</dd>" +
          "</dl>";
      } else if (state.tab === "mem") {
        titleEl.textContent = "内存 · 总计 " + fmtBytes(d.mem.total);
        drawSparkline(chartEl, state.memHist, "#9b59b6", 100);
        const avail = d.mem.available != null ? d.mem.available : d.mem.total - d.mem.used;
        detailEl.innerHTML =
          '<dl class="sysmon-metric-grid">' +
          "<dt>已使用</dt><dd>" +
          fmtBytes(d.mem.used) +
          "（" +
          d.mem.usedPct +
          "%）</dd>" +
          "<dt>可用</dt><dd>" +
          fmtBytes(avail) +
          "</dd>" +
          "<dt>组合示意</dt><dd><div class=\"sysmon-bar\"><span style=\"width:" +
          Math.min(100, d.mem.usedPct) +
          '%"></span></div></dd>' +
          "</dl>";
      } else if (state.tab === "disk") {
        const disks = d.disks || [];
        const di = Math.min(state.diskIndex, Math.max(0, disks.length - 1));
        const disk = disks[di] || {};
        titleEl.textContent = "磁盘 · " + (disk.mount || disk.fs || "—");
        drawSparkline(chartEl, state.diskUseHist.length ? state.diskUseHist : [disk.use || 0], "#16a085", 100);
        detailEl.innerHTML =
          '<dl class="sysmon-metric-grid">' +
          "<dt>文件系统</dt><dd>" +
          (disk.fs || "—") +
          "</dd>" +
          "<dt>类型</dt><dd>" +
          (disk.type || "—") +
          "</dd>" +
          "<dt>已用 / 总容量</dt><dd>" +
          fmtBytes(disk.used) +
          " / " +
          fmtBytes(disk.size) +
          "</dd>" +
          "<dt>使用率</dt><dd>" +
          (disk.use != null ? disk.use + "%" : "—") +
          "</dd>" +
          "</dl>";
      } else if (state.tab === "net") {
        titleEl.textContent = "网络";
        const nets = d.networks || [];
        const netMax = Math.max(1, ...state.netHist.map((v) => (Number.isFinite(v) ? v : 0)));
        drawSparkline(chartEl, state.netHist.length ? state.netHist : [0], "#e67e22", netMax);
        const rows = nets
          .map(
            (n) =>
              "<tr><td>" +
              escapeHtml(n.iface) +
              "</td><td>" +
              fmtRate(n.rxSec) +
              "</td><td>" +
              fmtRate(n.txSec) +
              "</td></tr>"
          )
          .join("");
        detailEl.innerHTML =
          "<table class=\"sysmon-table\"><thead><tr><th>接口</th><th>接收</th><th>发送</th></tr></thead><tbody>" +
          (rows || "<tr><td colspan=\"3\">暂无数据</td></tr>") +
          "</tbody></table>" +
          "<p class=\"sysmon-hint\">首次采样后速率会更准确；虚拟网卡可能也会出现在列表中。</p>";
      } else if (state.tab === "gpu") {
        titleEl.textContent = "GPU";
        const gpus = d.gpus || [];
        drawSparkline(
          chartEl,
          state.gpuUtilHist.length ? state.gpuUtilHist : [gpus[0] && gpus[0].utilizationGpu != null ? gpus[0].utilizationGpu : 0],
          "#8e44ad",
          100
        );
        if (!gpus.length) {
          detailEl.innerHTML =
            "<p>未检测到独立显卡信息，或驱动未提供利用率（集显常见）。</p>";
        } else {
          detailEl.innerHTML = gpus
            .map(
              (g, i) =>
                '<div class="sysmon-gpu-block"><h3>GPU ' +
                i +
                "</h3>" +
                '<dl class="sysmon-metric-grid">' +
                "<dt>型号</dt><dd>" +
                escapeHtml(g.model || "—") +
                "</dd>" +
                "<dt>厂商</dt><dd>" +
                escapeHtml(g.vendor || "—") +
                "</dd>" +
                "<dt>显存</dt><dd>" +
                (g.vram != null ? g.vram + " MB" : "—") +
                "</dd>" +
                "<dt>利用率</dt><dd>" +
                (g.utilizationGpu != null ? g.utilizationGpu + "%" : "—") +
                "</dd>" +
                "</dl></div>"
            )
            .join("");
        }
      }
    }

    function escapeHtml(s) {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    function rebuildNav(d) {
      const disks = d.disks || [];
      let html =
        '<button type="button" class="sysmon-nav-item" data-tab="cpu">CPU<span class="sysmon-nav-sub" id="navCpuSub"></span></button>' +
        '<button type="button" class="sysmon-nav-item" data-tab="mem">内存<span class="sysmon-nav-sub" id="navMemSub"></span></button>';
      disks.forEach((disk, i) => {
        html +=
          '<button type="button" class="sysmon-nav-item" data-tab="disk" data-disk-index="' +
          i +
          '">' +
          escapeHtml(disk.mount || disk.fs || "磁盘 " + i) +
          '<span class="sysmon-nav-sub">' +
          (disk.use != null ? disk.use + "%" : "") +
          "</span></button>";
      });
      html +=
        '<button type="button" class="sysmon-nav-item" data-tab="net">网络</button>' +
        '<button type="button" class="sysmon-nav-item" data-tab="gpu">GPU</button>';
      navEl.innerHTML = html;
      navEl.querySelectorAll(".sysmon-nav-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tab = btn.getAttribute("data-tab");
          const di = btn.getAttribute("data-disk-index");
          setTab(tab, di != null ? Number(di) : undefined);
        });
      });
    }

    let tickBusy = false;

    function tick() {
      if (!container.classList.contains("active")) return;
      if (tickBusy) return;
      tickBusy = true;
      api
        .getStats()
        .then((res) => {
        errEl.textContent = "";
        if (!res || !res.ok) {
          const loadingFail = container.querySelector("#sysmonLoading");
          if (loadingFail) loadingFail.remove();
          errEl.textContent = res && res.error ? "读取失败：" + res.error : "读取失败";
          return;
        }
        const d = res.data;
        state.last = d;
        state.cpuHist.push(d.cpu.loadPct);
        state.memHist.push(d.mem.usedPct);
        if (state.cpuHist.length > HISTORY_MAX) state.cpuHist.shift();
        if (state.memHist.length > HISTORY_MAX) state.memHist.shift();

        const disks = d.disks || [];
        if (state.diskIndex >= disks.length) state.diskIndex = Math.max(0, disks.length - 1);
        const di = Math.min(state.diskIndex, Math.max(0, disks.length - 1));
        const disk = disks[di];
        state.diskUseHist.push(disk && disk.use != null ? disk.use : 0);
        if (state.diskUseHist.length > HISTORY_MAX) state.diskUseHist.shift();

        const nets = d.networks || [];
        const rx = nets.reduce((s, n) => s + (n.rxSec || 0), 0);
        const tx = nets.reduce((s, n) => s + (n.txSec || 0), 0);
        state.netHist.push(rx + tx);
        if (state.netHist.length > HISTORY_MAX) state.netHist.shift();

        const g0 = (d.gpus || [])[0];
        state.gpuUtilHist.push(g0 && g0.utilizationGpu != null ? g0.utilizationGpu : 0);
        if (state.gpuUtilHist.length > HISTORY_MAX) state.gpuUtilHist.shift();

        rebuildNav(d);
        const cpuSub = navEl.querySelector("#navCpuSub");
        const memSub = navEl.querySelector("#navMemSub");
        if (cpuSub) cpuSub.textContent = d.cpu.loadPct + "% · " + (d.cpu.speedGhz ? d.cpu.speedGhz + " GHz" : "");
        if (memSub)
          memSub.textContent =
            fmtBytes(d.mem.used) + " / " + fmtBytes(d.mem.total) + " · " + d.mem.usedPct + "%";

        const tips = buildAlerts(d);
        alertsEl.innerHTML = tips
          .map((t) => '<div class="sysmon-alert sysmon-alert--' + t.level + '">' + escapeHtml(t.text) + "</div>")
          .join("");

        setTab(state.tab, state.tab === "disk" ? state.diskIndex : undefined);

        const loadingEl = container.querySelector("#sysmonLoading");
        if (loadingEl) loadingEl.remove();
      })
        .catch((e) => {
          errEl.textContent = "读取失败：" + (e && e.message ? e.message : String(e));
        })
        .finally(() => {
          tickBusy = false;
        });
    }

    tick();
    window.setInterval(tick, 4000);
  }

  window.renderSysmonTool = renderSysmonTool;
})();
