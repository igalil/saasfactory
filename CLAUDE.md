# SaasFactory contributor context

SaasFactory is now a local desktop idea-capture and validation app, alongside its original Claude-powered SaaS-generation CLI. Read README.md and ARCHITECTURE.md before changing behavior.

## Runtime and commands

- ESM TypeScript, Bun 1.3+ package management, Node 24+ for development.
- Desktop: Electron + React + Vite. `bun run desktop:dev`, `bun run desktop:build`, `bun run desktop:start`.
- CLI: Commander + @clack/prompts + EJS + tsup. `bun run dev`, `bun run build`.
- Verification: `bun run typecheck`, `bun run test:run`, `bun run test:e2e` (installed Chrome and Electron).

## Product invariants

- Capture is local and starts no analysis by default. Automatic quick checks are explicitly opt-in. Deep research and challenges are always deliberate.
- Quick desktop checks do not browse and are labeled low-confidence first impressions. The older CLI's quick competition mode does browse.
- Codex task defaults: Luna/High quick checks, Sol/Medium research, Astra/High challenges. Honor saved per-task overrides; do not silently fall back to another model. Challenges require a current-version report and preserve it in history.
- Never fabricate successful research, sample ideas, availability, revenue forecasts, or market validation when a provider fails.
- Scores are directional ratings, never probabilities of business success. Reports retain the exact input version.
- Use official supported subscription/account SDK routes. No fallback to metered model API keys. Provider-controlled limits and enabled overages still apply.
- Keep provider credentials in the main process/provider stores, never the renderer or exported backups.
- Grok/SpaceXAI has no verified consumer-subscription route here; keep it unavailable unless official support is established.
- Preserve existing CLI capabilities without conflating generation or deployment with idea capture. Generated templates require further review; do not describe them as production-ready.

## Code map

- `src/desktop/shared.ts`: validated contracts and report selection.
- `src/desktop/{service,store}.ts`: lifecycle, concurrency, limits, persistence, recovery.
- `src/desktop/{providers,analysis,model-routing}.ts`: SDKs, authentication, prompts, honest evidence handling.
- `src/desktop/{main,preload}.ts`: native lifecycle and restricted IPC.
- `src/desktop/{domains,voice,export}.ts`: names/registrar, local transcription, Markdown.
- `desktop/src/{App.tsx,styles.css,api.ts}`: desktop UI and explicitly limited browser preview.
- `src/cli/`, `src/ai/`, `src/core/`, `src/integrations/`, `src/modules/`: preserved CLI.

See docs/PROVIDERS.md for verified official policy sources and docs/LEGACY_AUDIT.md for old template limitations. Update docs when contracts, setup, or provider behavior changes.
