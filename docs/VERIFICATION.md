# Desktop verification

Verification is split between deterministic behavior, UI/native behavior, and external integrations. A passing mock-provider test is not proof of a live subscription request.

## Covered locally

- Strict TypeScript checks for existing CLI, Electron, and React.
- Existing context, filesystem, and error tests.
- Local capture without any provider call; concurrent writes; reopening persisted data; corrupt-file preservation; backup merge/deduplication.
- One-run concurrency, daily limits, failed-response preservation, abort/cancel, interrupted-run recovery, stale report exclusion.
- Quick-vs-deep evidence rules, malformed output rejection, unsafe URL rejection, and removal of inherited API credentials.
- Domain RDAP unknown/registered behavior, failed lookups, and use of the existing registrar adapter.
- Chrome flows for capture, reload, shortlist, notes, edits, archive, settings, report tabs, filtering, domain suggestions, and draft restoration.
- Actual macOS Electron island geometry, preload IPC, capture persistence across restart, and unsupported-provider blocking.
- CLI build, desktop production build, and unsigned macOS ARM64 application packaging.
- Packaged-app smoke test: renderer starts without JavaScript errors, native IPC works, all three supported provider runtimes load, and capture/settings screens open.

Latest local result: 129 unit tests and 6 browser/native integration tests passed. Added SDK-boundary tests cover API-session rejection, explicit subscription login, post-login verification, sanitized failures, strict structured results, incomplete streams, local logout scope, Cursor credential/endpoint handling, abort during creation/send/stream, and account-change/run exclusion.

## Floating window behavior

- Placement tests cover either edge, negative display origins, small displays, vertical limits, and validated saved positions.
- Native Electron checks cover actual focus/blur opacity changes (60% island, 80% capture, 100% focused), dragging without triggering capture, top/bottom limits, left/right docking, keyboard positioning, and restoring placement after restart. Off-window drag coordinates are injected through pointer events; IPC, native geometry, and persistence use the production paths.
- Expansion and collapse apply final bounds without the native macOS resize animation. Native tests assert that every mode change disables that animation and preserves the island anchor.
- Browser and native tests run sequentially because OS focus is shared. Automated UI checks use temporary libraries and start no AI work.
- Packaged macOS mouse checks verified rapid vertical dragging without accidental capture, dragging across to the left edge, capture-header dragging, ordinary click expansion, and visible unfocused transparency. Native regression coverage also includes activation after window destruction and accessibility activation without pointer events. No live AI checks were started for this UI change.

## Task-specific model routing

- Deterministic tests cover Luna/High quick checks, Sol/Medium research, and Astra/High challenges; explicit per-task overrides; migration of legacy global preferences; and no automatic model/billing fallback.
- Challenges require Codex and a current-version report. Tests verify the prior assessment is passed, linked history is retained, failed challenges preserve earlier results, and automatic quick rejections neither discard ideas nor trigger another model.
- Browser tests cover per-task preferences surviving reload, restoring recommended models, model labels, explicit challenge confirmation/cancellation, and selecting the earlier report. Native tests verify model defaults and the no-prior-report challenge guard through IPC.
- Live Luna/High quick check completed in 24 seconds with a valid low-confidence report, no searches, and no evidence/competitor claims.
- Live Sol/Medium research completed in 78 seconds with observed web searches, four competitors, seven sources, and a `pivot` verdict.
- Live Astra/High challenge completed in 136 seconds, used fresh searches, returned eleven sources, and revised the Sol report to `unproven` with no score. It identified a competing calendar-overlay product and distinguished uncertain willingness to pay from documented competition.
- Provider session records independently confirmed `gpt-6-luna`/`high`, `gpt-6-sol`/`medium`, and `gpt-6-astra`/`high` for these runs. Timings are single-run observations, not performance guarantees.
- Final packaged macOS ARM64 acceptance preserved the existing library and reports, migrated blank legacy preferences to task defaults, displayed all three model labels, and cancelled a challenge confirmation without starting work. Settings rendered correctly and no renderer errors were observed.

## Earlier live Codex acceptance — September 23, 2026

Using the user’s browser-connected ChatGPT account in SaasFactory’s dedicated provider directory, with no model API credentials:

- Quick check: completed in 38 seconds; valid report, low confidence, unknown market, no competitors/sources, and no observed web search.
- Deep check: completed in 98 seconds; observed live web search, valid report, four competitors, ten sources, and a `pivot` verdict with medium confidence. The sample was visit confirmations/access readiness for small residential cleaning companies.
- Independently opened the report’s [ZenMaid pricing](https://get.zenmaid.com/pricing), [BookingKoala pricing](https://www.bookingkoala.com/pricing), and [GoReminders confirmation documentation](https://www.goreminders.com/help/customer-confirmation-and-replies). These supported the sampled pricing/feature claims. This was a spot check, not verification of every source or a product-wide citation-verification feature.
- Packaged macOS ARM64 app: captured a clearly labeled demo through the UI without starting AI, clicked Quick check, and received a persisted Codex report in 40 seconds. Low confidence and no web search were retained. The report and new Disconnect control rendered without JavaScript errors. The demo remains in the user’s local library for inspection.
- The repeatable `test:provider` command does not modify the idea library; it consumes the selected account’s real allowance. Provider dashboard/billing reconciliation was not performed. Subscription authentication is verified; exact quota consumption is not exposed here.

`bun run test:e2e` uses temporary test libraries. Seeded analysis examples live only in test code and are never loaded into the real app.

## Requires external acceptance

- Complete Claude and Cursor browser login and live quick/deep checks. Verify usage in each provider’s dashboard, including Codex. Login, quota, and model access depend on that account.
- Configure Whisper and ffmpeg, allow microphone permission, and test dictation with actual hardware/language/model combinations.
- Test live registrar availability/prices with an authorized Vercel token.
- Build and run on Windows and Linux, including native optional dependencies, browser login, display behavior, and Linux Wayland compositors.
- Sign/notarize distribution packages and configure a release/update channel before public release.

The app has no automatic updater or cloud synchronization in this implementation. Existing CLI-generated application templates need their own integration/security work, described in LEGACY_AUDIT.md.
