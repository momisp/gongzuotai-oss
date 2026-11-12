var TIMELINE_STORAGE_KEY = "toolsite.timeline.data";
var TIMELINE_VIEW_KEY = "toolsite.timeline.viewDays";
var TIMELINE_BRIDGE_KEY = "toolsite.timeline.bridgeUrl";
var TIMELINE_LAST_SYNC_KEY = "toolsite.timeline.lastSync";
var TIMELINE_META_FILE = "./assets/timeline-meta.json";
var TIMELINE_BRIDGE_DEFAULT = "http://127.0.0.1:45791";

var TIMELINE_GAME_NAMES = {
  genshin:  "原神",
  starrail: "崩坏：星穹铁道",
  zzz:      "绝区零",
  bh3:      "崩坏3"
};

var TIMELINE_STATIC_FILES = {
  genshin:  "./assets/timeline-genshin.json",
  starrail: "./assets/timeline-starrail.json",
  zzz:      "./assets/timeline-zzz.json",
  bh3:      "./assets/timeline-bh3.json"
};

var TIMELINE_DEFAULT_DATA = {
  genshin: {
    name: "原神",
    note: "示例数据（约 5.6 版本周期，请按实际公告校对）",
    events: [
      { name: "5.6 角色活动祈愿·上半（赤望流年）", category: "角色池", start: "2026-04-23 11:00", end: "2026-05-13 17:59", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "5.6 角色活动祈愿·下半", category: "角色池", start: "2026-05-14 06:00", end: "2026-06-03 17:59", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "5.7 角色活动祈愿·上半", category: "角色池", start: "2026-06-04 06:00", end: "2026-06-24 17:59", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "5.6 武器活动祈愿·上半", category: "武器池", start: "2026-04-23 11:00", end: "2026-05-13 17:59", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "5.6 武器活动祈愿·下半", category: "武器池", start: "2026-05-14 06:00", end: "2026-06-03 17:59", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "镜花之绊", category: "大型活动", start: "2026-05-01 10:00", end: "2026-05-22 03:59", desc: "5.6 版本大型活动，可获得 4 星角色与摩拉、原石奖励。", source: "米游社活动公告", url: "https://www.miyoushe.com/ys/home/26" },
      { name: "诗韵入墨", category: "活动", start: "2026-05-09 10:00", end: "2026-05-26 03:59", source: "米游社活动公告", url: "https://www.miyoushe.com/ys/home/26" },
      { name: "幽境飞行训练", category: "活动", start: "2026-04-25 10:00", end: "2026-05-12 03:59", source: "米游社活动公告", url: "https://www.miyoushe.com/ys/home/26" },
      { name: "万叶生贺登入", category: "登入", start: "2026-05-18 04:00", end: "2026-05-25 03:59", desc: "万叶生日纪念，登入即可领取奖励。", source: "米哈游官网公告", url: "https://ys.mihoyo.com/main/news/?type=1" },
      { name: "深境螺旋（第一期）", category: "周期", start: "2026-05-01 04:00", end: "2026-05-15 03:59", source: "游戏内 · 深境螺旋" },
      { name: "深境螺旋（第二期）", category: "周期", start: "2026-05-16 04:00", end: "2026-05-31 03:59", source: "游戏内 · 深境螺旋" },
      { name: "幻想真境剧诗", category: "周期", start: "2026-05-15 04:00", end: "2026-05-29 03:59", source: "游戏内 · 幻想真境剧诗" }
    ]
  }
};

var TIMELINE_CATEGORY_COLORS = {
  "角色池": "#e74c3c",
  "武器池": "#e67e22",
  "大型活动": "#3498db",
  "活动":   "#1abc9c",
  "登入":   "#9b59b6",
  "周期":   "#7f8c8d",
  "公告":   "#34495e",
  "资讯":   "#16a085",
  "游戏公告": "#34495e"
};

function timelineLoadData() {
  try {
    var raw = localStorage.getItem(TIMELINE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return TIMELINE_DEFAULT_DATA;
}

function timelineSaveData(data) {
  try {
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(data, null, 2));
    return true;
  } catch (e) { return false; }
}

function timelineLoadViewDays() {
  try {
    var v = parseInt(localStorage.getItem(TIMELINE_VIEW_KEY), 10);
    if (v >= 14 && v <= 120) return v;
  } catch (e) {}
  return 45;
}

function renderTimelineTool(container) {
  container.innerHTML =
    '<h2>游戏活动时间轴</h2>' +
    '<div class="tl-toolbar">' +
      '<label class="tl-field">游戏 <select id="tlGame"></select></label>' +
      '<label class="tl-field">范围 ' +
        '<select id="tlRange">' +
          '<option value="21">前 7 / 后 14 天</option>' +
          '<option value="45" selected>前 14 / 后 31 天</option>' +
          '<option value="75">前 25 / 后 50 天</option>' +
          '<option value="120">前 40 / 后 80 天</option>' +
        '</select>' +
      '</label>' +
      '<button type="button" class="tl-btn-config" onclick="timelineOpenSettings()">⚙ 配置</button>' +
      '<span class="tl-sync-status" id="tlSyncStatus" title="打开本工具时会自动加载服务端 JSON"></span>' +
      '<span class="tl-now" id="tlNow"></span>' +
    '</div>' +
    '<div class="tl-legend" id="tlLegend"></div>' +
    '<div class="tl-scroll"><div class="tl-chart" id="tlChart"></div></div>' +
    '<pre id="tlMsg" class="output"></pre>' +
    '<div id="tlModal" class="tl-modal" hidden onclick="timelineModalBg(event)">' +
      '<div class="tl-modal-box" role="dialog" aria-modal="true">' +
        '<button type="button" class="tl-modal-close" aria-label="关闭" onclick="timelineCloseModal()">×</button>' +
        '<div id="tlModalBody"></div>' +
      '</div>' +
    '</div>' +
    '<div id="tlSettings" class="tl-modal tl-settings-modal" hidden onclick="timelineSettingsBg(event)">' +
      '<div class="tl-modal-box tl-settings-box" role="dialog" aria-modal="true">' +
        '<button type="button" class="tl-modal-close" aria-label="关闭" onclick="timelineCloseSettings()">×</button>' +
        '<h3 class="tl-settings-title">配置 · 数据拉取与编辑</h3>' +
        '<h4>在线拉取</h4>' +
        '<p class="tl-sub">' +
          '<b>自动同步</b>：工作台启动 / 每天凌晨 3:00 后台拉取并写入 JSON；<b>每次打开本工具都会自动加载全部 JSON</b>，无需手动点击。<br>' +
          '<b>方式 A · 本地 JSON</b>：也可手动跑 <code>node scripts/game-events.mjs --all</code>，或点下方按钮立即重新加载。<br>' +
          '<b>方式 B · 本机桥接</b>：终端跑 <code>node scripts/game-events-bridge.mjs</code> 后，点对应按钮实时拉取。' +
        '</p>' +
        '<div class="tl-fetch-grid">' +
          '<div class="tl-fetch-row tl-fetch-row-all">' +
            '<span class="tl-fetch-label">一键全部</span>' +
            '<button type="button" class="tl-btn-primary" onclick="timelineFetchAllStatic()">立即重新加载 JSON</button>' +
            '<button type="button" class="tl-btn-primary" onclick="timelineFetchAllBridge()">桥接拉取全部·官方</button>' +
          '</div>' +
          '<div class="tl-fetch-row">' +
            '<span class="tl-fetch-label">原神</span>' +
            '<button type="button" onclick="timelineFetchStatic(\'genshin\')">加载本地 JSON</button>' +
            '<button type="button" onclick="timelineFetchBridge(\'genshin\', \'official\')">桥接·官方</button>' +
            '<button type="button" onclick="timelineFetchBridge(\'genshin\', \'paimonmoe\')">桥接·PaimonMoe</button>' +
          '</div>' +
          '<div class="tl-fetch-row">' +
            '<span class="tl-fetch-label">崩坏：星穹铁道</span>' +
            '<button type="button" onclick="timelineFetchStatic(\'starrail\')">加载本地 JSON</button>' +
            '<button type="button" onclick="timelineFetchBridge(\'starrail\', \'official\')">桥接·官方</button>' +
          '</div>' +
          '<div class="tl-fetch-row">' +
            '<span class="tl-fetch-label">绝区零</span>' +
            '<button type="button" onclick="timelineFetchStatic(\'zzz\')">加载本地 JSON</button>' +
            '<button type="button" onclick="timelineFetchBridge(\'zzz\', \'official\')">桥接·官方</button>' +
          '</div>' +
          '<div class="tl-fetch-row">' +
            '<span class="tl-fetch-label">崩坏3</span>' +
            '<button type="button" onclick="timelineFetchStatic(\'bh3\')">加载本地 JSON</button>' +
            '<button type="button" onclick="timelineFetchBridge(\'bh3\', \'official\')">桥接·米游社</button>' +
          '</div>' +
          '<div class="tl-fetch-row">' +
            '<span class="tl-fetch-label">桥接地址</span>' +
            '<input type="text" id="tlBridge" class="tl-bridge-input" placeholder="' + TIMELINE_BRIDGE_DEFAULT + '">' +
            '<button type="button" onclick="timelineBridgeHealth()">测试连通</button>' +
          '</div>' +
        '</div>' +
        '<h4>数据编辑（JSON）</h4>' +
        '<p class="tl-sub">格式：<code>{ "游戏key": { "name", "note", "events": [{ name, category, start, end, image, url }, ...] } }</code></p>' +
        '<textarea id="tlJson" class="tl-json"></textarea>' +
        '<div class="button-group">' +
          '<button type="button" onclick="timelineApply()">应用并保存</button>' +
          '<button type="button" onclick="timelineResetDefault()">恢复默认</button>' +
          '<button type="button" onclick="timelineLoadFromStorage()">重新加载</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var saved = timelineLoadViewDays();
  var rangeSel = document.getElementById('tlRange');
  if (rangeSel) rangeSel.value = String(saved);

  var bridgeInput = document.getElementById('tlBridge');
  if (bridgeInput) {
    try { bridgeInput.value = localStorage.getItem(TIMELINE_BRIDGE_KEY) || TIMELINE_BRIDGE_DEFAULT; }
    catch (e) { bridgeInput.value = TIMELINE_BRIDGE_DEFAULT; }
    bridgeInput.addEventListener('change', function () {
      try { localStorage.setItem(TIMELINE_BRIDGE_KEY, this.value || TIMELINE_BRIDGE_DEFAULT); } catch (e) {}
    });
  }

  document.getElementById('tlGame').addEventListener('change', timelineRedraw);
  document.getElementById('tlRange').addEventListener('change', function () {
    try { localStorage.setItem(TIMELINE_VIEW_KEY, this.value); } catch (e) {}
    timelineRedraw();
  });

  timelineLoadFromStorage();
  timelineAutoSyncFromServer();
  container.classList.add('tool-timeline');
  var outer = container.closest('.container');
  if (outer) outer.classList.add('container-wide');
}

function timelineLoadFromStorage() {
  var data = timelineLoadData();
  var ta = document.getElementById('tlJson');
  if (ta) ta.value = JSON.stringify(data, null, 2);
  timelinePopulateGameSelect(data);
  timelineRedraw();
}

function timelineResetDefault() {
  timelineSaveData(TIMELINE_DEFAULT_DATA);
  timelineLoadFromStorage();
  var msg = document.getElementById('tlMsg');
  if (msg) msg.textContent = '已恢复默认示例数据。';
}

function timelineApply() {
  var ta = document.getElementById('tlJson');
  var msg = document.getElementById('tlMsg');
  if (!ta) return;
  try {
    var obj = JSON.parse(ta.value);
    if (!obj || typeof obj !== 'object') throw new Error('顶层必须是对象');
    timelineSaveData(obj);
    timelinePopulateGameSelect(obj);
    timelineRedraw();
    if (msg) msg.textContent = '已保存并应用。';
  } catch (e) {
    if (msg) msg.textContent = 'JSON 解析失败：' + (e.message || e);
  }
}

function timelinePopulateGameSelect(data) {
  var sel = document.getElementById('tlGame');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '';
  Object.keys(data).forEach(function (key) {
    var opt = document.createElement('option');
    opt.value = key;
    opt.textContent = data[key].name || key;
    sel.appendChild(opt);
  });
  if (cur && data[cur]) sel.value = cur;
}

function timelineParse(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0);
}

function timelineRedraw() {
  var data = timelineLoadData();
  var gameSel = document.getElementById('tlGame');
  var key = gameSel ? gameSel.value : Object.keys(data)[0];
  var game = data[key];
  var chart = document.getElementById('tlChart');
  var legend = document.getElementById('tlLegend');
  var nowEl = document.getElementById('tlNow');
  if (!chart || !game) return;

  var now = new Date();
  if (nowEl) {
    nowEl.textContent = '当前：' + timelineFmt(now) +
      (game.note ? '　·　' + game.note : '');
  }

  var viewDays = timelineLoadViewDays();
  var backDays = Math.floor(viewDays / 3);
  var fwdDays = viewDays - backDays;
  var rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - backDays);
  var rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + fwdDays);

  var events = (game.events || []).map(function (e) {
    return {
      raw: e,
      start: timelineParse(e.start),
      end: timelineParse(e.end)
    };
  }).filter(function (e) {
    return e.start && e.end && e.end > rangeStart && e.start < rangeEnd;
  });

  events.sort(function (a, b) {
    var ca = a.raw.category || '';
    var cb = b.raw.category || '';
    if (ca !== cb) return ca.localeCompare(cb);
    return a.start - b.start;
  });

  window.__tlCurrentEvents = events;

  var totalMs = rangeEnd - rangeStart;
  var labelW = 260;
  var dayPx = 36;
  var bodyW = Math.floor(totalMs / 86400000) * dayPx;

  var html = '';
  html += '<div class="tl-head" style="grid-template-columns:' + labelW + 'px ' + bodyW + 'px;">';
  html += '<div class="tl-head-label">活动 / 类型</div>';
  html += '<div class="tl-head-axis">';
  var cursor = new Date(rangeStart);
  var dayIdx = 0;
  while (cursor < rangeEnd) {
    var isMonday = cursor.getDay() === 1;
    var isFirst = cursor.getDate() === 1;
    var cls = 'tl-day';
    if (isMonday) cls += ' tl-day-week';
    if (isFirst) cls += ' tl-day-month';
    html += '<div class="' + cls + '" style="left:' + (dayIdx * dayPx) + 'px;width:' + dayPx + 'px;">' +
            '<span class="tl-day-num">' + cursor.getDate() + '</span>' +
            (isFirst || dayIdx === 0 ? '<span class="tl-day-mon">' + (cursor.getMonth() + 1) + '月</span>' : '') +
            '</div>';
    cursor.setDate(cursor.getDate() + 1);
    dayIdx++;
  }
  var nowLeft = ((now - rangeStart) / totalMs) * bodyW;
  if (nowLeft >= 0 && nowLeft <= bodyW) {
    html += '<div class="tl-now-line" style="left:' + nowLeft + 'px;"><span>今</span></div>';
  }
  html += '</div></div>';

  if (!events.length) {
    html += '<div class="tl-empty">当前时间范围内没有活动。试着扩大「范围」或更新 JSON 数据。</div>';
  }

  events.forEach(function (e, idx) {
    var s = e.start < rangeStart ? rangeStart : e.start;
    var en = e.end > rangeEnd ? rangeEnd : e.end;
    var left = ((s - rangeStart) / totalMs) * bodyW;
    var width = Math.max(((en - s) / totalMs) * bodyW, 4);
    var status = 'upcoming';
    if (now >= e.end) status = 'done';
    else if (now >= e.start) status = 'live';
    var color = TIMELINE_CATEGORY_COLORS[e.raw.category] || '#34495e';
    var leftCut = e.start < rangeStart ? ' tl-cut-l' : '';
    var rightCut = e.end > rangeEnd ? ' tl-cut-r' : '';

    var tip = e.raw.name +
      '\n类型：' + (e.raw.category || '-') +
      '\n开始：' + timelineFmt(e.start) +
      '\n结束：' + timelineFmt(e.end) +
      '\n状态：' + (status === 'live' ? '进行中（剩 ' + timelineRemain(now, e.end) + '）'
                : status === 'done' ? '已结束'
                : '未开始（' + timelineRemain(now, e.start) + '后开放）') +
      '\n点击查看详情';

    html += '<div class="tl-row" style="grid-template-columns:' + labelW + 'px ' + bodyW + 'px;">';
    var thumbHtml = e.raw.image
      ? '<img class="tl-row-thumb" src="' + timelineEscape(e.raw.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '';
    html += '<div class="tl-row-label" onclick="timelineShowModal(' + idx + ')">' +
            thumbHtml +
            '<span class="tl-dot" style="background:' + color + ';"></span>' +
            '<span class="tl-row-name">' + timelineEscape(e.raw.name) + '</span>' +
            '<span class="tl-row-cat">' + timelineEscape(e.raw.category || '') + '</span></div>';
    html += '<div class="tl-row-body">';
    html += '<div class="tl-bar tl-bar-' + status + leftCut + rightCut + '" title="' + timelineEscape(tip) +
            '" onclick="timelineShowModal(' + idx + ')"' +
            ' style="left:' + left + 'px;width:' + width + 'px;background:' + color + ';">' +
            (e.raw.image ? '<img class="tl-bar-thumb" src="' + timelineEscape(e.raw.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
            '<span class="tl-bar-text">' + timelineEscape(e.raw.name) + '</span></div>';
    if (nowLeft >= 0 && nowLeft <= bodyW) {
      html += '<div class="tl-now-line tl-now-line-row" style="left:' + nowLeft + 'px;"></div>';
    }
    html += '</div></div>';
  });

  chart.innerHTML = html;

  if (legend) {
    var lh = '';
    Object.keys(TIMELINE_CATEGORY_COLORS).forEach(function (cat) {
      lh += '<span class="tl-legend-item"><span class="tl-dot" style="background:' + TIMELINE_CATEGORY_COLORS[cat] + ';"></span>' + cat + '</span>';
    });
    lh += '<span class="tl-legend-item"><span class="tl-legend-line"></span>今日</span>';
    lh += '<span class="tl-legend-item"><span class="tl-legend-block tl-legend-done"></span>已结束</span>';
    legend.innerHTML = lh;
  }

  setTimeout(function () {
    var scroll = chart.parentElement;
    if (!scroll) return;
    var target = nowLeft + labelW - scroll.clientWidth * 0.35;
    scroll.scrollLeft = Math.max(0, target);
  }, 0);
}

function timelineFmt(d) {
  if (!d) return '-';
  var p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function timelineRemain(now, target) {
  var ms = Math.abs(target - now);
  var d = Math.floor(ms / 86400000);
  var h = Math.floor((ms % 86400000) / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  if (d) return d + '天' + h + '小时';
  if (h) return h + '小时' + m + '分';
  return m + '分';
}

function timelineEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timelineShowModal(idx) {
  var events = window.__tlCurrentEvents || [];
  var e = events[idx];
  if (!e) return;
  var modal = document.getElementById('tlModal');
  var body = document.getElementById('tlModalBody');
  if (!modal || !body) return;

  var now = new Date();
  var status, statusCls;
  if (now >= e.end) { status = '已结束'; statusCls = 'tl-st-done'; }
  else if (now >= e.start) { status = '进行中 · 剩 ' + timelineRemain(now, e.end); statusCls = 'tl-st-live'; }
  else { status = '未开始 · ' + timelineRemain(now, e.start) + '后开放'; statusCls = 'tl-st-up'; }

  var color = TIMELINE_CATEGORY_COLORS[e.raw.category] || '#34495e';
  var url = e.raw.url || '';
  var detailUrl = e.raw.detailUrl || '';
  var source = e.raw.source || '';
  var desc = e.raw.desc || '';
  var image = e.raw.image || '';

  var html = '';
  if (image) {
    html += '<div class="tl-modal-banner"><img src="' + timelineEscape(image) + '" alt="' + timelineEscape(e.raw.name) + '" onerror="this.parentElement.style.display=\'none\'"></div>';
  }
  html += '<div class="tl-modal-head" style="border-left:4px solid ' + color + ';">';
  html += '<h3 class="tl-modal-title">' + timelineEscape(e.raw.name) + '</h3>';
  html += '<div class="tl-modal-meta">';
  html += '<span class="tl-modal-tag" style="background:' + color + ';">' + timelineEscape(e.raw.category || '未分类') + '</span>';
  html += '<span class="tl-modal-tag ' + statusCls + '">' + timelineEscape(status) + '</span>';
  html += '</div></div>';

  html += '<dl class="tl-modal-dl">';
  html += '<dt>开始</dt><dd>' + timelineFmt(e.start) + '</dd>';
  html += '<dt>结束</dt><dd>' + timelineFmt(e.end) + '</dd>';
  html += '<dt>时长</dt><dd>' + timelineRemain(e.start, e.end) + '</dd>';
  if (desc) html += '<dt>说明</dt><dd>' + timelineEscape(desc) + '</dd>';
  if (source) html += '<dt>来源</dt><dd>' + timelineEscape(source) + '</dd>';
  html += '</dl>';

  if (url || detailUrl) {
    html += '<div class="tl-modal-actions">';
    if (url) {
      html += '<a class="tl-modal-btn tl-modal-btn-primary" href="' + timelineEscape(url) + '" target="_blank" rel="noopener noreferrer">官网公告中心 ↗</a>';
    }
    if (detailUrl) {
      html += '<a class="tl-modal-btn" href="' + timelineEscape(detailUrl) + '" target="_blank" rel="noopener noreferrer">公告详情 ↗</a>';
    }
    html += '</div>';
    html += '<p class="tl-modal-hint">「官网公告中心」可在浏览器打开；「公告详情」为游戏内公告页，部分浏览器可能无法访问。</p>';
  } else {
    html += '<p class="tl-modal-empty">未提供来源链接。可在配置 → JSON 中为该活动补 <code>url</code> 字段。</p>';
  }

  body.innerHTML = html;
  modal.hidden = false;
  document.addEventListener('keydown', timelineModalEsc);
}

function timelineCloseModal() {
  var modal = document.getElementById('tlModal');
  if (modal) modal.hidden = true;
  document.removeEventListener('keydown', timelineModalEsc);
}

function timelineModalBg(ev) {
  if (ev.target && ev.target.id === 'tlModal') timelineCloseModal();
}

function timelineModalEsc(ev) {
  if (ev.key === 'Escape') timelineCloseModal();
}

function timelineCopy(text) {
  var msg = document.getElementById('tlMsg');
  var ok = function () { if (msg) msg.textContent = '已复制：' + text; };
  var fail = function () { if (msg) msg.textContent = '复制失败，请手动选中链接。'; };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, fail);
  } else {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      ok();
    } catch (e) { fail(); }
  }
}

function timelineMsg(text) {
  var el = document.getElementById('tlMsg');
  if (el) el.textContent = text;
}

function timelineGetBridgeUrl() {
  var input = document.getElementById('tlBridge');
  var v = input && input.value ? input.value.trim() : '';
  return v.replace(/\/+$/, '') || TIMELINE_BRIDGE_DEFAULT;
}

function timelineMergeAndSave(gameKey, pack, skipRedraw) {
  var data = timelineLoadData();
  data[gameKey] = pack;
  timelineSaveData(data);
  var ta = document.getElementById('tlJson');
  if (ta) ta.value = JSON.stringify(data, null, 2);
  timelinePopulateGameSelect(data);
  if (!skipRedraw) {
    var sel = document.getElementById('tlGame');
    if (sel) sel.value = gameKey;
    timelineRedraw();
  }
}

function timelineDoFetchStatic(gameKey) {
  var url = TIMELINE_STATIC_FILES[gameKey];
  if (!url) return Promise.reject(new Error('未配置该游戏的本地 JSON 路径'));
  return fetch(url, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + '（' + url + '）');
      return r.json();
    })
    .then(function (pack) {
      if (!pack || !Array.isArray(pack.events)) throw new Error('JSON 结构异常：缺少 events 数组');
      return pack;
    });
}

function timelineDoFetchBridge(gameKey, source) {
  var base = timelineGetBridgeUrl();
  var url = base + '/api/events?game=' + encodeURIComponent(gameKey) + '&source=' + encodeURIComponent(source || 'official');
  return fetch(url)
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
    .then(function (resp) {
      if (!resp.ok || !resp.body || resp.body.ok === false) {
        throw new Error((resp.body && resp.body.error) || '未知错误');
      }
      var pack = resp.body.data;
      if (!pack || !Array.isArray(pack.events)) throw new Error('返回结构异常：缺少 events');
      return pack;
    });
}

function timelineFetchStatic(gameKey) {
  var url = TIMELINE_STATIC_FILES[gameKey];
  timelineMsg('正在加载 ' + url + ' ...');
  timelineDoFetchStatic(gameKey).then(function (pack) {
    timelineMergeAndSave(gameKey, pack);
    timelineMsg('已加载 ' + (TIMELINE_GAME_NAMES[gameKey] || gameKey) + '：' + pack.events.length + ' 条活动（来源：本地 JSON）');
  }).catch(function (e) {
    timelineMsg('加载失败：' + (e.message || e) + '\n请先跑：node scripts/game-events.mjs --game ' + gameKey);
  });
}

function timelineFetchBridge(gameKey, source) {
  timelineMsg('正在通过桥接拉取 ' + gameKey + ' (' + source + ') ...\n（请确保已运行 node scripts/game-events-bridge.mjs）');
  timelineDoFetchBridge(gameKey, source).then(function (pack) {
    timelineMergeAndSave(gameKey, pack);
    timelineMsg('已通过桥接拉取 ' + (TIMELINE_GAME_NAMES[gameKey] || gameKey) + '（' + source + '）：' + pack.events.length + ' 条活动');
  }).catch(function (e) {
    timelineMsg('桥接拉取失败：' + (e.message || e) + '\n排查：\n  1) 桥接是否在运行（node scripts/game-events-bridge.mjs）\n  2) 桥接地址是否正确（默认 ' + TIMELINE_BRIDGE_DEFAULT + '）\n  3) 浏览器控制台是否有 CORS / 网络错误');
  });
}

function timelineFetchAll(fetchOne, label, onDone, opts) {
  opts = opts || {};
  var games = Object.keys(TIMELINE_GAME_NAMES);
  var sel = document.getElementById('tlGame');
  var keepGame = sel ? sel.value : '';
  if (!opts.quiet) {
    timelineMsg('开始一键' + label + '：' + games.map(function (g) { return TIMELINE_GAME_NAMES[g]; }).join(' / ') + ' ...');
  }
  var lines = [];
  var ok = 0, fail = 0;

  var chain = Promise.resolve();
  games.forEach(function (g) {
    chain = chain.then(function () {
      return fetchOne(g).then(function (pack) {
        timelineMergeAndSave(g, pack, true);
        ok++;
        lines.push('  ✓ ' + (TIMELINE_GAME_NAMES[g] || g) + '：' + pack.events.length + ' 条');
      }).catch(function (e) {
        fail++;
        lines.push('  ✗ ' + (TIMELINE_GAME_NAMES[g] || g) + '：' + (e.message || e));
      });
    });
  });

  chain.then(function () {
    if (sel) {
      if (keepGame && sel.querySelector('option[value="' + keepGame + '"]')) sel.value = keepGame;
    }
    timelineRedraw();
    if (!opts.quiet) {
      timelineMsg('一键' + label + '完成：成功 ' + ok + ' / 失败 ' + fail + '\n' + lines.join('\n'));
    }
    if (typeof onDone === 'function') onDone(ok, fail, lines);
  });
}

function timelineUpdateSyncBadge(ts, state) {
  var el = document.getElementById('tlSyncStatus');
  if (!el) return;
  if (state === 'loading') {
    el.textContent = '⟳ 正在加载最新 JSON…';
    el.className = 'tl-sync-status is-loading';
    return;
  }
  el.className = 'tl-sync-status' + (state === 'warn' ? ' is-warn' : ' is-ok');
  el.textContent = ts ? 'JSON 更新：' + String(ts).replace('T', ' ') : '✓ 已加载本地 JSON';
}

function timelineFetchAllStatic() {
  timelineUpdateSyncBadge('', 'loading');
  timelineFetchAll(timelineDoFetchStatic, '加载本地 JSON', function (ok, fail) {
    timelineTouchLastSyncFromMeta(function (ts) {
      timelineUpdateSyncBadge(ts, fail ? 'warn' : 'ok');
    });
  });
}

function timelineTouchLastSyncFromMeta(done) {
  fetch(TIMELINE_META_FILE, { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (meta) {
      var ts = (meta && meta.updated_at) || '';
      if (ts) {
        try { localStorage.setItem(TIMELINE_LAST_SYNC_KEY, ts); } catch (e) {}
      }
      if (typeof done === 'function') done(ts);
    })
    .catch(function () {
      if (typeof done === 'function') done('');
    });
}

function timelineAutoLoadAllStatic(meta) {
  timelineUpdateSyncBadge('', 'loading');
  timelineFetchAll(timelineDoFetchStatic, '自动加载 JSON', function (ok, fail, lines) {
    timelineTouchLastSyncFromMeta(function (ts) {
      var stamp = ts || (meta && meta.updated_at) || '';
      timelineUpdateSyncBadge(stamp, fail ? 'warn' : 'ok');
      var summary = fail
        ? '自动加载 JSON：成功 ' + ok + ' / 失败 ' + fail + (stamp ? ' · ' + stamp : '') + '\n' + lines.join('\n')
        : '✓ 已自动加载最新 JSON' + (stamp ? '（' + String(stamp).replace('T', ' ') + '）' : '');
      timelineMsg(summary);
    });
  }, { quiet: true });
}

function timelineAutoSyncFromServer() {
  fetch('/api/timeline/sync-status')
    .then(function (r) { return r.json(); })
    .then(function (status) {
      if (status && status.running) {
        timelineUpdateSyncBadge('', 'loading');
        timelineMsg('后台正在拉取最新数据，完成后自动加载 JSON…');
        timelinePollSyncAndLoad(0);
        return;
      }
      timelineAutoLoadAllStatic(status && status.meta);
    })
    .catch(function () {
      timelineAutoLoadAllStatic(null);
    });
}

function timelinePollSyncAndLoad(attempts) {
  if (attempts > 60) {
    timelineAutoLoadAllStatic(null);
    return;
  }
  setTimeout(function () {
    fetch('/api/timeline/sync-status')
      .then(function (r) { return r.json(); })
      .then(function (status) {
        if (status && status.running) {
          timelinePollSyncAndLoad(attempts + 1);
          return;
        }
        timelineAutoLoadAllStatic(status && status.meta);
      })
      .catch(function () {
        timelineAutoLoadAllStatic(null);
      });
  }, 5000);
}

function timelineFetchAllBridge() {
  timelineFetchAll(function (g) { return timelineDoFetchBridge(g, 'official'); }, '桥接拉取（官方）');
}

function timelineBridgeHealth() {
  var base = timelineGetBridgeUrl();
  timelineMsg('正在检测 ' + base + '/health ...');
  fetch(base + '/health')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (t) { timelineMsg('桥接连通正常：' + t); })
    .catch(function (e) {
      timelineMsg('桥接不可达：' + (e.message || e) + '\n请先运行：node scripts/game-events-bridge.mjs');
    });
}

function timelineOpenSettings() {
  var modal = document.getElementById('tlSettings');
  if (!modal) return;
  var ta = document.getElementById('tlJson');
  if (ta) ta.value = JSON.stringify(timelineLoadData(), null, 2);
  modal.hidden = false;
  document.addEventListener('keydown', timelineSettingsEsc);
}

function timelineCloseSettings() {
  var modal = document.getElementById('tlSettings');
  if (modal) modal.hidden = true;
  document.removeEventListener('keydown', timelineSettingsEsc);
}

function timelineSettingsBg(ev) {
  if (ev.target && ev.target.id === 'tlSettings') timelineCloseSettings();
}

function timelineSettingsEsc(ev) {
  if (ev.key === 'Escape') timelineCloseSettings();
}
