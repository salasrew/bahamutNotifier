const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bahamutApp", {
  onSnapshot(handler) {
    ipcRenderer.on("bahamut:snapshot", (_event, payload) => handler(payload));
  },
  refresh() {
    return ipcRenderer.invoke("bahamut:refresh");
  },
  login() {
    return ipcRenderer.invoke("bahamut:login");
  },
  hideWindow() {
    return ipcRenderer.invoke("bahamut:hide-window");
  },
  toggleWindow() {
    return ipcRenderer.invoke("bahamut:toggle-window");
  },
  openExternal(url) {
    return ipcRenderer.invoke("bahamut:open-external", url);
  }
});
