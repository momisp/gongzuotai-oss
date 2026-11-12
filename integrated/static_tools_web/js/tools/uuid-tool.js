function renderUuidTool(container) {
  container.innerHTML =
    "<h2>UUID 生成</h2>" +
    "<p>使用 crypto.randomUUID()（需安全上下文：HTTPS 或 localhost）</p>" +
    '<div class="input-group"><label for="uuidCount">生成条数</label>' +
    '<input type="number" id="uuidCount" value="5" min="1" max="100" step="1" /></div>' +
    '<div class="button-group">' +
    '<button type="button" onclick="genUuids()">生成</button>' +
    '<button type="button" onclick="clearUuid()">清空</button>' +
    "</div>" +
    '<pre id="uuidOutput" class="output"></pre>';
}

function genUuids() {
  const nEl = document.getElementById("uuidCount");
  const out = document.getElementById("uuidOutput");
  if (!nEl || !out) return;
  const n = Math.min(100, Math.max(1, Math.floor(Number(nEl.value)) || 1));
  if (!crypto.randomUUID) {
    out.textContent = "当前浏览器不支持 randomUUID";
    return;
  }
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(crypto.randomUUID());
  out.textContent = lines.join("\n");
}

function clearUuid() {
  const out = document.getElementById("uuidOutput");
  if (out) out.textContent = "";
}
