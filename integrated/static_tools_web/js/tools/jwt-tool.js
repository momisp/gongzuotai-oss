function renderJwtTool(container) {
  container.innerHTML =
    "<h2>JWT 解码</h2>" +
    "<p>仅解码展示 Header / Payload，不验证签名</p>" +
    '<textarea id="jwtInput" placeholder="粘贴 JWT（三段用 . 分隔）"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="decodeJwt()">解码</button>' +
    '<button type="button" onclick="clearJwt()">清空</button>' +
    "</div>" +
    '<pre id="jwtOutput" class="output"></pre>';
}

function jwtB64UrlDecode(seg) {
  let s = seg.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeJwt() {
  const el = document.getElementById("jwtInput");
  const out = document.getElementById("jwtOutput");
  if (!el || !out) return;
  const raw = el.value.trim();
  if (!raw) {
    out.textContent = "请输入 JWT";
    return;
  }
  const parts = raw.split(".");
  if (parts.length < 2) {
    out.textContent = "格式不正确";
    return;
  }
  try {
    const header = JSON.stringify(JSON.parse(jwtB64UrlDecode(parts[0])), null, 2);
    const payload = JSON.stringify(JSON.parse(jwtB64UrlDecode(parts[1])), null, 2);
    let sig = "";
    if (parts[2]) sig = "(签名段已省略展示，长度 " + parts[2].length + " 字符)";
    out.textContent = "Header:\n" + header + "\n\nPayload:\n" + payload + "\n\n" + sig;
  } catch (e) {
    out.textContent = "解码失败: " + (e.message || e);
  }
}

function clearJwt() {
  const el = document.getElementById("jwtInput");
  const out = document.getElementById("jwtOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
