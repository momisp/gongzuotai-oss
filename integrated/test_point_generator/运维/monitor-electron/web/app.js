(function () {
  var nav = document.getElementById("nav");
  var backdrop = document.getElementById("remarkBackdrop");
  var remarkText = document.getElementById("remarkText");
  var remarkSave = document.getElementById("remarkSave");
  var remarkCancel = document.getElementById("remarkCancel");
  var remarkTitle = document.getElementById("remarkDialogTitle");

  var activeRow = null;
  var editingMetricId = null;

  function partitionKey(account) {
    var raw = (account && String(account).trim()) || "default";
    return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "default";
  }

  function sidebarLabel(m) {
    var base = m.name || m.url || "";
    if (m.account) return base + " (" + m.account + ")";
    return base;
  }

  function metricId(m, idx) {
    return (m.id != null && m.id !== "") ? String(m.id) : "m" + idx;
  }

  function setActive(row) {
    if (activeRow) activeRow.classList.remove("active");
    activeRow = row;
    if (row) row.classList.add("active");
  }

  async function api(path, opts) {
    var res = await fetch("/api/ops-monitor/" + path, {
      headers: { "Content-Type": "application/json" },
      method: opts && opts.method || "GET",
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return res.json();
  }

  function openUrl(url, account) {
    if (!url) return;
    var winName = "ops-panel-" + partitionKey(account);
    var w = window.open(url, winName);
    if (w) w.focus();
  }

  function openRemarkModal(m, idx) {
    editingMetricId = metricId(m, idx);
    remarkTitle.textContent = "备注 · " + sidebarLabel(m);
    api("remarks/" + encodeURIComponent(editingMetricId)).then(function (data) {
      remarkText.value = (data && data.text) || "";
      backdrop.hidden = false;
      remarkText.focus();
    });
  }

  function closeRemarkModal() {
    backdrop.hidden = true;
    editingMetricId = null;
  }

  remarkSave.addEventListener("click", function () {
    if (!editingMetricId) return;
    api("remarks/" + encodeURIComponent(editingMetricId), {
      method: "PUT",
      body: { text: remarkText.value },
    }).then(function () {
      var btn = nav.querySelector('[data-metric-id="' + editingMetricId + '"]');
      if (btn) {
        if ((remarkText.value || "").trim()) btn.classList.add("has-note");
        else btn.classList.remove("has-note");
      }
      closeRemarkModal();
    });
  });

  remarkCancel.addEventListener("click", closeRemarkModal);
  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) closeRemarkModal();
  });

  api("metrics").then(function (data) {
    var items = (data && data.metrics) || [];
    if (!items.length) {
      nav.textContent = "metrics.json 中暂无指标";
      return;
    }
    for (var i = 0; i < items.length; i++) {
      (function (m, idx) {
        var mid = metricId(m, idx);
        var row = document.createElement("div");
        row.className = "metric-row";

        var b = document.createElement("button");
        b.type = "button";
        b.className = "link";
        b.textContent = sidebarLabel(m);
        b.addEventListener("click", function () {
          if (!m.url) return;
          setActive(row);
          openUrl(m.url, m.account);
        });

        var rb = document.createElement("button");
        rb.type = "button";
        rb.className = "remark-btn";
        rb.setAttribute("data-metric-id", mid);
        rb.textContent = "备注";
        rb.addEventListener("click", function (e) {
          e.stopPropagation();
          openRemarkModal(m, idx);
        });

        row.appendChild(b);
        row.appendChild(rb);
        nav.appendChild(row);

        api("remarks/" + encodeURIComponent(mid)).then(function (d) {
          if ((d && d.text || "").trim()) rb.classList.add("has-note");
        });
      })(items[i], i);
    }
  }).catch(function (e) {
    nav.textContent = "读取指标失败：" + e;
  });
})();
