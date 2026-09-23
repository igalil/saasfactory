# SaasFactory

A local desktop home for SaaS ideas. Catch a thought in a floating island at either edge of your screen, give it a quick first look, and research it when it deserves more time.

The desktop app uses Electron, React, and official provider SDKs. The original Claude-powered project-generation CLI remains available alongside it.

## Run the desktop app

Development requires Node.js **24+** and Bun **1.3+**. Provider-native optional dependencies must be installed for the machine you build on.

```sh
bun install
# Bun blocks dependency lifecycle scripts by default; install Electron's runtime explicitly:
node node_modules/electron/install.js
bun run desktop:build
bun run desktop:start
```

For live development, use `bun run desktop:dev`. `bun run desktop:preview` is a browser-only preview: it saves captures to that browser, but cannot connect providers, transcribe, or perform domain checks.

Click the black island to capture a thought. **Cmd/Ctrl + Shift + Space** toggles capture; **Cmd/Ctrl + Enter** saves; **Escape** collapses the window. The tray menu opens the library or quits. Closing the window returns to the island. The expanded library is not always on top; the island and capture panel are.

Drag the island (or the capture panel's header) up and down to choose its height. Drag across the screen to snap to the other edge, or onto another display. Placement stays within the usable screen area and is remembered after restart. With the island focused, **Alt + arrow keys** move it vertically or switch sides. The island fades to 60% opacity when unfocused; the capture panel fades to 80%. Both return to full opacity on focus. Expansion uses an immediate resize to avoid the old stretching animation.

## The workflow

- **Capture:** write or dictate an idea. Saving is local and starts no AI work by default. Unfinished capture and note drafts are retained locally.
- **Quick check:** explicitly request a concise first impression: a sharper idea, buyer, risks, MVP, rough effort, names, and next experiment. No web tools. Always marked preliminary, low confidence, and not market validation.
- **Research:** explicitly start a deeper check, bounded to ten minutes. The provider searches for competition, substitutes, pricing, demand, and counter-evidence. Reports distinguish crowded, healthy, unexplored, and unknown markets, with pursue, pivot, pass, or unproven verdicts.
- **Challenge:** with Codex selected, explicitly review an existing report with Astra. It rechecks claims, looks for counter-evidence, and explains which assumptions could change the verdict. This never runs automatically and preserves the earlier report.
- **Decide:** shortlist or shelve ideas, search and sort them, compare opportunity ratings and build effort, preserve notes, and export Markdown briefs. The “Promising” filter requires a pursue verdict and your chosen rating threshold. Ratings are not probabilities of business success.

Research without an observed search and at least two distinct source hosts is downgraded to unproven/unrated. Sources are AI-selected evidence, not independent verification of all claims. Failed checks never become positive fallback reports. Changing an idea preserves its report history but removes stale results from ranking.

One check runs at a time. Capture remains available while it runs. Stop cancels it; unfinished runs are marked interrupted after restart and are not automatically resumed. Settings offer an optional quick check after saving and a daily run-count limit (UTC). This is **not a monetary cap** or a view into provider balances.

## Bring your provider account

Open **Settings & connections**, choose a provider, sign in, then save your settings. Do not paste model API keys into the app. Claude and Codex use app-specific login directories; an account signed into a separate terminal may still need to sign in here.

| Provider | Integration | Account and billing behavior |
| --- | --- | --- |
| Codex | `@openai/codex-sdk` and bundled Codex runtime | ChatGPT sign-in only; rejects API-key sessions and forces ChatGPT authentication. |
| Claude | `@anthropic-ai/claude-agent-sdk` and bundled Claude runtime | Claude account sign-in; follows the provider's current subscription/extra-usage rules. |
| Cursor | `@cursor/sdk`, local agent mode | Official SDK browser login; uses the user's Cursor plan pools and overage settings. SDK login is separate from the editor. |
| Grok / SpaceXAI | Unavailable | No verified consumer-subscription SDK route. The app does not fall back to xAI API billing. |

Provider rules can change. Account quotas, model access, enabled extra usage, and overages remain controlled by the provider. SaasFactory neither sells tokens nor promises unlimited or free use. See [provider sources and implementation notes](docs/PROVIDERS.md).

Use **Cancel sign-in** to stop a pending browser connection and **Disconnect** to remove a local login. Finish or stop a running check before changing accounts. Claude/Codex disconnection affects SaasFactory’s own login; Cursor disconnection clears the shared SDK login (revoke its key in Cursor to end access everywhere). Settings refresh account status when the app regains focus.

Codex uses explicit models for each task:

| Action | Default model | Reasoning | Web research |
| --- | --- | --- | --- |
| Save | None | None | No |
| Quick check | GPT-6 Luna | High | No |
| Research idea | GPT-6 Sol | Medium | Yes |
| Challenge this idea | GPT-6 Astra | High | Yes; rechecks the latest report for the current idea version |

Settings lets you override each Codex model and restore these recommendations. Existing single-model Codex overrides migrate to both quick checks and research; new challenges default to Astra. New reports and run records store the selected model and effort; old reports retain their original metadata without a guessed model. A failed or unavailable model does not cause automatic escalation or API billing.

Claude and Cursor retain a separate optional model identifier. Leaving it blank uses Claude’s default or the first model made available by Cursor. Challenge is a Codex action; it never silently switches away from another selected provider. Quick-check verdicts never automatically archive or delete ideas.

## Dictation

Typing and your operating system's dictation shortcut work immediately. The microphone button additionally supports **local Whisper transcription**, avoiding a paid speech API:

1. Install [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and [ffmpeg](https://ffmpeg.org/download.html).
2. Download a whisper.cpp-compatible GGML model (a multilingual model for automatic language detection).
3. In Settings, select the `whisper-cli` executable, the `ffmpeg` executable, and the model file. Save settings.
4. Allow microphone access, record, then stop. The transcript is appended to the capture field for review before saving.

Recordings stop after two minutes; temporary audio is deleted after transcription. The model is not bundled. Transcription requires working local tools and microphone permission on the user's platform.

## Names and domains

Checks suggest names using related words and concepts. Suggestions are explicitly unchecked. **Check availability** performs a separate lookup. The app reuses the existing Vercel registrar integration when a Vercel token is configured through `bun run dev config`. Without that token, `.com`, `.net`, and `.org` use RDAP: an existing record means registered; a missing record remains unknown until a registrar confirms availability. Other endings require registrar confirmation. The app never purchases domains.

## Your data

Ideas, reports, settings, and run history are stored in `ideas.json` under Electron's `app.getPath('userData')`. The source-run directory can use the npm package name; packaged apps use `SaasFactory`. Typical parent locations are:

- macOS: `~/Library/Application Support/`
- Windows: `%APPDATA%\`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/`

Writes are serialized and atomically replaced. Corrupt files fail closed and are not overwritten. Use **Export backup** regularly; **Import backup** merges only new idea IDs, preserving existing edits and settings. Markdown export contains the current-version brief. Backups contain ideas and settings, but not provider credentials.

Claude and Codex credentials live in provider-managed app subdirectories; Cursor uses its official SDK credential store. Never commit or share those directories. Local storage is private to the OS account, not an encrypted vault. Analysis sends the selected idea and builder profile to the selected provider. Research sends searches; domain checks send domain names. No SaaS account or cloud library is required.

## Build and verify

```sh
bun run typecheck
bun run test:run
bun run build                 # Legacy CLI
bun run desktop:build
bun run test:e2e               # Chrome browser + native Electron integration
bun run desktop:package       # Installer targets for the current OS
```

Browser integration tests use installed Google Chrome. Test libraries use temporary directories and simulated reports; they do not spend provider usage. Live provider analysis requires a user login and is a separate, usage-consuming acceptance check. A repeatable smoke command is available (replace the directory with your app’s actual provider directory):

```bash
bun run test:provider --provider codex --mode quick --providers-dir "/path/to/SaasFactory/providers"
# Save a research report for a separate, deliberate challenge:
bun run test:provider --provider codex --mode deep --providers-dir "/path/to/SaasFactory/providers" --output /tmp/research.json
bun run test:provider --provider codex --mode challenge --providers-dir "/path/to/SaasFactory/providers" --prior-report /tmp/research.json
```

The command uses one sample cleaning-business idea, checks the completed report against the application schema, and requires observed searches and multiple source hosts for research and challenge modes. It does not add anything to the idea library. Never copy credentials into the repository. See [verification status](docs/VERIFICATION.md) for live versus simulated coverage.

`electron-builder.yml` targets macOS DMG/ZIP, Windows NSIS, and Linux AppImage/DEB. Build on each target OS with its native optional dependencies. The local macOS build is unsigned; public distribution still requires signing/notarization, platform testing, and release credentials. Linux placement depends on compositor support, particularly on Wayland. See [verification status](docs/VERIFICATION.md).

## Original CLI

```sh
bun run dev create my-app
bun run dev compete "A handoff tool for small agencies"
bun run dev domain handoffnest
bun run dev config
bun run dev deploy ./my-app
```

The CLI retains idea discovery/refinement, competitive research, domain suggestions, the project wizard, EJS generation, GitHub integration, and Vercel deployment. Its **quick competition search does use the web**; it is different from the desktop's no-web quick impression.

Generated projects are starter templates requiring review, configuration, and further implementation. They are not certified production-ready. The desktop does not automatically generate, publish, or deploy a project when you capture or research an idea. See [the legacy audit](docs/LEGACY_AUDIT.md) and [architecture](ARCHITECTURE.md).

## License

MIT for SaasFactory. Bundled SDKs and runtimes retain their respective provider licenses.
