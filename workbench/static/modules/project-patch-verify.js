/* 项目「小版本验证」：新增 / 查看详情 / 编辑 / 备注
 * 依赖全局：activeProjectId / activeProjectOverview / escapeHtml / api
 */
let _patchVerifyEditingId = null;
let _patchVerifyCache = [];

function ensureProjectPatchVerifyModal() {
  let modal = document.getElementById("project-patch-verify-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "project-patch-verify-modal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content project-patch-modal-content" role="dialog" aria-modal="true" aria-labelledby="project-patch-modal-title">
      <div class="project-patch-modal-head">
        <div>
          <h2 id="project-patch-modal-title">新增小版本验证</h2>
          <p class="hint" id="project-patch-modal-hint">可选包体 · 已修 bug · 写清验证步骤</p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeProjectPatchVerifyModal()">关闭</button>
      </div>
      <div class="project-patch-form">
        <label>
          <span>标题（可空，默认取验证内容首行）</span>
          <input id="project-patch-title" type="text" placeholder="例如：渠道池绑定起始时间改为当日0点" autocomplete="off">
        </label>
        <label>
          <span>结论</span>
          <select id="project-patch-status">
            <option value="pass">通过</option>
            <option value="blocked">阻塞</option>
            <option value="fail">未通过</option>
            <option value="wip">进行中</option>
          </select>
        </label>
        <label>
          <span>已修复 bug（可多行）</span>
          <textarea id="project-patch-bugs" rows="3" placeholder="例如：&#10;[BUG] 搜索无结果&#10;支付回调偶发失败"></textarea>
        </label>
        <label>
          <span>验证内容 / 可能改到的点</span>
          <textarea id="project-patch-content" rows="6" placeholder="可写步骤、前置、预期结果"></textarea>
        </label>
        <label class="project-patch-remark-wrap">
          <span>备注 / 补充说明（支持 Ctrl+V 粘贴截图）</span>
          <textarea id="project-patch-remark" rows="3" placeholder="可写文字；复制截图后在此 Ctrl+V 粘贴"></textarea>
          <div id="project-patch-remark-thumbs" class="project-patch-remark-thumbs"></div>
        </label>
        <label class="project-patch-file">
          <span id="project-patch-file-label">包体（可选，后端修复可跳过）</span>
          <input id="project-patch-package" type="file" accept=".apk,.ipa,.aab,.zip,.rar,.7z,.exe">
        </label>
      </div>
      <div class="modal-actions project-patch-actions">
        <button type="button" class="btn" id="project-patch-clear-btn" onclick="clearProjectPatchForm()">清空</button>
        <button type="button" class="btn" onclick="closeProjectPatchVerifyModal()">取消</button>
        <button type="button" class="btn primary" id="project-patch-save-btn" onclick="saveProjectPatchVerification()">保存</button>
      </div>
    </div>`;
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeProjectPatchVerifyModal();
  });
  document.body.appendChild(modal);
  bindProjectPatchRemarkPaste();
  return modal;
}

function ensureProjectPatchDetailModal() {
  let modal = document.getElementById("project-patch-detail-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "project-patch-detail-modal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content project-patch-modal-content" role="dialog" aria-modal="true" aria-labelledby="project-patch-detail-title">
      <div class="project-patch-modal-head">
        <div>
          <h2 id="project-patch-detail-title">验证详情</h2>
          <p class="hint" id="project-patch-detail-meta"></p>
        </div>
        <button type="button" class="btn btn-sm" onclick="closeProjectPatchDetailModal()">关闭</button>
      </div>
      <div id="project-patch-detail-body" class="project-patch-detail-body"></div>
      <div class="modal-actions project-patch-actions">
        <button type="button" class="btn" onclick="closeProjectPatchDetailModal()">关闭</button>
        <button type="button" class="btn primary" id="project-patch-detail-edit-btn" onclick="">编辑 / 补备注</button>
      </div>
    </div>`;
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeProjectPatchDetailModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function openProjectPatchVerifyModal() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  _patchVerifyEditingId = null;
  const modal = ensureProjectPatchVerifyModal();
  const name = activeProjectOverview?.project?.name || activeProjectId;
  const titleEl = document.getElementById("project-patch-modal-title");
  const hint = document.getElementById("project-patch-modal-hint");
  const fileLabel = document.getElementById("project-patch-file-label");
  const clearBtn = document.getElementById("project-patch-clear-btn");
  if (titleEl) titleEl.textContent = "新增小版本验证";
  if (hint) hint.textContent = `项目：${name} · 可选包体 · 列表用简洁标题展示`;
  if (fileLabel) fileLabel.textContent = "包体（可选，后端修复可跳过）";
  if (clearBtn) clearBtn.classList.remove("hidden");
  clearProjectPatchForm();
  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("project-patch-title")?.focus(), 30);
}

function closeProjectPatchVerifyModal() {
  _patchVerifyEditingId = null;
  document.getElementById("project-patch-verify-modal")?.classList.add("hidden");
}

function closeProjectPatchDetailModal() {
  document.getElementById("project-patch-detail-modal")?.classList.add("hidden");
}

function clearProjectPatchForm() {
  const title = document.getElementById("project-patch-title");
  const bugs = document.getElementById("project-patch-bugs");
  const content = document.getElementById("project-patch-content");
  const remark = document.getElementById("project-patch-remark");
  const file = document.getElementById("project-patch-package");
  const status = document.getElementById("project-patch-status");
  if (title) title.value = "";
  if (bugs) bugs.value = "";
  if (content) content.value = "";
  if (remark) remark.value = "";
  if (file) file.value = "";
  if (status) status.value = "pass";
  refreshProjectPatchRemarkThumbs();
}

function insertTextAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const needsNlBefore = before && !before.endsWith("\n");
  const chunk = `${needsNlBefore ? "\n" : ""}${text}\n`;
  el.value = before + chunk + after;
  const pos = (before + chunk).length;
  el.selectionStart = el.selectionEnd = pos;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function extractRemarkImageUrls(text) {
  const urls = [];
  const re = /!\[[^\]]*\]\((\/api\/projects\/[^)\s]+\/patch-remark-images\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    if (!urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

function refreshProjectPatchRemarkThumbs() {
  const box = document.getElementById("project-patch-remark-thumbs");
  const remark = document.getElementById("project-patch-remark");
  if (!box) return;
  const urls = extractRemarkImageUrls(remark?.value || "");
  if (!urls.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = urls.map(u =>
    `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="备注截图"></a>`
  ).join("");
}

function bindProjectPatchRemarkPaste() {
  const remark = document.getElementById("project-patch-remark");
  if (!remark || remark.dataset.pasteBound === "1") return;
  remark.dataset.pasteBound = "1";
  remark.addEventListener("input", refreshProjectPatchRemarkThumbs);
  remark.addEventListener("paste", async (e) => {
    const modal = document.getElementById("project-patch-verify-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    if (!activeProjectId) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type?.startsWith("image/")) continue;
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = (item.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      const file = new File([blob], `截图_${stamp}.${ext}`, { type: item.type });
      const fd = new FormData();
      fd.append("file", file);
      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(activeProjectId)}/patch-remark-images`,
          { method: "POST", body: fd }
        );
        const data = await resp.json();
        if (!resp.ok || data?.error) {
          alert(data?.error || "截图上传失败");
          return;
        }
        insertTextAtCursor(remark, `![截图](${data.url})`);
        refreshProjectPatchRemarkThumbs();
      } catch (err) {
        alert("截图上传失败：" + (err?.message || err));
      }
      return;
    }
  });
}

function fillProjectPatchForm(item) {
  ensureProjectPatchVerifyModal();
  const title = document.getElementById("project-patch-title");
  const bugs = document.getElementById("project-patch-bugs");
  const content = document.getElementById("project-patch-content");
  const remark = document.getElementById("project-patch-remark");
  const file = document.getElementById("project-patch-package");
  const status = document.getElementById("project-patch-status");
  if (title) title.value = item?.title || "";
  if (bugs) bugs.value = item?.bugsFixed || "";
  if (content) content.value = item?.content || "";
  if (remark) remark.value = item?.remark || "";
  if (file) file.value = "";
  if (status) status.value = item?.status || "pass";
  refreshProjectPatchRemarkThumbs();
}

function getCachedPatchItem(itemId) {
  return (_patchVerifyCache || []).find(it => String(it.id) === String(itemId)) || null;
}

async function fetchPatchItem(itemId) {
  const cached = getCachedPatchItem(itemId);
  if (cached && (cached.content || cached.bugsFixed || cached.remark)) return cached;
  const data = await api(
    `projects/${encodeURIComponent(activeProjectId)}/patch-verifications/${encodeURIComponent(itemId)}`
  );
  if (data?.error) throw new Error(data.error);
  return data?.item || null;
}

function patchPackageDownloadUrl(itemId) {
  if (!activeProjectId || !itemId) return "";
  return `/api/projects/${encodeURIComponent(activeProjectId)}/patch-verifications/${encodeURIComponent(itemId)}/package`;
}

function renderRemarkHtml(text) {
  const raw = String(text || "").trim();
  if (!raw) return escapeHtml("（无）");
  const withImgs = escapeHtml(raw).replace(
    /!\[([^\]]*)\]\((\/api\/projects\/[^)\s]+\/patch-remark-images\/[^)\s]+)\)/g,
    (_m, alt, url) =>
      `<a class="project-patch-remark-img-link" href="${url}" target="_blank" rel="noopener">` +
      `<img class="project-patch-remark-img" src="${url}" alt="${alt || "截图"}"></a>`
  );
  return withImgs;
}

function renderPatchDetailBody(item) {
  const pkgHtml = item.packageName
    ? `<a class="patch-pkg-link" href="${escapeHtml(patchPackageDownloadUrl(item.id))}" download="${escapeHtml(item.packageName)}">${escapeHtml(item.packageName)}</a>
       <a class="btn btn-sm" style="margin-left:8px" href="${escapeHtml(patchPackageDownloadUrl(item.id))}" download="${escapeHtml(item.packageName)}">下载包体</a>`
    : "无包体";
  const blocks = [
    ["结论", escapeHtml(item.statusLabel || item.status || "—"), true],
    ["标题", escapeHtml(item.title || "—"), true],
    ["已修复 bug", `<pre class="project-patch-detail-val">${escapeHtml(item.bugsFixed || "（无）")}</pre>`, true],
    ["验证内容", `<pre class="project-patch-detail-val">${escapeHtml(item.content || "（无）")}</pre>`, true],
    ["备注", `<div class="project-patch-detail-val project-patch-remark-view">${renderRemarkHtml(item.remark)}</div>`, true],
    ["包体", pkgHtml, true],
    ["创建时间", escapeHtml(item.createdAt || "—"), true],
    ["更新时间", escapeHtml(item.updatedAt || item.createdAt || "—"), true],
  ];
  return blocks.map(([k, v]) => `
    <div class="project-patch-detail-row">
      <div class="project-patch-detail-key">${escapeHtml(k)}</div>
      <div class="project-patch-detail-val-wrap">${v}</div>
    </div>`).join("");
}

async function viewProjectPatchVerification(itemId) {
  if (!activeProjectId || !itemId) return;
  let item;
  try {
    item = await fetchPatchItem(itemId);
  } catch (err) {
    alert(err?.message || "加载详情失败");
    return;
  }
  if (!item) {
    alert("记录不存在");
    return;
  }
  const modal = ensureProjectPatchDetailModal();
  const titleEl = document.getElementById("project-patch-detail-title");
  const meta = document.getElementById("project-patch-detail-meta");
  const body = document.getElementById("project-patch-detail-body");
  const editBtn = document.getElementById("project-patch-detail-edit-btn");
  if (titleEl) titleEl.textContent = item.title || "验证详情";
  if (meta) {
    meta.textContent = `${item.statusLabel || item.status || ""} · ${item.createdAt || ""}${item.packageName ? " · " + item.packageName : ""}`;
  }
  if (body) body.innerHTML = renderPatchDetailBody(item);
  if (editBtn) {
    editBtn.onclick = () => {
      closeProjectPatchDetailModal();
      editProjectPatchVerification(itemId);
    };
  }
  modal.classList.remove("hidden");
}

async function editProjectPatchVerification(itemId) {
  if (!activeProjectId || !itemId) return;
  let item;
  try {
    item = await fetchPatchItem(itemId);
  } catch (err) {
    alert(err?.message || "加载失败");
    return;
  }
  if (!item) {
    alert("记录不存在");
    return;
  }
  _patchVerifyEditingId = itemId;
  const modal = ensureProjectPatchVerifyModal();
  const name = activeProjectOverview?.project?.name || activeProjectId;
  const titleEl = document.getElementById("project-patch-modal-title");
  const hint = document.getElementById("project-patch-modal-hint");
  const fileLabel = document.getElementById("project-patch-file-label");
  const clearBtn = document.getElementById("project-patch-clear-btn");
  if (titleEl) titleEl.textContent = "编辑小版本验证";
  if (hint) hint.textContent = `项目：${name} · 可改结论 / 内容 / 备注`;
  if (fileLabel) {
    fileLabel.textContent = item.packageName
      ? `更换包体（可选，当前：${item.packageName}）`
      : "包体（可选，当前无包体）";
  }
  if (clearBtn) clearBtn.classList.add("hidden");
  fillProjectPatchForm(item);
  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("project-patch-remark")?.focus(), 30);
}

async function refreshProjectPatchVerifyList() {
  const box = document.getElementById("project-patch-verify-list");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/patch-verifications`);
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  _patchVerifyCache = items;
  if (!items.length) {
    box.innerHTML = '<p class="hint">尚无记录。点击右上角「新增验证」写入本次验证内容。</p>';
    return;
  }
  box.innerHTML = `
    <ul class="project-round-history project-patch-history">
      ${items.slice(0, 12).map(it => {
        const st = escapeHtml(it.statusLabel || it.status || "");
        const cls = `round-status-${escapeHtml(it.status || "wip")}`;
        const title = escapeHtml(it.title || "小版本验证");
        const when = escapeHtml(it.createdAt || "");
        const id = escapeHtml(it.id);
        const pkg = it.packageName
          ? `<a class="patch-pkg patch-pkg-link" href="${escapeHtml(patchPackageDownloadUrl(it.id))}" download="${escapeHtml(it.packageName)}" title="点击下载包体">包：${escapeHtml(it.packageName)}</a>`
          : '<span class="patch-pkg muted">无包体</span>';
        const bugs = escapeHtml((it.bugsFixed || "").trim().split("\n")[0] || "");
        const bugsLine = bugs
          ? `<span class="patch-bugs" title="${escapeHtml(it.bugsFixed || "")}">bug：${bugs}</span>`
          : "";
        const remarkHint = (it.remark || "").trim()
          ? `<span class="patch-remark-hint">有备注</span>`
          : "";
        return `<li class="project-patch-item">
          <span class="round-status ${cls}">${st}</span>
          <span class="round-time">${when}</span>
          <button type="button" class="patch-title-btn" title="点击查看详情" onclick="viewProjectPatchVerification('${id}')">${title}</button>
          ${pkg}
          ${bugsLine}
          ${remarkHint}
          <span class="patch-item-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="viewProjectPatchVerification('${id}')">查看</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="editProjectPatchVerification('${id}')">编辑</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="deleteProjectPatchVerification('${id}')">删除</button>
          </span>
        </li>`;
      }).join("")}
    </ul>`;
}

async function saveProjectPatchVerification() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  ensureProjectPatchVerifyModal();
  const title = document.getElementById("project-patch-title")?.value || "";
  const bugsFixed = document.getElementById("project-patch-bugs")?.value || "";
  const content = document.getElementById("project-patch-content")?.value || "";
  const remark = document.getElementById("project-patch-remark")?.value || "";
  const status = document.getElementById("project-patch-status")?.value || "wip";
  const fileInput = document.getElementById("project-patch-package");
  const file = fileInput?.files?.[0];

  if (!String(title).trim() && !String(bugsFixed).trim() && !String(content).trim()) {
    alert("请至少填写标题、已修复 bug 或验证内容之一");
    return;
  }

  const btn = document.getElementById("project-patch-save-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
  }

  const fd = new FormData();
  fd.append("title", title);
  fd.append("bugsFixed", bugsFixed);
  fd.append("content", content);
  fd.append("remark", remark);
  fd.append("status", status);
  if (file) fd.append("package", file);

  const editingId = _patchVerifyEditingId;
  const url = editingId
    ? `/api/projects/${encodeURIComponent(activeProjectId)}/patch-verifications/${encodeURIComponent(editingId)}`
    : `/api/projects/${encodeURIComponent(activeProjectId)}/patch-verifications`;
  const method = editingId ? "PUT" : "POST";

  let res;
  try {
    const resp = await fetch(url, { method, body: fd });
    const raw = await resp.text();
    try {
      res = JSON.parse(raw);
    } catch (_) {
      const looksHtml = /^\s*<!doctype/i.test(raw) || /^\s*<html/i.test(raw);
      alert(
        looksHtml
          ? "保存失败：后端还是旧进程（接口未更新）。请重启 start.bat 后 Ctrl+F5 再试。"
          : `保存失败：服务器返回非 JSON（HTTP ${resp.status}）`
      );
      return;
    }
    if (!resp.ok && !res.error) res.error = resp.statusText || "保存失败";
  } catch (err) {
    alert("保存失败：" + (err?.message || err));
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存";
    }
  }
  if (res?.error) {
    alert(res.error);
    return;
  }
  clearProjectPatchForm();
  closeProjectPatchVerifyModal();
  await refreshProjectPatchVerifyList();
}

async function deleteProjectPatchVerification(itemId) {
  if (!activeProjectId || !itemId) return;
  if (!confirm("删除这条小版本验证？")) return;
  const res = await api(
    `projects/${encodeURIComponent(activeProjectId)}/patch-verifications/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
  if (res?.error) {
    alert(res.error);
    return;
  }
  await refreshProjectPatchVerifyList();
}
