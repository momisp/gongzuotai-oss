function renderUrlTool(container) {
  container.innerHTML =
    "<h2>URL 编解码</h2>" +
    "<p>组件编码用 encodeURIComponent；整段 URI 可用 encodeURI（保留 :/?# 等）</p>" +
    '<textarea id="urlInput" placeholder="输入 URL 或查询参数文本"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="urlEncodeComp()">encodeURIComponent</button>' +
    '<button type="button" onclick="urlDecodeComp()">decodeURIComponent</button>' +
    '<button type="button" onclick="urlEncodeURI()">encodeURI</button>' +
    '<button type="button" onclick="urlDecodeURI()">decodeURI</button>' +
    '<button type="button" onclick="clearUrl()">清空</button>' +
    "</div>" +
    '<pre id="urlOutput" class="output"></pre>';
}

function urlOut() {
  return document.getElementById("urlOutput");
}

function urlEncodeComp() {
  const v = document.getElementById("urlInput");
  const o = urlOut();
  if (!v || !o) return;
  try {
    o.textContent = encodeURIComponent(v.value);
  } catch (e) {
    o.textContent = String(e);
  }
}

function urlDecodeComp() {
  const v = document.getElementById("urlInput");
  const o = urlOut();
  if (!v || !o) return;
  try {
    o.textContent = decodeURIComponent(v.value);
  } catch (e) {
    o.textContent = "解码失败: " + (e.message || e);
  }
}

function urlEncodeURI() {
  const v = document.getElementById("urlInput");
  const o = urlOut();
  if (!v || !o) return;
  try {
    o.textContent = encodeURI(v.value);
  } catch (e) {
    o.textContent = String(e);
  }
}

function urlDecodeURI() {
  const v = document.getElementById("urlInput");
  const o = urlOut();
  if (!v || !o) return;
  try {
    o.textContent = decodeURI(v.value);
  } catch (e) {
    o.textContent = "解码失败: " + (e.message || e);
  }
}

function clearUrl() {
  const v = document.getElementById("urlInput");
  const o = urlOut();
  if (v) v.value = "";
  if (o) o.textContent = "";
}
