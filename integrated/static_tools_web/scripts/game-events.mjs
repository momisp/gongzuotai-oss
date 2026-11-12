/**
 * 游戏活动 CLI：抓取并落地到 assets/timeline-*.json，供静态网页加载。
 *
 * 用法：
 *   node scripts/game-events.mjs --game genshin
 *   node scripts/game-events.mjs --game genshin --source paimonmoe -o assets/timeline-genshin-intl.json
 *   node scripts/game-events.mjs --all                       # 抓原神 + 崩铁 + 绝区零，写入默认路径
 *
 * 默认输出：
 *   assets/timeline-{game}.json   （source=official）
 *
 * 需 Node.js 18+（内置 fetch）。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchEvents, SUPPORTED } from "./game-events-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const a = process.argv.slice(2);
  const r = { game: null, source: "official", out: null, all: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--game") r.game = a[++i];
    else if (k === "--source") r.source = a[++i];
    else if (k === "-o" || k === "--out") r.out = a[++i];
    else if (k === "--all") r.all = true;
    else if (k === "-h" || k === "--help") r.help = true;
  }
  return r;
}

function help() {
  console.error(
`用法：
  node scripts/game-events.mjs --game <key> [--source <src>] [-o <file>]
  node scripts/game-events.mjs --all

支持游戏：${SUPPORTED.games.join(", ")}
支持来源：${SUPPORTED.sources.join(", ")}（默认 official）

示例：
  node scripts/game-events.mjs --game genshin
  node scripts/game-events.mjs --game starrail
  node scripts/game-events.mjs --game zzz
  node scripts/game-events.mjs --game genshin --source paimonmoe -o assets/timeline-genshin-intl.json
  node scripts/game-events.mjs --all
`);
}

function defaultOut(game, source) {
  const suffix = source && source !== "official" ? `-${source}` : "";
  return path.join(ROOT, "assets", `timeline-${game}${suffix}.json`);
}

async function runOne(game, source, outFile) {
  process.stderr.write(`[${game} / ${source}] 拉取中...\n`);
  const pack = await fetchEvents(game, source);
  const target = outFile || defaultOut(game, source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(pack, null, 2), "utf8");
  process.stderr.write(`[${game} / ${source}] 写入 ${path.relative(ROOT, target)}（${pack.events.length} 条）\n`);
  return pack;
}

async function main() {
  const args = parseArgs();
  if (args.help || (!args.game && !args.all)) { help(); return; }

  if (args.all) {
    const results = {};
    for (const g of SUPPORTED.games) {
      try {
        const pack = await runOne(g, "official", null);
        results[g] = { ok: true, count: pack.events.length };
      } catch (e) {
        console.error(`[${g}] 失败：${e.message || e}`);
        results[g] = { ok: false, error: String(e.message || e) };
      }
    }
    const meta = {
      updated_at: new Date().toISOString().slice(0, 19),
      source: "official",
      games: results,
    };
    const metaPath = path.join(ROOT, "assets", "timeline-meta.json");
    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    process.stderr.write(`[meta] 写入 ${path.relative(ROOT, metaPath)}\n`);
    return;
  }

  if (!SUPPORTED.games.includes(args.game)) {
    console.error(`未知 game: ${args.game}（支持：${SUPPORTED.games.join(", ")}）`);
    process.exit(1);
  }

  await runOne(args.game, args.source, args.out);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
