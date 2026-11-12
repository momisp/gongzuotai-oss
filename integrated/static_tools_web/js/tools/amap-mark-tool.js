/**
 * 高德卫星图点击标注：独立页通过 iframe 嵌入（需联网加载 webapi.amap.com）。
 */
function renderAmapmarkTool(container) {
  container.innerHTML =
    "<h2>高德 · 卫星标注</h2>" +
    "<p>卫星底图、路网叠加；<strong>移动鼠标</strong>可在左下角看到实时经纬度，点击落点。需 HTTP(s) 打开主站，以便 iframe 能加载与高德控制台一致的域名。密钥已在页面中配置，勿公开托管敏感数据。</p>" +
    '<iframe class="tool-amap-embed" title="高德卫星图标注" src="./tools/amap-satellite-mark.html"></iframe>';
}
