import { useCallback, useEffect, useMemo, useState } from "react";

async function api(path, opts = {}) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(p, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return { ok: res.ok, status: res.status };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function numEq(a, b, tol = 0.01) {
  if (a == null || b == null) return false;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tol;
}

function pctEq(a, b, tol = 0.005) {
  if (a == null || b == null) return false;
  let x = Number(a);
  let y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(x) > 1.5) x /= 100;
  if (Math.abs(y) > 1.5) y /= 100;
  return Math.abs(x - y) <= tol;
}

const VERDICT = {
  pass: { label: "通过", cls: "is-pass" },
  db_vs_expected: { label: "库不符期望", cls: "is-warn" },
  page_vs_db: { label: "页不符库", cls: "is-fail" },
  sync_delay: { label: "同步延迟（可重试）", cls: "is-warn" },
  page_missing: { label: "页面未抓到", cls: "is-warn" },
  caliber_tbd: { label: "口径待确认", cls: "is-muted" },
  pending: { label: "待比对", cls: "is-muted" },
};

function judgeRow({ expected, db, page, isPercent }) {
  const eq = isPercent ? pctEq : numEq;
  const hasPage = page != null && page !== "";
  const dbOk = expected == null ? true : eq(db, expected);
  if (!dbOk) {
    return {
      code: "db_vs_expected",
      hint: "库侧已偏期望：可能脏数据、未清理或含下级口径不一致",
    };
  }
  if (!hasPage) {
    return { code: "page_missing", hint: "未抓到页面值；可重试抓取或人工看页" };
  }
  if (eq(page, db)) {
    return { code: "pass", hint: "期望≈库≈页" };
  }
  if (Number(page) === 0 && Number(db) > 0) {
    return {
      code: "sync_delay",
      hint: "库已有数、页仍为 0：常见同步/缓存延迟，建议等待后重试",
    };
  }
  return { code: "page_vs_db", hint: "库与页不一致：优先提缺陷或核对页面筛选条件" };
}

function fmtVal(v, isPercent) {
  if (v == null || v === "") return "—";
  if (isPercent) {
    let n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (Math.abs(n) <= 1.5) n *= 100;
    return `${n.toFixed(2)}%`;
  }
  return String(v);
}

const STEPS = [
  { id: 1, title: "口径与期望" },
  { id: 2, title: "造数并验库" },
  { id: 3, title: "抓页比对" },
];

/**
 * 数据验证-优化版：向导三步 + 期望/库/页三栏 + 差异结论枚举。
 * 复用现有 /api/ai-assist-verify/*，不改旧 tab。
 */
export default function DataVerifyOptimized({ projectContext, onOpenBizFlow, onRefreshParent }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    l3User: "smoke_l3_24874175",
    l3Pass: "111111",
    sourceDb: "lx",
    platformLabel: "龙翔",
    baseUrl: "http://sw.example.com",
    sdkBusinessAccount: "龙翔一级商务",
    presidentAccount: "",
    promoteId: "",
    todayCount: 10,
    yesterdayCount: 20,
    expectedMomPercent: -50,
    includeSubordinates: true,
    timezoneNote: "库侧 DATE(FROM_UNIXTIME(register_time))，服务器本地日",
    regTable: "game_lx.tab_user.register_time（varchar unix 秒）",
    momFormula: "(今日注册 - 昨日注册) / 昨日注册",
  });

  const [layers, setLayers] = useState({
    core: true,
    login: false,
    pay: false,
    top: false,
    sub: false,
  });

  const [seedMode, setSeedMode] = useState("reg"); // reg | full_existing
  const [waitSec, setWaitSec] = useState(8);
  const [retryN, setRetryN] = useState(2);

  const [dossier, setDossier] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [compareRows, setCompareRows] = useState([]);
  const [lastCompare, setLastCompare] = useState(null);
  const [evidence, setEvidence] = useState(null);

  const patchForm = useCallback((partial) => {
    setForm((p) => ({ ...p, ...partial }));
  }, []);

  const loadState = useCallback(async () => {
    const qs = projectContext?.projectId
      ? `?projectId=${encodeURIComponent(projectContext.projectId)}`
      : "";
    const st = await api(`/api/ai-assist-verify/state${qs}`);
    if (st?.defaults) {
      setForm((prev) => ({
        ...prev,
        ...st.defaults,
        l3User: st.defaults.l3User || prev.l3User,
        l3Pass: st.defaults.l3Pass || prev.l3Pass,
        todayCount: st.defaults.todayCount ?? prev.todayCount,
        yesterdayCount: st.defaults.yesterdayCount ?? prev.yesterdayCount,
        expectedMomPercent: st.defaults.expectedMomPercent ?? prev.expectedMomPercent,
      }));
    }
    if (st?.dossier) {
      setDossier(st.dossier);
      if (st.dossier.dbStats) {
        setDbStats({ ok: true, metrics: st.dossier.dbStats });
      }
    }
    return st;
  }, [projectContext?.projectId]);

  useEffect(() => {
    loadState().catch((e) => setMsg(`加载失败：${e.message || e}`));
  }, [loadState]);

  const expected = useMemo(
    () => ({
      todayReg: Number(form.todayCount) || 10,
      yesterdayReg: Number(form.yesterdayCount) || 20,
      momPercent: Number(form.expectedMomPercent),
      momRatio: Number(form.expectedMomPercent) / 100,
    }),
    [form.todayCount, form.yesterdayCount, form.expectedMomPercent]
  );

  const dbMetrics = dbStats?.metrics || dossier?.dbStats || {};

  const triRows = useMemo(() => {
    const rows = [
      {
        key: "todayReg",
        name: "今日渠道玩家注册",
        layer: "core",
        isPercent: false,
        expected: expected.todayReg,
        db: dbMetrics.todayReg,
        page: lastCompare?.pageMetrics?.todayReg,
      },
      {
        key: "yesterdayReg",
        name: "昨日渠道玩家注册",
        layer: "core",
        isPercent: false,
        expected: expected.yesterdayReg,
        db: dbMetrics.yesterdayReg,
        page: lastCompare?.pageMetrics?.yesterdayReg ?? null,
      },
      {
        key: "mom",
        name: "环比昨日",
        layer: "core",
        isPercent: true,
        expected: expected.momPercent,
        db: dbMetrics.momPercent ?? (dbMetrics.momRatio != null ? dbMetrics.momRatio * 100 : null),
        page:
          lastCompare?.pageMetrics?.momPercent ??
          (lastCompare?.pageMetrics?.momRatio != null
            ? lastCompare.pageMetrics.momRatio * 100
            : null),
      },
    ];

    const full = dossier?.fullStrategy;
    if (layers.login && full?.login) {
      rows.push({
        key: "loginToday",
        name: "今日登录造数（清单）",
        layer: "login",
        isPercent: false,
        expected: full.login.today ?? null,
        db: full.login.today ?? null,
        page: null,
        note: "扩展层：当前仅清单侧；页面抓取未覆盖",
      });
    }
    if (layers.pay && full?.pay) {
      rows.push({
        key: "payToday",
        name: "今日充值笔数（清单）",
        layer: "pay",
        isPercent: false,
        expected: (full.pay.todayAccounts || []).length || null,
        db: (full.pay.todayAccounts || []).length || null,
        page: null,
        note: "扩展层：当前仅清单侧",
      });
    }
    if (layers.top && Array.isArray(full?.top10)) {
      rows.push({
        key: "topChannels",
        name: "TOP 渠道数（清单）",
        layer: "top",
        isPercent: false,
        expected: 11,
        db: full.top10.length,
        page: null,
        note: "扩展层：清单对验",
      });
    }
    if (layers.sub && full?.subordinates) {
      const n = (full.subordinates.players || []).length;
      rows.push({
        key: "subPlayers",
        name: "下级玩家（清单）",
        layer: "sub",
        isPercent: false,
        expected: n || 2,
        db: n,
        page: null,
        note: form.includeSubordinates
          ? "口径含下级：注册统计走 promote_ids 合集"
          : "口径不含下级：请只用一级 promoteId 查库",
      });
    }

    return rows
      .filter((r) => r.layer === "core" || layers[r.layer])
      .map((r) => {
        const j = judgeRow({
          expected: r.expected,
          db: r.db,
          page: r.page,
          isPercent: r.isPercent,
        });
        return { ...r, verdict: j.code, hint: r.note || j.hint };
      });
  }, [expected, dbMetrics, lastCompare, dossier, layers, form.includeSubordinates]);

  const coreVerdictSummary = useMemo(() => {
    const today = triRows.find((r) => r.key === "todayReg");
    const mom = triRows.find((r) => r.key === "mom");
    const yday = triRows.find((r) => r.key === "yesterdayReg");
    if (yday?.verdict === "db_vs_expected" || today?.verdict === "db_vs_expected") {
      return "db_vs_expected";
    }
    if (step < 3) {
      if (today?.verdict === "pass" && yday?.verdict === "pass") return "pending";
      return today?.verdict === "db_vs_expected" ? "db_vs_expected" : "pending";
    }
    if (today?.verdict === "sync_delay" || mom?.verdict === "sync_delay") return "sync_delay";
    if (today?.verdict === "page_vs_db" || mom?.verdict === "page_vs_db") return "page_vs_db";
    if (today?.verdict === "page_missing" || mom?.verdict === "page_missing") return "page_missing";
    if (today?.verdict === "pass" && mom?.verdict === "pass") return "pass";
    return today?.verdict || mom?.verdict || "pending";
  }, [triRows, step]);

  const runDbStats = useCallback(async () => {
    setBusy("刷新库统计…");
    setMsg("");
    try {
      const r = await api("/api/ai-assist-verify/db-stats", {
        method: "POST",
        body: JSON.stringify({
          sourceDb: form.sourceDb || "lx",
          promoteId: form.promoteId || undefined,
          sdkBusinessAccount: form.sdkBusinessAccount,
        }),
      });
      setDbStats(r);
      if (!r?.ok) setMsg(r?.error || "库统计失败");
      else setMsg(`库：今${r.metrics?.todayReg} / 昨${r.metrics?.yesterdayReg} / 环比 ${r.metrics?.momPercent}%`);
      return r;
    } catch (e) {
      setMsg(`库统计异常：${e.message || e}`);
      return null;
    } finally {
      setBusy("");
    }
  }, [form]);

  const runSeed = useCallback(async () => {
    setMsg("");
    if (seedMode === "full_existing") {
      setBusy("加载已有全量造数清单…");
      try {
        await loadState();
        const r = await runDbStats();
        onRefreshParent?.();
        setMsg(
          (r?.ok ? "已使用全量造数清单并刷新库统计。" : "清单已加载，但库统计失败。") +
            " 扩展层（登录/充值/TOP）来自 data/_wb_seed_full_result.json"
        );
        setStep(2);
      } catch (e) {
        setMsg(`加载失败：${e.message || e}`);
      } finally {
        setBusy("");
      }
      return;
    }

    setBusy(`正在造数（今${form.todayCount}/昨${form.yesterdayCount}）…`);
    try {
      const r = await api("/api/ai-assist-verify/seed", {
        method: "POST",
        body: JSON.stringify({
          l3User: form.l3User,
          l3Pass: form.l3Pass,
          sourceDb: form.sourceDb || "lx",
          promoteId: form.promoteId || undefined,
          sdkBusinessAccount: form.sdkBusinessAccount,
          projectId: projectContext?.projectId || "proj_xinshangwu",
          projectName: projectContext?.projectName || "新商务",
          todayCount: Number(form.todayCount) || 10,
          yesterdayCount: Number(form.yesterdayCount) || 20,
        }),
      });
      if (r?.dossier) setDossier(r.dossier);
      if (r?.dbStats) setDbStats(r.dbStats);
      else if (r?.run?.dbStats) setDbStats({ ok: true, metrics: r.run.dbStats });
      setMsg(r?.ok ? "造数完成，请对照三栏验库。" : r?.error || "造数失败");
      await loadState();
      onRefreshParent?.();
      setStep(2);
    } catch (e) {
      setMsg(`造数异常：${e.message || e}`);
    } finally {
      setBusy("");
    }
  }, [seedMode, form, projectContext, loadState, runDbStats, onRefreshParent]);

  const runCompareOnce = useCallback(async () => {
    const r = await api("/api/ai-assist-verify/compare", {
      method: "POST",
      body: JSON.stringify({
        l3User: form.l3User,
        l3Pass: form.l3Pass,
        baseUrl: form.baseUrl,
        sourceDb: form.sourceDb || "lx",
        promoteId: form.promoteId || undefined,
        sdkBusinessAccount: form.sdkBusinessAccount,
        projectId: projectContext?.projectId || "proj_xinshangwu",
        projectName: projectContext?.projectName || "新商务",
        headed: false,
      }),
    });
    if (r?.dbStats) setDbStats(r.dbStats);
    if (r?.rows) setCompareRows(r.rows);
    setLastCompare({
      ok: r?.ok,
      rows: r?.rows || [],
      pageMetrics: r?.run?.pageMetrics || r?.scrape?.page?.metrics || {},
      scrape: r?.scrape,
      run: r?.run,
      note: r?.run?.note,
    });
    return r;
  }, [form, projectContext]);

  const runCompareWithRetry = useCallback(async () => {
    setBusy("抓取工作台并比对…");
    setMsg("");
    setStep(3);
    try {
      const waits = Math.max(0, Number(waitSec) || 0);
      const retries = Math.max(0, Number(retryN) || 0);
      if (waits > 0) {
        setBusy(`比对前等待 ${waits}s（同步窗口）…`);
        await sleep(waits * 1000);
      }

      let last = null;
      for (let i = 0; i <= retries; i += 1) {
        setBusy(i === 0 ? "抓取工作台指标…" : `第 ${i + 1} 次重试抓取…`);
        last = await runCompareOnce();
        const pageToday = last?.run?.pageMetrics?.todayReg ?? last?.scrape?.page?.metrics?.todayReg;
        const dbToday = last?.dbStats?.metrics?.todayReg ?? dbMetrics.todayReg;
        const synced = pageToday != null && Number(pageToday) === 0 && Number(dbToday) > 0;
        if (!synced) break;
        if (i < retries) {
          setBusy(`页仍为 0，${waits || 5}s 后重试（${i + 1}/${retries}）…`);
          await sleep((waits || 5) * 1000);
        }
      }

      const pack = {
        createdAt: new Date().toISOString(),
        projectId: projectContext?.projectId || "proj_xinshangwu",
        caliber: {
          includeSubordinates: form.includeSubordinates,
          timezoneNote: form.timezoneNote,
          regTable: form.regTable,
          momFormula: form.momFormula,
          promoteId: form.promoteId,
          sdkBusinessAccount: form.sdkBusinessAccount,
        },
        expected,
        dbMetrics: last?.dbStats?.metrics || dbMetrics,
        pageMetrics: last?.run?.pageMetrics || {},
        rows: last?.rows || [],
        seedMode,
        layers,
        dossierBrief: {
          todayAccounts: dossier?.todayAccounts || [],
          yesterdayAccounts: dossier?.yesterdayAccounts || [],
          hasFullStrategy: Boolean(dossier?.fullStrategy),
          topN: (dossier?.fullStrategy?.top10 || []).length,
        },
        compareNote: last?.run?.note,
        scrapeOk: last?.scrape?.ok ?? last?.run?.scrapeOk,
      };
      setEvidence(pack);
      setMsg(last?.ok ? "对验通过" : last?.run?.note || last?.error || "对验未通过，见三栏结论");
    } catch (e) {
      setMsg(`比对异常：${e.message || e}`);
    } finally {
      setBusy("");
    }
  }, [
    waitSec,
    retryN,
    runCompareOnce,
    dbMetrics,
    projectContext,
    form,
    expected,
    seedMode,
    layers,
    dossier,
  ]);

  const exportEvidence = useCallback(() => {
    const pack =
      evidence || {
        createdAt: new Date().toISOString(),
        expected,
        dbMetrics,
        triRows,
        form: {
          l3User: form.l3User,
          promoteId: form.promoteId,
          includeSubordinates: form.includeSubordinates,
        },
        note: "尚未完成抓页比对，导出当前口径与库侧快照",
      };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `data_verify_evidence_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("已导出证据包 JSON");
  }, [evidence, expected, dbMetrics, triRows, form]);

  const summaryMeta = VERDICT[coreVerdictSummary] || VERDICT.pending;

  return (
    <div className="dv-opt">
      <header className="dv-opt-head">
        <div>
          <h3>数据验证 · 优化版</h3>
          <p className="hint">
            绑定：{projectContext?.projectName || projectContext?.projectId || "新商务"} ·
            向导：口径 → 造数验库 → 抓页比对（旧 tab 保留不动）
          </p>
        </div>
        <div className={"dv-opt-badge " + summaryMeta.cls}>{summaryMeta.label}</div>
      </header>

      <nav className="dv-opt-steps" aria-label="验证步骤">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={
              "dv-opt-step" +
              (step === s.id ? " is-active" : "") +
              (step > s.id ? " is-done" : "")
            }
            onClick={() => setStep(s.id)}
          >
            <span className="dv-opt-step-num">{s.id}</span>
            {s.title}
          </button>
        ))}
      </nav>

      {msg ? <div className="dv-opt-msg">{msg}</div> : null}
      {busy ? <div className="dv-opt-busy">{busy}</div> : null}

      {step === 1 ? (
        <section className="dv-opt-card">
          <h4>① 锁定口径与期望</h4>
          <div className="dv-opt-caliber">
            <div className="dv-opt-caliber-item">
              <strong>统计表字段</strong>
              <span>{form.regTable}</span>
            </div>
            <div className="dv-opt-caliber-item">
              <strong>时区 / 日切</strong>
              <span>{form.timezoneNote}</span>
            </div>
            <div className="dv-opt-caliber-item">
              <strong>环比公式</strong>
              <span>{form.momFormula}</span>
            </div>
            <label className="dv-opt-check">
              <input
                type="checkbox"
                checked={form.includeSubordinates}
                onChange={(e) => patchForm({ includeSubordinates: e.target.checked })}
              />
              含下级渠道（promote_ids 合集；与 L3 工作台常见口径一致）
            </label>
          </div>

          <div className="dv-opt-form">
            <label>
              三级商务账号
              <input value={form.l3User} onChange={(e) => patchForm({ l3User: e.target.value })} />
            </label>
            <label>
              密码
              <input
                type="password"
                value={form.l3Pass}
                onChange={(e) => patchForm({ l3Pass: e.target.value })}
              />
            </label>
            <label>
              promoteId
              <input
                value={form.promoteId || ""}
                onChange={(e) => patchForm({ promoteId: e.target.value })}
                placeholder="一级会长渠道 id"
              />
            </label>
            <label>
              商户账号
              <input
                value={form.sdkBusinessAccount}
                onChange={(e) => patchForm({ sdkBusinessAccount: e.target.value })}
              />
            </label>
            <label>
              期望今日注册
              <input
                type="number"
                value={form.todayCount}
                onChange={(e) => patchForm({ todayCount: e.target.value })}
              />
            </label>
            <label>
              期望昨日注册
              <input
                type="number"
                value={form.yesterdayCount}
                onChange={(e) => patchForm({ yesterdayCount: e.target.value })}
              />
            </label>
            <label>
              期望环比 %
              <input
                type="number"
                value={form.expectedMomPercent}
                onChange={(e) => patchForm({ expectedMomPercent: e.target.value })}
              />
            </label>
            <label>
              平台
              <input value={form.platformLabel || "龙翔"} readOnly />
            </label>
          </div>

          <div className="dv-opt-layers">
            <span className="dv-opt-layers-label">分层验（默认仅主指标）</span>
            <label>
              <input type="checkbox" checked disabled /> 注册 + 环比
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.login}
                onChange={(e) => setLayers((p) => ({ ...p, login: e.target.checked }))}
              />{" "}
              登录
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.pay}
                onChange={(e) => setLayers((p) => ({ ...p, pay: e.target.checked }))}
              />{" "}
              充值
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.top}
                onChange={(e) => setLayers((p) => ({ ...p, top: e.target.checked }))}
              />{" "}
              TOP
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.sub}
                onChange={(e) => setLayers((p) => ({ ...p, sub: e.target.checked }))}
              />{" "}
              下级
            </label>
          </div>

          <div className="dv-opt-actions">
            <button type="button" className="btn" disabled={!!busy} onClick={() => onOpenBizFlow?.()}>
              打开渠道主流程
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() => setStep(2)}
            >
              下一步：造数并验库 →
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="dv-opt-card">
          <h4>② 造数并验库（库为基准）</h4>
          <div className="dv-opt-seed-modes">
            <label className={"dv-opt-mode" + (seedMode === "reg" ? " is-on" : "")}>
              <input
                type="radio"
                name="seedMode"
                checked={seedMode === "reg"}
                onChange={() => setSeedMode("reg")}
              />
              <div>
                <strong>仅注册</strong>
                <p className="hint">SDK 注册今/昨，期望 {form.todayCount}/{form.yesterdayCount}</p>
              </div>
            </label>
            <label className={"dv-opt-mode" + (seedMode === "full_existing" ? " is-on" : "")}>
              <input
                type="radio"
                name="seedMode"
                checked={seedMode === "full_existing"}
                onChange={() => setSeedMode("full_existing")}
              />
              <div>
                <strong>使用已有全量造数</strong>
                <p className="hint">读 _wb_seed_full_result（登录/充值/TOP/下级）</p>
              </div>
            </label>
          </div>

          <div className="dv-opt-actions">
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={runSeed}>
              {seedMode === "reg" ? "执行造数" : "加载全量清单并刷库"}
            </button>
            <button type="button" className="btn" disabled={!!busy} onClick={runDbStats}>
              仅刷新库统计
            </button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => setStep(1)}>
              ← 上一步
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() => setStep(3)}
            >
              库侧 OK，去抓页 →
            </button>
          </div>

          {(dossier?.todayAccounts || []).length ? (
            <p className="hint dv-opt-dossier-line">
              造数账号：今 {(dossier.todayAccounts || []).length} · 昨{" "}
              {(dossier.yesterdayAccounts || []).length}
              {dossier.fullStrategy ? " · 已挂全量策略" : ""}
              {dossier.presidentAccount ? ` · 会长 ${dossier.presidentAccount}` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="dv-opt-card">
          <h4>③ 抓页比对（可等待 / 重试）</h4>
          <div className="dv-opt-form dv-opt-form-compact">
            <label>
              比对前等待（秒）
              <input
                type="number"
                min={0}
                value={waitSec}
                onChange={(e) => setWaitSec(e.target.value)}
              />
            </label>
            <label>
              页仍为 0 时重试次数
              <input
                type="number"
                min={0}
                value={retryN}
                onChange={(e) => setRetryN(e.target.value)}
              />
            </label>
          </div>
          <div className="dv-opt-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy}
              onClick={runCompareWithRetry}
            >
              抓取工作台并比对
            </button>
            <button type="button" className="btn" disabled={!!busy} onClick={exportEvidence}>
              导出证据包
            </button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => setStep(2)}>
              ← 上一步
            </button>
          </div>
          {compareRows.length ? (
            <p className="hint">原始比对行 {compareRows.length} 条已写入证据包。</p>
          ) : null}
        </section>
      ) : null}

      <section className="dv-opt-card">
        <div className="dv-opt-tri-head">
          <h4>期望 · 库 · 页（三栏）</h4>
          <span className="hint">库为 Source of Truth；结论枚举便于提缺陷</span>
        </div>
        <div className="dv-table-wrap">
          <table className="dv-table dv-opt-tri">
            <thead>
              <tr>
                <th>指标</th>
                <th>期望</th>
                <th>库</th>
                <th>页</th>
                <th>结论</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {triRows.map((r) => {
                const meta = VERDICT[r.verdict] || VERDICT.pending;
                return (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td>{fmtVal(r.expected, r.isPercent)}</td>
                    <td>{fmtVal(r.db, r.isPercent)}</td>
                    <td>{fmtVal(r.page, r.isPercent)}</td>
                    <td>
                      <span className={"dv-opt-verdict " + meta.cls}>{meta.label}</span>
                    </td>
                    <td className="hint">{r.hint}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
