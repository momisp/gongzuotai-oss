function renderImageTool(container) {
  container.innerHTML =
    "<h2>图片缩放 / 压缩</h2>" +
    "<p>在浏览器内用 canvas 处理，大图可能较慢</p>" +
    '<input type="file" id="imgFile" accept="image/*" />' +
    '<div class="input-group"><label for="imgMaxW">最大边 (px，0=不缩放)</label>' +
    '<input type="number" id="imgMaxW" value="1280" min="0" max="8000" step="1" /></div>' +
    '<div class="input-group"><label for="imgQuality">JPEG 质量 0-1</label>' +
    '<input type="number" id="imgQuality" value="0.85" min="0.1" max="1" step="0.05" /></div>' +
    '<div class="button-group">' +
    '<button type="button" onclick="processImageTool()">处理并预览</button>' +
    '<button type="button" onclick="downloadProcessedImage()">下载 JPEG</button>' +
    "</div>" +
    '<div id="imgPreviewWrap" class="img-preview-wrap"></div>' +
    '<pre id="imgOutput" class="output"></pre>';

  window.__imgToolDataUrl = "";
}

function processImageTool() {
  const f = document.getElementById("imgFile");
  const maxWEl = document.getElementById("imgMaxW");
  const qEl = document.getElementById("imgQuality");
  const out = document.getElementById("imgOutput");
  const wrap = document.getElementById("imgPreviewWrap");
  if (!f || !f.files || !f.files[0]) {
    if (out) out.textContent = "请选择图片";
    return;
  }
  const maxW = maxWEl ? Number(maxWEl.value) : 0;
  const quality = qEl ? Math.min(1, Math.max(0.05, Number(qEl.value) || 0.85)) : 0.85;
  const file = f.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const cap = Number.isFinite(maxW) && maxW > 0 ? maxW : 0;
      if (cap && Math.max(width, height) > cap) {
        const scale = cap / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const url = canvas.toDataURL("image/jpeg", quality);
      window.__imgToolDataUrl = url;
      if (wrap) {
        wrap.innerHTML = '<img id="imgPreview" alt="预览" />';
        const im = document.getElementById("imgPreview");
        if (im) im.src = url;
      }
      if (out) {
        const approx = Math.round((url.length * 3) / 4);
        out.textContent =
          "原文件: " +
          file.name +
          " / " +
          file.size +
          " 字节\n输出约: " +
          approx +
          " 字节 (Base64 体积，下载会小些)\n尺寸: " +
          width +
          "×" +
          height;
      }
    };
    img.onerror = () => {
      if (out) out.textContent = "无法读取图片";
    };
    img.src = reader.result;
  };
  reader.onerror = () => {
    if (out) out.textContent = "读取失败";
  };
  reader.readAsDataURL(file);
}

function downloadProcessedImage() {
  const url = window.__imgToolDataUrl;
  const out = document.getElementById("imgOutput");
  if (!url) {
    if (out) out.textContent = "请先点击「处理并预览」";
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = "compressed.jpg";
  a.click();
}
