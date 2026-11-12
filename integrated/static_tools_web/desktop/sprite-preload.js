const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spriteApi", {
  chat: (payload) => ipcRenderer.invoke("sprite:chat", payload),
  state: () => ipcRenderer.invoke("sprite:state"),
  llmConfig: () => ipcRenderer.invoke("sprite:llm-config"),
  runModule: (moduleId) => ipcRenderer.invoke("sprite:run-module", moduleId),
  minimize: () => ipcRenderer.send("sprite:minimize"),
  close: () => ipcRenderer.send("sprite:close"),
  toggleSize: () => ipcRenderer.invoke("sprite:toggle-size"),
  onSizeChanged: (callback) => {
    ipcRenderer.on("sprite:size-changed", (_event, expanded) => callback(expanded));
  },
});
