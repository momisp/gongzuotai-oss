(async function () {
  var nav = document.getElementById("nav");
  var backdrop = document.getElementById("remarkBackdrop");
  var remarkText = document.getElementById("remarkText");
  var remarkSave = document.getElementById("remarkSave");
  var remarkCancel = document.getElementById("remarkCancel");
  var remarkTitle = document.getElementById("remarkDialogTitle");

  var data;
  try {
    data = await window.opsShell.getMetrics();
  } catch (e) {
    nav.textContent = "读取 metrics.json 失败：" + e;
    return;
  }
  var items = (data && data.metrics) || [];
  var activeRow = null;
  var editingMetricId = null;

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

  function openRemarkModal(m, idx, remarkBtn) {
    editingMetricId = metricId(m, idx);
    remarkTitle.textContent = "备注 · " + sidebarLabel(m);
    window.opsShell.getRemark(editingMetricId).then(function (text) {
      remarkText.value = text || "";
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
      window.opsShell.saveRemark(editingMetricId, remarkText.value).then(function () {
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
        window.opsShell.openUrl(m.url, m.account, m.openCertExpiry ? { openCertExpiry: true } : undefined);
      });

      var rb = document.createElement("button");
      rb.type = "button";
      rb.className = "remark-btn";
      rb.setAttribute("data-metric-id", mid);
      rb.textContent = "备注";
      rb.addEventListener("click", function (e) {
        e.stopPropagation();
        openRemarkModal(m, idx, rb);
      });

      row.appendChild(b);
      row.appendChild(rb);
      nav.appendChild(row);

      window.opsShell.getRemark(mid).then(function (text) {
        if ((text || "").trim()) rb.classList.add("has-note");
      });
    })(items[i], i);
  }
})();
