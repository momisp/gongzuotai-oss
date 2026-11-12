/**
 * B 站 feed/all 拉取核心（供 bili-feed.mjs CLI 与 bili-bridge.mjs 调用）
 */

import crypto from "crypto";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

function md5Hex(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i])
    .join("")
    .slice(0, 32);
}

export function encWbi(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.round(Date.now() / 1000);
  const chrFilter = /[!'()*]/g;
  const filtered = {};
  for (const k of Object.keys(params)) {
    filtered[k] = String(params[k]).replace(chrFilter, "");
  }
  filtered.wts = String(wts);
  const keys = Object.keys(filtered).sort();
  const query = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`).join("&");
  const wRid = md5Hex(query + mixinKey);
  filtered.w_rid = wRid;
  return filtered;
}

export function toQuery(obj) {
  return Object.keys(obj)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(obj[k]))}`)
    .join("&");
}

function parseKeyFromUrl(u) {
  if (!u) return "";
  const pathPart = u.split("?")[0];
  const name = pathPart.split("/").pop() || "";
  return name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
}

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com/",
  Accept: "application/json, text/plain, */*"
};

export async function httpGet(url, cookie) {
  const res = await fetch(url, {
    headers: { ...defaultHeaders, Cookie: cookie }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function getWbiKeys(cookie) {
  const j = await httpGet("https://api.bilibili.com/x/web-interface/nav", cookie);
  if (!j.data) {
    throw new Error(`nav 无 data：code=${j.code} ${j.message || ""} ${JSON.stringify(j).slice(0, 300)}`);
  }
  const wi = j.data.wbi_img || {};
  const ws = j.data.wbi_sub || {};
  const imgUrl = wi.img_url || wi.url || "";
  const subUrl = wi.sub_url || ws.sub_url || ws.url || "";
  const imgKey = parseKeyFromUrl(imgUrl);
  const subKey = parseKeyFromUrl(subUrl);
  if (!imgKey || !subKey) {
    const hint = JSON.stringify(j.data).slice(0, 400);
    throw new Error(
      "无法从 nav 解析 WBI 密钥（需 data.wbi_img.img_url 与 data.wbi_img.sub_url）。\n当前 data 片段：" + hint
    );
  }
  return { imgKey, subKey };
}

async function fetchFeedPage(cookie, keys, offset) {
  const params = {
    type: "all",
    timezone_offset: "-480",
    platform: "web",
    features: "itemOpusStyle,listOnlyfans,opusBigCover,decorationCard,onlyfans_vote,ugcDelete,onlyfansQaCard",
    web_location: "333.1365"
  };
  if (offset) params.offset = offset;
  const signed = encWbi(params, keys.imgKey, keys.subKey);
  const qs = toQuery(signed);
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?${qs}`;
  return httpGet(url, cookie);
}

/**
 * @param {string} cookie - 浏览器 Cookie 整段
 * @param {number} maxPages - 最大翻页次数
 */
export async function fetchMergedFeed(cookie, maxPages = 25) {
  const c = String(cookie || "").trim();
  if (!c) throw new Error("缺少 Cookie");

  const keys = await getWbiKeys(c);
  const all = [];
  let offset = "";
  let pages = 0;

  while (pages < maxPages) {
    pages++;
    const j = await fetchFeedPage(c, keys, offset);
    if (j.code === -101) throw new Error("未登录：Cookie 无效或缺少 SESSDATA");
    if (j.code !== 0) throw new Error(j.message || `接口错误 code=${j.code}`);
    if (j.data && j.data.v_voucher) {
      throw new Error("触发风控(v_voucher)，请稍后再试或更换网络后重新复制 Cookie");
    }

    const items = (j.data && j.data.items) || [];
    all.push(...items);

    const more = j.data && j.data.has_more;
    const nextOff = j.data && j.data.offset;
    offset = nextOff != null && nextOff !== "" ? String(nextOff) : "";
    if (!more || !offset) break;
  }

  return {
    code: 0,
    message: "0",
    data: {
      items: all,
      has_more: false,
      note: "merged_by_scripts/bili-feed-core.mjs"
    }
  };
}
