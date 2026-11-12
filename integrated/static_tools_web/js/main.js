const BASE_TOOL_CATEGORIES = [
  {
    id: "encode",
    title: "编码与格式",
    tools: [
      { id: "json", name: "JSON", desc: "美化 / 压缩" },
      { id: "base64", name: "Base64", desc: "编解码" },
      { id: "url", name: "URL", desc: "编解码" },
      { id: "html", name: "HTML 实体", desc: "转义 / 反转义" },
      { id: "hex", name: "Hex", desc: "UTF-8 ↔ 十六进制" },
      { id: "hash", name: "哈希", desc: "MD5 / SHA" },
      { id: "jwt", name: "JWT", desc: "解码展示" },
      { id: "query", name: "Query", desc: "解析 / 拼装" },
      { id: "radix", name: "进制", desc: "2–36 互转" },
      { id: "case", name: "命名", desc: "驼峰/蛇形/横线" },
      { id: "timestamp", name: "时间戳", desc: "Unix ↔ 日期" },
    ],
  },
  {
    id: "text",
    title: "文本与匹配",
    tools: [
      { id: "diff", name: "文本对比", desc: "按行比较" },
      { id: "regex", name: "正则", desc: "匹配测试" },
      { id: "ua", name: "UA", desc: "粗解析" },
      { id: "textcode", name: "文件探测", desc: "BOM / Hex" },
    ],
  },
  {
    id: "design",
    title: "设计与换算",
    tools: [
      { id: "color", name: "颜色", desc: "HEX / RGB / HSL" },
      { id: "cssunit", name: "rem / px", desc: "换算" },
      { id: "units", name: "单位", desc: "字节/温度/长度" },
      { id: "cron", name: "Cron", desc: "字段说明" },
    ],
  },
  {
    id: "gen",
    title: "生成与随机",
    tools: [
      { id: "uuid", name: "UUID", desc: "批量生成" },
      { id: "random", name: "随机串", desc: "密码/随机字符" },
      { id: "pick", name: "随机选项", desc: "抽签·列表可保存" },
    ],
  },
  {
    id: "bili",
    title: "B 站",
    tools: [
      { id: "bili", name: "B 站订阅", desc: "动态按日整理" },
      { id: "bilistory", name: "段子大纲", desc: "排行榜热评 → 短篇提纲" },
    ],
  },
  {
    id: "app",
    title: "地图 · 桌面",
    tools: [
      { id: "image", name: "图片", desc: "缩放 / JPEG" },
      { id: "amapmark", name: "地图标注", desc: "卫星图 · 经纬度" },
      { id: "sysmon", name: "本机性能", desc: "CPU/内存/磁盘（桌面）" },
      { id: "netrank", name: "流量自查", desc: "速率+累计 · 自查快照" },
    ],
  },
  {
    id: "ai",
    title: "AI · Cursor",
    tools: [
      { id: "herself", name: "她自己", desc: "与念念聊天 · 需桥接+API" },
    ],
  },
  {
    id: "motion",
    title: "动画预览",
    tools: [
      { id: "animpreview", name: "GSAP 动效", desc: "多场景预览 · 可回放" },
    ],
  },
  {
    id: "ops",
    title: "运维学习",
    tools: [
      { id: "opscmd", name: "运维命令", desc: "Linux ↔ PowerShell 对照" },
    ],
  },
];

function buildGameCategoryTools() {
  const list = window.MINI_GAMES || [];
  return [
    { id: "minigames", name: "小游戏合集", desc: "14 款 · 一览入口" },
    ...list.map((g) => ({ id: g.toolId, name: g.name, desc: g.tag })),
    { id: "timeline", name: "活动时间轴", desc: "游戏活动 · 甘特图" },
    { id: "gamedocs", name: "文档记录", desc: "角色输出手法 · 步骤与时间轴" },
  ];
}

function getToolCategories() {
  const games = { id: "games", title: "游戏", tools: buildGameCategoryTools() };
  const idx = BASE_TOOL_CATEGORIES.findIndex((c) => c.id === "bili");
  const before = BASE_TOOL_CATEGORIES.slice(0, idx + 1);
  const after = BASE_TOOL_CATEGORIES.slice(idx + 1);
  return [...before, games, ...after];
}

function isKnownToolId(toolId) {
  return getToolCategories().some((c) => c.tools.some((t) => t.id === toolId));
}

let activeCategoryFilter = "all";
let activeToolId = "";

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderToolNav() {
  const nav = document.getElementById("tool-nav");
  const tabs = document.getElementById("toolCategoryTabs");
  if (!nav || !tabs) return;

  tabs.innerHTML = "";
  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = "tool-category-tab is-active";
  allTab.dataset.category = "all";
  allTab.textContent = "全部";
  allTab.setAttribute("role", "tab");
  allTab.setAttribute("aria-selected", "true");
  tabs.appendChild(allTab);

  getToolCategories().forEach((cat) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tool-category-tab";
    tab.dataset.category = cat.id;
    tab.textContent = cat.title;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tabs.appendChild(tab);
  });

  nav.innerHTML = "";
  getToolCategories().forEach((cat) => {
    const section = document.createElement("section");
    section.className = "tool-category";
    section.id = "cat-" + cat.id;
    section.dataset.category = cat.id;

    const heading = document.createElement("h2");
    heading.className = "tool-category-title";
    heading.textContent = cat.title;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "tool-grid";

    cat.tools.forEach((tool) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-card";
      btn.dataset.tool = tool.id;
      btn.dataset.category = cat.id;
      btn.dataset.search = (tool.name + " " + tool.desc).toLowerCase();
      btn.innerHTML = "<h3>" + tool.name + "</h3><p>" + tool.desc + "</p>";
      btn.addEventListener("click", () => showTool(tool.id));
      grid.appendChild(btn);
    });

    section.appendChild(grid);
    nav.appendChild(section);
  });

  tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tool-category-tab");
    if (!tab) return;
    setCategoryFilter(tab.dataset.category || "all");
  });

  const search = document.getElementById("toolSearch");
  if (search) {
    search.addEventListener("input", () => applyToolFiltersFromSearch());
  }

  applyToolFilters();
}

function setCategoryFilter(categoryId) {
  activeCategoryFilter = categoryId || "all";
  document.querySelectorAll(".tool-category-tab").forEach((tab) => {
    const on = tab.dataset.category === activeCategoryFilter;
    tab.classList.toggle("is-active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });
  applyToolFilters();
  if (window.UiMotion) window.UiMotion.onFilterChange("tab");

  if (activeCategoryFilter !== "all") {
    const section = document.getElementById("cat-" + activeCategoryFilter);
    if (section && !section.hidden) {
      const top = section.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }
}

function applyToolFilters() {
  const q = (document.getElementById("toolSearch") && document.getElementById("toolSearch").value.trim().toLowerCase()) || "";
  let visibleCount = 0;

  document.querySelectorAll(".tool-category").forEach((section) => {
    const cat = section.dataset.category;
    const catMatch = activeCategoryFilter === "all" || activeCategoryFilter === cat;
    let sectionVisible = false;

    section.querySelectorAll(".tool-card").forEach((card) => {
      const textMatch = !q || (card.dataset.search || "").includes(q);
      const show = catMatch && textMatch;
      card.hidden = !show;
      if (show) {
        sectionVisible = true;
        visibleCount++;
      }
    });

    section.hidden = !sectionVisible;
  });

  let empty = document.getElementById("tool-nav-empty");
  if (!empty) {
    empty = document.createElement("p");
    empty.id = "tool-nav-empty";
    empty.className = "tool-nav-empty";
    empty.textContent = "没有匹配的工具，试试换个关键词或选「全部」。";
    const nav = document.getElementById("tool-nav");
    if (nav) nav.insertAdjacentElement("afterend", empty);
  }
  empty.hidden = visibleCount > 0;
}

function applyToolFiltersFromSearch() {
  applyToolFilters();
  if (window.UiMotion) window.UiMotion.onFilterChange("search");
}

function highlightActiveTool(toolName) {
  activeToolId = toolName || "";
  document.querySelectorAll(".tool-card").forEach((card) => {
    card.classList.toggle("tool-card-active", card.dataset.tool === activeToolId);
  });
}

function showTool(toolName) {
  const host = document.getElementById("tool-container");
  if (!host) return;

  const prevId = activeToolId;
  if (window.UiMotion) window.UiMotion.onToolSwitch(prevId, toolName);

  host.querySelectorAll(".tool-container").forEach((c) => c.classList.remove("active"));

  const id = "tool-" + toolName;
  let panel = document.getElementById(id);

  if (!panel) {
    panel = document.createElement("div");
    panel.id = id;
    panel.className = "tool-container active";
    host.appendChild(panel);

    const renderer = window["render" + capitalize(toolName) + "Tool"];
    if (typeof renderer === "function") {
      renderer(panel);
    } else {
      panel.innerHTML = "<h2>错误</h2><p>未找到工具渲染函数：" + toolName + "</p>";
    }
  } else {
    panel.classList.add("active");
  }

  highlightActiveTool(toolName);

  if (window.UiMotion) window.UiMotion.animateToolPanel(panel);

  if (location.hash !== "#" + toolName) {
    history.replaceState(null, "", "#" + toolName);
  }

  const top = panel.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function initApp() {
  renderToolNav();

  const hash = location.hash.replace(/^#/, "");
  if (hash && isKnownToolId(hash)) {
    showTool(hash);
  }

  if (!("serviceWorker" in navigator)) return;
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  if (!isHttp) return;

  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then((reg) => console.log("Service Worker 已注册:", reg.scope))
    .catch((err) => console.warn("Service Worker 注册失败:", err));
}

window.addEventListener("load", () => {
  initApp();

  if (window.SplashScreen && typeof window.SplashScreen.run === "function") {
    window.SplashScreen.run(() => {
      if (typeof window.SplashScreen.animateMainContent === "function") {
        window.SplashScreen.animateMainContent();
      }
    });
  }
});
