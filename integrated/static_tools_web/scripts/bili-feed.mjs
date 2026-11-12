/**

 * 本地拉取 B 站「全部动态」订阅流（/x/polymer/web-dynamic/v1/feed/all），合并多页 JSON。

 * 需已登录：把 Cookie 写入环境变量或 scripts/bili-cookie.txt（勿泄露、勿提交仓库）。

 *

 * 用法：

 *   set BILI_COOKIE=SESSDATA=...; buvid3=...

 *   node scripts/bili-feed.mjs

 *   node scripts/bili-feed.mjs -o bili-feed.json

 *

 * 需要 Node.js 18+（内置 fetch）。

 */



import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";

import { fetchMergedFeed } from "./bili-feed-core.mjs";



const __dirname = path.dirname(fileURLToPath(import.meta.url));



function loadCookie() {

  const fromEnv = process.env.BILI_COOKIE;

  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();

  const filePath = process.env.BILI_COOKIE_FILE || path.join(__dirname, "bili-cookie.txt");

  if (fs.existsSync(filePath)) {

    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("#"));

    if (line) return line.trim();

  }

  return "";

}



function parseArgs() {

  const a = process.argv.slice(2);

  let outFile = null;

  let maxPages = 25;

  for (let i = 0; i < a.length; i++) {

    if (a[i] === "-o" || a[i] === "--out") outFile = a[++i];

    else if (a[i] === "--max-pages") maxPages = Math.max(1, parseInt(a[++i], 10) || 25);

  }

  return { outFile, maxPages };

}



async function main() {

  const cookie = loadCookie();

  if (!cookie) {

    console.error(

      "未找到 Cookie。请任选其一：\n" +

        "  1) 设置环境变量 BILI_COOKIE（整段 Cookie 字符串）\n" +

        "  2) 在 scripts 目录创建 bili-cookie.txt，第一行粘贴 Cookie（可参考 bili-cookie.example.txt）\n"

    );

    process.exit(1);

  }



  const { outFile, maxPages } = parseArgs();

  const pack = await fetchMergedFeed(cookie, maxPages);

  const text = JSON.stringify(pack, null, 2);



  if (outFile) {

    fs.writeFileSync(outFile, text, "utf8");

    console.error(

      `已写入 ${path.resolve(outFile)} ，共 ${pack.data.items.length} 条动态。也可用「本机桥接」在网页一键拉取。`

    );

  } else {

    console.log(text);

  }

}



main().catch((e) => {

  console.error(e.message || e);

  process.exit(1);

});


