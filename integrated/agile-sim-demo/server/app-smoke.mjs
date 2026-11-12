import { readFile } from "fs/promises";
import path from "path";

/** 对 app/ 静态工程做轻量自检（不依赖 Playwright） */
export async function smokeCheckAppDir(appDir) {
  const issues = [];
  const readSafe = async (name) => {
    try {
      return await readFile(path.join(appDir, name), "utf8");
    } catch {
      return "";
    }
  };

  const html = await readSafe("index.html");
  const js = await readSafe("app.js");
  const css = await readSafe("styles.css");

  if (!html.trim()) issues.push("缺少 index.html 或内容为空");
  if (!js.trim()) issues.push("缺少 app.js 或内容为空");
  if (html && !/<script[\s>]/i.test(html) && !js.trim()) {
    issues.push("index.html 未引用 app.js，且无内联脚本");
  }
  if (html && /defer\s+src=["']app\.js/i.test(html) === false && /src=["']app\.js/i.test(html)) {
    /* ok */
  }

  const buttonIds = [
    ...html.matchAll(/<button[^>]*\bid=["']([^"']+)["']/gi),
  ].map((m) => m[1]);
  const buttonCount = (html.match(/<button\b/gi) || []).length;

  for (const id of buttonIds) {
    const safeId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idPat = new RegExp(
      `(getElementById\\(["']${safeId}["']\\)|querySelector\\(["'][^"']*#${safeId}[^"']*["']\\)|\\$\\s*\\(\\s*["']${safeId}["']\\s*\\))`,
      "i"
    );
    const onAttr = new RegExp(
      `<button[^>]*\\bid=["']${safeId}["'][^>]*\\bonclick=`,
      "i"
    );
    const jsOnclick = new RegExp(
      `\\$\\s*\\(\\s*["']${safeId}["']\\s*\\)\\s*\\.\\s*onclick\\s*=`,
      "i"
    );
    if (!idPat.test(js) && !onAttr.test(html) && !jsOnclick.test(js)) {
      issues.push(`按钮 #${id} 在 app.js 中未找到明显的事件绑定`);
    }
  }

  if (buttonCount > 0 && buttonIds.length === 0) {
    const hasGlobalClick =
      /addEventListener\s*\(\s*["']click["']/i.test(js) ||
      /document\.querySelectorAll\s*\(\s*["']button/i.test(js);
    if (!hasGlobalClick && !/onclick=/i.test(html)) {
      issues.push("页面含 button 元素，但 app.js 中缺少 click 相关绑定");
    }
  }

  if (js.trim()) {
    try {
      // 仅语法粗检：包一层函数避免顶层 return 误报
      // eslint-disable-next-line no-new-func
      new Function(`"use strict";\n${js}\n`);
    } catch (e) {
      issues.push(`app.js 语法可能有问题：${String(e.message || e).slice(0, 120)}`);
    }
  }

  if (!css.trim() && html.includes('href="styles.css"')) {
    issues.push("index.html 引用了 styles.css 但文件为空或缺失");
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: { buttonCount, buttonIds: buttonIds.length, htmlLen: html.length, jsLen: js.length },
  };
}
