import { useRef } from "react";
import FrameworkScanPlayer, { FrameworkScanFallback } from "./FrameworkScanPlayer.jsx";
import FrameworkMindmap from "./FrameworkMindmap.jsx";
import TpTraceWorkbench from "./TpTraceWorkbench.jsx";
import { reviewNeedsRework } from "./reviewNeedsRework.js";

function protoChipLabel(item) {
  const label = String(item?.label || "").trim();
  const url = String(item?.url || "").trim();
  if (label && label !== url) return label.slice(0, 28);
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).slice(0, 28);
  } catch {
    return url.slice(0, 28);
  }
}

function protoUrlKey(raw) {
  const m = String(raw || "").match(/https?:\/\/[^\s)\]>'"]+/i);
  if (!m) return "";
  try {
    const u = new URL(m[0]);
    u.hash = "";
    return (u.origin + u.pathname + u.search).replace(/\/+$/, "");
  } catch {
    return m[0].replace(/[),.;]+$/, "");
  }
}

/**
 * 测试点生成 · 改版布局（暖色 embed）
 */
export default function TpEmbedWorkbench({
  busy,
  qaBusyMode,
  tpNextStep,
  tpStepDone,
  tpDoneCount,
  runTpStep,
  setTpPreviewTab,
  tpPreviewTab,
  qaMaterial,
  setQaMaterial,
  tpDualMode = false,
  tpLinkMode = "off",
  cycleTpLinkMode,
  setTpDualMode,
  qaFrontUrl = "",
  setQaFrontUrl,
  qaBackUrl = "",
  setQaBackUrl,
  qaDualNotes = "",
  setQaDualNotes,
  qaProtoLabelA = "",
  qaProtoLabelB = "",
  decodeUrlsInText,
  onPasteImages,
  qaImageItems,
  setQaImageItems,
  qaGenPwSpec,
  setQaGenPwSpec,
  onOpenSkill,
  onOpenAssets,
  onOpenConfig,
  onOpenDataVerify,
  onClearWorkspace,
  canRunQa,
  runTpNext,
  canSaveTpRecord,
  saveTpRecord,
  downloadMarkdown,
  downloadXmind,
  downloadZentaoCsv = () => {},
  importProductCases = () => {},
  importProductBugsFromXmind = () => {},
  buildXmindFilename,
  tpProjectName,
  cleanGeneratedMd,
  qaFrameworkPreview,
  qaBizPreview,
  qaMdPreview,
  qaSpecialPreview = "",
  qaReviewPreview = "",
  onRunReview,
  onRunAutoPipeline,
  onAbortAutoPipeline,
  qaReviewHistory = [],
  tpAutoPipe = null,
  onDismissAutoPipe,
  tpZentaoPipe = null,
  onDismissZentaoPipe,
  tpProductPipe = null,
  onDismissProductPipe,
  onLoadReviewHistory,
  qaPwSpecPreview,
  qaPwTestBaseUrl = "",
  setQaPwTestBaseUrl,
  qaFrameworkView,
  setQaFrameworkView,
  tpRecords,
  recordTheme = (rec) => rec?.title || "测试点",
  tpActiveRecordId,
  loadTpRecord,
  deleteTpRecord,
  projectLabel = "",
  projectId = "",
  ganttPrototypes = [],
  onPickPrototype,
  prevTpRecord = null,
  tpDiff = null,
  tpDiffOpen = false,
  onToggleDiff,
  tpScanStory,
  tpScanFallbackSteps,
  tpScanning,
  onScanDone,
  onOpenPlaywrightUi,
  openPwBusy,
  onOpenPwDebug,
  apiUrl,
}) {
  const steps = [
    { n: 1, t: "页面框架", d: "梳理模块", mode: "framework", tab: "framework", ico: "框" },
    { n: 2, t: "业务场景", d: "门禁+场景", mode: "biz", tab: "biz", ico: "景" },
    { n: 3, t: "页面功能", d: "行为+优先级", mode: "testpoints", tab: "func", ico: "功" },
    { n: 4, t: "专项测试", d: "权限/并发/弱网/安全", mode: "special", tab: "special", ico: "专" },
  ];
  const currentProtoKey = protoUrlKey(qaMaterial);
  const autoPipeBusy = !!(tpAutoPipe && tpAutoPipe.active);
  const frontFileRef = useRef(null);
  const backFileRef = useRef(null);
  const singleFileRef = useRef(null);

  const importProtoLocal = async (file, role) => {
    if (!file || typeof apiUrl !== "function") return;
    const name = String(file.name || "proto.html");
    if (!/\.html?$/i.test(name) && !/html/i.test(file.type || "")) {
      window.alert("请选择 .html 原型原文件");
      return;
    }
    try {
      const html = await file.text();
      const res = await fetch(apiUrl("/api/qa/proto-local"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, name, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        window.alert(data.error || "导入失败");
        return;
      }
      const openUrl = String(data.openUrl || "").trim();
      if (!openUrl) {
        window.alert("导入成功但未返回可打开地址");
        return;
      }
      if (role === "back") setQaBackUrl?.(openUrl);
      else if (role === "front") setQaFrontUrl?.(openUrl);
      else setQaMaterial?.(openUrl);

      const tips = [];
      if (data.hasPageProto) {
        tips.push(`已识别 ${data.routes?.length || 0} 个 PAGE_PROTO 路由（利于三栏联动）`);
      }
      if (data.hasProtoPanel) tips.push("含 #protoPanel 原型说明面板");
      if (tips.length) {
        window.alert(`已导入本地原文件并填入链接。\n${tips.join("\n")}\n\n${openUrl}`);
      }
    } catch (e) {
      window.alert(String(e?.message || e));
    }
  };

  const tabStep =
    tpPreviewTab === "framework"
      ? 1
      : tpPreviewTab === "biz"
        ? 2
        : tpPreviewTab === "func"
          ? 3
          : tpPreviewTab === "special"
            ? 4
            : tpPreviewTab === "review"
              ? 3
              : null;
  const canRegenCurrent =
    tabStep != null &&
    !!tpStepDone[tabStep] &&
    (tabStep === 1 || !!tpStepDone[tabStep - 1]);
  const hasReview = !!String(qaReviewPreview || "").trim();
  const regenLabel =
    tabStep === 1
      ? hasReview
        ? "按评审重生成①"
        : "重新生成①框架"
      : tabStep === 2
        ? hasReview
          ? "按评审重生成②"
          : "重新生成②场景"
        : tabStep === 3
          ? hasReview
            ? "按评审重生成③"
            : "重新生成③功能"
          : tabStep === 4
            ? hasReview
              ? "按评审重生成④"
              : "重新生成④专项"
            : "重新生成本步";
  const canReview =
    (!!String(qaFrameworkPreview || "").trim() ||
      !!String(qaBizPreview || "").trim() ||
      !!String(qaMdPreview || "").trim() ||
      !!String(qaSpecialPreview || "").trim()) &&
    typeof onRunReview === "function";
  const canAutoPipe =
    canRunQa && typeof onRunAutoPipeline === "function" && !busy && !tpScanning && !autoPipeBusy;
  const canDownloadDevMd =
    !!String(qaBizPreview || "").trim() || !!String(qaMdPreview || "").trim();

  const downloadDevSelfTestMd = () => {
    const biz = cleanGeneratedMd(qaBizPreview || "").trim();
    const func = cleanGeneratedMd(qaMdPreview || "").trim();
    if (!biz && !func) {
      window.alert("请先生成业务场景或页面功能测试点");
      return;
    }
    const project = String(tpProjectName || "项目").trim() || "项目";
    const lines = [
      `# ${project} · 开发自测清单`,
      "",
      "> 用途：开发自测。业务场景看「条件 → 结果」；页面功能看界面操作与可观察反馈。",
      "",
      `> 导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      "",
    ];
    lines.push("## 一、业务场景测试点", "");
    lines.push(biz || "（尚未生成）", "");
    lines.push("## 二、页面功能测试点", "");
    lines.push(func || "（尚未生成）", "");
    const filename = buildXmindFilename(project, "开发自测").replace(
      /\.xmind$/i,
      ".md"
    );
    downloadMarkdown(filename, lines.join("\n"));
  };

  return (
    <div className="tp-v2">
      {tpAutoPipe ? (
        <div
          className={
            "tp-autopipe-overlay" + (tpAutoPipe.active ? " is-active" : " is-done")
          }
          role="status"
          aria-live="polite"
        >
          <div className="tp-autopipe-card">
            <div className="tp-autopipe-head">
              <strong>一键生成进度</strong>
              <span className="tp-autopipe-pct">
                {Math.max(0, Math.min(100, Number(tpAutoPipe.percent) || 0))}%
              </span>
            </div>
            <div className="tp-autopipe-bar" aria-hidden="true">
              <div
                className="tp-autopipe-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, Number(tpAutoPipe.percent) || 0))}%`,
                }}
              />
            </div>
            <p className="tp-autopipe-label">
              {tpAutoPipe.active ? (
                <span className="tp-autopipe-spin" aria-hidden="true" />
              ) : null}
              {tpAutoPipe.label || "处理中…"}
            </p>
            {tpAutoPipe.note ? (
              <p className="tp-autopipe-note">{tpAutoPipe.note}</p>
            ) : null}
            {tpAutoPipe.error ? (
              <p className="tp-autopipe-err">{tpAutoPipe.error}</p>
            ) : null}
            <ul className="tp-autopipe-steps">
              {(tpAutoPipe.steps || []).map((s) => (
                <li
                  key={s.id}
                  className={
                    "tp-autopipe-step is-" + (s.status || "pending")
                  }
                >
                  <span className="tp-autopipe-dot" />
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
            <div className="tp-autopipe-actions">
              {tpAutoPipe.active && !tpAutoPipe.error ? (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => onAbortAutoPipeline?.()}
                >
                  取消
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => onDismissAutoPipe?.()}
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tpZentaoPipe ? (
        <div
          className={
            "tp-autopipe-overlay" +
            (tpZentaoPipe.active ? " is-active" : " is-done")
          }
          role="status"
          aria-live="polite"
        >
          <div className="tp-autopipe-card">
            <div className="tp-autopipe-head">
              <strong>禅道导入进度</strong>
              <span className="tp-autopipe-pct">
                {Math.max(0, Math.min(100, Number(tpZentaoPipe.percent) || 0))}%
              </span>
            </div>
            <div className="tp-autopipe-bar" aria-hidden="true">
              <div
                className="tp-autopipe-bar-fill"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Number(tpZentaoPipe.percent) || 0)
                  )}%`,
                }}
              />
            </div>
            <p className="tp-autopipe-label">
              {tpZentaoPipe.active ? (
                <span className="tp-autopipe-spin" aria-hidden="true" />
              ) : null}
              {tpZentaoPipe.label || "处理中…"}
            </p>
            {tpZentaoPipe.error ? (
              <p className="tp-autopipe-err">{tpZentaoPipe.error}</p>
            ) : null}
            {!tpZentaoPipe.active &&
            !tpZentaoPipe.error &&
            tpZentaoPipe.caseCount > 0 ? (
              <p className="tp-autopipe-note">
                已确认写入 {tpZentaoPipe.caseCount} 条
                {tpZentaoPipe.builtCaseCount &&
                tpZentaoPipe.builtCaseCount !== tpZentaoPipe.caseCount
                  ? `（本地生成 ${tpZentaoPipe.builtCaseCount} 条）`
                  : ""}
              </p>
            ) : null}
            {tpZentaoPipe.browseUrl ? (
              <p className="tp-zentao-link-wrap">
                <a
                  className="tp-zentao-link"
                  href={tpZentaoPipe.browseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开禅道用例列表 →
                </a>
              </p>
            ) : null}
            <div className="tp-autopipe-actions">
              {!tpZentaoPipe.active ? (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => onDismissZentaoPipe?.()}
                >
                  关闭
                </button>
              ) : (
                <span className="hint">导入中请勿关闭页面…</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tpProductPipe ? (
        <div
          className={
            "tp-autopipe-overlay" +
            (tpProductPipe.active ? " is-active" : " is-done")
          }
          role="status"
          aria-live="polite"
        >
          <div className="tp-autopipe-card">
            <div className="tp-autopipe-head">
              <strong>
                {tpProductPipe.kind === "bugs"
                  ? "产品系统 · Bug 导入"
                  : "产品系统 · 用例导入"}
              </strong>
              <span className="tp-autopipe-pct">
                {Math.max(0, Math.min(100, Number(tpProductPipe.percent) || 0))}%
              </span>
            </div>
            <div className="tp-autopipe-bar" aria-hidden="true">
              <div
                className="tp-autopipe-bar-fill"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Number(tpProductPipe.percent) || 0)
                  )}%`,
                }}
              />
            </div>
            <p className="tp-autopipe-label">
              {tpProductPipe.active ? (
                <span className="tp-autopipe-spin" aria-hidden="true" />
              ) : null}
              {tpProductPipe.label || "处理中…"}
            </p>
            {tpProductPipe.error ? (
              <p className="tp-autopipe-err">{tpProductPipe.error}</p>
            ) : null}
            {!tpProductPipe.active &&
            !tpProductPipe.error &&
            (tpProductPipe.caseCount > 0 || tpProductPipe.bugCount > 0) ? (
              <p className="tp-autopipe-note">
                {tpProductPipe.kind === "bugs"
                  ? `新建 ${tpProductPipe.bugCount} 条 Bug`
                  : `新建 ${tpProductPipe.caseCount} 条用例`}
                {tpProductPipe.withScreenshot
                  ? ` · 含截图 ${tpProductPipe.withScreenshot}`
                  : ""}
              </p>
            ) : null}
            {tpProductPipe.browseUrl ? (
              <p className="tp-zentao-link-wrap">
                <a
                  className="tp-zentao-link"
                  href={tpProductPipe.browseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开产品系统 →
                </a>
              </p>
            ) : null}
            <div className="tp-autopipe-actions">
              {!tpProductPipe.active ? (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => onDismissProductPipe?.()}
                >
                  关闭
                </button>
              ) : (
                <span className="hint">导入中请勿关闭页面…</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <aside className="tp-v2-side">
        {projectLabel ? (
          <div className="tp-v2-project-badge" title={projectLabel}>
            <span className="tp-v2-project-k">当前项目</span>
            <strong>{projectLabel}</strong>
          </div>
        ) : null}

        <section className="tp-v2-panel" aria-label="生成流水线">
          <div className="tp-v2-panel-head">
            <strong>生成流水线</strong>
            <span className="hint">{tpDoneCount}/3</span>
          </div>
          <div className="tp-steps tp-v2-steps">
            {steps.map((s) => {
              const done = tpStepDone[s.n];
              const locked = s.n > 1 && !tpStepDone[s.n - 1];
              const isNext = tpNextStep === s.n;
              const isBusy = busy && qaBusyMode === s.mode;
              return (
                <button
                  key={s.n}
                  type="button"
                  className={
                    "tp-step" +
                    (done ? " is-done" : "") +
                    (isNext && !busy ? " is-next" : "") +
                    (locked ? " is-locked" : "") +
                    (isBusy ? " is-busy" : "")
                  }
                  disabled={busy || autoPipeBusy || (locked && !done)}
                  onClick={() => {
                    if (done) setTpPreviewTab(s.tab);
                    else if (!locked) runTpStep(s.n);
                    else alert(`请先完成第 ${s.n - 1} 步`);
                  }}
                >
                  <span className="tp-step-n">{done ? "✓" : s.n}</span>
                  <span className="tp-step-t">{s.t}</span>
                  <span className="tp-step-d">{done ? "已完成 · 可点下方重生成" : s.d}</span>
                </button>
              );
            })}
          </div>
          {typeof onRunAutoPipeline === "function" ? (
            <button
              type="button"
              className="btn btn-primary tp-autopipe-btn"
              disabled={!canAutoPipe}
              title="一次跑完：①框架→②场景→③功能→评审→（需返工则修订后再复审）"
              onClick={() => onRunAutoPipeline()}
            >
              {autoPipeBusy ? "一键生成中…" : "一键生成（含评审）"}
            </button>
          ) : null}
        </section>

        <section className="tp-v2-panel tp-v2-records" aria-label="已保存测试点">
          <div className="tp-v2-panel-head">
            <strong>已保存的测试点</strong>
            <span className="hint">{tpRecords.length}</span>
          </div>
          {tpRecords.length === 0 ? (
            <p className="hint">暂无记录</p>
          ) : (
            <ul className="tp-records-list">
              {tpRecords.map((rec) => (
                <li key={rec.id}>
                  <button
                    type="button"
                    className={
                      "tp-record-item" + (tpActiveRecordId === rec.id ? " active" : "")
                    }
                    onClick={() => loadTpRecord(rec)}
                  >
                    <span className="tp-record-main">
                      <span className="tp-record-title">{recordTheme(rec)}</span>
                      <span className="tp-record-meta">
                        {[rec.projectName, rec.createdAt].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tp-record-del"
                    onClick={() => deleteTpRecord(rec.id)}
                    aria-label="删除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="tp-v2-main">
        <header className="tp-v2-top">
          <div className="tp-v2-material">
            <div className="tp-v2-material-head">
              <div className="tp-v2-material-title">
                <h3>原型图 / 说明</h3>
                <span className="hint">
                  {tpLinkMode === "dual"
                    ? "前台+后台双链接；业务场景会写跨端闭环"
                    : tpLinkMode === "multi"
                      ? "多原型独立（如商务 v2 + OA 页）；不写前后台跨端闭环；可写【本版范围】仅 V2"
                      : "URL / 文字；截图 Ctrl+V"}
                </span>
              </div>
              <div className="tp-v2-top-actions">
                <button
                  type="button"
                  className={
                    "btn btn-small" +
                    (tpLinkMode === "dual" || tpLinkMode === "multi" ? " btn-primary" : "")
                  }
                  disabled={busy || tpScanning || autoPipeBusy}
                  title="点击切换：单链 → 前后台双原型 → 多原型独立 → 单链。商务 v2 + OA 换绑请用「多原型」"
                  onClick={() => {
                    if (typeof cycleTpLinkMode === "function") cycleTpLinkMode();
                    else setTpDualMode?.(!tpDualMode);
                  }}
                >
                  {tpLinkMode === "dual"
                    ? "前后台✓"
                    : tpLinkMode === "multi"
                      ? "多原型✓"
                      : "双链模式"}
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || tpScanning || autoPipeBusy}
                  title="清空当前输入、截图与已生成内容（含本地草稿），不影响已保存列表"
                  onClick={onClearWorkspace}
                >
                  清空
                </button>
                <button type="button" className="btn btn-small" onClick={onOpenSkill}>
                  Skill
                </button>
                <button type="button" className="btn btn-small" onClick={onOpenAssets}>
                  资产
                </button>
                <button type="button" className="btn btn-small" onClick={onOpenConfig}>
                  模型
                </button>
                {typeof onOpenDataVerify === "function" ? (
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    title="打开数据验证（带上当前原型链接/截图）"
                    onClick={onOpenDataVerify}
                  >
                    数据验证
                  </button>
                ) : null}
              </div>
            </div>
            {projectLabel || ganttPrototypes.length ? (
              <div className="tp-v2-proto-row">
                <span className="tp-v2-proto-k">排期原型</span>
                {ganttPrototypes.length ? (
                  <div className="tp-v2-proto-chips">
                    {ganttPrototypes.map((item) => {
                      const key = protoUrlKey(item.url);
                      const active =
                        tpLinkMode === "dual" || tpLinkMode === "multi"
                          ? key &&
                            (key === protoUrlKey(qaFrontUrl) || key === protoUrlKey(qaBackUrl))
                          : currentProtoKey && key === currentProtoKey;
                      return (
                        <button
                          key={item.url}
                          type="button"
                          className={"tp-v2-proto-chip" + (active ? " is-on" : "")}
                          title={(item.ganttName ? item.ganttName + "\n" : "") + item.url}
                          onClick={() => onPickPrototype?.(item)}
                        >
                          {protoChipLabel(item)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="hint">关联排期里还没有已保存的原型链接</span>
                )}
              </div>
            ) : null}
            {tpDualMode ? (
              <div className="tp-dual-fields">
                <label className="tp-dual-field">
                  <span className="tp-dual-k">
                    {tpLinkMode === "multi"
                      ? qaProtoLabelA
                        ? `A·${String(qaProtoLabelA).slice(0, 10)}`
                        : "原型A"
                      : "前台"}
                  </span>
                  <div className="tp-dual-url-row">
                    <input
                      type="url"
                      className="tp-dual-input"
                      placeholder={
                        tpLinkMode === "multi"
                          ? "系统一链接（如 v2 近期改版），或右侧导入 .html"
                          : "前台链接，或右侧导入 .html 原文件"
                      }
                      value={qaFrontUrl}
                      disabled={busy || tpScanning || autoPipeBusy}
                      onChange={(e) => setQaFrontUrl?.(decodeUrlsInText(e.target.value))}
                      onPaste={(e) => {
                        const clip = e.clipboardData?.getData("text");
                        if (!clip) return;
                        e.preventDefault();
                        setQaFrontUrl?.(decodeUrlsInText(clip.trim()));
                      }}
                    />
                    <input
                      ref={frontFileRef}
                      type="file"
                      accept=".html,.htm,text/html"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) importProtoLocal(f, "front");
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || tpScanning || autoPipeBusy}
                      title="导入 HTML 原文件（比 xm 预览更利于三栏联动）"
                      onClick={() => frontFileRef.current?.click()}
                    >
                      原文件
                    </button>
                  </div>
                </label>
                <label className="tp-dual-field">
                  <span className="tp-dual-k">
                    {tpLinkMode === "multi"
                      ? qaProtoLabelB
                        ? `B·${String(qaProtoLabelB).slice(0, 10)}`
                        : "原型B"
                      : "后台"}
                  </span>
                  <div className="tp-dual-url-row">
                    <input
                      type="url"
                      className="tp-dual-input"
                      placeholder={
                        tpLinkMode === "multi"
                          ? "系统二链接（如 OA 渠道换绑），或右侧导入 .html"
                          : "后台链接，或右侧导入 .html 原文件"
                      }
                      value={qaBackUrl}
                      disabled={busy || tpScanning || autoPipeBusy}
                      onChange={(e) => setQaBackUrl?.(decodeUrlsInText(e.target.value))}
                      onPaste={(e) => {
                        const clip = e.clipboardData?.getData("text");
                        if (!clip) return;
                        e.preventDefault();
                        setQaBackUrl?.(decodeUrlsInText(clip.trim()));
                      }}
                    />
                    <input
                      ref={backFileRef}
                      type="file"
                      accept=".html,.htm,text/html"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) importProtoLocal(f, "back");
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || tpScanning || autoPipeBusy}
                      title="导入 HTML 原文件"
                      onClick={() => backFileRef.current?.click()}
                    >
                      原文件
                    </button>
                  </div>
                </label>
                <textarea
                  className="req-textarea tp-v2-material-ta tp-dual-notes"
                  rows={2}
                  placeholder={
                    tpLinkMode === "multi"
                      ? "建议保留【本版范围】仅 V2…；两系统关系说明（可选）"
                      : "补充说明 / 可贴需求分析.md 要点（可选）…"
                  }
                  value={qaDualNotes}
                  onChange={(e) => setQaDualNotes?.(e.target.value)}
                  onPaste={(e) => {
                    const files = [...(e.clipboardData?.items || [])]
                      .filter((it) => it.type.startsWith("image/"))
                      .map((it) => it.getAsFile())
                      .filter(Boolean);
                    if (files.length) {
                      e.preventDefault();
                      onPasteImages(files);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="tp-dual-url-row tp-single-material">
                <textarea
                  className="req-textarea tp-v2-material-ta"
                  rows={2}
                  placeholder="粘贴原型链接或说明…（也可右侧导入 .html 原文件）"
                  value={qaMaterial}
                  onChange={(e) => setQaMaterial(e.target.value)}
                  onPaste={(e) => {
                    const files = [...(e.clipboardData?.items || [])]
                      .filter((it) => it.type.startsWith("image/"))
                      .map((it) => it.getAsFile())
                      .filter(Boolean);
                    if (files.length) {
                      e.preventDefault();
                      onPasteImages(files);
                      return;
                    }
                    const clip = e.clipboardData?.getData("text");
                    if (!clip || !/%[0-9A-Fa-f]{2}/.test(clip)) return;
                    e.preventDefault();
                    const ta = e.currentTarget;
                    const start = ta.selectionStart ?? qaMaterial.length;
                    const end = ta.selectionEnd ?? qaMaterial.length;
                    setQaMaterial(
                      qaMaterial.slice(0, start) +
                        decodeUrlsInText(clip) +
                        qaMaterial.slice(end)
                    );
                  }}
                />
                <input
                  ref={singleFileRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) importProtoLocal(f, "front");
                  }}
                />
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || tpScanning || autoPipeBusy}
                  title="导入本地 .html 原型原文件"
                  onClick={() => singleFileRef.current?.click()}
                >
                  原文件
                </button>
              </div>
            )}
            {qaImageItems.length > 0 ? (
              <ul className="thumb-strip tp-v2-thumbs">
                {qaImageItems.map((item, idx) => (
                  <li key={item.name + idx} className="thumb-strip-item">
                    <img src={item.dataUrl} alt={item.name} />
                    <button
                      type="button"
                      className="thumb-remove"
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
            {(qaGenPwSpec || String(qaPwTestBaseUrl || "").trim()) ? (
              <p className="tp-pw-debug-badge hint">
                {qaGenPwSpec ? "已勾选生成 PW" : ""}
                {qaGenPwSpec && String(qaPwTestBaseUrl || "").trim() ? " · " : ""}
                {String(qaPwTestBaseUrl || "").trim()
                  ? `测试环境已填`
                  : ""}
                {" · 点 PW 页「调试 pw」可改"}
              </p>
            ) : null}
            {prevTpRecord ? (
              <div className="tp-v2-diffbar">
                <button
                  type="button"
                  className={"btn btn-small" + (tpDiffOpen ? " btn-primary" : "")}
                  onClick={onToggleDiff}
                >
                  {tpDiffOpen ? "收起对比" : "对比上版"}
                </button>
                <span className="hint">
                  同原型「{recordTheme(prevTpRecord)}」
                  {prevTpRecord.createdAt ? ` · ${prevTpRecord.createdAt}` : ""}
                  {tpDiff?.hasCurrent
                    ? ` · +${tpDiff.added} / −${tpDiff.removed}`
                    : " · 生成本次后可看差异"}
                </span>
              </div>
            ) : null}
            {tpDiffOpen && tpDiff ? (
              <div className="tp-v2-diff" aria-label="与上版测试点差异">
                {!tpDiff.hasCurrent ? (
                  <p className="hint">先生成本次测试点，再对比同原型上版差异。</p>
                ) : (
                  tpDiff.parts.map((p) => (
                    <section key={p.key} className="tp-v2-diff-sec">
                      <strong>
                        {p.label}
                        <span className="hint">
                          {" "}
                          +{p.added.length} / −{p.removed.length}
                        </span>
                      </strong>
                      {p.added.length === 0 && p.removed.length === 0 ? (
                        <p className="hint">无差异</p>
                      ) : (
                        <ul>
                          {p.removed.slice(0, 8).map((line, i) => (
                            <li key={"r" + i} className="is-del">
                              − {line}
                            </li>
                          ))}
                          {p.added.slice(0, 8).map((line, i) => (
                            <li key={"a" + i} className="is-add">
                              + {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </header>

        <section className="tp-v2-preview" aria-label="预览主区">
          <div className="tp-tabs" role="tablist">
            {[
              { id: "framework", label: "框架", done: tpStepDone[1] },
              { id: "biz", label: "场景", done: tpStepDone[2] },
              { id: "func", label: "功能", done: tpStepDone[3] },
              { id: "special", label: "专项", done: tpStepDone[4] },
              { id: "review", label: "评审", done: hasReview },
              {
                id: "trace",
                label: "溯源",
                done: !!(
                  qaMdPreview?.trim() ||
                  qaFrameworkPreview?.trim()
                ),
              },
              { id: "pw", label: "PW", done: !!qaPwSpecPreview?.trim() },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={
                  "tp-tab" +
                  (tpPreviewTab === t.id ? " is-on" : "") +
                  (t.done ? " is-done" : "")
                }
                onClick={() => setTpPreviewTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tp-v2-preview-body">
            {tpScanning && tpScanStory ? (
              <FrameworkScanPlayer
                screenshot={tpScanStory.screenshot}
                regions={tpScanStory.regions}
                viewport={tpScanStory.viewport}
                onDone={onScanDone}
              />
            ) : null}
            {tpScanning && !tpScanStory && tpScanFallbackSteps ? (
              <FrameworkScanFallback steps={tpScanFallbackSteps} onDone={onScanDone} />
            ) : null}
            {/* 抓取原型阶段：尚未收到扫描数据，先在预览区占位，避免旧浮层盖住右侧 */}
            {!tpScanning &&
            busy &&
            qaBusyMode === "framework" &&
            !qaFrameworkPreview.trim() ? (
              <div className="tp-scan-wait" aria-live="polite">
                <div className="tp-scan-wait-orb" />
                <p>正在打开原型并准备结构扫描动画…</p>
                <p className="hint">登录后首页侧栏识别完成后，会在此播放激光扫描</p>
              </div>
            ) : null}
            {!tpScanning &&
            busy &&
            qaBusyMode &&
            qaBusyMode !== "framework" &&
            !(
              (qaBusyMode === "biz" && qaBizPreview.trim()) ||
              (qaBusyMode === "testpoints" && qaMdPreview.trim()) ||
              (qaBusyMode === "review" && qaReviewPreview.trim())
            ) ? (
              <div className="tp-scan-wait" aria-live="polite">
                <div className="tp-scan-wait-orb" />
                <p>
                  {qaBusyMode === "biz"
                    ? "正在生成业务场景…"
                    : qaBusyMode === "review"
                      ? "正在对照原型评审①②③…"
                      : "正在生成页面功能测试点…"}
                </p>
              </div>
            ) : null}
            {/* 扫描结束后模型仍在写：预览区轻提示，不挡脑图/已有内容 */}
            {!tpScanning &&
            busy &&
            qaBusyMode === "framework" &&
            qaFrameworkPreview.trim() ? (
              <div className="tp-inline-gen-chip" aria-live="polite">
                <span className="tp-breath" />
                扫描完成，正在生成页面框架…
              </div>
            ) : null}

            {!tpScanning &&
            tpPreviewTab === "framework" &&
            !(busy && qaBusyMode === "framework" && !qaFrameworkPreview.trim()) ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">项目页面框架</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaFrameworkPreview.trim()}
                      onClick={() =>
                        setQaFrameworkView((v) => (v === "mindmap" ? "text" : "mindmap"))
                      }
                    >
                      {qaFrameworkView === "mindmap" ? "纯文本" : "脑图"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaFrameworkPreview.trim()}
                      onClick={() =>
                        downloadXmind(
                          cleanGeneratedMd(qaFrameworkPreview),
                          buildXmindFilename(tpProjectName, "页面框架"),
                          `${tpProjectName} · 页面框架`
                        )
                      }
                    >
                      .xmind
                    </button>
                  </div>
                </div>
                <div className={"tp-pv-body" + (qaFrameworkPreview.trim() ? " has-content" : "")}>
                  {qaFrameworkPreview.trim() ? (
                    qaFrameworkView === "mindmap" ? (
                      <FrameworkMindmap markdown={qaFrameworkPreview} />
                    ) : (
                      <pre className="md-preview">{qaFrameworkPreview}</pre>
                    )
                  ) : (
                    <div className="tp-pv-empty">点「① 生成页面框架」开始</div>
                  )}
                </div>
              </div>
            ) : null}

            {!tpScanning &&
            tpPreviewTab === "biz" &&
            !(busy && qaBusyMode === "biz" && !qaBizPreview.trim()) ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">业务场景测试点</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaBizPreview.trim()}
                      onClick={() =>
                        downloadXmind(
                          cleanGeneratedMd(qaBizPreview),
                          buildXmindFilename(tpProjectName, "业务场景"),
                          `${tpProjectName} · 业务场景`
                        )
                      }
                    >
                      下载 .xmind
                    </button>
                  </div>
                </div>
                <div className={"tp-pv-body" + (qaBizPreview.trim() ? " has-content" : "")}>
                  {qaBizPreview.trim() ? (
                    <pre className="md-preview">{qaBizPreview}</pre>
                  ) : (
                    <div className="tp-pv-empty">完成框架后点「② 生成业务场景」</div>
                  )}
                </div>
              </div>
            ) : null}

            {!tpScanning &&
            tpPreviewTab === "func" &&
            !(busy && qaBusyMode === "testpoints" && !qaMdPreview.trim()) ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">页面功能测试点</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!canReview || busy || tpScanning || autoPipeBusy}
                      title={
                        hasReview
                          ? "对照上一轮报告做复审；之后重生成仍会参考最新报告"
                          : "对照原型一并评审①框架/②场景/③功能；之后重生成对应步骤会参考该报告"
                      }
                      onClick={() =>
                        onRunReview?.(
                          hasReview
                            ? { kind: "rereview", useCurrentAsPrior: true }
                            : { kind: "review", forceFresh: true }
                        )
                      }
                    >
                      {hasReview ? "复审" : "评审"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaMdPreview.trim()}
                      onClick={() =>
                        downloadXmind(
                          cleanGeneratedMd(qaMdPreview),
                          buildXmindFilename(tpProjectName, "功能测试点"),
                          `${tpProjectName} · 功能测试点`
                        )
                      }
                    >
                      下载 .xmind
                    </button>
                  </div>
                </div>
                <div className={"tp-pv-body" + (qaMdPreview.trim() ? " has-content" : "")}>
                  {qaMdPreview.trim() ? (
                    <pre className="md-preview">{qaMdPreview}</pre>
                  ) : (
                    <div className="tp-pv-empty">
                      尚无功能点内容 · 点下方「③ 生成页面功能」开始
                      <br />
                      <span className="hint">不是卡顿：当前工作区功能点为空（未生成或未载入）</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {!tpScanning &&
            tpPreviewTab === "special" &&
            !(busy && qaBusyMode === "special" && !String(qaSpecialPreview || "").trim()) ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">专项测试点（④）</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!String(qaSpecialPreview || "").trim()}
                      onClick={() =>
                        downloadXmind(
                          cleanGeneratedMd(qaSpecialPreview),
                          buildXmindFilename(tpProjectName, "专项测试点"),
                          `${tpProjectName} · 专项测试点`
                        )
                      }
                    >
                      下载 .xmind
                    </button>
                  </div>
                </div>
                <div
                  className={
                    "tp-pv-body" + (String(qaSpecialPreview || "").trim() ? " has-content" : "")
                  }
                >
                  {String(qaSpecialPreview || "").trim() ? (
                    <pre className="md-preview">{qaSpecialPreview}</pre>
                  ) : (
                    <div className="tp-pv-empty">
                      尚无专项内容 · 点下方「④ 生成专项测试」开始
                      <br />
                      <span className="hint">权限 / 并发幂等 / 弱网 / 兼容 / 安全</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {!tpScanning &&
            tpPreviewTab === "review" &&
            !(busy && qaBusyMode === "review" && !qaReviewPreview.trim()) ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">测试点评审报告（①②③④）</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!canReview || busy || tpScanning || autoPipeBusy}
                      title={
                        hasReview
                          ? "对照上一轮报告做复审（只核未闭合项）"
                          : "对照原型一并评审①②③④"
                      }
                      onClick={() =>
                        onRunReview?.(
                          hasReview
                            ? { kind: "rereview", useCurrentAsPrior: true }
                            : { kind: "review", forceFresh: true }
                        )
                      }
                    >
                      {hasReview ? "复审" : "开始评审"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaReviewPreview.trim()}
                      onClick={() =>
                        downloadMarkdown(
                          buildXmindFilename(tpProjectName, "评审报告").replace(
                            /\.xmind$/i,
                            ".md"
                          ),
                          cleanGeneratedMd(qaReviewPreview)
                        )
                      }
                    >
                      下载 .md
                    </button>
                  </div>
                </div>
                <div
                  className={
                    "tp-pv-body" + (qaReviewPreview.trim() ? " has-content" : "")
                  }
                >
                  {qaReviewHistory.length > 0 ? (
                    <div className="tp-review-history">
                      <div className="tp-review-history-head">评审轮次</div>
                      <ul className="tp-review-history-list">
                        {[...qaReviewHistory].reverse().map((h, idx) => {
                          const roundNo = qaReviewHistory.length - idx;
                          const when = String(h.at || "")
                            .replace("T", " ")
                            .slice(0, 19);
                          return (
                            <li key={h.id || `${h.at}-${idx}`}>
                              <button
                                type="button"
                                className="tp-review-history-item"
                                title="载入该轮报告到预览"
                                onClick={() => onLoadReviewHistory?.(h)}
                              >
                                <span className="tp-review-history-main">
                                  第{roundNo}轮 ·{" "}
                                  {h.kind === "rereview" || roundNo > 1
                                    ? "复审"
                                    : "初评"}
                                  {reviewNeedsRework(h.report ?? "") ||
                                  (!h.report && h.needsRework)
                                    ? " · 需返工"
                                    : " · 通过/无强制返工"}
                                </span>
                                <span className="tp-review-history-meta">{when}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {qaReviewPreview.trim() ? (
                    <pre className="md-preview">{qaReviewPreview}</pre>
                  ) : (
                    <div className="tp-pv-empty">
                      有①/②/③内容后点「评审」：对照原型一次检查框架、场景、功能
                      <br />
                      <span className="hint">
                        或点「一键生成」：自动三步+评审（需返工会修订后再复审）
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {!tpScanning && tpPreviewTab === "trace" ? (
              <TpTraceWorkbench
                qaMaterial={qaMaterial}
                qaFrontUrl={qaFrontUrl}
                qaBackUrl={qaBackUrl}
                tpDualMode={tpDualMode}
                qaFrameworkPreview={qaFrameworkPreview}
                qaMdPreview={qaMdPreview}
                projectId={projectId}
                projectName={projectLabel || tpProjectName || ""}
                recordId={tpActiveRecordId || ""}
                tpScanStory={tpScanStory}
                apiUrl={apiUrl}
              />
            ) : null}

            {!tpScanning && tpPreviewTab === "pw" ? (
              <div className="tp-pv">
                <div className="tp-pv-head">
                  <div className="tp-pv-title">Playwright Test</div>
                  <div className="tp-pv-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={onOpenPwDebug}
                    >
                      调试 pw
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!qaPwSpecPreview.trim()}
                      onClick={() => downloadMarkdown("playwright.spec.ts", qaPwSpecPreview)}
                    >
                      下载 .spec.ts
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={!qaPwSpecPreview.trim() || openPwBusy}
                      onClick={onOpenPlaywrightUi}
                    >
                      {openPwBusy ? "启动中…" : "打开 Playwright Test"}
                    </button>
                  </div>
                </div>
                <div className={"tp-pv-body" + (qaPwSpecPreview.trim() ? " has-content" : "")}>
                  {qaPwSpecPreview.trim() ? (
                    <pre className="md-preview">{qaPwSpecPreview}</pre>
                  ) : (
                    <div className="tp-pv-empty">
                      点「调试 pw」勾选生成并填写测试环境，再跑第③步
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="tp-v2-dock">
          {(busy && qaBusyMode) || tpScanning || autoPipeBusy ? (
            <span className="tp-busy-chip">
              <span className="tp-breath" />
              {autoPipeBusy
                ? "一键中"
                : tpScanning
                  ? "扫描中"
                  : "生成中"}
            </span>
          ) : null}
          {typeof onRunAutoPipeline === "function" ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAutoPipe}
              title="①→②→③→评审→（按需修订）→复审"
              onClick={() => onRunAutoPipeline()}
            >
              {autoPipeBusy ? "一键中…" : "一键生成"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary tp-run-next"
            disabled={!canRunQa || !tpNextStep || busy || tpScanning || autoPipeBusy}
            onClick={runTpNext}
          >
            {busy || tpScanning
              ? "处理中…"
              : tpNextStep === 1
                ? "① 生成页面框架"
                : tpNextStep === 2
                  ? "② 生成业务场景"
                  : tpNextStep === 3
                    ? "③ 生成页面功能"
                    : "全部完成"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!canReview || busy || tpScanning || autoPipeBusy}
            title={
              hasReview
                ? "对照上一轮报告做复审（只核未闭合项）"
                : "对照原型一并评审①框架 / ②场景 / ③功能"
            }
            onClick={() =>
              onRunReview?.(
                hasReview
                  ? { kind: "rereview", useCurrentAsPrior: true }
                  : { kind: "review", forceFresh: true }
              )
            }
          >
            {busy && qaBusyMode === "review"
              ? hasReview
                ? "复审中…"
                : "评审中…"
              : hasReview
                ? "复审"
                : "评审①②③"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!canRunQa || !canRegenCurrent || busy || tpScanning || autoPipeBusy}
            title={
              hasReview && tabStep
                ? `将参考评审报告中「${
                    tabStep === 1 ? "①框架" : tabStep === 2 ? "②场景" : "③功能"
                  }」章节重新生成`
                : "覆盖重跑当前预览页签对应的已完成步骤"
            }
            onClick={() => {
              if (!tabStep || !canRegenCurrent) return;
              const stepName =
                tabStep === 1 ? "框架" : tabStep === 2 ? "业务场景" : "页面功能";
              const reviewNote =
                hasReview
                  ? `\n\n将参考当前「评审报告」中对应「${
                      tabStep === 1 ? "①" : tabStep === 2 ? "②" : "③"
                    }」章节修正后再输出。`
                  : "";
              if (
                !window.confirm(
                  `确定重新生成第 ${tabStep} 步？将覆盖当前「${stepName}」内容。${reviewNote}`
                )
              ) {
                return;
              }
              runTpStep(tabStep);
            }}
          >
            {regenLabel}
          </button>
          <span className="tp-dock-spacer" />
          <button
            type="button"
            className="btn btn-small"
            disabled={!canDownloadDevMd}
            title="一键导出业务场景 + 页面功能为 Markdown，供开发自测"
            onClick={downloadDevSelfTestMd}
          >
            下载自测 MD
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!canSaveTpRecord || !!(tpZentaoPipe && tpZentaoPipe.active)}
            onClick={downloadZentaoCsv}
            title="同步模块并一键导入禅道（也可仅下载 CSV）"
          >
            {tpZentaoPipe && tpZentaoPipe.active ? "导入中…" : "导入禅道"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={
              !canSaveTpRecord ||
              !!(tpProductPipe && tpProductPipe.active && tpProductPipe.kind === "cases")
            }
            onClick={importProductCases}
            title="将当前测试点导入灵巅云产品系统（需写密钥 + suiteId）"
          >
            {tpProductPipe && tpProductPipe.active && tpProductPipe.kind === "cases"
              ? "导入中…"
              : "导入用例到产品系统"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!!(tpProductPipe && tpProductPipe.active && tpProductPipe.kind === "bugs")}
            onClick={importProductBugsFromXmind}
            title="上传测后 XMind：解析粉红 Bug + 截图备注，导入产品系统"
          >
            {tpProductPipe && tpProductPipe.active && tpProductPipe.kind === "bugs"
              ? "导入中…"
              : "导入Bug到产品系统"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!canSaveTpRecord}
            onClick={saveTpRecord}
          >
            保存到列表
          </button>
        </footer>
      </main>
    </div>
  );
}
