/* 造数脚本独立页 */

let ssCatalog = null;

function ssEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ssApi(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    headers: { "Content-Type": "application/json" },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `接口返回异常（${res.status}）` };
  }
}

async function loadSeedScriptPage() {
  const data = await ssApi("seed-script/catalog");
  if (!data?.ok) {
    document.getElementById("ss-hint").textContent = data?.error || "加载失败";
    return;
  }
  ssCatalog = data;
  document.getElementById("ss-title").textContent = data.name || "造数脚本";
  document.getElementById("ss-hint").textContent = data.note || "";
  const game = data.gameFixed || {};
  document.getElementById("ss-game-fixed").textContent = game.gameId
    ? `游戏参数已固定：gameId=${game.gameId} ${game.gameName || ""}（${game.note || ""}）`
    : "游戏参数尚未从 SDK 配置读到";
  renderMissing(data.missingApis || []);
  renderGroups(data.groups || []);
}

function renderMissing(items) {
  const box = document.getElementById("ss-missing");
  if (!items.length) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<strong>需要你补充的接口</strong>
    <ul>${items.map((x) => `<li><code>${ssEscape(x.id)}</code> ${ssEscape(x.title)} — ${ssEscape(x.ask)}</li>`).join("")}</ul>`;
}

function renderGroups(groups) {
  const root = document.getElementById("ss-groups");
  root.innerHTML = groups.map(groupCard).join("");
}

function groupCard(group) {
  const id = ssEscape(group.id);
  const src = (group.sourceInputs || []).map((inp) => `
    <label class="ss-field">
      <span>${ssEscape(inp.label)}</span>
      <input id="ss-${id}-${ssEscape(inp.key)}" placeholder="${ssEscape(inp.placeholder || "")}" value="${ssEscape(inp.value || "")}">
    </label>`).join("");
  const actions = (group.actions || []).map((act) => actionCard(group, act)).join("");
  const collapse = !!group.collapseSource;
  const sourceBlock = src ? `
      <div class="ss-source${collapse ? " is-collapsed" : ""}" id="ss-source-${id}">
        ${collapse
          ? `<button type="button" class="ss-source-toggle" onclick="toggleSeedSource('${id}')">
              <strong>来源数据</strong>
              <span class="ss-source-caret" id="ss-source-caret-${id}">展开</span>
            </button>`
          : `<strong>来源数据</strong>`}
        <div class="ss-source-grid">${src}</div>
      </div>` : "";
  return `
    <section class="br-role-box tone-${ssEscape(group.tone || "slate")}" id="ss-box-${id}">
      <div class="br-role-head">
        <div>
          <h2>${ssEscape(group.name)}</h2>
          <p class="hint">${ssEscape(group.summary || "")}</p>
        </div>
      </div>
      ${sourceBlock}
      <div class="ss-action-grid">${actions}</div>
      ${dbPanel(group)}
      <pre class="ss-log" id="ss-log-${id}">尚未执行</pre>
    </section>`;
}

function toggleSeedSource(groupId) {
  const box = document.getElementById(`ss-source-${groupId}`);
  if (!box) return;
  box.classList.toggle("is-collapsed");
  const caret = document.getElementById(`ss-source-caret-${groupId}`);
  if (caret) caret.textContent = box.classList.contains("is-collapsed") ? "展开" : "折叠";
}

function actionCard(group, act) {
  const missing = act.status === "missing_api";
  const extra = (act.inputs || []).map((inp) => `
    <label class="ss-field">
      <span>${ssEscape(inp.label)}</span>
      <input data-extra="${ssEscape(inp.key)}" placeholder="${ssEscape(inp.placeholder || "")}" value="${ssEscape(inp.value || "")}">
    </label>`).join("");
  return `
    <article class="ss-action ${missing ? "is-missing" : ""}">
      <div class="ss-action-top">
        <strong>${ssEscape(act.title)}</strong>
        <span class="br-status ${missing ? "st-not-open" : "st-ready"}">${missing ? "待补充接口" : "已接线"}</span>
      </div>
      <p class="hint">${missing ? ssEscape(act.ask || "") : ssEscape((act.api || "") + (act.flow ? " · 主流程 " + act.flow : "") + (act.smokeCase ? " · 冒烟 " + act.smokeCase : ""))}</p>
      ${extra}
      <div class="ss-action-btns">
        <button class="btn btn-sm" type="button" onclick="openHttpLog('${ssEscape(act.id)}','${ssEscape(act.title)}')">请求日志</button>
        <button class="btn ${missing ? "" : "primary"} btn-sm" type="button"
          ${missing ? "disabled" : `onclick="runSeedAction('${ssEscape(group.id)}','${ssEscape(act.id)}', this)"`}>
          ${missing ? "缺接口" : "执行"}
        </button>
      </div>
    </article>`;
}

function dbPanel(group) {
  const db = group.db;
  if (!db) return "";
  const id = ssEscape(group.id);
  const fields = (db.fields || []).map((f) => `<option value="${ssEscape(f.id)}">${ssEscape(f.label)}</option>`).join("");
  return `
    <div class="ss-db">
      <h3>数据库更改</h3>
      <p class="hint">${ssEscape(db.note || "")}</p>
      <div class="ss-source-grid">
        <label class="ss-field">
          <span>账号</span>
          <input id="ss-db-acc-${id}" placeholder="要查/改的账号">
        </label>
        <label class="ss-field">
          <span>字段</span>
          <select id="ss-db-field-${id}">${fields}</select>
        </label>
        <label class="ss-field">
          <span>库</span>
          <select id="ss-db-name-${id}" onchange="syncSw6Guard('${id}')">
            ${group.id === "xsw"
              ? `<option value="sw6">sw6（只读）</option>`
              : `<option value="">当前平台 game_*</option>
            <option value="sw6">sw6（只读）</option>`}
          </select>
        </label>
        <label class="ss-field">
          <span>改成（时间）</span>
          <input id="ss-db-when-${id}" type="datetime-local">
        </label>
      </div>
      <div class="ss-db-actions">
        <button class="btn btn-sm" type="button" onclick="querySeedDb('${id}','${ssEscape(db.kind)}')">一键查询</button>
        <button class="btn primary btn-sm" type="button" id="ss-db-upd-${id}" onclick="updateSeedDb('${id}','${ssEscape(db.kind)}')" ${group.id === "xsw" ? "disabled title=\"sw6 只允许查询，不能改数据\"" : ""}>一键更换</button>
      </div>
    </div>`;
}

function groupParams(groupId) {
  const params = { target: document.getElementById("ss-target")?.value || "lx" };
  document.querySelectorAll(`#ss-box-${groupId} .ss-source input`).forEach((el) => {
    const key = el.id.replace(`ss-${groupId}-`, "");
    if (key && key !== el.id) params[key] = el.value;
  });
  return params;
}

function setLog(groupId, data) {
  const el = document.getElementById(`ss-log-${groupId}`);
  if (el) el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

async function promptSms(res) {
  const uni = String(res?.usedUniversalSms || res?.universalSmsCode || "888999").trim();
  const code = window.prompt(`${res?.smsHint || res?.error || "请输入短信验证码"}\n（万能码可填 ${uni}）`, uni);
  if (code == null) return null;
  return String(code).trim() || null;
}

async function runSeedAction(groupId, actionId, btn) {
  const params = groupParams(groupId);
  const card = btn?.closest(".ss-action");
  card?.querySelectorAll("input[data-extra]").forEach((el) => {
    params[el.getAttribute("data-extra")] = el.value;
  });
  if (btn) {
    btn.disabled = true;
    btn.textContent = "执行中…";
  }
  setLog(groupId, "执行中…");
  try {
    let payload = { actionId, params };
    for (let i = 0; i < 4; i += 1) {
      const res = await ssApi("seed-script/run", { method: "POST", body: payload });
      if (res?.needSms) {
        if (groupId === "guild") {
          if (res.account) params.guildAccount = res.account;
          if (res.password || res.guildPassword) params.guildPassword = res.password || res.guildPassword;
          const ga = document.getElementById("ss-guild-guildAccount");
          const gp = document.getElementById("ss-guild-guildPassword");
          if (ga && params.guildAccount) ga.value = params.guildAccount;
          if (gp && params.guildPassword) gp.value = params.guildPassword;
        }
        const code = await promptSms(res);
        if (!code) {
          setLog(groupId, { ...res, cancelled: true });
          return;
        }
        payload = { actionId, params: { ...params, smsCode: code, smsScene: res.smsScene || params.smsScene || "" } };
        continue;
      }
      setLog(groupId, res);
      if (res?.ok && res.account) {
        const acc = document.getElementById(`ss-db-acc-${groupId}`);
        if (acc && !acc.value) acc.value = res.account;
        if (groupId === "user") {
          const userAcc = document.getElementById(`ss-${groupId}-account`);
          if (userAcc && res.account) userAcc.value = res.account;
        }
      }
      if (groupId === "guild") {
        const ga = document.getElementById("ss-guild-guildAccount");
        const gp = document.getElementById("ss-guild-guildPassword");
        if (ga && res?.account) ga.value = res.account;
        if (gp && (res?.password || res?.guildPassword)) gp.value = res.password || res.guildPassword;
      }
      return;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "执行";
    }
  }
}

function syncSw6Guard(groupId) {
  const db = document.getElementById(`ss-db-name-${groupId}`)?.value || "";
  const btn = document.getElementById(`ss-db-upd-${groupId}`);
  if (btn) {
    btn.disabled = db === "sw6" || groupId === "xsw";
    btn.title = btn.disabled ? "sw6 只允许查询，不能改数据" : "";
  }
}

async function querySeedDb(groupId, kind) {
  const account = document.getElementById(`ss-db-acc-${groupId}`)?.value.trim();
  const database = document.getElementById(`ss-db-name-${groupId}`)?.value || "";
  const target = document.getElementById("ss-target")?.value || "lx";
  setLog(groupId, "查询中…");
  const res = await ssApi("seed-script/db", {
    method: "POST",
    body: { action: "query", kind, account, sourceDb: target, database },
  });
  setLog(groupId, res);
}

async function updateSeedDb(groupId, kind, confirm = false) {
  const database = document.getElementById(`ss-db-name-${groupId}`)?.value || "";
  if (database === "sw6" || kind === "xsw") {
    setLog(groupId, { ok: false, error: "sw6 只允许查询，不能改数据" });
    return;
  }
  const account = document.getElementById(`ss-db-acc-${groupId}`)?.value.trim();
  const field = document.getElementById(`ss-db-field-${groupId}`)?.value;
  const value = document.getElementById(`ss-db-when-${groupId}`)?.value;
  setLog(groupId, "更换中…");
  const res = await ssApi("seed-script/db", {
    method: "POST",
    body: {
      action: "update",
      kind,
      account,
      field,
      value,
      sourceDb: document.getElementById("ss-target")?.value || "lx",
      database,
      confirm,
    },
  });
  if (res?.needConfirm && !confirm) {
    const msg = res.error || "更改支付订单的时间会同步更改用户注册时间到支付订单时间之前，确定是否更改";
    if (!window.confirm(msg)) {
      setLog(groupId, { ...res, cancelled: true });
      return;
    }
    return updateSeedDb(groupId, kind, true);
  }
  setLog(groupId, res);
}

function prettyJson(obj) {
  if (obj == null || obj === "") return "（无）";
  if (typeof obj === "string") {
    try {
      return JSON.stringify(JSON.parse(obj), null, 2);
    } catch {
      return obj;
    }
  }
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function openHttpLog(actionId, title) {
  const modal = document.getElementById("ss-http-modal");
  const head = document.getElementById("ss-http-title");
  const meta = document.getElementById("ss-http-meta");
  const req = document.getElementById("ss-http-req");
  const resEl = document.getElementById("ss-http-res");
  if (head) head.textContent = `${title || actionId} · 请求日志`;
  if (meta) meta.textContent = "加载中…";
  if (req) req.textContent = "加载中…";
  if (resEl) resEl.textContent = "加载中…";
  modal?.classList.remove("hidden");
  const data = await ssApi("seed-script/http-log?actionId=" + encodeURIComponent(actionId));
  if (!data?.ok) {
    if (meta) meta.textContent = data?.error || "没有日志";
    if (req) req.textContent = "（无）";
    if (resEl) resEl.textContent = "（无）";
    return;
  }
  const bits = [
    data.at || "",
    data.method || "POST",
    data.url || data.path || "",
    data.httpStatus != null ? `HTTP ${data.httpStatus}` : "",
    data.ok === false ? (data.error || "失败") : "成功",
  ].filter(Boolean);
  if (meta) meta.textContent = bits.join(" · ");
  if (req) req.textContent = prettyJson(data.request);
  if (resEl) resEl.textContent = prettyJson(data.response);
}

function closeHttpLog() {
  document.getElementById("ss-http-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  loadSeedScriptPage().then(() => {
    ["xsw", "biz", "guild", "user"].forEach(syncSw6Guard);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const local = new Date(y.getTime() - y.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.querySelectorAll("input[type='datetime-local']").forEach((el) => {
      if (!el.value) el.value = local;
    });
  });
});
