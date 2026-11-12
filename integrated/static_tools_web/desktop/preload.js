const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("toolsDesktop", {
  getStats: () => ipcRenderer.invoke("sysmon:get-stats"),
  getTrafficRank: () => ipcRenderer.invoke("sysmon:get-traffic-rank"),
  platform: process.platform
});
