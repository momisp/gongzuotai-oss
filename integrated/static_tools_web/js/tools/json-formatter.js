function renderJsonTool(container) {
  container.innerHTML =
    "<h2>JSON 格式化</h2>" +
    "<p>输入 JSON 字符串，支持格式化或压缩</p>" +
    '<textarea id="jsonInput" placeholder=\'例如: {"a":1,"b":[2,3]}\'></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="formatJSON()">格式化</button>' +
    '<button type="button" onclick="minifyJSON()">压缩</button>' +
    '<button type="button" onclick="clearJSON()">清空</button>' +
    "</div>" +
    '<pre id="jsonOutput" class="output"></pre>';
}

function formatJSON() {
  const inputEl = document.getElementById("jsonInput");
  const outEl = document.getElementById("jsonOutput");
  if (!inputEl || !outEl) return;
  const input = inputEl.value.trim();
  if (!input) {
    outEl.textContent = "请输入 JSON 内容";
    return;
  }
  try {
    const obj = JSON.parse(input);
    outEl.textContent = JSON.stringify(obj, null, 2);
  } catch (e) {
    outEl.textContent = "格式错误: " + (e && e.message ? e.message : String(e));
  }
}

function minifyJSON() {
  const inputEl = document.getElementById("jsonInput");
  const outEl = document.getElementById("jsonOutput");
  if (!inputEl || !outEl) return;
  const input = inputEl.value.trim();
  if (!input) {
    outEl.textContent = "请输入 JSON 内容";
    return;
  }
  try {
    const obj = JSON.parse(input);
    outEl.textContent = JSON.stringify(obj);
  } catch (e) {
    outEl.textContent = "格式错误: " + (e && e.message ? e.message : String(e));
  }
}

function clearJSON() {
  const inputEl = document.getElementById("jsonInput");
  const outEl = document.getElementById("jsonOutput");
  if (inputEl) inputEl.value = "";
  if (outEl) outEl.textContent = "";
}
