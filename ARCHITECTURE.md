# SaasFactory architecture

The repository has two independent entry points: a local desktop idea workspace and the original SaaS-generation CLI. The desktop deliberately does not invoke the CLI wizard on capture.

## Desktop boundaries

```text
React renderer (desktop/src)
        │ validated, named IPC calls
Sandboxed preload (src/desktop/preload.ts)
        │ sender + main-frame + origin validation
Electron main (src/desktop/main.ts)
        ├── IdeaService → LibraryStore → local ideas.json
        ├── SubscriptionProviders → official SDK → user's provider account
        ├── domains → existing Vercel integration / registry RDAP
        └── voice → temporary audio → ffmpeg → whisper-cli → transcript
```

The renderer has no Node integration, generic IPC method, or credentials. Context isolation and sandboxing are enabled. Navigation and popup windows are blocked; explicit web links are validated and opened by the OS. A CSP restricts renderer networking. Audio permission is limited to the app's own main content. Exports and imports use native file dialogs.

`main.ts` owns the single-instance lock, tray, global shortcut, and permission handlers. `window-controller.ts` owns the three window modes, native focus state, and edge-constrained dragging; `window-position.ts` clamps geometry to the display work area. A separate `window-position.json` saves the display, left/right edge, and normalized island height. Expanded panels retain that anchor, and disconnected displays fall back to an available display without stealing focus. Native resizes are immediate, avoiding layout reflow during macOS window animation. The renderer uses pointer capture for dragging, event-time screen coordinates through validated IPC, and CSS opacity for unfocused island/capture modes. The library remains opaque. Window close collapses; tray Quit flushes placement, stops active work, and exits.

`island-motion.ts` shares sticky-gesture thresholds and timings. Inward island pulls temporarily widen the transparent native window into a horizontal strip. `IslandSurface.tsx` renders an SVG tether and animates the island with compositor transforms; native bounds stay fixed during flight. Passing the threshold commits the destination edge and releases pointer capture, so subsequent mouse movement cannot steer the flight. The strip ignores mouse input during flight/return, and background animation throttling is suspended only for the gesture. A validated animation ID acknowledges completion; a bounded main-process fallback restores narrow, interactive bounds if rendering stalls. Mode/display changes, renderer failure, and shutdown also clean up motion. System reduced-motion settings skip the flight; the renderer additionally checks its media preference. Capture-panel dragging keeps the ordinary edge behavior.

## Data and execution

`shared.ts` is the Zod-validated contract for ideas, reports, settings, domain checks, runs, and the preload API. Version 1 of the library has:

- Ideas with immutable IDs, original body, title, stage (`inbox`, `shortlist`, `archive`), notes, dates, reports, and domain checks.
- Reports containing the exact analyzed body, mode (`quick`, `deep`, or `challenge`), provider, observed-search flag, date, structured analysis, and source links. New reports include selected model/reasoning effort when known; challenges link to the prior report ID. Up to twenty reports per idea.
- Settings for the provider, models, optional automatic quick checks, UTC daily run limit, shortlist threshold, founder context, and local voice tools.
- Run records for progress, completion, cancellation, failure, and interruption.

`LibraryStore` serializes mutations, validates the whole result, writes and flushes a restricted-permission temporary file, then atomically renames it. Read/schema errors preserve the original file. `recover()` marks running records interrupted without launching anything. Backups merge only new IDs; no destructive restore exists.

`IdeaService.capture()` persists before any optional AI action. `analyze()` synchronously reserves one active slot before asynchronous checks, verifies provider readiness and the daily limit, records the run, and launches bounded work. Quick checks have a 90-second limit; research and challenges have ten minutes. Challenges require Codex and a current-version report, pass that assessment as untrusted context, and store a separate result. They never start automatically. Each generation receives an abort controller. Cancellation waits for readiness/startup as well as execution. `changeAccount()` shares the run guard so connection changes cannot race a check; capture remains available. Reports attach to the original input even if the idea was edited during the run. `currentReport()` excludes mismatched bodies from ranking. Failed/invalid responses do not replace earlier reports.

`analysis.ts` owns prompts and report parsing. Quick mode has no web tools and enforces low confidence, unknown market, and empty evidence/competitor lists. Research and challenge modes require an observed successful search and two distinct source hosts or becomes unproven with no score. This checks minimum evidence presence; it does not establish that every cited claim is correct. There is no success-probability or revenue guarantee.

## Providers

`providers.ts` adapts Claude Agent SDK, Codex SDK, and Cursor SDK to `ProviderGateway`. Both readiness and generation reject unsupported/API-key authentication where distinguishable. Claude and Codex get dedicated configuration directories, a curated subprocess environment without API credentials or custom endpoints, an empty research working directory, and restricted tool configuration. Quick mode exposes no tools. Research and challenge modes expose only web tools; Codex runs read-only with command/edit/agent features disabled and no approvals. Cursor gets an explicit official SDK user credential rather than an inherited environment key.

`model-routing.ts` pins task defaults: Luna/High for quick, Sol/Medium for research, and Astra/High for challenges. Per-task overrides are validated in settings. `SettingsSchema` migrates the old global Codex model to quick/research preferences, preserves other settings, and supplies missing defaults for old libraries. Reports without model metadata remain readable. The renderer, service, provider adapter, and smoke command share this routing.

`provider-schema.ts` derives the shared structural JSON Schema from the application’s Zod contract. Claude structured output and Codex `outputSchema` constrain report shape; Zod still enforces lengths, domains, URLs, and bounds after generation. Codex must emit `turn.completed`; partial output is never accepted as a completed check. Cursor output is validated locally. `provider-errors.ts` maps SDK errors to actionable categories without leaking raw subprocess commands, credentials, or prompts. `provider-abort.ts` bounds Cursor SDK operations without signal support and disposes late results.

Version-matched native Claude/Codex binaries come from the SDK platform packages, falling back to installed executables if unavailable. Packaged paths account for Electron ASAR unpacking. User sign-in is handled by the provider CLI/SDK browser flow. Credentials never travel through IPC. Connect verifies the resulting subscription login; users can cancel sign-in or disconnect locally. Both connect and generation force Claude account/ChatGPT authentication. Cursor rejects custom endpoint overrides and nonproduction stored credentials. Settings expose account readiness, not quota or dollar balance. Grok/SpaceXAI stays unsupported until there is a documented consumer-subscription integration.

`domains.ts` reuses the CLI's Vercel credentials and registrar lookup, with bounded network calls. Its public-registry fallback does not equate RDAP 404 with purchasable availability. `voice.ts` restricts recording size, uses argument arrays instead of a shell, limits subprocess duration, and removes temporary audio.

## UI

`App.tsx` contains the island, capture composer, library, idea detail/report tabs, names/domains, and settings views. No bundled demo reports are automatically inserted into real libraries. Browser preview uses an explicit localStorage adapter with unavailable native actions. Capture and note drafts persist separately; unsaved settings survive navigation for the current renderer session. Fonts ship locally. CSS covers keyboard focus and reduced-motion preferences.

## Original CLI

`src/index.ts` → Commander (`src/cli/index.ts`) → interactive wizard (`prompts.ts`) → shared project context → generator and template modules. AI modules in `src/ai` remain Claude CLI based. `research.ts` supports quick/full/URL competition research and resumable session metadata. `integrations` handles domain, Git, GitHub, and Vercel operations. `modules` generates Next.js/Convex/Clerk/Stripe starter code; it is not part of the desktop renderer or the analysis execution path.

The original architecture document described removed functions and older wizard states. The current CLI's `WizardState` union and transition handlers in `src/cli/index.ts` are the authority for that flow. Legacy caveats are tracked in [docs/LEGACY_AUDIT.md](docs/LEGACY_AUDIT.md).

## Build and tests

- `scripts/desktop-build.mjs`: esbuild for Electron main/preload; Vite for React.
- `scripts/desktop-dev.mjs`: main build, local Vite server, Electron process lifecycle.
- `electron-builder.yml`: OS installer targets and SDK binary unpacking.
- `tests/desktop`: deterministic service, persistence, evidence, environment, and registrar tests.
- `tests/e2e`: Chrome user flows and actual Electron geometry/IPC/restart verification.
- Existing `tests/context`, `file-system`, and `errors` coverage remains.

Unit and browser/native integration tests do not call a paid model or assume an authenticated subscription. The opt-in `test:provider` smoke command uses the connected subscription and records its selected model/effort. Native builds and real account use need per-platform acceptance checks.
