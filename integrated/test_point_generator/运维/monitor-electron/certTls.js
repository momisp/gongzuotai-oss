/**
 * TLS 握手读取对端叶子证书（与 Electron/Chromium「证书详情」同源数据）
 */
const tls = require("tls");
const { URL } = require("url");

function formatCertDistinguishedName(obj) {
  if (!obj) return "—";
  if (typeof obj === "string") return obj;
  const order = ["CN", "O", "OU", "L", "ST", "C"];
  const parts = [];
  for (const k of order) {
    if (obj[k]) parts.push(`${k}=${obj[k]}`);
  }
  return parts.length ? parts.join("，") : JSON.stringify(obj);
}

/**
 * @param {string} httpsUrl
 */
function fetchPeerCertificateFromHttpsUrl(httpsUrl) {
  const u = new URL(httpsUrl);
  if (u.protocol !== "https:") {
    return Promise.reject(new Error("仅支持 https 链接"));
  }
  const hostname = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : 443;

  return new Promise((resolve, reject) => {
    const sock = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: true,
      },
      () => {
        try {
          const cert = sock.getPeerCertificate(false);
          sock.end();
          if (!cert || !Object.keys(cert).length) {
            reject(new Error("未取到证书"));
            return;
          }
          resolve(cert);
        } catch (e) {
          try {
            sock.end();
          } catch (_) {
            /* ignore */
          }
          reject(e);
        }
      },
    );
    sock.on("error", (e) => reject(e));
    sock.setTimeout(15000, () => {
      sock.destroy(new Error("连接超时"));
    });
  });
}

module.exports = {
  fetchPeerCertificateFromHttpsUrl,
  formatCertDistinguishedName,
};
