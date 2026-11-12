// =============================================================================
// Apifox 前置脚本 · 联运 issuesy 验签（盐 mengchuang，非 game_key）
// 用法：接口 Body 填明文 JSON → 本脚本重算 md5_sign → 写成 raw body
// 环境变量 refreshExtend=1 时，自动刷新 extend 为 毫秒时间戳_xgsdk_1
// =============================================================================

function issuesyMd5Sign(body) {
  var salt = "mengchuang";
  var keys = Object.keys(body || {}).filter(function (k) {
    return k !== "md5_sign";
  });
  keys.sort();
  var raw =
    keys
      .map(function (k) {
        var v = body[k];
        return v === null || v === undefined ? "" : String(v);
      })
      .join("") + salt;
  return CryptoJS.MD5(raw).toString();
}

var raw = String(pm.request.body.raw || "").trim();
if (!raw) {
  throw new Error("Body 请填明文 JSON");
}
var body = JSON.parse(raw);

if (Object.prototype.hasOwnProperty.call(body, "extend")) {
  if (pm.environment.get("refreshExtend") === "1" || !body.extend) {
    body.extend = String(Date.now()) + "_xgsdk_1";
  }
}

delete body.md5_sign;
body.md5_sign = issuesyMd5Sign(body);

pm.request.body.update({
  mode: "raw",
  raw: JSON.stringify(body),
  options: { raw: { language: "json" } },
});
pm.request.headers.upsert({
  key: "Content-Type",
  value: "application/x-www-form-urlencoded",
});

console.log("[issuesy] md5_sign=", body.md5_sign);
console.log("[issuesy] body=", JSON.stringify(body));
