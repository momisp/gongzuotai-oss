/**
 * 本机桥接：供静态网页一键拉取游戏活动（绕过浏览器 CORS）。
 *
 * 启动：node scripts/game-events-bridge.mjs
 * 默认端口：45791（可用 GAME_EVENTS_PORT 覆盖）
 *
 * 接口：
 *   GET /health                         → "ok"
 *   GET /api/events?game=genshin&source=official
 *
 * 前端在「游戏活动时间轴」工具里点「从本机桥接拉取」即可调用。
 */

import http from "http";
import { fetchEvents, SUPPORTED } from "./game-events-core.mjs";

const PORT = Math.min(65535, Math.max(1024, parseInt(process.env.GAME_EVENTS_PORT || "45791", 10) || 45791));

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...corsHeaders()
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const game = (url.searchParams.get("game") || "").trim();
    const source = (url.searchParams.get("source") || "official").trim();
    try {
      if (!SUPPORTED.games.includes(game)) {
        sendJson(res, 400, { ok: false, error: `未知 game: ${game}（支持：${SUPPORTED.games.join(", ")}）` });
        return;
      }
      if (!SUPPORTED.sources.includes(source)) {
        sendJson(res, 400, { ok: false, error: `未知 source: ${source}（支持：${SUPPORTED.sources.join(", ")}）` });
        return;
      }
      const pack = await fetchEvents(game, source);
      sendJson(res, 200, { ok: true, data: pack });
    } catch (e) {
      sendJson(res, 502, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`game-events-bridge 已监听 http://127.0.0.1:${PORT}`);
  console.error("打开网页「游戏活动时间轴」工具，点击「从本机桥接拉取」即可。");
});
