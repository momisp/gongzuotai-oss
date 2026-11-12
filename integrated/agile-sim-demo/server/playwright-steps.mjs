/**
 * 执行 AI 生成的 Playwright 步骤 JSON（与 测试点.md 中冒烟块配套）
 * op 白名单，避免任意代码执行
 */

const OP = new Set([
  "goto",
  "clearStorage",
  "reload",
  "wait",
  "fill",
  "click",
  "clickRole",
  "selectOption",
  "expectText",
  "expectVisible",
  "expectHidden",
  "expectEnabled",
  "expectDisabled",
  "expectCountMin",
]);

function loc(page, step) {
  if (step.selector) return page.locator(String(step.selector));
  if (step.role && step.name) {
    return page.getByRole(String(step.role), { name: String(step.name) });
  }
  if (step.role) return page.getByRole(String(step.role));
  return null;
}

export function normalizeStepList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && OP.has(String(s.op || "")));
}

/** @returns {{ ok: boolean, issues: string[] }} */
export async function runPlaywrightSteps({ page, pageUrl, steps, timeoutMs = 25000 }) {
  const issues = [];
  const list = normalizeStepList(steps);

  for (let i = 0; i < list.length; i++) {
    const step = list[i];
    const label = `步骤${i + 1}(${step.op})`;
    try {
      switch (step.op) {
        case "goto":
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
          break;
        case "clearStorage":
          await page.evaluate(() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
          });
          break;
        case "reload":
          await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
          break;
        case "wait":
          await page.waitForTimeout(Math.min(Number(step.ms) || 300, 5000));
          break;
        case "fill": {
          const l = loc(page, step);
          if (!l) throw new Error("fill 需要 selector");
          await l.fill(String(step.value ?? ""), { timeout: 8000 });
          break;
        }
        case "click": {
          const l = loc(page, step);
          if (!l) throw new Error("click 需要 selector 或 role+name");
          await l.click({ timeout: 8000 });
          break;
        }
        case "clickRole": {
          const l = page.getByRole(String(step.role || "button"), {
            name: step.name ? String(step.name) : undefined,
          });
          await l.first().click({ timeout: 8000 });
          break;
        }
        case "selectOption": {
          const l = loc(page, step);
          if (!l) throw new Error("selectOption 需要 selector");
          await l.selectOption(String(step.value ?? ""), { timeout: 8000 });
          break;
        }
        case "expectText": {
          const body = await page.locator("body").innerText({ timeout: 8000 });
          const t = String(step.text || "");
          if (!body.includes(t)) throw new Error(`页面未包含文案「${t}」`);
          break;
        }
        case "expectVisible": {
          const l = loc(page, step);
          if (!l) throw new Error("expectVisible 需要 selector 或 role+name");
          await l.first().waitFor({ state: "visible", timeout: 8000 });
          break;
        }
        case "expectHidden": {
          const l = loc(page, step);
          if (!l) throw new Error("expectHidden 需要 selector");
          await l.first().waitFor({ state: "hidden", timeout: 8000 });
          break;
        }
        case "expectEnabled": {
          const l = loc(page, step);
          if (!l) throw new Error("expectEnabled 需要 selector 或 role+name");
          if (await l.first().isDisabled()) throw new Error("元素仍为 disabled");
          break;
        }
        case "expectDisabled": {
          const l = loc(page, step);
          if (!l) throw new Error("expectDisabled 需要 selector 或 role+name");
          if (!(await l.first().isDisabled())) throw new Error("元素未处于 disabled");
          break;
        }
        case "expectCountMin": {
          const l = loc(page, step);
          if (!l) throw new Error("expectCountMin 需要 selector");
          const n = await l.count();
          const min = Number(step.min) || 1;
          if (n < min) throw new Error(`期望至少 ${min} 个，实际 ${n}`);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      issues.push(`${label} 失败：${String(e.message || e).slice(0, 160)}`);
      if (step.failFast !== false) break;
    }
  }

  return { ok: issues.length === 0, issues };
}
