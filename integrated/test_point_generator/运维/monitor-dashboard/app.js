(function () {
  var VIEW = window.OPS_VIEW_MODE || "namedWindow";
  var WIN_NAME = window.OPS_NAMED_WINDOW || "OpsMetricsPane";
  var metrics = window.OPS_METRICS || [];

  function formatMetricLabel(m, idx) {
    var base =
      m.name != null && m.name !== ""
        ? m.name
        : "指标 " + (idx + 1);
    if (m.account) return base + " (" + m.account + ")";
    return base;
  }

  var elSidebar = document.getElementById("sidebar");
  var elFrame = document.getElementById("panel");
  var elUrl = document.getElementById("currentUrl");
  var elBadge = document.getElementById("modeBadge");
  var elFallback = document.getElementById("fallback");
  var elOpenNamed = document.getElementById("openNamed");
  var elOpenTab = document.getElementById("openTab");
  var elOpenTab2 = document.getElementById("openTab2");
  var elReload = document.getElementById("reloadFrame");
  var elNamedStatus = document.getElementById("namedStatus");
  var elWinNameLabel = document.getElementById("winNameLabel");
  var elHeaderHint = document.getElementById("headerHint");
  var active = null;
  var loadTimer = null;

  function setBodyView() {
    document.body.classList.remove("view-named", "view-iframe", "view-newtab");
    if (VIEW === "iframe") document.body.classList.add("view-iframe");
    else if (VIEW === "newTabEach") document.body.classList.add("view-newtab");
    else document.body.classList.add("view-named");
  }

  function setToolbarForView() {
    elWinNameLabel.textContent = WIN_NAME;
    if (VIEW === "iframe") {
      elBadge.textContent = "iframe 嵌入（多数云不可用）";
      if (elOpenNamed) elOpenNamed.style.display = "none";
      elReload.style.display = "";
    } else if (VIEW === "newTabEach") {
      elBadge.textContent = "每点一次新开标签";
      if (elOpenNamed) elOpenNamed.style.display = "none";
      elReload.style.display = "none";
      elHeaderHint.innerHTML =
        "当前为<strong>新标签模式</strong>：点左侧每次打开新标签页。若标签太多，可改 <code>metrics-config.js</code> 里的 <code>OPS_VIEW_MODE</code> 为 <code>namedWindow</code>。";
    } else {
      elBadge.textContent = "命名监控窗口（链接打开）";
      if (elOpenNamed) elOpenNamed.style.display = "";
      elReload.style.display = "none";
      if (elOpenNamed && elOpenNamed.tagName === "A") {
        elOpenNamed.target = WIN_NAME;
      }
    }
  }

  function syncToolbarLinks() {
    if (!active) return;
    var u = active.url || "#";
    if (elOpenNamed && elOpenNamed.tagName === "A") {
      elOpenNamed.href = u;
      if (VIEW === "namedWindow") elOpenNamed.target = WIN_NAME;
    }
    if (elOpenTab && elOpenTab.tagName === "A") {
      elOpenTab.href = u;
    }
    elOpenTab2.href = u;
  }

  function setActive(m) {
    active = m;
    elUrl.textContent = m.url || "";
    syncToolbarLinks();
    var items = elSidebar.querySelectorAll(".sidebar-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", items[i].dataset.id === m.id);
    }
  }

  function showIframeFallback(show) {
    elFallback.classList.toggle("visible", !!show);
  }

  function loadMetricIframe(m) {
    setActive(m);
    window.clearTimeout(loadTimer);
    showIframeFallback(!!m.openExternal);

    if (!m.url) {
      elFrame.removeAttribute("src");
      showIframeFallback(true);
      return;
    }
    if (m.openExternal) {
      elFrame.removeAttribute("src");
      return;
    }
    showIframeFallback(false);
    elFrame.src = m.url;
    loadTimer = window.setTimeout(function () {
      try {
        var doc = elFrame.contentDocument;
        if (!doc || !doc.body || doc.body.childNodes.length === 0) {
          showIframeFallback(true);
        }
      } catch (err) {
        showIframeFallback(true);
      }
    }, 2500);
  }

  function loadMetric(m) {
    if (VIEW === "iframe") {
      loadMetricIframe(m);
    } else {
      setActive(m);
      if (VIEW === "newTabEach") {
        elNamedStatus.textContent = "已在新建标签中打开（每次独立）。";
      } else {
        elNamedStatus.textContent =
          "已通过带 target 的链接请求打开/切换命名窗口。若仍无反应，多半是「本地文件」协议限制，请用 http://localhost 方式打开本目录（见 README / serve.bat）。";
      }
    }
  }

  setBodyView();
  setToolbarForView();

  for (var j = 0; j < metrics.length; j++) {
    (function (m, idx) {
      if (VIEW === "iframe") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-item";
        btn.textContent = formatMetricLabel(m, idx);
        btn.dataset.id = m.id || "m" + idx;
        btn.addEventListener("click", function () {
          loadMetricIframe(m);
        });
        elSidebar.appendChild(btn);
        return;
      }

      var a = document.createElement("a");
      a.className = "sidebar-item";
      a.textContent = formatMetricLabel(m, idx);
      a.dataset.id = m.id || "m" + idx;
      a.href = m.url || "#";
      if (VIEW === "newTabEach") {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else {
        a.target = WIN_NAME;
      }
      a.addEventListener("click", function () {
        loadMetric(m);
      });
      elSidebar.appendChild(a);
    })(metrics[j], j);
  }

  if (elOpenTab && elOpenTab.tagName === "A") {
    elOpenTab.target = "_blank";
    elOpenTab.rel = "noopener noreferrer";
  }

  elReload.addEventListener("click", function () {
    if (active && VIEW === "iframe") loadMetricIframe(active);
  });

  if (metrics.length) {
    setActive(metrics[0]);
    elUrl.textContent = metrics[0].url || "";
    syncToolbarLinks();
    if (VIEW === "iframe") loadMetricIframe(metrics[0]);
    else if (VIEW === "namedWindow") {
      elNamedStatus.textContent =
        "点左侧链接：会在名为「" +
        WIN_NAME +
        "」的窗口中打开或切换（与点普通超链接相同，一般不被拦截）。若从本地磁盘 file:// 打开仍无效，请运行 serve.bat 后用 http 访问。";
    } else {
      elNamedStatus.textContent = "点左侧指标将每次新开标签。";
    }
  } else {
    elUrl.textContent = "请编辑 metrics-config.js 中的 OPS_METRICS";
    showIframeFallback(true);
  }
})();
