import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";

const APP_BASENAMES = new Set(["index.html", "styles.css", "app.js", "README.md"]);

/** 全栈追问时：index.html 等必须落到 app/ 下，与预览 iframe 一致 */
export function normalizeFsChatPath(relPathRaw) {
  const rel = String(relPathRaw || "")
    .replace(/\\/g, "/")
    .replace(/^[/\\]+/, "");
  const parts = rel.split("/").filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return null;
  const base = parts[parts.length - 1];
  if (APP_BASENAMES.has(base) && parts[0] !== "app") {
    return `app/${base}`;
  }
  return parts.join("/");
}

/** 拒绝「见仓库 / git clone」等占位内容写入磁盘 */
export function isValidArtifactContent(relPath, content) {
  const c = String(content || "").trim();
  if (c.length < 24) return false;
  if (
    /见仓库|完整内容见|不重复粘贴|此处不重复|请从.*分支|git clone|内容过长.*不重复|^\（与仓库|必须完整保存.*完整内容见/i.test(
      c
    )
  ) {
    return false;
  }
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".js")) {
    if (c.length < 400) return false;
    if (!/function|const |let |addEventListener|document\.|=>/.test(c)) return false;
  }
  if (lower.endsWith(".css")) {
    if (c.length < 200) return false;
  }
  if (lower.endsWith(".html")) {
    if (!/<html[\s>]/i.test(c) && c.length < 800) return false;
  }
  return true;
}

/** 若模型误写到会话根目录，把有效文件同步进 app/（预览只看 app/） */
export async function syncRootAppFilesIntoAppDir(sessionDir) {
  const appDir = path.join(sessionDir, "app");
  await mkdir(appDir, { recursive: true });
  const synced = [];
  for (const name of APP_BASENAMES) {
    const rootFile = path.join(sessionDir, name);
    const dest = path.join(appDir, name);
    if (!existsSync(rootFile)) continue;
    try {
      if (!statSync(rootFile).isFile()) continue;
      const content = await readFile(rootFile, "utf8");
      if (!isValidArtifactContent(`app/${name}`, content)) continue;
      await writeFile(dest, content, "utf8");
      synced.push(name);
    } catch {
      /* ignore */
    }
  }
  return synced;
}

/** clone 到 app/gantt-chart/ 等子目录时，提升到 app/ 根供 iframe 预览 */
export async function promoteAppSubfolderIfNeeded(sessionDir) {
  const appDir = path.join(sessionDir, "app");
  const candidates = ["gantt-chart", "momi", "dist", "public"];
  const rootIndex = path.join(appDir, "index.html");
  let rootLen = 0;
  if (existsSync(rootIndex)) {
    try {
      rootLen = (await readFile(rootIndex, "utf8")).length;
    } catch {
      rootLen = 0;
    }
  }
  for (const subName of candidates) {
    const subDir = path.join(appDir, subName);
    const subIndex = path.join(subDir, "index.html");
    if (!existsSync(subIndex)) continue;
    let subLen = 0;
    try {
      subLen = (await readFile(subIndex, "utf8")).length;
    } catch {
      continue;
    }
    if (subLen < 400 || (rootLen > 800 && subLen <= rootLen)) continue;
    const promoted = [];
    for (const name of APP_BASENAMES) {
      const src = path.join(subDir, name);
      const dest = path.join(appDir, name);
      if (!existsSync(src)) continue;
      try {
        const content = await readFile(src, "utf8");
        if (!isValidArtifactContent(`app/${name}`, content)) continue;
        await writeFile(dest, content, "utf8");
        promoted.push(name);
      } catch {
        /* ignore */
      }
    }
    if (promoted.length) return { from: subName, promoted };
  }
  return null;
}
