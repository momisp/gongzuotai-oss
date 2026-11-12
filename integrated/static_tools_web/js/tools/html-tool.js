function renderHtmlTool(container) {
  container.innerHTML =
    "<h2>HTML 实体</h2>" +
    "<p>转义后可直接插入 HTML；反转义请仅用于可信内容</p>" +
    '<textarea id="htmlInput" placeholder="输入含 &lt; &amp; 等字符的文本"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="escapeHtmlTool()">转义为实体</button>' +
    '<button type="button" onclick="unescapeHtmlTool()">反转义</button>' +
    '<button type="button" onclick="clearHtmlTool()">清空</button>' +
    "</div>" +
    '<pre id="htmlOutput" class="output"></pre>';
}

function escapeHtmlTool() {
  const el = document.getElementById("htmlInput");
  const out = document.getElementById("htmlOutput");
  if (!el || !out) return;
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  out.textContent = el.value.replace(/[&<>"']/g, (c) => map[c] || c);
}

function unescapeHtmlTool() {
  const el = document.getElementById("htmlInput");
  const out = document.getElementById("htmlOutput");
  if (!el || !out) return;
  const t = document.createElement("textarea");
  t.innerHTML = el.value;
  out.textContent = t.value;
}

function clearHtmlTool() {
  const el = document.getElementById("htmlInput");
  const out = document.getElementById("htmlOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
