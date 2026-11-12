function renderHexTool(container) {
  container.innerHTML =
    "<h2>Hex / 文本</h2>" +
    "<p>UTF-8 字节与十六进制互转（可含空格）</p>" +
    '<textarea id="hexInput" placeholder="文本 或 十六进制如 48656c6c6f"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="textToHex()">文本 → Hex</button>' +
    '<button type="button" onclick="hexToText()">Hex → 文本</button>' +
    '<button type="button" onclick="clearHex()">清空</button>' +
    "</div>" +
    '<pre id="hexOutput" class="output"></pre>';
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function textToHex() {
  const el = document.getElementById("hexInput");
  const out = document.getElementById("hexOutput");
  if (!el || !out) return;
  const bytes = utf8Bytes(el.value);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  out.textContent = hex || "(空)";
}

function hexToText() {
  const el = document.getElementById("hexInput");
  const out = document.getElementById("hexOutput");
  if (!el || !out) return;
  const raw = el.value.replace(/\s+/g, "");
  if (!raw) {
    out.textContent = "请输入十六进制";
    return;
  }
  if (raw.length % 2 !== 0) {
    out.textContent = "十六进制长度须为偶数";
    return;
  }
  const arr = new Uint8Array(raw.length / 2);
  for (let i = 0; i < raw.length; i += 2) {
    const b = parseInt(raw.slice(i, i + 2), 16);
    if (!Number.isFinite(b)) {
      out.textContent = "含非法字符: " + raw.slice(i, i + 2);
      return;
    }
    arr[i / 2] = b;
  }
  try {
    out.textContent = new TextDecoder("utf-8", { fatal: true }).decode(arr);
  } catch (e) {
    out.textContent = "UTF-8 解码失败，可检查字节是否正确";
  }
}

function clearHex() {
  const el = document.getElementById("hexInput");
  const out = document.getElementById("hexOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
