const { execFileSync } = require("child_process");
const path = require("path");

const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");
const WIN_TCP = path.join(SCRIPTS_DIR, "win_process_net.ps1");
const WIN_IO = path.join(SCRIPTS_DIR, "win_process_io_estimate.ps1");

function runPs1(scriptPath, sampleMs) {
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-SampleMs", String(sampleMs)],
      { encoding: "utf8", timeout: Math.max(30000, sampleMs + 25000), windowsHide: true }
    );
    const raw = (out || "").trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mergeByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = (row.name || "—").toLowerCase();
    if (!map.has(key)) {
      map.set(key, { ...row });
      continue;
    }
    const cur = map.get(key);
    for (const f of ["rxSec", "txSec", "totalSec", "bytesRecv", "bytesSent", "bytesTotal", "connections"]) {
      cur[f] = (cur[f] || 0) + (row[f] || 0);
    }
  }
  return Array.from(map.values());
}

async function connectionFallback(si) {
  const conns = await si.networkConnections().catch(() => []);
  const byPid = new Map();
  for (const c of conns || []) {
    if (!c || c.pid == null) continue;
    const state = (c.state || "").toUpperCase();
    if (state && state !== "ESTABLISHED" && state !== "LISTEN") continue;
    const cur = byPid.get(c.pid) || { pid: c.pid, name: c.process || "", connections: 0, rxSec: 0, txSec: 0, totalSec: 0, bytesRecv: 0, bytesSent: 0, bytesTotal: 0 };
    cur.connections += 1;
    if (!cur.name && c.process) cur.name = c.process;
    cur.totalSec = cur.connections;
    byPid.set(c.pid, cur);
  }
  return Array.from(byPid.values())
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 30);
}

async function getProcessTraffic(sampleMs, si) {
  if (process.platform === "win32") {
    let payload = runPs1(WIN_TCP, sampleMs);
    if (payload && payload.processes && payload.processes.length) {
      const rows = payload.processes.sort((a, b) => (b.totalSec || 0) - (a.totalSec || 0)).slice(0, 30);
      return { processes: rows, method: payload.method || "tcp-estats", note: null };
    }

    payload = runPs1(WIN_IO, sampleMs);
    if (payload && payload.processes && payload.processes.length) {
      const rows = mergeByName(payload.processes)
        .sort((a, b) => (b.totalSec || 0) - (a.totalSec || 0))
        .slice(0, 30);
      return {
        processes: rows,
        method: payload.method || "io-counter-estimate",
        note: "通过系统 I/O 性能计数器估算，含磁盘读写，浏览器/下载类进程可参考"
      };
    }

    const rows = await connectionFallback(si);
    return {
      processes: rows,
      method: "connections-only",
      note: "未能读取 TCP 字节统计，仅展示活跃连接数（可尝试以管理员运行桌面版）"
    };
  }

  const rows = await connectionFallback(si);
  return {
    processes: rows,
    method: "connections-only",
    note: "当前系统仅支持连接数参考排行"
  };
}

module.exports = { getProcessTraffic };
