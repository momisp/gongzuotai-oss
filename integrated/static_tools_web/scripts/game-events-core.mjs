/**
 * 游戏活动抓取核心 - 供 game-events.mjs CLI 与 game-events-bridge.mjs 桥接调用。
 *
 * 数据源（adapter）：
 *   - official  : 米哈游官方公告 API（hk4e/hkrpg/nap）；崩坏3 走米游社 api-takumi
 *   - paimonmoe : PaimonMoe GitHub events.js（英文，国际服时间，纯前端可直拉）
 *
 * 统一输出：{ events: [{ name, category, start, end, source, url }], note: string }
 * 时间格式：YYYY-MM-DD HH:mm
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HTTP_TIMEOUT_MS = 15000;

/** 米哈游各游戏官方公告接口配置（国服） */
const MIHOYO_GAMES = {
  genshin: {
    host: "hk4e-ann-api.mihoyo.com",
    biz: "hk4e_cn",
    game: "hk4e",
    region: "cn_gf01",
    level: 55,
    detailHost: "webstatic.mihoyo.com/hk4e/announcement/index.html"
  },
  starrail: {
    host: "hkrpg-ann-api.mihoyo.com",
    biz: "hkrpg_cn",
    game: "hkrpg",
    region: "prod_gf_cn",
    level: 70,
    detailHost: "webstatic.mihoyo.com/hkrpg/announcement/index.html"
  },
  zzz: {
    host: "announcement-api.mihoyo.com",
    biz: "nap_cn",
    game: "nap",
    region: "prod_gf_cn",
    level: 60,
    detailHost: "announcement.mihoyo.com/nap/index.html"
  }
};

const GAME_NAMES_CN = {
  genshin: "原神",
  starrail: "崩坏：星穹铁道",
  zzz: "绝区零",
  bh3: "崩坏3"
};

/** 各游戏的官方公告中心首页（浏览器可打开，用作 url 的稳定 fallback） */
const GAME_HOMEPAGES = {
  genshin:  "https://ys.mihoyo.com/main/news/?type=1",
  starrail: "https://sr.mihoyo.com/news",
  zzz:      "https://zzz.mihoyo.com/main/news",
  bh3:      "https://www.miyoushe.com/bh3/"
};

function stripHtml(s) {
  return String(s == null ? "" : s)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }

function fmtTime(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!m) return String(s);
  return `${m[1]}-${pad(+m[2])}-${pad(+m[3])} ${pad(+m[4])}:${pad(+m[5])}`;
}

function fmtFromUnix(sec) {
  if (!sec || +sec <= 0) return "";
  const d = new Date(+sec * 1000);
  return fmtTime(
    `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`
  );
}

async function httpJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": DEFAULT_UA, Accept: "application/json,*/*", ...(headers || {}) }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 300)}`);
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`非 JSON 响应：${text.slice(0, 300)}`); }
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`请求超时（>${HTTP_TIMEOUT_MS / 1000}s）：${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function httpText(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": DEFAULT_UA, ...(headers || {}) }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`请求超时（>${HTTP_TIMEOUT_MS / 1000}s）：${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把官方公告原始项归一化为 { name, category, start, end, source, url, raw }
 * 分类规则（侧重前端时间轴可读性）：
 *   tag_label=扭蛋 + 标题含「神铸/赋形/武器」     → 武器池
 *   tag_label=扭蛋 + 其它                          → 角色池
 *   type_label=活动公告                            → 活动
 *   type_label=游戏公告 / 千星奇域 / 其它          → 原 type_label
 */
function classifyMihoyoItem(it, gameKey) {
  const tag = (it.tag_label || "").trim();
  const type = (it.type_label || "").trim();
  const title = stripHtml(it.title) + " " + stripHtml(it.subtitle);

  if (tag === "扭蛋") {
    if (/神铸|赋形|武器|光锥|音擎/.test(title)) return "武器池";
    return "角色池";
  }
  if (type === "活动公告") return "活动";
  if (type === "游戏公告") return "游戏公告";
  return type || "活动";
}

function buildDetailUrl(gameCfg, annId) {
  if (!annId) return "";
  return `https://${gameCfg.detailHost}?ann_id=${annId}&game=${gameCfg.game}&game_biz=${gameCfg.biz}&lang=zh-cn`;
}

/** 抓取米哈游官方公告并归一化 */
export async function fetchMihoyoOfficial(gameKey, options = {}) {
  const cfg = MIHOYO_GAMES[gameKey];
  if (!cfg) throw new Error(`未知 game: ${gameKey}（支持：${Object.keys(MIHOYO_GAMES).join(", ")}）`);

  const u = `https://${cfg.host}/common/${cfg.biz}/announcement/api/getAnnList` +
            `?game=${cfg.game}&game_biz=${cfg.biz}&lang=zh-cn&bundle_id=${cfg.biz}` +
            `&platform=pc&region=${cfg.region}&level=${cfg.level}&uid=100000000`;

  const j = await httpJson(u, { Referer: `https://${cfg.host}/` });
  if (j.retcode !== 0) throw new Error(`接口错误 retcode=${j.retcode} ${j.message || ""}`);

  const groups = (j.data && j.data.list) || [];
  const raw = [];
  for (const g of groups) {
    const sub = (g && g.list) || [];
    for (const it of sub) raw.push(it);
  }

  const maxKeepDays = Math.max(1, options.maxKeepDays || 200);
  const sourceLabel = `${GAME_NAMES_CN[gameKey] || gameKey} · 米哈游官网公告`;

  const homepage = GAME_HOMEPAGES[gameKey] || "";

  const events = raw
    .map((it) => {
      const start = fmtTime(it.start_time);
      const end = fmtTime(it.end_time);
      const ms = (Date.parse(end.replace(" ", "T")) || 0) - (Date.parse(start.replace(" ", "T")) || 0);
      const days = ms / 86400000;
      const cleanTitle = stripHtml(it.title) || stripHtml(it.subtitle) || "(无标题)";
      const cleanSubtitle = stripHtml(it.subtitle);
      return {
        name: cleanTitle,
        category: classifyMihoyoItem(it, gameKey),
        start,
        end,
        source: sourceLabel,
        url: homepage,
        detailUrl: buildDetailUrl(cfg, it.ann_id),
        image: it.banner || "",
        desc: cleanSubtitle && cleanSubtitle !== cleanTitle ? cleanSubtitle : "",
        _days: days
      };
    })
    .filter((e) => e.start && e.end && e._days > 0 && e._days <= maxKeepDays)
    .map((e) => { delete e._days; return e; });

  events.sort((a, b) => a.start.localeCompare(b.start));

  return {
    name: GAME_NAMES_CN[gameKey] || gameKey,
    note: `从 ${cfg.host} 拉取，过滤 >${maxKeepDays} 天的长期公告；最后更新 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    homepage,
    events
  };
}

/** 简易解析 PaimonMoe 的 events.js（非严格 JS）→ 普通对象数组 */
function parsePaimonMoeJs(src) {
  const startIdx = src.indexOf("[");
  if (startIdx < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const arrSrc = src.slice(startIdx, end + 1);

  const items = [];
  const objRe = /\{([\s\S]*?)\},?/g;
  let m;
  while ((m = objRe.exec(arrSrc)) !== null) {
    const body = m[1];
    const obj = {};
    const fieldRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,\n}]+))/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      const key = fm[1];
      const val = fm[2] != null ? fm[2] : fm[3] != null ? fm[3] : (fm[4] || "").trim();
      obj[key] = val;
    }
    if (obj.name && obj.start && obj.end) items.push(obj);
  }
  return items;
}

/** 抓 PaimonMoe events.js（国际服英文活动数据） */
export async function fetchPaimonMoeGenshin() {
  const url = "https://raw.githubusercontent.com/MadeBaruna/paimon-moe/main/src/data/events.js";
  const src = await httpText(url);
  const items = parsePaimonMoeJs(src);

  const events = items.map((it) => ({
    name: it.name,
    category: "活动",
    start: fmtTime(it.start),
    end: fmtTime(it.end),
    source: "PaimonMoe (GitHub)",
    url: it.url || "https://paimon.moe/timeline"
  })).filter((e) => e.start && e.end);

  events.sort((a, b) => a.start.localeCompare(b.start));

  return {
    name: "原神（国际服 · PaimonMoe）",
    note: `从 PaimonMoe 仓库解析 ${events.length} 条；时间以国际服为准；最后更新 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    homepage: "https://paimon.moe/timeline",
    events
  };
}

/** 崩坏3：米游社官方资讯（无 getAnnList，走 api-takumi） */
const BH3_NEWS_API = "https://api-takumi.miyoushe.com/post/wapi/getNewsList";
const BH3_TYPE_LABEL = { 1: "公告", 2: "活动", 3: "资讯" };
const CN_OFFSET_MS = 8 * 3600000;

/** 国服周常/周期玩法刷新规则（按固定时间点推算，非公告 API） */
const BH3_WEEKLY_MON0400 = [
  { id: "tuojing", name: "拓境战幕 · 本周挑战", source: "游戏内 · 拓境战幕", desc: "周常挑战，周一 04:00 重置关卡与奖励" },
  { id: "mirage", name: "万象虚境 · 本周挑战", source: "游戏内 · 万象虚境", desc: "周一 04:00 发放虚境挑战书并刷新周常" },
  { id: "elysian", name: "往事乐土 · 周常奖励", source: "游戏内 · 往事乐土", desc: "周一 04:00 刷新每周奖励进度" },
  { id: "quest", name: "历练任务 · 本周", source: "游戏内 · 历练", desc: "周一 04:00 刷新周常历练任务" }
];

function cnParts(d) {
  const t = d.getTime() + CN_OFFSET_MS;
  const x = new Date(t);
  const dow = x.getUTCDay();
  return {
    y: x.getUTCFullYear(),
    mo: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
    h: x.getUTCHours(),
    min: x.getUTCMinutes(),
    dow: dow === 0 ? 7 : dow
  };
}

function cnMake(y, mo, d, h, min) {
  return new Date(Date.UTC(y, mo - 1, d, h - 8, min, 0));
}

function cnFmt(d) {
  const p = cnParts(d);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`;
}

function cnAddDays(y, mo, d, delta) {
  const base = cnMake(y, mo, d, 12, 0);
  base.setUTCDate(base.getUTCDate() + delta);
  return cnParts(base);
}

/** 生成崩坏3游戏内周期活动（国服 UTC+8） */
export function generateBh3PeriodicEvents(options = {}) {
  const anchor = options.now ? new Date(options.now) : new Date();
  const backDays = Math.max(7, options.backDays || 45);
  const fwdDays = Math.max(14, options.fwdDays || 90);
  const ap = cnParts(anchor);
  const fromP = cnAddDays(ap.y, ap.mo, ap.d, -backDays);
  const toP = cnAddDays(ap.y, ap.mo, ap.d, fwdDays);
  const from = cnMake(fromP.y, fromP.mo, fromP.d, 0, 0);
  const to = cnMake(toP.y, toP.mo, toP.d, 23, 59);

  const events = [];
  const homepage = GAME_HOMEPAGES.bh3;

  for (const cfg of BH3_WEEKLY_MON0400) {
    let cur = cnMake(cnParts(from).y, cnParts(from).mo, cnParts(from).d, 4, 0);
    while (cnParts(cur).dow !== 1) cur.setUTCDate(cur.getUTCDate() + 1);
    cur = cnMake(cnParts(cur).y, cnParts(cur).mo, cnParts(cur).d, 4, 0);
    if (cur < from) cur.setUTCDate(cur.getUTCDate() + 7);

    while (cur <= to) {
      const p = cnParts(cur);
      const endP = cnAddDays(p.y, p.mo, p.d, 7);
      const end = cnMake(endP.y, endP.mo, endP.d, 3, 59);
      if (cur <= to && end >= from) {
        events.push({
          name: cfg.name,
          category: "周期",
          start: cnFmt(cur),
          end: cnFmt(end),
          source: cfg.source,
          url: homepage,
          desc: cfg.desc
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 7);
      cur = cnMake(cnParts(cur).y, cnParts(cur).mo, cnParts(cur).d, 4, 0);
    }
  }

  let day = cnMake(cnParts(from).y, cnParts(from).mo, cnParts(from).d, 12, 0);
  day.setUTCDate(day.getUTCDate() - 7);
  const endDay = cnMake(cnParts(to).y, cnParts(to).mo, cnParts(to).d, 12, 0);
  endDay.setUTCDate(endDay.getUTCDate() + 7);

  while (day <= endDay) {
    const p = cnParts(day);
    if (p.dow === 1 || p.dow === 4) {
      const start = cnMake(p.y, p.mo, p.d, 15, 0);
      const dur = p.dow === 1 ? 3 : 4;
      const endP = cnAddDays(p.y, p.mo, p.d, dur);
      const end = cnMake(endP.y, endP.mo, endP.d, 14, 59);
      if (start <= to && end >= from) {
        events.push({
          name: `超弦空间 · ${p.dow === 1 ? "周一档" : "周四档"}`,
          category: "周期",
          start: cnFmt(start),
          end: cnFmt(end),
          source: "游戏内 · 超弦空间",
          url: homepage,
          desc: "高危区/边缘区周期榜单，周一、周四 15:00 结算刷新"
        });
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

function classifyBh3Subject(subject, type) {
  const s = stripHtml(subject);
  if (/扩充补给|自选.*补给|人物补给|角色补给/.test(s)) return "角色池";
  if (/精准补给|武器补给|圣痕补给|装备补给/.test(s)) return "武器池";
  if (type === 2) return "活动";
  if (type === 1) return "公告";
  return "资讯";
}

async function fetchBh3NewsPage(type, page, pageSize) {
  const u = `${BH3_NEWS_API}?gids=1&page_size=${pageSize}&page=${page}&type=${type}`;
  const j = await httpJson(u, { Referer: "https://www.miyoushe.com/bh3/" });
  if (j.retcode !== 0) throw new Error(`米游社接口错误 retcode=${j.retcode} ${j.message || ""}`);
  return (j.data && j.data.list) || [];
}

export async function fetchBh3Miyoushe(options = {}) {
  const maxPages = Math.min(5, Math.max(1, options.maxPages || 3));
  const pageSize = 20;
  const maxKeepDays = Math.max(1, options.maxKeepDays || 200);
  const homepage = GAME_HOMEPAGES.bh3;
  const sourceLabel = "崩坏3 · 米游社官方资讯";
  const raw = [];

  for (const type of [2, 1, 3]) {
    for (let page = 1; page <= maxPages; page++) {
      const list = await fetchBh3NewsPage(type, page, pageSize);
      if (!list.length) break;
      for (const item of list) raw.push({ item, type });
      if (list.length < pageSize) break;
    }
  }

  const events = [];
  const seen = new Set();

  for (const { item, type } of raw) {
    const post = item.post || {};
    const postId = post.post_id;
    if (!postId || seen.has(postId)) continue;
    seen.add(postId);

    const meta = item.news_meta || {};
    const startSec = +meta.start_at_sec || +post.created_at || 0;
    let endSec = +meta.end_at_sec || 0;
    if (!endSec && startSec) {
      const defaultDays = type === 2 ? 14 : type === 1 ? 3 : 7;
      endSec = startSec + defaultDays * 86400;
    }
    if (!startSec || !endSec || endSec <= startSec) continue;

    const days = (endSec - startSec) / 86400;
    if (days > maxKeepDays) continue;

    const name = stripHtml(post.subject) || "(无标题)";
    const image =
      (post.images && post.images[0]) ||
      (item.image_list && item.image_list[0] && item.image_list[0].url) ||
      "";
    const detailUrl = `https://www.miyoushe.com/bh3/article/${postId}`;

    events.push({
      name,
      category: classifyBh3Subject(name, type),
      start: fmtFromUnix(startSec),
      end: fmtFromUnix(endSec),
      source: sourceLabel,
      url: homepage,
      detailUrl,
      image,
      desc: BH3_TYPE_LABEL[type] || ""
    });
  }

  events.sort((a, b) => a.start.localeCompare(b.start));

  const periodic = generateBh3PeriodicEvents(options);
  const merged = [...events, ...periodic];
  merged.sort((a, b) => a.start.localeCompare(b.start));

  return {
    name: GAME_NAMES_CN.bh3,
    note: `从 api-takumi.miyoushe.com 拉取公告/活动/资讯，并推算 ${periodic.length} 条游戏内周期玩法（超弦空间/拓境战幕/万象虚境等）；最后更新 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    homepage,
    events: merged
  };
}

/** 统一入口 */
export async function fetchEvents(game, source, options) {
  if (source === "paimonmoe") {
    if (game !== "genshin") throw new Error("paimonmoe 源只支持 game=genshin");
    return fetchPaimonMoeGenshin();
  }
  if (source === "official" || !source) {
    if (game === "bh3") return fetchBh3Miyoushe(options);
    return fetchMihoyoOfficial(game, options);
  }
  throw new Error(`未知 source: ${source}（支持：official, paimonmoe）`);
}

export const SUPPORTED = {
  games: [...Object.keys(MIHOYO_GAMES), "bh3"],
  sources: ["official", "paimonmoe"]
};
