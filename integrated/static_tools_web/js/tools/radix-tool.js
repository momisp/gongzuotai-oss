function renderRadixTool(container) {
  container.innerHTML =
    "<h2>进制转换</h2>" +
    "<p>整数在 2–36 进制之间互转（字母大小写不敏感）</p>" +
    '<div class="input-group"><label for="radixInput">数值字符串</label>' +
    '<input type="text" id="radixInput" placeholder="FF 或 1010" /></div>' +
    '<div class="input-group"><label for="radixFrom">原进制</label>' +
    '<input type="number" id="radixFrom" value="16" min="2" max="36" step="1" /></div>' +
    '<div class="input-group"><label for="radixTo">目标进制</label>' +
    '<input type="number" id="radixTo" value="10" min="2" max="36" step="1" /></div>' +
    '<div class="button-group">' +
    '<button type="button" onclick="convertRadix()">转换</button>' +
    '<button type="button" onclick="clearRadix()">清空</button>' +
    "</div>" +
    '<pre id="radixOutput" class="output"></pre>';
}

function convertRadix() {
  const vEl = document.getElementById("radixInput");
  const fEl = document.getElementById("radixFrom");
  const tEl = document.getElementById("radixTo");
  const out = document.getElementById("radixOutput");
  if (!vEl || !fEl || !tEl || !out) return;
  const from = Math.min(36, Math.max(2, Math.floor(Number(fEl.value)) || 2));
  const to = Math.min(36, Math.max(2, Math.floor(Number(tEl.value)) || 2));
  const str = vEl.value.trim();
  if (!str) {
    out.textContent = "请输入数值";
    return;
  }
  const n = parseInt(str.replace(/\s+/g, ""), from);
  if (!Number.isFinite(n)) {
    out.textContent = "无法按原进制解析";
    return;
  }
  out.textContent = n.toString(to).toUpperCase();
}

function clearRadix() {
  const out = document.getElementById("radixOutput");
  const v = document.getElementById("radixInput");
  if (v) v.value = "";
  if (out) out.textContent = "";
}
