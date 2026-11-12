function renderTimestampTool(container) {
  container.innerHTML =
    "<h2>时间戳转换</h2>" +
    "<p>支持 10 位秒级或 13 位毫秒级时间戳，与本地日期时间互转</p>" +
    '<div class="input-group">' +
    "<label for=\"timestampInput\">时间戳</label>" +
    '<input type="text" id="timestampInput" placeholder="10 位秒或 13 位毫秒" />' +
    '<div class="button-group">' +
    '<button type="button" onclick="convertTimestampToDate()">转日期</button>' +
    "</div>" +
    "</div>" +
    '<div class="input-group">' +
    "<label for=\"dateInput\">日期时间</label>" +
    '<input type="datetime-local" id="dateInput" />' +
    '<div class="button-group">' +
    '<button type="button" onclick="convertDateToTimestamp()">转时间戳</button>' +
    "</div>" +
    "</div>" +
    "<h3>转换结果</h3>" +
    '<pre id="timestampResult" class="output"></pre>' +
    '<div class="button-group">' +
    '<button type="button" onclick="setNowTimestamp()">设为当前时间</button>' +
    '<button type="button" onclick="clearTimestamp()">清空</button>' +
    "</div>";
}

function formatDateTime(date) {
  const s = date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return s.replace(/\//g, "-");
}

function toDatetimeLocalValue(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    "T" +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
}

function convertTimestampToDate() {
  const tsEl = document.getElementById("timestampInput");
  const outEl = document.getElementById("timestampResult");
  if (!tsEl || !outEl) return;
  const raw = tsEl.value.trim();
  if (!raw) {
    outEl.textContent = "请输入时间戳";
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    outEl.textContent = "请输入有效数字";
    return;
  }
  const ms = n > 30000000000 ? n : n * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    outEl.textContent = "无效时间戳";
    return;
  }
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  outEl.textContent =
    "本地时间: " +
    formatDateTime(date) +
    "\nISO: " +
    date.toISOString() +
    "\n时区偏移: UTC" +
    sign +
    oh +
    ":" +
    om;
}

function convertDateToTimestamp() {
  const dateEl = document.getElementById("dateInput");
  const outEl = document.getElementById("timestampResult");
  if (!dateEl || !outEl) return;
  const v = dateEl.value;
  if (!v) {
    outEl.textContent = "请选择日期时间";
    return;
  }
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) {
    outEl.textContent = "无效日期";
    return;
  }
  const sec = Math.floor(date.getTime() / 1000);
  const msec = date.getTime();
  outEl.textContent = "秒 (10 位): " + sec + "\n毫秒 (13 位): " + msec;
}

function setNowTimestamp() {
  const now = new Date();
  const tsEl = document.getElementById("timestampInput");
  const dateEl = document.getElementById("dateInput");
  if (tsEl) tsEl.value = String(now.getTime());
  if (dateEl) dateEl.value = toDatetimeLocalValue(now);
  convertTimestampToDate();
}

function clearTimestamp() {
  const tsEl = document.getElementById("timestampInput");
  const dateEl = document.getElementById("dateInput");
  const outEl = document.getElementById("timestampResult");
  if (tsEl) tsEl.value = "";
  if (dateEl) dateEl.value = "";
  if (outEl) outEl.textContent = "";
}
