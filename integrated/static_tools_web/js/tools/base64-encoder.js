function renderBase64Tool(container) {
  container.innerHTML =
    "<h2>Base64 编解码</h2>" +
    "<p>文本与 Base64 字符串互转（支持中文等多字节字符）</p>" +
    '<textarea id="base64Input" placeholder="输入要编码或解码的文本 / Base64"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="encodeBase64()">编码 → Base64</button>' +
    '<button type="button" onclick="decodeBase64()">解码 ← Base64</button>' +
    '<button type="button" onclick="clearBase64()">清空</button>' +
    "</div>" +
    '<pre id="base64Output" class="output"></pre>';
}

function encodeBase64() {
  const inputEl = document.getElementById("base64Input");
  const outEl = document.getElementById("base64Output");
  if (!inputEl || !outEl) return;
  const input = inputEl.value;
  if (!input) {
    outEl.textContent = "请输入文本";
    return;
  }
  try {
    outEl.textContent = btoa(unescape(encodeURIComponent(input)));
  } catch (e) {
    outEl.textContent = "编码失败: " + (e && e.message ? e.message : String(e));
  }
}

function decodeBase64() {
  const inputEl = document.getElementById("base64Input");
  const outEl = document.getElementById("base64Output");
  if (!inputEl || !outEl) return;
  const input = inputEl.value.trim();
  if (!input) {
    outEl.textContent = "请输入 Base64 字符串";
    return;
  }
  try {
    outEl.textContent = decodeURIComponent(escape(atob(input)));
  } catch (e) {
    outEl.textContent = "解码失败: 可能不是有效的 Base64";
  }
}

function clearBase64() {
  const inputEl = document.getElementById("base64Input");
  const outEl = document.getElementById("base64Output");
  if (inputEl) inputEl.value = "";
  if (outEl) outEl.textContent = "";
}
