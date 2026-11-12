function renderCssunitTool(container) {
  container.innerHTML =
    "<h2>rem / px 换算</h2>" +
    "<p>以根字号为基准（常见 16px）</p>" +
    '<div class="input-group"><label for="cssRootPx">根字号 (px)</label>' +
    '<input type="number" id="cssRootPx" value="16" min="1" step="1" /></div>' +
    '<div class="input-group"><label for="cssPx">长度 (px)</label>' +
    '<input type="number" id="cssPx" placeholder="例如 24" step="any" /></div>' +
    '<div class="input-group"><label for="cssRem">长度 (rem)</label>' +
    '<input type="number" id="cssRem" placeholder="例如 1.5" step="any" /></div>' +
    '<div class="button-group">' +
    '<button type="button" onclick="pxToRemUnit()">px → rem</button>' +
    '<button type="button" onclick="remToPxUnit()">rem → px</button>' +
    '<button type="button" onclick="clearCssunit()">清空</button>' +
    "</div>" +
    '<pre id="cssunitOutput" class="output"></pre>';
}

function cssunitRoot() {
  const el = document.getElementById("cssRootPx");
  const v = el ? Number(el.value) : 16;
  return Number.isFinite(v) && v > 0 ? v : 16;
}

function pxToRemUnit() {
  const pxEl = document.getElementById("cssPx");
  const out = document.getElementById("cssunitOutput");
  if (!pxEl || !out) return;
  const px = Number(pxEl.value);
  if (!Number.isFinite(px)) {
    out.textContent = "请输入有效 px";
    return;
  }
  const root = cssunitRoot();
  out.textContent = px + "px = " + (px / root).toFixed(6) + "rem（根 " + root + "px）";
}

function remToPxUnit() {
  const remEl = document.getElementById("cssRem");
  const out = document.getElementById("cssunitOutput");
  if (!remEl || !out) return;
  const rem = Number(remEl.value);
  if (!Number.isFinite(rem)) {
    out.textContent = "请输入有效 rem";
    return;
  }
  const root = cssunitRoot();
  out.textContent = rem + "rem = " + (rem * root).toFixed(4) + "px（根 " + root + "px）";
}

function clearCssunit() {
  ["cssPx", "cssRem"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const out = document.getElementById("cssunitOutput");
  if (out) out.textContent = "";
}
