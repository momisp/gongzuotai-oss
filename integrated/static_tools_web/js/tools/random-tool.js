function renderRandomTool(container) {
  container.innerHTML =
    "<h2>随机字符串</h2>" +
    "<p>在浏览器内生成，不会上传服务器</p>" +
    '<div class="input-group"><label for="randLen">长度</label>' +
    '<input type="number" id="randLen" value="16" min="1" max="512" step="1" /></div>' +
    '<div class="input-group"><span class="check-row">' +
    '<label><input type="checkbox" id="randUpper" checked /> 大写 A-Z</label> ' +
    '<label><input type="checkbox" id="randLower" checked /> 小写 a-z</label> ' +
    '<label><input type="checkbox" id="randDigit" checked /> 数字 0-9</label> ' +
    '<label><input type="checkbox" id="randSym" /> 符号 !@#$%^&*</label>' +
    "</span></div>" +
    '<div class="button-group">' +
    '<button type="button" onclick="genRandomStr()">生成</button>' +
    '<button type="button" onclick="clearRandom()">清空</button>' +
    "</div>" +
    '<pre id="randomOutput" class="output"></pre>';
}

function randPick(pool, len) {
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  let s = "";
  for (let i = 0; i < len; i++) s += pool[out[i] % pool.length];
  return s;
}

function genRandomStr() {
  const lenEl = document.getElementById("randLen");
  const out = document.getElementById("randomOutput");
  if (!lenEl || !out) return;
  const len = Math.min(512, Math.max(1, Math.floor(Number(lenEl.value)) || 1));
  let pool = "";
  if (document.getElementById("randUpper").checked) pool += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (document.getElementById("randLower").checked) pool += "abcdefghijklmnopqrstuvwxyz";
  if (document.getElementById("randDigit").checked) pool += "0123456789";
  if (document.getElementById("randSym").checked) pool += "!@#$%^&*-_+=[]{}";
  if (!pool) {
    out.textContent = "请至少选择一种字符集";
    return;
  }
  if (!crypto || !crypto.getRandomValues) {
    out.textContent = "当前环境不支持安全随机数";
    return;
  }
  out.textContent = randPick(pool, len);
}

function clearRandom() {
  const out = document.getElementById("randomOutput");
  if (out) out.textContent = "";
}
