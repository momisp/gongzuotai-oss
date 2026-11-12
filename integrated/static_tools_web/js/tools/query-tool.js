function renderQueryTool(container) {
  container.innerHTML =
    "<h2>Query 解析 / 拼装</h2>" +
    "<p>上方：查询串 → 键值表；下方：JSON 对象 → 查询串</p>" +
    "<h3>查询串 → 键值</h3>" +
    '<textarea id="queryStr" placeholder="a=1&b=2&b=3"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="parseQuery()">解析</button>' +
    "</div>" +
    "<h3>JSON → 查询串</h3>" +
    '<textarea id="queryJson" placeholder=\'{"x":1,"y":"hello"}\'></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="buildQuery()">拼装</button>' +
    '<button type="button" onclick="clearQuery()">清空</button>' +
    "</div>" +
    '<pre id="queryOutput" class="output"></pre>';
}

function parseQuery() {
  const el = document.getElementById("queryStr");
  const out = document.getElementById("queryOutput");
  if (!el || !out) return;
  const raw = el.value.trim();
  if (!raw) {
    out.textContent = "请输入查询串";
    return;
  }
  const qs = raw.startsWith("?") ? raw.slice(1) : raw;
  const params = new URLSearchParams(qs);
  const obj = {};
  for (const [k, v] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
      obj[k].push(v);
    } else obj[k] = v;
  }
  out.textContent = JSON.stringify(obj, null, 2);
}

function buildQuery() {
  const el = document.getElementById("queryJson");
  const out = document.getElementById("queryOutput");
  if (!el || !out) return;
  const raw = el.value.trim();
  if (!raw) {
    out.textContent = "请输入 JSON 对象";
    return;
  }
  try {
    const obj = JSON.parse(raw);
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      out.textContent = "需要 JSON 对象（非数组）";
      return;
    }
    const p = new URLSearchParams();
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((item) => p.append(k, String(item)));
      else p.set(k, String(v));
    }
    out.textContent = p.toString();
  } catch (e) {
    out.textContent = "JSON 无效: " + (e.message || e);
  }
}

function clearQuery() {
  const a = document.getElementById("queryStr");
  const b = document.getElementById("queryJson");
  const o = document.getElementById("queryOutput");
  if (a) a.value = "";
  if (b) b.value = "";
  if (o) o.textContent = "";
}
