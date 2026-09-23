import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI, WindowMode } from "./shared.js";

const api: DesktopAPI = {
  snapshot: () => ipcRenderer.invoke("library:snapshot"),
  capture: (input) => ipcRenderer.invoke("idea:capture", input),
  edit: (id, input) => ipcRenderer.invoke("idea:edit", id, input),
  settings: (input) => ipcRenderer.invoke("settings:save", input),
  analyze: (id, mode) => ipcRenderer.invoke("idea:analyze", id, mode),
  cancel: () => ipcRenderer.invoke("run:cancel"),
  providers: () => ipcRenderer.invoke("providers:status"),
  cancelConnect: () => ipcRenderer.invoke("providers:cancel-connect"),
  disconnect: (provider) =>
    ipcRenderer.invoke("providers:disconnect", provider),
  connect: (provider) => ipcRenderer.invoke("providers:connect", provider),
  domains: (id, domains) => ipcRenderer.invoke("idea:domains", id, domains),
  exportIdea: (id) => ipcRenderer.invoke("idea:export", id),
  backup: () => ipcRenderer.invoke("library:backup"),
  restore: () => ipcRenderer.invoke("library:restore"),
  setWindow: (mode) => ipcRenderer.invoke("window:mode", mode),
  openExternal: (url) => ipcRenderer.invoke("link:open", url),
  transcribe: (audio) => ipcRenderer.invoke("voice:transcribe", audio),
  chooseVoiceFile: (kind) => ipcRenderer.invoke("voice:choose", kind),
  subscribe: (listener) => {
    const callback = () => listener();
    ipcRenderer.on("library:changed", callback);
    return () => {
      ipcRenderer.removeListener("library:changed", callback);
    };
  },
  onWindow: (listener) => {
    const callback = (_event: unknown, mode: WindowMode) => listener(mode);
    ipcRenderer.on("window:changed", callback);
    return () => {
      ipcRenderer.removeListener("window:changed", callback);
    };
  },
  platform: process.platform,
};
contextBridge.exposeInMainWorld("saasfactory", api);
