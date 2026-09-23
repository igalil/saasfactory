import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  dialog,
  shell,
  session,
  systemPreferences,
  Notification,
} from "electron";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LibraryStore } from "./store.js";
import { IdeaService } from "./service.js";
import { SubscriptionProviders } from "./providers.js";
import { ProviderId, WebUrl, type WindowMode } from "./shared.js";
import { exportMarkdown } from "./export.js";
import { transcribeLocally } from "./voice.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const renderer = path.join(root, "../renderer/index.html");
const devUrl =
  !app.isPackaged &&
  process.env["SAASFACTORY_DEV_URL"] === "http://localhost:5173"
    ? "http://localhost:5173"
    : undefined;
if (process.env["SAASFACTORY_DATA_DIR"] && !app.isPackaged)
  app.setPath("userData", path.resolve(process.env["SAASFACTORY_DATA_DIR"]));
app.setName("SaasFactory");
let window: BrowserWindow;
let tray: Tray;
let mode: WindowMode = "island";
let quitting = false;
let service: IdeaService;
let speech: AbortController | undefined;
let connecting: AbortController | undefined;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

function setMode(next: WindowMode) {
  mode = next;
  const display = screen.getDisplayMatching(window.getBounds());
  const work = display.workArea;
  const desired =
    next === "island"
      ? { width: 64, height: 172 }
      : next === "capture"
        ? { width: 450, height: 660 }
        : { width: 1180, height: 820 };
  const width = Math.min(work.width - 20, desired.width);
  const height = Math.min(work.height - 20, desired.height);
  window.setBounds(
    {
      x: work.x + work.width - width - 10,
      y: work.y + Math.round((work.height - height) / 2),
      width,
      height,
    },
    true,
  );
  window.setAlwaysOnTop(next !== "workspace", "floating");
  window.webContents.send("window:changed", mode);
  window.show();
  if (next !== "island") window.focus();
}

function trusted(url: string): boolean {
  try {
    return devUrl
      ? new URL(url).origin === devUrl
      : fileURLToPath(new URL(url).href.split("#")[0]!) === renderer;
  } catch {
    return false;
  }
}
function registerHandlers(providers: SubscriptionProviders) {
  const handle = (name: string, action: (...args: any[]) => unknown) => {
    ipcMain.handle(name, (event, ...args: unknown[]) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        !trusted(event.senderFrame.url)
      )
        throw new Error("Untrusted application frame");
      return action(...args);
    });
  };
  handle("library:snapshot", () => service.snapshot());
  handle("idea:capture", (input) => service.capture(input));
  handle("idea:edit", (id, input) => service.edit(id, input));
  handle("settings:save", (input) => service.settings(input));
  handle("idea:analyze", (id, input) => service.analyze(id, input));
  handle("run:cancel", () => service.cancel());
  handle("providers:status", () => providers.status());
  handle("providers:connect", (input) =>
    service.changeAccount(async () => {
      const provider = ProviderId.parse(input);
      connecting = new AbortController();
      try {
        return await providers.connect(
          provider,
          (url) => shell.openExternal(WebUrl.parse(url)),
          connecting.signal,
        );
      } finally {
        connecting = undefined;
      }
    }),
  );
  handle("providers:cancel-connect", () => connecting?.abort());
  handle("providers:disconnect", (input) =>
    service.changeAccount(() => providers.disconnect(ProviderId.parse(input))),
  );
  handle("idea:domains", (id, names) => service.domains(id, names));
  handle("window:mode", (input) =>
    setMode(z.enum(["island", "capture", "workspace"]).parse(input)),
  );
  handle("link:open", (input) => shell.openExternal(WebUrl.parse(input)));
  handle("idea:export", async (input) => {
    const id = z.string().uuid().parse(input);
    const idea = (await service.snapshot()).ideas.find(
      (item) => item.id === id,
    );
    if (!idea) throw new Error("Idea not found");
    const result = await dialog.showSaveDialog(window, {
      title: "Export idea brief",
      defaultPath: `${idea.title.replace(/[^a-z0-9-]/gi, "-").slice(0, 60)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, exportMarkdown(idea), { mode: 0o600 });
    return result.filePath;
  });
  handle("library:backup", async () => {
    const result = await dialog.showSaveDialog(window, {
      title: "Back up ideas",
      defaultPath: `saasfactory-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(
      result.filePath,
      JSON.stringify(await service.snapshot(), null, 2),
      { mode: 0o600 },
    );
    return result.filePath;
  });
  handle("library:restore", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Import idea backup (adds new ideas only)",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    if ((await stat(file)).size > 30_000_000)
      throw new Error("Backup is larger than 30 MB.");
    return service.restore(JSON.parse(await readFile(file, "utf8")));
  });
  handle("voice:choose", async (input) => {
    const kind = z
      .enum(["whisperPath", "ffmpegPath", "modelPath"])
      .parse(input);
    const result = await dialog.showOpenDialog(window, {
      title: `Select ${kind === "modelPath" ? "Whisper GGML model" : kind.replace("Path", "")}`,
      properties: ["openFile"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle("voice:transcribe", async (audio) => {
    if (speech) throw new Error("A recording is already being transcribed.");
    speech = new AbortController();
    try {
      return await transcribeLocally(
        audio,
        (await service.snapshot()).settings.voice,
        speech.signal,
      );
    } finally {
      speech = undefined;
    }
  });
}

if (singleInstance)
  void app
    .whenReady()
    .then(async () => {
      const data = app.getPath("userData");
      const providers = new SubscriptionProviders(path.join(data, "providers"));
      service = new IdeaService(
        new LibraryStore(path.join(data, "ideas.json")),
        providers,
      );
      await service.store.recover();
      window = new BrowserWindow({
        width: 64,
        height: 172,
        frame: false,
        transparent: true,
        resizable: false,
        hasShadow: false,
        show: false,
        skipTaskbar: true,
        backgroundColor: "#00000000",
        webPreferences: {
          preload: path.join(root, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (!trusted(url)) event.preventDefault();
      });
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, _origin, details) =>
          contents === window.webContents &&
          permission === "media" &&
          trusted(contents.getURL()) &&
          details.mediaType === "audio",
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          const allowed =
            contents === window.webContents &&
            permission === "media" &&
            trusted(contents.getURL()) &&
            "mediaTypes" in details &&
            details.mediaTypes?.every((type: string) => type === "audio");
          if (!allowed) {
            callback(false);
            return;
          }
          if (process.platform === "darwin")
            void systemPreferences
              .askForMediaAccess("microphone")
              .then(callback)
              .catch(() => callback(false));
          else callback(true);
        },
      );
      registerHandlers(providers);
      service.on("changed", () => {
        if (!window.isDestroyed()) window.webContents.send("library:changed");
      });
      service.on("notice", (message: string) => {
        if (Notification.isSupported())
          new Notification({ title: "SaasFactory", body: message }).show();
      });
      window.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          setMode("island");
        }
      });
      window.webContents.on("did-finish-load", () => setMode("island"));
      if (devUrl) await window.loadURL(devUrl);
      else await window.loadFile(renderer);
      const icon = nativeImage.createFromPath(
        path.join(root, "../../assets/tray.png"),
      );
      icon.setTemplateImage(process.platform === "darwin");
      tray = new Tray(icon);
      tray.setToolTip("SaasFactory — catch your next idea");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "Capture an idea",
            accelerator: "CommandOrControl+Shift+Space",
            click: () => setMode("capture"),
          },
          { label: "Open idea library", click: () => setMode("workspace") },
          { label: "Show floating island", click: () => setMode("island") },
          { type: "separator" },
          { label: "Quit SaasFactory", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => setMode(mode === "island" ? "capture" : "island"));
      globalShortcut.register("CommandOrControl+Shift+Space", () =>
        setMode(mode === "island" ? "capture" : "island"),
      );
      screen.on("display-metrics-changed", () => setMode(mode));
      screen.on("display-removed", () => setMode(mode));
      app.on("activate", () => setMode("capture"));
      app.on("second-instance", () => setMode("capture"));
    })
    .catch((error) => {
      dialog.showErrorBox(
        "SaasFactory could not start",
        error instanceof Error ? error.message : String(error),
      );
      app.exit(1);
    });

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  speech?.abort();
  connecting?.abort();
  globalShortcut.unregisterAll();
  void Promise.race([
    service?.cancel(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]).finally(() => app.quit());
});
app.on("window-all-closed", () => {
  /* tray keeps the app alive */
});
