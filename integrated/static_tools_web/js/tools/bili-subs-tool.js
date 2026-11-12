/**
 * B 站「订阅动态」整理：浏览器无法代发 Cookie，需本机 Node「桥接」或粘贴 JSON。
 */

function renderBiliTool(container) {
  container.innerHTML =
    "<h2>B 站订阅动态 · 按日整理</h2>" +
    "<p class=\"bili-note\">" +
    "网页<strong>不能直接执行</strong> <code>node scripts/bili-feed.mjs</code>，也不能读取你磁盘上的 <code>bili-feed.json</code>。请先在本机<strong>开一个桥接服务</strong>（见下），再把 Cookie 粘到框里，点一次即可完成拉取与分组。</p>" +
    "<details class=\"bili-details\"><summary>① 启动桥接（只需开着一个终端）</summary>" +
    "<p>在项目根目录执行并保持窗口不关：</p>" +
    "<pre class=\"bili-code\">node scripts/bili-bridge.mjs</pre>" +
    "<p>默认地址 <code>http://127.0.0.1:45790</code>。改端口可设环境变量 <code>BILI_BRIDGE_PORT</code>，并在下方填写相同端口。</p></details>" +
    "<h3 class=\"bili-subh\">一键拉取（等同命令行拉取 + 写入 JSON 再解析）</h3>" +
    '<label for="biliCookieInput" class="bili-label">Cookie（与 <code>scripts/bili-cookie.txt</code> 里整段相同）</label>' +
    '<textarea id="biliCookieInput" class="bili-cookie-area" rows="4" placeholder="SESSDATA=…; buvid3=…; （从浏览器开发者工具复制）"></textarea>' +
    '<div class="input-group bili-port-row"><label for="biliBridgePort">桥接端口</label>' +
    '<input type="number" id="biliBridgePort" value="45790" min="1024" max="65535" step="1" /></div>' +
    '<div class="button-group">' +
    '<button type="button" id="biliFetchBtn" onclick="biliFetchFromBridge()">拉取并自动整理</button>' +
    "</div>" +
    "<h3 class=\"bili-subh\">或：已有 JSON</h3>" +
    '<label for="biliJsonInput" class="bili-label">接口 JSON（也可由上方拉取后自动填入）</label>' +
    '<textarea id="biliJsonInput" class="bili-json-area" placeholder="粘贴 JSON 或由上一步自动填入"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="biliParseAndGroup()">仅解析并分组</button>' +
    '<button type="button" onclick="biliExportMd()">导出 Markdown</button>' +
    '<button type="button" onclick="biliExportBrief()">导出简报</button>' +
    '<button type="button" onclick="biliClearFeed()">清空</button>' +
    "</div>" +
    "<details class=\"bili-details\"><summary>备用：命令行生成 bili-feed.json</summary>" +
    "<pre class=\"bili-code\">node scripts/bili-feed.mjs -o bili-feed.json</pre>" +
    "<p>将生成文件全文粘贴到「已有 JSON」文本框，再点「仅解析并分组」。</p></details>" +
    '<pre id="biliFeedResult" class="output"></pre>';

  try {
    var last = localStorage.getItem("toolsite.bili.lastFeedJson");
    var cSaved = localStorage.getItem("toolsite.bili.cookie");
    var pSaved = localStorage.getItem("toolsite.bili.bridgePort");
    var ta = document.getElementById("biliJsonInput");
    var ca = document.getElementById("biliCookieInput");
    var pe = document.getElementById("biliBridgePort");
    if (ca && cSaved) ca.value = cSaved;
    if (pe && pSaved) pe.value = pSaved;
    if (ta && last) ta.value = last;
  } catch (e) {}
}

function biliFetchFromBridge() {
  var cookieTa = document.getElementById("biliCookieInput");
  var portEl = document.getElementById("biliBridgePort");
  var jsonTa = document.getElementById("biliJsonInput");
  var out = document.getElementById("biliFeedResult");
  var btn = document.getElementById("biliFetchBtn");
  var cookie = cookieTa ? cookieTa.value.trim() : "";
  if (!cookie) {
    if (out) out.textContent = "请先粘贴 Cookie（与 bili-cookie.txt 中内容相同）。";
    return;
  }
  var port = (portEl && portEl.value.trim()) || "45790";
  if (!/^\d+$/.test(port)) {
    if (out) out.textContent = "端口无效。";
    return;
  }
  try {
    localStorage.setItem("toolsite.bili.cookie", cookie);
    localStorage.setItem("toolsite.bili.bridgePort", port);
  } catch (e) {}
  var url = "http://127.0.0.1:" + port + "/api/bili-feed";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "拉取中…";
  }
  if (out) out.textContent = "正在请求本机桥接 " + url + " …";
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookie: cookie, maxPages: 25 })
  })
    .then(function (r) {
      return r.text().then(function (t) {
        var j;
        try {
          j = JSON.parse(t);
        } catch (e) {
          throw new Error("非 JSON：" + t.slice(0, 200));
        }
        if (!r.ok) throw new Error(j.error || t.slice(0, 300));
        return j;
      });
    })
    .then(function (j) {
      if (!j.ok) throw new Error(j.error || "桥接返回失败");
      var text = JSON.stringify(j.data, null, 2);
      if (jsonTa) jsonTa.value = text;
      try {
        localStorage.setItem("toolsite.bili.lastFeedJson", text);
      } catch (e) {}
      biliParseAndGroup();
    })
    .catch(function (e) {
      var msg = e.message || String(e);
      if (out) {
        out.textContent =
          "拉取失败：" +
          msg +
          "\n\n请先在本机项目目录执行并保持不关：\nnode scripts/bili-bridge.mjs\n\n（网页无法直接运行 node 或读取 bili-feed.json；桥接在本地用 Node 请求 B 站。）";
      }
    })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "拉取并自动整理";
      }
    });
}

function biliNormalizeItems(text) {
  var raw = (text || "").trim();
  if (!raw) return [];

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e1) {
    var blocks = [];
    var depth = 0;
    var start = -1;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          blocks.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
    var all = [];
    for (var b = 0; b < blocks.length; b++) {
      try {
        var j = JSON.parse(blocks[b]);
        all = all.concat(biliExtractItemsFromRoot(j));
      } catch (e2) {}
    }
    if (all.length) return all;
    throw new Error("无法解析 JSON");
  }

  return biliExtractItemsFromRoot(parsed);
}

function biliExtractItemsFromRoot(root) {
  if (!root) return [];
  if (Array.isArray(root)) {
    var acc = [];
    for (var i = 0; i < root.length; i++) acc = acc.concat(biliExtractItemsFromRoot(root[i]));
    return acc;
  }
  if (Array.isArray(root.items)) return root.items;
  if (root.data && Array.isArray(root.data.items)) return root.data.items;
  if (root.data && root.data.item) return [root.data.item];
  return [];
}

function biliPickPubTs(item) {
  var a = item.modules && item.modules.module_author;
  if (a && typeof a.pub_ts === "number") return a.pub_ts;
  if (typeof item.pub_ts === "number") return item.pub_ts;
  if (item.desc && typeof item.desc.timestamp === "number") {
    var t = item.desc.timestamp;
    return t > 1e12 ? Math.floor(t / 1000) : t;
  }
  var deep = biliDeepFindPubTs(item, 0);
  return deep || 0;
}

function biliDeepFindPubTs(obj, depth) {
  if (depth > 10 || !obj || typeof obj !== "object") return 0;
  if (typeof obj.pub_ts === "number") return obj.pub_ts;
  if (typeof obj.ctime === "number") return obj.ctime;
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    var t = biliDeepFindPubTs(v, depth + 1);
    if (t) return t;
  }
  return 0;
}

function biliPickAuthor(item) {
  var a = item.modules && item.modules.module_author;
  if (a && a.name) return a.name;
  if (item.author && item.author.name) return item.author.name;
  return "";
}

/** 避免出现整段 item JSON 或 JSON 字符串当标题 */
function biliSanitizeTitleText(s) {
  if (s == null || s === "") return "";
  var t = String(s).trim();
  if (t.startsWith("{") && (t.indexOf('"basic"') >= 0 || t.length > 80)) return "【图文/专栏动态】";
  return t.length > 240 ? t.slice(0, 240) + "…" : t;
}

function biliPickTitle(item) {
  var md = item.modules && item.modules.module_dynamic;
  if (!md) return biliFallbackTitle(item);
  var maj = md.major;
  if (maj) {
    if (maj.archive && maj.archive.title) return biliSanitizeTitleText(maj.archive.title);
    if (maj.opus) {
      if (maj.opus.title) return biliSanitizeTitleText(maj.opus.title);
      if (maj.opus.summary) return biliSanitizeTitleText(String(maj.opus.summary).replace(/\s+/g, " "));
    }
  }
  if (md.desc && md.desc.text) {
    var raw = String(md.desc.text).trim();
    if (raw && !raw.startsWith("{")) return biliSanitizeTitleText(raw.replace(/\s+/g, " ").slice(0, 220));
  }
  return biliFallbackTitle(item);
}

function biliFallbackTitle(item) {
  var md = item.modules && item.modules.module_dynamic;
  var maj = md && md.major;
  if (maj && maj.opus) {
    if (maj.opus.title) return biliSanitizeTitleText(maj.opus.title);
    if (maj.opus.summary) return biliSanitizeTitleText(String(maj.opus.summary).replace(/\s+/g, " ").slice(0, 200));
  }
  return "【动态】";
}

function biliPickLink(item) {
  var md = item.modules && item.modules.module_dynamic;
  if (md && md.major && md.major.archive && md.major.archive.bvid) {
    return "https://www.bilibili.com/video/" + md.major.archive.bvid;
  }
  if (item.basic && item.basic.rid_str) return "https://t.bilibili.com/" + item.basic.rid_str;
  if (item.id_str) return "https://t.bilibili.com/" + item.id_str;
  return "";
}

function biliFormatDay(tsSec) {
  if (!tsSec) return "日期未知";
  var d = new Date(tsSec * 1000);
  if (isNaN(d.getTime())) return "日期未知";
  var p = function (n) {
    return (n < 10 ? "0" : "") + n;
  };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function biliParseAndGroup() {
  var ta = document.getElementById("biliJsonInput");
  var out = document.getElementById("biliFeedResult");
  if (!ta || !out) return;
  var items;
  try {
    items = biliNormalizeItems(ta.value);
  } catch (e) {
    out.textContent = "解析失败：" + (e.message || e);
    return;
  }
  if (!items.length) {
    out.textContent = "未找到 items，请确认粘贴的是 feed/all 或 feed/nav 等返回的 JSON。";
    return;
  }

  try {
    localStorage.setItem("toolsite.bili.lastFeedJson", ta.value);
  } catch (e) {}

  var groups = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ts = biliPickPubTs(it);
    var day = biliFormatDay(ts);
    if (!groups[day]) groups[day] = [];
    groups[day].push({
      ts: ts,
      author: biliPickAuthor(it),
      title: biliPickTitle(it),
      link: biliPickLink(it)
    });
  }

  var days = Object.keys(groups).sort(function (a, b) {
    if (a === "日期未知") return 1;
    if (b === "日期未知") return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  var lines = ["共 " + items.length + " 条动态，按本地日历日分组：", ""];
  for (var d = 0; d < days.length; d++) {
    var day = days[d];
    lines.push("【" + day + "】共 " + groups[day].length + " 条");
    var list = groups[day].slice().sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    for (var j = 0; j < list.length; j++) {
      var row = list[j];
      var time = row.ts ? new Date(row.ts * 1000).toLocaleString("zh-CN", { hour12: false }) : "";
      lines.push(
        "- " + (row.author ? "「" + row.author + "」" : "") + (row.title ? row.title : "(无标题)") + (row.link ? " " + row.link : "") + (time ? " · " + time : "")
      );
    }
    lines.push("");
  }

  window.__biliFeedGrouped = { groups: groups, days: days, items: items };
  out.textContent = lines.join("\n");
}

function biliExportMd() {
  var out = document.getElementById("biliFeedResult");
  if (!window.__biliFeedGrouped || !window.__biliFeedGrouped.groups) {
    if (out) out.textContent = "请先「解析并分组」";
    return;
  }
  var g = window.__biliFeedGrouped.groups;
  var days = window.__biliFeedGrouped.days.slice();
  var md = ["# B 站订阅动态整理", "", "> 导出时间：" + new Date().toLocaleString("zh-CN") + "", ""];
  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    md.push("## " + day);
    md.push("");
    var list = g[day].slice().sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    for (var j = 0; j < list.length; j++) {
      var row = list[j];
      var line = "- ";
      if (row.author) line += "**" + row.author + "**：";
      line += biliSanitizeTitleText((row.title || "").replace(/\n/g, " "));
      if (row.link) line += " [" + row.link + "](" + row.link + ")";
      md.push(line);
    }
    md.push("");
  }
  var text = md.join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        if (out) out.textContent = "已复制 Markdown 到剪贴板（共 " + days.length + " 天）";
      },
      function () {
        biliFallbackCopy(text, out);
      }
    );
  } else {
    biliFallbackCopy(text, out);
  }
}

function biliBriefTruncate(s, max) {
  max = max || 96;
  if (!s) return "";
  var t = String(s).replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function biliAuthorStats(groups, days) {
  var map = {};
  for (var d = 0; d < days.length; d++) {
    var list = groups[days[d]] || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i].author || "（未命名）";
      map[a] = (map[a] || 0) + 1;
    }
  }
  return Object.keys(map)
    .map(function (k) {
      return { name: k, n: map[k] };
    })
    .sort(function (a, b) {
      return b.n - a.n;
    });
}

function biliExportBrief() {
  var out = document.getElementById("biliFeedResult");
  if (!window.__biliFeedGrouped || !window.__biliFeedGrouped.groups) {
    if (out) out.textContent = "请先「解析并分组」或「拉取并自动整理」";
    return;
  }
  var g = window.__biliFeedGrouped.groups;
  var days = window.__biliFeedGrouped.days.slice();
  var items = window.__biliFeedGrouped.items || [];
  var total = items.length;
  var dayLabels = days.filter(function (x) {
    return x !== "日期未知";
  });
  var unknown = days.indexOf("日期未知") >= 0;
  var range =
    dayLabels.length >= 2
      ? dayLabels[0] + " ~ " + dayLabels[dayLabels.length - 1]
      : dayLabels.length === 1
        ? dayLabels[0]
        : "（无日期）";
  var lines = [];
  lines.push("# B 站订阅简报");
  lines.push("");
  lines.push("> 生成于：" + new Date().toLocaleString("zh-CN"));
  lines.push("> 区间：" + range + " · 共 **" + dayLabels.length + "** 个日历日 · **" + total + "** 条动态" + (unknown ? "（另含「日期未知」若干）" : ""));
  lines.push("> 说明：标题过长已截断；无法解析的图文已显示为「图文/专栏动态」。");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 数据速览");
  lines.push("");
  lines.push("| 日期 | 条数 |");
  lines.push("| --- | ---: |");
  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    lines.push("| " + day + " | " + (g[day] ? g[day].length : 0) + " |");
  }
  lines.push("");
  var stats = biliAuthorStats(g, days);
  var top = stats.slice(0, 12);
  lines.push("**本期活跃 UP（按条数，前 12）**：");
  if (!top.length) lines.push("（无）");
  else {
    lines.push(
      top
        .map(function (x) {
          return "- **" + x.name + "** ×" + x.n;
        })
        .join("\n")
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 按日清单");
  lines.push("");
  for (var di = 0; di < days.length; di++) {
    var dkey = days[di];
    var list = (g[dkey] || []).slice().sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    lines.push("### " + dkey + "（" + list.length + " 条）");
    lines.push("");
    for (var j = 0; j < list.length; j++) {
      var row = list[j];
      var title = biliBriefTruncate(biliSanitizeTitleText(row.title || "【无标题】"), 100);
      var au = row.author ? "**" + row.author + "**" : "（未知）";
      var link = row.link ? " [" + row.link + "](" + row.link + ")" : "";
      lines.push(j + 1 + ". " + au + " · " + title + link);
    }
    lines.push("");
  }
  var text = lines.join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        if (out) out.textContent = "已复制「简报」Markdown 到剪贴板（含速览表 + 按日清单）";
      },
      function () {
        biliFallbackCopy(text, out);
      }
    );
  } else {
    biliFallbackCopy(text, out);
  }
}

function biliFallbackCopy(text, out) {
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (out) out.textContent = "已复制 Markdown（execCommand）";
  } catch (e) {
    if (out) out.textContent = text;
  }
  document.body.removeChild(ta);
}

function biliClearFeed() {
  var ta = document.getElementById("biliJsonInput");
  var ca = document.getElementById("biliCookieInput");
  var out = document.getElementById("biliFeedResult");
  if (ta) ta.value = "";
  if (ca) ca.value = "";
  if (out) out.textContent = "";
  window.__biliFeedGrouped = null;
  try {
    localStorage.removeItem("toolsite.bili.lastFeedJson");
    localStorage.removeItem("toolsite.bili.cookie");
  } catch (e) {}
}
