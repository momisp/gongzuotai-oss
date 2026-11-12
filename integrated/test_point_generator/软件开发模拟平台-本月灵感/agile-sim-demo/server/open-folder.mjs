import { execFile } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * 解析为可打开的目录绝对路径。
 * 避免 Windows 把「…/app」当成执行 app.js（同目录下有 app.js 时 start 会误启动脚本）。
 */
export function resolveOpenableDir(absRaw) {
  let abs = path.normalize(String(absRaw || ""));
  if (!abs || !existsSync(abs)) return null;

  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }

  if (st.isDirectory()) return abs;

  if (st.isFile()) {
    const base = path.basename(abs).toLowerCase();
    const parent = path.dirname(abs);
    if (base === "app.js" || base.endsWith(".js") || base.endsWith(".html")) {
      const appDir = path.join(parent, "app");
      if (existsSync(appDir)) {
        try {
          if (statSync(appDir).isDirectory()) return appDir;
        } catch {
          /* ignore */
        }
      }
      return parent;
    }
    return path.dirname(abs);
  }

  return null;
}

async function openWindowsFolder(abs) {
  const errors = [];

  const tries = [
    () => execFileAsync("explorer.exe", [abs], { windowsHide: true }),
    () =>
      execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Start-Process -FilePath explorer.exe -ArgumentList @(${JSON.stringify(abs)})`,
        ],
        { windowsHide: true }
      ),
    () =>
      execFileAsync("cmd.exe", ["/c", "explorer", abs], {
        windowsHide: true,
      }),
  ];

  for (const fn of tries) {
    try {
      await fn();
      return;
    } catch (e) {
      errors.push(String(e?.message || e));
    }
  }

  throw new Error(errors.join(" | ") || "无法启动资源管理器");
}

/** 在资源管理器 / Finder 中打开目录 */
export async function openFolderInOS(absDir) {
  const abs = resolveOpenableDir(absDir);
  if (!abs) {
    throw new Error("路径无效或不是可打开的文件夹");
  }

  const platform = process.platform;

  if (platform === "win32") {
    await openWindowsFolder(abs);
    return abs;
  }

  const cmd = platform === "darwin" ? "open" : "xdg-open";
  await execFileAsync(cmd, [abs], { windowsHide: true });
  return abs;
}

export function formatGeneratedRelative(subPath) {
  return String(subPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}
