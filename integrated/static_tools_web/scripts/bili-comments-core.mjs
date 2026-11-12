/**
 * B 站视频评论拉取（供 bili-bridge 调用）
 */

import { getWbiKeys, httpGet, encWbi, toQuery } from "./bili-feed-core.mjs";

const BV_RE = /\b(BV[\w]{10})\b/i;
const AV_RE = /\bav(\d+)\b/i;

/** 排行榜分区（主分区 rid） */
export const RANKING_PARTITIONS = [
  { rid: 0, name: "全站" },
  { rid: 5, name: "娱乐" },
  { rid: 160, name: "生活" },
  { rid: 119, name: "鬼畜" },
  { rid: 4, name: "游戏" },
  { rid: 1, name: "动画" },
  { rid: 3, name: "音乐" },
  { rid: 36, name: "科技" },
  { rid: 188, name: "数码" },
  { rid: 181, name: "影视" },
];

export function getRankingPartitionName(rid) {
  const row = RANKING_PARTITIONS.find((p) => p.rid === Number(rid));
  return row ? row.name : `分区${rid}`;
}

/**
 * @param {string} cookie
 * @param {{ rid?: number, limit?: number, type?: string }} opts
 */
export async function fetchRankingVideos(cookie, opts = {}) {
  const rid = Number.isFinite(Number(opts.rid)) ? Number(opts.rid) : 0;
  const limit = Math.min(30, Math.max(1, parseInt(opts.limit, 10) || 8));
  const type = String(opts.type || "all");

  const keys = await getWbiKeys(String(cookie || "").trim());
  const params = {
    rid: String(rid),
    type,
    web_location: "333.934",
  };
  const signed = encWbi(params, keys.imgKey, keys.subKey);
  const url = `https://api.bilibili.com/x/web-interface/ranking/v2?${toQuery(signed)}`;
  const j = await httpGet(url, String(cookie || "").trim());

  if (j.code !== 0) throw new Error(j.message || `排行榜接口错误 code=${j.code}`);

  const list = (j.data && j.data.list) || [];
  if (!list.length) throw new Error("排行榜为空，请稍后重试或换分区");

  return list.slice(0, limit).map((item, idx) => ({
    rank: idx + 1,
    aid: item.aid,
    bvid: item.bvid,
    title: item.title || "",
    author: (item.owner && item.owner.name) || "",
    view: item.stat && item.stat.view,
    danmaku: item.stat && item.stat.danmaku,
    reply: item.stat && item.stat.reply,
  }));
}

/**
 * 从排行榜取视频并拉取热评
 * @param {string} cookie
 * @param {{ rid?: number, rankLimit?: number, maxPagesPerVideo?: number, mode?: number, extraVideos?: string[] }} opts
 */
export async function fetchRankingComments(cookie, opts = {}) {
  const ranking = await fetchRankingVideos(cookie, {
    rid: opts.rid,
    limit: opts.rankLimit,
  });

  const manual = Array.isArray(opts.extraVideos) ? opts.extraVideos : [];
  const videoInputs = ranking.map((v) => v.bvid).concat(manual);

  const pack = await fetchVideoComments(cookie, videoInputs, {
    maxPagesPerVideo: opts.maxPagesPerVideo,
    mode: opts.mode,
  });

  pack.source = "ranking";
  pack.ranking = {
    rid: Number.isFinite(Number(opts.rid)) ? Number(opts.rid) : 0,
    partition: getRankingPartitionName(opts.rid),
    picked: ranking.length,
    videos: ranking,
  };
  return pack;
}

export function parseVideoRef(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const bv = s.match(BV_RE);
  if (bv) return { kind: "bvid", id: bv[1] };
  const av = s.match(AV_RE);
  if (av) return { kind: "aid", id: parseInt(av[1], 10) };
  if (/^BV[\w]{10}$/i.test(s)) return { kind: "bvid", id: s };
  if (/^\d+$/.test(s)) return { kind: "aid", id: parseInt(s, 10) };
  return null;
}

async function resolveVideoMeta(ref, cookie) {
  if (ref.kind === "aid") {
    const j = await httpGet(`https://api.bilibili.com/x/web-interface/view?aid=${ref.id}`, cookie);
    if (j.code !== 0 || !j.data) throw new Error(`无法解析 aid=${ref.id}：${j.message || ""}`);
    return {
      aid: j.data.aid,
      bvid: j.data.bvid,
      title: j.data.title || "",
    };
  }
  const j = await httpGet(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(ref.id)}`, cookie);
  if (j.code !== 0 || !j.data) throw new Error(`无法解析 ${ref.id}：${j.message || ""}`);
  return {
    aid: j.data.aid,
    bvid: j.data.bvid,
    title: j.data.title || "",
  };
}

async function fetchReplyPage(cookie, keys, aid, mode, paginationStr) {
  const params = {
    oid: String(aid),
    type: "1",
    mode: String(mode),
    pagination_str: paginationStr || '{"offset":""}',
    plat: "1",
    web_location: "1315875",
    seek_rpid: "",
  };
  const signed = encWbi(params, keys.imgKey, keys.subKey);
  const url = `https://api.bilibili.com/x/v2/reply/wbi/main?${toQuery(signed)}`;
  return httpGet(url, cookie);
}

function normalizeReply(reply, videoMeta) {
  const content = reply.content || {};
  const msg = String(content.message || "").trim();
  if (!msg) return null;
  return {
    rpid: reply.rpid,
    message: msg,
    like: reply.like || 0,
    replyCount: reply.rcount || 0,
    uname: (reply.member && reply.member.uname) || "",
    mid: (reply.member && reply.member.mid) || 0,
    ctime: reply.ctime || 0,
    videoAid: videoMeta.aid,
    videoBvid: videoMeta.bvid,
    videoTitle: videoMeta.title,
  };
}

/**
 * @param {string} cookie
 * @param {string[]} videoInputs - BV/URL/aid
 * @param {{ maxPagesPerVideo?: number, mode?: number }} opts
 */
export async function fetchVideoComments(cookie, videoInputs, opts = {}) {
  const c = String(cookie || "").trim();
  if (!c) throw new Error("缺少 Cookie");

  const maxPages = Math.min(20, Math.max(1, parseInt(opts.maxPagesPerVideo, 10) || 5));
  const mode = [2, 3, 4].includes(Number(opts.mode)) ? Number(opts.mode) : 3; // 3=热度

  const keys = await getWbiKeys(c);
  const videos = [];
  const comments = [];
  const seen = new Set();

  for (const raw of videoInputs) {
    const ref = parseVideoRef(raw);
    if (!ref) continue;
    const meta = await resolveVideoMeta(ref, c);
    videos.push(meta);

    let paginationStr = '{"offset":""}';
    let pages = 0;

    while (pages < maxPages) {
      pages++;
      const j = await fetchReplyPage(c, keys, meta.aid, mode, paginationStr);
      if (j.code === -101) throw new Error("未登录：Cookie 无效或缺少 SESSDATA");
      if (j.code !== 0) throw new Error(j.message || `评论接口错误 code=${j.code}`);

      const replies = (j.data && j.data.replies) || [];
      for (const r of replies) {
        const row = normalizeReply(r, meta);
        if (!row || seen.has(row.rpid)) continue;
        seen.add(row.rpid);
        comments.push(row);
      }

      const cursor = j.data && j.data.cursor;
      const isEnd = cursor && (cursor.is_end === true || cursor.is_end === 1);
      const next = cursor && cursor.pagination_reply && cursor.pagination_reply.next_offset;
      if (isEnd || !next) break;
      paginationStr = JSON.stringify({ offset: String(next) });
    }
  }

  if (!videos.length) throw new Error("未识别到有效视频链接或 BV 号");

  return {
    videos,
    comments,
    fetchedAt: new Date().toISOString(),
    mode,
    maxPagesPerVideo: maxPages,
  };
}
