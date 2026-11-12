function renderUnitsTool(container) {
  container.innerHTML =
    "<h2>常用单位换算</h2>" +
    "<p>字节、温度、长度（米制）</p>" +
    "<h3>字节</h3>" +
    '<div class="input-group"><label for="unitBytes">字节 (B)</label>' +
    '<input type="number" id="unitBytes" placeholder="1048576" step="any" /></div>' +
    '<div class="button-group"><button type="button" onclick="convBytes()">换算 KB/MB/GB</button></div>' +
    "<h3>温度</h3>" +
    '<div class="input-group"><label for="unitC">摄氏度 ℃</label>' +
    '<input type="number" id="unitC" placeholder="25" step="any" /></div>' +
    '<div class="button-group"><button type="button" onclick="convTempC()">℃ → ℉</button></div>' +
    '<div class="input-group"><label for="unitF">华氏度 ℉</label>' +
    '<input type="number" id="unitF" placeholder="77" step="any" /></div>' +
    '<div class="button-group"><button type="button" onclick="convTempF()">℉ → ℃</button></div>' +
    "<h3>长度</h3>" +
    '<div class="input-group"><label for="unitM">米 (m)</label>' +
    '<input type="number" id="unitM" placeholder="1.5" step="any" /></div>' +
    '<div class="button-group"><button type="button" onclick="convLength()">换算 cm / km</button></div>' +
    '<div class="button-group"><button type="button" onclick="clearUnits()">清空输出</button></div>' +
    '<pre id="unitsOutput" class="output"></pre>';
}

function convBytes() {
  const el = document.getElementById("unitBytes");
  const out = document.getElementById("unitsOutput");
  if (!el || !out) return;
  const b = Number(el.value);
  if (!Number.isFinite(b)) {
    out.textContent = "请输入有效字节数";
    return;
  }
  out.textContent =
    "KB: " +
    (b / 1024).toFixed(6) +
    "\nMB: " +
    (b / 1024 / 1024).toFixed(6) +
    "\nGB: " +
    (b / 1024 / 1024 / 1024).toFixed(9);
}

function convTempC() {
  const el = document.getElementById("unitC");
  const out = document.getElementById("unitsOutput");
  if (!el || !out) return;
  const c = Number(el.value);
  if (!Number.isFinite(c)) {
    out.textContent = "请输入摄氏度";
    return;
  }
  const f = (c * 9) / 5 + 32;
  out.textContent = c + " ℃ = " + f.toFixed(4) + " ℉";
}

function convTempF() {
  const el = document.getElementById("unitF");
  const out = document.getElementById("unitsOutput");
  if (!el || !out) return;
  const f = Number(el.value);
  if (!Number.isFinite(f)) {
    out.textContent = "请输入华氏度";
    return;
  }
  const c = ((f - 32) * 5) / 9;
  out.textContent = f + " ℉ = " + c.toFixed(4) + " ℃";
}

function convLength() {
  const el = document.getElementById("unitM");
  const out = document.getElementById("unitsOutput");
  if (!el || !out) return;
  const m = Number(el.value);
  if (!Number.isFinite(m)) {
    out.textContent = "请输入米";
    return;
  }
  out.textContent = m + " m = " + (m * 100).toFixed(4) + " cm = " + (m / 1000).toFixed(9) + " km";
}

function clearUnits() {
  const out = document.getElementById("unitsOutput");
  if (out) out.textContent = "";
}
