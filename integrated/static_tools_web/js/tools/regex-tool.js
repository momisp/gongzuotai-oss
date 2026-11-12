function renderRegexTool(container) {
  container.innerHTML =
    "<h2>正则测试</h2>" +
    "<p>在本地执行 RegExp，勿粘贴不可信的超长文本以免卡顿</p>" +
    '<div class="input-group"><label for="regexPattern">正则</label>' +
    '<input type="text" id="regexPattern" placeholder="例如 \\d+" /></div>' +
    '<div class="input-group"><label for="regexFlags">标志</label>' +
    '<input type="text" id="regexFlags" placeholder="gimsu 等，默认 g" value="g" /></div>' +
    '<textarea id="regexText" placeholder="待匹配文本"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="runRegexTest()">测试</button>' +
    '<button type="button" onclick="clearRegex()">清空</button>' +
    "</div>" +
    '<pre id="regexOutput" class="output"></pre>';
}

function runRegexTest() {
  const p = document.getElementById("regexPattern");
  const f = document.getElementById("regexFlags");
  const t = document.getElementById("regexText");
  const out = document.getElementById("regexOutput");
  if (!p || !f || !t || !out) return;
  const pat = p.value;
  if (!pat) {
    out.textContent = "请输入正则";
    return;
  }
  let re;
  try {
    re = new RegExp(pat, f.value || "g");
  } catch (e) {
    out.textContent = "正则无效: " + (e.message || e);
    return;
  }
  const text = t.value;
  const lines = [];
  let m;
  const max = 200;
  let n = 0;
  if (re.global) {
    while ((m = re.exec(text)) !== null && n < max) {
      n++;
      lines.push(
        "#" +
          n +
          " index=" +
          m.index +
          " 匹配=" +
          JSON.stringify(m[0]) +
          (m.length > 1 ? " 分组=" + JSON.stringify(m.slice(1)) : "")
      );
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  } else {
    m = re.exec(text);
    if (m) lines.push("匹配=" + JSON.stringify(m[0]) + " index=" + m.index);
    else lines.push("无匹配");
  }
  if (n >= max) lines.push("...(最多展示 " + max + " 条)");
  out.textContent = lines.length ? lines.join("\n") : "无匹配";
}

function clearRegex() {
  ["regexPattern", "regexFlags", "regexText"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = id === "regexFlags" ? "g" : "";
  });
  const out = document.getElementById("regexOutput");
  if (out) out.textContent = "";
}
