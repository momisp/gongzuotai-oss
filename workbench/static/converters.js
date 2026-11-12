const converters = {
  "base64-encode": (input) => btoa(unescape(encodeURIComponent(input))),
  "base64-decode": (input) => {
    try { return decodeURIComponent(escape(atob(input.trim()))); }
    catch { return "解码失败：输入不是有效的 Base64"; }
  },
  "time-to-ts": (input) => {
    const d = new Date(input.trim());
    if (isNaN(d)) return "无效的时间格式";
    return String(Math.floor(d.getTime() / 1000)) + " (秒)\n" + String(d.getTime()) + " (毫秒)";
  },
  "ts-to-time": (input) => {
    let ts = Number(input.trim());
    if (isNaN(ts)) return "无效的时间戳";
    if (ts < 1e12) ts *= 1000;
    const d = new Date(ts);
    return d.toLocaleString("zh-CN") + "\nISO: " + d.toISOString();
  },
  "json-format": (input) => {
    try { return JSON.stringify(JSON.parse(input), null, 2); }
    catch (e) { return "JSON 解析失败: " + e.message; }
  },
  "url-encode": (input) => encodeURIComponent(input),
  "url-decode": (input) => {
    try { return decodeURIComponent(input); }
    catch { return "URL 解码失败"; }
  },
};
