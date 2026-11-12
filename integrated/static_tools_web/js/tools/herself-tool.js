/**

 * 她自己 — 网页聊天（经本机 her-chat-bridge + OpenAI 兼容 API）

 */



var HER_CHAT_HISTORY_KEY = "toolsite.her.chatHistory";

var HER_CHAT_SETTINGS_KEY = "toolsite.her.settings";



var HER_COMMON_MODELS = /^(gpt-|o1-|o3-|claude-|llama|deepseek|qwen|gemini|text-|glm-|moonshot|abab)/i;



function herselfChatLooksLikeApiKey(str) {

  var s = String(str || "").trim();

  if (!s) return false;

  if (/^sk-/i.test(s)) return true;

  if (/^crsr_/i.test(s)) return true;

  if (/^ollama$/i.test(s)) return true;

  if (HER_COMMON_MODELS.test(s)) return false;

  if (s.length >= 16 && /^[a-zA-Z0-9._-]+$/.test(s) && s.indexOf("/") < 0 && s.indexOf(" ") < 0) return true;

  return false;

}



function herselfChatNormalizeStored(s) {

  s = s || {};

  var model = String(s.model || "").trim();

  var key = String(s.apiKey || "").trim();

  if (!key && herselfChatLooksLikeApiKey(model)) {

    s.apiKey = model;

    s.model = s.modelWasReal ? s.modelWasReal : "gpt-4o-mini";

  }

  return s;

}



function herselfChatReadFields() {

  var keyEl = document.getElementById("herApiKey");

  var modelEl = document.getElementById("herApiModel");

  var key = keyEl ? String(keyEl.value || "").trim() : "";

  var model = modelEl ? String(modelEl.value || "").trim() : "";

  var swapped = false;



  if (!key && herselfChatLooksLikeApiKey(model)) {

    key = model;

    model = "gpt-4o-mini";

    swapped = true;

    if (keyEl) keyEl.value = key;

    if (modelEl) modelEl.value = model;

  }



  if (!model) model = "gpt-4o-mini";

  return { apiKey: key, model: model, swapped: swapped };

}

function herselfChatFixProviderMismatch() {
  var baseEl = document.getElementById("herApiBase");
  var modelEl = document.getElementById("herApiModel");
  if (!baseEl || !modelEl) return false;
  var base = baseEl.value.trim();
  var model = modelEl.value.trim().toLowerCase();
  if (/deepseek/.test(model) && /openai\.com/i.test(base)) {
    baseEl.value = "https://api.deepseek.com/v1";
    return true;
  }
  return false;
}

function herChatPresetDeepseek() {
  var base = document.getElementById("herApiBase");
  var model = document.getElementById("herApiModel");
  if (base) base.value = "https://api.deepseek.com/v1";
  if (model) model.value = "deepseek-chat";
  herselfChatSaveSettings();
  herselfChatSetBridgeStatus(true, "已填入 DeepSeek：地址 + 模型。请确认 Key 是在 DeepSeek 官网申请的。");
}

function herselfChatFormatApiError(msg) {
  var s = String(msg || "");
  if (/insufficient balance/i.test(s)) {
    return (
      "DeepSeek 账户余额不足（Insufficient Balance）。\n" +
      "请到 https://platform.deepseek.com 充值或换有余额的 API Key。\n" +
      "也可点「一键 Ollama」用本机免费模型。"
    );
  }
  if (/invalid.*api.*key|incorrect api key|authentication/i.test(s)) {
    return "API Key 无效或已过期，请到对应平台检查 Key 是否正确。";
  }
  if (/rate limit|too many requests/i.test(s)) {
    return "请求过于频繁，请稍后再试。";
  }
  return s;
}

function herChatPresetOllama() {
  var base = document.getElementById("herApiBase");
  var model = document.getElementById("herApiModel");
  var key = document.getElementById("herApiKey");
  if (base) base.value = "http://127.0.0.1:11434/v1";
  if (model) model.value = "llama3.2";
  if (key && !key.value.trim()) key.value = "ollama";
  herselfChatSaveSettings();
  herselfChatSetBridgeStatus(true, "已填入 Ollama 本地配置，请先运行 ollama serve。");
}

function renderHerselfTool(container) {

  container.innerHTML =

    "<h2>她自己 · 聊天</h2>" +

    '<p class="bili-note">与「念念」等已创建的角色对话。API Key 只存本机浏览器。根目录双击 <code>启动工具小站.bat</code> 可同时开桥接 + 桌面版。</p>' +

    "<details class=\"bili-details\"><summary>手动启动桥接</summary>" +

    '<pre class="bili-code">node scripts/her-chat-bridge.mjs</pre>' +

    "<p>默认 <code>http://127.0.0.1:45791</code>。Ollama：<code>http://127.0.0.1:11434/v1</code>，Key 填 <code>ollama</code>。</p></details>" +

    '<p class="her-field-hint"><strong>注意：</strong>不要用 Cursor 的 <code>crsr_</code> Key（仅编辑器内可用）。' +
    " Key 与「API 地址」须同一平台；国内可用 <code>https://api.deepseek.com/v1</code> + 模型 <code>deepseek-chat</code>，或本地 Ollama。</p>" +

    '<div class="input-group her-chat-settings">' +

    '<label for="herSlug">选择她</label><select id="herSlug"><option value="nian-nian">念念（桥接未连…）</option></select>' +

    '<label for="herBridgePort">桥接端口</label><input type="number" id="herBridgePort" value="45791" min="1024" max="65535" />' +

    '<label for="herApiBase">API 地址</label><input type="text" id="herApiBase" class="her-api-input" placeholder="DeepSeek 填 https://api.deepseek.com/v1" />' +

    '<label for="herApiModel">模型名称</label><input type="text" id="herApiModel" placeholder="gpt-4o-mini（勿填 Key）" />' +

    '<label for="herApiKey">API Key</label><input type="text" id="herApiKey" class="her-api-input her-api-key" placeholder="sk-… 或 ollama" spellcheck="false" autocomplete="off" />' +

    "</div>" +
    '<div class="button-group her-preset-row">' +
    '<button type="button" onclick="herChatPresetDeepseek()">一键 DeepSeek</button>' +
    '<button type="button" onclick="herChatPresetOllama()">一键 Ollama</button>' +
    "</div>" +

    '<p id="herBridgeStatus" class="her-bridge-status" aria-live="polite"></p>' +

    '<div id="herChatLog" class="her-chat-log" aria-live="polite"></div>' +

    '<div class="her-chat-input-row">' +

    '<textarea id="herChatInput" class="her-chat-input" rows="2" placeholder="跟她说点什么…"></textarea>' +

    '<div class="button-group her-chat-actions">' +

    '<button type="button" id="herChatSendBtn" onclick="herChatSend()">发送</button>' +

    '<button type="button" onclick="herChatClear()">清空对话</button>' +

    "</div></div>" +

    "<details class=\"bili-details\"><summary>安装 / 创建新的她（Cursor）</summary>" +

    "<p>在 Cursor 执行 <code>/create-herself</code>；生成在 <code>.cursor/skills/{slug}/</code>。</p></details>";



  herselfChatLoadSettings();

  if (herselfChatFixProviderMismatch()) {
    herselfChatSaveSettings();
    herselfChatSetBridgeStatus(true, "已自动把 API 地址改为 DeepSeek（模型是 deepseek-chat 时不能填 openai.com）");
  }

  herselfChatBindAutosave();

  herselfChatRefreshList();

  herselfChatRenderLog();

  var input = document.getElementById("herChatInput");

  if (input) {

    input.addEventListener("keydown", function (e) {

      if (e.key === "Enter" && !e.shiftKey) {

        e.preventDefault();

        herChatSend();

      }

    });

  }

}



function herselfChatBindAutosave() {

  ["herSlug", "herBridgePort", "herApiBase", "herApiModel", "herApiKey"].forEach(function (id) {

    var el = document.getElementById(id);

    if (!el) return;

    el.addEventListener("input", herselfChatSaveSettings);

    el.addEventListener("change", herselfChatSaveSettings);

  });

}



function herselfChatLoadSettings() {

  try {

    var s = herselfChatNormalizeStored(JSON.parse(localStorage.getItem(HER_CHAT_SETTINGS_KEY) || "{}"));

    var port = document.getElementById("herBridgePort");

    var base = document.getElementById("herApiBase");

    var model = document.getElementById("herApiModel");

    var key = document.getElementById("herApiKey");

    var slug = document.getElementById("herSlug");

    if (port && s.port) port.value = s.port;

    if (base && s.baseUrl) base.value = s.baseUrl;

    if (model && s.model) model.value = s.model;

    if (key && s.apiKey) key.value = s.apiKey;

    if (slug && s.slug) slug.value = s.slug;

    if (s.apiKey) herselfChatSaveSettings();

  } catch (e) {}

}



function herselfChatSaveSettings() {

  try {

    var cred = herselfChatReadFields();

    var slug = document.getElementById("herSlug");

    var port = document.getElementById("herBridgePort");

    var base = document.getElementById("herApiBase");

    localStorage.setItem(

      HER_CHAT_SETTINGS_KEY,

      JSON.stringify({

        slug: slug ? slug.value : "nian-nian",

        port: port ? port.value : "45791",

        baseUrl: base ? base.value.trim() : "",

        model: cred.model,

        apiKey: cred.apiKey,

      })

    );

  } catch (e) {}

}



function herselfChatGetHistory() {

  try {

    var slug = (document.getElementById("herSlug") || {}).value || "nian-nian";

    var all = JSON.parse(localStorage.getItem(HER_CHAT_HISTORY_KEY) || "{}");

    return Array.isArray(all[slug]) ? all[slug] : [];

  } catch (e) {

    return [];

  }

}



function herselfChatSaveHistory(list) {

  try {

    var slug = (document.getElementById("herSlug") || {}).value || "nian-nian";

    var all = JSON.parse(localStorage.getItem(HER_CHAT_HISTORY_KEY) || "{}");

    all[slug] = list.slice(-40);

    localStorage.setItem(HER_CHAT_HISTORY_KEY, JSON.stringify(all));

  } catch (e) {}

}



function herselfChatRenderLog() {

  var log = document.getElementById("herChatLog");

  if (!log) return;

  var hist = herselfChatGetHistory();

  if (!hist.length) {

    log.innerHTML = '<p class="her-chat-hint">发第一条消息开始聊。请先运行根目录 <code>启动工具小站.bat</code> 或 <code>node scripts/her-chat-bridge.mjs</code>。</p>';

    return;

  }

  log.innerHTML = hist

    .map(function (m) {

      var cls = m.role === "user" ? "her-msg-user" : "her-msg-her";

      var who = m.role === "user" ? "你" : "她";

      return '<div class="her-chat-msg ' + cls + '"><span class="her-chat-who">' + who + "</span><div>" + herselfChatEscape(m.content) + "</div></div>";

    })

    .join("");

  log.scrollTop = log.scrollHeight;

}



function herselfChatEscape(s) {

  return String(s || "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/\n/g, "<br>");

}



function herselfChatSetBridgeStatus(ok, msg) {

  var el = document.getElementById("herBridgeStatus");

  if (!el) return;

  el.textContent = msg || "";

  el.className = "her-bridge-status " + (ok ? "is-ok" : "is-warn");

}



function herselfChatRefreshList() {

  var port = (document.getElementById("herBridgePort") || {}).value || "45791";

  var sel = document.getElementById("herSlug");

  if (!sel) return;



  fetch("http://127.0.0.1:" + port + "/health", { method: "GET" })

    .then(function (r) {

      if (!r.ok) throw new Error("health");

      return fetch("http://127.0.0.1:" + port + "/api/her-list").then(function (r2) {

        return r2.json();

      });

    })

    .then(function (j) {

      if (!j.ok || !j.data || !j.data.length) {

        herselfChatSetBridgeStatus(false, "桥接已连接，但未发现已创建的她（需 .cursor/skills/nian-nian 等）");

        return;

      }

      var cur = sel.value;

      sel.innerHTML = j.data

        .map(function (h) {

          return '<option value="' + h.slug + '">' + String(h.name || h.slug).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</option>";

        })

        .join("");

      if (cur) sel.value = cur;

      var saved = herselfChatNormalizeStored(JSON.parse(localStorage.getItem(HER_CHAT_SETTINGS_KEY) || "{}"));

      if (saved.slug) sel.value = saved.slug;

      herselfChatSetBridgeStatus(true, "桥接已连接 · 共 " + j.data.length + " 位");

    })

    .catch(function () {

      herselfChatSetBridgeStatus(false, "桥接未连接：请运行 启动工具小站.bat 或 node scripts/her-chat-bridge.mjs");

    });

}



function herChatSend() {

  var input = document.getElementById("herChatInput");

  var btn = document.getElementById("herChatSendBtn");

  var text = input ? input.value.trim() : "";

  if (!text) return;



  var cred = herselfChatReadFields();

  herselfChatSaveSettings();



  var port = (document.getElementById("herBridgePort") || {}).value || "45791";

  var slug = (document.getElementById("herSlug") || {}).value || "nian-nian";

  var apiKey = cred.apiKey;

  var model = cred.model;

  if (herselfChatFixProviderMismatch()) {
    herselfChatSaveSettings();
    herselfChatSetBridgeStatus(true, "已自动修正：API 地址 → https://api.deepseek.com/v1");
  }

  var baseUrl = (document.getElementById("herApiBase") || {}).value.trim() || "https://api.openai.com/v1";
  var modelLower = model.toLowerCase();

  if (/deepseek/.test(modelLower) && /openai\.com/i.test(baseUrl)) {
    alert(
      "配置不一致：模型是 deepseek-chat，但 API 地址还是 OpenAI。\n\n" +
        "请把 API 地址改成：\nhttps://api.deepseek.com/v1\n\n" +
        "或点页面上「一键 DeepSeek」按钮。"
    );
    return;
  }

  if (cred.swapped) {

    herselfChatSetBridgeStatus(true, "已把误填在「模型」里的 Key 移到 API Key 框，模型已改为 gpt-4o-mini");

  }



  if (!apiKey) {

    alert(

      "请先填写「API Key」框（不是模型框）。\n\n" +

        "· OpenAI：sk- 开头\n" +

        "· DeepSeek：https://api.deepseek.com/v1\n" +

        "· Ollama：Key 填 ollama\n" +

        "· 不要用 Cursor 的 crsr_ Key"

    );

    return;

  }



  if (/^crsr_/i.test(apiKey)) {

    alert(

      "当前是 Cursor 专用 Key（crsr_ 开头），网页聊天无法使用。\n\n" +

        "请任选：\n" +

        "1) DeepSeek：地址 https://api.deepseek.com/v1，模型 deepseek-chat\n" +

        "2) Ollama：地址 http://127.0.0.1:11434/v1，Key 填 ollama\n" +

        "3) OpenAI：sk- 开头，且网络能访问 api.openai.com"

    );

    return;

  }



  var hist = herselfChatGetHistory();

  hist.push({ role: "user", content: text });

  herselfChatSaveHistory(hist);

  if (input) input.value = "";

  herselfChatRenderLog();



  if (btn) {

    btn.disabled = true;

    btn.textContent = "等待回复…";

  }



  var apiMessages = hist.map(function (m) {

    return { role: m.role, content: m.content };

  });



  fetch("http://127.0.0.1:" + port + "/api/her-chat", {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ slug: slug, messages: apiMessages, apiKey: apiKey, baseUrl: baseUrl, model: model }),

  })

    .then(function (r) {

      return r.text().then(function (t) {

        var j;

        try {

          j = JSON.parse(t);

        } catch (e) {

          throw new Error("非 JSON：" + t.slice(0, 200));

        }

        if (!r.ok || !j.ok) throw new Error(j.error || t.slice(0, 300));

        return j;

      });

    })

    .then(function (j) {

      hist.push({ role: "assistant", content: j.reply });

      herselfChatSaveHistory(hist);

      herselfChatRenderLog();

    })

    .catch(function (e) {

      hist.pop();

      herselfChatSaveHistory(hist);

      herselfChatRenderLog();

      alert(

        "发送失败：\n" +

          herselfChatFormatApiError(e.message || e) +

          "\n\n若与余额/Key 无关，再确认：桥接已启动、端口 45791、API 地址与 Key 同一平台。"

      );

    })

    .finally(function () {

      if (btn) {

        btn.disabled = false;

        btn.textContent = "发送";

      }

    });

}



function herChatClear() {

  herselfChatSaveHistory([]);

  herselfChatRenderLog();

}


