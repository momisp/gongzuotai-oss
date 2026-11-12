/* 角色业务台：独立页，按角色分框；开跑复用主流程 /api/biz-flow。 */

const STATUS_LABEL = {
  ready: "可用",
  limited: "权限受限",
  placeholder: "占位",
  "sms-only": "仅验证码",
  "not-open": "暂未开放",
};

let brRoles = [];
let brRunning = "";

function brEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function brApi(path, opts = {}) {
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

async function copyText(text) {
  const value = String(text || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const box = document.createElement("textarea");
    box.value = value;
    document.body.appendChild(box);
    box.select();
    document.execCommand("copy");
    box.remove();
  }
}

async function loadBizRolePage() {
  if (brRunning) return;
  const targetSel = document.getElementById("br-target");
  const target = targetSel?.value || "";
  const qs = target ? `?target=${encodeURIComponent(target)}` : "";
  const data = await brApi("biz-role/catalog" + qs);
  if (!data?.ok) {
    document.getElementById("br-hint").textContent = data?.error || "角色台数据加载失败";
    return;
  }

  const title = document.getElementById("br-title");
  const sub = document.getElementById("br-sub");
  const hint = document.getElementById("br-hint");
  const knowledge = document.getElementById("br-knowledge");
  if (title) title.textContent = data.catalog?.name || "角色业务台";
  if (sub) {
    sub.textContent = data.plan?.name
      ? `对照主流程「${data.plan.name}」· 点角色框「开跑」只跑该角色已启用步骤`
      : "按角色分框看系统与账号";
  }
  if (hint) hint.textContent = data.catalog?.note || "";
  if (knowledge) {
    const url = data.catalog?.knowledgeUrl || "";
    knowledge.href = url || "#";
    knowledge.classList.toggle("hidden", !url);
  }

  if (targetSel && !targetSel.dataset.ready) {
    targetSel.innerHTML = (data.targets || [])
      .map((t) => `<option value="${brEscape(t.id)}">${brEscape(t.label || t.id)}</option>`)
      .join("");
    targetSel.value = data.target;
    targetSel.dataset.ready = "1";
    targetSel.addEventListener("change", loadBizRolePage);
  } else if (targetSel) {
    targetSel.value = data.target;
  }

  brRoles = data.roles || [];
  renderBizRoles(brRoles, data.target);
}

function renderBizRoles(roles, target) {
  const root = document.getElementById("br-roles");
  if (!root) return;
  root.innerHTML = roles.map((role) => roleCard(role, target)).join("");
}

function roleCard(role, target) {
  const aliases = (role.alias || []).length ? `（也会叫${role.alias.join(" / ")}）` : "";
  const scopes = Array.isArray(role.scopes) ? role.scopes : [];
  const systems = Array.isArray(role.systems) ? role.systems : [];
  const steps = Array.isArray(role.flowSteps) ? role.flowSteps : [];
  const id = brEscape(role.id);
  return `
    <section class="br-role-box tone-${brEscape(role.tone || "slate")}" id="role-${id}">
      <div class="br-role-head">
        <div>
          <h2>${brEscape(role.name)}${brEscape(aliases)}</h2>
          <p class="hint">${brEscape(role.summary || "")}</p>
        </div>
        <button class="btn primary" type="button" data-role-run="${id}" onclick="startRoleScene('${id}')">该角色场景开跑</button>
      </div>
      ${role.relation ? `<p class="br-role-relation">${brEscape(role.relation)}</p>` : ""}
      ${role.note ? `<p class="hint">${brEscape(role.note)}</p>` : ""}
      ${scopes.length ? `<div class="br-scope-row">${scopes.map((s) => scopeCard(s, steps)).join("")}</div>` : ""}
      <div class="br-sys-grid">${systems.map((sys) => systemCard(sys, target)).join("")}</div>
      <div class="br-flow">
        <h3>对应主流程步骤</h3>
        ${steps.length ? `<div class="br-step-list" id="br-steps-${id}">${steps.map((s) => stepChip(s, id)).join("")}</div>` : `<p class="hint">暂未挂步骤</p>`}
      </div>
      <div class="br-run-panel" id="br-run-${id}">
        <div class="br-run-meta" id="br-run-meta-${id}">尚未开跑 · 只跑本角色已启用步骤，灰色步骤会跳过</div>
        <div class="br-run-log" id="br-run-log-${id}"></div>
      </div>
    </section>`;
}

function scopeCard(scope, steps) {
  const mine = (steps || []).filter((s) => s.scopeId === scope.id);
  const stepText = mine.length
    ? mine.map((s) => s.id).join(" · ")
    : "范围已划出，步骤稍后挂";
  return `
    <div class="br-scope-box">
      <strong>${brEscape(scope.name)}</strong>
      <p class="hint">${brEscape(scope.note || "")}</p>
      <span class="br-scope-steps">${brEscape(stepText)}</span>
    </div>`;
}

function systemCard(sys, target) {
  const status = sys.status || "ready";
  const acc = sys.account;
  const url = sys.url || "";
  const accLine = acc
    ? `${brEscape(acc.user || "")}${acc.password ? " / " + brEscape(acc.password) : ""}`
    : "账号待补";
  const openBtn = url
    ? `<a class="btn btn-sm" href="${brEscape(url)}" target="_blank" rel="noopener">打开</a>`
    : `<button class="btn btn-sm" type="button" disabled>无网址</button>`;
  const copyBtn = acc?.user
    ? `<button class="btn btn-sm" type="button" onclick="copyRoleAccount('${encodeURIComponent(acc.user || "")}','${encodeURIComponent(acc.password || "")}')">复制账号</button>`
    : "";
  return `
    <article class="br-sys-card">
      <div class="br-sys-top">
        <strong>${brEscape(sys.name)}</strong>
        <span class="br-status st-${brEscape(status)}">${brEscape(STATUS_LABEL[status] || status)}</span>
      </div>
      <p class="br-sys-url">${url ? brEscape(url) : "—"}</p>
      <p class="hint">${brEscape(sys.note || acc?.note || "")}</p>
      <p class="br-sys-acc">${accLine}</p>
      <div class="br-sys-actions">${openBtn}${copyBtn}</div>
    </article>`;
}

function stepChip(step, roleId) {
  const off = step.enabled === false ? " is-off" : "";
  return `
    <div class="br-step-chip${off}" data-role="${brEscape(roleId)}" data-step="${brEscape(step.id)}" title="${brEscape(step.note || "")}">
      <span class="br-step-id">${brEscape(step.id)}</span>
      <span>${brEscape(step.title || "")}</span>
    </div>`;
}

function markStepChip(roleId, stepId, state) {
  const chip = document.querySelector(`.br-step-chip[data-role="${roleId}"][data-step="${stepId}"]`);
  if (!chip) return;
  chip.classList.remove("is-running", "is-ok", "is-fail");
  if (state) chip.classList.add(state);
}

function appendRoleLog(roleId, message, level = "info") {
  const log = document.getElementById(`br-run-log-${roleId}`);
  if (!log) return;
  const now = new Date();
  const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const row = document.createElement("div");
  row.className = `br-run-line is-${level}`;
  row.textContent = `[${ts}] ${message}`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function setRoleRunMeta(roleId, text) {
  const el = document.getElementById(`br-run-meta-${roleId}`);
  if (el) el.textContent = text;
}

function setRoleRunBusy(busy, runningRoleId) {
  document.querySelectorAll("[data-role-run]").forEach((btn) => {
    const mine = btn.getAttribute("data-role-run") === runningRoleId;
    btn.disabled = busy;
    btn.textContent = busy && mine ? "执行中…" : "该角色场景开跑";
  });
}

async function promptRoleSms(res) {
  const mobile = res?.mobile || "";
  const hint = res?.smsHint || res?.error || "请输入短信验证码";
  const uni = String(res?.usedUniversalSms || res?.universalSmsCode || "888999").trim();
  const code = window.prompt(
    `${hint}\n手机：${mobile || "未知"}\n（测试万能码可填 ${uni}）`,
    uni,
  );
  if (code == null) return null;
  return String(code).trim() || null;
}

async function executeRoleStep(runId, stepId, mode) {
  let payload = { mode };
  for (let i = 0; i < 3; i += 1) {
    const res = await brApi(
      `biz-flow/runs/${encodeURIComponent(runId)}/execute/${encodeURIComponent(stepId)}`,
      { method: "POST", body: payload },
    );
    if (res?.needSms || (!res?.ok && /验证码|请先填写|请先短信/.test(String(res?.error || "")))) {
      const code = await promptRoleSms(res);
      if (!code) {
        return { ok: false, cancelled: true, error: "已取消填写短信验证码", ...res };
      }
      payload = { ...payload, smsCode: code };
      continue;
    }
    return res;
  }
  return { ok: false, error: "短信验证码重试次数过多" };
}

async function startRoleScene(roleId) {
  if (brRunning) return;
  const role = brRoles.find((r) => r.id === roleId);
  if (!role) return;
  const queue = (role.flowSteps || []).filter((s) => s.enabled !== false);
  const skipped = (role.flowSteps || []).filter((s) => s.enabled === false);
  if (!queue.length) {
    setRoleRunMeta(roleId, "没有可跑步骤（对应主流程步骤都未启用）");
    appendRoleLog(roleId, "没有已启用步骤，开跑取消", "warn");
    return;
  }

  const target = document.getElementById("br-target")?.value || "lx";
  const mode = document.getElementById("br-mode")?.value || "silent";
  const log = document.getElementById(`br-run-log-${roleId}`);
  if (log) log.innerHTML = "";
  brRunning = roleId;
  setRoleRunBusy(true, roleId);
  setRoleRunMeta(roleId, `开跑中 · ${queue.map((s) => s.id).join("、")}`);
  document.getElementById(`role-${roleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  let endedOk = true;
  try {
    appendRoleLog(
      roleId,
      `创建运行 · ${role.name} · 平台 ${target} · ${mode === "display" ? "展示" : "静默"} · ${queue.map((s) => s.id).join("、")}`,
    );
    skipped.forEach((s) => appendRoleLog(roleId, `跳过 ${s.id} ${s.title || ""}（方案未启用）`, "warn"));

    const created = await brApi("biz-flow/runs", {
      method: "POST",
      body: {
        mode,
        target,
        note: `角色台开跑：${role.name} · ${queue.map((s) => s.id).join(",")}`,
      },
    });
    if (!created?.ok) {
      endedOk = false;
      appendRoleLog(roleId, created?.error || "创建运行失败", "error");
      setRoleRunMeta(roleId, "创建运行失败");
      return;
    }
    const runId = created.run.id;
    appendRoleLog(roleId, `运行已创建：${runId}`, "ok");

    for (let i = 0; i < queue.length; i += 1) {
      const step = queue[i];
      setRoleRunMeta(roleId, `当前 ${step.id} ${step.title || ""}（${i + 1}/${queue.length}）`);
      markStepChip(roleId, step.id, "is-running");
      appendRoleLog(roleId, `开始 ${step.id} ${step.title || ""}`);
      const exec = await executeRoleStep(runId, step.id, mode);
      if (exec?.smsNote) {
        appendRoleLog(roleId, exec.smsNote, exec.ok ? "ok" : "warn");
      }
      if (exec?.cancelled) {
        endedOk = false;
        markStepChip(roleId, step.id, "is-fail");
        appendRoleLog(roleId, `${step.id} 已取消填写短信，流程暂停`, "warn");
        break;
      }
      if (!exec?.ok) {
        endedOk = false;
        markStepChip(roleId, step.id, "is-fail");
        appendRoleLog(roleId, `${step.id} 失败：${exec?.error || "未知错误"}`, "error");
        break;
      }
      markStepChip(roleId, step.id, "is-ok");
      appendRoleLog(roleId, `${step.id} 通过`, "ok");
    }

    appendRoleLog(roleId, "本轮角色开跑结束");
    setRoleRunMeta(roleId, endedOk ? `已结束 · 运行 ${runId}` : `已结束（失败/暂停）· 运行 ${runId}`);
  } catch (err) {
    endedOk = false;
    appendRoleLog(roleId, err?.message || String(err), "error");
    setRoleRunMeta(roleId, "开跑异常");
  } finally {
    brRunning = "";
    setRoleRunBusy(false, roleId);
  }
}

async function copyRoleAccount(userEnc, passEnc) {
  const user = decodeURIComponent(userEnc || "");
  const pass = decodeURIComponent(passEnc || "");
  await copyText(pass ? `${user}\t${pass}` : user);
}

document.addEventListener("DOMContentLoaded", loadBizRolePage);
