function renderTextcodeTool(container) {
  container.innerHTML =
    "<h2>文本文件探测</h2>" +
    "<p>读取本地文件：BOM、前若干字节十六进制、UTF-8 解码尝试（不保证编码判断完全准确）</p>" +
    '<input type="file" id="textcodeFile" />' +
    '<div class="button-group">' +
    '<button type="button" onclick="analyzeTextFile()">分析</button>' +
    '<button type="button" onclick="clearTextcode()">清空</button>' +
    "</div>" +
    '<pre id="textcodeOutput" class="output"></pre>';
}

function hexPreview(buf, max) {
  const u8 = new Uint8Array(buf, 0, Math.min(max, buf.byteLength));
  const parts = [];
  for (let i = 0; i < u8.length; i++) parts.push(u8[i].toString(16).padStart(2, "0"));
  return parts.join(" ");
}

function analyzeTextFile() {
  const f = document.getElementById("textcodeFile");
  const out = document.getElementById("textcodeOutput");
  if (!f || !f.files || !f.files[0]) {
    if (out) out.textContent = "请选择文件";
    return;
  }
  const file = f.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const buf = reader.result;
    const u8 = new Uint8Array(buf);
    let bom = "无匹配常见 BOM";
    if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) bom = "UTF-8 BOM (EF BB BF)";
    else if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) bom = "UTF-16 LE BOM (FF FE)";
    else if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) bom = "UTF-16 BE BOM (FE FF)";
    let utf8Text = "";
    let utf8Err = "";
    try {
      utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(u8);
    } catch (e) {
      utf8Err = "严格 UTF-8 解码失败";
    }
    const lines = [
      "文件名: " + file.name,
      "大小: " + file.size + " 字节",
      "BOM: " + bom,
      "前 256 字节 Hex:",
      hexPreview(buf, 256),
      "",
      utf8Err || "UTF-8 解码预览（前 2000 字符）:",
      utf8Err ? utf8Err : utf8Text.slice(0, 2000)
    ];
    if (!utf8Err && utf8Text.length > 2000) lines.push("\n...(已截断)");
    out.textContent = lines.join("\n");
  };
  reader.onerror = () => {
    if (out) out.textContent = "读取失败";
  };
  reader.readAsArrayBuffer(file);
}

function clearTextcode() {
  const f = document.getElementById("textcodeFile");
  const out = document.getElementById("textcodeOutput");
  if (f) f.value = "";
  if (out) out.textContent = "";
}
