// =============================================================================
// Apifox 脚本库 · 游戏 SDK 验签（v2 · 按 game_id 自动取 access_key）
// =============================================================================


// ── 脚本1：游戏SDK-验签并Base64请求（前置 · 整段复制到脚本库） ──

function sdkMd5(text) {
  if (typeof crypto !== "undefined" && crypto.createHash) {
    return crypto.createHash("md5").update(text, "utf8").digest("hex");
  }
  return CryptoJS.MD5(text).toString();
}

function sdkEncryptMd5(data, accessKey) {
  var keys = Object.keys(data || {}).filter(function (k) { return k !== "md5_sign"; });
  keys.sort();
  var raw = keys.map(function (k) {
    var v = data[k];
    return (v === null || v === undefined) ? "" : String(v);
  }).join("") + String(accessKey || "");
  return sdkMd5(raw);
}

function utf8ToBase64(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64");
  }
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str));
}

function readSdkJsonBody() {
  var raw = String(pm.request.body.raw || "").trim();
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { throw new Error("Body 请填明文 JSON"); }
  }
  if (pm.request.body && typeof pm.request.body.toJSON === "function") {
    var j = pm.request.body.toJSON();
    if (j && typeof j === "object") return j;
  }
  throw new Error("Body 为空");
}

function resolveAccessKeyFromEnv(body) {
  var gid = String(body.game_id || pm.environment.get("gameId") || "").trim();
  if (gid) {
    var perGame = pm.environment.get("accessKey_" + gid);
    if (perGame) return { key: String(perGame), gameId: gid, source: "accessKey_" + gid };
    // 有 game_id 时不用全局 accessKey，避免 659 的 key 误用于 433
    return { key: "", gameId: gid, source: "" };
  }
  var common = pm.environment.get("accessKey") || pm.environment.get("gameAccessKey") || "";
  if (common) return { key: String(common), gameId: gid, source: "accessKey" };
  return { key: "", gameId: gid, source: "" };
}

async function fetchAccessKeyFromWorkbench(gameId, bodyRef) {
  var base = pm.environment.get("workbenchUrl") || "http://127.0.0.1:8765";
  var sourceDb = pm.environment.get("sourceDb") || pm.environment.get("source_db") || "lx";
  var url = base.replace(/\/$/, "") + "/api/game-sdk/access-key?game_id="
    + encodeURIComponent(gameId) + "&source_db=" + encodeURIComponent(sourceDb);
  var res = await pm.sendRequest({ url: url, method: "GET" });
  var j = res.json();
  if (!j || !j.ok || !j.accessKey) {
    throw new Error((j && j.error) || "工作台未返回 access_key，请确认 start.bat 已启动");
  }
  if (j.gameName && bodyRef.game_name && String(bodyRef.game_name) !== String(j.gameName)) {
    console.warn("[游戏SDK] game_name 与库不一致，建议改为:", j.gameName);
  }
  if (j.gameAppId && bodyRef.game_appid && String(bodyRef.game_appid) !== String(j.gameAppId)) {
    console.warn("[游戏SDK] game_appid 与库不一致，建议改为:", j.gameAppId);
  }
  pm.environment.set("accessKey_" + gameId, j.accessKey);
  if (j.gameName) pm.environment.set("gameName_" + gameId, j.gameName);
  return { key: j.accessKey, gameId: gameId, source: "workbench", meta: j };
}

(async function () {
  var body = readSdkJsonBody();
  if (pm.environment.get("sdkAutoTimestamp") === "1" || body.t === undefined || body.t === null || body.t === "") {
    body.t = String(Date.now());
  }

  var resolved = resolveAccessKeyFromEnv(body);
  if (!resolved.key) {
    if (!resolved.gameId) throw new Error("Body 缺少 game_id，且环境未配置 accessKey");
    resolved = await fetchAccessKeyFromWorkbench(resolved.gameId, body);
  }

  delete body.md5_sign;
  body.md5_sign = sdkEncryptMd5(body, resolved.key);

  var jsonStr = JSON.stringify(body);
  pm.request.body.update(utf8ToBase64(jsonStr));
  pm.request.headers.upsert({ key: "Content-Type", value: "application/json" });

  var masked = resolved.key.length <= 4 ? "****" : ("****" + resolved.key.slice(-4));
  // 仅打脱敏摘要，避免把 accessKey / 明文 body 打进 Apifox 日志
  console.log("[游戏SDK] game_id:", resolved.gameId, "| accessKey:", masked, "(" + resolved.source + ")");
  console.log("[游戏SDK] md5_sign:", body.md5_sign ? (String(body.md5_sign).slice(0, 6) + "…") : "");
  console.log("[游戏SDK] body_keys:", Object.keys(body).join(","));
})();


// ── 脚本2：游戏SDK-Base64解码响应（后置 · 与 v1 相同，独立复制） ──

/*
function base64ToUtf8(b64) {
  var t = String(b64 || "").trim().replace(/^['"]|['"]$/g, "");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(t, "base64").toString("utf8");
  }
  return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(t));
}

var raw = pm.response.text();
var plain = raw;
try { plain = base64ToUtf8(raw); } catch (e) {}

var data;
try { data = JSON.parse(plain); } catch (e2) {
  console.log("[游戏SDK] 明文:", plain);
  return;
}

console.log("[游戏SDK] 响应:", JSON.stringify(data, null, 2));
if (data.code === 1002) {
  console.error("[游戏SDK] 验签失败：检查 accessKey 是否与 game_id 对应；game_name/game_appid 是否与库一致");
}

if (data.data && typeof data.data === "object") {
  if (data.data.token) pm.environment.set("token", String(data.data.token));
  if (data.data.user_id !== undefined) pm.environment.set("userId", String(data.data.user_id));
  if (data.data.account) pm.environment.set("playerAccount", String(data.data.account));
}
*/
