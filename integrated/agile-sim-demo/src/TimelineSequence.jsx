/**
 * 时间轴序列加载动画（步骤引导：准备→处理→校验→完成）
 * 用于框架 / 业务 / 页面测试点生成中的遮罩。
 */
export default function TimelineSequence({
  title = "生成中",
  subtitle = "按步骤处理中…",
  activeStep = 0,
  progress = 0,
  steps,
}) {
  const list =
    Array.isArray(steps) && steps.length
      ? steps
      : [
          { id: 1, label: "准备" },
          { id: 2, label: "处理" },
          { id: 3, label: "校验" },
          { id: 4, label: "完成" },
        ];
  const pct = Math.max(4, Math.min(100, Number(progress) || 0));
  const idx = Math.max(0, Math.min(list.length - 1, Number(activeStep) || 0));

  return (
    <div className="tl-seq" aria-label="时间轴进度">
      <div className="tl-seq-badge">步骤引导 / 叙事</div>
      <h3 className="tl-seq-title">{title}</h3>
      <p className="tl-seq-sub">{subtitle}</p>
      <div className="tl-seq-ease">
        <code>power2.inOut</code>
      </div>
      <div className="tl-seq-stage">
        <div className="tl-seq-bar">
          <div
            className="tl-seq-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="tl-seq-grid">
          {list.map((s, i) => {
            let state = "todo";
            if (i < idx) state = "done";
            else if (i === idx) state = "active";
            return (
              <div
                key={s.id || i}
                className={"tl-seq-step tl-seq-step--" + state}
              >
                <span className="tl-seq-step-num">{i + 1}.</span>
                <span className="tl-seq-step-label">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 按耗时与流字数估算时间轴步骤（0~3）与进度百分比 */
export function timelineProgressFromMetrics(elapsedSec, deltaChars) {
  const t = Math.max(0, Number(elapsedSec) || 0);
  const chars = Math.max(0, Number(deltaChars) || 0);
  let step = 0;
  if (chars > 80 || t >= 4) step = 1;
  if (chars > 400 || t >= 12) step = 2;
  if (chars > 1200 || t >= 28) step = 3;
  // 进度条：时间缓入 + 字数贡献，上限 92%（完成留给收尾消失）
  const byTime = Math.min(55, t * 2.2);
  const byChars = Math.min(40, Math.sqrt(chars) * 1.1);
  const progress = Math.min(92, Math.max(8, byTime + byChars));
  return { step, progress };
}
