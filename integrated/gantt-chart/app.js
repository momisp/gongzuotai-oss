(function () {
  const DAY_W = 32;
  const MINI_W = 22;
  const PCOLORS = ['#d97757', '#7ba88a', '#c9a87c', '#9a7fb8', '#5a9a6e', '#c45c5c'];
  const STORAGE_KEY = 'gantt-schedule-v1';
  const ZENTAO_CFG_KEY = 'gantt-zentao-config-v1';
  const DEFAULT_ZENTAO_URL = 'http://zentao.example.com';
  let projects = [];
  let tasks = [];
  let view = 'single';
  let drag = null;
  let selectedProjectId = '';
  let taskFilter = '';
  let editMode = false;
  let prototypeEditPid = null;
  let pendingScrollToToday = true;

  const $ = (id) => document.getElementById(id);
  const statusBar = $('statusBar');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPrototypeLinks(proj) {
    if (!proj || !Array.isArray(proj.prototypeLinks)) return [];
    return proj.prototypeLinks.filter((l) => l && String(l.url || '').trim());
  }

  function prototypeLinkCount(proj) {
    return getPrototypeLinks(proj).length;
  }

  function normalizeLinkUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return 'https://' + u;
  }

  function loadZentaoConfig() {
    try {
      const raw = localStorage.getItem(ZENTAO_CFG_KEY);
      if (!raw) return { url: DEFAULT_ZENTAO_URL, pathPrefix: '', user: '', password: '' };
      const data = JSON.parse(raw);
      return {
        url: data.url || DEFAULT_ZENTAO_URL,
        pathPrefix: data.pathPrefix || '',
        user: data.user || '',
        password: data.password || '',
      };
    } catch {
      return { url: DEFAULT_ZENTAO_URL, pathPrefix: '', user: '', password: '' };
    }
  }

  function saveZentaoConfig(cfg) {
    try {
      localStorage.setItem(ZENTAO_CFG_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  function zentaoApiRoot(cfg) {
    let root = (cfg.url || '').replace(/\/$/, '');
    const prefix = (cfg.pathPrefix || '').trim().replace(/^\/?/, '/').replace(/\/$/, '');
    if (prefix && prefix !== '/') root += prefix;
    return root;
  }

  function zentaoExecutionUrl(executionId) {
    const id = parseInt(executionId, 10);
    if (!id) return '';
    const cfg = loadZentaoConfig();
    return zentaoApiRoot(cfg) + '/execution-task-' + id + '.html';
  }

  function parseExecutionId(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const m = s.match(/(?:task[-_]?|execution[-_]?)?(\d+)/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n > 0 ? n : null;
  }

  function updateModeStatus() {
    if (view === 'archive') {
      const n = archivedProjects().length;
      setStatus('归档目录 · 共 ' + n + ' 个已归档项目');
      return;
    }
    if (editMode) {
      const cfg = loadZentaoConfig();
      const zt = cfg.user ? ' · 禅道已配置' : ' · 可点「禅道账号」配置';
      if (view === 'single') {
        const filterHint = taskFilter ? ' · 筛选「' + taskFilter + '」' : '';
        setStatus('编辑模式 · 可新建/拖拽/绑定禅道' + filterHint + zt);
      } else {
        setStatus('编辑模式 · 多项目并排 · 共 ' + activeProjects().length + ' 个项目' + zt);
      }
      return;
    }
    const filterHint = taskFilter ? ' · 筛选「' + taskFilter + '」' : '';
    if (view === 'single') {
      setStatus('查看模式 · 点击已绑定禅道的项目名称可跳转' + filterHint);
    } else {
      setStatus('查看模式 · 多项目并排 · 共 ' + activeProjects().length + ' 个项目');
    }
  }

  function setEditMode(on) {
    editMode = !!on;
    document.body.classList.toggle('is-edit-mode', editMode);
    const btn = $('editModeBtn');
    if (btn) {
      btn.textContent = editMode ? '退出编辑' : '编辑模式';
      btn.classList.toggle('active', editMode);
    }
    if (!editMode && drag) onDragEnd();
    render();
    updateModeStatus();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, tasks }));
    } catch (e) {
      /* 隐私模式或配额满时忽略 */
    }
    scheduleGanttSync();
  }

  let ganttSyncTimer = null;
  function scheduleGanttSync() {
    clearTimeout(ganttSyncTimer);
    ganttSyncTimer = setTimeout(syncGanttIndex, 1200);
  }

  function syncGanttIndex() {
    if (!projects.length) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        archived: !!p.archived,
        zentaoExecutionId: p.zentaoExecutionId || null,
        zentaoLabel: p.zentaoLabel || '',
        prototypeLinks: getPrototypeLinks(p),
        tasks: getProjectTasks(p.id).map((t) => ({
          name: t.name,
          start: t.start,
          end: t.end,
          status: t.status,
        })),
      })),
    };
    fetch('/api/gantt/project-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function () {});
  }

  function applyGanttFocusProject() {
    try {
      const name = sessionStorage.getItem('gantt-focus-project');
      if (!name) return;
      sessionStorage.removeItem('gantt-focus-project');
      const proj = projects.find((p) => p.name === name);
      if (!proj) return;
      const sel = $('taskProject');
      if (sel) sel.value = proj.id;
      setStatus('已定位项目：' + name);
    } catch (e) {}
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Array.isArray(data.projects)) projects = data.projects;
      if (Array.isArray(data.tasks)) tasks = data.tasks;
      return projects.length > 0 || tasks.length > 0;
    } catch (e) {
      return false;
    }
  }

  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    const r = new Date(y, m - 1, d);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function dayNum(d) {
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function diffDays(a, b) {
    return dayNum(b) - dayNum(a);
  }

  function isWeekend(d) {
    const w = d.getDay();
    return w === 0 || w === 6;
  }

  function showError(msg) {
    $('errorMsg').textContent = msg;
    $('errorMsg').classList.add('show');
    statusBar.textContent = msg;
    statusBar.classList.add('is-error');
  }

  function setStatus(msg) {
    $('errorMsg').classList.remove('show');
    statusBar.classList.remove('is-error');
    statusBar.textContent = msg;
  }

  function projColor(i) {
    return PCOLORS[i % PCOLORS.length];
  }

  function getProjectTasks(pid) {
    return tasks.filter((t) => t.projectId === pid);
  }

  function activeProjects() {
    return projects.filter((p) => !p.archived);
  }

  function archivedProjects() {
    return projects.filter((p) => !!p.archived);
  }

  function isProjectAllDone(proj) {
    const pt = getProjectTasks(proj.id);
    return pt.length > 0 && pt.every((t) => t.status === 'done');
  }

  function activeTasks() {
    const ids = new Set(activeProjects().map((p) => p.id));
    return tasks.filter((t) => ids.has(t.projectId));
  }

  function taskKeywordType(name) {
    if (/验收/.test(name)) return 'accept';
    if (/测试/.test(name)) return 'test';
    if (/开发/.test(name)) return 'dev';
    return null;
  }

  function barDisplayClass(tk) {
    const kw = taskKeywordType(tk.name);
    if (kw) return 'kw-' + kw;
    return barClass(tk);
  }

  function barKeywordColor(name) {
    const kw = taskKeywordType(name);
    if (kw === 'dev') return 'linear-gradient(90deg, #6ba3e8 0%, #3b82c4 100%)';
    if (kw === 'test') return 'linear-gradient(90deg, #8fc49e 0%, #5a9a6e 100%)';
    if (kw === 'accept') return 'linear-gradient(90deg, #f0d060 0%, #e8b84a 100%)';
    return null;
  }

  function matchesTaskFilter(tk) {
    if (!taskFilter) return true;
    return tk.name.includes(taskFilter);
  }

  function barColor(bc) {
    return { overdue: '#c45c5c', done: '#5a9a6e', doing: '#d97757', todo: '#9a928a' }[bc] || '#9a928a';
  }

  function getGlobalRange(taskList) {
    const t = today();
    if (!taskList.length) {
      return { start: addDays(t, -3), end: addDays(t, 14) };
    }
    let min = parseDate(taskList[0].start);
    let max = parseDate(taskList[0].end);
    taskList.forEach((tk) => {
      const s = parseDate(tk.start);
      const e = parseDate(tk.end);
      if (s < min) min = s;
      if (e > max) max = e;
    });
    let start = addDays(min, -2);
    let end = addDays(max, 4);
    if (t < start) start = addDays(t, -3);
    if (t > end) end = addDays(t, 7);
    return { start, end };
  }

  function barClass(tk) {
    if (tk.status !== 'done' && parseDate(tk.end) < today()) return 'overdue';
    return tk.status;
  }

  function updateStats() {
    const td = today();
    const ap = activeProjects();
    const at = activeTasks();
    $('statProjects').textContent = ap.length;
    $('statTotal').textContent = at.length;
    $('statDoing').textContent = at.filter((t) => t.status === 'doing').length;
    $('statOverdue').textContent = at.filter((t) => t.status !== 'done' && parseDate(t.end) < td).length;
  }

  function refreshProjectSelect() {
    const sel = $('taskProject');
    const prev = selectedProjectId || sel.value;
    const list = activeProjects();
    const empty = !list.length;
    sel.innerHTML = empty
      ? '<option value="">请先建项目</option>'
      : list.map((p) => '<option value="' + p.id + '">' + p.name + '</option>').join('');
    $('addTaskBtn').disabled = empty;
    if (!empty) {
      if (prev && list.some((p) => p.id === prev)) {
        sel.value = prev;
        selectedProjectId = prev;
      } else {
        selectedProjectId = list[0].id;
        sel.value = selectedProjectId;
      }
    } else {
      selectedProjectId = '';
    }
  }

  function renderProjectGroupRow(proj, pi, pt, days) {
    const c = projColor(pi);
    const zid = proj.zentaoExecutionId || '';
    const allDone = isProjectAllDone(proj);
    let nameHtml;
    if (!editMode && zid) {
      nameHtml =
        '<a class="project-link" href="' +
        escapeHtml(zentaoExecutionUrl(zid)) +
        '" target="_blank" rel="noopener" title="打开禅道 execution-task-' +
        zid +
        '">' +
        escapeHtml(proj.name) +
        '</a>';
    } else {
      nameHtml = escapeHtml(proj.name);
    }
    if (allDone) {
      nameHtml += '<span class="archive-done-tag">已完成</span>';
    }
    let midHtml = '';
    if (editMode) {
      midHtml =
        '<button type="button" class="btn btn-ghost btn-sm btn-proto" onclick="openPrototypeEdit(\'' +
        proj.id +
        '\')">原型需求编辑' +
        (prototypeLinkCount(proj) ? ' (' + prototypeLinkCount(proj) + ')' : '') +
        '</button>';
    } else {
      midHtml =
        '<button type="button" class="btn btn-ghost btn-sm btn-proto" onclick="openPrototypeView(\'' +
        proj.id +
        '\')">原型需求' +
        (prototypeLinkCount(proj) ? ' (' + prototypeLinkCount(proj) + ')' : '') +
        '</button>';
    }
    let rightHtml = '';
    if (allDone) {
      rightHtml +=
        '<button type="button" class="btn btn-archive" onclick="archiveProject(\'' +
        proj.id +
        '\')" title="移入归档目录，主列表不再显示">归档</button>';
    }
    if (editMode) {
      rightHtml +=
        '<span class="zentao-bind">' +
        '<label>禅道执行ID</label>' +
        '<input type="text" class="zentao-id-inp" data-pid="' +
        proj.id +
        '" value="' +
        (zid || '') +
        '" placeholder="如 320" title="execution-task-320 中的数字">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="bindZentaoExecution(\'' +
        proj.id +
        '\')">绑定</button>' +
        (proj.zentaoLabel ? '<span class="zentao-label">' + escapeHtml(proj.zentaoLabel) + '</span>' : '') +
        '</span>' +
        '<button type="button" class="btn btn-danger" onclick="delProject(\'' +
        proj.id +
        '\')">删项目</button>';
    } else if (zid) {
      rightHtml += '<span class="zentao-tag">禅道 #' + zid + '</span>';
    }
    return (
      '<tr class="project-group">' +
      '<td class="project-group-label"><span class="project-tag" style="background:' +
      c +
      '"></span>' +
      nameHtml +
      '<span style="color:var(--text-muted);font-weight:400;margin-left:6px">' +
      pt.length +
      ' 项</span>' +
      midHtml +
      '<span class="project-group-actions">' +
      rightHtml +
      '</span></td>' +
      '<td class="project-group-span" colspan="' +
      days +
      '"></td></tr>'
    );
  }

  function scrollGanttToToday(force) {
    if (!force && !pendingScrollToToday) return;
    pendingScrollToToday = false;
    requestAnimationFrame(function () {
      const scrollEl = document.querySelector('#viewSingle .panel-scroll');
      if (!scrollEl || view !== 'single') return;
      const todayCell =
        scrollEl.querySelector('th.day-col.today') || scrollEl.querySelector('td.cell.today');
      if (!todayCell) return;
      const leftCol = scrollEl.querySelector('.gantt-table thead th:first-child');
      const scrollRect = scrollEl.getBoundingClientRect();
      const cellRect = todayCell.getBoundingClientRect();
      const leftW = leftCol ? leftCol.getBoundingClientRect().width : 220;
      const cellCenter =
        cellRect.left - scrollRect.left + scrollEl.scrollLeft + cellRect.width / 2;
      const target = cellCenter - leftW - (scrollEl.clientWidth - leftW) / 2;
      scrollEl.scrollLeft = Math.max(0, Math.min(target, scrollEl.scrollWidth - scrollEl.clientWidth));
    });
  }

  function renderSingle() {
    const el = $('singleContent');
    const list = activeProjects();
    if (!list.length) {
      el.innerHTML =
        '<div class="empty"><div class="empty-icon">📅</div><p>暂无项目</p><small>' +
        (editMode
          ? '点击「新建项目」开始'
          : archivedProjects().length
            ? '当前项目均已归档，可在「归档目录」查看或恢复'
            : '进入「编辑模式」后可新建项目') +
        '</small></div>';
      return;
    }
    const visibleTasks = activeTasks();
    const range = getGlobalRange(visibleTasks);
    const days = diffDays(range.start, range.end) + 1;
    const tdIdx = diffDays(range.start, today());

    let hdr = '<th>任务</th>';
    for (let i = 0; i < days; i++) {
      const d = addDays(range.start, i);
      const cls = [isWeekend(d) && 'weekend', i === tdIdx && 'today'].filter(Boolean).join(' ');
      hdr += '<th class="day-col ' + cls + '">' + (d.getMonth() + 1) + '/' + d.getDate() + '</th>';
    }

    let rows = '';
    list.forEach((proj, pi) => {
      const pt = getProjectTasks(proj.id).filter(matchesTaskFilter);
      if (taskFilter && !pt.length) return;
      rows += renderProjectGroupRow(proj, pi, pt, days);
      if (!pt.length) {
        rows += '<tr><td style="color:var(--text-muted);font-weight:400">暂无任务</td>';
        for (let i = 0; i < days; i++) rows += '<td class="cell"></td>';
        rows += '</tr>';
        return;
      }
      pt.forEach((tk) => {
        const ts = parseDate(tk.start);
        const te = parseDate(tk.end);
        const si = diffDays(range.start, ts);
        const span = diffDays(ts, te) + 1;
        const bc = barDisplayClass(tk);
        const sl = { todo: '未开始', doing: '进行中', done: '已完成' }[tk.status];
        let cells = '';
        for (let i = 0; i < days; i++) {
          const d = addDays(range.start, i);
          const cls = ['cell', isWeekend(d) && 'weekend', i === tdIdx && 'today'].filter(Boolean).join(' ');
          let inner = '';
          if (i >= si && i < si + span) {
            const isStart = i === si;
            const isEnd = i === si + span - 1;
            const radius = isStart && isEnd ? '4px' : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : '0';
            if (isStart) {
              inner =
                '<div class="bar ' +
                bc +
                (editMode ? '' : ' bar-readonly') +
                '" data-id="' +
                tk.id +
                '" style="border-radius:' +
                radius +
                '">' +
                escapeHtml(tk.name) +
                '</div>';
            } else {
              inner = '<div class="bar ' + bc + ' bar-part" style="border-radius:' + radius + '"></div>';
            }
          }
          if (i === tdIdx) inner += '<div class="today-line"></div>';
          cells += '<td class="' + cls + '">' + inner + '</td>';
        }
        const gIdx = tasks.indexOf(tk);
        const actionsHtml = editMode
          ? '<div class="task-actions edit-only"><button type="button" class="btn btn-ghost btn-sm" onclick="cycleStatus(' +
            gIdx +
            ')">切换</button><button type="button" class="btn btn-danger" onclick="removeTask(' +
            gIdx +
            ')">删除</button></div>'
          : '';
        rows +=
          '<tr><td><div>' +
          escapeHtml(tk.name) +
          '</div><div class="task-meta">' +
          tk.start +
          ' ~ ' +
          tk.end +
          ' · ' +
          sl +
          '</div>' +
          actionsHtml +
          '</td>' +
          cells +
          '</tr>';
      });
    });

    el.innerHTML = '<table class="gantt-table"><thead><tr>' + hdr + '</tr></thead><tbody>' + rows + '</tbody></table>';
    if (!rows && taskFilter) {
      el.innerHTML =
        '<div class="empty"><div class="empty-icon">🔍</div><p>没有包含「' +
        taskFilter +
        '」的任务</p><small>可切换筛选条件或添加对应任务</small></div>';
      return;
    }
    el.querySelectorAll('.bar:not(.bar-readonly)').forEach((b) => b.addEventListener('mousedown', onDragStart));
    scrollGanttToToday();
  }

  function renderMulti() {
    const el = $('viewMulti');
    const list = activeProjects();
    if (!list.length) {
      el.innerHTML =
        '<div class="proj-card" style="grid-column:1/-1"><div class="proj-empty">' +
        (archivedProjects().length
          ? '当前项目均已归档 · 请到「归档目录」查看'
          : '暂无项目 · 请先新建或加载示例') +
        '</div></div>';
      return;
    }
    const visibleTasks = activeTasks();
    el.innerHTML = list
      .map((proj, pi) => {
        const pt = getProjectTasks(proj.id);
        const c = projColor(pi);
        if (!pt.length) {
          return (
            '<div class="proj-card"><div class="proj-card-head"><h2><span class="project-tag" style="background:' +
            c +
            '"></span>' +
            escapeHtml(proj.name) +
            '</h2><span class="badge">0 任务</span></div><div class="proj-empty">暂无任务</div></div>'
          );
        }
        const range = getGlobalRange(visibleTasks);
        const days = diffDays(range.start, range.end) + 1;
        const tdIdx = diffDays(range.start, today());
        const showDays = Math.min(days, 14);
        let hdr = '<th></th>';
        for (let i = 0; i < showDays; i++) {
          const d = addDays(range.start, i);
          hdr += '<th>' + (d.getMonth() + 1) + '/' + d.getDate() + '</th>';
        }
        let body = '';
        pt.forEach((tk) => {
          const ts = parseDate(tk.start);
          const te = parseDate(tk.end);
          const si = diffDays(range.start, ts);
          const span = diffDays(ts, te) + 1;
          const bc = barDisplayClass(tk);
          const kwBg = barKeywordColor(tk.name);
          const bg = kwBg || barColor(bc);
          body += '<tr><td title="' + escapeHtml(tk.name) + '">' + escapeHtml(tk.name) + '</td>';
          for (let i = 0; i < showDays; i++) {
            let inner = '';
            if (i >= si && i < si + span) {
              const isStart = i === si;
              const w = isStart ? Math.min(span, showDays - i) * MINI_W - 2 : 0;
              if (isStart) inner = '<div class="mini-bar" style="width:' + w + 'px;background:' + bg + '"></div>';
              else inner = '<div class="mini-bar" style="left:0;width:100%;background:' + bg + '"></div>';
            }
            body += '<td class="mini-cell' + (i === tdIdx ? ' today' : '') + '">' + inner + '</td>';
          }
          body += '</tr>';
        });
        const doing = pt.filter((t) => t.status === 'doing').length;
        const done = pt.filter((t) => t.status === 'done').length;
        return (
          '<div class="proj-card"><div class="proj-card-head"><h2><span class="project-tag" style="background:' +
          c +
          '"></span>' +
          escapeHtml(proj.name) +
          '</h2><span class="badge">' +
          pt.length +
          ' 任务 · ' +
          doing +
          ' 进行 · ' +
          done +
          ' 完成</span></div><div class="proj-card-body"><table class="mini-table"><thead><tr>' +
          hdr +
          '</tr></thead><tbody>' +
          body +
          '</tbody></table></div></div>'
        );
      })
      .join('');
  }

  function renderArchiveInlineLinks(proj) {
    const chips = [];
    getPrototypeLinks(proj).forEach((l) => {
      chips.push(
        '<a class="archive-proto-chip" href="' +
          escapeHtml(normalizeLinkUrl(l.url)) +
          '" target="_blank" rel="noopener" title="' +
          escapeHtml(l.url) +
          '">' +
          escapeHtml(l.label || l.url) +
          '</a>'
      );
    });
    const zid = proj.zentaoExecutionId || '';
    if (zid) {
      const zlabel = proj.zentaoLabel ? ' · ' + escapeHtml(proj.zentaoLabel) : '';
      chips.push(
        '<a class="archive-proto-chip archive-zentao-chip" href="' +
          escapeHtml(zentaoExecutionUrl(zid)) +
          '" target="_blank" rel="noopener" title="打开禅道 execution-task-' +
          zid +
          '">禅道 #' +
          zid +
          zlabel +
          '</a>'
      );
    }
    if (!chips.length) return '';
    return '<div class="archive-proto-links">' + chips.join('') + '</div>';
  }

  function renderArchiveTitle(proj, zid) {
    if (zid) {
      return (
        '<a class="project-link" href="' +
        escapeHtml(zentaoExecutionUrl(zid)) +
        '" target="_blank" rel="noopener" title="打开禅道 execution-task-' +
        zid +
        '">' +
        escapeHtml(proj.name) +
        '</a>'
      );
    }
    return escapeHtml(proj.name);
  }

  function renderArchive() {
    const el = $('archiveContent');
    if (!el) return;
    const list = archivedProjects();
    if (!list.length) {
      el.innerHTML =
        '<div class="empty"><div class="empty-icon">📦</div><p>归档目录为空</p><small>任务全部完成后，可在项目行点击「归档」</small></div>';
      return;
    }
    el.innerHTML =
      '<div class="archive-list">' +
      list
        .map((proj) => {
          const pt = getProjectTasks(proj.id);
          const done = pt.filter((t) => t.status === 'done').length;
          const zid = proj.zentaoExecutionId || '';
          const protoCount = prototypeLinkCount(proj);
          const zentaoBtn = zid
            ? '<a class="btn btn-ghost btn-sm archive-zentao-btn" href="' +
              escapeHtml(zentaoExecutionUrl(zid)) +
              '" target="_blank" rel="noopener" title="打开禅道 execution-task-' +
              zid +
              '">打开禅道 #' +
              zid +
              '</a>'
            : '';
          return (
            '<div class="archive-item">' +
            '<div class="archive-item-main"><strong>' +
            renderArchiveTitle(proj, zid) +
            '</strong><span>' +
            pt.length +
            ' 项任务 · ' +
            done +
            ' 已完成' +
            '</span>' +
            renderArchiveInlineLinks(proj) +
            '</div>' +
            '<div class="archive-item-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm btn-proto" onclick="openPrototypeView(\'' +
            proj.id +
            '\')">原型需求' +
            (protoCount ? ' (' + protoCount + ')' : '') +
            '</button>' +
            zentaoBtn +
            '<button type="button" class="btn btn-ghost btn-sm" onclick="unarchiveProject(\'' +
            proj.id +
            '\')">恢复到主列表</button></div></div>'
          );
        })
        .join('') +
      '</div>';
  }

  function render() {
    updateStats();
    refreshProjectSelect();
    renderSingle();
    renderMulti();
    renderArchive();
    persist();
  }

  function switchView(v) {
    view = v;
    $('tabSingle').classList.toggle('active', v === 'single');
    $('tabMulti').classList.toggle('active', v === 'multi');
    if ($('tabArchive')) $('tabArchive').classList.toggle('active', v === 'archive');
    $('viewSingle').classList.toggle('hide', v !== 'single');
    $('viewMulti').classList.toggle('hide', v !== 'multi');
    if ($('viewArchive')) $('viewArchive').classList.toggle('hide', v !== 'archive');
    if ($('filterRow')) $('filterRow').classList.toggle('hide', v !== 'single');
    const legend = document.querySelector('.legend');
    if (legend) legend.classList.toggle('hide', v === 'archive');
    updateModeStatus();
    if (v === 'single') {
      pendingScrollToToday = true;
      scrollGanttToToday(true);
    }
  }

  function onDragStart(e) {
    if (!editMode) return;
    e.preventDefault();
    const id = e.currentTarget.dataset.id;
    const tk = tasks.find((t) => t.id === id);
    if (!tk) return;
    drag = { id, startX: e.clientX, origStart: tk.start, origEnd: tk.end };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    setStatus('拖拽中 · 「' + tk.name + '」');
  }

  function onDragMove(e) {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / DAY_W);
    if (!delta) return;
    const tk = tasks.find((t) => t.id === drag.id);
    const os = parseDate(drag.origStart);
    const oe = parseDate(drag.origEnd);
    const span = diffDays(os, oe);
    const ns = addDays(os, delta);
    tk.start = fmtDate(ns);
    tk.end = fmtDate(addDays(ns, span));
    render();
  }

  function onDragEnd() {
    if (drag) {
      const tk = tasks.find((t) => t.id === drag.id);
      setStatus('已更新 · 「' + tk.name + '」' + tk.start + ' ~ ' + tk.end);
      drag = null;
    }
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  window.cycleStatus = function (idx) {
    if (!editMode) return;
    const order = ['todo', 'doing', 'done'];
    tasks[idx].status = order[(order.indexOf(tasks[idx].status) + 1) % 3];
    setStatus('「' + tasks[idx].name + '」→ ' + { todo: '未开始', doing: '进行中', done: '已完成' }[tasks[idx].status]);
    render();
  };

  window.removeTask = function (idx) {
    if (!editMode) return;
    const n = tasks[idx].name;
    tasks.splice(idx, 1);
    setStatus('已删除「' + n + '」');
    render();
  };

  window.delProject = function (id) {
    if (!editMode) return;
    const p = projects.find((x) => x.id === id);
    tasks = tasks.filter((t) => t.projectId !== id);
    projects = projects.filter((x) => x.id !== id);
    setStatus('已删除项目「' + p.name + '」及其任务');
    render();
  };

  window.archiveProject = function (id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (!isProjectAllDone(p)) {
      setStatus('仅全部任务已完成的项目可归档');
      return;
    }
    p.archived = true;
    setStatus('已归档「' + p.name + '」· 可在「归档目录」查看');
    render();
  };

  window.unarchiveProject = function (id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    p.archived = false;
    setStatus('已恢复「' + p.name + '」到主列表');
    render();
  };

  window.bindZentaoExecution = async function (pid) {
    if (!editMode) return;
    const inp = document.querySelector('.zentao-id-inp[data-pid="' + pid + '"]');
    const raw = inp ? inp.value : '';
    const eid = parseExecutionId(raw);
    const proj = projects.find((p) => p.id === pid);
    if (!proj) return;
    if (!eid) {
      proj.zentaoExecutionId = null;
      delete proj.zentaoLabel;
      persist();
      render();
      setStatus('已清除「' + proj.name + '」的禅道绑定');
      return;
    }
    proj.zentaoExecutionId = eid;
    const cfg = loadZentaoConfig();
    if (cfg.user && cfg.password) {
      try {
        const res = await fetch('/api/gantt/zentao/execution-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: cfg.url,
            pathPrefix: cfg.pathPrefix,
            user: cfg.user,
            password: cfg.password,
            executionId: eid,
          }),
        });
        const data = await res.json();
        if (data.ok && data.data && data.data.label) {
          proj.zentaoLabel = data.data.label;
        } else {
          delete proj.zentaoLabel;
        }
      } catch (_) {
        delete proj.zentaoLabel;
      }
    }
    persist();
    render();
    setStatus('已绑定「' + proj.name + '」→ 禅道 execution-task-' + eid);
  };

  $('addProjBtn').onclick = function () {
    const name = $('projName').value.trim();
    if (!name) {
      showError('请输入项目名称');
      return;
    }
    projects.push({ id: 'p' + Date.now(), name });
    $('projName').value = '';
    setStatus('已创建项目「' + name + '」，当前 ' + projects.length + ' 个');
    render();
  };

  $('addTaskBtn').onclick = function () {
    const pid = $('taskProject').value;
    const name = $('taskName').value.trim();
    const start = $('startDate').value;
    const end = $('endDate').value;
    if (!pid) {
      showError('请先创建项目');
      return;
    }
    if (!name) {
      showError('请输入任务名称');
      return;
    }
    if (!start || !end) {
      showError('请选择日期');
      return;
    }
    if (parseDate(end) < parseDate(start)) {
      showError('结束不能早于开始');
      return;
    }
    tasks.push({ id: 't' + Date.now(), projectId: pid, name, start, end, status: $('taskStatus').value });
    selectedProjectId = pid;
    $('taskName').value = '';
    const pn = projects.find((p) => p.id === pid).name;
    setStatus('已在「' + pn + '」添加「' + name + '」');
    render();
  };

  function inferStatus(start, end) {
    const t = today();
    const s = parseDate(start);
    const e = parseDate(end);
    if (e < t) return 'done';
    if (s <= t && t <= e) return 'doing';
    return 'todo';
  }

  const SAMPLE_SCHEDULE = `源之蜂巢 1.2.6 + 零散需求排期
项目周期
开发：7 天｜06.03 - 06.10
测试：2 天｜06.11 - 06.12
验收：1天｜06.15
需求明细
一、OA 功能
1.渠道激活：指定周期内，将登录、流水未达标渠道划入激活池
2.开服表：列表排序调整为创建时间倒序
3.角色查询：优化接口查询效率
4.自动发放礼包：新增关键词搜索输入功能
5.OA 移动端：下线账号密码登录，仅保留手机验证码登录
二、管理后台
1.调整联运游戏分发规则
三、会长端
1.扶持申请：删除页面指定文案
2.游戏盒子申请：安卓、iOS 打包合并
四、龙翔盒子后台
1.新增礼包排序配置功能
2.新增唯一码查看入口
五、会长游戏落地页
1.新增链接格式校验，非法链接禁止跳转访问
原分包系统需求 顺延至7.2验收完毕`;

  function mdToIso(m, d, year) {
    return fmtDate(new Date(year, m - 1, d));
  }

  function parseScheduleText(text) {
    const year = today().getFullYear();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let projectName = '';
    let devRange = null;
    const milestoneTasks = [];
    const sectionMap = {};
    let currentSection = '';
    const extraProjects = [];

    lines.forEach((line) => {
      if (/^项目周期$|^需求明细$/.test(line)) return;

      const deferMatch = line.match(/^(.+?)\s*顺延至\s*(\d{1,2})\.(\d{1,2})/);
      if (deferMatch) {
        const name = deferMatch[1].trim();
        const end = mdToIso(+deferMatch[2], +deferMatch[3], year);
        const start = devRange ? devRange.start : fmtDate(today());
        extraProjects.push({
          name: name.length > 20 ? name.slice(0, 20) : name,
          tasks: [{ name: '顺延验收', start, end, status: inferStatus(start, end) }],
        });
        return;
      }

      const phaseMatch = line.match(/^([^：:]+)[：:]\s*(?:\d+\s*天\s*)?[｜|]\s*(\d{1,2})\.(\d{1,2})(?:\s*[-–~至到]\s*(\d{1,2})\.(\d{1,2}))?/);
      if (phaseMatch && /开发|测试|验收|联调|上线|设计|评审/.test(phaseMatch[1])) {
        const name = phaseMatch[1].trim();
        const m1 = +phaseMatch[2];
        const d1 = +phaseMatch[3];
        const m2 = phaseMatch[4] ? +phaseMatch[4] : m1;
        const d2 = phaseMatch[5] ? +phaseMatch[5] : d1;
        const start = mdToIso(m1, d1, year);
        const end = mdToIso(m2, d2, year);
        milestoneTasks.push({ name, start, end, status: inferStatus(start, end) });
        if (/开发/.test(name)) devRange = { start, end };
        return;
      }

      const secMatch = line.match(/^[一二三四五六七八九十百]+、(.+)$/);
      if (secMatch) {
        currentSection = secMatch[1].trim();
        if (!sectionMap[currentSection]) sectionMap[currentSection] = [];
        return;
      }

      const reqMatch = line.match(/^\d+[.、]\s*(.+?)(?:[:：]|$)/);
      if (reqMatch && currentSection) {
        const taskName = reqMatch[1].trim();
        const range = devRange || { start: fmtDate(today()), end: fmtDate(addDays(today(), 7)) };
        sectionMap[currentSection].push({
          name: taskName.length > 28 ? taskName.slice(0, 28) + '…' : taskName,
          start: range.start,
          end: range.end,
          status: inferStatus(range.start, range.end),
        });
        return;
      }

      if (!projectName && !/^[\d一二三四五六七八九十]/.test(line) && line.length <= 60) {
        projectName = line.replace(/\s*排期\s*$/, '').trim();
      }
    });

    if (!projectName) projectName = '导入项目';

    const result = [];
    if (milestoneTasks.length) {
      result.push({ name: projectName, tasks: milestoneTasks });
    }
    Object.keys(sectionMap).forEach((sec) => {
      if (sectionMap[sec].length) {
        result.push({ name: sec, tasks: sectionMap[sec] });
      }
    });
    extraProjects.forEach((p) => result.push(p));

    if (!result.length) {
      throw new Error('未能识别排期内容，请检查格式（需含阶段日期或需求条目）');
    }
    return result;
  }

  function applyParsedProjects(parsed) {
    projects = [];
    tasks = [];
    parsed.forEach((p) => {
      const pid = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
      projects.push({ id: pid, name: p.name });
      p.tasks.forEach((tk) => {
        tasks.push({
          id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
          projectId: pid,
          name: tk.name,
          start: tk.start,
          end: tk.end,
          status: tk.status,
        });
      });
    });
    render();
    switchView('single');
  }

  let pendingImage = null;

  function openModal() {
    $('parseModal').classList.remove('hide');
    $('parseInput').focus();
  }

  function closeModal() {
    $('parseModal').classList.add('hide');
    pendingImage = null;
    $('imgPreview').classList.add('hide');
    $('imgPreview').innerHTML = '';
  }

  function setParseLog(msg, type) {
    const el = $('parseLog');
    el.textContent = msg;
    el.className = 'parse-log' + (type ? ' is-' + type : '');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ocrImage(file) {
    setParseLog('正在识别图片文字…');
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const result = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setParseLog('识别中 ' + Math.round(m.progress * 100) + '%');
        }
      },
    });
    return result.data.text;
  }

  function handleImageFile(file) {
    pendingImage = file;
    const url = URL.createObjectURL(file);
    $('imgPreview').innerHTML = '<img src="' + url + '" alt="粘贴的图片"><p>已贴入图片，点击「解析并生成」进行 OCR 识别</p>';
    $('imgPreview').classList.remove('hide');
    setParseLog('已贴入图片，点击「解析并生成」识别');
  }

  $('openParseBtn').onclick = openModal;
  $('closeModal').onclick = closeModal;
  $('modalBackdrop').onclick = closeModal;

  $('parseSampleBtn').onclick = function () {
    $('parseInput').value = SAMPLE_SCHEDULE;
    setParseLog('已填入示例排期');
  };

  $('pasteZone').addEventListener('paste', function (e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        handleImageFile(items[i].getAsFile());
        return;
      }
    }
  });

  $('parseBtn').onclick = async function () {
    let text = $('parseInput').value.trim();
    try {
      if (pendingImage) {
        text = (await ocrImage(pendingImage)).trim();
        $('parseInput').value = text;
        pendingImage = null;
        $('imgPreview').classList.add('hide');
        $('imgPreview').innerHTML = '';
      }
      if (!text) {
        setParseLog('请先粘贴文字或图片', 'error');
        return;
      }
      const parsed = parseScheduleText(text);
      const totalTasks = parsed.reduce((n, p) => n + p.tasks.length, 0);
      applyParsedProjects(parsed);
      closeModal();
      setStatus('已解析 · ' + parsed.length + ' 个项目、' + totalTasks + ' 条任务');
    } catch (err) {
      setParseLog(err.message || '解析失败', 'error');
    }
  };

  $('demoBtn').onclick = function () {
    const t = today();
    projects = [
      { id: 'p1', name: '移动端 2.0' },
      { id: 'p2', name: '后台重构' },
      { id: 'p3', name: '数据大屏' },
    ];
    tasks = [
      { id: 't1', projectId: 'p1', name: 'UI 设计', start: fmtDate(addDays(t, -3)), end: fmtDate(addDays(t, 2)), status: 'doing' },
      { id: 't2', projectId: 'p1', name: '前端开发', start: fmtDate(addDays(t, 1)), end: fmtDate(addDays(t, 10)), status: 'todo' },
      { id: 't3', projectId: 'p1', name: '提测', start: fmtDate(addDays(t, 9)), end: fmtDate(addDays(t, 12)), status: 'todo' },
      { id: 't4', projectId: 'p2', name: '架构评审', start: fmtDate(addDays(t, -5)), end: fmtDate(addDays(t, -2)), status: 'done' },
      { id: 't5', projectId: 'p2', name: 'API 改造', start: fmtDate(addDays(t, -1)), end: fmtDate(addDays(t, 8)), status: 'doing' },
      { id: 't6', projectId: 'p2', name: '迁移验证', start: fmtDate(addDays(t, 7)), end: fmtDate(addDays(t, 14)), status: 'todo' },
      { id: 't7', projectId: 'p3', name: '需求确认', start: fmtDate(addDays(t, -2)), end: fmtDate(t), status: 'done' },
      { id: 't8', projectId: 'p3', name: '图表组件', start: fmtDate(addDays(t, 1)), end: fmtDate(addDays(t, 9)), status: 'doing' },
      { id: 't9', projectId: 'p3', name: '联调上线', start: fmtDate(addDays(t, 8)), end: fmtDate(addDays(t, 15)), status: 'todo' },
    ];
    setStatus('已加载 3 个项目 · 9 条任务 · 可切换「多项目并排」查看');
    render();
  };

  async function importPrototypeFromAssets() {
    if (!prototypeEditPid) return;
    const proj = projects.find((p) => p.id === prototypeEditPid);
    if (!proj) return;
    try {
      const res = await fetch('/api/project-assets/for-gantt?project=' + encodeURIComponent(proj.name));
      const assets = await res.json();
      if (!res.ok || assets.error) {
        alert('导入失败：' + (assets.error || res.statusText));
        return;
      }
      if (!assets.length) {
        alert('项目资产中未找到「' + proj.name + '」的链接类资产');
        return;
      }
      const existing = collectPrototypeEditRows();
      const urls = new Set(existing.map((l) => l.url));
      let added = 0;
      assets.forEach((a) => {
        const url = (a.url || '').trim();
        if (!url || urls.has(url)) return;
        const label = (a.name || a.note || url).trim();
        existing.push({ label: label, url: url });
        urls.add(url);
        added++;
      });
      renderPrototypeEditRows(existing);
      setStatus('已从项目资产导入 ' + added + ' 条链接（' + assets.length + ' 条可用，已去重）');
    } catch (err) {
      alert('导入失败：' + (err.message || err));
    }
  }

  function renderPrototypeEditRows(links) {
    const list = links.length ? links : [{ label: '', url: '' }];
    $('prototypeEditList').innerHTML = list
      .map(
        (link, i) =>
          '<div class="proto-edit-row" data-idx="' +
          i +
          '">' +
          '<input type="text" class="proto-label" placeholder="备注名（可选）" value="' +
          escapeHtml(link.label || '') +
          '">' +
          '<input type="text" class="proto-url" placeholder="https:// 或域名/路径" value="' +
          escapeHtml(link.url || '') +
          '">' +
          '<button type="button" class="btn btn-ghost btn-sm proto-del">删除</button>' +
          '</div>'
      )
      .join('');
  }

  function collectPrototypeEditRows() {
    const rows = $('prototypeEditList').querySelectorAll('.proto-edit-row');
    const links = [];
    rows.forEach((row) => {
      const label = (row.querySelector('.proto-label')?.value || '').trim();
      const rawUrl = (row.querySelector('.proto-url')?.value || '').trim();
      if (!rawUrl) return;
      links.push({ label: label || rawUrl, url: normalizeLinkUrl(rawUrl) });
    });
    return links;
  }

  window.openPrototypeView = function (pid) {
    const proj = projects.find((p) => p.id === pid);
    if (!proj) return;
    $('prototypeViewTitle').textContent = proj.name + ' · 原型需求';
    const links = getPrototypeLinks(proj);
    const listEl = $('prototypeViewList');
    if (!links.length) {
      listEl.innerHTML = '<p class="proto-empty">暂无原型链接</p>';
    } else {
      listEl.innerHTML = links
        .map(
          (l) =>
            '<a class="proto-view-link" href="' +
            escapeHtml(normalizeLinkUrl(l.url)) +
            '" target="_blank" rel="noopener">' +
            '<strong>' +
            escapeHtml(l.label || l.url) +
            '</strong>' +
            '<span>' +
            escapeHtml(l.url) +
            '</span></a>'
        )
        .join('');
    }
    $('prototypeViewModal').classList.remove('hide');
  };

  window.openPrototypeEdit = function (pid) {
    if (!editMode) return;
    const proj = projects.find((p) => p.id === pid);
    if (!proj) return;
    prototypeEditPid = pid;
    $('prototypeEditTitle').textContent = '编辑原型需求 · ' + proj.name;
    renderPrototypeEditRows(getPrototypeLinks(proj));
    $('prototypeEditModal').classList.remove('hide');
  };

  function closePrototypeViewModal() {
    $('prototypeViewModal').classList.add('hide');
  }

  function closePrototypeEditModal() {
    $('prototypeEditModal').classList.add('hide');
    prototypeEditPid = null;
  }

  function savePrototypeLinks() {
    if (!prototypeEditPid) return;
    const proj = projects.find((p) => p.id === prototypeEditPid);
    if (!proj) return;
    proj.prototypeLinks = collectPrototypeEditRows();
    persist();
    closePrototypeEditModal();
    render();
    setStatus('已保存「' + proj.name + '」原型需求 ' + proj.prototypeLinks.length + ' 条链接');
  }

  function openZentaoModal() {
    const cfg = loadZentaoConfig();
    $('ztUrl').value = cfg.url || DEFAULT_ZENTAO_URL;
    $('ztPathPrefix').value = cfg.pathPrefix || '';
    $('ztUser').value = cfg.user || '';
    $('ztPwd').value = cfg.password || '';
    $('ztLog').textContent = '';
    $('zentaoModal').classList.remove('hide');
  }

  function closeZentaoModal() {
    $('zentaoModal').classList.add('hide');
  }

  function setZtLog(msg, type) {
    const el = $('ztLog');
    el.textContent = msg;
    el.className = 'parse-log' + (type ? ' is-' + type : '');
  }

  function readZentaoForm() {
    return {
      url: ($('ztUrl').value || '').trim() || DEFAULT_ZENTAO_URL,
      pathPrefix: ($('ztPathPrefix').value || '').trim(),
      user: ($('ztUser').value || '').trim(),
      password: $('ztPwd').value || '',
    };
  }

  async function testZentaoConnection() {
    const cfg = readZentaoForm();
    if (!cfg.user || !cfg.password) {
      setZtLog('请填写账号和密码', 'error');
      return;
    }
    setZtLog('正在测试登录…');
    try {
      const res = await fetch('/api/gantt/zentao/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (data.ok) {
        setZtLog(data.message || '登录成功', 'ok');
        if ($('ztRemember').checked) saveZentaoConfig(cfg);
      } else {
        setZtLog(data.message || '登录失败', 'error');
      }
    } catch (err) {
      setZtLog(err.message || '请求失败', 'error');
    }
  }

  $('editModeBtn').onclick = function () {
    setEditMode(!editMode);
  };

  $('openZentaoBtn').onclick = openZentaoModal;
  $('closeZentaoModal').onclick = closeZentaoModal;
  $('zentaoBackdrop').onclick = closeZentaoModal;
  $('ztTestBtn').onclick = testZentaoConnection;
  $('ztSaveBtn').onclick = function () {
    const cfg = readZentaoForm();
    if ($('ztRemember').checked) {
      saveZentaoConfig(cfg);
      setZtLog('已保存到本机浏览器', 'ok');
    } else {
      saveZentaoConfig({ url: cfg.url, pathPrefix: cfg.pathPrefix, user: '', password: '' });
      setZtLog('已保存地址，未记住账号密码', 'ok');
    }
    updateModeStatus();
  };

  $('closePrototypeView').onclick = closePrototypeViewModal;
  $('prototypeViewBackdrop').onclick = closePrototypeViewModal;
  $('closePrototypeEdit').onclick = closePrototypeEditModal;
  $('prototypeEditBackdrop').onclick = closePrototypeEditModal;
  $('prototypeAddRow').onclick = function () {
    const links = collectPrototypeEditRows();
    links.push({ label: '', url: '' });
    renderPrototypeEditRows(links);
  };
  $('prototypeEditList').addEventListener('click', function (e) {
    const btn = e.target.closest('.proto-del');
    if (!btn) return;
    const row = btn.closest('.proto-edit-row');
    const rows = $('prototypeEditList').querySelectorAll('.proto-edit-row');
    if (rows.length <= 1) {
      row.querySelector('.proto-label').value = '';
      row.querySelector('.proto-url').value = '';
      return;
    }
    row.remove();
  });
  $('prototypeSaveBtn').onclick = savePrototypeLinks;
  $('prototypeImportAssets').onclick = importPrototypeFromAssets;

  $('tabSingle').onclick = () => switchView('single');
  $('tabMulti').onclick = () => switchView('multi');
  if ($('tabArchive')) $('tabArchive').onclick = () => switchView('archive');

  $('taskProject').addEventListener('change', function () {
    selectedProjectId = this.value;
  });

  $('taskFilter').addEventListener('change', function () {
    taskFilter = this.value;
    pendingScrollToToday = true;
    renderSingle();
    updateModeStatus();
  });

  const t = today();
  $('startDate').value = fmtDate(t);
  $('endDate').value = fmtDate(addDays(t, 4));
  document.body.classList.remove('is-edit-mode');
  editMode = false;
  const restored = loadStorage();
  render();
  applyGanttFocusProject();
  if (restored) syncGanttIndex();
  if (restored) {
    updateModeStatus();
  } else {
    setStatus('查看模式 · 点击「编辑模式」可新建任务、绑定禅道');
  }
})();