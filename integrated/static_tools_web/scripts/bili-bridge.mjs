/**
 * 本机桥接：供静态网页把 Cookie POST 过来，在 Node 里调用 B 站接口（浏览器无法代发 Cookie）。
 *
 * 启动：node scripts/bili-bridge.mjs
 * 默认：http://127.0.0.1:45790
 * 环境变量：BILI_BRIDGE_PORT
 */

import http from "http";
import { fetchMergedFeed } from "./bili-feed-core.mjs";
import { fetchVideoComments, fetchRankingComments } from "./bili-comments-core.mjs";

const PORT = Math.min(65535, Math.max(1024, parseInt(process.env.BILI_BRIDGE_PORT || "45790", 10) || 45790));

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && (req.url === "/api/bili-feed" || req.url.startsWith("/api/bili-feed?"))) {
    readJsonBody(req)
      .then(async (body) => {
        const cookie = String(body.cookie || "").trim();
        const maxPages = Math.min(100, Math.max(1, parseInt(body.maxPages, 10) || 25));
        if (!cookie) {
          sendJson(res, 400, { ok: false, error: "缺少 cookie 字段" });
          return;
        }
        const pack = await fetchMergedFeed(cookie, maxPages);
        sendJson(res, 200, { ok: true, data: pack });
      })
      .catch((e) => sendJson(res, 400, { ok: false, error: String(e.message || e) }));
    return;
  }

  if (req.method === "POST" && (req.url === "/api/bili-comments" || req.url.startsWith("/api/bili-comments?"))) {
    readJsonBody(req)
      .then(async (body) => {
        const cookie = String(body.cookie || "").trim();
        const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : [];
        const maxPagesPerVideo = Math.min(20, Math.max(1, parseInt(body.maxPagesPerVideo, 10) || 5));
        const mode = parseInt(body.mode, 10) || 3;
        const source = String(body.source || (videos.length ? "manual" : "ranking")).trim();
        const rid = parseInt(body.rid, 10);
        const rankLimit = Math.min(30, Math.max(1, parseInt(body.rankLimit, 10) || 8));

        if (!cookie) {
          sendJson(res, 400, { ok: false, error: "缺少 cookie 字段" });
          return;
        }

        let pack;
        if (source === "manual") {
          if (!videos.length) {
            sendJson(res, 400, { ok: false, error: "manual 模式需提供 videos 数组" });
            return;
          }
          pack = await fetchVideoComments(cookie, videos, { maxPagesPerVideo, mode });
          pack.source = "manual";
        } else {
          pack = await fetchRankingComments(cookie, {
            rid: Number.isFinite(rid) ? rid : 0,
            rankLimit,
            maxPagesPerVideo,
            mode,
            extraVideos: videos,
          });
        }
        sendJson(res, 200, { ok: true, data: pack });
      })
      .catch((e) => sendJson(res, 400, { ok: false, error: String(e.message || e) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已被占用（bili-bridge 可能已在运行）。关闭旧窗口即可，不必重复启动。\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`bili-bridge 已监听 http://127.0.0.1:${PORT}`);
  console.error("支持：/api/bili-feed（订阅动态）、/api/bili-comments（视频热评）");
});
