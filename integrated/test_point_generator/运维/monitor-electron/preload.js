const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opsShell", {
  getMetrics: () => ipcRenderer.invoke("read-metrics"),
  /** @param {string} url @param {string} [account] 主体账号，相同 account 共用同一扇大窗与同一会话 @param {{ openCertExpiry?: boolean }} [extra] */
  openUrl: (url, account, extra) =>
    ipcRenderer.send("open-metric", {
      url,
      account: account != null ? String(account) : "",
      ...(extra && typeof extra === "object" ? extra : {}),
    }),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  getRemark: (id) => ipcRenderer.invoke("get-remark", id),
  saveRemark: (id, text) =>
    ipcRenderer.invoke("save-remark", { id, text: text != null ? String(text) : "" }),
});
