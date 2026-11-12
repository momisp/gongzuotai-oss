/**
 * 用 Playwright 渲染 SPA / iframe 原型，必要时自动登录后抽取页面结构。
 * 供 fetchPrototypePageContext 在静态 HTML 抓取失败时使用。
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PW_INSTALL_HINT =
  "Playwright 浏览器未安装。请在 agile-sim-demo 目录执行：npm run setup:playwright";

async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { error: "未安装 playwright 包（agile-sim-demo 依赖）" };
  }
  try {
    const browser = await chromium.launch({ headless: true });
    return { browser };
  } catch (e) {
    const msg = String(e?.message || e);
    const missing =
      /Executable doesn't exist|browserType\.launch|chrome-headless-shell|ms-playwright/i.test(
        msg
      );
    return { error: missing ? PW_INSTALL_HINT : `Playwright 启动失败：${msg.slice(0, 200)}` };
  }
}

function looksLikeLogin(text) {
  const t = String(text || "");
  // 营销站顶栏常有「登录」，不能单凭一词判定（否则会误填并卡 120s）
  const hasLoginFormCue =
    /欢迎登录|请输入.*账号|账号登录|登录密码|账号.*密码|密码.*登录/.test(t) ||
    (/登\s*录/.test(t) && /密码/.test(t));
  if (!hasLoginFormCue) return false;
  // 仅排除明确的营销落地页（有口号、无后台登录语境）；勿因品牌名含「宇宙直播」误杀后台登录页
  if (/点亮热爱|直播无限/.test(t) && !/账号登录|管理后台|演示账号/.test(t)) return false;
  if (/商务管理平台|工作台\s*最后更新/.test(t) && !/密码/.test(t)) return false;
  return true;
}

async function pickContentFrame(page) {
  // 优先：原型预览壳里的 files/index.html iframe
  for (const f of page.frames()) {
    if (/\/prototypes\/.+\/files\//i.test(f.url()) || /\/files\/index\.html/i.test(f.url())) {
      return f;
    }
  }
  // 次优：面积最大的子 frame
  const kids = page.frames().filter((f) => f !== page.mainFrame());
  if (kids.length === 1) return kids[0];
  if (kids.length > 1) {
    let best = kids[0];
    let bestScore = 0;
    for (const f of kids) {
      try {
        const n = await f.locator("body *").count();
        if (n > bestScore) {
          bestScore = n;
          best = f;
        }
      } catch {
        /* ignore */
      }
    }
    return best;
  }
  return page.mainFrame();
}

/** 墨刀/xm 预览壳：等「下载预览资源」结束或内容 iframe 出现 */
async function waitPreviewShellReady(page, url) {
  const isPreview = /wanxiayc\.com|\/preview\/|\/prototypes\//i.test(String(url || ""));
  if (!isPreview) return;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const txt = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
      const loading = /下载预览资源|Loaded\s*0\s*\/|加载中|请稍候/.test(txt || "");
      const hasIframe = (await page.locator("iframe").count().catch(() => 0)) > 0;
      const hasAppText =
        !!txt &&
        txt.length > 80 &&
        !loading &&
        !/^(产品系统)\s*$/m.test(txt.trim());
      if ((hasIframe || hasAppText) && !loading) {
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(1000);
  }
}

async function tryAutoLogin(frame, page) {
  try {
    const text = await frame.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (!looksLikeLogin(text)) return { loggedIn: false, skipped: true };

    const user = frame
      .locator(
        'input[type="text"], input[name="username"], input[placeholder*="账号"], input[placeholder*="用户"], input[placeholder*="手机"]'
      )
      .first();
    const pass = frame.locator('input[type="password"]').first();
    // antd 两字按钮常插入空格 →「登 录」
    const btn = frame
      .locator("button, [role='button'], a.btn, .btn")
      .filter({ hasText: /^\s*登\s*录\s*$/ })
      .or(frame.locator('button[type="submit"]'))
      .first();

    const visible = async (loc) => {
      try {
        return await loc.isVisible({ timeout: 2500 });
      } catch {
        return false;
      }
    };
    if (!(await visible(user)) || !(await visible(pass)) || !(await visible(btn))) {
      return {
        loggedIn: false,
        skipped: true,
        reason: "疑似登录文案但无可见账号密码表单",
      };
    }

    // 凭据：先读页上演示账号，再 admin / test
    const demoUserRaw =
      String(text).match(/演示账号[：:]\s*([A-Za-z0-9_管理员]+)/)?.[1] ||
      String(text).match(/\b(admin|testnew\d*)\b/i)?.[1] ||
      "";
    const demoUser =
      !demoUserRaw || demoUserRaw === "管理员" ? "admin" : demoUserRaw;
    const demoPass =
      String(text).match(/演示账号[^。\n]*?[/／]\s*(\S+)/)?.[1] ||
      String(text).match(/(?:默认)?密码[：:]\s*(\S+)/)?.[1] ||
      "123456";
    const creds = [
      { u: demoUser, p: demoPass },
      { u: "admin", p: "123456" },
      { u: "test", p: "123456" },
    ];
    let after = "";
    let ok = false;
    for (const c of creds) {
      try {
        await user.fill(c.u, { timeout: 5000 });
        await pass.fill(c.p, { timeout: 5000 });
        await btn.click({ timeout: 5000 });
        await page.waitForTimeout(2200);
        after = await frame.locator("body").innerText().catch(() => "");
        ok =
          !looksLikeLogin(after) ||
          /商务管理平台|工作台|侧边|菜单|数据概览|直播间管理|礼物管理|宇宙直播后台/.test(
            after
          );
        if (ok) break;
      } catch {
        /* try next */
      }
    }
    return { loggedIn: ok, skipped: false, reason: ok ? "" : "登录后仍像登录页" };
  } catch (e) {
    return {
      loggedIn: false,
      skipped: false,
      reason: `自动登录中断：${String(e?.message || e).slice(0, 120)}`,
    };
  }
}

async function expandMenus(frame) {
  // Ant Design：展开收起的 submenu，便于抽齐子项
  const subs = frame.locator(".ant-menu-submenu:not(.ant-menu-submenu-open) > .ant-menu-submenu-title");
  const n = await subs.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 12); i++) {
    try {
      await subs.nth(i).click({ timeout: 1500 });
      await frame.page().waitForTimeout(200);
    } catch {
      /* ignore */
    }
  }
}

async function extractNavTree(frame) {
  return frame.evaluate(() => {
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // 自定义侧栏（如 .nav-group / .nav-item）
    const customGroups = document.querySelectorAll(".sidebar-nav .nav-group, .sidebar .nav-group, nav .nav-group");
    if (customGroups.length) {
      const tree = [];
      for (const g of customGroups) {
        const titleEl = g.querySelector(":scope > .nav-group-title");
        const items = [...g.querySelectorAll(":scope > .nav-item, :scope > a.nav-item")].map((el) =>
          clean(el.textContent)
        ).filter(Boolean);
        const lone = !titleEl && items.length === 0
          ? clean(g.querySelector(".nav-item")?.textContent || g.textContent)
          : "";
        if (titleEl) {
          const title = clean(titleEl.textContent);
          const kids = items.map((t) => ({ title: t, children: [] }));
          // 无子项时：整组可能是单页入口（如「工作台」单独一组）
          if (!kids.length) {
            const only = clean(g.querySelector(".nav-item")?.textContent || "");
            if (only) tree.push({ title: only, children: [] });
            else if (title) tree.push({ title, children: [] });
          } else if (title) {
            tree.push({ title, children: kids });
          } else {
            for (const t of items) tree.push({ title: t, children: [] });
          }
        } else if (items.length) {
          for (const t of items) tree.push({ title: t, children: [] });
        } else if (lone) {
          tree.push({ title: lone, children: [] });
        }
      }
      if (tree.length) return tree;
    }

    // 宇宙直播后台等：.sb-group + .sb-item（菜单由 JS 注入 #sbMenu）
    const sbMenu = document.querySelector("#sbMenu, .sb-menu");
    if (sbMenu && sbMenu.querySelectorAll(".sb-item").length) {
      const tree = [];
      let curGroup = null;
      for (const el of sbMenu.children) {
        if (el.classList.contains("sb-group")) {
          curGroup = { title: clean(el.textContent), children: [] };
          tree.push(curGroup);
        } else if (el.classList.contains("sb-item")) {
          const title = clean(el.textContent);
          if (!title) continue;
          if (curGroup) curGroup.children.push({ title, children: [] });
          else tree.push({ title, children: [] });
        }
      }
      if (tree.length) return tree;
    }

    // 顶层直接一堆 .nav-item（无 group）
    const flatNav = document.querySelectorAll(".sidebar-nav > .nav-item, .sidebar-nav > a");
    if (flatNav.length) {
      return [...flatNav]
        .map((el) => clean(el.textContent))
        .filter(Boolean)
        .map((title) => ({ title, children: [] }));
    }

    const root =
      document.querySelector(".ant-layout-sider .ant-menu") ||
      document.querySelector("aside .ant-menu") ||
      document.querySelector(".ant-menu") ||
      document.querySelector("nav") ||
      document.querySelector("aside") ||
      document.querySelector(".sidebar-nav");

    if (!root) return [];

    const tree = [];

    function walkMenu(ul, out) {
      const children = ul.querySelectorAll(":scope > li");
      for (const li of children) {
        if (li.classList.contains("ant-menu-submenu")) {
          const titleEl = li.querySelector(":scope > .ant-menu-submenu-title");
          const title = clean(
            titleEl?.querySelector(".ant-menu-title-content")?.textContent ||
              titleEl?.textContent
          );
          const subUl = li.querySelector(":scope > ul");
          const kids = [];
          if (subUl) walkMenu(subUl, kids);
          if (title) out.push({ title, children: kids });
        } else if (li.classList.contains("ant-menu-item")) {
          const title = clean(
            li.querySelector(".ant-menu-title-content")?.textContent || li.textContent
          );
          if (title) out.push({ title, children: [] });
        }
      }
    }

    if (root.matches?.(".ant-menu") || root.classList?.contains("ant-menu")) {
      walkMenu(root, tree);
    } else {
      const menu = root.querySelector?.(".ant-menu");
      if (menu) walkMenu(menu, tree);
    }

    if (tree.length) return tree;

    const flat = [];
    for (const a of root.querySelectorAll("a, .nav-item, .sb-item, .ant-menu-item, .ant-menu-submenu-title")) {
      const t = clean(a.textContent);
      if (t && t.length <= 24) flat.push({ title: t, children: [] });
    }
    const seen = new Set();
    return flat.filter((x) => {
      if (seen.has(x.title)) return false;
      seen.add(x.title);
      return true;
    });
  });
}

function formatNavTree(tree, indent = 0) {
  const pad = "  ".repeat(indent);
  const lines = [];
  for (const node of tree || []) {
    lines.push(`${pad}- ${node.title}`);
    if (node.children?.length) {
      lines.push(...formatNavTree(node.children, indent + 1).split("\n").filter(Boolean));
    }
  }
  return lines.join("\n");
}

function flattenNavLeaves(tree, out = []) {
  for (const node of tree || []) {
    if (node.children?.length) {
      flattenNavLeaves(node.children, out);
    } else if (node.title) {
      out.push(String(node.title).trim());
    }
  }
  return out;
}

async function clickNavByTitle(frame, title) {
  const t = String(title || "").trim();
  if (!t) return false;
  // 优先真实 click（hash 路由 / React 更稳）
  try {
    const loc = frame
      .locator(
        "header a, header button, nav a, nav button, aside a, aside button, .ant-menu-item, [role='menuitem'], .sidebar .nav-item, .nav-item"
      )
      .filter({ hasText: new RegExp(`^\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) })
      .first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click({ timeout: 2500 });
      return true;
    }
  } catch {
    /* fall through */
  }
  return frame.evaluate((want) => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const candidates = [
      ...document.querySelectorAll(
        "header a, header button, nav a, nav button, " +
          ".sidebar-nav .nav-item, .sidebar .nav-item, aside .nav-item, " +
          ".sb-item, #sbMenu .sb-item, .sb-menu .sb-item, " +
          ".ant-menu-item, [role='menuitem'], aside button, aside a"
      ),
    ];
    for (const el of candidates) {
      const text = clean(el.textContent);
      if (text !== want && !text.includes(want) && !want.includes(text)) continue;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const target =
        el.closest(
          ".sb-item, .nav-item, .ant-menu-item, [role='menuitem'], button, a"
        ) || el;
      target.click();
      return true;
    }
    return false;
  }, t);
}

/** 商务端等多 HTML 原型：按 data-nav / href 点侧栏（比纯文案更稳） */
async function clickNavByHref(frame, href) {
  const h = String(href || "").trim().replace(/^\.\//, "");
  if (!h) return false;
  const ok = await frame
    .evaluate((want) => {
      const candidates = [
        ...document.querySelectorAll(
          `.sidebar .nav-item[data-nav], .sidebar-nav .nav-item[data-nav], a.nav-item[data-nav], a[href]`
        ),
      ];
      for (const el of candidates) {
        const nav = (el.getAttribute("data-nav") || "").replace(/^\.\//, "");
        const hrefAttr = (el.getAttribute("href") || "").replace(/^\.\//, "");
        if (nav !== want && hrefAttr !== want && !hrefAttr.endsWith(want)) continue;
        const st = window.getComputedStyle(el);
        // 版本过滤可能 display:none；强制点仍可跳转
        el.click();
        return true;
      }
      return false;
    }, h)
    .catch(() => false);
  return !!ok;
}

/**
 * 强制按改动汇总 href 清单逐页进入并抽取正文+原型说明（补齐「未展开」页）
 * @returns {Promise<{ sections: {title:string, brief:string, protoSpec:string, href:string}[], frame: any }>}
 */
async function crawlForcedBizPages(page, frame, pageInfos, { bizVerView = "" } = {}) {
  const list = (pageInfos || [])
    .map((p) => ({
      href: String(p?.href || "").trim(),
      label: String(p?.label || "").trim(),
    }))
    .filter((p) => p.href || p.label);
  const sections = [];
  let cur = frame;
  for (const item of list) {
    try {
      let ok = false;
      if (item.href) ok = await clickNavByHref(cur, item.href);
      if (!ok && item.label) ok = await clickNavByTitle(cur, item.label);
      if (!ok) continue;
      await page.waitForTimeout(1100);
      cur = await pickContentFrame(page);
      await dismissOverlayModals(cur, page);
      await page.waitForTimeout(400);
      const brief = await extractPageBrief(cur).catch(() => "");
      let specDoc = (await extractPrototypeSpecPanel(cur, page).catch(() => "")) || "";
      if (bizVerView) {
        await applyProtoPanelVerFilter(cur, page, bizVerView);
        const filtered = await extractPrototypeSpecPanel(cur, page).catch(() => "");
        if (filtered && filtered.length > 40) specDoc = filtered;
      }
      await dismissOverlayModals(cur, page);
      if ((!brief || brief.length < 40) && (!specDoc || specDoc.length < 40)) continue;
      sections.push({
        title: item.label || item.href.replace(/\.html$/i, ""),
        href: item.href,
        brief: (brief || "").slice(0, 3500),
        protoSpec: (specDoc || "").slice(0, 8000),
      });
    } catch {
      /* ignore one */
    }
  }
  return { sections, frame: cur };
}

/** 去掉 emoji / 空白，便于匹配「用户列表」 */
function normalizeEntryLabel(s) {
  return String(s || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 工作台主区功能入口（含蜂巢 .wb-item / .wb-label） */
async function collectWorkbenchEntries(frame) {
  return frame
    .evaluate(() => {
      const clean = (s) =>
        String(s || "")
          .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
          .replace(/\s+/g, " ")
          .trim();
      const skip =
        /登录|退出|个人中心|设置|帮助|关于|注册|消息|通讯录|快捷语|离开|管理员|原型说明|更新记录|工作台|首页/;
      const out = [];
      const seen = new Set();
      const push = (raw) => {
        const t = clean(raw);
        if (!t || t.length < 2 || t.length > 16) return;
        if (skip.test(t)) return;
        if (/[。；;：:]/.test(t)) return;
        if (seen.has(t)) return;
        seen.add(t);
        out.push(t);
      };
      // 蜂巢联运：工作台图标
      for (const lab of document.querySelectorAll(".wb-label, .wb-item .wb-label")) {
        push(lab.textContent);
      }
      for (const el of document.querySelectorAll(".wb-item")) {
        push(el.textContent);
      }
      const root =
        document.querySelector(
          "main, .main, .content, .page-body, #app .right, .layout-content, #view_workbench"
        ) || document.body;
      for (const el of root.querySelectorAll(
        "a, button, [role='button'], [class*='entry'], [class*='portal'], [class*='module'], [class*='func'], [onclick*='showView']"
      )) {
        const r = el.getBoundingClientRect();
        if (r.width < 36 || r.height < 36 || r.width > 320 || r.height > 240) continue;
        push(el.textContent);
      }
      return out.slice(0, 14);
    })
    .catch(() => []);
}

/** 回工作台（蜂巢 goWorkbench / showView('workbench')） */
async function goHomeWorkbench(frame) {
  const ok = await frame
    .evaluate(() => {
      try {
        if (typeof window.goWorkbench === "function") {
          window.goWorkbench();
          return true;
        }
        if (typeof window.showView === "function") {
          window.showView("workbench");
          return true;
        }
      } catch {
        /* ignore */
      }
      const tab = document.querySelector(
        ".ts-tab[onclick*='goWorkbench'], [onclick*=\"goWorkbench\"]"
      );
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    })
    .catch(() => false);
  return !!ok;
}

async function clickMainEntryByTitle(frame, title) {
  const t = normalizeEntryLabel(title);
  if (!t) return false;
  // 蜂巢：优先 showView 映射
  const viaShowView = await frame
    .evaluate((want) => {
      const map = {
        用户列表: "user",
        平台列表: "platform",
        联运申请: "apply",
        联运游戏: "game",
        联运币: "coin",
        联运币充值: "coin",
        联运扶持: "support",
        "日报表(时)": "hourly",
        日报表: "hourly",
        工作台: "workbench",
      };
      const key = map[want];
      if (key && typeof window.showView === "function") {
        try {
          window.showView(key);
          return true;
        } catch {
          /* ignore */
        }
      }
      // 点 .wb-item：标签包含目标文案
      const items = [
        ...document.querySelectorAll(".wb-item, [onclick*='showView']"),
      ];
      for (const el of items) {
        const lab = el.querySelector?.(".wb-label");
        const text = String(lab?.textContent || el.textContent || "")
          .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
          .replace(/\s+/g, " ")
          .trim();
        if (text === want || text.includes(want) || want.includes(text)) {
          el.click();
          return true;
        }
      }
      return false;
    }, t)
    .catch(() => false);
  if (viaShowView) return true;

  try {
    const loc = frame
      .locator(
        ".wb-item, .wb-label, main a, main button, [onclick*='showView'], [class*='entry'], [class*='portal']"
      )
      .filter({ hasText: t })
      .first();
    if (await loc.isVisible({ timeout: 1200 }).catch(() => false)) {
      await loc.click({ timeout: 2500 });
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/**
 * 多页图册：侧栏导航叶子 + 工作台入口图标，逐页截干净图（溯源左栏切页用）
 * @param {{ maxPages?: number, bizVerView?: string, targetPages?: string[] }} [opts]
 */
async function crawlAlbumPages(
  page,
  frame,
  navTree,
  homePage,
  { maxPages = 8, bizVerView = "", targetPages = [] } = {}
) {
  const opts = { bizVerView, targetPages };
  // 勿把「设置」排除：商务端 V2「设置·有效端」是本版新增页
  const skip = /登录|退出|个人中心|帮助|关于|注册/;
  const navLeaves = flattenNavLeaves(navTree)
    .filter((t) => t && !skip.test(t))
    .filter((t, i, arr) => arr.indexOf(t) === i);
  const homeTitle = String(homePage?.title || "首页").trim();
  const wbEntries = await collectWorkbenchEntries(frame);
  const wants = (targetPages || []).map((x) => String(x || "").trim()).filter(Boolean);
  const pool = [...navLeaves, ...wbEntries]
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .filter((t) => t !== homeTitle && !homeTitle.includes(t) && !t.includes(homeTitle))
    .filter((t) => !/消息|通讯录|快捷语/.test(t));
  // 有改动汇总清单时：先爬命中页，再用其余侧栏页补齐（避免 matched 为空时整轮空转）
  const matched = wants.length
    ? pool.filter((leaf) =>
        wants.some(
          (want) => leaf === want || leaf.includes(want) || want.includes(leaf)
        )
      )
    : [];
  const rest = pool.filter((leaf) => !matched.includes(leaf));
  const toVisit = [...matched, ...rest].slice(0, Math.max(0, maxPages - 1));

  const pages = [homePage].filter(Boolean);
  let cur = frame;
  for (const title of toVisit) {
    try {
      // 先回工作台/首页再点入口，避免停在内页点不到图标
      if (pages.length > 1) {
        let back = await goHomeWorkbench(cur);
        if (!back && homeTitle) {
          back = await clickNavByTitle(cur, homeTitle).catch(() => false);
        }
        await page.waitForTimeout(500);
        cur = await pickContentFrame(page);
      }
      let ok = await clickMainEntryByTitle(cur, title);
      if (!ok) ok = await clickNavByTitle(cur, title);
      if (!ok) continue;
      await page.waitForTimeout(900);
      cur = await pickContentFrame(page);
      await dismissOverlayModals(cur, page);
      // 等列表渲染（蜂巢 renderUser 等）
      await page.waitForTimeout(400);
      const brief = await extractPageBrief(cur).catch(() => "");
      // 点了没跳页则跳过
      if (
        pages.length &&
        brief &&
        brief.slice(0, 200) === String(pages[0].brief || "").slice(0, 200) &&
        title !== "热门直播"
      ) {
        // 仍允许截图：hash 页可能正文开头相似；用 url 区分
      }
      // 本页原型说明条目 → DOM 热区（联运币/扶持额度等）
      let specDoc = (await extractPrototypeSpecPanel(cur, page).catch(() => "")) || "";
      if (opts.bizVerView) {
        await applyProtoPanelVerFilter(cur, page, opts.bizVerView);
        const filtered = await extractPrototypeSpecPanel(cur, page).catch(() => "");
        if (filtered && filtered.length > 40) specDoc = filtered;
      }
      await dismissOverlayModals(cur, page);
      const specRegs = await locateRegionsFromSpecDoc(
        cur,
        specDoc || brief || ""
      ).catch(() => []);
      const pageScan = await buildScanStory(page, cur, specRegs || []);
      if (!pageScan?.screenshot) continue;
      const hash = (() => {
        try {
          return new URL(cur.url() || page.url()).hash || "";
        } catch {
          return "";
        }
      })();
      // 截图与首页几乎同图 → 多半没进内页，丢弃
      if (
        pages[0]?.screenshot &&
        pageScan.screenshot === pages[0].screenshot
      ) {
        continue;
      }
      const pageId = `p${pages.length}`;
      pages.push({
        pageId,
        title,
        hash,
        screenshot: pageScan.screenshot,
        regions: (pageScan.regions || []).map((r) => ({
          ...r,
          pageId,
        })),
        viewport: pageScan.viewport,
        brief: (brief || "").slice(0, 2500),
        protoSpec: (specDoc || "").slice(0, 8000),
      });
    } catch {
      /* ignore one page */
    }
  }
  // 尽量回到首页，方便后续 CTA
  try {
    const back = await goHomeWorkbench(cur);
    if (!back && homeTitle) await clickNavByTitle(cur, homeTitle);
    await page.waitForTimeout(600);
    cur = await pickContentFrame(page);
  } catch {
    /* ignore */
  }
  return { pages, frame: cur };
}

/**
 * 点击侧栏叶子菜单，抓取各数据页正文（限制数量，避免超时）
 */
async function crawlNavPages(
  page,
  frame,
  navTree,
  { maxPages = 8, targetPages = [] } = {}
) {
  const skip = /登录|退出|个人中心|帮助|关于/;
  const leaves = flattenNavLeaves(navTree)
    .filter((t) => t && !skip.test(t))
    .filter((t, i, arr) => arr.indexOf(t) === i);
  const targets = (targetPages || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const matched = targets.length
    ? leaves.filter((leaf) =>
        targets.some(
          (want) => leaf === want || leaf.includes(want) || want.includes(leaf)
        )
      )
    : [];
  // 用户明确写了页面清单时，只抓命中的清单页；否则按侧栏顺序抓前几页。
  const pagesToVisit = (targets.length ? matched : leaves).slice(0, maxPages);
  const sections = [];
  let cur = frame;
  for (const title of pagesToVisit) {
    try {
      const before = await extractPageBrief(cur).catch(() => "");
      const ok = await clickNavByTitle(cur, title);
      if (!ok) continue;
      await page.waitForTimeout(1200);
      cur = await pickContentFrame(page);
      const brief = await extractPageBrief(cur).catch(() => "");
      if (!brief || brief.length < 40) continue;
      // 菜单点击无效时，不把同一页正文重复冒充其它页面。
      if (
        sections.length &&
        brief === before &&
        brief === sections[sections.length - 1]?.brief
      ) {
        continue;
      }
      sections.push({
        title,
        brief: brief.slice(0, 3500),
      });
    } catch {
      /* ignore one page */
    }
  }
  return {
    sections,
    frame: cur,
    requested: targets,
    matched,
    missing: targets.filter(
      (want) =>
        !matched.some(
          (leaf) => leaf === want || leaf.includes(want) || want.includes(leaf)
        )
    ),
  };
}

async function extractPrototypeDoc(frame) {
  return frame.evaluate(() => {
    const markers = ["原型说明", "页面概述", "功能目的", "界面作用", "字段与功能"];
    const body = document.body?.innerText || "";
    let idx = -1;
    for (const m of markers) {
      const i = body.indexOf(m);
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    if (idx < 0) return "";
    return body.slice(idx, idx + 12000).trim();
  });
}

/**
 * 点开浮钮「原型说明」侧栏，抽出结构化正文（图一：界面作用 / 字段与功能列表）。
 * 说明面板常默认收起，仅靠 body 文本切片会漏掉大半。
 * 本地原文件（宇宙直播 .html）优先读 #protoBody / #protoPanel（PAGE_PROTO 渲染结果）。
 */
async function extractPrototypeSpecPanel(frame, page) {
  // 0) 本地原文件：#protoBody 已挂载（registerProto / PAGE_PROTO）→ 直接取，最稳
  const fromProtoBody = await frame.evaluate(() => {
    const clean = (s) =>
      String(s || "")
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    const body = document.getElementById("protoBody");
    if (body) {
      const t = clean(body.innerText || body.textContent || "");
      if (t.length >= 40) return t.slice(0, 14000);
    }
    const panel = document.getElementById("protoPanel");
    if (panel) {
      const t = clean(panel.innerText || panel.textContent || "");
      if (t.length >= 60 && /界面作用|字段与功能|页面概述|功能目的/.test(t)) {
        return t.slice(0, 14000);
      }
    }
    return "";
  }).catch(() => "");
  if (fromProtoBody) return fromProtoBody;

  const clicked = await frame.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.right > 0;
    };
    // 只要小浮钮，不要侧栏标题「原型说明×」
    const candidates = [];
    for (const el of document.querySelectorAll("button, a, [role='button'], span, div")) {
      const t = clean(el.textContent);
      if (t !== "原型说明") continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 160 || r.height > 80) continue;
      candidates.push(el);
    }
    const target = candidates[0];
    if (!target) return false;
    const clickable = target.closest("button, a, [role='button']") || target;
    clickable.click();
    return true;
  });
  if (clicked) {
    await page.waitForTimeout(1100);
  }

  const doc = await frame.evaluate(() => {
    const clean = (s) =>
      String(s || "")
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    const score = (raw) => {
      const t = clean(raw);
      if (!t || t.length < 60) return 0;
      if (!/界面作用/.test(t) || !/字段与功能/.test(t)) return 0;
      if (/^更新记录/.test(t.trim())) return 0;
      let s = Math.min(t.length, 4000);
      if (/顶部导航|平台数据|主视觉|入驻引导/.test(t)) s += 800;
      return s;
    };

    let best = "";
    let bestScore = 0;
    for (const el of document.querySelectorAll(
      "aside, [role='dialog'], [role='complementary'], div, section"
    )) {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 240 || r.height < 160) continue;
      // 图一侧栏在右侧；排除整页大容器
      if (r.left < window.innerWidth * 0.4) continue;
      if (r.width > window.innerWidth * 0.55) continue;
      const t = el.innerText || "";
      const sc = score(t);
      if (sc > bestScore) {
        bestScore = sc;
        best = clean(t).slice(0, 14000);
      }
    }
    return best;
  });

  return doc || "";
}

/**
 * 从图一「原型说明」条目里抽关键字，在页面 DOM 上找矩形（图二：文案 ↔ UI 框）。
 * 优先匹配 【】「」[] 内短标签，以及「xxx：」段首标题。
 */
async function locateRegionsFromSpecDoc(frame, specDoc) {
  const bullets = [];
  const lines = String(specDoc || "").split(/\r?\n/);
  for (const raw of lines) {
    const line = String(raw || "").trim();
    if (!line || line.length < 8) continue;
    if (/^界面作用|^字段与功能|^原型说明/.test(line)) continue;
    const titleM = line.match(
      /^[-•·●]?\s*([^：:]{2,24})[：:]\s*(.+)$/
    );
    const title = titleM ? titleM[1].trim() : "";
    const body = titleM ? titleM[2].trim() : line;
    const keys = new Set();
    if (title && !/交互|更新|说明/.test(title)) keys.add(title);
    const quoted = body.matchAll(/[【「\[]([^】」\]]{1,24})[】」\]]/g);
    for (const m of quoted) {
      const k = String(m[1] || "").trim();
      if (k && k.length <= 20 && !/交互|点击|打开|关闭/.test(k)) keys.add(k);
    }
    if (!keys.size && title) keys.add(title.slice(0, 12));
    if (!keys.size) continue;
    bullets.push({
      title: title || [...keys][0],
      keywords: [...keys].slice(0, 6),
      line: line.slice(0, 200),
    });
  }
  if (!bullets.length) return [];

  return frame.evaluate((items) => {
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    function visible(el) {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.right > 0;
    }
    function scoreEl(el, keyword) {
      const t = clean(el.innerText || el.textContent || "");
      if (!t || t.length > 80) return 0;
      if (t === keyword) return 100;
      if (t.includes(keyword)) return 60 + Math.max(0, 20 - t.length);
      return 0;
    }
    const out = [];
    const used = new Set();
    // 列名 → 行内蓝色链接（联运币数字本身不含「联运币」文案）
    const colLinkMap = [
      [/联运币/, /openCoinRecharge|coinRc/i],
      [/扶持额度/, /openQuota|quota/i],
      [/充值记录/, /openRcLog|rcLog/i],
      [/最低联运币/, /openMinCoin|minCoin/i],
    ];

    for (const item of items) {
      let best = null;
      let bestScore = 0;
      for (const kw of item.keywords || []) {
        // 优先：说明字段名对应的 td-link
        for (const [nameRe, ocRe] of colLinkMap) {
          if (!nameRe.test(kw) && !nameRe.test(item.title || "")) continue;
          for (const el of document.querySelectorAll("a.td-link, a[onclick], .td-link")) {
            if (!visible(el)) continue;
            const oc = String(el.getAttribute("onclick") || "");
            if (!ocRe.test(oc)) continue;
            const r = el.getBoundingClientRect();
            const sc = 95;
            if (sc > bestScore) {
              bestScore = sc;
              best = { el, kw, r };
            }
          }
        }
        const nodes = document.querySelectorAll(
          "a, button, [role='button'], th, h1, h2, h3, span, div, p, li, label"
        );
        for (const el of nodes) {
          if (!visible(el)) continue;
          const sc = scoreEl(el, kw);
          if (sc <= bestScore) continue;
          // 过宽的容器不要（整页）
          const r = el.getBoundingClientRect();
          if (r.width > window.innerWidth * 0.92 && r.height > 120) continue;
          bestScore = sc;
          best = { el, kw, r };
        }
      }
      if (!best || bestScore < 60) continue;
      const key = `${Math.round(best.r.x)}_${Math.round(best.r.y)}_${item.title}`;
      if (used.has(key)) continue;
      used.add(key);
      out.push({
        title: item.title,
        keyword: best.kw,
        level: 1,
        source: "spec-keyword",
        rect: {
          x: Math.round(best.r.x),
          y: Math.round(best.r.y),
          w: Math.round(best.r.width),
          h: Math.round(best.r.height),
        },
      });
    }
    return out.slice(0, 20);
  }, bullets.slice(0, 24));
}

/** 关掉遮挡截图的弹层（更新记录 / 原型说明 / 改动汇总）；只按标题识别，避免 class*=modal 误伤整页 */
async function dismissOverlayModals(frame, page) {
  await frame
    .evaluate(() => {
      const hide = (el) => {
        if (!el || !el.style) return;
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      };
      for (const id of ["verSumPanel", "verSumOverlay", "protoPanel", "changelogPanel"]) {
        const el = document.getElementById(id);
        if (el) hide(el);
      }
      for (const el of document.querySelectorAll("div, section, aside, [role='dialog']")) {
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 240 || r.height < 160) continue;
        // 浮钮本身很小，不会进这里；只关大面板
        const head = (el.innerText || "").trim().slice(0, 24);
        if (/^更新记录/.test(head) || /^原型说明/.test(head) || /改动汇总/.test(head)) {
          hide(el);
        }
      }
    })
    .catch(() => {});
  try {
    await frame.keyboard.press("Escape");
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(300);
}

/**
 * 通读右下角「改动汇总」浮窗（V2 本版改了哪些页 / 每页改点 / 全站项）。
 * 优先读 window.BIZ_VERSIONS（与面板同源），失败再点绿色浮钮抽 DOM。
 * @returns {Promise<{ text: string, pages: string[], pageInfos: {href:string,label:string}[] }>}
 */
async function extractVersionChangeSummary(frame, page, verKey = "v2") {
  const key = String(verKey || "v2").trim() || "v2";
  const readBizVersions = (fr) =>
    fr
      .evaluate((k) => {
        const vers = window.BIZ_VERSIONS || [];
        const nav = window.BIZ_NAV || [];
        const off = window.BIZ_OFF_MENU || [];
        const v =
          vers.find((x) => x && x.key === k) ||
          vers.find((x) => /v2|近期/i.test(String(x?.label || ""))) ||
          vers[0];
        if (!v || !v.pages) return null;
        const labelOf = (href) => {
          for (const g of nav) {
            for (const it of g.items || []) {
              if (it.href === href) return it.label || href;
            }
          }
          for (const o of off) {
            if (o.href === href) return o.label || href;
          }
          return String(href || "").replace(/\.html$/i, "");
        };
        const lines = [
          `版本：${v.label || v.key}`,
          `概要：${v.name || "—"}`,
          `周期：${v.period || "—"}`,
          "",
          "【改动页面】",
        ];
        const pageNames = [];
        const pageInfos = [];
        for (const href of Object.keys(v.pages)) {
          const info = v.pages[href] || {};
          const name = labelOf(href);
          pageNames.push(name);
          pageInfos.push({ href, label: name });
          lines.push(
            `- ${info.kind === "new" ? "新增" : "改动"} · ${name}（${href}）`
          );
          for (const m of info.mods || []) lines.push(`  · ${m}`);
        }
        if ((v.global || []).length) {
          lines.push("", "【全站级改动】");
          for (const g of v.global) lines.push(`- ${g}`);
        }
        return {
          text: lines.join("\n").slice(0, 16000),
          pages: pageNames,
          pageInfos,
        };
      }, key)
      .catch(() => null);

  // 预览壳可能在 iframe；主 frame 没有 BIZ_VERSIONS 时扫全部 frame
  let fromData = await readBizVersions(frame);
  if (!fromData?.text && page?.frames) {
    for (const fr of page.frames()) {
      fromData = await readBizVersions(fr);
      if (fromData?.text) {
        // 后续点击也尽量用有数据的 frame
        frame = fr;
        break;
      }
    }
  }

  if (fromData?.text && fromData.text.length > 80) {
    return {
      text: fromData.text,
      pages: fromData.pages || [],
      pageInfos: fromData.pageInfos || [],
      frame,
    };
  }

  // DOM 兜底：点「改动汇总」浮钮
  const clicked = await frame
    .evaluate(() => {
      const btn = document.getElementById("verSumBtn");
      if (btn) {
        btn.click();
        return true;
      }
      const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
      for (const el of document.querySelectorAll("button, a, [role='button'], span, div")) {
        const t = clean(el.textContent).replace(/\s+/g, "");
        if (t !== "改动汇总") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 160) continue;
        (el.closest("button, a, [role='button']") || el).click();
        return true;
      }
      return false;
    })
    .catch(() => false);

  if (clicked) await page.waitForTimeout(1000);

  // 面板内切到目标版本 tab
  await frame
    .evaluate((k) => {
      const tabs = document.querySelectorAll("#verSumTabs .ver-sum-tab, #verSumTabs button");
      for (const b of tabs) {
        const ver = b.getAttribute("data-ver") || "";
        const t = (b.textContent || "").trim();
        if (ver === k || /V2|近期改版/i.test(t)) {
          b.click();
          return;
        }
      }
    }, key)
    .catch(() => {});
  await page.waitForTimeout(400);

  const fromDom = await frame
    .evaluate(() => {
      const body = document.getElementById("verSumBody");
      const title = document.getElementById("verSumTitle");
      const raw = [
        title?.innerText || "",
        body?.innerText || "",
      ]
        .join("\n")
        .replace(/\s+\n/g, "\n")
        .trim();
      if (raw.length < 40) return null;
      const pages = [];
      const pageInfos = [];
      for (const el of document.querySelectorAll(".ver-sum-page")) {
        const nameEl = el.querySelector(".ver-sum-page-name");
        const link = el.querySelector("a.ver-sum-page-head, a[href]");
        const n = (nameEl?.textContent || "").trim();
        const href = (link?.getAttribute("href") || "").trim();
        if (n) pages.push(n);
        if (n || href) pageInfos.push({ href, label: n || href });
      }
      return { text: raw.slice(0, 16000), pages, pageInfos };
    })
    .catch(() => null);

  await dismissOverlayModals(frame, page);
  if (fromDom?.text) {
    return {
      text: fromDom.text,
      pages: fromDom.pages || [],
      pageInfos: fromDom.pageInfos || [],
      frame,
    };
  }
  return { text: "", pages: [], pageInfos: [], frame };
}

/** 原型说明面板内切到指定版本筛选（V2/V1），减少把历史说明混进本版 */
async function applyProtoPanelVerFilter(frame, page, verKey) {
  const key = String(verKey || "").trim();
  if (!key || key === "all") return;
  await frame
    .evaluate((k) => {
      try {
        window.__protoVer = k;
        if (typeof window.applyProtoFilter === "function") {
          window.applyProtoFilter(k);
          return true;
        }
      } catch {
        /* ignore */
      }
      const chips = document.querySelectorAll(
        "#protoPanel button, #protoPanel [role='button'], #protoPanel .proto-ver-chip, #protoPanel label, #protoPanel span"
      );
      for (const el of chips) {
        const t = String(el.textContent || "").replace(/\s+/g, " ").trim();
        if (
          (k === "v2" && /^V2\b/.test(t)) ||
          (k === "v1" && /^V1\b/.test(t)) ||
          t.toLowerCase() === k
        ) {
          el.click();
          return true;
        }
      }
      return false;
    }, key)
    .catch(() => false);
  await page.waitForTimeout(350);
}

/** 点击「更新记录」并读取弹窗正文（PM 在原型里追加的需求变更） */
async function extractUpdateRecords(frame, page) {
  const clicked = await frame.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width >= 8 && r.height >= 8;
    };
    for (const el of document.querySelectorAll("button, a, [role='button'], span, div")) {
      const t = clean(el.textContent);
      if (t !== "更新记录") continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 160 || r.height > 80) continue;
      const target = el.closest("button, a, [role='button']") || el;
      target.click();
      return true;
    }
    return false;
  });
  if (clicked) {
    await page.waitForTimeout(900);
  }

  return frame.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+\n/g, "\n").trim();
    const pick = (raw) => {
      const t = clean(raw);
      if (!t || t.length < 40) return "";
      if (!/^更新记录/.test(t.trim()) && !t.includes("更新记录")) return "";
      if (t === "更新记录" || /^更新记录\s*\d+$/.test(t)) return "";
      if (/界面作用|字段与功能/.test(t) && !/^更新记录/.test(t.trim())) return "";
      if (!/202\d|优化|新增|规则|原型|菜单|Tab|字段|弹窗|话术|结构/i.test(t)) return "";
      return t.slice(0, 12000);
    };

    let best = "";
    for (const el of document.querySelectorAll("div, section, aside, [role='dialog']")) {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 280 || r.height < 160) continue;
      const got = pick(el.innerText || "");
      if (got.length > best.length) best = got;
    }
    return best;
  });
}

async function extractPageBrief(frame) {
  return frame.evaluate(() => {
    const body = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim();
    // 去掉过长排行数字噪声，保留前段结构
    return body.slice(0, 6000);
  });
}

/** 成功弹窗 / 主流程常见主按钮（演示证据优先于说明文案） */
const PRIMARY_CTA_LABELS = [
  "立即使用",
  "稍后查看",
  "立即领取",
  "领取",
  "确定",
  "确认",
  "提交",
  "立即支付",
  "去支付",
  "支付",
  "立即开通",
  "开通",
];

/** 可能打开成功态的入口（先点再抓主按钮） */
const ENTRY_CTA_LABELS = ["抢靓号", "立即抢", "去抽奖", "抽奖", "立即购买", "去购买"];

async function snapshotUiState(frame) {
  return frame.evaluate(() => {
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const body = clean(document.body?.innerText || "");
    const toasts = [];
    const toastSels =
      '[class*="toast"],[class*="Toast"],[class*="message"],[class*="Message"],[class*="notice"],[class*="Notice"],[class*="tip"],[class*="Tip"],[class*="snackbar"]';
    for (const el of document.querySelectorAll(toastSels)) {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        continue;
      }
      const t = clean(el.innerText || "");
      if (t && t.length <= 60 && !toasts.includes(t)) toasts.push(t);
    }
    // 顶部短横幅（如「靓号已生效」）
    for (const el of document.querySelectorAll("div, span, p, section")) {
      if (el.children.length > 2) continue;
      const t = clean(el.innerText || "");
      if (!t || t.length > 24) continue;
      if (!/已生效|成功|已提交|已支付|已领取|已开通|完成/.test(t)) continue;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.top > 160 || r.width < 40) continue;
      if (!toasts.includes(t)) toasts.push(t);
    }
    let dialog = "";
    for (const sel of [
      '[role="dialog"]',
      ".ant-modal-content",
      "[class*='modal']",
      "[class*='Modal']",
      "[class*='popup']",
      "[class*='Popup']",
      "[class*='dialog']",
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 80) continue;
        dialog = clean(el.innerText || "").slice(0, 160);
        if (dialog) break;
      }
      if (dialog) break;
    }
    return {
      head: body.slice(0, 360),
      toasts: toasts.slice(0, 6),
      dialog,
    };
  });
}

async function listVisibleLabels(frame, labels) {
  return frame.evaluate((names) => {
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const want = new Set(names);
    const out = [];
    const seen = new Set();
    const nodes = document.querySelectorAll(
      "button, a, [role='button'], .btn, [class*='btn'], span, div"
    );
    for (const el of nodes) {
      if (el.children.length > 4) continue;
      const t = clean(el.innerText || el.textContent || "");
      if (!want.has(t)) continue;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        continue;
      }
      if (st.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      if (r.bottom < 0 || r.top > (window.innerHeight || 900)) continue;
      const key = `${t}@${Math.round(r.x)}:${Math.round(r.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mark = `qa-cta-${out.length}`;
      el.setAttribute("data-qa-cta", mark);
      out.push({ name: t, mark, x: r.x + r.width / 2, y: r.y + r.height / 2 });
      if (out.length >= 10) break;
    }
    return out;
  }, labels);
}

async function clickMarked(frame, page, item) {
  try {
    const loc = frame.locator(`[data-qa-cta="${item.mark}"]`).first();
    if ((await loc.count()) > 0) {
      await loc.click({ timeout: 2500 });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    await page.mouse.click(item.x, item.y);
    return true;
  } catch {
    return false;
  }
}

function summarizeDelta(before, after) {
  const bits = [];
  const beforeToasts = new Set(before?.toasts || []);
  for (const t of after?.toasts || []) {
    if (!beforeToasts.has(t)) bits.push(`提示「${t}」`);
  }
  const bh = before?.head || "";
  const ah = after?.head || "";
  if (after?.dialog && after.dialog !== before?.dialog) {
    bits.push(`弹窗变为「${String(after.dialog).slice(0, 48)}」`);
  } else if (before?.dialog && !after?.dialog) {
    bits.push("弹窗关闭");
  }
  // 编号/文案片段变化（取 after 独有短词）
  const numAfter = ah.match(/\d{6,}/g) || [];
  const numBefore = new Set(bh.match(/\d{6,}/g) || []);
  for (const n of numAfter) {
    if (!numBefore.has(n)) {
      bits.push(`出现编号 ${n}`);
      break;
    }
  }
  if (/分身|靓号|订单|支付成功|已生效/.test(ah) && !/分身|靓号|订单|支付成功|已生效/.test(bh.slice(0, 120))) {
    bits.push(`页面正文含「${(ah.match(/分身|靓号|订单|支付成功|已生效/) || [""])[0]}」相关态`);
  }
  if (!bits.length && ah && ah !== bh) {
    bits.push(`页面正文变化（前 ${Math.min(80, ah.length)} 字：${ah.slice(0, 80)}）`);
  }
  return bits;
}

/**
 * 点关键入口/主按钮，记录点击前后可观察变化（演示证据）。
 * 说明文案缺步时，生成/评审以此为准。
 */
async function captureCtaInteractionTraces(page, frame) {
  const traces = [];
  const maxTraces = 6;

  async function tryClickLabel(labels, role) {
    if (traces.length >= maxTraces) return;
    const items = await listVisibleLabels(frame, labels).catch(() => []);
    for (const item of items) {
      if (traces.length >= maxTraces) break;
      const before = await snapshotUiState(frame).catch(() => null);
      const ok = await clickMarked(frame, page, item);
      if (!ok) continue;
      await page.waitForTimeout(900);
      const after = await snapshotUiState(frame).catch(() => null);
      const delta = summarizeDelta(before || {}, after || {});
      traces.push({
        role,
        action: `点击「${item.name}」`,
        beforeDialog: before?.dialog || "",
        afterDialog: after?.dialog || "",
        afterToasts: after?.toasts || [],
        delta,
        afterHead: (after?.head || "").slice(0, 160),
      });
      try {
        await frame.keyboard.press("Escape");
        await page.waitForTimeout(200);
      } catch {
        /* ignore */
      }
    }
  }

  // 先尝试入口（如抢靓号）→ 再点成功态主按钮
  await tryClickLabel(ENTRY_CTA_LABELS, "入口");
  await tryClickLabel(PRIMARY_CTA_LABELS, "主按钮");

  return traces;
}

function formatCtaTraces(traces) {
  if (!traces?.length) return "";
  const lines = [
    "【关键按钮交互轨迹（最高权威·演示证据；说明文案未写清时必须采用本段可观察结果）】",
  ];
  traces.forEach((tr, i) => {
    const delta =
      (tr.delta && tr.delta.length ? tr.delta.join("；") : "") ||
      (tr.afterToasts?.length ? tr.afterToasts.map((t) => `提示「${t}」`).join("；") : "（未捕获明显增量文案，请结合 after 正文）");
    lines.push(
      `${i + 1}. ${tr.action}` +
        (tr.beforeDialog ? `（点前弹窗：${String(tr.beforeDialog).slice(0, 40)}）` : "") +
        ` → ${delta}`
    );
    if (tr.afterHead) {
      lines.push(`   点后正文节选：${tr.afterHead}`);
    }
  });
  return lines.join("\n");
}

/** 侧栏/导航模块的视口坐标（相对 frame），供扫描动画 */
async function extractNavRegions(frame) {
  return frame.evaluate(() => {
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const out = [];
    const seen = new Set();
    const pushEl = (el, title, level = 1) => {
      const t = clean(title);
      if (!t || t.length > 32 || seen.has(t)) return;
      if (!el || typeof el.getBoundingClientRect !== "function") return;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      if (r.bottom < 0 || r.right < 0) return;
      seen.add(t);
      out.push({
        title: t,
        level,
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      });
    };

    const groups = document.querySelectorAll(
      ".sidebar-nav .nav-group, .sidebar .nav-group, nav .nav-group"
    );
    if (groups.length) {
      for (const g of groups) {
        const titleEl = g.querySelector(":scope > .nav-group-title");
        if (titleEl) pushEl(titleEl, titleEl.textContent, 1);
        for (const it of g.querySelectorAll(":scope > .nav-item, :scope > a.nav-item")) {
          pushEl(it, it.textContent, titleEl ? 2 : 1);
        }
        if (!titleEl) {
          const only = g.querySelector(".nav-item");
          if (only) pushEl(only, only.textContent, 1);
        }
      }
    }

    if (!out.length) {
      const menuRoot =
        document.querySelector(".ant-layout-sider .ant-menu") ||
        document.querySelector("aside .ant-menu") ||
        document.querySelector(".sidebar-nav") ||
        document.querySelector("aside nav") ||
        document.querySelector("nav") ||
        document.querySelector("header");
      if (menuRoot) {
        for (const el of menuRoot.querySelectorAll(
          ".ant-menu-submenu-title, .ant-menu-item, .nav-item, a, button"
        )) {
          const t = clean(el.textContent);
          if (t && t.length <= 24) pushEl(el, t, 1);
        }
      }
    }

    // C 端官网：侧栏常无，补顶栏锚点 + 主视觉关键区（平台数据等）
    if (out.length < 4) {
      const headerLinks = document.querySelectorAll(
        "header a, header button, .navbar a, [class*='nav'] a, [class*='Nav'] a"
      );
      for (const el of headerLinks) {
        const t = clean(el.textContent);
        if (!t || t.length > 16) continue;
        if (/首页|直播|公会|联系|登录|注册|Logo|宇宙/.test(t) || t.length <= 8) {
          pushEl(el, t, 1);
        }
      }
      for (const el of document.querySelectorAll("h1, h2, section, [class*='hero'], [class*='Hero']")) {
        const t = clean(el.innerText || el.textContent).slice(0, 20);
        if (!t || t.length < 4) continue;
        if (/点亮|热爱|平台|数据|主播|直播|能力|合作/.test(t)) {
          pushEl(el, t, 1);
        }
        if (out.length >= 16) break;
      }
    }

    out.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    return out.slice(0, 24).map((it, i) => ({ ...it, id: `r${i}`, order: i }));
  });
}

/**
 * 列表页/表单页控件热区：表头、蓝色可点数字（td-link）、按钮、筛选项。
 * 解决「测点写联运币，左栏却无热区」——相册页此前 regions 常为空。
 */
async function extractInteractiveControlRegions(frame) {
  return frame
    .evaluate(() => {
      const clean = (s) =>
        String(s || "")
          .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
          .replace(/\s+/g, " ")
          .trim();
      const visible = (el) => {
        const st = window.getComputedStyle(el);
        if (
          st.display === "none" ||
          st.visibility === "hidden" ||
          Number(st.opacity) === 0
        ) {
          return false;
        }
        const r = el.getBoundingClientRect();
        return r.width >= 6 && r.height >= 6 && r.bottom > 0 && r.right > 0;
      };
      const out = [];
      const used = new Set();
      /** zone: filter|list|workbench|other — 供溯源按「筛选区/列表区」择优 */
      const push = (el, title, keyword, level = 2, zone = "other", kind = "") => {
        if (!el || !visible(el)) return;
        const t = clean(title || keyword);
        if (!t || t.length > 24) return;
        const r = el.getBoundingClientRect();
        if (r.width > window.innerWidth * 0.95 && r.height > 160) return;
        const key = `${zone}|${kind}|${t}|${Math.round(r.x)}|${Math.round(r.y)}`;
        if (used.has(key)) return;
        used.add(key);
        out.push({
          title: t,
          keyword: clean(keyword || t),
          level,
          source: "control",
          zone,
          kind: kind || zone,
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
        });
      };

      // 工作台入口图标（勿与列表列「联运币」混淆）
      for (const el of document.querySelectorAll(".wb-item, .wb-label")) {
        const lab = el.classList?.contains("wb-label")
          ? el
          : el.querySelector?.(".wb-label") || el;
        const t = clean(lab.textContent);
        if (t) push(el.closest(".wb-item") || el, t, t, 2, "workbench", "entry");
      }

      // 表头 → 列表区
      for (const th of document.querySelectorAll("th, thead td")) {
        const t = clean(th.textContent).replace(/[↕▲▼↑↓]/g, "").trim();
        if (t && t.length <= 16) push(th, t, t, 2, "list", "col-header");
      }

      // 蓝色可点列：联运币 / 扶持额度 → 列表区
      const onclickMap = [
        [/openCoinRecharge|coinRc|m_coinRc/i, "联运币"],
        [/openQuota|扶持额度|m_quota/i, "扶持额度"],
        [/openRcLog|充值记录/i, "充值记录"],
        [/openMinCoin|最低联运币/i, "最低联运币限额"],
        [/userView|查看/i, "查看"],
      ];
      for (const el of document.querySelectorAll(
        "a.td-link, a[onclick], td a, .td-link, [onclick*='openCoin'], [onclick*='openQuota']"
      )) {
        const oc = String(el.getAttribute("onclick") || "");
        let label = "";
        for (const [re, name] of onclickMap) {
          if (re.test(oc) || re.test(el.className || "")) {
            label = name;
            break;
          }
        }
        if (!label) {
          const td = el.closest("td");
          const tr = el.closest("tr");
          const table = el.closest("table");
          if (td && tr && table) {
            const idx = [...tr.children].indexOf(td);
            const th = table.querySelectorAll("th")[idx];
            if (th) label = clean(th.textContent).replace(/[↕▲▼↑↓]/g, "").trim();
          }
        }
        if (label) push(el, label, label, 1, "list", "cell-link");
      }

      // 筛选项 / 按钮 → 筛选区
      for (const el of document.querySelectorAll(
        "button, .btn, input[placeholder], select, .pill"
      )) {
        if (el.closest("td, th, .act")) continue; // 行内操作不算筛选
        const t =
          clean(el.getAttribute("placeholder") || "") ||
          clean(el.textContent) ||
          clean(el.value);
        if (!t || t.length > 16) continue;
        if (/确定|取消|关闭|×/.test(t) && el.closest(".modal-mask, .modal")) continue;
        const tag = (el.tagName || "").toLowerCase();
        const kind =
          tag === "select" || el.getAttribute("placeholder")
            ? "filter-control"
            : "filter-btn";
        push(el, t, t, 2, "filter", kind);
      }

      // 行操作按钮
      for (const el of document.querySelectorAll("td button.act, td .act")) {
        const t = clean(el.textContent);
        if (t && t.length <= 12) push(el, t, t, 2, "list", "row-action");
      }

      return out.slice(0, 48);
    })
    .catch(() => []);
}

async function buildScanStory(page, frame, extraRegions = []) {
  try {
    const regionsRaw = await extractNavRegions(frame).catch(() => []);
    const ctrlRaw = await extractInteractiveControlRegions(frame).catch(() => []);
    const mergedRaw = [
      ...(extraRegions || []),
      ...(ctrlRaw || []),
      ...(regionsRaw || []),
    ];
    // 去重：同 title+zone+kind 才合并；「账号状态」筛选下拉与列表表头可并存
    const seenKey = new Set();
    const deduped = [];
    for (const r of mergedRaw) {
      const t = String(r.title || "").trim();
      const zone = String(r.zone || "");
      const kind = String(r.kind || "");
      const key = t
        ? `${zone}|${kind}|${t}`
        : `${zone}|${kind}|${r.rect?.x}_${r.rect?.y}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      deduped.push(r);
    }
    let ox = 0;
    let oy = 0;
    try {
      if (frame !== page.mainFrame()) {
        const handle = await frame.frameElement();
        const box = await handle.boundingBox();
        if (box) {
          ox = box.x;
          oy = box.y;
        }
      }
    } catch {
      /* ignore */
    }
    const regions = deduped.slice(0, 40).map((r, i) => ({
      ...r,
      id: r.id || `r${i}`,
      order: i,
      rect: {
        x: Math.round((r.rect?.x || 0) + ox),
        y: Math.round((r.rect?.y || 0) + oy),
        w: Math.round(r.rect?.w || 0),
        h: Math.round(r.rect?.h || 0),
      },
    }));
    const buf = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
    const screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const vp = page.viewportSize() || { width: 1440, height: 900 };
    return {
      screenshot,
      regions,
      viewport: { w: vp.width, h: vp.height },
      capturedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 商务端原型：写入「按版本查看」并尽量触发侧栏刷新，只抓该版本菜单。
 * @param {import('playwright').Frame} frame
 * @param {string} verKey v2 | v1 | all
 */
async function applyBizVerViewFilter(page, frame, verKey) {
  const key = String(verKey || "").trim();
  if (!key || key === "all") return false;
  try {
    const applied = await frame.evaluate((k) => {
      try {
        localStorage.setItem("biz_ver_view", k);
      } catch {
        /* ignore */
      }
      const sel =
        document.querySelector("#verBar select") ||
        document.querySelector(".ver-bar select") ||
        document.querySelector('select[id*="ver"]');
      if (sel) {
        sel.value = k;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    }, key);
    if (!applied) {
      await frame.evaluate(() => {
        try {
          location.reload();
        } catch {
          /* ignore */
        }
      });
      await frame.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
    } else {
      await page.waitForTimeout(600);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, bizVerView?: string, targetPages?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, context?: string, error?: string, meta?: object, scan?: object }>}
 */
export async function fetchRenderedPrototypeContext(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 120000;
  const bizVerView = String(opts.bizVerView || "").trim();
  const launched = await launchBrowser();
  if (launched.error) return { ok: false, error: launched.error };

  const { browser } = launched;
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    });
    page.setDefaultTimeout(timeoutMs);

    // 尽量在任意同域文档加载前写入版本过滤（含 iframe）
    if (bizVerView && bizVerView !== "all") {
      await page.addInitScript((k) => {
        try {
          localStorage.setItem("biz_ver_view", k);
        } catch {
          /* ignore */
        }
      }, bizVerView);
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // 等预览壳挂上 iframe / 资源下载完成（xm.wanxiayc 常先显示「下载预览资源」）
    await waitPreviewShellReady(page, url);
    try {
      await page.waitForSelector("iframe", { timeout: 12000 });
    } catch {
      /* 也可能是直出页 */
    }
    await page.waitForTimeout(2000);

    let frame = await pickContentFrame(page);
    // iframe 可能晚挂载
    if (frame === page.mainFrame()) {
      await page.waitForTimeout(2000);
      frame = await pickContentFrame(page);
    }

    try {
      await frame.waitForLoadState("domcontentloaded", { timeout: 20000 });
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(1500);

    const loginBrief = await extractPageBrief(frame).catch(() => "");
    const login = await tryAutoLogin(frame, page);
    // 登录跳转后可能换 frame / 同 frame 换文档
    frame = await pickContentFrame(page);
    await page.waitForTimeout(800);
    if (bizVerView) {
      await applyBizVerViewFilter(page, frame, bizVerView);
      frame = await pickContentFrame(page);
      await page.waitForTimeout(500);
    }
    await expandMenus(frame);

    const title = await page.title().catch(() => "");
    const frameTitle = await frame.title().catch(() => "");
    const navTree = await extractNavTree(frame).catch(() => []);
    const navText = formatNavTree(navTree);

    // 0) 通读「改动汇总」浮窗（本版改了哪些页）—— V2 范围权威来源
    let verSum = await extractVersionChangeSummary(
      frame,
      page,
      bizVerView || "v2"
    ).catch(() => ({ text: "", pages: [], pageInfos: [], frame }));
    if (verSum?.frame) frame = verSum.frame;
    await dismissOverlayModals(frame, page);
    const summaryPages = [
      ...(Array.isArray(verSum?.pages) ? verSum.pages : []),
    ];
    let summaryPageInfos = [
      ...(Array.isArray(verSum?.pageInfos) ? verSum.pageInfos : []),
    ];
    // 易漏的 V2 页：即便汇总抽取失败也强制尝试进入
    const MUST_V2_PAGES = [
      { href: "alert-rules.html", label: "预警规则" },
      { href: "exempt-channels.html", label: "免预警渠道" },
      { href: "settings.html", label: "设置" },
      { href: "register-detail.html", label: "注册明细" },
      { href: "game-server.html", label: "区服分析" },
      { href: "ranking.html", label: "排行榜" },
      { href: "effect-stats.html", label: "商务绩效统计" },
      { href: "alert-center.html", label: "预警列表" },
    ];
    if (bizVerView === "v2" || /V2|近期改版/.test(verSum?.text || "")) {
      const seenHref = new Set(
        summaryPageInfos.map((p) => String(p.href || "").toLowerCase())
      );
      for (const m of MUST_V2_PAGES) {
        if (!seenHref.has(m.href.toLowerCase())) {
          summaryPageInfos.push(m);
          if (!summaryPages.includes(m.label)) summaryPages.push(m.label);
        }
      }
    }
    const crawlTargets = [
      ...new Set([
        ...(opts.targetPages || []),
        ...summaryPages,
        ...summaryPageInfos.map((p) => p.label).filter(Boolean),
      ]),
    ].filter(Boolean);

    // 1) 点开「原型说明」侧栏抽正文（图一）→ 按版本筛 → 关面板 → 关键字定矩形（图二）→ 截图
    let doc = await extractPrototypeSpecPanel(frame, page).catch(() => "");
    if (bizVerView) {
      await applyProtoPanelVerFilter(frame, page, bizVerView);
      const filtered = await extractPrototypeSpecPanel(frame, page).catch(() => "");
      if (filtered && filtered.length > 40) doc = filtered;
    }
    if (!doc) {
      doc = await extractPrototypeDoc(frame).catch(() => "");
    }
    await dismissOverlayModals(frame, page);
    const keywordRegions = doc
      ? await locateRegionsFromSpecDoc(frame, doc).catch(() => [])
      : [];
    const scan = await buildScanStory(page, frame, keywordRegions);
    const homeHash = (() => {
      try {
        return new URL(frame.url() || page.url()).hash || "#/";
      } catch {
        return "#/";
      }
    })();
    const homePage = scan?.screenshot
      ? {
          pageId: "p0",
          title: "工作台",
          hash: homeHash,
          screenshot: scan.screenshot,
          regions: (scan.regions || []).map((r) => ({ ...r, pageId: "p0" })),
          viewport: scan.viewport,
          brief: "",
          protoSpec: (doc || "").slice(0, 8000),
        }
      : null;

    // 2) 再点开「更新记录」抽正文（截图已完成）
    const updateRecords = await extractUpdateRecords(frame, page).catch(() => "");
    await dismissOverlayModals(frame, page);
    const brief = await extractPageBrief(frame).catch(() => "");
    if (homePage) homePage.brief = (brief || "").slice(0, 2500);
    const finalUrl = frame.url() || page.url();

    // 3) 多页图册 + 侧栏正文补充
    let extraSections = [];
    let missingRequestedPages = [];
    let albumPages = homePage ? [homePage] : [];
    // V2 改动页常超过 8 个；有改动汇总清单时放宽
    const albumMax = Math.min(
      18,
      Math.max(8, (crawlTargets.length || 0) + 1, bizVerView ? 14 : 8)
    );
    try {
      const album = await crawlAlbumPages(page, frame, navTree, homePage, {
        maxPages: albumMax,
        bizVerView,
        targetPages: crawlTargets,
      });
      albumPages = album.pages?.length ? album.pages : albumPages;
      if (album.frame) frame = album.frame;
      // 非首页：页面正文 + 本页「原型说明」一并进上下文
      extraSections = (albumPages || [])
        .filter((p) => p.pageId !== "p0" && (p.brief || p.protoSpec))
        .map((p) => ({
          title: p.title,
          brief: p.brief || "",
          protoSpec: p.protoSpec || "",
        }));
      if (crawlTargets.length) {
        const capturedTitles = albumPages.map((p) => p.title);
        missingRequestedPages = crawlTargets.filter(
          (want) =>
            !capturedTitles.some(
              (title) =>
                title === want || title.includes(want) || String(want).includes(title)
            )
        );
      }
    } catch (e) {
      console.warn("[prototype] crawlAlbumPages", e?.message || e);
      // 降级：仅正文 crawl
      try {
        const crawled = await crawlNavPages(page, frame, navTree, {
          maxPages: albumMax,
          targetPages: crawlTargets,
        });
        extraSections = crawled.sections || [];
        if (crawled.frame) frame = crawled.frame;
      } catch (e2) {
        console.warn("[prototype] crawlNavPages", e2?.message || e2);
      }
    }

    // 强制按改动汇总 href 补齐易漏页（预警规则 / 免预警 / 设置等）
    try {
      const have = new Set(
        extraSections.map((s) => String(s.title || "")).concat(
          albumPages.map((p) => String(p.title || ""))
        )
      );
      const needForce = summaryPageInfos.filter((p) => {
        const lab = String(p.label || "");
        return (
          lab &&
          ![...have].some(
            (t) => t === lab || t.includes(lab) || lab.includes(t)
          )
        );
      });
      // 即使 album 已有标题，若 brief 过短也强制再抓一次关键页
      const thinTitles = new Set(
        extraSections
          .filter(
            (s) =>
              (!s.brief || s.brief.length < 80) &&
              (!s.protoSpec || s.protoSpec.length < 40)
          )
          .map((s) => s.title)
      );
      const forceList = [
        ...needForce,
        ...summaryPageInfos.filter((p) => thinTitles.has(p.label)),
        ...MUST_V2_PAGES.filter((m) =>
          ![...have].some(
            (t) =>
              t === m.label || t.includes(m.label) || m.label.includes(t)
          )
        ),
      ];
      const uniq = [];
      const seen = new Set();
      for (const p of forceList) {
        const k = `${p.href}|${p.label}`;
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(p);
      }
      if (uniq.length) {
        const forced = await crawlForcedBizPages(page, frame, uniq, {
          bizVerView,
        });
        if (forced.frame) frame = forced.frame;
        for (const sec of forced.sections || []) {
          const idx = extraSections.findIndex(
            (s) =>
              s.title === sec.title ||
              (sec.title && String(s.title || "").includes(sec.title))
          );
          if (idx >= 0) {
            if ((sec.brief || "").length > (extraSections[idx].brief || "").length) {
              extraSections[idx].brief = sec.brief;
            }
            if (
              (sec.protoSpec || "").length >
              (extraSections[idx].protoSpec || "").length
            ) {
              extraSections[idx].protoSpec = sec.protoSpec;
            }
          } else {
            extraSections.push(sec);
          }
          missingRequestedPages = missingRequestedPages.filter(
            (want) =>
              !(
                sec.title === want ||
                sec.title.includes(want) ||
                want.includes(sec.title)
              )
          );
        }
      }
    } catch (e) {
      console.warn("[prototype] crawlForcedBizPages", e?.message || e);
    }

    if (scan) {
      scan.pages = albumPages.map((p) => ({
        pageId: p.pageId,
        title: p.title,
        hash: p.hash || "",
        screenshot: p.screenshot,
        regions: p.regions || [],
        viewport: p.viewport || scan.viewport,
      }));
    }

    // 关键 CTA 点击轨迹：说明缺步时以演示可观察结果为准
    let ctaTraces = [];
    let ctaTraceText = "";
    try {
      frame = await pickContentFrame(page);
      ctaTraces = await captureCtaInteractionTraces(page, frame);
      ctaTraceText = formatCtaTraces(ctaTraces);
    } catch (e) {
      console.warn("[prototype] ctaTraces", e?.message || e);
    }

    if (!navText && !brief && !extraSections.length && !ctaTraceText) {
      // 仍返回截图，供溯源台左栏展示（正文可能还在加载中）
      let fallbackScan = scan;
      if (!fallbackScan?.screenshot) {
        try {
          const buf = await page.screenshot({
            type: "jpeg",
            quality: 55,
            fullPage: false,
          });
          fallbackScan = {
            screenshot: `data:image/jpeg;base64,${buf.toString("base64")}`,
            regions: [],
            viewport: { w: 1440, h: 900 },
          };
        } catch {
          /* ignore */
        }
      }
      return {
        ok: false,
        error: "渲染后仍未抽取到可见正文（可能是空白页或加载失败）",
        meta: { title, login },
        scan: fallbackScan || undefined,
        // 溯源台仍可用截图
        context:
          `来源（浏览器渲染）：${url}\n` +
          `页面标题：${frameTitle || title || "（无）"}\n` +
          (login?.reason ? `【动作】${login.reason}\n` : "") +
          "【提醒】可见正文偏少，已尽量截取当前视口；请以截图与已有测点对照。",
      };
    }

    const parts = [
      `来源（浏览器渲染）：${url}`,
      finalUrl && finalUrl !== url ? `实际页面：${finalUrl}` : "",
      `页面标题：${frameTitle || title || "（无）"}`,
      login.loggedIn
        ? "【动作】检测到登录页，已自动填写演示账号并登录（原型通常不校验密码）"
        : login.skipped
          ? "【动作】未检测到需登录的表单，直接抽取当前页"
          : `【动作】尝试登录未完成：${login.reason || "未知"}`,
      bizVerView
        ? `【本版范围】已尝试按原型「按版本查看=${bizVerView}」过滤侧栏（biz_ver_view）；生成测点勿展开未纳入该版本的菜单`
        : "",
      "",
    ];
    if (ctaTraceText) {
      parts.push(ctaTraceText, "");
    }
    if (login.loggedIn && loginBrief) {
      parts.push(
        "【登录页可见正文（梳理框架时须保留「登录」为一级模块）】",
        loginBrief.slice(0, 2500),
        ""
      );
    }
    parts.push(
      "【导航 / 模块结构（优先据此梳理页面框架，按层级保留父子关系；登录后侧栏）】",
      navText || "（未识别到侧栏菜单，请结合下方正文）",
      ""
    );
    // 三浮窗正文（强制通读）：改动汇总 → 原型说明 → 更新记录
    if (verSum?.text) {
      parts.push(
        "【HTML 原型 · 改动汇总正文（点开绿色浮钮「改动汇总」/ BIZ_VERSIONS；本版改了哪些页、每页改点、全站项；框架一级模块须覆盖汇总中的改动页；禁止把「改动汇总」列为被测模块）】",
        verSum.text,
        ""
      );
    } else {
      parts.push(
        "【警告】未能抽取「改动汇总」浮窗正文；若素材要求仅 V2，请对照原型绿色「改动汇总」人工核对是否漏模块。",
        ""
      );
    }
    if (doc) {
      parts.push(
        "【HTML 原型 · 原型说明正文（点开浮钮「原型说明」抽取；本页字段/交互口径；禁止把「原型说明」列为被测模块）】",
        doc,
        ""
      );
    } else {
      parts.push("【警告】未能抽取「原型说明」浮窗正文。", "");
    }
    if (updateRecords) {
      parts.push(
        "【更新记录正文（点开橙色浮钮「更新记录」；PM 追加的需求/规则变更，须精读并纳入框架与测试点；禁止把「更新记录」列为被测模块，禁止写打开/关闭更新记录用例）】",
        updateRecords,
        ""
      );
    } else {
      parts.push("【警告】未能抽取「更新记录」浮窗正文。", "");
    }
    parts.push(
      "【当前页可见正文节选（上→下、左→右识别区块）】",
      brief || "（空）",
      ""
    );
    if (extraSections.length) {
      parts.push(
        `【其它侧栏页面正文（已自动点击 ${extraSections.length} 个菜单；含各页「原型说明」；请按 page 归属提取字段）】`
      );
      for (const sec of extraSections) {
        parts.push("", `【子页面：${sec.title}】`, sec.brief || "（无正文）");
        if (sec.protoSpec) {
          parts.push(
            `【子页面·原型说明：${sec.title}】`,
            String(sec.protoSpec).slice(0, 6000)
          );
        }
      }
    }

    return {
      ok: true,
      context: parts.filter((x) => x !== "").join("\n"),
      scan: scan || undefined,
      meta: {
        title: frameTitle || title,
        navCount: navTree.length,
        loggedIn: !!login.loggedIn,
        finalUrl,
        scanRegions: scan?.regions?.length || 0,
        extraPages: extraSections.map((s) => s.title),
        hasUpdateRecords: !!updateRecords,
        hasPrototypeSpec: !!doc,
        hasVersionSummary: !!(verSum?.text && verSum.text.length > 40),
        versionSummaryPages: summaryPages,
        keywordRegions: keywordRegions?.length || 0,
        albumPageCount: albumPages?.length || 0,
        ctaTraceCount: ctaTraces.length,
        requestedPages: crawlTargets.map((x) => String(x)),
        missingRequestedPages,
        bizVerView: bizVerView || "",
      },
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 400) };
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}

export { PW_INSTALL_HINT };
