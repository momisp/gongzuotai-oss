import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LS = {
  provider: "agile_sim_provider",
  baseUrl: "agile_sim_base_url",
  apiKey: "agile_sim_api_key",
  cursorApiKey: "agile_sim_cursor_api_key",
  cursorRepoUrl: "agile_sim_cursor_repo_url",
  cursorRepoRef: "agile_sim_cursor_repo_ref",
  model: "agile_sim_model",
  projectHistory: "agile_sim_project_history",
};

/**
 * 开发环境走 Vite 同源代理（/api、/generated → 5180），本机与局域网访问均可用。
 * 若直连 127.0.0.1:5180，同事用你电脑 IP 打开页面时 API 会打到他们自己机器上。
 */
const API_ORIGIN = "";

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}

function reqImagesPayload(items, cap = 4) {
  return (items || []).slice(0, cap).map(({ dataUrl }) => ({ dataUrl }));
}

function dataUrlToImagePayload(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i.exec(raw);
  if (!m) return null;
  return { mime: m[1], base64: m[2].replace(/\s/g, ""), dataUrl: raw };
}

function projectTitleFromRequirement(req) {
  const t = String(req || "").trim();
  if (!t) return "当前项目";
  const head = t.slice(0, 24) + (t.length > 24 ? "…" : "");
  return `测试 · ${head}`;
}

function buildPmSolutions(req) {
  const t = (req || "").trim();
  const head = t ? t.slice(0, 80) + (t.length > 80 ? "…" : "") : "（请先在左侧填写用户需求）";
  return [
    {
      title: "方案一：MVP 快速落地",
      summary: `围绕「${head}」优先打通最小可用路径，单页演示核心流程，便于快速验证。`,
    },
    {
      title: "方案二：体验增强",
      summary:
        "在 MVP 基础上强化状态反馈、空态与动效，适合对交互细腻度有更高预期的产品形态。",
    },
    {
      title: "方案三：可演进架构",
      summary:
        "模块拆分与配置化预留，主题与接口可替换，为后续增功能、换视觉与接后端打基础。",
    },
  ];
}

function pmVariantFile(idx) {
  return `prototype-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

function uiVariantFile(idx) {
  return `ui-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

function buildUiSolutions(req) {
  const t = (req || "").trim();
  const head = t ? t.slice(0, 48) + (t.length > 48 ? "…" : "") : "业务需求";
  return [
    {
      title: "视觉方案 A · 清透极简",
      philosophy:
        "大留白、轻拟物层次与低对比分割线，强调阅读效率与信息分组；主色点缀引导操作。",
      fitFor: `与「${head}」的信息密集型展示相契合。`,
    },
    {
      title: "视觉方案 B · 温润亲和",
      philosophy:
        "圆角与柔和渐变、微动画过渡，营造轻松情绪；适合强调易用与情感连接的产品。",
      fitFor: "偏工具+轻度内容场景，降低学习成本。",
    },
    {
      title: "视觉方案 C · 干练效率",
      philosophy:
        "高密度栅格、强对比与克制动效，突出任务完成路径；适合生产力与专业用户。",
      fitFor: "流程短、操作频繁、强调反馈速度的场景。",
    },
  ];
}

function formatStreamElapsed(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} 分 ${String(r).padStart(2, "0")} 秒`;
}

/** 用流式字数估算「活动度」0–97%，非真实总进度 */
function streamActivityPercent(deltaChars) {
  if (!deltaChars) return 2;
  return Math.min(97, Math.floor(100 * (1 - Math.exp(-deltaChars / 16_500))));
}

/** 流水线五步高亮：0=PM 1=UI 2=FS 3=全栈后待命测试 4=测试进行中/完成 5=运维完成 */
function flowHighlightStep(phase) {
  if (phase === "idle") return -1;
  if (phase === "pm" || phase === "pm_review") return 0;
  if (phase === "ui" || phase === "ui_review") return 1;
  if (phase === "fs") return 2;
  if (phase === "done") return 3;
  if (phase === "qa" || phase === "qa_review") return 4;
  if (phase === "ops" || phase === "ops_review") return 5;
  return -1;
}

const PHASE_STATUS = {
  idle: "待开始 · 填写需求后先「总结需求」",
  pm: "进行中 · 产品经理",
  pm_review: "产品经理完成 · 可追问或进入 UI",
  ui: "进行中 · UI 设计",
  ui_review: "UI 完成 · 可追问或全栈落地",
  fs: "进行中 · 全栈落地",
  done: "全栈完成 · 可测试 / 运维",
  qa: "进行中 · 测试岗",
  qa_review: "测试岗 · 可生成测试点 / Playwright",
  ops: "进行中 · 运维岗",
  ops_review: "运维手册已生成",
};

function phaseStatusText(phase) {
  return PHASE_STATUS[phase] || "—";
}

function kindSectionTitle(kind) {
  if (kind === "smoke") return "冒烟自动化";
  if (kind === "business") return "业务测试点";
  return "功能测试点";
}

function classifyIssueReason(reason) {
  const r = String(reason || "");
  if (r.includes("[静态自检]")) return "static";
  if (r.includes("[Playwright]")) return "pw";
  if (r.includes("LLM") || r.includes("模型")) return "llm";
  return "other";
}

const ISSUE_TAG_LABEL = { static: "静态", pw: "Playwright", llm: "模型", other: "其他" };

async function consumeSse(url, body, onEvt) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text();
    throw new Error(t.slice(0, 500) || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() || "";
    for (const block of chunks) {
      for (const line of block.split("\n")) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const json = s.slice(5).trim();
        if (!json) continue;
        try {
          onEvt(JSON.parse(json));
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export default function App() {
  const [provider, setProvider] = useState(
    () => localStorage.getItem(LS.provider) || "openai"
  );
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem(LS.baseUrl) || "https://api.openai.com/v1"
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(LS.apiKey) || ""
  );
  const [cursorApiKey, setCursorApiKey] = useState(
    () => localStorage.getItem(LS.cursorApiKey) || ""
  );
  const [cursorRepoUrl, setCursorRepoUrl] = useState(
    () => localStorage.getItem(LS.cursorRepoUrl) || ""
  );
  const [cursorRepoRef, setCursorRepoRef] = useState(
    () => localStorage.getItem(LS.cursorRepoRef) ?? ""
  );
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem(LS.model);
    const p = localStorage.getItem(LS.provider) || "openai";
    let m = saved || (p === "cursor" ? "composer-2.5" : "gpt-4o-mini");
    if (p === "cursor" && (m === "composer-2" || m === "composer2" || m === "composer-2-fast")) {
      m = "composer-2.5";
    }
    return m;
  });
  const [requirement, setRequirement] = useState(
    "做一个倒数计时器：可设置分钟数，开始后显示剩余时间，可暂停与重置。"
  );
  /** 用户需求区附图 { name, dataUrl }[] */
  const [reqImageItems, setReqImageItems] = useState([]);
  const [pmSpecMd, setPmSpecMd] = useState("");
  const [pmSpecModalOpen, setPmSpecModalOpen] = useState(false);
  const [pmSpecGenerating, setPmSpecGenerating] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [phase, setPhase] = useState("idle");
  const [liveThought, setLiveThought] = useState("");
  const [logLines, setLogLines] = useState([]);
  /** 右侧主 Tab：产品经理 / UI / 全栈 / 测试 / 运维 / 她自己 */
  const [roleTab, setRoleTab] = useState("pm");
  const [pmSolutionIdx, setPmSolutionIdx] = useState(0);
  const [uiSolutionIdx, setUiSolutionIdx] = useState(0);
  /** 各方案是否已生成可预览 HTML */
  const [pmVariantReady, setPmVariantReady] = useState([false, false, false]);
  const [uiVariantReady, setUiVariantReady] = useState([false, false, false]);
  /** 定稿方案索引；下游角色据此读取 canonical 与变体 */
  const [pmFinalizedIdx, setPmFinalizedIdx] = useState(null);
  const [uiFinalizedIdx, setUiFinalizedIdx] = useState(null);
  /** 当前正在生成的方案 { role: 'pm'|'ui', idx } */
  const [variantBusy, setVariantBusy] = useState(null);
  /** 旧会话仅存在 prototype.html / ui.html 而无变体文件 */
  const [pmFile0IsLegacy, setPmFile0IsLegacy] = useState(false);
  const [uiFile0IsLegacy, setUiFile0IsLegacy] = useState(false);
  const [qaMaterial, setQaMaterial] = useState("");
  const [qaStyleHint, setQaStyleHint] = useState("");
  /** { name: string; dataUrl: string }[] */
  const [qaImageItems, setQaImageItems] = useState([]);
  const [qaMdPreview, setQaMdPreview] = useState("");
  const [opsMaterial, setOpsMaterial] = useState("");
  const [opsStyleHint, setOpsStyleHint] = useState("");
  const [opsImageItems, setOpsImageItems] = useState([]);
  const [opsMdPreview, setOpsMdPreview] = useState("");
  /** 5 个角色 Tab 共用的「追问对话」状态：{pm:[...], ui:[...], fs:[...], qa:[...], ops:[...]} */
  const [chatHistory, setChatHistory] = useState({ pm: [], ui: [], fs: [], qa: [], ops: [] });
  const [chatInput, setChatInput] = useState({ pm: "", ui: "", fs: "", qa: "", ops: "" });
  /** 追问附图的 dataUrl 列表，按角色分桶 */
  const [chatImageItems, setChatImageItems] = useState({
    pm: [],
    ui: [],
    fs: [],
    qa: [],
    ops: [],
  });
  /** 测试岗子 Tab：pipeline=敏捷流水线 / standalone=独立对外 */
  const [qaSubTab, setQaSubTab] = useState("pipeline");
  const [pipelineTestPoints, setPipelineTestPoints] = useState([]);
  const [pipelineActiveIdx, setPipelineActiveIdx] = useState(0);
  const [pipelineTestIssues, setPipelineTestIssues] = useState([]);
  const [pipelineTesting, setPipelineTesting] = useState(false);
  const [pipelineTestingIdx, setPipelineTestingIdx] = useState(-1);
  const [pipelineTestProgress, setPipelineTestProgress] = useState({
    current: 0,
    total: 0,
    title: "",
  });
  const [pipelineGenerating, setPipelineGenerating] = useState(false);
  /** 单独的 chat 进行中标记，避免与主流水线 busy 互相干扰 */
  const [chatBusyRole, setChatBusyRole] = useState("");
  /** 最近一次全栈落地时的方案快照，用于「确认变动」 */
  const [fsAppliedSnapshot, setFsAppliedSnapshot] = useState(null);
  const [outputDir, setOutputDir] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [overlayCompact, setOverlayCompact] = useState(false);
  const logScrollRef = useRef(null);
  /** 避免 iframe / fetch 在文件写入前就 404 后被浏览器缓存，导致成功后仍显示 Cannot GET */
  const [previewBust, setPreviewBust] = useState(0);
  const [historyRecords, setHistoryRecords] = useState(() => {
    try {
      const raw = localStorage.getItem(LS.projectHistory);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  });
  const [historyDetail, setHistoryDetail] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  /** 整段流水线进行中（含读文件、等 SSE），避免遮罩仅在 phase 切换时闪一下 */
  const [pipeActive, setPipeActive] = useState(false);
  /** 最近一次流水线失败（含服务端 SSE error 事件），便于看清「一闪而过」的原因 */
  const [pipelineError, setPipelineError] = useState(null);

  /** 遮罩层流式进度（ref 高频更新，用 tick 定时刷到界面） */
  const streamMetricsRef = useRef({
    startedAt: 0,
    deltaChars: 0,
    lastLines: [],
  });
  const [sseUiTick, setSseUiTick] = useState(0);
  /** SSE meta 下发的 sessionId（避免刚结束流式时 React state 仍未更新导致读不到会话） */
  const sessionFromStreamRef = useRef("");

  const requirementRef = useRef(requirement);
  const pmSolutionIdxRef = useRef(pmSolutionIdx);
  const uiSolutionIdxRef = useRef(uiSolutionIdx);
  useEffect(() => {
    requirementRef.current = requirement;
  }, [requirement]);
  useEffect(() => {
    pmSolutionIdxRef.current = pmSolutionIdx;
  }, [pmSolutionIdx]);
  useEffect(() => {
    uiSolutionIdxRef.current = uiSolutionIdx;
  }, [uiSolutionIdx]);

  const buildPlanSnapshot = useCallback(() => {
    return JSON.stringify({
      requirement: requirement.trim(),
      pm: pmFinalizedIdx ?? pmSolutionIdx,
      ui: uiFinalizedIdx ?? uiSolutionIdx,
      pmFinalized: pmFinalizedIdx,
      uiFinalized: uiFinalizedIdx,
    });
  }, [requirement, pmSolutionIdx, uiSolutionIdx, pmFinalizedIdx, uiFinalizedIdx]);

  const pmSolutions = useMemo(() => buildPmSolutions(requirement), [requirement]);
  const uiSolutions = useMemo(() => buildUiSolutions(requirement), [requirement]);

  const refreshSessionArtifacts = useCallback(async (sid) => {
    if (!sid) return;
    const bust = Date.now();
    const headOk = async (rel) => {
      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/${rel}?bust=${bust}`)
        );
        return r.ok;
      } catch {
        return false;
      }
    };
    const pmReady = [false, false, false];
    const uiReady = [false, false, false];
    for (let i = 0; i < 3; i++) {
      pmReady[i] = await headOk(pmVariantFile(i));
      uiReady[i] = await headOk(uiVariantFile(i));
    }
    const hasPm0 = pmReady[0];
    const hasPmLegacy = await headOk("prototype.html");
    if (!hasPm0 && hasPmLegacy) pmReady[0] = true;
    setPmFile0IsLegacy(!hasPm0 && hasPmLegacy);

    const hasUi0 = uiReady[0];
    const hasUiLegacy = await headOk("ui.html");
    if (!hasUi0 && hasUiLegacy) uiReady[0] = true;
    setUiFile0IsLegacy(!hasUi0 && hasUiLegacy);

    setPmVariantReady(pmReady);
    setUiVariantReady(uiReady);
    try {
      const r = await fetch(
        apiUrl(`/generated/${encodeURIComponent(sid)}/plan.json?bust=${bust}`)
      );
      if (r.ok) {
        const plan = await r.json();
        if (plan.pmFinalized != null) setPmFinalizedIdx(plan.pmFinalized);
        if (plan.uiFinalized != null) setUiFinalizedIdx(plan.uiFinalized);
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch(
        apiUrl(`/generated/${encodeURIComponent(sid)}/需求文档.md?bust=${bust}`)
      );
      if (r.ok) setPmSpecMd(await r.text());
      else setPmSpecMd("");
    } catch {
      setPmSpecMd("");
    }
  }, []);

  useEffect(() => {
    refreshSessionArtifacts(sessionId);
  }, [sessionId, previewBust, refreshSessionArtifacts]);

  const appendHistoryRecord = useCallback((rec) => {
    setHistoryRecords((prev) => {
      const item = {
        sessionId: rec.sessionId,
        outputDir: rec.outputDir,
        requirement: rec.requirement,
        finishedAt: rec.finishedAt || Date.now(),
      };
      const next = [
        item,
        ...prev.filter((r) => r.sessionId !== item.sessionId),
      ].slice(0, 40);
      try {
        localStorage.setItem(LS.projectHistory, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

  const config = useMemo(
    () => ({
      provider: provider === "cursor" ? "cursor" : "openai",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      cursorApiKey: cursorApiKey.trim(),
      cursorRepoUrl: cursorRepoUrl.trim(),
      cursorRepoRef: cursorRepoRef.trim(),
      model: model.trim(),
    }),
    [provider, baseUrl, apiKey, cursorApiKey, cursorRepoUrl, cursorRepoRef, model]
  );

  const configSummary = useMemo(() => {
    if (provider === "cursor") {
      const r = cursorRepoUrl.trim();
      return `Cursor · ${model.trim() || "默认模型"}${r ? "" : " · 未填仓库"}`;
    }
    return `OpenAI 兼容 · ${model.trim() || "默认模型"}`;
  }, [provider, model, cursorRepoUrl]);

  useEffect(() => {
    localStorage.setItem(LS.provider, provider);
  }, [provider]);
  useEffect(() => {
    localStorage.setItem(LS.baseUrl, baseUrl);
  }, [baseUrl]);
  useEffect(() => {
    localStorage.setItem(LS.apiKey, apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem(LS.cursorApiKey, cursorApiKey);
  }, [cursorApiKey]);
  useEffect(() => {
    localStorage.setItem(LS.cursorRepoUrl, cursorRepoUrl);
  }, [cursorRepoUrl]);
  useEffect(() => {
    localStorage.setItem(LS.cursorRepoRef, cursorRepoRef);
  }, [cursorRepoRef]);
  useEffect(() => {
    localStorage.setItem(LS.model, model);
    if (
      provider === "cursor" &&
      (model === "composer-2" || model === "composer2" || model === "composer-2-fast")
    ) {
      setModel("composer-2.5");
    }
  }, [model, provider]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (historyDetail) setHistoryDetail(null);
      else if (historyModalOpen) setHistoryModalOpen(false);
      else if (pmSpecModalOpen) setPmSpecModalOpen(false);
      else if (configModalOpen) setConfigModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDetail, historyModalOpen, pmSpecModalOpen, configModalOpen]);

  const checkBackendHealth = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/health"));
      const j = await r.json();
      window.alert(
        (j.hint ? `${j.hint}\n\n` : "") +
          `ok=${j.ok} · pipelineDebug=${j.pipelineDebug}\n生成目录: ${j.generatedDir ?? ""}\nskills 目录: ${j.skillsDir ?? ""}`
      );
    } catch (e) {
      window.alert(
        `无法访问 ${apiUrl("/api/health")}：${e.message || e}\n请确认已 npm run dev 且本机 5180 已监听。`
      );
    }
  }, []);

  const listCursorVisibleRepos = useCallback(async () => {
    const key = cursorApiKey.trim();
    if (!key) {
      window.alert("请先在弹层里填写 Cursor API Key");
      return;
    }
    try {
      const r = await fetch(apiUrl("/api/debug/cursor-repositories"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: key }),
      });
      const t = await r.text();
      if (!r.ok) {
        window.alert(`列出仓库失败 HTTP ${r.status}:\n${t.slice(0, 1200)}`);
        return;
      }
      const j = JSON.parse(t);
      const lines = (j.items || []).map((x) => x.url).filter(Boolean);
      window.alert(
        `${j.note || ""}\n\n本 Key 当前可见 ${j.total ?? lines.length} 个仓库（最多展示 80 条）：\n\n${lines.join("\n") || "(无 — 请到 Integrations 授权 GitHub 仓库)"}`
      );
    } catch (e) {
      window.alert(String(e.message || e));
    }
  }, [cursorApiKey]);

  const listCursorModels = useCallback(async () => {
    const key = cursorApiKey.trim();
    if (!key) {
      window.alert("请先在弹层里填写 Cursor API Key");
      return;
    }
    try {
      const r = await fetch(apiUrl("/api/debug/cursor-models"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: key }),
      });
      const t = await r.text();
      if (!r.ok) {
        window.alert(`列出模型失败 HTTP ${r.status}:\n${t.slice(0, 1200)}`);
        return;
      }
      const j = JSON.parse(t);
      const ids = j.ids || [];
      window.alert(
        `${j.note || ""}\n\n本 Key 可用 ${j.total ?? ids.length} 个模型 id（最多展示 80 条）：\n\n${ids.join("\n") || "(空 — 可留空 Model ID 或填 composer-2.5)"}`
      );
    } catch (e) {
      window.alert(String(e.message || e));
    }
  }, [cursorApiKey]);

  const pushLog = useCallback((text, muted) => {
    setLogLines((prev) => [
      ...prev,
      { t: Date.now(), text: String(text), muted: !!muted },
    ]);
  }, []);

  const openFolderInExplorer = useCallback(
    async (relativePath) => {
      let normalized = String(relativePath || "").replace(/\\/g, "/").trim();
      if (!normalized.startsWith("generated/") && sessionId) {
        normalized = `generated/${sessionId}/app`;
      }
      if (/\.(js|html|css)$/i.test(normalized)) {
        normalized = normalized.replace(/\/[^/]+\.(js|html|css)$/i, "/app");
      }
      if (!/\/app\/?$/i.test(normalized)) {
        normalized = `${normalized.replace(/\/$/, "")}/app`;
      }
      if (!normalized.startsWith("generated/")) {
        window.alert("只能打开 generated 下的路径");
        return;
      }
      const sid =
        sessionId ||
        (normalized.match(/^generated\/([^/]+)\//)?.[1] ?? "");
      try {
        const r = await fetch(apiUrl("/api/open-folder"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relativePath: normalized,
            sessionId: sid || undefined,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          window.alert(j.error || `打开失败 HTTP ${r.status}`);
          return;
        }
        const opened = j.openedAbs || j.path || normalized;
        pushLog(`已在资源管理器中打开：${opened}`, true);
        try {
          await navigator.clipboard.writeText(String(opened));
          window.alert(
            `已打开文件夹（若未看到窗口，请检查任务栏是否多了「文件资源管理器」）：\n\n${opened}\n\n路径已复制到剪贴板。`
          );
        } catch {
          window.alert(
            `已请求打开文件夹：\n\n${opened}\n\n若仍无窗口，请手动在资源管理器地址栏粘贴上述路径。`
          );
        }
      } catch (e) {
        window.alert(String(e.message || e));
      }
    },
    [sessionId, pushLog]
  );

  const resetPipeline = () => {
    setSessionId("");
    setPhase("idle");
    setLiveThought("");
    setLogLines([]);
    setOutputDir("");
    setRoleTab("pm");
    setReqImageItems([]);
    setPmSpecMd("");
    setPmSpecModalOpen(false);
    setPmSpecGenerating(false);
    setPmSolutionIdx(0);
    setUiSolutionIdx(0);
    setPmVariantReady([false, false, false]);
    setUiVariantReady([false, false, false]);
    setPmFinalizedIdx(null);
    setUiFinalizedIdx(null);
    setVariantBusy(null);
    setPmFile0IsLegacy(false);
    setUiFile0IsLegacy(false);
    setQaMaterial("");
    setQaStyleHint("");
    setQaImageItems([]);
    setQaMdPreview("");
    setOpsMaterial("");
    setOpsStyleHint("");
    setOpsImageItems([]);
    setOpsMdPreview("");
    setChatHistory({ pm: [], ui: [], fs: [], qa: [], ops: [] });
    setChatInput({ pm: "", ui: "", fs: "", qa: "", ops: "" });
    setChatBusyRole("");
    sessionFromStreamRef.current = "";
    setFsAppliedSnapshot(null);
    setBusyLabel("");
    setPreviewBust(0);
    streamMetricsRef.current = {
      startedAt: 0,
      deltaChars: 0,
      lastLines: [],
    };
    setSseUiTick(0);
    setPipeActive(false);
    setPipelineError(null);
  };

  const beginStreamTracking = () => {
    setPipelineError(null);
    streamMetricsRef.current = {
      startedAt: Date.now(),
      deltaChars: 0,
      lastLines: [],
    };
    setSseUiTick(0);
  };

  const attachSseHandlers = useCallback(
    () => {
      let deltaBuf = "";
      let deltaMilestone = 0;
      let lastStreamError = "";
      const pushRecent = (text) => {
        const s = String(text).replace(/\s+/g, " ").trim().slice(0, 96);
        if (!s) return;
        const m = streamMetricsRef.current;
        m.lastLines = [...m.lastLines.slice(-8), s];
      };
      return {
        onEvent: async (evt) => {
          const m = streamMetricsRef.current;
          if (evt.type === "meta" && evt.sessionId) {
            setSessionId(evt.sessionId);
            sessionFromStreamRef.current = evt.sessionId;
            pushRecent(`会话 ${evt.sessionId.slice(0, 24)}…`);
            pushLog(`会话 ${evt.sessionId} · 阶段 ${evt.phase}`, true);
          }
          if (evt.type === "thought") {
            pushLog(evt.text, false);
            setLiveThought((p) => p + evt.text);
            pushRecent(evt.text);
          }
          if (evt.type === "step") {
            setBusyLabel(evt.label || "");
            pushRecent(evt.label || "步骤更新");
            pushLog(`▸ ${evt.label}`, true);
          }
          if (evt.type === "delta" && evt.text) {
            deltaBuf += evt.text;
            const add = evt.text.length;
            m.deltaChars += add;
            const bracket = Math.floor(m.deltaChars / 8000);
            if (bracket > deltaMilestone) {
              deltaMilestone = bracket;
              pushRecent(
                `流式文本累计约 ${m.deltaChars.toLocaleString("zh-CN")} 字`
              );
            }
            setLiveThought((p) => p + evt.text);
          }
          if (evt.type === "exec") {
            pushLog(`执行：${evt.label}`, true);
            pushRecent(evt.label || "执行");
          }
          if (evt.type === "artifact") {
            pushLog(
              `产出：${evt.name}${
                evt.preview
                  ? `（${String(evt.preview).slice(0, 160)}${String(evt.preview).length > 160 ? "…" : ""}）`
                  : ""
              }`,
              true
            );
            pushRecent(`产出 ${evt.name}`);
          }
          if (evt.type === "qa_points" && Array.isArray(evt.points)) {
            setPipelineTestPoints(evt.points);
            setPipelineActiveIdx(0);
            if (evt.count > 0) {
              pushLog(`测试点列表已更新（${evt.count} 条）`, true);
            }
          }
          if (evt.type === "error") {
            lastStreamError = String(evt.message || "");
            pushLog(`错误：${evt.message}`, false);
            pushRecent(`错误：${String(evt.message).slice(0, 80)}`);
          }
          if (evt.type === "done") {
            if (evt.outputDir) setOutputDir(evt.outputDir);
            setBusyLabel("");
            if (evt.outputDir && evt.phase === "fullstack") {
              setFsAppliedSnapshot(
                JSON.stringify({
                  requirement: requirementRef.current.trim(),
                  pm: pmSolutionIdxRef.current,
                  ui: uiSolutionIdxRef.current,
                })
              );
              appendHistoryRecord({
                sessionId: evt.sessionId,
                outputDir: evt.outputDir,
                requirement: requirementRef.current.trim(),
                finishedAt: Date.now(),
              });
            }
          }
        },
        flushDeltaLog: () => {
          if (deltaBuf.trim()) {
            pushLog("[本段流式输出结束，已写入生成目录]", true);
          }
          deltaBuf = "";
          setLiveThought("");
        },
        getStreamError: () => lastStreamError,
      };
    },
    [pushLog, appendHistoryRecord]
  );

  useEffect(() => {
    if (!sessionId) setFsAppliedSnapshot(null);
  }, [sessionId]);

  const loadPmSpecMd = useCallback(async (sid) => {
    const id = sid || sessionId || sessionFromStreamRef.current;
    if (!id) return;
    try {
      const r = await fetch(
        apiUrl(
          `/generated/${encodeURIComponent(id)}/需求文档.md?bust=${Date.now()}`
        )
      );
      if (r.ok) setPmSpecMd(await r.text());
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const generatePmSpec = async () => {
    if (!requirement.trim() && !reqImageItems.length) {
      return alert("请先填写需求，或粘贴/上传参考图");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已连接 GitHub 的仓库地址");
    } else if (!config.apiKey) {
      return alert("请填写 OpenAI 兼容 API Key");
    }
    setPmSpecGenerating(true);
    setPipeActive(true);
    setPipelineError(null);
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("产品经理 · 总结需求");
    setLiveThought("");
    try {
      await consumeSse(
        apiUrl("/api/pipeline/pm-spec"),
        {
          requirement,
          config,
          sessionId: sessionId || undefined,
          images: reqImagesPayload(reqImageItems),
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "总结需求",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      } else {
        await loadPmSpecMd(sessionFromStreamRef.current || sessionId);
        pushLog("标准需求文档已生成（需求文档.md）", true);
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "总结需求",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setPmSpecGenerating(false);
    }
    h.flushDeltaLog();
    setPreviewBust((b) => b + 1);
  };

  const runPm = async (solutionIdx) => {
    const idx =
      solutionIdx != null
        ? Math.max(0, Math.min(2, solutionIdx))
        : pmSolutionIdxRef.current;
    setPmSolutionIdx(idx);
    if (!pmSpecMd.trim()) {
      return alert("请先点击「总结需求」生成标准需求文档，再生成原型");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey)
        return alert("请填写 Cursor API Key（cursor.com 控制台的 Integrations / Cloud Agents）");
      if (!config.cursorRepoUrl)
        return alert(
          "Cursor Cloud 需要已连接 GitHub 的仓库：请填写 HTTPS 地址，例如 https://github.com/org/repo"
        );
    } else {
      if (!config.apiKey) return alert("请填写 OpenAI 兼容 API Key");
    }
    setPipeActive(true);
    setPhase("pm");
    setVariantBusy({ role: "pm", idx });
    setLiveThought("");
    setOutputDir("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel(`产品经理 · 方案${idx + 1}`);
    const sol = pmSolutions[idx];
    try {
      await consumeSse(
        apiUrl("/api/pipeline/pm"),
        {
          requirement,
          config,
          sessionId: sessionId || undefined,
          solutionIndex: idx,
          solutionTitle: sol?.title,
          solutionSummary: sol?.summary,
          images: reqImagesPayload(reqImageItems),
          requirementSpec: pmSpecMd,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "产品经理阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "产品经理阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setVariantBusy(null);
    }
    h.flushDeltaLog();
    setPmVariantReady((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setPreviewBust((b) => b + 1);
    setPhase("pm_review");
  };

  const runUi = async (solutionIdx) => {
    const idx =
      solutionIdx != null
        ? Math.max(0, Math.min(2, solutionIdx))
        : uiSolutionIdxRef.current;
    setUiSolutionIdx(idx);
    if (!sessionId) return;
    if (pmFinalizedIdx === null) {
      return alert("请先在产品经理页对某一方案点击「定稿」，再生成 UI。");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else {
      if (!config.apiKey) return alert("请填写 API Key");
    }
    setPipeActive(true);
    setPhase("ui");
    setVariantBusy({ role: "ui", idx });
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel(`UI 设计 · 方案${idx + 1}`);
    const pmIdx = pmFinalizedIdx;
    const protoCandidates = [
      pmVariantFile(pmIdx),
      pmIdx === 0 ? "prototype.html" : null,
    ].filter(Boolean);
    let prototypeHtml = "";
    for (const rel of protoCandidates) {
      try {
        const r = await fetch(
          apiUrl(
            `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${previewBust}`
          )
        );
        if (r.ok) {
          prototypeHtml = await r.text();
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!prototypeHtml.trim()) {
      pushLog("读取定稿原型失败", false);
      setVariantBusy(null);
      setPipeActive(false);
      setBusyLabel("");
      return alert("未读到定稿原型文件，请确认产品经理已定稿且文件存在。");
    }
    const uiSol = uiSolutions[idx];
    try {
      await consumeSse(
        apiUrl("/api/pipeline/ui"),
        {
          requirement,
          prototypeHtml,
          sessionId,
          config,
          solutionIndex: idx,
          solutionTitle: uiSol?.title,
          solutionPhilosophy: uiSol?.philosophy,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "UI 设计阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "UI 设计阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setVariantBusy(null);
    }
    h.flushDeltaLog();
    setUiVariantReady((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setPreviewBust((b) => b + 1);
    setPhase("ui_review");
  };

  const runFs = async () => {
    if (!sessionId) return;
    if (uiFinalizedIdx === null) {
      return alert("请先在 UI 设计页对某一方案点击「定稿」，再执行全栈落地。");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else {
      if (!config.apiKey) return alert("请填写 API Key");
    }
    setPipeActive(true);
    setPhase("fs");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("全栈开发 · 准备中");
    const uiIdx = uiFinalizedIdx;
    const uiCandidates = [uiVariantFile(uiIdx), uiIdx === 0 ? "ui.html" : null].filter(
      Boolean
    );
    let uiHtml = "";
    for (const rel of uiCandidates) {
      try {
        const r = await fetch(
          apiUrl(
            `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${previewBust}`
          )
        );
        if (r.ok) {
          uiHtml = await r.text();
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!uiHtml.trim()) {
      pushLog("读取定稿 UI 失败", false);
      return alert("未读到定稿 UI 文件，请确认 UI 已定稿。");
    }
    try {
      await consumeSse(
        apiUrl("/api/pipeline/fullstack"),
        { requirement, uiHtml, sessionId, config },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "全栈落地阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "全栈落地阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
    }
    h.flushDeltaLog();
    setPhase("done");
  };

  const runQa = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请填写需求或「测试岗 · 原型/说明」，或上传参考图");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      if (!sessionId)
        return alert("使用 Cursor Cloud 时请先完成「产品经理生成原型」，以便绑定远端 Agent");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("测试 · 生成测试点");
    sessionFromStreamRef.current = sessionId;
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement,
          material: qaMaterial,
          styleHint: qaStyleHint,
          images: imagesPayload,
          sessionId: sessionId || undefined,
          config,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试岗 · 生成测试点",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试岗 · 生成测试点",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
    }
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current || sessionId;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) setQaMdPreview(await r.text());
      } catch {
        pushLog("读取 测试点.md 失败（可稍后手动打开生成目录查看）", true);
      }
      await loadPipelineTestPoints(sidNow);
      setPipelineActiveIdx(0);
    }
    setPhase("qa_review");
  };

  const runOps = async () => {
    const opsInputsReady =
      requirement.trim() || opsMaterial.trim() || opsImageItems.length > 0;
    if (!opsInputsReady) return alert("请填写需求或「运维岗 · 说明」，或上传部署/架构参考图");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      if (!sessionId)
        return alert("使用 Cursor Cloud 时请先完成「产品经理生成原型」，以便绑定远端 Agent");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("ops");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("运维 · 生成交接文档");
    sessionFromStreamRef.current = sessionId;
    const imagesPayload = opsImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/ops"),
        {
          requirement,
          material: opsMaterial,
          styleHint: opsStyleHint,
          images: imagesPayload,
          sessionId: sessionId || undefined,
          config,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "运维岗 · 生成交接文档",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "运维岗 · 生成交接文档",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
    }
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current || sessionId;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/运维手册.md`)}?bust=${Date.now()}`
        );
        if (r.ok) setOpsMdPreview(await r.text());
      } catch {
        pushLog("读取 运维手册.md 失败（可稍后手动打开生成目录查看）", true);
      }
    }
    setPhase("ops_review");
  };

  /** 切到含会话的角色 Tab 时拉取历史；同一 (sessionId, roleTab) 只拉一次 */
  const chatHistoryFetchedRef = useRef({});
  useEffect(() => {
    if (!sessionId) return;
    const r = roleTab;
    const key = `${sessionId}::${r}`;
    if (chatHistoryFetchedRef.current[key]) return;
    chatHistoryFetchedRef.current[key] = true;
    fetch(
      apiUrl(
        `/api/role/chat/history?role=${encodeURIComponent(r)}&sessionId=${encodeURIComponent(sessionId)}`
      )
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (!j || !j.ok) return;
        setChatHistory((prev) => ({ ...prev, [r]: Array.isArray(j.history) ? j.history : [] }));
      })
      .catch(() => {});
  }, [sessionId, roleTab]);

  const onPasteChatImages = (roleKey, e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const r = roleKey || roleTab;
    let added = false;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!dataUrl) return;
        setChatImageItems((prev) => ({
          ...prev,
          [r]: [...(prev[r] || []), { name: file.name || "粘贴图", dataUrl }].slice(0, 4),
        }));
      };
      reader.readAsDataURL(file);
      added = true;
    }
    if (added) e.preventDefault();
  };

  const loadPipelineTestPoints = useCallback(async (sid) => {
    const id = sid || sessionId;
    if (!id) return;
    try {
      const r = await fetch(
        apiUrl(`/api/qa/pipeline/points?sessionId=${encodeURIComponent(id)}`)
      );
      const j = await r.json();
      if (j?.ok && Array.isArray(j.points)) {
        setPipelineTestPoints(j.points);
        if (j.md) setQaMdPreview(j.md);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    if (roleTab === "qa" && qaSubTab === "pipeline" && sessionId) {
      loadPipelineTestPoints(sessionId);
    }
  }, [roleTab, qaSubTab, sessionId, loadPipelineTestPoints]);

  const generatePipelineTestPoints = async () => {
    if (!sessionId) return alert("请先完成全栈落地，生成 app 目录");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) {
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      }
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    try {
      const hr = await fetch(apiUrl("/api/health"));
      if (!hr.ok) throw new Error("本机 API 未就绪，请确认 start.bat / npm run dev 已启动");
    } catch (e) {
      window.alert(
        `无法连接 ${apiUrl("/api/health")}。\n请先运行 start.bat（或 npm run dev），再重试。\n\n${String(e.message || e)}`
      );
      return;
    }

    setPipelineGenerating(true);
    pushLog("测试岗 · 流水线生成测试点（SSE，支持 Cursor / OpenAI）…", true);
    let sseErr = "";
    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement,
          material:
            qaMaterial.trim() ||
            "（敏捷流水线）请结合本会话 prototype / ui / app 源码生成测试点：先业务、后功能。",
          styleHint:
            qaStyleHint.trim() ||
            [
              "【敏捷流水线 · 测试点 · 固定顺序】",
              "1) ## 冒烟自动化（Playwright）：3～5 条 ### 标题 + ```json steps（可替代人工冒烟）",
              "2) ## 业务测试点：- 一句话场景",
              "3) ## 功能测试点：- 一句话场景",
              "steps 的 selector 用真实 id：#projName #taskName #addProjBtn #addTaskBtn #demoBtn",
              "禁止编号（M01-001）、模块号、表格。",
            ].join("\n"),
          sessionId,
          config,
          images: [],
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "thought" && evt.text) pushLog(evt.text, false);
          if (evt.type === "step" && evt.label) pushLog(`▸ ${evt.label}`, true);
          if (evt.type === "exec" && evt.label) pushLog(`执行：${evt.label}`, true);
          if (evt.type === "qa_points" && Array.isArray(evt.points)) {
            setPipelineTestPoints(evt.points);
            setPipelineActiveIdx(0);
          }
        }
      );
      if (sseErr) throw new Error(sseErr);

      const sidNow = sessionFromStreamRef.current || sessionId;
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) setQaMdPreview(await r.text());
      } catch {
        /* ignore */
      }
      await loadPipelineTestPoints(sidNow);
      setPipelineActiveIdx(0);
      setPhase("qa_review");
      pushLog("测试岗 · 测试点已写入会话目录并刷新列表", true);
    } catch (e) {
      const msg = String(e.message || e);
      const isNet = /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
        msg
      );
      window.alert(
        isNet
          ? `网络请求失败。请确认：\n1) 终端里 API 已监听 http://127.0.0.1:5180\n2) 勿关闭运行 start.bat 的窗口\n3) F12 → Network 查看 /api/pipeline/qa 是否红色失败\n\n${msg}`
          : msg
      );
    } finally {
      setPipelineGenerating(false);
    }
  };

  const runPipelineSmokeTest = async () => {
    const smokePoints = pipelineTestPoints.filter(
      (p) => p.kind === "smoke" && p.steps?.length
    );
    if (!smokePoints.length) {
      return window.alert(
        "当前没有可执行的冒烟自动化用例。\n\n请重新「生成测试点」，并确保 AI 输出 ## 冒烟自动化（Playwright）段及 ```json 步骤。\n\n也可手工放置：generated/<会话>/qa/playwright-smoke.json"
      );
    }
    if (!sessionId) return alert("缺少会话");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    setPipelineTesting(true);
    setPipelineTestIssues([]);
    setPipelineTestProgress({ current: 0, total: smokePoints.length, title: "" });

    const allIssues = [];
    let sseErr = "";
    try {
      await consumeSse(
        apiUrl("/api/qa/pipeline/run-batch"),
        {
          sessionId,
          points: smokePoints,
          requirement,
          config,
          usePlaywright: true,
          smokeOnly: true,
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "progress") {
            const idx = Number(evt.index) || 0;
            setPipelineActiveIdx(
              pipelineTestPoints.findIndex((p) => p.title === evt.title)
            );
            setPipelineTestingIdx(idx);
            setPipelineTestProgress({
              current: idx + 1,
              total: Number(evt.total) || smokePoints.length,
              title: String(evt.title || ""),
            });
          }
          if (evt.type === "point_done" && Array.isArray(evt.issues)) {
            for (const it of evt.issues) allIssues.push(it);
            setPipelineTestIssues([...allIssues]);
          }
          if (evt.type === "done") {
            for (const w of evt.warnings || []) pushLog(w, true);
            setPipelineTestIssues(evt.issues || allIssues);
            pushLog(
              evt.passed
                ? `冒烟自动化全部通过（${evt.total} 条）`
                : `冒烟完成，${evt.failCount ?? allIssues.length} 项问题`,
              !!evt.passed
            );
          }
        }
      );
      if (sseErr) throw new Error(sseErr);
    } catch (e) {
      window.alert(String(e.message || e));
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  const runPipelineTest = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestPoints.length) return alert("请先生成测试点");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    setPipelineTesting(true);
    setPipelineTestingIdx(-1);
    setPipelineTestIssues([]);
    setPipelineTestProgress({
      current: 0,
      total: pipelineTestPoints.length,
      title: "",
    });

    const allIssues = [];
    let sseErr = "";

    try {
      await consumeSse(
        apiUrl("/api/qa/pipeline/run-batch"),
        {
          sessionId,
          points: pipelineTestPoints,
          requirement,
          config,
          usePlaywright: true,
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "progress") {
            const idx = Number(evt.index) || 0;
            setPipelineActiveIdx(idx);
            setPipelineTestingIdx(idx);
            setPipelineTestProgress({
              current: idx + 1,
              total: Number(evt.total) || pipelineTestPoints.length,
              title: String(evt.title || ""),
            });
          }
          if (evt.type === "point_done" && Array.isArray(evt.issues)) {
            for (const it of evt.issues) allIssues.push(it);
            setPipelineTestIssues([...allIssues]);
            const passed = evt.passed !== false;
            pushLog(
              `${passed ? "✓" : "✗"} ${Number(evt.index) + 1}/${pipelineTestPoints.length} ${String(evt.title || pipelineTestPoints[evt.index]?.title || "")}`,
              passed
            );
          }
          if (evt.type === "done") {
            for (const w of evt.warnings || []) pushLog(w, true);
            const issues = evt.issues || allIssues;
            setPipelineTestIssues(issues);
            if (evt.passed) {
              pushLog(`全部 ${evt.total || pipelineTestPoints.length} 条测试点通过`, true);
            } else {
              pushLog(
                `完成：${evt.total || pipelineTestPoints.length} 条，发现 ${evt.failCount ?? issues.length} 个问题`,
                false
              );
            }
          }
        }
      );
      if (sseErr) throw new Error(sseErr);
    } catch (e) {
      const msg = String(e.message || e);
      if (/Executable doesn't exist|playwright install/i.test(msg)) {
        window.alert(
          `Playwright 浏览器未安装。\n\n请在项目目录执行：\n\nnpm run setup:playwright\n\n完成后重启 start.bat，再点「进行测试」。`
        );
      } else {
        window.alert(msg);
      }
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  const runPipelineTestOne = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestPoints.length) return alert("请先生成测试点");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    const idx = Math.max(
      0,
      Math.min(pipelineActiveIdx, pipelineTestPoints.length - 1)
    );
    const point = pipelineTestPoints[idx];

    setPipelineTesting(true);
    setPipelineTestingIdx(idx);
    setPipelineTestIssues([]);
    setPipelineTestProgress({
      current: 1,
      total: 1,
      title: point?.title || "",
    });

    try {
      const r = await fetch(apiUrl("/api/qa/pipeline/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          points: pipelineTestPoints,
          activeIndex: idx,
          requirement,
          config,
          usePlaywright: true,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

      setPipelineTestIssues(j.issues || []);
      for (const w of j.warnings || []) pushLog(w, true);

      if (j.passed) {
        pushLog(`✓ 单条测试通过：${j.pointTitle || point?.title || ""}`, true);
      } else {
        pushLog(
          `✗ 单条测试未通过：${j.pointTitle || point?.title || ""}（${(j.issues || []).length} 项问题）`,
          false
        );
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/Executable doesn't exist|playwright install/i.test(msg)) {
        window.alert(
          `Playwright 浏览器未安装。\n\n请在项目目录执行：\n\nnpm run setup:playwright\n\n完成后重启 start.bat。`
        );
      } else {
        window.alert(msg);
      }
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  /** 将「已完成项目」历史会话恢复进当前流水线，便于关服后继续全栈/测试/追问 */
  const embedHistoryIntoPipeline = useCallback(
    async (rec) => {
      const sid = String(rec?.sessionId || "").trim();
      if (!sid) return alert("无效的历史记录");

      const req = String(rec?.requirement || "").trim();
      let outDir = String(rec?.outputDir || "").replace(/\\/g, "/").trim();
      if (!outDir.startsWith("generated/")) {
        outDir = `generated/${sid}/app`;
      }
      if (!/\/app\/?$/i.test(outDir)) {
        outDir = `${outDir.replace(/\/$/, "")}/app`;
      }

      const bust = Date.now();
      const fileOk = async (relPath) => {
        try {
          const r = await fetch(
            apiUrl(`/generated/${encodeURIComponent(sid)}/${relPath}?bust=${bust}`)
          );
          return r.ok;
        } catch {
          return false;
        }
      };

      let phase = "idle";
      if (await fileOk("app/index.html")) {
        if (await fileOk("运维手册.md")) phase = "ops_review";
        else if (await fileOk("测试点.md")) phase = "qa_review";
        else phase = "done";
      } else if (await fileOk("ui.html")) phase = "ui_review";
      else if (await fileOk("prototype.html")) phase = "pm_review";
      else {
        return alert(
          `未在 generated/${sid}/ 下找到可恢复的产物（prototype / ui / app）。请确认服务已启动且目录仍在。`
        );
      }

      if (req) setRequirement(req);
      setSessionId(sid);
      sessionFromStreamRef.current = sid;
      setOutputDir(outDir);
      setPhase(phase);
      setPipelineError(null);
      setPipeActive(false);
      setBusyLabel("");
      setLiveThought("");
      setFsAppliedSnapshot(
        JSON.stringify({
          requirement: req || requirement,
          pm: pmSolutionIdx,
          ui: uiSolutionIdx,
        })
      );
      setPreviewBust((b) => b + 1);
      await refreshSessionArtifacts(sid);

      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/测试点.md?bust=${bust}`)
        );
        if (r.ok) setQaMdPreview(await r.text());
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/运维手册.md?bust=${bust}`)
        );
        if (r.ok) setOpsMdPreview(await r.text());
      } catch {
        /* ignore */
      }

      const roles = ["pm", "ui", "fs", "qa", "ops"];
      const histMap = { pm: [], ui: [], fs: [], qa: [], ops: [] };
      for (const role of roles) {
        delete chatHistoryFetchedRef.current[`${sid}::${role}`];
        try {
          const res = await fetch(
            apiUrl(
              `/api/role/chat/history?role=${encodeURIComponent(role)}&sessionId=${encodeURIComponent(sid)}`
            )
          );
          if (res.ok) {
            const j = await res.json();
            if (j?.ok && Array.isArray(j.history)) histMap[role] = j.history;
          }
          chatHistoryFetchedRef.current[`${sid}::${role}`] = true;
        } catch {
          /* ignore */
        }
      }
      setChatHistory(histMap);
      setChatInput({ pm: "", ui: "", fs: "", qa: "", ops: "" });
      setChatImageItems({ pm: [], ui: [], fs: [], qa: [], ops: [] });

      if (phase === "done" || phase === "qa_review" || phase === "ops_review") {
        await loadPipelineTestPoints(sid);
        setQaSubTab("pipeline");
      }

      const roleByPhase = {
        pm_review: "pm",
        ui_review: "ui",
        done: "fs",
        qa_review: "qa",
        ops_review: "ops",
      };
      setRoleTab(roleByPhase[phase] || "fs");

      try {
        localStorage.setItem(
          "agile_sim_active_session",
          JSON.stringify({ sessionId: sid, outputDir: outDir, requirement: req, phase })
        );
      } catch {
        /* ignore */
      }

      setHistoryDetail(null);
      setHistoryModalOpen(false);
      const phaseHint = {
        pm_review: "产品经理阶段（有原型）",
        ui_review: "UI 阶段（有 ui.html）",
        done: "全栈已完成，可继续全栈追问 / 测试 / 运维",
        qa_review: "已有测试点，可测试岗或全栈继续优化",
        ops_review: "已有运维手册，可运维或全栈继续优化",
      }[phase];
      pushLog(`嵌入流水线：${sid} · ${phaseHint}`, true);
      window.alert(
        `已嵌入流水线，可继续开发。\n\n会话：${sid}\n状态：${phaseHint}\n\n` +
          `已恢复：需求文案、预览、各角色追问历史（若有）。\n` +
          `Cursor Cloud 下将沿用该会话已绑定的远端 Agent（若曾跑过产品经理阶段）。`
      );
    },
    [requirement, pmSolutionIdx, uiSolutionIdx, loadPipelineTestPoints, pushLog]
  );

  const notifyFullStackFromQa = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestIssues.length) return alert("当前没有可通知的问题");
    try {
      const r = await fetch(apiUrl("/api/qa/pipeline/notify-fs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          issues: pipelineTestIssues,
          requirement,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRoleTab("fs");
      setChatInput((prev) => ({ ...prev, fs: j.message }));
      pushLog("已将测试问题填入「全栈落地」追问框，请点击发送", true);
    } catch (e) {
      window.alert(String(e.message || e));
    }
  };

  const refreshFsPreview = useCallback(async () => {
    if (!sessionId) return window.alert("请先完成全栈落地");
    setPreviewBust((b) => b + 1);
    setTimeout(() => setPreviewBust((b) => b + 1), 350);
    let syncMsg = "预览已刷新（读取 app/ 下最新文件）";
    try {
      const r = await fetch(apiUrl("/api/fs/sync-app-preview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const parts = [];
        if (j.synced?.length) parts.push(`根目录→app：${j.synced.join("、")}`);
        if (j.promoted?.promoted?.length) {
          parts.push(`子目录 app/${j.promoted.from}/→app/：${j.promoted.promoted.join("、")}`);
        }
        if (parts.length) syncMsg = `预览已刷新；${parts.join("；")}`;
      } else if (r.status === 404) {
        syncMsg +=
          "。根目录→app 同步需重启 start.bat（当前 API 未加载新接口，不影响你手动改好的 app/ 文件）";
      } else if (j.error) {
        syncMsg += `。同步跳过：${j.error}`;
      }
    } catch (e) {
      syncMsg += `。同步请求未达：${String(e?.message || e)}`;
    }
    pushLog(syncMsg, true);
  }, [sessionId, pushLog]);

  const sendRoleChat = async (roleKey) => {
    const r = roleKey || roleTab;
    const text = (chatInput[r] || "").trim();
    const imgs = (chatImageItems[r] || []).slice(0, 4);
    if (!text && imgs.length === 0) return;
    if (!sessionId) {
      window.alert("请先完成本角色的主输出（产品经理 / UI / 全栈 / 测试 / 运维），追问对话需要会话目录。");
      return;
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return window.alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) return window.alert("Cursor Cloud 需要已授权仓库 URL");
    } else if (!config.apiKey) {
      return window.alert("请填写 API Key");
    }

    const userDisplay =
      text || (imgs.length ? `[附图 ${imgs.length} 张]` : "");
    setChatBusyRole(r);
    setChatHistory((prev) => ({
      ...prev,
      [r]: [...(prev[r] || []), { role: "user", content: userDisplay }],
    }));
    setChatInput((prev) => ({ ...prev, [r]: "" }));
    const imagesPayload = imgs
      .map((it) => dataUrlToImagePayload(it.dataUrl))
      .filter(Boolean);
    setChatImageItems((prev) => ({ ...prev, [r]: [] }));

    let assistantBuf = "";
    setChatHistory((prev) => ({
      ...prev,
      [r]: [...(prev[r] || []), { role: "assistant", content: "" }],
    }));
    const updateAssistant = (delta) => {
      assistantBuf += delta;
      setChatHistory((prev) => {
        const arr = [...(prev[r] || [])];
        if (arr.length === 0) return prev;
        const last = arr[arr.length - 1];
        if (last?.role === "assistant") {
          arr[arr.length - 1] = { role: "assistant", content: assistantBuf };
        }
        return { ...prev, [r]: arr };
      });
    };

    let didWriteFile = false;
    try {
      await consumeSse(
        apiUrl("/api/role/chat"),
        {
          role: r,
          sessionId,
          message: text || "（见附图）",
          requirement,
          config,
          images: imagesPayload,
        },
        (evt) => {
          if (evt.type === "delta" && evt.text) updateAssistant(evt.text);
          if (evt.type === "thought" && evt.text && (r === "fs" || r === "fullstack")) {
            const t = String(evt.text).trim();
            if (t.includes("跳过")) pushLog(t.replace(/\n/g, " "), false);
          }
          if (evt.type === "exec") {
            didWriteFile = true;
            pushLog(`执行：${evt.label}`, true);
          }
          if (evt.type === "artifact") {
            pushLog(`产出：${evt.name}`, true);
            if (r === "fs" && evt.name?.startsWith("app/")) didWriteFile = true;
          }
          if (evt.type === "error") {
            updateAssistant(`\n\n[错误] ${evt.message}`);
          }
        }
      );
    } catch (e) {
      updateAssistant(`\n\n[请求失败] ${String(e?.message || e)}`);
    } finally {
      setChatBusyRole("");
    }
    if (didWriteFile) {
      setPreviewBust((b) => b + 1);
      if (r === "fs") {
        pushLog(
          "已写入 app/ 下文件；上方预览与平台 iframe 一致。本地请打开 generated/…/app/，勿单独 serve prototype.html 或 clone 子目录。",
          true
        );
        setTimeout(() => setPreviewBust((b) => b + 1), 400);
        fetch(apiUrl("/api/fs/smoke-check"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
          .then((res) => res.json())
          .then((j) => {
            if (!j?.ok) return;
            if (j.ok && !j.issues?.length) {
              pushLog("[全栈自检] app 静态检查通过", true);
            } else if (j.issues?.length) {
              pushLog(`[全栈自检] ${j.issues.join("；")}`, false);
            }
          })
          .catch(() => {});
      }
    }
  };

  const pmPreviewRel =
    pmSolutionIdx === 0 && pmFile0IsLegacy
      ? "prototype.html"
      : pmVariantFile(pmSolutionIdx);
  const uiPreviewRel =
    uiSolutionIdx === 0 && uiFile0IsLegacy ? "ui.html" : uiVariantFile(uiSolutionIdx);

  const prototypeFrame =
    sessionId && pmVariantReady[pmSolutionIdx]
      ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/${pmPreviewRel}`)}?bust=${previewBust}`
      : "";
  const uiFrame =
    sessionId && uiVariantReady[uiSolutionIdx]
      ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/${uiPreviewRel}`)}?bust=${previewBust}`
      : "";

  const pmPreviewGenerating =
    variantBusy?.role === "pm" && variantBusy.idx === pmSolutionIdx && phase === "pm";
  const uiPreviewGenerating =
    variantBusy?.role === "ui" && variantBusy.idx === uiSolutionIdx && phase === "ui";

  const showPmPrototypeIframe =
    !!prototypeFrame && !!sessionId && !pmPreviewGenerating;
  const showUiStageIframe = !!uiFrame && !!sessionId && !uiPreviewGenerating;

  const busy = pipeActive || !!busyLabel;

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setSseUiTick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, [busy]);

  const canRunUi =
    !!sessionId &&
    !busy &&
    pmFinalizedIdx !== null &&
    pmVariantReady[pmFinalizedIdx] &&
    phase !== "idle" &&
    phase !== "pm";
  const canRunFs =
    !!sessionId &&
    !busy &&
    uiFinalizedIdx !== null &&
    uiVariantReady[uiFinalizedIdx] &&
    (phase === "ui_review" ||
      phase === "fs" ||
      phase === "done" ||
      phase === "qa" ||
      phase === "qa_review" ||
      phase === "ops" ||
      phase === "ops_review");
  const qaInputsReady =
    !!requirement.trim() ||
    !!qaMaterial.trim() ||
    qaImageItems.length > 0;
  const canRunQa =
    qaSubTab === "standalone" &&
    !busy &&
    qaInputsReady &&
    (config.provider !== "cursor" || !!sessionId) &&
    (config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey);

  const canRunQaPipeline =
    qaSubTab === "pipeline" &&
    !!sessionId &&
    !busy &&
    !pipelineGenerating &&
    (phase === "done" ||
      phase === "qa" ||
      phase === "qa_review" ||
      phase === "ops" ||
      phase === "ops_review") &&
    (config.provider === "cursor"
      ? !!config.cursorApiKey
      : !!config.apiKey);

  const opsInputsReady =
    !!requirement.trim() ||
    !!opsMaterial.trim() ||
    opsImageItems.length > 0;
  const canRunOps =
    !busy &&
    opsInputsReady &&
    (config.provider !== "cursor" || !!sessionId) &&
    (config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey);

  const reqInputsReady = !!requirement.trim() || reqImageItems.length > 0;
  const pmConfigReady =
    config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey;

  const canSummarizeReq =
    reqInputsReady && !busy && !pmSpecGenerating && pmConfigReady;

  const canRunPmAction =
    !!pmSpecMd.trim() &&
    !busy &&
    !pmSpecGenerating &&
    pmConfigReady;

  const runPmForSolution = (solutionIdx) => runPm(solutionIdx);
  const runUiForSolution = (solutionIdx) => runUi(solutionIdx);

  const finalizePm = async (solutionIdx) => {
    const idx = Math.max(0, Math.min(2, solutionIdx));
    const sid = sessionId || sessionFromStreamRef.current;
    if (!sid) return alert("请先生成任一方案的原型");
    if (!pmVariantReady[idx]) return alert("请先生成该方案的原型预览");
    try {
      const r = await fetch(apiUrl("/api/session/finalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, role: "pm", solutionIndex: idx }),
      });
      const j = await r.json();
      if (!j.ok) return alert(j.error || "定稿失败");
      setPmFinalizedIdx(idx);
      setPmSolutionIdx(idx);
      setPreviewBust((b) => b + 1);
      pushLog(`产品经理已定稿：${pmSolutions[idx].title}`, true);
      if (phase === "idle" || phase === "pm") setPhase("pm_review");
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const finalizeUi = async (solutionIdx) => {
    const idx = Math.max(0, Math.min(2, solutionIdx));
    const sid = sessionId || sessionFromStreamRef.current;
    if (!sid) return alert("请先生成 UI");
    if (!uiVariantReady[idx]) return alert("请先生成该方案的 UI 预览");
    try {
      const r = await fetch(apiUrl("/api/session/finalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, role: "ui", solutionIndex: idx }),
      });
      const j = await r.json();
      if (!j.ok) return alert(j.error || "定稿失败");
      setUiFinalizedIdx(idx);
      setUiSolutionIdx(idx);
      setPreviewBust((b) => b + 1);
      pushLog(`UI 已定稿：${uiSolutions[idx].title}`, true);
      if (phase === "ui" || phase === "pm_review") setPhase("ui_review");
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const downloadMarkdown = (filename, text) => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPickQaImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - qaImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl)
          setQaImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onPasteReqImages = (e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    let added = false;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl) {
          setReqImageItems((prev) =>
            [...prev, { name: file.name || "粘贴图", dataUrl }].slice(0, 12)
          );
        }
      };
      reader.readAsDataURL(file);
      added = true;
    }
    if (added) e.preventDefault();
  };

  const onPickReqImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - reqImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl) setReqImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onPickOpsImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - opsImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl)
          setOpsImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const appFrame = sessionId
    ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/app/index.html`)}?bust=${previewBust}`
    : "";

  const fsPlanDirty =
    !!outputDir &&
    !!fsAppliedSnapshot &&
    buildPlanSnapshot() !== fsAppliedSnapshot;

  const pipelinePointsGrouped = useMemo(() => {
    const rows = [];
    let lastKind = null;
    pipelineTestPoints.forEach((pt, idx) => {
      const kind = pt.kind || "functional";
      if (kind !== lastKind) {
        rows.push({ type: "header", kind });
        lastKind = kind;
      }
      rows.push({ type: "item", pt, idx });
    });
    return rows;
  }, [pipelineTestPoints]);

  useEffect(() => {
    if (!logOpen || !logScrollRef.current) return;
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [logLines, logOpen, pipelineTesting, liveThought]);

  useEffect(() => {
    if (!busy) setOverlayCompact(false);
  }, [busy]);

  const copyText = useCallback(
    async (text, okMsg) => {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        pushLog(okMsg || "已复制", true);
      } catch {
        window.alert("复制失败");
      }
    },
    [pushLog]
  );

  const copyTestIssuesMd = useCallback(() => {
    if (!pipelineTestIssues.length) return;
    const body = pipelineTestIssues
      .map((it, i) => `${i + 1}. ${it.title || "项"}\n   ${it.reason || ""}`)
      .join("\n\n");
    copyText(body, "已复制测试问题列表");
  }, [pipelineTestIssues, copyText]);

  const reqBullets = useMemo(() => {
    const t = requirement.trim();
    if (!t) return ["（请填写上方用户需求）"];
    const parts = t
      .split(/[\n。;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [t];
  }, [requirement]);

  const previewRailTitle =
    roleTab === "pm"
      ? "原型预览"
      : roleTab === "ui"
        ? "UI 预览"
        : roleTab === "fs"
          ? "全栈 app 预览"
          : roleTab === "qa"
            ? qaSubTab === "pipeline"
              ? "被测 app 预览"
              : "测试点文档预览"
            : "运维手册预览";

  return (
    <div className="shell">
      {busy ? (
        <div
          className={"overlay" + (overlayCompact ? " overlay-compact" : "")}
          aria-busy="true"
        >
          <div
            className="overlay-inner overlay-progress-panel"
            data-metrics-tick={sseUiTick}
          >
            <div className="overlay-top-row">
              <div className="spinner" />
              <div className="overlay-title">
                {busyLabel || "处理中…"}
              </div>
              <button
                type="button"
                className="btn btn-small overlay-min-btn"
                onClick={() => setOverlayCompact((c) => !c)}
              >
                {overlayCompact ? "展开" : "收起"}
              </button>
            </div>

            {(() => {
              const m = streamMetricsRef.current;
              const elapsedSec = m.startedAt
                ? (Date.now() - m.startedAt) / 1000
                : 0;
              const activityPct = streamActivityPercent(m.deltaChars);
              return overlayCompact ? null : (
                <>
                  <div className="overlay-metrics">
                    <div className="overlay-metric">
                      <span className="overlay-metric-label">已耗时</span>
                      <strong>{formatStreamElapsed(elapsedSec)}</strong>
                    </div>
                    <div className="overlay-metric">
                      <span className="overlay-metric-label">流式字数</span>
                      <strong>
                        {m.deltaChars > 0
                          ? `≈ ${m.deltaChars.toLocaleString("zh-CN")} 字`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  <div
                    className="overlay-activity-wrap"
                    title="按流式输出量估算的活动度，不是准确剩余进度；数字在涨通常表示未卡死"
                  >
                    <div className="overlay-activity-bar">
                      <div
                        className="overlay-activity-fill"
                        style={{ width: `${activityPct}%` }}
                      />
                    </div>
                    <div className="overlay-activity-caption">
                      活动度约 {activityPct}%（仅表示有输出，非完成百分比）
                    </div>
                  </div>

                  {m.lastLines.length > 0 ? (
                    <div className="overlay-recent" aria-live="polite">
                      <div className="overlay-recent-title">最近动态</div>
                      <ul className="overlay-recent-list">
                        {m.lastLines.map((line, i) => (
                          <li key={`${sseUiTick}-${i}-${line.slice(0, 16)}`}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="hint overlay-hint-main">
                    Cursor Cloud 首轮常需数分钟。请保持本页打开；开发模式请求直连本机{" "}
                    <code>5180</code>。若<strong>耗时与流式字数长期不变</strong>
                    ，再按下方清单排查。
                  </p>

                  <details className="overlay-triage">
                    <summary>变慢 / 疑似卡住时怎么查</summary>
                    <ol className="overlay-triage-list">
                      <li>
                        <strong>F12 → Network</strong>，找到{" "}
                        <code>pipeline/pm</code>（或 ui/fullstack）：状态应长时间为
                        <strong> Pending</strong>；若为 <strong>(canceled)</strong>{" "}
                        表示连接被断开（勿刷新页面重试）。
                      </li>
                      <li>
                        终端运行目录下设置环境变量{" "}
                        <code>AGILE_SIM_DEBUG=1</code>（PowerShell：{" "}
                        <code>$env:AGILE_SIM_DEBUG=&quot;1&quot;</code>）后重启{" "}
                        <code>npm run dev</code>，看以{" "}
                        <code>[agile-sim]</code> 开头的日志。
                      </li>
                      <li>
                        打开浏览器{" "}
                        <a
                          href="https://cursor.com"
                          target="_blank"
                          rel="noreferrer"
                        >
                          cursor.com
                        </a>
                        ，确认 Cloud Agent / Run 是否仍在执行或已报错。
                      </li>
                      <li>
                        可改用「其他配置」中的 <strong>OpenAI 兼容</strong>
                        接口试跑同一需求，排除 Cursor 侧排队或仓库授权问题。
                      </li>
                    </ol>
                  </details>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {configModalOpen ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => setConfigModalOpen(false)}
            >
              <div
                className="modal-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="config-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <h2 id="config-modal-title">模型配置</h2>
                  <button
                    type="button"
                    className="modal-close"
                    aria-label="关闭"
                    onClick={() => setConfigModalOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="field">
                  <label>推理后端</label>
                  <div className="modal-radio-row">
                    <label className="modal-radio-label">
                      <input
                        type="radio"
                        name="llm-modal"
                        checked={provider === "openai"}
                        onChange={() => setProvider("openai")}
                      />
                      OpenAI 兼容（HTTP）
                    </label>
                    <label className="modal-radio-label">
                      <input
                        type="radio"
                        name="llm-modal"
                        checked={provider === "cursor"}
                        onChange={() => {
                          setProvider("cursor");
                          setModel((m) =>
                            m === "gpt-4o-mini" || !m ? "composer-2.5" : m
                          );
                        }}
                      />
                      Cursor Cloud Agents（HTTP）
                    </label>
                  </div>
                </div>
                {provider === "openai" ? (
                  <>
                    <div className="field">
                      <label>API Base URL</label>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="field">
                      <label>API Key</label>
                      <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-…"
                        type="password"
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Cursor API Key</label>
                      <input
                        value={cursorApiKey}
                        onChange={(e) => setCursorApiKey(e.target.value)}
                        placeholder="cursor_…（见 cursor.com → Integrations → User API Keys / Cloud Agents）"
                        type="password"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label>GitHub 仓库 URL（HTTPS）</label>
                      <input
                        value={cursorRepoUrl}
                        onChange={(e) => setCursorRepoUrl(e.target.value)}
                        placeholder="https://github.com/you/your-repo"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label>分支 / ref</label>
                      <input
                        value={cursorRepoRef}
                        onChange={(e) => setCursorRepoRef(e.target.value)}
                        placeholder="留空=让 Cursor 使用仓库默认分支；或填 main、master"
                        autoComplete="off"
                      />
                      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        GitHub 上<strong>明明有该分支</strong>却仍报{' '}
                        <code>Failed to verify existence of branch</code>：多半是{' '}
                        <strong>Cursor 的 GitHub 集成未授权此仓库</strong>
                        （浏览器里能看到，不代表 Cursor Cloud 能访问）。请到{' '}
                        <strong>cursor.com → Integrations → GitHub</strong>{' '}
                        为该仓库或组织开启访问，并点下方<strong>「Cursor 可见仓库列表」</strong>确认是否包含您的 URL。
                      </p>
                    </div>
                    <p className="hint" style={{ marginTop: 8 }}>
                      Cloud Agent 必须在 Cursor Integrations
                      已授权的仓库上创建；本页仍会根据流式回复在本地 generated 目录写入 prototype / ui /
                      app，与远端 PR 变更可能不一致，以控制台流式文本为准。
                    </p>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>识图用 OpenAI 兼容（可选）</label>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                      <input
                        style={{ marginTop: 8 }}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-…（总结需求/生成原型前把参考图转成文字）"
                        type="password"
                        autoComplete="off"
                      />
                      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        顶部需求区的参考图 Cursor 本身无法读取；填写此项后会在写 PRD 前自动识图摘要。
                        模型 ID 建议填 <code>gpt-4o</code> / <code>gpt-4o-mini</code> 等视觉模型。
                      </p>
                    </div>
                  </>
                )}
                <div className="field">
                  <label>Model ID</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={
                      provider === "cursor"
                        ? "composer-2.5（或留空=默认）"
                        : "gpt-4o-mini"
                    }
                  />
                  {provider === "cursor" ? (
                    <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                      若报 <code>invalid_model</code>：旧版 <code>composer-2</code> 已不可用，请改为{" "}
                      <strong>composer-2.5</strong> 或留空；可点下方「Cursor 可用模型列表」核对。
                    </p>
                  ) : null}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    onClick={listCursorModels}
                    disabled={provider !== "cursor"}
                  >
                    Cursor 可用模型列表
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={listCursorVisibleRepos}
                    disabled={provider !== "cursor"}
                  >
                    Cursor 可见仓库列表
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={checkBackendHealth}
                  >
                    测试后端连接
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConfigModalOpen(false)}
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          ) : null}

      <header className="top">
        <div className="top-main">
          <span className="badge">Demo · 内网自建</span>
          <h1 className="top-title">敏捷多角色流水线</h1>
          <p className="top-tagline">{phaseStatusText(phase)}</p>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={() => setHelpOpen((o) => !o)}
            aria-expanded={helpOpen}
          >
            {helpOpen ? "收起说明" : "使用说明"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setHistoryModalOpen(true)}
          >
            已完成项目
            {historyRecords.length > 0 ? (
              <span className="top-action-badge">{historyRecords.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => setConfigModalOpen(true)}
          >
            模型配置
          </button>
        </div>
      </header>

      {helpOpen ? (
        <details className="help-panel card" open>
          <summary className="help-panel-summary">平台说明</summary>
          <div className="help-panel-body hint">
            流程：产品经理原型 → UI → 全栈 <code>app/</code> → 测试点 / 运维手册。角色画像在{" "}
            <code>skills/roles/&lt;role&gt;/SKILL.md</code>，可热改；各 Tab 底部可「追问」并落盘{" "}
            <code>### FILE:</code>。推理支持 OpenAI 兼容 HTTP 或 Cursor Cloud；密钥仅存本机
            localStorage。
          </div>
        </details>
      ) : null}

      {pipelineError ? (
        <div className="pipeline-error-banner" role="alert">
          <div className="pipeline-error-body">
            <strong className="pipeline-error-step">{pipelineError.step}</strong>
            <span className="pipeline-error-text">{pipelineError.detail}</span>
            {pipelineError.isNetwork && provider === "cursor" ? (
              <p className="hint pipeline-error-extra">
                日志中的 <code>fetch failed</code> 常见于本机访问{" "}
                <code>api.cursor.com</code> 失败（例如仅浏览器走了代理、而 Node
                未走；防火墙/网络策略；DNS）。可在项目目录终端执行{" "}
                <code>curl -I https://api.cursor.com</code> 测试；或临时改用「其他配置」里的{" "}
                <strong>OpenAI 兼容</strong> 后端验证流水线其余环节。
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-small pipeline-error-dismiss"
            onClick={() => setPipelineError(null)}
          >
            关闭
          </button>
        </div>
      ) : null}

      {sessionId ? (
        <div className="session-bar card">
          <div className="session-bar-main">
            <span className="session-bar-label">当前会话</span>
            <code className="session-bar-id">{sessionId}</code>
            <span className="session-bar-phase">{phaseStatusText(phase)}</span>
          </div>
          <div className="session-bar-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => copyText(sessionId, "已复制 sessionId")}
            >
              复制 ID
            </button>
            {outputDir ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => openFolderInExplorer(outputDir)}
              >
                打开目录
              </button>
            ) : null}
            {appFrame ? (
              <a
                className="btn btn-small"
                href={appFrame}
                target="_blank"
                rel="noreferrer"
              >
                预览新标签
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flow-rail card">
        <div className="flow-rail-head">
          <span className="flow-rail-title">流程</span>
          <span className="hint flow-rail-sub">上需求 · 左方案 · 右预览 · 定稿后下游沿用</span>
        </div>
        <div className="flow-rail-steps" aria-label="流水线步骤">
          {[
            "① 产品经理 · 原型",
            "② UI 设计",
            "③ 全栈落地",
            "④ 测试岗",
            "⑤ 运维岗",
          ].map((label, i) => {
            const hi = flowHighlightStep(phase);
            const done = hi > i;
            const on = hi === i;
            return (
              <div key={label} className="flow-step-group">
                {i > 0 ? <span className="flow-connector" aria-hidden /> : null}
                <span
                  className={
                    "flow-node" +
                    (on ? " on" : "") +
                    (done ? " done" : "") +
                    (hi < 0 ? " pending" : "")
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {provider === "cursor" ? (
          <details className="flow-rail-cursor-details">
            <summary className="hint">Cursor Cloud 会话说明</summary>
            <p className="hint flow-rail-cursor">
              首次「产品经理」会新建远端 Agent；同 <code>sessionId</code> 后续步骤复用该
              Agent。重置会话会换新 Agent。
            </p>
          </details>
        ) : null}
      </div>

      <div className="workspace workspace-v3">
        <div className="card workbench-req">
          <div className="workbench-req-head">
            <h2 className="sidebar-title">用户需求</h2>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={resetPipeline}
            >
              重置会话
            </button>
          </div>
          <textarea
            className="req-textarea req-textarea-workbench"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            onPaste={onPasteReqImages}
            placeholder="描述要做的产品或功能…可直接 Ctrl+V 粘贴截图"
          />
          <div className="image-pick-row workbench-req-images">
            <label className="btn btn-small">
              上传参考图
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickReqImages}
              />
            </label>
            <span className="hint">
              最多 12 张；总结/生成时取前 4 张发给模型。
              {provider === "cursor"
                ? " Cursor Cloud 本身不看图；若已在配置里填写 OpenAI 兼容 API Key，会先自动识图成文字再写 PRD。"
                : " 请选用支持视觉的模型（如 gpt-4o）。"}
            </span>
          </div>
          {reqImageItems.length > 0 ? (
            <ul className="thumb-strip workbench-req-thumbs">
              {reqImageItems.map((item, idx) => (
                <li key={item.name + idx} className="thumb-strip-item">
                  <img src={item.dataUrl} alt={item.name} />
                  <button
                    type="button"
                    className="thumb-remove"
                    aria-label={`移除 ${item.name}`}
                    onClick={() =>
                      setReqImageItems((prev) => prev.filter((_, j) => j !== idx))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {pmFinalizedIdx !== null || uiFinalizedIdx !== null ? (
            <p className="hint workbench-req-plan">
              {pmFinalizedIdx !== null
                ? `产品已定稿：${pmSolutions[pmFinalizedIdx]?.title || ""}`
                : ""}
              {pmFinalizedIdx !== null && uiFinalizedIdx !== null ? " · " : ""}
              {uiFinalizedIdx !== null
                ? `UI 已定稿：${uiSolutions[uiFinalizedIdx]?.title || ""}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="workspace-body">
          <div className="card role-pane">
          <div className="role-tabs" role="tablist" aria-label="角色视图">
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "pm"}
              className={`role-trigger ${roleTab === "pm" ? "on" : ""}`}
              onClick={() => setRoleTab("pm")}
            >
              产品经理
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "ui"}
              className={`role-trigger ${roleTab === "ui" ? "on" : ""}`}
              onClick={() => setRoleTab("ui")}
            >
              UI设计
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "fs"}
              className={`role-trigger ${roleTab === "fs" ? "on" : ""}`}
              onClick={() => setRoleTab("fs")}
            >
              全栈落地
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "qa"}
              className={`role-trigger ${roleTab === "qa" ? "on" : ""}`}
              onClick={() => setRoleTab("qa")}
            >
              测试岗
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "ops"}
              className={`role-trigger ${roleTab === "ops" ? "on" : ""}`}
              onClick={() => setRoleTab("ops")}
            >
              运维岗
            </button>
          </div>

          <div className="role-pane-scroll">
          {roleTab === "pm" ? (
            <div className="scheme-pane">
              <div className="pane-title">需求整理</div>
              <p className="pane-desc">
                对原始需求进行拆分与评审要点归纳（可按条款浏览，便于评审会议使用）。
              </p>
              <ul className="req-bullets">
                {reqBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className="hint" style={{ marginTop: 12 }}>
                <strong>评审提示：</strong>范围是否清晰？关键路径是否闭环？边界条件（空态、错误、权限）是否覆盖？
              </div>
              <div className="pm-spec-actions role-action-bar">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canSummarizeReq}
                  onClick={generatePmSpec}
                >
                  {pmSpecGenerating ? "总结中…" : "总结需求"}
                </button>
                {pmSpecMd.trim() ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setPmSpecModalOpen(true)}
                  >
                    查看需求文档
                  </button>
                ) : null}
                {pmSpecMd.trim() ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => downloadMarkdown("需求文档.md", pmSpecMd)}
                  >
                    下载需求文档
                  </button>
                ) : null}
              </div>
              <p className="hint pm-spec-hint">
                {pmSpecMd.trim()
                  ? "需求文档已就绪，可为各方案生成原型；修改上方需求后请重新「总结需求」。"
                  : "请先在上方填写需求并点击「总结需求」，生成标准需求文档后再生成原型。"}
              </p>
              <div className="pane-subtitle">产品方案（不少于 3 种）</div>
              <div className="solution-pick">
                {pmSolutions.map((s, i) => (
                  <div key={i} className="solution-row">
                    <button
                      type="button"
                      className={`solution-chip ${pmSolutionIdx === i ? "on" : ""}`}
                      onClick={() => setPmSolutionIdx(i)}
                    >
                      {s.title}
                      {pmFinalizedIdx === i ? (
                        <span className="solution-badge">已定稿</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline-primary"
                        disabled={!canRunPmAction || busy}
                        onClick={() => runPmForSolution(i)}
                        title={
                          !pmSpecMd.trim()
                            ? "请先总结需求并生成需求文档"
                            : undefined
                        }
                      >
                      {variantBusy?.role === "pm" && variantBusy.idx === i
                        ? "生成中…"
                        : "生成原型"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-finalize"
                      disabled={!pmVariantReady[i] || busy}
                      onClick={() => finalizePm(i)}
                    >
                      {pmFinalizedIdx === i ? "已定稿" : "定稿"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="scheme-pane-detail">
                <div className="pane-title">{pmSolutions[pmSolutionIdx].title}</div>
                <p className="pane-body">{pmSolutions[pmSolutionIdx].summary}</p>
                <p className="hint">
                  点击「生成原型」后在右侧预览；定稿后 UI / 全栈将沿用该方案。
                </p>
              </div>
            </div>
          ) : roleTab === "ui" ? (
            <div className="scheme-pane">
              <div className="pane-title">UI 方案</div>
              <p className="pane-desc">至少三种视觉方向；定稿前请先在产品经理页定稿原型。</p>
              {pmFinalizedIdx === null ? (
                <p className="hint hint-warn">请先在「产品经理」页对某一方案定稿。</p>
              ) : (
                <p className="hint">
                  沿用产品定稿：{pmSolutions[pmFinalizedIdx]?.title}
                </p>
              )}
              <div className="ui-solution-list">
                {uiSolutions.map((s, i) => (
                  <div key={i} className="ui-solution-row">
                    <button
                      type="button"
                      className={`ui-solution-card ${uiSolutionIdx === i ? "on" : ""}`}
                      onClick={() => setUiSolutionIdx(i)}
                    >
                      <div className="ui-solution-title">
                        {s.title}
                        {uiFinalizedIdx === i ? (
                          <span className="solution-badge">已定稿</span>
                        ) : null}
                      </div>
                      <div className="ui-solution-philosophy">{s.philosophy}</div>
                      <div className="ui-solution-fit hint">{s.fitFor}</div>
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline-primary ui-solution-gen"
                      disabled={!canRunUi || busy}
                      onClick={() => runUiForSolution(i)}
                      title={
                        !canRunUi && pmFinalizedIdx === null
                          ? "请先在产品经理页定稿某一方案"
                          : undefined
                      }
                    >
                      {variantBusy?.role === "ui" && variantBusy.idx === i
                        ? "生成中…"
                        : "生成 UI"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-finalize"
                      disabled={!uiVariantReady[i] || busy}
                      onClick={() => finalizeUi(i)}
                    >
                      {uiFinalizedIdx === i ? "已定稿" : "定稿"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="scheme-pane-detail">
                <div className="pane-title">{uiSolutions[uiSolutionIdx].title}</div>
                <p className="pane-body">{uiSolutions[uiSolutionIdx].philosophy}</p>
                <p className="hint">{uiSolutions[uiSolutionIdx].fitFor}</p>
              </div>
            </div>
          ) : roleTab === "fs" ? (
            <div className="fs-panel workbench-main-stack">
              <div className="fs-toolbar">
                <div className="pane-title fs-toolbar-title">全栈落地</div>
                {fsPlanDirty ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunFs}
                    onClick={runFs}
                  >
                    确认变动
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunFs || busy}
                    onClick={runFs}
                    title={
                      uiFinalizedIdx === null
                        ? "请先在 UI 设计页定稿某一方案"
                        : !canRunFs
                          ? "请先完成 UI 定稿"
                          : undefined
                    }
                  >
                    {busy && phase === "fs" ? "落地中…" : "全栈落地"}
                  </button>
                )}
                {uiFinalizedIdx !== null ? (
                  <span className="hint fs-toolbar-hint">
                    沿用 UI 定稿：{uiSolutions[uiFinalizedIdx]?.title}
                  </span>
                ) : null}
              </div>
              <details className="pane-details">
                <summary className="hint">全栈说明与预览路径</summary>
                <p className="hint">
                  预览在右侧；路径 <code>generated/{sessionId || "…"}/app/index.html</code>
                </p>
              </details>
              {sessionId ? (
                <div className="preview-toolbar">
                  <button type="button" className="btn btn-small" onClick={refreshFsPreview}>
                    刷新预览
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => openFolderInExplorer(`generated/${sessionId}/app`)}
                  >
                    打开 app
                  </button>
                  {appFrame ? (
                    <a
                      className="btn btn-small"
                      href={appFrame}
                      target="_blank"
                      rel="noreferrer"
                    >
                      新标签打开
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : roleTab === "qa" ? (
            <div className="qa-workbench">
              <div className="qa-subtabs" role="tablist" aria-label="测试岗模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={qaSubTab === "pipeline"}
                  className={`qa-subtab ${qaSubTab === "pipeline" ? "on" : ""}`}
                  onClick={() => setQaSubTab("pipeline")}
                >
                  {projectTitleFromRequirement(requirement)}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qaSubTab === "standalone"}
                  className={`qa-subtab ${qaSubTab === "standalone" ? "on" : ""}`}
                  onClick={() => setQaSubTab("standalone")}
                >
                  独立测试（对外）
                </button>
              </div>

              {qaSubTab === "pipeline" ? (
                <div className="qa-pipeline-layout qa-pipeline-layout-v2 workbench-main-stack">
                  <aside className="qa-pipeline-left">
                    <div className="pane-title">测试点列表</div>
                    <p className="hint qa-point-list-hint">
                      生成顺序固定：先<strong>业务测试点</strong>，再<strong>功能测试点</strong>。点击「进行测试」将按列表从上到下依次执行。
                    </p>
                    <ul className="qa-point-list">
                      {pipelineTestPoints.length === 0 ? (
                        <li className="qa-point-empty">
                          <p className="hint">尚无测试点</p>
                          <p className="qa-empty-cta">↓ 点击下方「生成测试点」</p>
                        </li>
                      ) : (
                        pipelinePointsGrouped.map((row, ri) =>
                          row.type === "header" ? (
                            <li key={`h-${row.kind}-${ri}`} className="qa-point-section-head">
                              {kindSectionTitle(row.kind)}
                            </li>
                          ) : (
                            <li key={row.pt.id || row.idx}>
                              <button
                                type="button"
                                className={
                                  "qa-point-item" +
                                  (row.idx === pipelineActiveIdx ? " active" : "") +
                                  (row.idx === pipelineTestingIdx && pipelineTesting
                                    ? " testing"
                                    : "") +
                                  (row.idx < pipelineTestingIdx && pipelineTesting
                                    ? " done"
                                    : "")
                                }
                                onClick={() => setPipelineActiveIdx(row.idx)}
                                disabled={pipelineTesting}
                              >
                                <span
                                  className={
                                    "qa-point-tag" +
                                    (row.pt.kind === "smoke"
                                      ? " smoke"
                                      : row.pt.kind === "business"
                                        ? " biz"
                                        : " fn")
                                  }
                                >
                                  {row.pt.kind === "smoke"
                                    ? "冒烟"
                                    : row.pt.kind === "business"
                                      ? "业务"
                                      : "功能"}
                                </span>
                                <span className="qa-point-title">{row.pt.title}</span>
                              </button>
                            </li>
                          )
                        )
                      )}
                    </ul>
                    <button
                      type="button"
                      className="btn btn-primary qa-gen-points-btn"
                      disabled={!canRunQaPipeline}
                      onClick={generatePipelineTestPoints}
                    >
                      {pipelineGenerating ? "生成中…" : "生成测试点"}
                    </button>
                  </aside>

                  <footer className="qa-pipeline-footer">
                    {pipelineTesting && pipelineTestProgress.total > 0 ? (
                      <div className="qa-test-progress" role="status" aria-live="polite">
                        <div className="qa-test-progress-track">
                          <div
                            className="qa-test-progress-bar"
                            style={{
                              width: `${Math.round(
                                (pipelineTestProgress.current /
                                  pipelineTestProgress.total) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="qa-test-progress-text">
                          正在测试 {pipelineTestProgress.current}/
                          {pipelineTestProgress.total}
                          {pipelineTestProgress.title
                            ? `：${pipelineTestProgress.title}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                    <div className="qa-pipeline-actions qa-pipeline-actions-row1">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!sessionId || pipelineTesting || busy}
                        onClick={runPipelineSmokeTest}
                        title="仅执行带 Playwright json 步骤的冒烟用例（替代人工冒烟主流程）"
                      >
                        {pipelineTesting &&
                        pipelineTestProgress.total > 0 &&
                        pipelineTestPoints.some((p) => p.kind === "smoke")
                          ? `冒烟测试中…`
                          : "冒烟测试（Playwright）"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          !sessionId ||
                          !pipelineTestPoints.length ||
                          pipelineTesting ||
                          busy
                        }
                        onClick={runPipelineTestOne}
                        title={
                          pipelineTestPoints[pipelineActiveIdx]?.title ||
                          "请先在列表中选中一条测试点"
                        }
                      >
                        {pipelineTesting && pipelineTestProgress.total === 1
                          ? "测试中…"
                          : `测试当前项（${pipelineActiveIdx + 1}/${pipelineTestPoints.length || 0}）`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                          !sessionId ||
                          !pipelineTestPoints.length ||
                          pipelineTesting ||
                          busy
                        }
                        onClick={runPipelineTest}
                      >
                        {pipelineTesting && pipelineTestProgress.total > 1
                          ? `全部测试中 ${pipelineTestProgress.current}/${pipelineTestProgress.total}`
                          : "全部测试"}
                      </button>
                    </div>
                    <div className="qa-pipeline-actions qa-pipeline-actions-row2">
                      <button
                        type="button"
                        className="btn"
                        disabled={!pipelineTestIssues.length}
                        onClick={notifyFullStackFromQa}
                      >
                        通知全栈修改
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!pipelineTestIssues.length}
                        onClick={copyTestIssuesMd}
                      >
                        复制问题列表
                      </button>
                    </div>
                    <div className="qa-issues-panel">
                      <div className="qa-issues-head">
                        <div className="pane-subtitle">测试问题</div>
                        {pipelineTestIssues.length > 0 ? (
                          <span className="qa-issues-count">
                            {pipelineTestIssues.length} 项
                          </span>
                        ) : null}
                      </div>
                      {pipelineTestIssues.length === 0 ? (
                        <p className="hint">
                          选中列表条目 →「测试当前项」；或「冒烟 / 全部测试」批量执行。app 预览在右侧。
                        </p>
                      ) : (
                        <ul className="qa-issues-list">
                          {pipelineTestIssues.map((it, i) => {
                            const tag = classifyIssueReason(it.reason);
                            return (
                              <li key={i} className="qa-issue-card">
                                <div className="qa-issue-head">
                                  <span className={`qa-issue-tag tag-${tag}`}>
                                    {ISSUE_TAG_LABEL[tag]}
                                  </span>
                                  <strong className="qa-issue-title">
                                    {it.title || "项"}
                                  </strong>
                                </div>
                                <p className="qa-issue-reason">{it.reason}</p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </footer>
                </div>
              ) : (
                <div className="standalone-role-panel workbench-main-stack">
                  <div className="pane-title">独立测试（对外）</div>
                  <p className="pane-desc">
                    不依赖本流水线前置步骤；填写说明与截图后生成测试点 Markdown，预览在右侧。
                  </p>
                  <h3 className="sidebar-role-title">原型图 / 说明</h3>
                  <textarea
                    className="req-textarea req-textarea-secondary"
                    rows={5}
                    placeholder="粘贴脑图摘要、原型链接说明、操作流程、关注点等……"
                    value={qaMaterial}
                    onChange={(e) => setQaMaterial(e.target.value)}
                  />
                  <h3 className="sidebar-role-title">测试文档风格（可选）</h3>
                  <textarea
                    className="req-textarea req-textarea-secondary"
                    rows={3}
                    placeholder="例：沿用「场景-步骤-期望」三段式 / 必须用表格列出接口字段……"
                    value={qaStyleHint}
                    onChange={(e) => setQaStyleHint(e.target.value)}
                  />
                  <div className="image-pick-row">
                    <label className="btn btn-small">
                      上传原型截图
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={onPickQaImages}
                      />
                    </label>
                    <span className="hint">
                      最多约 12 张；OpenAI 兼容且为视觉模型时对生成更有帮助。
                    </span>
                  </div>
                  {qaImageItems.length > 0 ? (
                    <ul className="thumb-strip">
                      {qaImageItems.map((item, idx) => (
                        <li key={item.name + idx} className="thumb-strip-item">
                          <img src={item.dataUrl} alt={item.name} />
                          <button
                            type="button"
                            className="thumb-remove"
                            aria-label={`移除 ${item.name}`}
                            onClick={() =>
                              setQaImageItems((prev) => prev.filter((_, j) => j !== idx))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="role-action-bar">
                    <p className="hint role-action-hint">
                      {canRunQa
                        ? "待执行：生成测试点文档"
                        : config.provider === "cursor" && !sessionId
                          ? "Cursor 需先有会话并完成「产品经理」以绑定远端 Agent"
                          : !qaInputsReady
                            ? "请填写需求或测试说明，或上传参考图"
                            : "请补齐 API Key（或 Cursor 密钥与仓库）"}
                    </p>
                    <div className="req-footer">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canRunQa}
                        onClick={runQa}
                      >
                        {busy && roleTab === "qa" ? "生成中…" : "生成测试点文档"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaMdPreview.trim()}
                        onClick={() => downloadMarkdown("测试点.md", qaMdPreview)}
                      >
                        下载测试点.md
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="standalone-role-panel workbench-main-stack">
              <div className="pane-title">运维岗</div>
              <p className="pane-desc">
                结合上方用户需求与下方说明生成运维手册；Markdown 预览在右侧。
              </p>
              <h3 className="sidebar-role-title">环境与交付说明</h3>
              <textarea
                className="req-textarea req-textarea-secondary"
                rows={5}
                placeholder="端口、宿主、CDN、密钥来源、上下游依赖、发布流程等……"
                value={opsMaterial}
                onChange={(e) => setOpsMaterial(e.target.value)}
              />
              <h3 className="sidebar-role-title">运维文档模板 / 粒度（可选）</h3>
              <textarea
                className="req-textarea req-textarea-secondary"
                rows={3}
                placeholder="例：我需要「部署拓扑 + checklist + FAQ」三节……"
                value={opsStyleHint}
                onChange={(e) => setOpsStyleHint(e.target.value)}
              />
              <div className="image-pick-row">
                <label className="btn btn-small">
                  上传拓扑 / 控制台截图
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={onPickOpsImages}
                  />
                </label>
                <span className="hint">可选；Cursor Cloud 仅能根据文字推断图片内容。</span>
              </div>
              {opsImageItems.length > 0 ? (
                <ul className="thumb-strip">
                  {opsImageItems.map((item, idx) => (
                    <li key={item.name + idx} className="thumb-strip-item">
                      <img src={item.dataUrl} alt={item.name} />
                      <button
                        type="button"
                        className="thumb-remove"
                        aria-label={`移除 ${item.name}`}
                        onClick={() =>
                          setOpsImageItems((prev) => prev.filter((_, j) => j !== idx))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="role-action-bar">
                <p className="hint role-action-hint">
                  {canRunOps
                    ? "待执行：生成运维手册"
                    : config.provider === "cursor" && !sessionId
                      ? "Cursor 需先有会话并完成「产品经理」以绑定远端 Agent"
                      : !opsInputsReady
                        ? "请填写需求或运维说明，或上传参考图"
                        : "请补齐 API Key（或 Cursor 密钥与仓库）"}
                </p>
                <div className="req-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunOps}
                    onClick={runOps}
                  >
                    {busy && roleTab === "ops" ? "生成中…" : "生成运维手册"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!opsMdPreview.trim()}
                    onClick={() => downloadMarkdown("运维手册.md", opsMdPreview)}
                  >
                    下载运维手册.md
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          </div>

          <div className="card preview-main">
          <div className="preview-rail-head">
            <span className="pane-title">{previewRailTitle}</span>
            <span className="hint config-bar-summary">{configSummary}</span>
          </div>
          <div className="preview preview-rail-body">
            {roleTab === "pm" ? (
              showPmPrototypeIframe ? (
                <iframe
                  title="prototype"
                  key={`pf-rail-${sessionId}-${previewBust}`}
                  src={prototypeFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  {pmPreviewGenerating
                    ? `方案${pmSolutionIdx + 1} 原型生成中，请勿刷新…`
                    : pmVariantReady[pmSolutionIdx]
                      ? "若预览空白请点「刷新预览」或稍候写入完成。"
                      : "在左侧选择方案并点击「生成原型」。"}
                </div>
              )
            ) : roleTab === "ui" ? (
              showUiStageIframe ? (
                <iframe
                  title="ui-preview"
                  key={`ui-rail-${sessionId}-${previewBust}-${uiFrame ? "ui" : "proto"}`}
                  src={uiFrame || prototypeFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  {uiPreviewGenerating
                    ? `方案${uiSolutionIdx + 1} UI 生成中…`
                    : uiVariantReady[uiSolutionIdx]
                      ? "若预览空白请稍候或切换方案后重试。"
                      : "在左侧 UI 方案处点击「生成 UI」后在此预览。"}
                </div>
              )
            ) : roleTab === "fs" ? (
              sessionId ? (
                <iframe
                  title="app"
                  key={`app-rail-${sessionId}-${previewBust}`}
                  src={appFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  完成 UI 定稿并在左侧点击「全栈落地」后，将在此预览 app/index.html。
                </div>
              )
            ) : roleTab === "qa" ? (
              qaSubTab === "pipeline" ? (
                sessionId ? (
                  <iframe
                    title="qa-app"
                    key={`qa-app-rail-${sessionId}-${previewBust}`}
                    src={appFrame}
                  />
                ) : (
                  <div className="preview-placeholder">
                    请先完成全栈落地，右侧将展示可运行的 app。
                  </div>
                )
              ) : qaMdPreview.trim() ? (
                <pre className="md-preview md-preview-rail">{qaMdPreview}</pre>
              ) : (
                <div className="preview-placeholder md-placeholder">
                  在左侧「独立测试」页填写素材并生成后，测试点 Markdown 将显示于此。
                </div>
              )
            ) : opsMdPreview.trim() ? (
              <pre className="md-preview md-preview-rail">{opsMdPreview}</pre>
            ) : (
              <div className="preview-placeholder md-placeholder">
                在左侧填写运维说明并「生成运维手册」后，将在此展示 Markdown。
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="card workspace-bottom">
          {(() => {
            const r = roleTab;
            const ROLE_LABEL = {
              pm: "产品经理",
              ui: "UI 设计",
              fs: "全栈落地",
              qa: "测试岗",
              ops: "运维岗",
            }[r];
            const FILE_HINT = {
              pm: "prototype.html",
              ui: "ui.html",
              fs: "app/index.html / styles.css / app.js",
              qa: "测试点.md",
              ops: "运维手册.md",
            }[r];
            const hist = chatHistory[r] || [];
            const sending = chatBusyRole === r;
            const disabled =
              sending ||
              !sessionId ||
              busy ||
              (config.provider === "cursor"
                ? !(config.cursorApiKey && config.cursorRepoUrl)
                : !config.apiKey);
            return (
              <div className="role-chat" aria-label={`${ROLE_LABEL} 追问对话`}>
                <div className="role-chat-head">
                  <h3 className="role-chat-title">追问 {ROLE_LABEL}</h3>
                  <span className="role-chat-sub">
                    <code>skills/roles/{r === "fs" ? "fullstack" : r}/SKILL.md</code>
                    {" · "}
                    <code>### FILE: {FILE_HINT}</code>
                  </span>
                </div>
                <div className="role-chat-log" aria-live="polite">
                  {hist.length === 0 ? (
                    <div className="role-chat-msg-empty">
                      {sessionId
                        ? "尚无追问；完成主输出后可在此与该角色多轮对话。"
                        : "请先在本页完成主输出（如生成原型 / UI / 全栈落地），生成会话目录。"}
                    </div>
                  ) : (
                    hist.map((m, i) => (
                      <div
                        key={i}
                        className={`role-chat-msg role-chat-msg-${m.role}`}
                      >
                        {m.content || (m.role === "assistant" && sending && i === hist.length - 1
                          ? "…"
                          : "")}
                      </div>
                    ))
                  )}
                </div>
                <div className="role-chat-input-row">
                  <div className="role-chat-input-wrap">
                    <textarea
                      className="role-chat-input"
                      rows={2}
                      placeholder={
                        sessionId
                          ? `向${ROLE_LABEL}追问（Ctrl/⌘+Enter 发送，可直接粘贴截图）`
                          : "请先完成主输出"
                      }
                      value={chatInput[r] || ""}
                      onChange={(e) =>
                        setChatInput((prev) => ({ ...prev, [r]: e.target.value }))
                      }
                      onPaste={(e) => onPasteChatImages(r, e)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          if (!disabled) sendRoleChat(r);
                        }
                      }}
                      disabled={disabled}
                    />
                    {(chatImageItems[r] || []).length > 0 ? (
                      <ul className="thumb-strip role-chat-thumbs">
                        {(chatImageItems[r] || []).map((item, idx) => (
                          <li key={item.name + idx} className="thumb-strip-item">
                            <img src={item.dataUrl} alt={item.name} />
                            <button
                              type="button"
                              className="thumb-remove"
                              aria-label="移除附图"
                              onClick={() =>
                                setChatImageItems((prev) => ({
                                  ...prev,
                                  [r]: (prev[r] || []).filter((_, j) => j !== idx),
                                }))
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="role-chat-actions">
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      disabled={
                        disabled ||
                        (!(chatInput[r] || "").trim() && !(chatImageItems[r] || []).length)
                      }
                      onClick={() => sendRoleChat(r)}
                    >
                      {sending ? "回复中…" : "发送"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={sending || hist.length === 0}
                      onClick={() =>
                        setChatHistory((prev) => ({ ...prev, [r]: [] }))
                      }
                      title="只清空当前面板显示，磁盘 JSONL 历史仍保留"
                    >
                      清屏
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="log-panel">
            <div className="log-panel-head">
              <h3 className="log-section-title">思考与执行流</h3>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setLogOpen((o) => !o)}
                aria-expanded={logOpen}
              >
                {logOpen ? "收起日志" : "展开日志"}
              </button>
            </div>
            {logOpen ? (
              <>
                <details className="log-hint-details">
                  <summary className="hint">排查提示</summary>
                  <p className="hint log-hint">
                    「模型配置」→ 测试连接；终端 <code>AGILE_SIM_DEBUG=1</code>；F12 看{" "}
                    <code>/api/pipeline/*</code> 是否 canceled。
                  </p>
                </details>
                {liveThought ? (
                  <pre className="live-thought" aria-live="polite">
                    {liveThought}
                  </pre>
                ) : null}
                <div className="log-scroll" ref={logScrollRef}>
                  {logLines.length === 0 ? (
                    <div className="hint">尚无日志</div>
                  ) : (
                    logLines.map((l) => (
                      <div
                        key={l.t + l.text.slice(0, 12)}
                        className={
                          "line " +
                          (l.muted ? "muted" : "") +
                          (/^[✓✗]/.test(l.text) ? " log-line-marked" : "")
                        }
                      >
                        {l.text}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="hint log-collapsed-hint">
                {logLines.length} 条日志已折叠
              </p>
            )}
          </div>
        </div>
      </div>


      {pmSpecModalOpen && pmSpecMd.trim() ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setPmSpecModalOpen(false)}
        >
          <div
            className="modal-panel modal-panel-spec"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-spec-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="pm-spec-title">标准需求文档</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setPmSpecModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="hint">
              路径：<code>generated/{sessionId || "…"}/需求文档.md</code>
            </p>
            <pre className="md-preview md-preview-modal">{pmSpecMd}</pre>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => downloadMarkdown("需求文档.md", pmSpecMd)}
              >
                下载
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPmSpecModalOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="modal-panel modal-panel-history"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-list-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="history-list-title">已完成项目</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setHistoryModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="hint history-modal-hint">
              全栈生成 <code>app/</code> 后写入本列表（仅保存在本浏览器）。点击一项查看详情，可
              <strong>嵌入流水线</strong>恢复会话。
            </p>
            {historyRecords.length === 0 ? (
              <div className="history-modal-empty hint">
                暂无记录；请先跑完整条流水线至全栈落地。
              </div>
            ) : (
              <ul className="history-list history-list-modal">
                {historyRecords.map((r) => (
                  <li key={r.sessionId}>
                    <button
                      type="button"
                      className="history-item"
                      onClick={() => {
                        setHistoryModalOpen(false);
                        setHistoryDetail(r);
                      }}
                    >
                      <span className="history-req">
                        {(r.requirement || "（无需求）").slice(0, 120)}
                        {(r.requirement || "").length > 120 ? "…" : ""}
                      </span>
                      <span className="history-meta">
                        {new Date(r.finishedAt).toLocaleString("zh-CN")} · {r.sessionId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setHistoryModalOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyDetail ? (
        <div
          className="modal-backdrop modal-backdrop-front"
          role="presentation"
          onClick={() => setHistoryDetail(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="history-detail-title">项目详情</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setHistoryDetail(null)}
              >
                ×
              </button>
            </div>
            <div className="field">
              <label>会话 ID</label>
              <div className="mono-p">{historyDetail.sessionId}</div>
            </div>
            <div className="field">
              <label>用户需求</label>
              <textarea
                readOnly
                value={historyDetail.requirement || ""}
                rows={6}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="field">
              <label>生成目录（点击打开）</label>
              <button
                type="button"
                className="path-open-btn"
                onClick={() => openFolderInExplorer(historyDetail.outputDir)}
              >
                {historyDetail.outputDir}
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              完成时间：{new Date(historyDetail.finishedAt).toLocaleString("zh-CN")}
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-embed-pipeline"
                onClick={() => embedHistoryIntoPipeline(historyDetail)}
                title="恢复该会话到左侧主流水线，继续全栈/测试/追问（不重新生成会话 ID）"
              >
                嵌入流水线
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openFolderInExplorer(historyDetail.outputDir)}
              >
                打开文件夹
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setHistoryDetail(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
