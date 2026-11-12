var GAMEDOCS_DATA_FILE = "./assets/gamedocs-records.json";
var GAMEDOCS_CHAR_COLORS = {
  "咚！炽愿吉星": "#e74c3c",
  "诡戏千役【友情出演】": "#9b59b6",
  "孑遗千星": "#3498db"
};

var gamedocsState = {
  records: [],
  activeId: null,
  loading: false,
  error: null
};

function gamedocsEsc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

var GAMEDOCS_PLATFORM_LABEL = {
  bilibili: "B 站",
  miyoushe: "米游社"
};

function gamedocsDetectPlatform(url) {
  if (!url) return "";
  if (/bilibili\.com/i.test(url)) return "bilibili";
  if (/miyoushe\.com/i.test(url)) return "miyoushe";
  if (/taptap\.cn/i.test(url)) return "miyoushe";
  return "";
}

function gamedocsRenderSourceItem(s) {
  var platform = s.platform || gamedocsDetectPlatform(s.url);
  var platLabel = GAMEDOCS_PLATFORM_LABEL[platform] || "";
  var meta = [platLabel, s.author, s.type === "video" ? "视频" : s.type === "official" ? "官方" : s.type === "topic" ? "话题" : "帖子"]
    .filter(Boolean)
    .join(" · ");
  var inner =
    (meta ? '<span class="gd-src-meta">' + gamedocsEsc(meta) + "</span>" : "") +
    '<span class="gd-src-label">' + gamedocsEsc(s.label) + "</span>" +
    (s.note ? '<span class="gd-src-note">' + gamedocsEsc(s.note) + "</span>" : "");
  return s.url
    ? '<li class="gd-src-item"><a href="' + gamedocsEsc(s.url) + '" target="_blank" rel="noopener">' + inner + "</a></li>"
    : '<li class="gd-src-item">' + inner + "</li>";
}

function gamedocsFormatKeys(text) {
  if (!text) return "";
  var escaped = gamedocsEsc(text);
  return escaped
    .replace(/长按(J|E|I|Q|R|Shift)/g, '<kbd class="gd-kb gd-kb-hold">长按$1</kbd>')
    .replace(/(J|E|I|Q|R|Shift)(×\d+)/g, '<kbd class="gd-kb">$1</kbd>$2')
    .replace(/(→|\/)/g, '<span class="gd-kb-sep">$1</span>')
    .replace(/\b(J|E|I|Q|R|Shift)\b/g, '<kbd class="gd-kb">$1</kbd>')
    .replace(/(?:^|<span class="gd-kb-sep">→<\/span>\s*)([123])(?=\s*(?:<span class="gd-kb-sep">→<\/span>|$))/g, '<kbd class="gd-kb gd-kb-num">$1</kbd>')
    .replace(/^([123])(?=\s*(?:<span class="gd-kb-sep">→<\/span>|$))/g, '<kbd class="gd-kb gd-kb-num">$1</kbd>');
}

function gamedocsRenderKeyLegend(legend) {
  if (!legend || !legend.length) return "";
  return (
    '<section class="gd-section gd-keys">' +
      '<h3 class="gd-section-title">按键说明</h3>' +
      '<div class="gd-key-legend">' +
        legend.map(function (item) {
          return '<span class="gd-key-item"><kbd class="gd-kb">' + gamedocsEsc(item.key) + "</kbd> " + gamedocsEsc(item.label) + "</span>";
        }).join("") +
      "</div>" +
    "</section>"
  );
}

function gamedocsActorColor(actor) {
  if (!actor) return "#7f8c8d";
  var keys = Object.keys(GAMEDOCS_CHAR_COLORS);
  for (var i = 0; i < keys.length; i++) {
    if (actor.indexOf(keys[i]) !== -1) return GAMEDOCS_CHAR_COLORS[keys[i]];
  }
  return "#2c3e50";
}

function gamedocsLoadRecords() {
  if (gamedocsState.loading) return Promise.resolve(gamedocsState.records);
  gamedocsState.loading = true;
  return fetch(GAMEDOCS_DATA_FILE, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      gamedocsState.records = (data && data.records) || [];
      gamedocsState.error = null;
      return gamedocsState.records;
    })
    .catch(function (err) {
      gamedocsState.error = err.message || String(err);
      gamedocsState.records = [];
      return [];
    })
    .finally(function () {
      gamedocsState.loading = false;
    });
}

function gamedocsFindRecord(id) {
  return gamedocsState.records.find(function (r) { return r.id === id; }) || null;
}

function gamedocsRenderList(container) {
  var records = gamedocsState.records;
  var cards = records.map(function (r) {
    var team = (r.team || []).map(function (t) { return t.name; }).join(" · ");
    return (
      '<button type="button" class="gd-card' + (gamedocsState.activeId === r.id ? " is-active" : "") + '" data-id="' + gamedocsEsc(r.id) + '">' +
        '<span class="gd-card-game">' + gamedocsEsc(r.gameName || r.game) + '</span>' +
        '<strong class="gd-card-title">' + gamedocsEsc(r.title) + '</strong>' +
        '<span class="gd-card-team">' + gamedocsEsc(team) + '</span>' +
        (r.tags && r.tags.length ? '<span class="gd-card-tags">' + r.tags.map(function (t) { return '<span class="gd-tag">' + gamedocsEsc(t) + "</span>"; }).join("") + "</span>" : "") +
      "</button>"
    );
  }).join("");

  container.innerHTML =
    '<h2>文档记录</h2>' +
    '<p class="gd-intro">收集游戏角色/队伍输出手法：步骤以 <kbd class="gd-kb">J</kbd> 普攻、<kbd class="gd-kb">E</kbd> 技能、<kbd class="gd-kb">I</kbd> 大招等按键简记。参考来源优先 B 站 / 米游社。</p>' +
    (gamedocsState.error ? '<p class="gd-error">加载失败：' + gamedocsEsc(gamedocsState.error) + "</p>" : "") +
    (records.length ? '<div class="gd-list">' + cards + "</div>" : '<p class="gd-empty">暂无记录。</p>') +
    '<div id="gdDetail" class="gd-detail-wrap"></div>';

  container.querySelectorAll(".gd-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-id");
      gamedocsState.activeId = id;
      container.querySelectorAll(".gd-card").forEach(function (c) {
        c.classList.toggle("is-active", c.getAttribute("data-id") === id);
      });
      gamedocsRenderDetail(container.querySelector("#gdDetail"), id);
      var detail = container.querySelector("#gdDetail");
      if (detail) {
        var top = detail.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    });
  });

  if (gamedocsState.activeId && gamedocsFindRecord(gamedocsState.activeId)) {
    gamedocsRenderDetail(container.querySelector("#gdDetail"), gamedocsState.activeId);
  } else if (records.length === 1) {
    gamedocsState.activeId = records[0].id;
    var first = container.querySelector('.gd-card[data-id="' + records[0].id + '"]');
    if (first) first.classList.add("is-active");
    gamedocsRenderDetail(container.querySelector("#gdDetail"), records[0].id);
  }
}

function gamedocsRenderImages(images) {
  if (!images || !images.length) return "";
  return (
    '<section class="gd-section">' +
      '<h3 class="gd-section-title">截图 / 示意</h3>' +
      '<div class="gd-images">' +
        images.map(function (img, i) {
          var color = ["#e74c3c", "#9b59b6", "#3498db"][i % 3];
          return (
            '<figure class="gd-figure">' +
              '<div class="gd-figure-placeholder" style="--gd-accent:' + color + '">' +
                '<span class="gd-figure-num">' + (i + 1) + "</span>" +
                '<span class="gd-figure-cap">' + gamedocsEsc(img.caption) + "</span>" +
              "</div>" +
              (img.src ? '<img src="' + gamedocsEsc(img.src) + '" alt="' + gamedocsEsc(img.caption) + '" loading="lazy">' : "") +
              (img.note ? '<figcaption>' + gamedocsEsc(img.note) + "</figcaption>" : "") +
            "</figure>"
          );
        }).join("") +
      "</div>" +
    "</section>"
  );
}

function gamedocsRenderTimeline(phases) {
  if (!phases || !phases.length) return "";
  var html = '<section class="gd-section"><h3 class="gd-section-title">输出时间轴</h3>';
  phases.forEach(function (phase) {
    html += '<div class="gd-phase"><h4 class="gd-phase-name">' + gamedocsEsc(phase.name) + "</h4>";
    html += '<ol class="gd-timeline">';
    (phase.steps || []).forEach(function (step, idx) {
      var color = gamedocsActorColor(step.actor);
      html +=
        '<li class="gd-step">' +
          '<div class="gd-step-rail">' +
            '<span class="gd-step-time">' + gamedocsEsc(step.time || "—") + "</span>" +
            (idx < phase.steps.length - 1 ? '<span class="gd-step-line"></span>' : "") +
          "</div>" +
          '<div class="gd-step-body">' +
            '<span class="gd-step-actor" style="--gd-actor:' + color + '">' + gamedocsEsc(step.actor) + "</span>" +
            '<div class="gd-step-action">' + gamedocsFormatKeys(step.action) + "</div>" +
            (step.detail ? '<div class="gd-step-detail">' + gamedocsEsc(step.detail) + "</div>" : "") +
          "</div>" +
        "</li>";
    });
    html += "</ol></div>";
  });
  html += "</section>";
  return html;
}

function gamedocsRenderDetail(host, id) {
  if (!host) return;
  var r = gamedocsFindRecord(id);
  if (!r) {
    host.innerHTML = "";
    return;
  }

  var teamHtml = (r.team || []).map(function (t) {
    var color = gamedocsActorColor(t.name);
    return (
      '<div class="gd-team-card" style="--gd-actor:' + color + '">' +
        '<strong>' + gamedocsEsc(t.name) + "</strong>" +
        '<span>' + gamedocsEsc(t.role) + "</span>" +
        '<small>' + gamedocsEsc(t.element) + " · " + gamedocsEsc(t.ring) + "</small>" +
      "</div>"
    );
  }).join("");

  var notesHtml = (r.characterNotes || []).map(function (cn) {
    return (
      '<div class="gd-char-note">' +
        '<h4>' + gamedocsEsc(cn.name) + "</h4>" +
        "<ul>" + (cn.points || []).map(function (p) { return "<li>" + gamedocsFormatKeys(p) + "</li>"; }).join("") + "</ul>" +
      "</div>"
    );
  }).join("");

  var sourcesHtml = (r.sources || []).map(gamedocsRenderSourceItem).join("");

  host.innerHTML =
    '<article class="gd-detail">' +
      '<header class="gd-detail-head">' +
        '<span class="gd-detail-game">' + gamedocsEsc(r.gameName) + "</span>" +
        "<h3>" + gamedocsEsc(r.title) + "</h3>" +
        (r.summary ? '<p class="gd-summary">' + gamedocsEsc(r.summary) + "</p>" : "") +
        (r.synergy ? '<p class="gd-synergy"><b>机制要点：</b>' + gamedocsEsc(r.synergy) + "</p>" : "") +
      "</header>" +
      '<div class="gd-team-grid">' + teamHtml + "</div>" +
      gamedocsRenderKeyLegend(r.keyLegend) +
      gamedocsRenderImages(r.images) +
      gamedocsRenderTimeline(r.phases) +
      (notesHtml ? '<section class="gd-section"><h3 class="gd-section-title">角色要点</h3><div class="gd-char-notes">' + notesHtml + "</div></section>" : "") +
      (sourcesHtml ? '<section class="gd-section gd-sources"><h3 class="gd-section-title">参考来源（B 站 / 米游社）</h3><ul class="gd-src-list">' + sourcesHtml + "</ul></section>" : "") +
    "</article>";
}

function renderGamedocsTool(container) {
  container.innerHTML = '<h2>文档记录</h2><p class="gd-loading">加载中…</p>';
  gamedocsLoadRecords().then(function () {
    gamedocsRenderList(container);
  });
}
