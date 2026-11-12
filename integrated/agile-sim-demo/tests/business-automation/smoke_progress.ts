/**
 * 冒烟进度 / 截图 / 新建账号 / 备注
 * 由工作台注入 SMOKE_RUN_DIR
 */
import fs from "fs";
import path from "path";
import type { Page, TestInfo } from "@playwright/test";

type CaseStatus = "pending" | "running" | "passed" | "failed" | "skipped";

type HintResult = {
  index: number;
  text: string;
  status: "hit" | "miss" | "skip";
  screenshot: string;
  box: { x: number; y: number; width: number; height: number } | null;
  pageSize: { pageWidth: number; pageHeight: number } | null;
  note?: string;
};

type SmokeCase = {
  id: string;
  title: string;
  role?: string;
  status: CaseStatus;
  screenshot: string;
  error: string;
  note?: string;
  startedAt?: string;
  finishedAt?: string;
  hintResults?: HintResult[];
};

type SmokeAccount = {
  level: string;
  username: string;
  password: string;
  note?: string;
};

type SmokeProgress = {
  status: "running" | "passed" | "failed";
  cases: SmokeCase[];
  accounts?: SmokeAccount[];
};

function runDir(): string {
  return String(process.env.SMOKE_RUN_DIR || "").trim();
}

function casesPath(): string {
  const dir = runDir();
  return dir ? path.join(dir, "cases.json") : "";
}

function accountsPath(): string {
  const dir = runDir();
  return dir ? path.join(dir, "accounts.json") : "";
}

function readProgress(): SmokeProgress {
  const file = casesPath();
  if (!file || !fs.existsSync(file)) {
    return { status: "running", cases: [], accounts: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return {
      status: data.status === "passed" || data.status === "failed" ? data.status : "running",
      cases: Array.isArray(data.cases) ? data.cases : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : readAccountsFile(),
    };
  } catch {
    return { status: "running", cases: [], accounts: [] };
  }
}

function readAccountsFile(): SmokeAccount[] {
  const file = accountsPath();
  if (!file || !fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeProgress(data: SmokeProgress) {
  const file = casesPath();
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const accounts = data.accounts || readAccountsFile();
  fs.writeFileSync(
    file,
    JSON.stringify({ status: data.status, cases: data.cases, accounts }, null, 2),
    "utf-8",
  );
  const ap = accountsPath();
  if (ap) fs.writeFileSync(ap, JSON.stringify(accounts, null, 2), "utf-8");
}

export function caseIdFromTitle(title: string): string {
  const m = String(title || "").match(/^([SF]\d+)\b/i);
  return m ? m[1].toUpperCase() : String(title || "case").slice(0, 40);
}

export function recordSmokeAccount(acc: SmokeAccount) {
  const data = readProgress();
  const list = data.accounts || readAccountsFile();
  const idx = list.findIndex((a) => a.level === acc.level && a.username === acc.username);
  if (idx >= 0) list[idx] = { ...list[idx], ...acc };
  else list.push(acc);
  data.accounts = list;
  writeProgress(data);
}

export function markCaseStatus(
  id: string,
  status: CaseStatus,
  extra: Partial<Pick<SmokeCase, "title" | "role" | "screenshot" | "error" | "note" | "hintResults">> = {},
) {
  const data = readProgress();
  let item = data.cases.find((c) => c.id === id);
  if (!item) {
    item = {
      id,
      title: extra.title || id,
      role: extra.role || "",
      status: "pending",
      screenshot: "",
      error: "",
      note: "",
      hintResults: [],
    };
    data.cases.push(item);
  }
  item.status = status;
  if (extra.title) item.title = extra.title;
  if (extra.role) item.role = extra.role;
  if (extra.screenshot != null) item.screenshot = extra.screenshot;
  if (extra.error != null) item.error = extra.error;
  if (extra.note != null) item.note = extra.note;
  if (extra.hintResults != null) item.hintResults = extra.hintResults;
  if (status === "running") item.startedAt = new Date().toISOString();
  if (status === "passed" || status === "failed" || status === "skipped") {
    item.finishedAt = new Date().toISOString();
  }
  data.status = "running";
  writeProgress(data);
}

/** 回写细项区域截图结果（可在 finish 前后调用） */
export function attachHintResults(id: string, hintResults: HintResult[]) {
  const data = readProgress();
  let item = data.cases.find((c) => c.id === id);
  if (!item) {
    item = {
      id,
      title: id,
      status: "running",
      screenshot: "",
      error: "",
      note: "",
      hintResults: [],
    };
    data.cases.push(item);
  }
  item.hintResults = hintResults;
  writeProgress(data);
}

export async function finishSmokeCase(page: Page, testInfo: TestInfo, note = "") {
  const id = caseIdFromTitle(testInfo.title);
  const status: CaseStatus =
    testInfo.status === "passed" ? "passed" : testInfo.status === "skipped" ? "skipped" : "failed";

  let screenshotRel = "";
  const dir = runDir();
  if (dir && status !== "skipped") {
    const shotDir = path.join(dir, "screenshots");
    fs.mkdirSync(shotDir, { recursive: true });
    const fileName = `${id}_${status}.png`;
    const abs = path.join(shotDir, fileName);
    try {
      await page.screenshot({ path: abs, fullPage: true });
      screenshotRel = `screenshots/${fileName}`;
    } catch {
      /* ignore */
    }
  }

  const err = String(testInfo.error?.message || "").slice(0, 800);
  const existing = readProgress().cases.find((c) => c.id === id);
  markCaseStatus(id, status, {
    title: testInfo.title,
    screenshot: screenshotRel,
    error: err,
    note: note || (testInfo.annotations.find((a) => a.type === "note")?.description || ""),
    hintResults: existing?.hintResults || [],
  });
}
