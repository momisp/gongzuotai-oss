(function () {
  const SESSION_KEY = "netrank-selfcheck-v1";
  const WARN_RATE = 512 * 1024;
  const HIGH_RATE = 2 * 1024 * 1024;

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

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function pctBar(value, max, tone) {
    const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const cls = tone ? " netrank-bar--" + tone : "";
    return (
      '<div class="netrank-bar' + cls + '" aria-hidden="true"><span style="width:' + w + '%"></span></div>'
    );
  }

  function procKey(p) {
    return (p.name || "—").toLowerCase();
  }

  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveSession(store) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function resetSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function accumulateSession(procs, sampleMs) {
    const store = loadSession();
    if (!store._meta) {
      store._meta = { started: Date.now(), snaps: 0 };
    }
    store._meta.snaps = (store._meta.snaps || 0) + 1;
    store._meta.last = Date.now();
    const dt = Math.max(0.2, (sampleMs || 1000) / 1000);

    procs.forEach((p) => {
      const key = procKey(p);
      if (!store[key]) {
        store[key] = { bytesRecv: 0, bytesSent: 0, pid: p.pid || null, name: p.name || key };
      }
      store[key].bytesRecv += (p.rxSec || 0) * dt;
      store[key].bytesSent += (p.txSec || 0) * dt;
      if (p.pid && !store[key].pid) store[key].pid = p.pid;
      if (p.name) store[key].name = p.name;
    });

    saveSession(store);
    return store;
  }

  function applySessionToProcs(procs, method) {
    const store = loadSession();
    const useTcpBytes = method === "tcp-estats";

    return procs.map((p) => {
      const s = store[procKey(p)];
      const sessionRecv = s ? Math.round(s.bytesRecv || 0) : 0;
      const sessionSent = s ? Math.round(s.bytesSent || 0) : 0;
      const sessionTotal = sessionRecv + sessionSent;
      const hasTcpBytes = useTcpBytes && (p.bytesTotal || 0) > 0;

      return {
        ...p,
        sessionBytesRecv: sessionRecv,
        sessionBytesSent: sessionSent,
        sessionBytesTotal: sessionTotal,
        bytesRecv: hasTcpBytes ? p.bytesRecv || 0 : sessionRecv,
        bytesSent: hasTcpBytes ? p.bytesSent || 0 : sessionSent,
        bytesTotal: hasTcpBytes ? p.bytesTotal || 0 : sessionTotal,
        bytesSource: hasTcpBytes ? "tcp" : "session",
      };
    });
  }

  function renderFallback(container) {
    container.innerHTML =
      "<h2>流量自查快照</h2>" +
      "<p>浏览器无法直接读取本机网卡与进程网络信息。</p>" +
      '<div class="sysmon-fallback">' +
      "<p><strong>方式一：</strong>通过工作台打开本页（<code>http://127.0.0.1:8765/tools-site/</code>），由本机 Flask 服务采集。</p>" +
      "<p><strong>方式二：</strong>使用 <code>desktop</code> 目录的 Electron 桌面版（<code>npm start</code>）。</p>" +
      "</div>";
  }

  function fetchTrafficRank() {
    const api = typeof window !== "undefined" ? window.toolsDesktop : undefined;
    if (api && typeof api.getTrafficRank === "function") {
      return api.getTrafficRank();
    }
    return fetch("/api/sys/traffic-rank")
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "无法连接本机采集服务" }));
  }

  function sumIfaceRates(ifaces) {
    return (ifaces || []).reduce(
      (acc, n) => {
        acc.rxSec += n.rxSec || 0;
        acc.txSec += n.txSec || 0;
        acc.totalSec += n.totalSec || 0;
        return acc;
      },
      { rxSec: 0, txSec: 0, totalSec: 0 }
    );
  }

  function sumProcSession(procs) {
    return (procs || []).reduce(
      (acc, p) => {
        acc.bytesRecv += p.bytesRecv || 0;
        acc.bytesSent += p.bytesSent || 0;
        acc.bytesTotal += p.bytesTotal || 0;
        acc.totalSec += p.totalSec || 0;
        return acc;
      },
      { bytesRecv: 0, bytesSent: 0, bytesTotal: 0, totalSec: 0 }
    );
  }

  function projectBytes(bytesPerSec, seconds) {
    if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return 0;
    return bytesPerSec * seconds;
  }

  function renderTrafficProjection(rateTotal) {
    if (!Number.isFinite(rateTotal) || rateTotal <= 0) {
      return (
        '<div class="netrank-projection">' +
        '<p class="netrank-proj-hint">当前无明显网络流量，暂无法估算持续消耗。</p>' +
        "</div>"
      );
    }

    const durations = [
      { label: "1 小时", seconds: 3600 },
      { label: "30 分钟", seconds: 1800 },
      { label: "10 分钟", seconds: 600 },
    ];

    const rows = durations
      .map(
        (d) =>
          "<tr><td>" +
          d.label +
          "</td><td>约 " +
          fmtBytes(projectBytes(rateTotal, d.seconds)) +
          "</td></tr>"
      )
      .join("");

    const perHour = projectBytes(rateTotal, 3600);
    let context = "";
    if (perHour >= 5 * 1024 * 1024 * 1024) {
      context = "相当于大文件下载或远程串流级别，连续使用极易被流量审计关注。";
    } else if (perHour >= 1024 * 1024 * 1024) {
      context = "1 小时超过 1 GB，若在公司网络持续运行较容易被记录。";
    } else if (perHour >= 200 * 1024 * 1024) {
      context = "中等流量；持续数小时可能引起网络监控留意。";
    } else if (perHour >= 50 * 1024 * 1024) {
      context = "偏低；日常办公浏览一般无碍，后台下载需留意。";
    } else {
      context = "很低，通常不会引起网络监控注意。";
    }

    return (
      '<div class="netrank-projection">' +
      "<h4>若保持当前速率</h4>" +
      '<table class="netrank-proj-table">' +
      "<thead><tr><th>时长</th><th>大约流量</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table>" +
      '<p class="netrank-proj-hint">按当前合计速率 ' +
      fmtRate(rateTotal) +
      " 估算；实际会随下载、远程桌面等任务波动。" +
      context +
      "</p>" +
      "</div>"
    );
  }

  function renderRiskAlert(rateTotal, topProc) {
    if (rateTotal >= HIGH_RATE) {
      return (
        '<div class="netrank-alert netrank-alert--high">' +
        "<strong>偏高：</strong>当前网卡合计速率 " +
        fmtRate(rateTotal) +
        "，若持续下载/更新游戏可能被公司网络监控关注。建议暂停大流量任务后再刷新确认。" +
        (topProc ? " 当前最高进程：" + escapeHtml(topProc.name) + "（" + fmtRate(topProc.totalSec) + "）。" : "") +
        "</div>"
      );
    }
    if (rateTotal >= WARN_RATE) {
      return (
        '<div class="netrank-alert netrank-alert--warn">' +
        "<strong>注意：</strong>当前网卡合计速率 " +
        fmtRate(rateTotal) +
        "，处于中等水平。若只是日常浏览一般无碍；如有后台下载请留意。" +
        "</div>"
      );
    }
    return (
      '<div class="netrank-alert netrank-alert--ok">' +
      "<strong>正常：</strong>当前网卡合计速率 " +
      fmtRate(rateTotal) +
      "，未见明显异常大流量。可隔几分钟再刷新一次确认。" +
      "</div>"
    );
  }

  function renderSnapshotSummary(totals, rates, procTotals, sessionMeta, bytesSource, topProc) {
    const recv = totals.bytesRecv || 0;
    const sent = totals.bytesSent || 0;
    const all = totals.bytesTotal != null ? totals.bytesTotal : recv + sent;
    const procAll = procTotals.bytesTotal || 0;
    const started = sessionMeta && sessionMeta.started ? new Date(sessionMeta.started).toLocaleString() : "—";
    const snaps = (sessionMeta && sessionMeta.snaps) || 0;

    return (
      '<div class="netrank-snapshot-head">' +
      "<h3>自查摘要</h3>" +
      '<p class="netrank-snapshot-sub">网卡累计为自开机统计；进程累计为<strong>本次打开页面的自查会话</strong>（刷新/自动刷新会累加，可点「重置自查计数」清零）。</p>' +
      "</div>" +
      renderRiskAlert(rates.totalSec, topProc) +
      '<div class="netrank-totals">' +
      '<div class="netrank-total-card"><span class="netrank-total-label">当前下行速率</span><strong>' +
      fmtRate(rates.rxSec) +
      "</strong></div>" +
      '<div class="netrank-total-card"><span class="netrank-total-label">当前上行速率</span><strong>' +
      fmtRate(rates.txSec) +
      "</strong></div>" +
      '<div class="netrank-total-card netrank-total-card--accent"><span class="netrank-total-label">当前合计速率</span><strong>' +
      fmtRate(rates.totalSec) +
      "</strong></div>" +
      "</div>" +
      '<div class="netrank-totals">' +
      '<div class="netrank-total-card"><span class="netrank-total-label">网卡累计下行</span><strong>' +
      fmtBytes(recv) +
      "</strong></div>" +
      '<div class="netrank-total-card"><span class="netrank-total-label">网卡累计上行</span><strong>' +
      fmtBytes(sent) +
      "</strong></div>" +
      '<div class="netrank-total-card"><span class="netrank-total-label">网卡流量总数</span><strong>' +
      fmtBytes(all) +
      "</strong></div>" +
      "</div>" +
      '<div class="netrank-totals">' +
      '<div class="netrank-total-card"><span class="netrank-total-label">进程自查累计</span><strong>' +
      fmtBytes(procAll) +
      "</strong></div>" +
      '<div class="netrank-total-card"><span class="netrank-total-label">自查开始</span><strong class="netrank-total-sm">' +
      escapeHtml(started) +
      "</strong></div>" +
      '<div class="netrank-total-card"><span class="netrank-total-label">已采样次数</span><strong>' +
      snaps +
      " 次</strong></div>" +
      "</div>" +
      '<p class="sysmon-hint">进程「累计/总数」列来源：' +
      (bytesSource === "tcp" ? "TCP 连接字节（当前连接生命周期）。" : "本次自查会话累计（按采样速率估算，含磁盘 I/O 干扰）。") +
      "</p>"
    );
  }

  function renderTrafficTable(rows, opts) {
    if (!rows.length) {
      return "<p class=\"sysmon-hint\">" + escapeHtml(opts.emptyText || "暂无数据") + "</p>";
    }

    const maxRate = Math.max(1, ...rows.map((r) => r.totalSec || r.connections || 0));
    const maxBytes = Math.max(1, ...rows.map((r) => r.bytesTotal || 0));
    const connOnly = !!opts.connOnly;

    const body = rows
      .map((r, i) => {
        if (connOnly) {
          const cnt = r.connections || 0;
          return (
            "<tr><td>" +
            (i + 1) +
            "</td><td>" +
            escapeHtml(r.name || "—") +
            "</td><td>" +
            (r.pid != null ? r.pid : "—") +
            "</td><td><strong>" +
            cnt +
            "</strong>" +
            pctBar(cnt, maxRate) +
            "</td></tr>"
          );
        }

        const rateTone = r.totalSec >= HIGH_RATE ? "high" : r.totalSec >= WARN_RATE ? "warn" : "";
        return (
          "<tr><td>" +
          (i + 1) +
          "</td><td>" +
          escapeHtml(r.name || "—") +
          "</td><td>" +
          (r.pid != null ? r.pid : "—") +
          "</td><td>" +
          fmtRate(r.rxSec) +
          "</td><td>" +
          fmtRate(r.txSec) +
          "</td><td><strong>" +
          fmtRate(r.totalSec) +
          "</strong>" +
          pctBar(r.totalSec || 0, maxRate, rateTone) +
          "</td><td>" +
          fmtBytes(r.bytesRecv) +
          "</td><td>" +
          fmtBytes(r.bytesSent) +
          "</td><td><strong>" +
          fmtBytes(r.bytesTotal) +
          "</strong>" +
          pctBar(r.bytesTotal || 0, maxBytes) +
          "</td></tr>"
        );
      })
      .join("");

    let head =
      "<thead><tr><th>#</th><th>" +
      (opts.nameCol || "名称") +
      "</th><th>PID</th>";
    if (connOnly) {
      head += "<th>活跃连接数</th>";
    } else {
      head +=
        "<th>下行速率</th><th>上行速率</th><th>合计速率</th><th>累计下行</th><th>累计上行</th><th>流量总数</th>";
    }
    head += "</tr></thead>";

    return (
      "<table class=\"sysmon-table netrank-table\">" + head + "<tbody>" + body + "</tbody></table>"
    );
  }

  function procMethodHint(method, note, bytesSource) {
    const base =
      bytesSource === "tcp"
        ? "进程累计来自 TCP 连接字节（不含 UDP）。"
        : "进程累计为本次自查会话累加值；速率含磁盘 I/O，下载/浏览器/通讯类进程仍可参考排行。";
    if (note) return base + " " + note;
    if (method === "connections-only") {
      return base + " 当前仅能统计连接数，建议以管理员身份运行工作台后重试。";
    }
    return base;
  }

  function buildTextReport(data) {
    const ts = data.ts ? new Date(data.ts).toLocaleString() : new Date().toLocaleString();
    const rates = sumIfaceRates(data.interfaces);
    const totals = data.totals || {};
    const lines = [
      "【流量自查快照】",
      "时间：" + ts,
      "当前速率：下行 " + fmtRate(rates.rxSec) + " / 上行 " + fmtRate(rates.txSec) + " / 合计 " + fmtRate(rates.totalSec),
      "若保持当前速率：1 小时约 " +
        fmtBytes(projectBytes(rates.totalSec, 3600)) +
        " / 30 分钟约 " +
        fmtBytes(projectBytes(rates.totalSec, 1800)) +
        " / 10 分钟约 " +
        fmtBytes(projectBytes(rates.totalSec, 600)),
      "网卡累计：下行 " + fmtBytes(totals.bytesRecv) + " / 上行 " + fmtBytes(totals.bytesSent) + " / 总数 " + fmtBytes(totals.bytesTotal),
      "",
      "— 网卡 —",
    ];

    (data.interfaces || []).forEach((n, i) => {
      lines.push(
        (i + 1) +
          ". " +
          (n.name || "—") +
          "  速率:" +
          fmtRate(n.totalSec) +
          "  累计:" +
          fmtBytes(n.bytesTotal)
      );
    });

    lines.push("", "— 进程（本次自查累计）—");
    (data.processes || []).forEach((p, i) => {
      lines.push(
        (i + 1) +
          ". " +
          (p.name || "—") +
          (p.pid ? " (PID " + p.pid + ")" : "") +
          "  速率:" +
          fmtRate(p.totalSec) +
          "  累计:" +
          fmtBytes(p.bytesTotal)
      );
    });

    return lines.join("\n");
  }

  function renderNetrankTool(container) {
    container.innerHTML =
      "<h2>流量自查快照</h2>" +
      "<p>用于自查本机是否正在产生较大网络流量（如下载、游戏更新）。结构与网卡表一致：速率 + 累计 + 总数。</p>" +
      '<div class="netrank-toolbar">' +
      '<button type="button" id="netrankRefresh" class="netrank-btn">刷新快照</button>' +
      '<label class="netrank-auto"><input type="checkbox" id="netrankAuto" /> 每 5 秒自动刷新</label>' +
      '<button type="button" id="netrankReset" class="netrank-btn netrank-btn--ghost">重置自查计数</button>' +
      '<button type="button" id="netrankCopy" class="netrank-btn netrank-btn--ghost">复制 JSON</button>' +
      '<button type="button" id="netrankCopyText" class="netrank-btn netrank-btn--ghost">复制自查报告</button>' +
      '<span id="netrankTs" class="netrank-ts"></span>' +
      "</div>" +
      '<p id="netrankErr" class="sysmon-err" role="status"></p>' +
      '<div id="netrankTotals"></div>' +
      '<section class="netrank-section netrank-section--projection">' +
      "<h3>持续流量估算</h3>" +
      '<p class="netrank-snapshot-sub">按当前网卡合计速率推算，帮助判断是否可能引起网络监控注意。</p>' +
      '<div id="netrankProjection"></div>' +
      "</section>" +
      '<section class="netrank-section">' +
      "<h3>网卡流量</h3>" +
      '<div id="netrankIfaces"></div>' +
      "</section>" +
      '<section class="netrank-section">' +
      "<h3>进程流量</h3>" +
      '<p id="netrankProcHint" class="sysmon-hint"></p>' +
      '<div id="netrankProcs"></div>' +
      "</section>";

    const errEl = container.querySelector("#netrankErr");
    const totalsEl = container.querySelector("#netrankTotals");
    const projectionEl = container.querySelector("#netrankProjection");
    const tsEl = container.querySelector("#netrankTs");
    const ifacesEl = container.querySelector("#netrankIfaces");
    const procsEl = container.querySelector("#netrankProcs");
    const procHintEl = container.querySelector("#netrankProcHint");
    const refreshBtn = container.querySelector("#netrankRefresh");
    const resetBtn = container.querySelector("#netrankReset");
    const autoCb = container.querySelector("#netrankAuto");
    const copyBtn = container.querySelector("#netrankCopy");
    const copyTextBtn = container.querySelector("#netrankCopyText");

    let lastData = null;
    let timer = null;
    let busy = false;

    function paint(raw) {
      const ifaces = raw.interfaces || [];
      const procMethod = raw.processTrafficMethod || "connections-only";
      const connOnly = procMethod === "connections-only";

      accumulateSession(raw.processes || [], raw.sampleMs);
      const procs = applySessionToProcs(raw.processes || [], procMethod).sort(
        (a, b) => (b.totalSec || 0) - (a.totalSec || 0)
      );

      const bytesSource = procs.some((p) => p.bytesSource === "tcp" && (p.bytesTotal || 0) > 0)
        ? "tcp"
        : "session";

      const rates = sumIfaceRates(ifaces);
      let totals = raw.totals;
      if (!totals && ifaces.length) {
        totals = {
          bytesRecv: ifaces.reduce((s, n) => s + (n.bytesRecv || 0), 0),
          bytesSent: ifaces.reduce((s, n) => s + (n.bytesSent || 0), 0),
          bytesTotal: ifaces.reduce((s, n) => s + (n.bytesTotal || 0), 0),
        };
      }

      const procTotals = sumProcSession(procs);
      const store = loadSession();

      lastData = {
        ...raw,
        processes: procs,
        ifaceRates: rates,
        processTotals: procTotals,
        bytesSource: bytesSource,
      };

      ifacesEl.innerHTML = renderTrafficTable(ifaces, { nameCol: "网卡", emptyText: "未检测到有效网卡" });
      procsEl.innerHTML = renderTrafficTable(procs, {
        nameCol: "进程",
        connOnly: connOnly,
        emptyText: "暂无进程数据",
      });

      if (procHintEl) {
        procHintEl.textContent = procMethodHint(procMethod, raw.processTrafficNote, bytesSource);
      }

      totalsEl.innerHTML = renderSnapshotSummary(
        totals || {},
        rates,
        procTotals,
        store._meta,
        bytesSource,
        procs[0]
      );

      if (projectionEl) {
        projectionEl.innerHTML = renderTrafficProjection(rates.totalSec);
      }

      const ts = raw.ts ? new Date(raw.ts) : new Date();
      tsEl.textContent =
        "快照时间：" + ts.toLocaleString() + (raw.sampleMs ? " · 采样 " + raw.sampleMs + " ms" : "");
    }

    function setRefreshing(on) {
      if (on) {
        tsEl.classList.add("netrank-ts--busy");
        if (lastData && !/刷新中/.test(tsEl.textContent)) {
          tsEl.dataset.prevTs = tsEl.textContent;
          tsEl.textContent = tsEl.textContent + " · 刷新中…";
        }
        return;
      }
      tsEl.classList.remove("netrank-ts--busy");
      if (/刷新中…/.test(tsEl.textContent) && tsEl.dataset.prevTs) {
        tsEl.textContent = tsEl.dataset.prevTs;
      }
      delete tsEl.dataset.prevTs;
    }

    function tick() {
      if (!container.classList.contains("active")) return;
      if (busy) return;
      busy = true;
      errEl.textContent = "";

      const firstLoad = !lastData;
      if (firstLoad) {
        ifacesEl.innerHTML = "<p class=\"sysmon-loading\">采集中…</p>";
        procsEl.innerHTML = "";
        totalsEl.innerHTML = "";
        if (projectionEl) projectionEl.innerHTML = "";
      } else {
        setRefreshing(true);
      }

      fetchTrafficRank()
        .then((res) => {
          if (!res || !res.ok) {
            if (!window.toolsDesktop && !res) {
              renderFallback(container);
              return;
            }
            errEl.textContent = res && res.error ? "采集失败：" + res.error : "采集失败";
            if (firstLoad) ifacesEl.innerHTML = "";
            return;
          }
          paint(res.data);
        })
        .catch((e) => {
          errEl.textContent = "采集失败：" + (e && e.message ? e.message : String(e));
        })
        .finally(() => {
          busy = false;
          setRefreshing(false);
        });
    }

    function setAuto(on) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (on) timer = window.setInterval(tick, 5000);
    }

    function flashBtn(btn, okText) {
      const old = btn.textContent;
      btn.textContent = okText;
      window.setTimeout(() => {
        btn.textContent = old;
      }, 1500);
    }

    refreshBtn.addEventListener("click", tick);
    resetBtn.addEventListener("click", () => {
      resetSession();
      errEl.textContent = "";
      if (lastData) tick();
      else errEl.textContent = "已重置自查计数";
    });
    autoCb.addEventListener("change", () => setAuto(autoCb.checked));
    copyBtn.addEventListener("click", () => {
      if (!lastData) {
        errEl.textContent = "请先刷新快照";
        return;
      }
      const text = JSON.stringify(lastData, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => flashBtn(copyBtn, "已复制"),
          () => {
            errEl.textContent = "复制失败";
          }
        );
      }
    });
    copyTextBtn.addEventListener("click", () => {
      if (!lastData) {
        errEl.textContent = "请先刷新快照";
        return;
      }
      const text = buildTextReport(lastData);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => flashBtn(copyTextBtn, "已复制"),
          () => {
            errEl.textContent = "复制失败";
          }
        );
      }
    });

    tick();
  }

  window.renderNetrankTool = renderNetrankTool;
})();
