var PICK_STORAGE_KEY = "toolsite.pick.options";

function renderPickTool(container) {
  var saved = "";
  try {
    saved = localStorage.getItem(PICK_STORAGE_KEY) || "";
  } catch (e) {
    saved = "";
  }

  container.innerHTML =
    "<h2>随机选项 / 抽签</h2>" +
    "<p>每行一个选项；点「保存到本机」写入当前浏览器，下次打开本工具会自动载入。</p>" +
    '<textarea id="pickOptions" placeholder="午饭吃啥&#10;面条&#10;米饭&#10;饺子"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="savePickOptions()">保存到本机</button>' +
    '<button type="button" onclick="loadPickSaved()">加载已保存</button>' +
    '<button type="button" onclick="randomPickOne()">随机抽取</button>' +
    "</div>" +
    '<div class="button-group">' +
    '<button type="button" onclick="clearPickEditor()">清空编辑区</button>' +
    '<button type="button" onclick="clearPickStorage()">清除保存记录</button>' +
    "</div>" +
    '<pre id="pickResult" class="output"></pre>';

  var ta = document.getElementById("pickOptions");
  if (ta && saved) ta.value = saved;
}

function parsePickLines() {
  var ta = document.getElementById("pickOptions");
  if (!ta) return [];
  return ta.value
    .split(/\r?\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function savePickOptions() {
  var ta = document.getElementById("pickOptions");
  var out = document.getElementById("pickResult");
  if (!ta) return;
  try {
    localStorage.setItem(PICK_STORAGE_KEY, ta.value);
    var n = parsePickLines().length;
    if (out) out.textContent = "已保存到本机（当前有效选项约 " + n + " 行；空行不计入抽取）";
  } catch (e) {
    if (out) out.textContent = "保存失败（可能为无痕模式或存储已满）：" + (e.message || e);
  }
}

function randomPickOne() {
  var lines = parsePickLines();
  var out = document.getElementById("pickResult");
  if (!lines.length) {
    if (out) out.textContent = "请至少保留一个非空选项（每行一项）";
    return;
  }
  var idx;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    var buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    idx = buf[0] % lines.length;
  } else {
    idx = Math.floor(Math.random() * lines.length);
  }
  if (out) {
    out.textContent =
      "抽中：\n\n「" + lines[idx] + "」\n\n（第 " + (idx + 1) + " / " + lines.length + " 项）";
  }
}

function loadPickSaved() {
  var ta = document.getElementById("pickOptions");
  var out = document.getElementById("pickResult");
  if (!ta) return;
  try {
    var v = localStorage.getItem(PICK_STORAGE_KEY);
    ta.value = v != null ? v : "";
    if (out) out.textContent = v != null && v !== "" ? "已从本机加载保存的列表" : "暂无已保存记录";
  } catch (e) {
    if (out) out.textContent = "加载失败";
  }
}

function clearPickEditor() {
  var ta = document.getElementById("pickOptions");
  var out = document.getElementById("pickResult");
  if (ta) ta.value = "";
  if (out) out.textContent = "已清空编辑区（本机已保存的列表仍在，可点「加载已保存」恢复）";
}

function clearPickStorage() {
  try {
    localStorage.removeItem(PICK_STORAGE_KEY);
  } catch (e) {}
  var out = document.getElementById("pickResult");
  if (out) out.textContent = "已删除本机保存的列表（编辑区内容未自动清空）";
}
