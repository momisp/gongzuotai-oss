function renderDiffTool(container) {
  container.innerHTML =
    "<h2>文本行对比</h2>" +
    "<p>按行号对齐比较（非专业 diff 算法，适合快速查看）</p>" +
    '<div class="diff-grid">' +
    '<div><label for="diffA">文本 A</label><textarea id="diffA"></textarea></div>' +
    '<div><label for="diffB">文本 B</label><textarea id="diffB"></textarea></div>' +
    "</div>" +
    '<div class="button-group">' +
    '<button type="button" onclick="runSimpleDiff()">对比</button>' +
    '<button type="button" onclick="clearDiff()">清空</button>' +
    "</div>" +
    '<pre id="diffOutput" class="output"></pre>';
}

function runSimpleDiff() {
  const aEl = document.getElementById("diffA");
  const bEl = document.getElementById("diffB");
  const out = document.getElementById("diffOutput");
  if (!aEl || !bEl || !out) return;
  const la = aEl.value.split(/\r?\n/);
  const lb = bEl.value.split(/\r?\n/);
  const n = Math.max(la.length, lb.length);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const A = la[i] ?? "";
    const B = lb[i] ?? "";
    if (A === B) lines.push(" " + (i + 1) + "\t" + A);
    else {
      lines.push("-" + (i + 1) + "\t" + A);
      lines.push("+" + (i + 1) + "\t" + B);
    }
  }
  out.textContent = lines.join("\n");
}

function clearDiff() {
  const a = document.getElementById("diffA");
  const b = document.getElementById("diffB");
  const o = document.getElementById("diffOutput");
  if (a) a.value = "";
  if (b) b.value = "";
  if (o) o.textContent = "";
}
