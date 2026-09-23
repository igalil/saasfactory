import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Archive,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  FileText,
  Globe2,
  Inbox,
  LoaderCircle,
  Maximize2,
  Mic,
  Minus,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  X,
  Zap,
} from "lucide-react";
import {
  CODEX_MODELS,
  CODEX_TASKS,
  codexSelection,
  modelLabel,
} from "../../src/desktop/model-routing";
import { api, isPreview } from "./api";
import {
  currentReport,
  SettingsSchema,
  recommended,
  type Analysis,
  type Idea,
  type Library,
  type Mode,
  type ProviderId,
  type ProviderStatus,
  type Settings,
  type WindowMode,
} from "../../src/desktop/shared";

const names: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude",
  cursor: "Cursor",
  xai: "Grok / SpaceXAI",
};
const verdicts: Record<Analysis["verdict"], string> = {
  pursue: "Worth exploring",
  pivot: "Find a sharper angle",
  pass: "Better to move on",
  unproven: "Not enough evidence",
};
const markets: Record<Analysis["market"], string> = {
  saturated: "Crowded market",
  healthy: "Healthy competition",
  unexplored: "Unexplored territory",
  unknown: "Market not established",
};
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
const draftKey = "saasfactory-capture-draft";
type Section = "inbox" | "shortlist" | "archive" | "settings";
type Notice = (message: string) => void;

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function App() {
  const [library, setLibrary] = useState<Library>();
  const [fatal, setFatal] = useState("");
  const [section, setSection] = useState<Section>("inbox");
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<WindowMode>(
    isPreview ? "workspace" : "island",
  );
  const [toast, setToast] = useState("");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [onlyPromising, setOnlyPromising] = useState(false);
  const [composing, setComposing] = useState(false);
  const notify = useCallback<Notice>((message) => setToast(message), []);
  const refresh = useCallback(async () => {
    try {
      setLibrary(await api.snapshot());
      setFatal("");
    } catch (error) {
      setFatal(errorMessage(error));
    }
  }, []);
  const refreshProviders = useCallback(async () => {
    try {
      setProviders(await api.providers());
    } catch (error) {
      notify(errorMessage(error));
    }
  }, [notify]);
  useEffect(() => {
    void refresh();
    void refreshProviders();
    return api.subscribe(() => {
      void refresh();
    });
  }, [refresh, refreshProviders]);
  useEffect(() => api.onWindow(setMode), []);
  useEffect(() => {
    const onFocus = () => {
      void refreshProviders();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshProviders]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode !== "island") {
        void api.setWindow("island");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setComposing(true);
        setSection("inbox");
        if (mode === "island") void api.setWindow("capture");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [mode]);
  useEffect(() => {
    document.body.dataset["mode"] = mode;
    document.body.dataset["preview"] = String(isPreview);
  }, [mode]);
  const run = library?.runs.find((item) => item.status === "running");
  const save = async (body: string) => {
    const idea = await api.capture({ body });
    setSelected(idea.id);
    setSection("inbox");
    setComposing(false);
    notify("Idea captured. A little more room in your head.");
    return idea;
  };
  const setWindow = (next: WindowMode) => {
    void api.setWindow(next).catch((error) => notify(errorMessage(error)));
  };
  if (mode === "island")
    return (
      <button
        className="floating-island"
        onClick={() => setWindow("capture")}
        aria-label="Capture an idea"
        title="Capture an idea · Ctrl/⌘ Shift Space"
      >
        <Mark small />
        <span className="island-line" />
        <span className={`signal ${run ? "working" : ""}`} />
        <Plus size={18} />
      </button>
    );
  if (fatal)
    return (
      <main className="fatal">
        <Mark />
        <h1>Your ideas come first.</h1>
        <p>{fatal}</p>
        <button onClick={() => void refresh()}>Try again</button>
      </main>
    );
  if (!library)
    return (
      <main className="loading">
        <LoaderCircle className="spin" /> Opening your idea library…
      </main>
    );
  const activeProvider = providers.find(
    (item) => item.id === library.settings.provider,
  );
  const ready = activeProvider?.state === "ready";
  const idea = library.ideas.find((item) => item.id === selected);
  let visible = library.ideas.filter(
    (item) =>
      item.stage === section &&
      `${item.title} ${item.body}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!onlyPromising ||
        recommended(item, library.settings.shortlistThreshold)),
  );
  visible = [...visible].sort((a, b) =>
    sort === "score"
      ? (currentReport(b)?.analysis.score ?? -1) -
        (currentReport(a)?.analysis.score ?? -1)
      : sort === "effort"
        ? { small: 1, medium: 2, large: 3 }[
            currentReport(a)?.analysis.effort.level ?? "large"
          ] -
          { small: 1, medium: 2, large: 3 }[
            currentReport(b)?.analysis.effort.level ?? "large"
          ]
        : b.createdAt.localeCompare(a.createdAt),
  );
  const promising = library.ideas.filter(
    (item) =>
      item.stage !== "archive" &&
      recommended(item, library.settings.shortlistThreshold),
  ).length;
  const todayCount = library.ideas.filter(
    (item) =>
      new Date(item.createdAt).toDateString() === new Date().toDateString(),
  ).length;
  const openSettings = () => {
    setSection("settings");
    setWindow("workspace");
  };

  return (
    <div className={`app-shell mode-${mode}`}>
      {mode === "capture" ? (
        <>
          <header className="capture-header">
            <span className="brand">
              <Mark small /> saasfactory<span className="brand-dot">.</span>
            </span>
            <div className="actions">
              <IconButton
                label="Open idea library"
                onClick={() => setWindow("workspace")}
              >
                <Maximize2 size={15} />
              </IconButton>
              <IconButton
                label="Collapse to island"
                onClick={() => setWindow("island")}
              >
                <Minus size={17} />
              </IconButton>
            </div>
          </header>
          <main className="capture-main">
            <div className="eyebrow">
              <span className="signal" /> A PLACE FOR YOUR NEXT WHAT IF
            </div>
            <h1>
              Catch the spark.
              <br />
              <em>Figure it out later.</em>
            </h1>
            <p className="intro">
              Big idea. Half a thought. Get it out of your head.
            </p>
            <Composer
              onSave={save}
              settings={library.settings}
              ready={ready}
              notify={notify}
              onSettings={openSettings}
              compact
            />
            <div className="capture-recent">
              <div className="section-label">
                RECENTLY CAPTURED <span>{todayCount} today</span>
              </div>
              {library.ideas.slice(0, 3).map((item) => (
                <button
                  className="recent-item"
                  key={item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setSection(item.stage);
                    setWindow("workspace");
                  }}
                >
                  <span>{item.title}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
              {library.ideas.length === 0 && (
                <p className="muted small-text">
                  Your ideas will be waiting here when you’re ready.
                </p>
              )}
            </div>
          </main>
          <footer className="capture-footer">
            <span>
              <ShieldCheck size={13} /> Saved on this device
            </span>
            <button onClick={() => setWindow("workspace")}>
              Idea library <ArrowRight size={14} />
            </button>
          </footer>
        </>
      ) : (
        <>
          <aside className="sidebar">
            <div className="brand">
              <Mark />{" "}
              <span>
                saasfactory<span className="brand-dot">.</span>
              </span>
            </div>
            <button
              className="new-idea"
              onClick={() => {
                setComposing(true);
                setSection("inbox");
              }}
            >
              <Plus size={17} /> Capture an idea <kbd>⌘ N</kbd>
            </button>
            <div className="nav-label">YOUR THINKING SPACE</div>
            <nav aria-label="Library navigation">
              {(
                [
                  ["inbox", Inbox, "All ideas"],
                  ["shortlist", Star, "Shortlist"],
                  ["archive", Archive, "On the shelf"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  className={section === value ? "active" : ""}
                  onClick={() => {
                    setSection(value);
                    setSelected(undefined);
                    setComposing(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <span className="nav-count">
                    {
                      library.ideas.filter((item) => item.stage === value)
                        .length
                    }
                  </span>
                </button>
              ))}
            </nav>
            <div className="sidebar-note">
              <span className="tiny-orbit">✳</span>
              <p>
                Capture freely.
                <br />
                Commit thoughtfully.
              </p>
              <span>
                {promising
                  ? `${promising} ${promising === 1 ? "idea looks" : "ideas look"} worth a closer look.`
                  : "The next good idea starts with a little space."}
              </span>
            </div>
            <div className="sidebar-bottom">
              <button
                className={`settings-nav ${section === "settings" ? "active" : ""}`}
                onClick={openSettings}
              >
                <Settings2 size={16} /> Settings & connections
              </button>
              <button className="provider-summary" onClick={openSettings}>
                <span className={`signal ${ready ? "" : "offline"}`} />
                <span>
                  {names[library.settings.provider]}
                  <small>
                    {ready
                      ? "Your account · your limits"
                      : "Connect your subscription"}
                  </small>
                </span>
                <ChevronDown size={13} />
              </button>
            </div>
          </aside>
          <div className="workspace">
            <header className="titlebar">
              <span>
                <span className="muted">Your workspace</span>
                <span className="breadcrumb">/</span>
                {section === "settings"
                  ? "Settings"
                  : section === "shortlist"
                    ? "Shortlist"
                    : section === "archive"
                      ? "On the shelf"
                      : "Ideas"}
              </span>
              <div className="actions">
                {isPreview && <Badge>Browser preview</Badge>}
                <span className="local-indicator">
                  <span className="signal" /> Local library
                </span>
                <IconButton
                  label="Open quick capture"
                  onClick={() => setWindow("capture")}
                >
                  <Maximize2 size={14} />
                </IconButton>
                <IconButton
                  label="Collapse to island"
                  onClick={() => setWindow("island")}
                >
                  <Minus size={18} />
                </IconButton>
              </div>
            </header>
            {run && (
              <div className="run-banner" role="status">
                <LoaderCircle size={15} className="spin" />
                <span>
                  {CODEX_TASKS[run.mode].label}
                  {run.model ? ` · ${modelLabel(run.model)}` : ""} ·{" "}
                  {run.message}
                </span>
                <button
                  onClick={() =>
                    void api
                      .cancel()
                      .catch((error) => notify(errorMessage(error)))
                  }
                >
                  Stop <Square size={11} />
                </button>
              </div>
            )}
            {section === "settings" ? (
              <SettingsView
                settings={library.settings}
                providers={providers}
                refreshProviders={refreshProviders}
                notify={notify}
                library={library}
              />
            ) : (
              <div className="workspace-content">
                {library.ideas.length > 0 && (
                  <aside className="idea-list">
                    <div className="list-heading">
                      <h2>
                        {section === "shortlist"
                          ? "The contenders"
                          : section === "archive"
                            ? "On the shelf"
                            : "Your ideas"}{" "}
                        <span>{visible.length}</span>
                      </h2>
                      <IconButton
                        label="New idea"
                        onClick={() => setComposing(true)}
                      >
                        <Plus size={17} />
                      </IconButton>
                    </div>
                    <label className="search">
                      <Search size={15} />
                      <input
                        aria-label="Search ideas"
                        placeholder="Find a thought…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <div className="list-controls">
                      <select
                        aria-label="Sort ideas"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="newest">Newest first</option>
                        <option value="score">Highest opportunity</option>
                        <option value="effort">Smallest build</option>
                      </select>
                      <label
                        title={`Pursue verdict and rating ≥ ${library.settings.shortlistThreshold}`}
                      >
                        <input
                          type="checkbox"
                          checked={onlyPromising}
                          onChange={(e) => setOnlyPromising(e.target.checked)}
                        />{" "}
                        Promising
                      </label>
                    </div>
                    <div className="idea-list-scroll">
                      {visible.map((item) => {
                        const report = currentReport(item);
                        return (
                          <button
                            className={`idea-row ${selected === item.id && !composing ? "selected" : ""}`}
                            key={item.id}
                            onClick={() => {
                              setSelected(item.id);
                              setComposing(false);
                            }}
                          >
                            <div className="idea-row-top">
                              <span>{date(item.createdAt)}</span>
                              {report ? (
                                <span
                                  className={`verdict-dot ${report.analysis.verdict}`}
                                />
                              ) : (
                                <span>Captured</span>
                              )}
                            </div>
                            <h3>{item.title}</h3>
                            <p>{item.body}</p>
                            <div className="idea-row-bottom">
                              {report ? (
                                <>
                                  <span>
                                    {report.mode === "quick"
                                      ? "First impression"
                                      : "Researched"}
                                  </span>
                                  <span>
                                    {report.analysis.score ?? "—"}
                                    <small>/100</small>
                                  </span>
                                </>
                              ) : (
                                <span>
                                  Ready when you are <ArrowRight size={12} />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {visible.length === 0 && (
                        <div className="list-empty">
                          <Search size={22} />
                          <p>
                            {query || onlyPromising
                              ? "No ideas match these filters."
                              : section === "shortlist"
                                ? "Save your strongest ideas here."
                                : "Nothing here yet."}
                          </p>
                          {(query || onlyPromising) && (
                            <button
                              onClick={() => {
                                setQuery("");
                                setOnlyPromising(false);
                              }}
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </aside>
                )}
                <main className="detail-pane">
                  {composing || !idea ? (
                    <div
                      className={`welcome ${library.ideas.length ? "has-ideas" : ""}`}
                    >
                      <div className="eyebrow">
                        <span className="signal" /> ROOM TO THINK
                      </div>
                      <h1>
                        {section === "archive" ? (
                          <>
                            Every idea has
                            <br />
                            <em>its own timing.</em>
                          </>
                        ) : (
                          <>
                            A small spark.
                            <br />
                            <em>A real possibility.</em>
                          </>
                        )}
                      </h1>
                      <p className="intro">
                        A home for your SaaS ideas. Capture the rough thought,
                        <br className="wide-only" /> find the useful angle, and
                        see what holds up.
                      </p>
                      <Composer
                        onSave={save}
                        settings={library.settings}
                        ready={ready}
                        notify={notify}
                        onSettings={openSettings}
                      />
                      <div className="workflow">
                        <div>
                          <span>01</span>
                          <h3>Catch it</h3>
                          <p>
                            Write or dictate. It’s saved.
                            <br />
                            No rabbit holes required.
                          </p>
                        </div>
                        <div>
                          <span>02</span>
                          <h3>Give it a glance</h3>
                          <p>
                            A quick, honest first take.
                            <br />A signal, not a promise.
                          </p>
                        </div>
                        <div>
                          <span>03</span>
                          <h3>Follow the evidence</h3>
                          <p>
                            Competitors. Gaps. A next step.
                            <br />
                            Research when you choose.
                          </p>
                        </div>
                      </div>
                      <div className="welcome-bottom">
                        <ShieldCheck size={14} />
                        <span>
                          Local first. Your provider account. Your pace.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <IdeaDetail
                      key={idea.id}
                      idea={idea}
                      library={library}
                      ready={ready}
                      notify={notify}
                      onSettings={openSettings}
                    />
                  )}
                </main>
              </div>
            )}
          </div>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function Composer({
  onSave,
  settings,
  ready,
  notify,
  onSettings,
  compact = false,
}: {
  onSave: (body: string) => Promise<Idea>;
  settings: Settings;
  ready: boolean;
  notify: Notice;
  onSettings: () => void;
  compact?: boolean;
}) {
  const [body, setBody] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [saving, setSaving] = useState(false);
  const [voiceState, setVoiceState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const alive = useRef(true);
  useEffect(() => {
    localStorage.setItem(draftKey, body);
  }, [body]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(recordingTimer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const save = async () => {
    if (!body.trim() || saving || voiceState !== "idle") return;
    setSaving(true);
    try {
      await onSave(body.trim());
      localStorage.removeItem(draftKey);
      setBody("");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const voice = async () => {
    if (voiceState === "recording") {
      recorder.current?.stop();
      return;
    }
    if (isPreview || !settings.voice.modelPath) {
      notify(
        "Set up local dictation in Settings, or use your system’s dictation shortcut in the text box.",
      );
      onSettings();
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!alive.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        return;
      }
      const recording = new MediaRecorder(stream.current);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onstop = () => {
        clearTimeout(recordingTimer.current);
        stream.current?.getTracks().forEach((track) => track.stop());
        if (!alive.current) return;
        setVoiceState("transcribing");
        void new Blob(chunks, { type: recording.mimeType })
          .arrayBuffer()
          .then((audio) => api.transcribe(audio))
          .then((text) => {
            if (alive.current)
              setBody((previous) =>
                `${previous}${previous ? "\n" : ""}${text}`.slice(0, 8000),
              );
          })
          .catch((error) => notify(errorMessage(error)))
          .finally(() => {
            if (alive.current) setVoiceState("idle");
          });
      };
      recording.start();
      setVoiceState("recording");
      recordingTimer.current = setTimeout(() => {
        if (recording.state === "recording") recording.stop();
      }, 120000);
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setVoiceState("idle");
      notify(`Microphone: ${errorMessage(error)}`);
    }
  };
  return (
    <div className={`composer-wrap ${compact ? "compact" : ""}`}>
      <div
        className={`composer ${voiceState === "recording" ? "recording" : ""}`}
      >
        <label className="sr-only" htmlFor="idea-input">
          Your SaaS idea
        </label>
        <textarea
          id="idea-input"
          autoFocus
          placeholder="What if there was a way to…"
          value={body}
          maxLength={8000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="composer-tools">
          <button
            className={`voice-button ${voiceState === "recording" ? "recording" : ""}`}
            onClick={() => void voice()}
            disabled={voiceState === "transcribing"}
          >
            {voiceState === "recording" ? (
              <Square size={14} />
            ) : voiceState === "transcribing" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Mic size={16} />
            )}
            <span>
              {voiceState === "recording"
                ? "Stop recording"
                : voiceState === "transcribing"
                  ? "Transcribing locally…"
                  : "Dictate"}
            </span>
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={!body.trim() || saving || voiceState !== "idle"}
          >
            {saving ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <>
                Save idea <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
      <div className="composer-caption">
        <span>
          {settings.autoQuick
            ? `Quick check after saving · ${names[settings.provider]}${ready ? "" : " needs connection"}`
            : "Just capture. Research starts when you say so."}
        </span>
        {!compact && <kbd>⌘ / Ctrl ↵</kbd>}
      </div>
    </div>
  );
}

function IdeaDetail({
  idea,
  library,
  ready,
  notify,
  onSettings,
}: {
  idea: Idea;
  library: Library;
  ready: boolean;
  notify: Notice;
  onSettings: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [reportId, setReportId] = useState("");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(idea.body);
  const [title, setTitle] = useState(idea.title);
  const notesKey = `saasfactory-notes-draft-${idea.id}`;
  const [notes, setNotes] = useState(
    () => localStorage.getItem(notesKey) ?? idea.notes,
  );
  useEffect(() => {
    if (notes === idea.notes) localStorage.removeItem(notesKey);
    else localStorage.setItem(notesKey, notes);
  }, [notes, idea.notes, notesKey]);
  const [busy, setBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"deep" | "challenge">();
  const canChallenge =
    library.settings.provider === "codex" && !!currentReport(idea);
  const runModel = (mode: Mode) =>
    library.settings.provider === "codex"
      ? `${modelLabel(codexSelection(library.settings, mode).model)} · ${CODEX_TASKS[mode].effort} reasoning`
      : names[library.settings.provider];
  const report =
    idea.reports.find((item) => item.id === reportId) ??
    currentReport(idea) ??
    idea.reports[0];
  const stale = report && report.input !== idea.body;
  const a = report?.analysis;
  const active = library.runs.some((item) => item.status === "running");
  const lastRun = library.runs.find((item) => item.ideaId === idea.id);
  const action = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      const result = await fn();
      if (success && result !== null) notify(success);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const analyze = async (mode: Mode) => {
    if (!ready) {
      onSettings();
      notify("Connect your provider account to start a check.");
      return;
    }
    setConfirmMode(undefined);
    setReportId("");
    await action(() => api.analyze(idea.id, mode));
  };
  return (
    <article className="idea-detail">
      <div className="detail-topline">
        <span className="eyebrow">
          CAPTURED {date(idea.createdAt).toUpperCase()}
        </span>
        <div className="actions">
          <IconButton
            label={
              idea.stage === "shortlist"
                ? "Remove from shortlist"
                : "Add to shortlist"
            }
            onClick={() =>
              void action(() =>
                api.edit(idea.id, {
                  stage: idea.stage === "shortlist" ? "inbox" : "shortlist",
                }),
              )
            }
          >
            <Star
              size={16}
              fill={idea.stage === "shortlist" ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            label={
              idea.stage === "archive" ? "Restore to inbox" : "Put on the shelf"
            }
            onClick={() =>
              void action(() =>
                api.edit(idea.id, {
                  stage: idea.stage === "archive" ? "inbox" : "archive",
                }),
              )
            }
          >
            <Archive size={16} />
          </IconButton>
          <IconButton
            label="Export idea brief"
            onClick={() =>
              void action(() => api.exportIdea(idea.id), "Idea brief exported.")
            }
          >
            <ArrowDownToLine size={16} />
          </IconButton>
        </div>
      </div>
      <h1>{idea.title}</h1>
      {editing ? (
        <div className="edit-idea">
          <label>
            Title
            <input
              aria-label="Title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Original idea
            <textarea
              aria-label="Original idea"
              value={body}
              maxLength={8000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="actions">
            <button className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || !title.trim() || !body.trim()}
              onClick={() =>
                void action(async () => {
                  await api.edit(idea.id, { title, body });
                  setEditing(false);
                })
              }
            >
              Save changes
            </button>
          </div>
          <p className="small-text muted">
            Existing reports stay in history. Checks apply to the version they
            analyzed.
          </p>
        </div>
      ) : (
        <div className="original-idea">
          <p>{idea.body}</p>
          <button
            className="text-button"
            onClick={() => {
              setBody(idea.body);
              setTitle(idea.title);
              setEditing(true);
            }}
          >
            Edit thought <FileText size={12} />
          </button>
        </div>
      )}
      <div className="analysis-actions">
        <button
          className="secondary"
          aria-label="Quick check"
          disabled={busy || active}
          onClick={() => void analyze("quick")}
        >
          <span>
            <Zap size={15} /> Quick check
          </span>
          <small>{runModel("quick")}</small>
        </button>
        <button
          className="primary"
          aria-label="Research idea"
          disabled={busy || active}
          onClick={() =>
            ready
              ? setConfirmMode(confirmMode === "deep" ? undefined : "deep")
              : onSettings()
          }
        >
          <span>
            <Compass size={16} /> Research idea
          </span>
          <small>{runModel("deep")}</small>
        </button>
        {library.settings.provider === "codex" && (
          <button
            className="secondary"
            aria-label="Challenge this idea"
            disabled={busy || active || !canChallenge}
            title={
              canChallenge
                ? "Stress-test the latest report for this idea"
                : "Run a quick check or research first"
            }
            onClick={() =>
              ready
                ? setConfirmMode(
                    confirmMode === "challenge" ? undefined : "challenge",
                  )
                : onSettings()
            }
          >
            <span>
              <ShieldCheck size={15} /> Challenge this idea
            </span>
            <small>{runModel("challenge")}</small>
          </button>
        )}
      </div>
      {confirmMode && (
        <div className="research-confirm">
          <h3>
            {confirmMode === "challenge"
              ? "Does this idea stand up to scrutiny?"
              : "Take a closer look?"}
          </h3>
          <p>
            {confirmMode === "challenge"
              ? "Review the latest report for this version of your idea, verify its claims with fresh research, and look for assumptions that could change the verdict. Your idea and previous reports stay saved."
              : "Live competition research, market signals, and a sharper MVP."}{" "}
            Uses your {names[library.settings.provider]} account
            {library.settings.provider === "codex"
              ? ` with ${runModel(confirmMode)}`
              : ""}{" "}
            for up to 10 minutes. Your provider’s limits and extra-usage
            settings apply.
          </p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => setConfirmMode(undefined)}
            >
              Later
            </button>
            <button
              className="primary"
              disabled={
                busy || active || (confirmMode === "challenge" && !canChallenge)
              }
              onClick={() => void analyze(confirmMode)}
            >
              {confirmMode === "challenge"
                ? "Start challenge"
                : "Start research"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
      {lastRun &&
        ["failed", "cancelled", "interrupted"].includes(lastRun.status) && (
          <div className="inline-notice" role="status">
            {lastRun.message}
          </div>
        )}
      {!a ? (
        <div className="unreviewed">
          <span className="illustration-orbit">
            <Sparkles size={25} />
          </span>
          <h2>A thought with room to grow.</h2>
          <p>
            Start with a quick check for a sharper idea, an honest first
            impression, and a sense of the build. Research the market when
            you’re ready.
          </p>
          <div className="check-dimensions">
            <span>
              <Check size={13} /> Problem & buyer
            </span>
            <span>
              <Check size={13} /> Feasibility
            </span>
            <span>
              <Check size={13} /> A next step
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="report-meta">
            <Badge tone={report?.mode === "quick" ? "amber" : "green"}>
              {report?.mode === "quick"
                ? "Preliminary · not validated"
                : report?.mode === "challenge"
                  ? "Challenge review"
                  : "Research report"}
            </Badge>
            <select
              aria-label="Report history"
              value={report?.id}
              onChange={(e) => setReportId(e.target.value)}
            >
              {idea.reports.map((item) => (
                <option key={item.id} value={item.id}>
                  {CODEX_TASKS[item.mode].label} · {date(item.createdAt)} ·{" "}
                  {item.model ? modelLabel(item.model) : names[item.provider]}
                </option>
              ))}
            </select>
          </div>
          {report?.model && (
            <p className="report-model">
              {modelLabel(report.model)}
              {report.reasoningEffort
                ? ` · ${report.reasoningEffort} reasoning`
                : ""}
              {report.basedOnReportId
                ? " · Second opinion on an earlier report"
                : ""}
            </p>
          )}
          {stale && (
            <div className="inline-notice">
              This report analyzed an older version of your idea. Run a new
              check for your latest changes.
            </div>
          )}
          <nav className="report-tabs" aria-label="Report sections">
            {[
              ["overview", "The verdict"],
              ["market", "The market"],
              ["build", "The build"],
              ["names", "Names & domains"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value!)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "overview" && (
            <div className="report-section">
              <div className={`verdict-card ${a.verdict}`}>
                <div>
                  <div className="eyebrow">
                    {report?.mode === "quick"
                      ? "FIRST IMPRESSION"
                      : report?.mode === "challenge"
                        ? "CHALLENGE VERDICT"
                        : "RESEARCH VERDICT"}
                  </div>
                  <h2>{verdicts[a.verdict]}</h2>
                  <p>{a.reasoning}</p>
                </div>
                <div className="score">
                  <strong>{a.score ?? "—"}</strong>
                  <span>
                    opportunity
                    <br />
                    out of 100
                  </span>
                </div>
              </div>
              <div className="confidence-note">
                <CircleHelp size={13} />
                <span>
                  {a.confidence} evidence confidence · Rating is not a success
                  probability.
                </span>
              </div>
              <Block title="A sharper version" icon={<Sparkles size={16} />}>
                <p className="refined-text">{a.improvedIdea}</p>
              </Block>
              <div className="two-columns">
                <Block title="Who pays for this">
                  <p>{a.audience}</p>
                </Block>
                <Block title="The pain worth solving">
                  <p>{a.problem}</p>
                </Block>
              </div>
              <div className="two-columns">
                <Block title="What works" tone="green">
                  <BulletList items={a.strengths} />
                </Block>
                <Block title="What gives us pause" tone="amber">
                  <BulletList items={a.risks} />
                </Block>
              </div>
              <Block title="Still needs an answer">
                <BulletList items={a.unknowns} />
              </Block>
              <div className="experiment">
                <span className="eyebrow">BEFORE YOU BUILD ANYTHING</span>
                <h3>Your next small experiment</h3>
                <p>{a.experiment.action}</p>
                <div>
                  <Check size={15} />
                  <span>{a.experiment.successCriteria}</span>
                </div>
              </div>
            </div>
          )}
          {tab === "market" && (
            <div className="report-section">
              <Block title={markets[a.market]} icon={<Globe2 size={17} />}>
                <p>{a.wedge}</p>
                {report?.mode === "quick" && (
                  <p className="muted">
                    Quick checks don’t search the web. Start research for
                    current competition and demand evidence.
                  </p>
                )}
              </Block>
              <Block title={`Competitive landscape · ${a.competitors.length}`}>
                <div className="competitors">
                  {a.competitors.map((c) => (
                    <div key={c.url} className="competitor">
                      <button
                        onClick={() =>
                          void api
                            .openExternal(c.url)
                            .catch((error) => notify(errorMessage(error)))
                        }
                      >
                        {c.name}
                        <ArrowUpRight size={14} />
                      </button>
                      <p>{c.description}</p>
                      <span>{c.pricing}</span>
                    </div>
                  ))}
                  {a.competitors.length === 0 && (
                    <p>
                      No researched competitors in this report. This does not
                      establish an empty market.
                    </p>
                  )}
                </div>
              </Block>
              <div className="two-columns">
                <Block title="How it could earn">
                  <p>{a.monetization}</p>
                </Block>
                <Block title="How people find it">
                  <p>{a.acquisition}</p>
                </Block>
              </div>
              <Block title={`Evidence trail · ${a.sources.length} sources`}>
                <p className="small-text muted">
                  AI-selected sources support the assessment; they are not
                  independent verification of every claim.
                </p>
                {a.sources.map((source, index) => (
                  <button
                    className="source"
                    key={`${source.url}-${index}`}
                    onClick={() =>
                      void api
                        .openExternal(source.url)
                        .catch((error) => notify(errorMessage(error)))
                    }
                  >
                    <span className="source-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{source.title}</strong>
                      <small>{source.finding}</small>
                      <em>{new URL(source.url).hostname}</em>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </Block>
            </div>
          )}
          {tab === "build" && (
            <div className="report-section">
              <div className="effort-card">
                <span className="eyebrow">IMPLEMENTATION EFFORT</span>
                <h2>
                  {a.effort.level === "small"
                    ? "Start small. Ship something useful."
                    : a.effort.level === "medium"
                      ? "Manageable, with a focused scope."
                      : "A substantial build. Validate first."}
                </h2>
                <Badge>{a.effort.estimate}</Badge>
                <p>{a.effort.reasoning}</p>
              </div>
              <Block title="The smallest useful version">
                <ol className="feature-list">
                  {a.features.map((f, i) => (
                    <li key={i}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {f}
                    </li>
                  ))}
                </ol>
              </Block>
              <Block title="Dependencies & complexity">
                <BulletList items={a.effort.dependencies} />
              </Block>
              <Block title="Your entry point">
                <p>{a.wedge}</p>
              </Block>
              <div className="inline-notice">
                Build estimates are planning assumptions. Your skills,
                integrations, testing, and ongoing support change the real
                effort.
              </div>
            </div>
          )}
          {tab === "names" && (
            <Domains idea={idea} analysis={a} notify={notify} />
          )}
        </>
      )}
      <section className="personal-notes">
        <label htmlFor="idea-notes">
          Your notes <span>Keep the things only you know.</span>
        </label>
        <textarea
          id="idea-notes"
          placeholder="Customer conversations, a different angle, a reason to come back…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={20000}
        />
        <button
          className="text-button"
          disabled={notes === idea.notes || busy}
          onClick={() =>
            void action(() => api.edit(idea.id, { notes }), "Notes saved.")
          }
        >
          Save notes <Check size={13} />
        </button>
      </section>
    </article>
  );
}

function Block({
  title,
  children,
  icon,
  tone = "",
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <section className={`report-block ${tone}`}>
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="bullet-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Domains({
  idea,
  analysis,
  notify,
}: {
  idea: Idea;
  analysis: Analysis;
  notify: Notice;
}) {
  const [custom, setCustom] = useState("");
  const [checking, setChecking] = useState(false);
  const check = async (domains: string[]) => {
    setChecking(true);
    try {
      await api.domains(idea.id, domains);
      notify("Domain checks updated.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setChecking(false);
    }
  };
  const candidates = [
    ...analysis.names,
    ...idea.domains
      .filter((d) => !analysis.names.some((n) => n.domain === d.domain))
      .map((d) => ({
        name: d.domain.split(".")[0]!,
        domain: d.domain,
        rationale: "Your domain idea",
      })),
  ];
  return (
    <div className="report-section">
      <Block title="Give the idea a name" icon={<Sparkles size={16} />}>
        <p>
          Names inspired by the problem, its promise, and a few adjacent words.
          Suggestions are not trademark or availability checks.
        </p>
        <button
          className="secondary"
          disabled={checking || analysis.names.length === 0}
          onClick={() => void check(analysis.names.map((item) => item.domain))}
        >
          {checking ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Globe2 size={14} />
          )}{" "}
          Check suggested domains
        </button>
      </Block>
      <div className="domain-grid">
        {candidates.map((item) => {
          const result = idea.domains.find((d) => d.domain === item.domain);
          return (
            <div className="domain-card" key={item.domain}>
              <div>
                <h3>{item.name}</h3>
                <Badge
                  tone={
                    result?.status === "available"
                      ? "green"
                      : result?.status === "registered"
                        ? "amber"
                        : ""
                  }
                >
                  {result?.status === "available"
                    ? "Available"
                    : result?.status === "registered"
                      ? "Registered"
                      : result
                        ? "Unconfirmed"
                        : "Unchecked"}
                </Badge>
              </div>
              <strong>{item.domain}</strong>
              <p>{item.rationale}</p>
              {result && (
                <>
                  <small>{result.detail}</small>
                  <span className="checked-date">
                    Checked {date(result.checkedAt)}
                    {result.price
                      ? ` · ${result.price.registration} ${result.price.currency} first year · ${result.price.renewal} renewal`
                      : ""}
                  </span>
                </>
              )}
              <button
                className="text-button"
                onClick={() =>
                  void api
                    .openExternal(
                      `https://porkbun.com/checkout/search?q=${encodeURIComponent(item.domain)}`,
                    )
                    .catch((error) => notify(errorMessage(error)))
                }
              >
                Check with registrar <ArrowUpRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <form
        className="custom-domain"
        onSubmit={(e) => {
          e.preventDefault();
          void check([custom]);
        }}
      >
        <label htmlFor="domain-input">A name of your own?</label>
        <div>
          <input
            id="domain-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="yourlittleidea.com"
          />
          <button className="secondary" disabled={checking || !custom.trim()}>
            Check
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsView({
  settings,
  providers,
  refreshProviders,
  notify,
  library,
}: {
  settings: Settings;
  providers: ProviderStatus[];
  refreshProviders: () => Promise<void>;
  notify: Notice;
  library: Library;
}) {
  const [draft, setDraft] = useState(() => {
    try {
      return SettingsSchema.parse(
        JSON.parse(
          sessionStorage.getItem("saasfactory-settings-draft") ?? "null",
        ),
      );
    } catch {
      return settings;
    }
  });
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<ProviderId>();
  const [disconnecting, setDisconnecting] = useState<ProviderId>();
  const checking = library.runs.some((run) => run.status === "running");
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  useEffect(() => {
    if (dirty)
      sessionStorage.setItem(
        "saasfactory-settings-draft",
        JSON.stringify(draft),
      );
    else sessionStorage.removeItem("saasfactory-settings-draft");
  }, [draft, dirty]);
  const save = async () => {
    setSaving(true);
    try {
      await api.settings(draft);
      notify("Settings saved.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const connect = async (id: ProviderId) => {
    setConnecting(id);
    try {
      notify("Complete sign-in in your browser. This may take a moment.");
      notify(await api.connect(id));
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      await refreshProviders();
      setConnecting(undefined);
    }
  };
  const disconnect = async (id: ProviderId) => {
    setDisconnecting(id);
    try {
      await api.disconnect(id);
      notify(`${names[id]} disconnected. Your ideas and reports are saved.`);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      await refreshProviders();
      setDisconnecting(undefined);
    }
  };
  const used = library.runs.filter((run) =>
    run.startedAt.startsWith(new Date().toISOString().slice(0, 10)),
  ).length;
  return (
    <main className="settings-view">
      <div className="settings-heading">
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>
          Your tools.
          <br />
          <em>Your way of thinking.</em>
        </h1>
        <p>
          Bring the account you already use. Keep control of when the work
          begins.
        </p>
      </div>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Choose your thinking partner</h2>
          <button
            className="text-button"
            onClick={() => void refreshProviders()}
          >
            Refresh status
          </button>
        </div>
        <p className="muted small-text">
          Official agent SDKs. No model API-key fallback. Account limits, plan
          pools, and provider-enabled overages still apply.
        </p>
        {checking && (
          <p className="muted small-text">
            Stop the current check before changing accounts.
          </p>
        )}
        <div className="provider-grid">
          {(["codex", "claude", "cursor", "xai"] as const).map((id) => {
            const status = providers.find((item) => item.id === id);
            return (
              <div
                className={`provider-card ${draft.provider === id ? "chosen" : ""}`}
                key={id}
              >
                <div className="provider-card-head">
                  <span className={`provider-icon ${id}`}>
                    {id === "claude"
                      ? "✳"
                      : id === "codex"
                        ? "◉"
                        : id === "cursor"
                          ? "↗"
                          : "𝕏"}
                  </span>
                  <strong>{names[id]}</strong>
                  <input
                    type="radio"
                    aria-label={`Use ${names[id]}`}
                    name="provider"
                    checked={draft.provider === id}
                    disabled={id === "xai"}
                    onChange={() => setDraft({ ...draft, provider: id })}
                  />
                </div>
                <Badge tone={status?.state === "ready" ? "green" : ""}>
                  {id === "xai"
                    ? "Subscription route unavailable"
                    : status?.state === "ready"
                      ? "Account connected"
                      : "Connect account"}
                </Badge>
                <p>{status?.detail ?? "Checking local setup…"}</p>
                <div className="provider-account-actions">
                  {id !== "xai" && (
                    <button
                      className="secondary"
                      disabled={!!connecting || !!disconnecting || checking}
                      onClick={() => void connect(id)}
                    >
                      {connecting === id ? (
                        <>
                          <LoaderCircle size={13} className="spin" /> Waiting
                          for sign-in…
                        </>
                      ) : (
                        <>
                          {status?.state === "ready" ? "Reconnect" : "Connect"}{" "}
                          <ArrowUpRight size={13} />
                        </>
                      )}
                    </button>
                  )}
                  {connecting === id && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void api
                          .cancelConnect()
                          .catch((error) => notify(errorMessage(error)))
                      }
                    >
                      Cancel sign-in
                    </button>
                  )}
                  {status?.state === "ready" && (
                    <button
                      className="text-button"
                      disabled={!!connecting || !!disconnecting || checking}
                      onClick={() => void disconnect(id)}
                    >
                      {disconnecting === id
                        ? "Disconnecting…"
                        : `Disconnect ${names[id]}`}
                    </button>
                  )}
                </div>
                {id === "cursor" && status?.state === "ready" && (
                  <p className="muted small-text">
                    Disconnect clears the shared Cursor SDK login on this
                    computer. Revoke the key in Cursor to end its access
                    everywhere.
                  </p>
                )}
                <button
                  className="text-button provider-doc"
                  onClick={() =>
                    void api
                      .openExternal(
                        id === "codex"
                          ? "https://learn.chatgpt.com/docs/auth"
                          : id === "claude"
                            ? "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan"
                            : id === "cursor"
                              ? "https://cursor.com/docs/sdk/typescript"
                              : "https://docs.x.ai/developers/quickstart",
                      )
                      .catch((error) => notify(errorMessage(error)))
                  }
                >
                  Provider access & billing <ArrowUpRight size={11} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="settings-footnote">
          Claude and Codex runtimes are included. Sign in here even if you
          already use their terminal apps. Cursor also uses a separate SDK
          login. Your credentials stay on this device, outside your idea
          backups.
        </p>
      </section>
      <section className="settings-section">
        <h2>A pace that works for you</h2>
        <label className="toggle-row">
          <span>
            <strong>Quick check after capture</strong>
            <small>
              Off by default. One short first impression; deep research always
              needs your click.
            </small>
          </span>
          <input
            type="checkbox"
            checked={draft.autoQuick}
            onChange={(e) =>
              setDraft({ ...draft, autoQuick: e.target.checked })
            }
          />
        </label>
        <div className="settings-fields">
          <label>
            Daily check limit{" "}
            <span>{used} used today · resets at 00:00 UTC</span>
            <input
              type="number"
              min="1"
              max="100"
              value={draft.dailyRunLimit}
              onChange={(e) =>
                setDraft({ ...draft, dailyRunLimit: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Promising-idea threshold{" "}
            <span>Opportunity rating, not success probability</span>
            <input
              type="number"
              min="0"
              max="100"
              value={draft.shortlistThreshold}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  shortlistThreshold: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <p className="settings-footnote">
          This is a local run-count guard, not a billing cap. SaasFactory does
          not know your remaining subscription balance. Manage extra usage with
          your provider.
        </p>
      </section>
      <section className="settings-section">
        <h2>A little about the builder</h2>
        <p className="muted small-text">
          Used to make the scope and implementation estimates fit you.
        </p>
        <label className="field">
          Your skills & constraints
          <textarea
            placeholder="e.g. TypeScript and product design. Solo builder, no sales team."
            value={draft.founder.skills}
            maxLength={1000}
            onChange={(e) =>
              setDraft({
                ...draft,
                founder: { ...draft.founder, skills: e.target.value },
              })
            }
          />
        </label>
        <div className="settings-fields">
          <label>
            Hours each week
            <input
              type="number"
              min="1"
              max="100"
              value={draft.founder.hoursPerWeek}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  founder: {
                    ...draft.founder,
                    hoursPerWeek: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Initial budget
            <input
              placeholder="e.g. €500"
              value={draft.founder.budget}
              maxLength={200}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  founder: { ...draft.founder, budget: e.target.value },
                })
              }
            />
          </label>
        </div>
      </section>
      <section className="settings-section">
        <h2>Local dictation</h2>
        <p className="muted small-text">
          Record up to two minutes. Whisper transcribes on your device;
          temporary audio is deleted afterward. Install whisper.cpp and ffmpeg,
          then select a GGML model. You can also use system dictation directly
          in any text box.
        </p>
        {(["whisperPath", "ffmpegPath", "modelPath"] as const).map((kind) => (
          <label className="path-field" key={kind}>
            {kind === "modelPath"
              ? "Whisper model (.bin)"
              : kind === "whisperPath"
                ? "whisper-cli executable"
                : "ffmpeg executable"}
            <div>
              <input
                value={draft.voice[kind]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    voice: { ...draft.voice, [kind]: e.target.value },
                  })
                }
              />
              <button
                className="secondary"
                onClick={() =>
                  void api
                    .chooseVoiceFile(kind)
                    .then((file) => {
                      if (file)
                        setDraft((current) => ({
                          ...current,
                          voice: { ...current.voice, [kind]: file },
                        }));
                    })
                    .catch((error) => notify(errorMessage(error)))
                }
              >
                Browse
              </button>
            </div>
          </label>
        ))}
        <button
          className="text-button"
          onClick={() =>
            void api
              .openExternal("https://github.com/ggml-org/whisper.cpp")
              .catch((error) => notify(errorMessage(error)))
          }
        >
          Local voice setup <ArrowUpRight size={12} />
        </button>
      </section>
      <section className="settings-section">
        <h2>Models matched to the task</h2>
        <p className="muted small-text">
          By default, Codex uses Luna for quick checks, Sol for research, and
          Astra when you explicitly challenge an idea. Saving an idea never
          starts research or a challenge. Change a model below if your account
          or preferences differ.
        </p>
        <datalist id="codex-model-options">
          {Object.entries(CODEX_MODELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </datalist>
        {(["quick", "deep", "challenge"] as const).map((mode) => (
          <label className="field" key={mode}>
            Codex · {CODEX_TASKS[mode].label} · {CODEX_TASKS[mode].effort}{" "}
            reasoning
            <input
              aria-label={`Codex ${CODEX_TASKS[mode].label} model`}
              list="codex-model-options"
              value={draft.codexModels[mode]}
              maxLength={100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  codexModels: { ...draft.codexModels, [mode]: e.target.value },
                })
              }
            />
          </label>
        ))}
        <button
          className="text-button"
          onClick={() =>
            setDraft({
              ...draft,
              codexModels: {
                quick: CODEX_TASKS.quick.model,
                deep: CODEX_TASKS.deep.model,
                challenge: CODEX_TASKS.challenge.model,
              },
            })
          }
        >
          Restore recommended Codex models
        </button>
        <p className="muted small-text">
          Claude and Cursor: leave blank for the provider default. Cursor
          selects the first available account model. Unavailable models produce
          a clear error; there is no automatic switch to another model or API
          billing.
        </p>
        {(["claude", "cursor"] as const).map((id) => (
          <label className="field" key={id}>
            {names[id]}
            <input
              placeholder="Provider default"
              value={draft.models[id]}
              maxLength={100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  models: { ...draft.models, [id]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </section>
      <section className="settings-section">
        <h2>Your ideas belong to you</h2>
        <p className="muted small-text">
          Ideas and reports are stored locally. Only checks you start send an
          idea and your builder profile to the selected provider. Web research
          sends search queries; domain lookups send domain names. Backups
          include your ideas and settings, never provider credentials.
        </p>
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              void api
                .backup()
                .then((file) => {
                  if (file) notify("Library backup exported.");
                })
                .catch((error) => notify(errorMessage(error)))
            }
          >
            <ArrowDownToLine size={15} /> Export backup
          </button>
          <button
            className="secondary"
            onClick={() =>
              void api
                .restore()
                .then((count) => {
                  if (count !== null)
                    notify(
                      `${count} new ideas imported. Existing ideas and settings were preserved.`,
                    );
                })
                .catch((error) => notify(errorMessage(error)))
            }
          >
            Import backup
          </button>
        </div>
      </section>
      <footer className="settings-save">
        <span>
          {dirty ? "You have unsaved changes" : "Everything is up to date"}
        </span>
        <button
          className="primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Check size={14} />
          )}{" "}
          Save settings
        </button>
      </footer>
    </main>
  );
}
