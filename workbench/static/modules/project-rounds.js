/* 项目「本轮测试」结论（PRD M2/M3，从 app.js 热区抽出）
 * 依赖全局：api / escapeHtml / activeProjectId / activeProjectOverview /
 *          openTestScriptRemoteInstall
 */
function openActiveProjectInstall() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  const project = activeProjectOverview?.project;
  if (project) {
    sessionStorage.setItem("workbench_project_context", JSON.stringify({
      projectId: project.id,
      projectName: project.name,
      assetProjects: project.asset_projects || [],
      ganttProjectIds: project.gantt_project_ids || [],
    }));
  }
  openTestScriptRemoteInstall();
}

async function refreshProjectRoundList() {
  const box = document.getElementById("project-round-list");
  if (!box || !activeProjectId) return;
  const data = await api(`projects/${encodeURIComponent(activeProjectId)}/rounds`);
  if (data?.error) {
    box.innerHTML = `<p class="hint">${escapeHtml(data.error)}</p>`;
    return;
  }
  const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
  if (!rounds.length) {
    box.innerHTML = '<p class="hint">尚无结论。跑完测点/冒烟后，在上方保存本轮结果。</p>';
    return;
  }
  box.innerHTML = `
    <ul class="project-round-history">
      ${rounds.slice(0, 8).map(r => {
        const st = escapeHtml(r.statusLabel || r.status || "");
        const cls = `round-status-${escapeHtml(r.status || "wip")}`;
        const note = escapeHtml(r.note || r.blocker || "（无备注）");
        const when = escapeHtml(r.createdAt || "");
        return `<li>
          <span class="round-status ${cls}">${st}</span>
          <span class="round-time">${when}</span>
          <span class="round-note">${note}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="deleteProjectRound('${escapeHtml(r.id)}')">删除</button>
        </li>`;
      }).join("")}
    </ul>`;
}

async function saveProjectRoundResult() {
  if (!activeProjectId) {
    alert("请先打开一个项目");
    return;
  }
  const status = document.getElementById("project-round-status")?.value || "wip";
  const note = document.getElementById("project-round-note")?.value || "";
  const res = await api(`projects/${encodeURIComponent(activeProjectId)}/rounds`, {
    method: "POST",
    body: { status, note, blocker: status === "blocked" ? note : "" },
  });
  if (res?.error) {
    alert(res.error);
    return;
  }
  const noteEl = document.getElementById("project-round-note");
  if (noteEl) noteEl.value = "";
  await refreshProjectRoundList();
}

async function deleteProjectRound(roundId) {
  if (!activeProjectId || !roundId) return;
  if (!confirm("删除这条本轮结论？")) return;
  const res = await api(
    `projects/${encodeURIComponent(activeProjectId)}/rounds/${encodeURIComponent(roundId)}`,
    { method: "DELETE" }
  );
  if (res?.error) {
    alert(res.error);
    return;
  }
  await refreshProjectRoundList();
}
