function renderColorTool(container) {
  container.innerHTML =
    "<h2>颜色格式转换</h2>" +
    "<p>支持 #rgb / #rrggbb / rgb() / rgba() / hsl() / hsla()</p>" +
    '<input type="text" id="colorInput" placeholder="#3498db 或 rgb(52,152,219)" />' +
    '<div class="button-group">' +
    '<button type="button" onclick="convertColor()">转换</button>' +
    '<button type="button" onclick="clearColor()">清空</button>' +
    "</div>" +
    '<pre id="colorOutput" class="output"></pre>';
}

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function parseColorInput(str) {
  const s = str.trim();
  if (!s) return null;
  const el = document.createElement("span");
  el.style.color = s;
  document.body.appendChild(el);
  const cs = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = cs.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function convertColor() {
  const el = document.getElementById("colorInput");
  const out = document.getElementById("colorOutput");
  if (!el || !out) return;
  const rgb = parseColorInput(el.value);
  if (!rgb) {
    out.textContent = "无法解析颜色";
    return;
  }
  const { r, g, b } = rgb;
  const hex =
    "#" +
    [r, g, b]
      .map((x) => clamp255(x).toString(16).padStart(2, "0"))
      .join("");
  const hsl = rgbToHsl(r, g, b);
  out.textContent =
    "HEX: " +
    hex +
    "\nRGB: rgb(" +
    clamp255(r) +
    ", " +
    clamp255(g) +
    ", " +
    clamp255(b) +
    ")\nHSL: hsl(" +
    hsl.h.toFixed(1) +
    ", " +
    hsl.s.toFixed(1) +
    "%, " +
    hsl.l.toFixed(1) +
    "%)";
}

function clearColor() {
  const el = document.getElementById("colorInput");
  const out = document.getElementById("colorOutput");
  if (el) el.value = "";
  if (out) out.textContent = "";
}
