const HISTORY_KEY = "business-sprite.history";
const SETTINGS_KEY = "business-sprite.settings";

const IDLE_GIFS = [
  "assets/pet/pikaqiu2.gif",
  "assets/pet/pikaqiu3.gif",
];
const CLICK_GIF = "assets/pet/click.gif";
const REST_GIF = "assets/pet/rest.gif";
const DEFAULT_DIALOGS = [
  "你好，我是你的业务精灵~",
  "记得检查一下测试点有没有漏哦",
  "浏览器自动化走 Playwright 就行",
  "客户端游戏可以登记 Airtest 模块",
  "有业务流程问题，点我展开聊聊",
  "今天也要认真验证分佣链路呀",
];

let history = [];
let sharedLlmConfig = null;
let expanded = false;
let availableIdleGifs = [];
let idleDialogs = DEFAULT_DIALOGS.slice();
let idleGifTimer = null;
let idleTalkTimer = null;
let restTimer = null;
let clickAnimTimer = null;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function settings() {
  const own = readJson(SETTINGS_KEY, {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "",
    restEnabled: false,
  });
  if ((own.apiKey || "").trim()) return { ...own, source: "sprite" };
  if (sharedLlmConfig && (sharedLlmConfig.apiKey || "").trim()) {
    return {
      ...own,
      ...sharedLlmConfig,
      source: sharedLlmConfig.source || "agile-sim",
      restEnabled: !!own.restEnabled,
    };
  }
  return own;
}

function chatConfigPayload() {
  const cfg = settings();
  return (cfg.apiKey || "").trim() ? cfg : {};
}

async function loadSharedLlmConfig() {
  const result = await window.spriteApi.llmConfig();
  if (result?.ok && result.config) {
    sharedLlmConfig = result.config;
  }
  updateModeHint();
}

function appendMessage(role, content) {
  history.push({ role, content: String(content || "") });
  history = history.slice(-30);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.replaceChildren();
  for (const item of history) {
    const node = document.createElement("div");
    node.className = `sprite-msg ${item.role === "user" ? "user" : "assistant"}`;
    node.textContent = item.content || "";
    log.appendChild(node);
  }
  log.scrollTop = log.scrollHeight;
}

function renderRecommendations(items) {
  const box = document.getElementById("recommendations");
  if (!box) return;
  box.replaceChildren();
  for (const item of items || []) {
    const row = document.createElement("div");
    row.className = "sprite-rec";
    const text = document.createElement("span");
    text.textContent = `${item.engine === "airtest" ? "🖥️" : "🌐"} ${item.name || item.id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "确认运行";
    button.addEventListener("click", async () => {
      if (!window.confirm(`确认运行“${item.name || item.id}”？`)) return;
      button.disabled = true;
      button.textContent = "执行中…";
      const result = await window.spriteApi.runModule(item.id);
      const run = result?.run || {};
      appendMessage(
        "assistant",
        result?.ok
          ? `模块“${item.name || item.id}”执行通过。`
          : `模块执行失败：${run.error || result?.error || "请到工作台查看日志"}`
      );
      button.disabled = false;
      button.textContent = "确认运行";
    });
    row.append(text, button);
    box.appendChild(row);
  }
}

async function sendMessage() {
  const input = document.getElementById("message-input");
  const send = document.getElementById("send-btn");
  const message = input.value.trim();
  if (!message || send.disabled) return;
  if (!expanded) await window.spriteApi.toggleSize();
  appendMessage("user", message);
  input.value = "";
  send.disabled = true;
  send.textContent = "…";
  const result = await window.spriteApi.chat({
    message,
    history: history.slice(-10),
    config: chatConfigPayload(),
  });
  if (result?.ok && Array.isArray(result.history)) {
    history = result.history.slice(-30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } else {
    appendMessage("assistant", result?.error || "暂时无法回答");
  }
  renderRecommendations(result?.recommendations || []);
  updateModeHint();
  send.disabled = false;
  send.textContent = "发送";
  input.focus();
}

function updateModeHint(extra) {
  const hint = document.getElementById("mode-hint");
  if (!hint) return;
  const value = settings();
  const hasKey = !!(value.apiKey || "").trim();
  const sourceLabel = value.source === "agile-sim" ? " · 复用测试点生成" : "";
  hint.textContent = extra || (
    hasKey
      ? `大模型模式（${value.model || "deepseek-chat"}${sourceLabel}）`
      : "本地知识模式 · 请在测试点生成配置 OpenAI 兼容 Key"
  );
}

function initSettings() {
  const value = settings();
  const base = document.getElementById("base-url");
  const model = document.getElementById("model");
  const key = document.getElementById("api-key");
  const rest = document.getElementById("rest-enabled");
  if (base) base.value = value.baseUrl || "";
  if (model) model.value = value.model || "";
  if (key) key.value = value.source === "sprite" ? (value.apiKey || "") : "";
  if (rest) rest.checked = !!value.restEnabled;
  updateModeHint();
  setupRestReminder(!!value.restEnabled);
}

function bindWindowAction(id, handler) {
  const node = document.getElementById(id);
  if (!node) return;
  node.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
}

function showFallbackPet() {
  document.getElementById("pet-image")?.classList.add("hidden");
  document.getElementById("pet-fallback")?.classList.remove("hidden");
}

function setPetGif(src, { temporary = false } = {}) {
  const img = document.getElementById("pet-image");
  const fallback = document.getElementById("pet-fallback");
  if (!img) return;
  if (!src) {
    showFallbackPet();
    return;
  }
  img.onerror = () => {
    if (temporary) {
      playRandomIdleGif();
      return;
    }
    showFallbackPet();
  };
  img.onload = () => {
    img.classList.remove("hidden");
    fallback?.classList.add("hidden");
  };
  // bust cache so click/rest animations restart
  img.src = `${src}?t=${Date.now()}`;
}

function playRandomIdleGif() {
  if (!availableIdleGifs.length) {
    showFallbackPet();
    return;
  }
  const src = availableIdleGifs[Math.floor(Math.random() * availableIdleGifs.length)];
  setPetGif(src);
}

function showIdleBubble(text) {
  const bubble = document.getElementById("idle-bubble");
  if (!bubble || expanded) return;
  bubble.textContent = text;
  bubble.classList.remove("hidden");
}

function hideIdleBubble() {
  document.getElementById("idle-bubble")?.classList.add("hidden");
}

function talkIdleLine(forceText) {
  const text = forceText || idleDialogs[Math.floor(Math.random() * idleDialogs.length)] || "你好呀~";
  showIdleBubble(text);
}

async function probeAsset(path) {
  try {
    const res = await fetch(path, { method: "GET", cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

async function initPetAssets() {
  availableIdleGifs = [];
  for (const path of IDLE_GIFS) {
    if (await probeAsset(path)) availableIdleGifs.push(path);
  }
  try {
    const res = await fetch("assets/pet/dialog.txt");
    if (res.ok) {
      const text = await res.text();
      const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length) idleDialogs = lines;
    }
  } catch (_) {}

  playRandomIdleGif();
  talkIdleLine();

  clearInterval(idleGifTimer);
  clearInterval(idleTalkTimer);
  idleGifTimer = setInterval(() => {
    if (!expanded) playRandomIdleGif();
  }, 8000);
  idleTalkTimer = setInterval(() => {
    if (!expanded) talkIdleLine();
  }, 10000);
}

function playClickReaction() {
  clearTimeout(clickAnimTimer);
  talkIdleLine("咬你哦！");
  probeAsset(CLICK_GIF).then((ok) => {
    if (ok) setPetGif(CLICK_GIF, { temporary: true });
  });
  clickAnimTimer = setTimeout(() => {
    if (!expanded) playRandomIdleGif();
  }, 2200);
}

function setupRestReminder(enabled) {
  clearInterval(restTimer);
  restTimer = null;
  if (!enabled) return;
  restTimer = setInterval(async () => {
    talkIdleLine("休息一下");
    if (await probeAsset(REST_GIF)) setPetGif(REST_GIF, { temporary: true });
    if (!expanded) await window.spriteApi.toggleSize();
    appendMessage("assistant", "休息一下吧～已经工作挺久了，站起来活动活动。");
  }, 60 * 60 * 1000);
}

let petClickStart = null;
const petAvatar = document.getElementById("pet-avatar");
if (petAvatar) {
  petAvatar.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    petClickStart = { x: event.screenX, y: event.screenY, t: Date.now() };
  });
  petAvatar.addEventListener("mouseup", async (event) => {
    if (!petClickStart || event.button !== 0) return;
    const dx = Math.abs(event.screenX - petClickStart.x);
    const dy = Math.abs(event.screenY - petClickStart.y);
    const dt = Date.now() - petClickStart.t;
    petClickStart = null;
    if (dx > 6 || dy > 6 || dt > 400) return;
    event.preventDefault();
    event.stopPropagation();
    playClickReaction();
    await window.spriteApi.toggleSize();
  });
  petAvatar.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    document.getElementById("settings-panel")?.classList.toggle("hidden");
  });
}

bindWindowAction("close-btn", () => window.spriteApi.close());
bindWindowAction("settings-btn", () => {
  document.getElementById("settings-panel")?.classList.toggle("hidden");
});
document.getElementById("save-settings")?.addEventListener("click", () => {
  const next = {
    baseUrl: document.getElementById("base-url").value.trim(),
    model: document.getElementById("model").value.trim(),
    apiKey: document.getElementById("api-key").value.trim(),
    restEnabled: !!document.getElementById("rest-enabled")?.checked,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  document.getElementById("settings-panel")?.classList.add("hidden");
  updateModeHint();
  setupRestReminder(next.restEnabled);
});
document.getElementById("send-btn")?.addEventListener("click", sendMessage);
document.getElementById("message-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

window.spriteApi.onSizeChanged((isExpanded) => {
  expanded = isExpanded;
  document.body.classList.toggle("collapsed", !isExpanded);
  if (isExpanded) {
    hideIdleBubble();
    setTimeout(() => document.getElementById("message-input")?.focus(), 120);
  } else {
    talkIdleLine();
    playRandomIdleGif();
  }
});

history = readJson(HISTORY_KEY, []);
if (!Array.isArray(history) || !history.length) {
  history = [{
    role: "assistant",
    content: "你好，我是你的业务精灵。点击我展开对话，可以问业务流程或推荐自动化模块。",
  }];
}
initSettings();
renderHistory();
initPetAssets();
Promise.all([
  loadSharedLlmConfig(),
  window.spriteApi.state(),
]).then(([, state]) => {
  initSettings();
  if (state?.ok && Array.isArray(state.history) && state.history.length) {
    history = state.history.slice(-30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }
});
