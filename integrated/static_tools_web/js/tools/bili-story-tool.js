/**
 * B 站热评段子筛选 → 番茄短篇章节大纲
 * 评论拉取需本机 node scripts/bili-bridge.mjs
 */

function renderBilistoryTool(container) {
  container.innerHTML =
    "<h2>B 站热评 · 段子大纲</h2>" +
    "<p class=\"bili-note\">从视频<strong>热门评论</strong>里筛出有叙事感的段子，整理成番茄短篇可用的<strong>分章提纲</strong>。" +
    "仅供创作参考；发布前请自行改写，勿照搬他人评论原文。<strong>大纲只基于你选定的一条评论扩写</strong>，不会混入其他评论。网页需通过本机桥接拉取评论（与「B 站订阅」相同）。</p>" +
    "<details class=\"bili-details\"><summary>① 启动桥接</summary>" +
    "<pre class=\"bili-code\">node scripts/bili-bridge.mjs</pre></details>" +
    "<h3 class=\"bili-subh\">排行榜与参数</h3>" +
    '<div class="input-group bili-port-row">' +
    '<label for="biliStoryRid">排行榜分区</label>' +
    '<select id="biliStoryRid">' +
    '<option value="0" selected>全站</option>' +
    '<option value="5">娱乐</option>' +
    '<option value="160">生活</option>' +
    '<option value="119">鬼畜</option>' +
    '<option value="4">游戏</option>' +
    '<option value="1">动画</option>' +
    '<option value="3">音乐</option>' +
    '<option value="36">科技</option>' +
    '<option value="188">数码</option>' +
    '<option value="181">影视</option>' +
    "</select>" +
    '<label for="biliStoryRankLimit">取榜前几个视频</label><input type="number" id="biliStoryRankLimit" value="8" min="1" max="30" />' +
    '<label for="biliStoryPort">桥接端口</label><input type="number" id="biliStoryPort" value="45790" min="1024" max="65535" />' +
    '<label for="biliStoryPages">每视频评论页数</label><input type="number" id="biliStoryPages" value="3" min="1" max="20" />' +
    '<label for="biliStoryMinScore">段子最低分</label><input type="number" id="biliStoryMinScore" value="48" min="0" max="100" />' +
    '<label for="biliStoryChapterCount">章节数</label><input type="number" id="biliStoryChapterCount" value="6" min="3" max="12" />' +
    '<label for="biliStoryPickIndex">用第几条段子</label><input type="number" id="biliStoryPickIndex" value="1" min="1" title="在下方候选列表中的序号，大纲只扩写这一条" />' +
    "</div>" +
    '<label for="biliStoryCookie" class="bili-label">Cookie（拉评论需要，与「B 站订阅」相同）</label>' +
    '<textarea id="biliStoryCookie" class="bili-cookie-area" rows="3" placeholder="SESSDATA=…"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" id="biliStoryFetchBtn" onclick="biliStoryFetchComments()">从排行榜拉评并生成大纲</button>' +
    '<button type="button" onclick="biliStoryFromJson()">仅从 JSON 生成 / 换一条段子</button>' +
    '<button type="button" onclick="biliStoryExportMd()">复制 Markdown 大纲</button>' +
    '<button type="button" onclick="biliStoryClear()">清空</button>' +
    "</div>" +
    "<details class=\"bili-details\"><summary>可选：额外指定 BV（会与排行榜合并）</summary>" +
    '<textarea id="biliStoryVideos" class="bili-json-area" rows="2" placeholder="留空则只用排行榜；每行一个 BV 或链接"></textarea></details>' +
    '<label for="biliStoryJson" class="bili-label">评论 JSON（拉取后自动填入，也可手贴）</label>' +
    '<textarea id="biliStoryJson" class="bili-json-area" rows="6" placeholder="{\"comments\":[…]}"></textarea>' +
    '<pre id="biliStoryResult" class="output"></pre>';

  try {
    var c = localStorage.getItem("toolsite.bili.cookie");
    var p = localStorage.getItem("toolsite.bili.bridgePort");
    var v = localStorage.getItem("toolsite.bilistory.videos");
    var r = localStorage.getItem("toolsite.bilistory.rid");
    var rl = localStorage.getItem("toolsite.bilistory.rankLimit");
    if (c && document.getElementById("biliStoryCookie")) document.getElementById("biliStoryCookie").value = c;
    if (p && document.getElementById("biliStoryPort")) document.getElementById("biliStoryPort").value = p;
    if (v && document.getElementById("biliStoryVideos")) document.getElementById("biliStoryVideos").value = v;
    if (r && document.getElementById("biliStoryRid")) document.getElementById("biliStoryRid").value = r;
    if (rl && document.getElementById("biliStoryRankLimit")) document.getElementById("biliStoryRankLimit").value = rl;
    var pi = localStorage.getItem("toolsite.bilistory.pickIndex");
    if (pi && document.getElementById("biliStoryPickIndex")) document.getElementById("biliStoryPickIndex").value = pi;
  } catch (e) {}
}

function biliStoryFetchComments() {
  var videosTa = document.getElementById("biliStoryVideos");
  var cookieTa = document.getElementById("biliStoryCookie");
  var portEl = document.getElementById("biliStoryPort");
  var pagesEl = document.getElementById("biliStoryPages");
  var ridEl = document.getElementById("biliStoryRid");
  var rankLimitEl = document.getElementById("biliStoryRankLimit");
  var jsonTa = document.getElementById("biliStoryJson");
  var out = document.getElementById("biliStoryResult");
  var btn = document.getElementById("biliStoryFetchBtn");

  var extraVideos = (videosTa ? videosTa.value : "")
    .split(/\r?\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var cookie = cookieTa ? cookieTa.value.trim() : "";
  if (!cookie) {
    if (out) out.textContent = "请粘贴 Cookie。";
    return;
  }
  var port = (portEl && portEl.value.trim()) || "45790";
  var rid = parseInt(ridEl && ridEl.value, 10);
  var rankLimit = parseInt(rankLimitEl && rankLimitEl.value, 10) || 8;
  if (isNaN(rid)) rid = 0;
  try {
    localStorage.setItem("toolsite.bili.cookie", cookie);
    localStorage.setItem("toolsite.bili.bridgePort", port);
    localStorage.setItem("toolsite.bilistory.videos", videosTa ? videosTa.value : "");
    localStorage.setItem("toolsite.bilistory.rid", String(rid));
    localStorage.setItem("toolsite.bilistory.rankLimit", String(rankLimit));
  } catch (e) {}

  if (btn) {
    btn.disabled = true;
    btn.textContent = "拉取中…";
  }
  if (out) out.textContent = "正在从排行榜取视频并拉评论（榜前 " + rankLimit + " 个）…";

  fetch("http://127.0.0.1:" + port + "/api/bili-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cookie: cookie,
      source: "ranking",
      rid: rid,
      rankLimit: rankLimit,
      videos: extraVideos,
      maxPagesPerVideo: parseInt(pagesEl && pagesEl.value, 10) || 3,
      mode: 3,
    }),
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
      if (!j.ok) throw new Error(j.error || "失败");
      var text = JSON.stringify(j.data, null, 2);
      if (jsonTa) jsonTa.value = text;
      biliStoryFromJson();
    })
    .catch(function (e) {
      if (out) {
        out.textContent =
          "拉取失败：" +
          (e.message || e) +
          "\n\n请先运行：node scripts/bili-bridge.mjs";
      }
    })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "从排行榜拉评并生成大纲";
      }
    });
}

function biliStoryFromJson() {
  var jsonTa = document.getElementById("biliStoryJson");
  var out = document.getElementById("biliStoryResult");
  var minScore = parseInt(document.getElementById("biliStoryMinScore") && document.getElementById("biliStoryMinScore").value, 10);
  var chapterCount = parseInt(document.getElementById("biliStoryChapterCount") && document.getElementById("biliStoryChapterCount").value, 10);
  var pickIndex = parseInt(document.getElementById("biliStoryPickIndex") && document.getElementById("biliStoryPickIndex").value, 10);
  if (isNaN(minScore)) minScore = 48;
  if (isNaN(chapterCount) || chapterCount < 3) chapterCount = 6;
  if (isNaN(pickIndex) || pickIndex < 1) pickIndex = 1;
  try {
    localStorage.setItem("toolsite.bilistory.pickIndex", String(pickIndex));
  } catch (e) {}

  var pack;
  try {
    pack = JSON.parse((jsonTa && jsonTa.value) || "{}");
  } catch (e) {
    if (out) out.textContent = "JSON 解析失败：" + e.message;
    return;
  }
  var comments = pack.comments || [];
  if (!comments.length) {
    if (out) out.textContent = "comments 为空，请先拉取或粘贴评论数据。";
    return;
  }

  var scored = comments
    .map(function (c) {
      return biliStoryScoreComment(c);
    })
    .filter(function (c) {
      return c.score >= minScore;
    })
    .sort(function (a, b) {
      return b.score - a.score || b.like - a.like;
    });

  var core = scored[pickIndex - 1] || scored[0];
  var usedIndex = scored.indexOf(core) + 1;

  var outline = biliStoryBuildOutline(core, chapterCount, usedIndex);
  window.__biliStoryPack = {
    pack: pack,
    scored: scored,
    outline: outline,
    minScore: minScore,
    pickIndex: usedIndex,
    core: core,
  };

  var lines = [];
  if (pack.ranking && pack.ranking.videos && pack.ranking.videos.length) {
    lines.push(
      "排行榜：" +
        (pack.ranking.partition || "全站") +
        " · 榜前 " +
        pack.ranking.picked +
        " 个视频 · 共 " +
        (pack.videos ? pack.videos.length : 0) +
        " 个视频拉评"
    );
    for (var vi = 0; vi < Math.min(8, pack.ranking.videos.length); vi++) {
      var v = pack.ranking.videos[vi];
      lines.push("  #" + v.rank + " " + v.bvid + " · " + biliStoryBrief(v.title, 50));
    }
    lines.push("");
  }
  lines.push("共拉取 " + comments.length + " 条评论，筛出段子候选 " + scored.length + " 条（最低分 " + minScore + "）");
  lines.push("");
  if (scored.length) {
    lines.push("=== 段子候选（共 " + scored.length + " 条，全文）===");
    lines.push("提示：修改上方「用第几条段子」后点「仅从 JSON 生成 / 换一条段子」可换核心评论");
    lines.push("");
    for (var i = 0; i < scored.length; i++) {
      var s = scored[i];
      var mark = i + 1 === usedIndex ? " ★ 当前用于大纲" : "";
      lines.push("");
      lines.push("[" + (i + 1) + "] 分" + s.score + " · 👍" + s.like + " · @" + (s.uname || "?") + mark);
      if (s.videoTitle) lines.push("来源：" + (s.videoBvid || "") + " · " + s.videoTitle);
      lines.push("---");
      lines.push(s.message);
    }
    lines.push("");
    lines.push("=== 大纲依据：第 " + usedIndex + " 条（仅此一条扩写）===");
    lines.push("");
  } else {
    lines.push("未筛到足够像段子的评论，可尝试：换评论多的视频、增加页数、降低最低分。");
    lines.push("");
  }
  lines.push(outline.text);
  if (out) out.textContent = lines.join("\n");
}

function biliStoryBrief(s, max) {
  var t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function biliStoryScoreComment(c) {
  var msg = String(c.message || "").replace(/\s+/g, " ").trim();
  var like = c.like || 0;
  var score = 0;
  var len = msg.length;

  if (len < 18) return { message: msg, like: like, uname: c.uname, score: 0, reasons: ["过短"] };
  if (len > 1200) score -= 15;

  if (len >= 40 && len <= 600) score += 18;
  else if (len >= 25 && len <= 900) score += 10;

  score += Math.min(22, Math.log10(like + 1) * 8);

  var narrative = /我|他|她|我们|有一天|那天|结果|没想到|后来|突然|居然|竟然|于是|从此|最后|原来|其实|上班|老板|同事|老师|同学|老婆|老公|爸|妈|朋友|宿舍|公司|学校/g;
  var hits = (msg.match(narrative) || []).length;
  score += Math.min(20, hits * 3);

  if (/[「」""『』]/.test(msg)) score += 8;
  if (/反转|结局|神转折|离谱|整活|绷不住|笑死|绝了/.test(msg)) score += 6;
  if (/[。！？!?]/.test(msg)) score += 4;
  if ((msg.match(/[。！？!?]/g) || []).length >= 2) score += 5;

  if (/https?:\/\//.test(msg)) score -= 12;
  if (/^@|回复@/.test(msg)) score -= 10;
  if (/抽奖|置顶|优惠券|加群|关注|三连|投币|下载|链接/.test(msg)) score -= 18;
  if (/^[?\s\d，。！？、]+$/.test(msg)) score -= 30;
  if ((msg.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length > 8) score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    message: msg,
    like: like,
    uname: c.uname,
    videoTitle: c.videoTitle,
    videoBvid: c.videoBvid,
    score: score,
  };
}

function biliStoryExtractTheme(msg) {
  if (/上班|公司|老板|同事|打工|面试/.test(msg)) return "职场";
  if (/学校|老师|同学|考试|宿舍|大学|高中/.test(msg)) return "校园";
  if (/老婆|老公|恋爱|相亲|分手|男朋友|女朋友/.test(msg)) return "情感";
  if (/爸|妈|父母|亲戚|过年|回家/.test(msg)) return "家庭";
  if (/游戏|原神|王者|steam|开黑/.test(msg)) return "游戏";
  return "都市生活";
}

function biliStoryExtractHook(msg) {
  var first = msg.split(/[。！？!?]/)[0];
  return biliStoryBrief(first || msg, 80);
}

function biliStoryExtractTwist(msg) {
  var parts = msg.split(/[。！？!?]/).filter(Boolean);
  if (parts.length >= 2) return biliStoryBrief(parts[parts.length - 1], 100);
  return "在结尾揭示与开头预期相反的真相或笑点";
}

function biliStorySplitSentences(msg) {
  var parts = String(msg || "")
    .split(/[。！？!?…]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 1;
    });
  return parts.length ? parts : [String(msg || "").trim()];
}

function biliStorySegmentForChapter(sentences, chapterIndex, chapterCount) {
  var n = sentences.length;
  if (n === 1) return { text: sentences[0], index: 0 };
  if (chapterIndex <= 0) return { text: sentences[0], index: 0 };
  if (chapterIndex >= chapterCount - 1) return { text: sentences[n - 1], index: n - 1 };
  var ratio = chapterIndex / (chapterCount - 1);
  var idx = Math.round(ratio * (n - 1));
  if (idx <= 0) idx = 1;
  if (idx >= n - 1) idx = n - 2;
  return { text: sentences[idx], index: idx };
}

function biliStoryChapterMeta(chapterIndex, chapterCount) {
  if (chapterIndex === 0) {
    return { name: "开篇", role: "呈现原评开头，建立人物与情境" };
  }
  if (chapterIndex === chapterCount - 1) {
    return { name: "结局", role: "落地原评结尾的反转或笑点，收束全篇" };
  }
  if (chapterIndex === 1) {
    return { name: "起势", role: "顺着原评第一句往下铺，补充必要背景" };
  }
  if (chapterIndex === chapterCount - 2) {
    return { name: "高潮前夜", role: "把原评后半段的冲突推到临界点" };
  }
  return { name: "推进", role: "同一事件线内继续展开，不跳线、不插新梗" };
}

function biliStoryBuildOutline(core, chapterCount, pickIndex) {
  if (!core || !core.message) {
    return {
      md: "# 未生成大纲\n\n请先筛出至少 1 条段子评论。",
      text: "=== 未生成章节大纲（无段子候选）===",
    };
  }

  var msg = core.message;
  var sentences = biliStorySplitSentences(msg);
  var theme = biliStoryExtractTheme(msg);
  var hook = sentences[0];
  var twist = sentences.length > 1 ? sentences[sentences.length - 1] : biliStoryExtractTwist(msg);
  var title = theme + "短篇：" + biliStoryBrief(hook.replace(/^我/, "他"), 20);

  var md = [];
  md.push("# 短篇大纲：" + title);
  md.push("");
  md.push("> 题材：" + theme + " · 建议总字数 " + chapterCount * 2200 + "～" + chapterCount * 2800 + " 字");
  md.push("> **唯一素材**（请改写扩写，勿照抄）：");
  md.push(">");
  md.push("> " + msg.replace(/\n/g, " "));
  if (core.uname) md.push("> 来源评论：@" + core.uname + (core.videoBvid ? " · " + core.videoBvid : ""));
  md.push("");
  md.push("## 故事内核（均来自这一条评论）");
  md.push("");
  md.push("- **开头**：" + hook);
  md.push("- **结尾/反转**：" + twist);
  md.push("- **原评共 " + sentences.length + " 句**，各章按顺序扩写，不混入其他评论");
  md.push("");
  md.push("## 分章提纲");
  md.push("");

  var textLines = [
    "=== 短篇大纲：" + title + " ===",
    "",
    "【唯一素材 · 第 " + (pickIndex || 1) + " 条】",
    msg,
    "",
    "【故事内核】",
    "开头：" + hook,
    "结尾：" + twist,
    "",
    "【分章提纲 · 仅扩写此条】",
    "",
  ];

  for (var i = 0; i < chapterCount; i++) {
    var meta = biliStoryChapterMeta(i, chapterCount);
    var seg = biliStorySegmentForChapter(sentences, i, chapterCount);
    var idx = i + 1;
    var beats = [
      "对应原评第 " + (seg.index + 1) + " 句：" + seg.text,
      meta.role,
    ];
    if (i === 0) {
      beats.push("扩写场景与人物，让读者进入这条评论里的世界");
    } else if (i === chapterCount - 1) {
      beats.push("严格按原评结局收束：" + twist);
    } else {
      beats.push("与上一章同一人物、同一事件，只扩写不另起炉灶");
    }

    md.push("### 第" + idx + "章 " + meta.name);
    md.push("");
    md.push("**本章任务**：" + meta.role);
    md.push("");
    md.push("**建议字数**：2200～2800 字");
    md.push("");
    md.push("**提纲**：");
    for (var b = 0; b < beats.length; b++) {
      md.push("- " + beats[b]);
    }
    md.push("");
    md.push("**约束**：不得引入原评未提及的新人物主线；可补细节，不可改反转方向。");
    md.push("");

    textLines.push("--- 第" + idx + "章 " + meta.name + " ---");
    textLines.push("对应原评：" + seg.text);
    for (var b2 = 0; b2 < beats.length; b2++) {
      textLines.push("  · " + beats[b2]);
    }
    textLines.push("");
  }

  md.push("## 发布前自检");
  md.push("");
  md.push("- [ ] 全文只扩写选定的一条评论，未拼接其他热评");
  md.push("- [ ] 未大段照搬 B 站评论原文");
  md.push("- [ ] 各章合起来能还原这一条段子的起承转合");
  md.push("- [ ] 已人工润色对话与细节");

  return { md: md.join("\n"), text: textLines.join("\n"), title: title, core: core };
}

function biliStoryExportMd() {
  var out = document.getElementById("biliStoryResult");
  if (!window.__biliStoryPack || !window.__biliStoryPack.outline) {
    if (out) out.textContent = "请先生成大纲。";
    return;
  }
  var text = window.__biliStoryPack.outline.md;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        if (out) out.textContent = (out.textContent || "") + "\n\n--- 已复制 Markdown 大纲到剪贴板 ---";
      },
      function () {
        biliStoryFallbackCopy(text, out);
      }
    );
  } else {
    biliStoryFallbackCopy(text, out);
  }
}

function biliStoryFallbackCopy(text, out) {
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (out) out.textContent = (out.textContent || "") + "\n\n--- 已复制 Markdown ---";
  } catch (e) {
    if (out) out.textContent = text;
  }
  document.body.removeChild(ta);
}

function biliStoryClear() {
  ["biliStoryVideos", "biliStoryCookie", "biliStoryJson"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  var out = document.getElementById("biliStoryResult");
  if (out) out.textContent = "";
  window.__biliStoryPack = null;
}
