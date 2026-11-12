function renderUaTool(container) {
  container.innerHTML =
    "<h2>User-Agent 粗解析</h2>" +
    "<p>正则提取常见信息，复杂 UA 可能不完整</p>" +
    '<textarea id="uaInput" placeholder="粘贴 User-Agent"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="parseUa()">解析</button>' +
    '<button type="button" onclick="clearUa()">清空</button>' +
    "</div>" +
    '<pre id="uaOutput" class="output"></pre>';
}

function pick(re, ua) {
  const m = ua.match(re);
  return m ? m[1] : "";
}

function parseUa() {
  const el = document.getElementById("uaInput");
  const out = document.getElementById("uaOutput");
  if (!el || !out) return;
  const ua = el.value.trim();
  if (!ua) {
    out.textContent = "请输入 UA";
    return;
  }
  const lines = [];
  lines.push("Chrome: " + (pick(/Chrome\/([\d.]+)/, ua) || "(无)"));
  lines.push("Firefox: " + (pick(/Firefox\/([\d.]+)/, ua) || "(无)"));
  lines.push("Safari: " + (pick(/Version\/([\d.]+).*Safari/, ua) || "(无)"));
  lines.push("Edge: " + (pick(/Edg(?:e|A|iOS)?\/([\d.]+)/, ua) || "(无)"));
  lines.push("Windows NT: " + (pick(/Windows NT ([\d.]+)/, ua) || "(无)"));
  lines.push("Android: " + (pick(/Android ([\d._]+)/, ua) || "(无)"));
  lines.push("iPhone OS: " + (pick(/iPhone OS ([\d_]+)/, ua) || "(无)"));
  lines.push("Mobile: " + (/Mobile|Android|iPhone|iPad/i.test(ua) ? "可能是移动设备" : "未识别为典型移动 UA"));
  out.textContent = lines.join("\n");
}

function clearUa() {
  const el = document.getElementById("uaInput");
  const out = document.getElementById("uaOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
