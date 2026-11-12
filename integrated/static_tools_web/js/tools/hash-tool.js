function renderHashTool(container) {
  container.innerHTML =
    "<h2>摘要 / 哈希</h2>" +
    "<p>MD5 为本地脚本；SHA 系列使用 Web Crypto（需 localhost 或 HTTPS）</p>" +
    '<textarea id="hashInput" placeholder="输入文本"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="hashMd5()">MD5</button>' +
    '<button type="button" onclick="hashSha(\'SHA-1\')">SHA-1</button>' +
    '<button type="button" onclick="hashSha(\'SHA-256\')">SHA-256</button>' +
    '<button type="button" onclick="hashSha(\'SHA-384\')">SHA-384</button>' +
    '<button type="button" onclick="hashSha(\'SHA-512\')">SHA-512</button>' +
    '<button type="button" onclick="clearHash()">清空</button>' +
    "</div>" +
    '<pre id="hashOutput" class="output"></pre>';
}

function hashOut() {
  return document.getElementById("hashOutput");
}

function hashMd5() {
  const el = document.getElementById("hashInput");
  const out = hashOut();
  if (!el || !out) return;
  if (typeof md5 !== "function") {
    out.textContent = "未加载 md5 库";
    return;
  }
  out.textContent = md5(el.value);
}

async function hashSha(algo) {
  const el = document.getElementById("hashInput");
  const out = hashOut();
  if (!el || !out) return;
  if (!window.crypto || !crypto.subtle) {
    out.textContent = "当前环境不支持 Web Crypto";
    return;
  }
  const buf = new TextEncoder().encode(el.value);
  try {
    const digest = await crypto.subtle.digest(algo, buf);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    out.textContent = algo + ": " + hex;
  } catch (e) {
    out.textContent = "计算失败: " + (e.message || e);
  }
}

function clearHash() {
  const el = document.getElementById("hashInput");
  const out = hashOut();
  if (el) el.value = "";
  if (out) out.textContent = "";
}
