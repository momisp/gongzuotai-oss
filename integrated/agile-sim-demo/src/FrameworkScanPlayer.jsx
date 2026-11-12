import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 框架扫描播放器（方案 B）：原型截图 + 激光扫描 + 模块入树
 * 播完后调用 onDone()
 */
export default function FrameworkScanPlayer({
  screenshot,
  regions = [],
  viewport = { w: 1440, h: 900 },
  onDone,
  onRegion,
}) {
  const [idx, setIdx] = useState(-1);
  const [laserY, setLaserY] = useState(0);
  const [tree, setTree] = useState([]);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const onRegionRef = useRef(onRegion);
  onDoneRef.current = onDone;
  onRegionRef.current = onRegion;

  const list = useMemo(
    () =>
      [...(regions || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.rect?.y || 0) - (b.rect?.y || 0)
      ),
    [regions]
  );

  const vw = viewport?.w || 1440;
  const vh = viewport?.h || 900;

  useEffect(() => {
    doneRef.current = false;
    setIdx(-1);
    setTree([]);
    setLaserY(0);
    let cancelled = false;
    const finish = (delay = 400) => {
      setTimeout(() => {
        if (!cancelled && !doneRef.current) {
          doneRef.current = true;
          onDoneRef.current?.();
        }
      }, delay);
    };

    // 无模块框：有截图则整页扫一遍（用户能看到动画）；无截图才短等结束
    if (!list.length) {
      if (!screenshot) {
        finish(500);
        return () => {
          cancelled = true;
        };
      }
      let y = 0;
      const id = setInterval(() => {
        if (cancelled) return;
        y += 6;
        setLaserY(Math.min(100, y));
        if (y >= 100) {
          clearInterval(id);
          finish(350);
        }
      }, 90);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    let i = 0;
    const stepMs = 850;
    let timers = [];

    const tick = () => {
      if (cancelled) return;
      if (i >= list.length) {
        setLaserY(100);
        finish(500);
        return;
      }
      const r = list[i];
      const yPct = Math.min(96, Math.max(2, ((r.rect?.y || 0) / vh) * 100));
      setLaserY(yPct);
      setIdx(i);
      setTree((prev) => {
        if (prev.some((p) => p.id === r.id || p.title === r.title)) return prev;
        return [...prev, { id: r.id, title: r.title, level: r.level || 1 }];
      });
      onRegionRef.current?.(r, i);
      i += 1;
      timers.push(setTimeout(tick, stepMs));
    };

    timers.push(setTimeout(tick, 400));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [screenshot, list, vh]);

  const active = idx >= 0 ? list[idx] : null;

  return (
    <div className="tp-scan" aria-label="原型结构扫描">
      <div className="tp-scan-stage">
        <div className="tp-scan-frame" style={{ aspectRatio: `${vw} / ${vh}` }}>
          {screenshot ? (
            <img src={screenshot} alt="原型截图" className="tp-scan-img" draggable={false} />
          ) : (
            <div className="tp-scan-empty">暂无截图</div>
          )}
          <div className="tp-scan-laser" style={{ top: `${laserY}%` }} />
          {active?.rect ? (
            <div
              className="tp-scan-box"
              style={{
                left: `${(active.rect.x / vw) * 100}%`,
                top: `${(active.rect.y / vh) * 100}%`,
                width: `${(active.rect.w / vw) * 100}%`,
                height: `${(active.rect.h / vh) * 100}%`,
              }}
            >
              <span>{active.title}</span>
            </div>
          ) : null}
        </div>
        <p className="tp-scan-caption">
          {active
            ? `识别为框架目录：${active.title}`
            : "正在打开原型，准备扫描侧栏结构…"}
        </p>
      </div>
      <aside className="tp-scan-tree" aria-label="识别中的框架">
        <div className="tp-scan-tree-head">框架目录（识别中）</div>
        <ul>
          {tree.length === 0 ? (
            <li className="hint">等待扫描命中模块…</li>
          ) : (
            tree.map((n) => (
              <li
                key={n.id || n.title}
                className={"tp-scan-tree-item" + (active?.title === n.title ? " is-on" : "")}
                style={{ paddingLeft: 8 + (n.level > 1 ? 14 : 0) }}
              >
                {n.title}
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}

/**
 * 步骤条。
 * - activeIndex >= 0：受控，按真实进度点亮（推荐）
 * - activeIndex 未传：兼容旧用法，定时推进并在结束时 onDone
 */
export function FrameworkScanFallback({ steps = [], onDone, activeIndex }) {
  const controlled = typeof activeIndex === "number";
  const [i, setI] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (controlled) return undefined;
    doneRef.current = false;
    setI(0);
    const list = steps.length ? steps : ["准备生成"];
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (n >= list.length) {
        clearInterval(id);
        setI(list.length);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(() => onDone?.(), 350);
        }
      } else {
        setI(n);
      }
    }, 900);
    return () => clearInterval(id);
  }, [steps, onDone, controlled]);

  const list = steps.length ? steps : ["准备生成"];
  const cur = controlled ? Math.max(0, Math.min(activeIndex, list.length)) : i;

  return (
    <div className="tp-scan-fallback" aria-label="生成步骤">
      {list.map((s, idx) => (
        <div
          key={s + idx}
          className={
            "tp-scan-fb-row" +
            (idx < cur ? " is-done" : "") +
            (idx === cur && cur < list.length ? " is-run" : "")
          }
        >
          <span className="tp-scan-fb-dot" />
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}
