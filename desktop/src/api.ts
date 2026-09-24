import {
  CaptureSchema,
  EditSchema,
  LibrarySchema,
  SettingsSchema,
  emptyLibrary,
  type DesktopAPI,
  type WindowState,
} from "../../src/desktop/shared";
import { exportMarkdown } from "../../src/desktop/export";

declare global {
  interface Window {
    saasfactory?: DesktopAPI;
  }
}
const key = "saasfactory-browser-preview-v1";
const changed = new EventTarget();
const unavailable = async (): Promise<never> => {
  throw new Error(
    "Open the desktop app to use provider accounts, local dictation, and registrar lookups. This browser preview saves ideas on this browser only.",
  );
};
function read() {
  const saved = localStorage.getItem(key);
  return saved ? LibrarySchema.parse(JSON.parse(saved)) : emptyLibrary();
}
function write(state: ReturnType<typeof read>) {
  localStorage.setItem(key, JSON.stringify(state));
  changed.dispatchEvent(new Event("change"));
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let previewWindow: WindowState = {
  mode: "workspace",
  edge: "right",
  focused: true,
  dragging: false,
  motion: null,
};
const windowListeners = new Set<(state: WindowState) => void>();
const preview: DesktopAPI = {
  platform: "browser",
  snapshot: async () => read(),
  capture: async (input) => {
    const data = CaptureSchema.parse(input);
    const state = read();
    const date = new Date().toISOString();
    const idea = {
      id: crypto.randomUUID(),
      body: data.body,
      title:
        data.title ||
        (data.body.split(/\n|[.!?]/)[0]!.trim() || data.body).slice(0, 90),
      notes: "",
      stage: "inbox" as const,
      createdAt: date,
      updatedAt: date,
      reports: [],
      domains: [],
    };
    state.ideas.unshift(idea);
    write(state);
    return idea;
  },
  edit: async (id, input) => {
    const state = read();
    const idea = state.ideas.find((item) => item.id === id);
    if (!idea) throw new Error("Idea not found");
    Object.assign(idea, EditSchema.parse(input), {
      updatedAt: new Date().toISOString(),
    });
    write(state);
  },
  settings: async (input) => {
    const state = read();
    state.settings = SettingsSchema.parse(input);
    write(state);
  },
  analyze: unavailable,
  cancel: unavailable,
  connect: unavailable,
  cancelConnect: unavailable,
  disconnect: unavailable,
  domains: unavailable,
  providers: async () =>
    (["codex", "claude", "cursor", "xai"] as const).map((id) => ({
      id,
      state: id === "xai" ? "unsupported" : "setup",
      detail:
        id === "xai"
          ? "Consumer subscription SDK access is not verified. API billing stays disabled."
          : "Connect this account in the desktop app.",
    })),
  exportIdea: async (id) => {
    const idea = read().ideas.find((item) => item.id === id);
    if (!idea) throw new Error("Idea not found");
    download("idea-brief.md", exportMarkdown(idea), "text/markdown");
    return "Downloads";
  },
  backup: async () => {
    download(
      "saasfactory-backup.json",
      JSON.stringify(read(), null, 2),
      "application/json",
    );
    return "Downloads";
  },
  restore: unavailable,
  transcribe: unavailable,
  chooseVoiceFile: unavailable,
  setWindow: async (mode) => {
    previewWindow = { ...previewWindow, mode };
    windowListeners.forEach((listener) => listener(previewWindow));
  },
  windowState: async () => previewWindow,
  beginWindowDrag: async () => {},
  moveWindowDrag: async () => {},
  endWindowDrag: async () => false,
  finishIslandMotion: async () => {},
  nudgeWindow: async (direction) => {
    if (direction === "left" || direction === "right") {
      previewWindow = { ...previewWindow, edge: direction };
      windowListeners.forEach((listener) => listener(previewWindow));
    }
  },
  openExternal: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  subscribe: (listener) => {
    changed.addEventListener("change", listener);
    return () => changed.removeEventListener("change", listener);
  },
  onWindow: (listener) => {
    windowListeners.add(listener);
    return () => {
      windowListeners.delete(listener);
    };
  },
};
export const api = window.saasfactory ?? preview;
export const isPreview = !window.saasfactory;
