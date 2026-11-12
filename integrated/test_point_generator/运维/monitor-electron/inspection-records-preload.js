const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opsInspectionRecords", {
  listExcels() {
    return ipcRenderer.invoke("ops-inspection-records:list");
  },
  openPath(filePath) {
    return ipcRenderer.invoke("ops-inspection-records:open", filePath);
  },
  revealInFolder(filePath) {
    return ipcRenderer.invoke("ops-inspection-records:reveal", filePath);
  },
});
