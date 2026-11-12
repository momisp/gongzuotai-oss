function renderCronTool(container) {
  container.innerHTML =
    "<h2>Cron 说明</h2>" +
    "<p>标准 5 段：分 时 日 月 周；兼容 6 段（秒开头）时自动忽略秒段再解析</p>" +
    '<input type="text" id="cronInput" placeholder="0 9 * * 1-5" />' +
    '<div class="button-group">' +
    '<button type="button" onclick="explainCron()">解析说明</button>' +
    '<button type="button" onclick="clearCron()">清空</button>' +
    "</div>" +
    '<pre id="cronOutput" class="output"></pre>';
}

function describeField(name, v) {
  const t = v.trim();
  if (t === "*") return name + ": 任意";
  if (t === "?") return name + ": 不指定（部分系统用于日/周）";
  if (t.includes("/")) return name + ": 步长 " + t;
  if (t.includes("-")) return name + ": 范围 " + t;
  if (t.includes(",")) return name + ": 列举 " + t;
  return name + ": " + t;
}

function explainCron() {
  const el = document.getElementById("cronInput");
  const out = document.getElementById("cronOutput");
  if (!el || !out) return;
  let parts = el.value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 6) parts = parts.slice(1);
  if (parts.length !== 5) {
    out.textContent = "需要 5 个字段（或 6 段以秒开头）";
    return;
  }
  const names = ["分钟 (0-59)", "小时 (0-23)", "日 (1-31)", "月 (1-12 或名称)", "周 (0-7, 0/7=日)"];
  const lines = parts.map((p, i) => describeField(names[i], p));
  lines.push("", "提示：不同系统对 ?、周字段、第 6 段支持不同，部署前请在目标环境验证。");
  out.textContent = lines.join("\n");
}

function clearCron() {
  const el = document.getElementById("cronInput");
  const out = document.getElementById("cronOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
