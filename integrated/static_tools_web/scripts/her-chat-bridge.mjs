/**
 * 她自己聊天桥接：读取 .cursor/skills/{slug} 人格，转发到 OpenAI 兼容接口。
 *
 * 启动：node scripts/her-chat-bridge.mjs
 * 默认：http://127.0.0.1:45791
 * 环境变量：HER_CHAT_PORT
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, ".cursor", "skills");
const SKIP_SLUGS = new Set(["herself-skill", "_tmp_nian_nian"]);

const PORT = Math.min(65535, Math.max(1024, parseInt(process.env.HER_CHAT_PORT || "45791", 10) || 45791));

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("---", 3);
  if (end < 0) return text;
  return text.slice(end + 3).trim();
}

function listHers() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const out = [];
  for (const slug of fs.readdirSync(SKILLS_DIR)) {
    if (SKIP_SLUGS.has(slug)) continue;
    const metaPath = path.join(SKILLS_DIR, slug, "meta.json");
    const skillPath = path.join(SKILLS_DIR, slug, "SKILL.md");
    if (!fs.existsSync(metaPath) || !fs.existsSync(skillPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      out.push({ slug, name: meta.name || slug });
    } catch {
      out.push({ slug, name: slug });
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function loadSystemPrompt(slug) {
  const safe = String(slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe || safe !== slug) throw new Error("无效的 slug");
  const skillPath = path.join(SKILLS_DIR, safe, "SKILL.md");
  if (!fs.existsSync(skillPath)) throw new Error("未找到 " + safe + " 的 SKILL.md，请先在 Cursor 创建她");
  let text = fs.readFileSync(skillPath, "utf8");
  text = stripFrontmatter(text);
  const extra =
    "\n\n【网页聊天模式】你是" +
    (JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, safe, "meta.json"), "utf8")).name || safe) +
    "。用 PART B 的说话方式回复，短句、口语，不要像 AI 助手。不要输出 markdown 标题或列表，除非用户在问技术问题。";
  if (text.length > 26000) text = text.slice(0, 26000) + "\n…(人格文件已截断)";
  return text + extra;
}

function validateProviderMatch(model, baseUrl) {
  const m = String(model || "").toLowerCase();
  const u = String(baseUrl || "").toLowerCase();
  if (/deepseek/.test(m) && /openai\.com/.test(u)) {
    throw new Error(
      "模型是 DeepSeek（" +
        model +
        "），但 API 地址仍是 OpenAI。\n请把 API 地址改为：https://api.deepseek.com/v1"
    );
  }
  if (/^gpt-|^o\d|^text-/.test(m) && /deepseek\.com/.test(u)) {
    throw new Error("模型像 OpenAI，但地址是 DeepSeek，请改模型为 gpt-4o-mini 或改回 OpenAI 地址。");
  }
}

function validateApiKey(apiKey, baseUrl) {
  const key = String(apiKey || "").trim();
  if (/^crsr_/i.test(key)) {
    throw new Error(
      "Key 以 crsr_ 开头，是 Cursor 编辑器专用，不能在本工具里对接 OpenAI。\n" +
        "请改用 OpenAI / DeepSeek / 智谱 等平台的 Key；或本地 Ollama（地址 http://127.0.0.1:11434/v1，Key 填 ollama）。"
    );
  }
  if (/^sk-ant-/i.test(key) && /openai\.com/i.test(baseUrl)) {
    throw new Error("Claude 的 Key 不能填在 OpenAI 地址下，请改 API 地址为 Anthropic 兼容网关或对应平台。");
  }
}

async function chatCompletion({ baseUrl, apiKey, model, messages, system }) {
  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  validateProviderMatch(model, root);
  validateApiKey(apiKey, root);
  const url = root + "/chat/completions";
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.88,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    const cause = e && e.cause ? String(e.cause.message || e.cause.code || e.cause) : "";
    let hint = "请检查：API 地址是否与 Key 匹配；国内访问 OpenAI 常需代理。";
    if (/openai\.com/i.test(root)) {
      hint += " 也可改用 DeepSeek：https://api.deepseek.com/v1 ，模型 deepseek-chat。";
    }
    if (/ollama|11434/i.test(root)) {
      hint = "请确认已运行 ollama serve，且模型名与本地一致（如 llama3）。";
    }
    throw new Error(
      "无法连接大模型（" + root + "）：" + (e.message || e) + (cause ? "；" + cause : "") + "\n" + hint
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.message || JSON.stringify(data).slice(0, 400);
    if (/insufficient balance/i.test(msg)) {
      throw new Error(
        "DeepSeek 账户余额不足。请到 https://platform.deepseek.com 充值，或更换有余额的 API Key。"
      );
    }
    throw new Error((msg || "API 请求失败 HTTP " + res.status) + "（" + root + "）");
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("API 未返回内容");
  return content;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && req.url === "/api/her-list") {
    sendJson(res, 200, { ok: true, data: listHers() });
    return;
  }

  if (req.method === "POST" && req.url === "/api/her-chat") {
    readJsonBody(req)
      .then(async (body) => {
        const slug = String(body.slug || "nian-nian").trim();
        const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || "").trim();
        const baseUrl = String(body.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
        const model = String(body.model || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!apiKey) {
          sendJson(res, 400, { ok: false, error: "缺少 API Key（页面填写或设置环境变量 OPENAI_API_KEY）" });
          return;
        }
        if (!messages.length) {
          sendJson(res, 400, { ok: false, error: "messages 为空" });
          return;
        }
        const system = loadSystemPrompt(slug);
        const reply = await chatCompletion({ baseUrl, apiKey, model, messages, system });
        sendJson(res, 200, { ok: true, reply });
      })
      .catch((e) => sendJson(res, 400, { ok: false, error: String(e.message || e) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已被占用（her-chat-bridge 可能已在运行）。`);
    console.error("处理：关闭标题为 her-chat-bridge 的旧窗口，或只保留一个桥接进程。");
    console.error("不必重复运行 启动工具小站.bat；若桥接已在跑，可直接用网页聊天。\n");
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`her-chat-bridge 已监听 http://127.0.0.1:${PORT}`);
  console.error("支持：GET /api/her-list  POST /api/her-chat");
  const hers = listHers();
  if (hers.length) console.error("已发现：", hers.map((h) => h.slug).join(", "));
  else console.error("提示：.cursor/skills/ 下暂无已创建的她（需 meta.json + SKILL.md）");
});
