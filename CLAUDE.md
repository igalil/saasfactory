# SaasFactory

CLI tool that generates production-ready SaaS projects with AI assistance.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Build**: tsup
- **CLI**: Commander.js + @clack/prompts
- **AI**: Claude Code CLI (not direct API)
- **Database**: Convex (generated projects)
- **Auth**: Clerk (generated projects)
- **Payments**: Stripe (generated projects)

## Project Structure

```
src/
├── cli/           # CLI interface
│   ├── index.ts   # Main wizard state machine (17 states)
│   ├── prompts.ts # User input prompts
│   └── ui.ts      # Terminal UI helpers
├── ai/            # AI features (all use Claude Code CLI)
│   ├── claude-cli.ts        # Claude Code wrapper
│   ├── idea-discovery.ts    # Discover SaaS ideas (WebSearch)
│   ├── idea-refiner.ts      # Refine descriptions + suggest names
│   ├── research.ts          # Unified competitive research (quick/full/url modes)
│   ├── project-analyzer.ts  # AI-driven project configuration
│   ├── idea-report.ts       # Display ideas
│   └── research-report.ts   # Display research
├── core/          # Core logic
│   ├── context.ts   # Project context types
│   ├── generator.ts # Project file generation
│   └── config.ts    # User config/credentials
└── integrations/  # External services
    ├── git.ts
    ├── github.ts
    ├── vercel.ts
    └── domain.ts
```

## Wizard State Diagram

```
                         START
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        [idea_mode]              [description]  (if name passed via CLI)
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 has_idea  discover  validate
    │         │         │
    │         │    [discovery_rough_idea]
    │         │         │
    │    [discovery_sector] ◄───┘
    │         │
    │    [discovery_research]  ◄─┐
    │      (AI: 5-8 min)         │
    │         │                  │
    │    [discovery_results]     │
    │         │                  │
    │    [discovery_select]──────┘
    │         │
    │    [discovery_confirm]
    │         │
    │         └──────────────┐
    │                        │
    ▼                        ▼
 [description]            [name]
    │                        │
 [idea_refinement] (~15s)    │
    │                        │
 [name_research] (AI: ~2m)  │
    │                        │
    └────►[name]◄────────────┘
              │
       [project_config]  (AI: ~15s)
              │
         [branding] → [ai_content] → [summary] → [project_location] → [generate]
                        (AI: ~30s)
```

## AI/LLM Usage

**Provider**: Claude Code CLI only (no direct API calls)

| Feature | Function | Tools | Duration |
|---------|----------|-------|----------|
| Idea Discovery | `discoverSaasIdeas()` | WebSearch | 5-8 min |
| Idea Refinement | `refineIdea()` | None | ~15 sec |
| Name Suggestions | `suggestProjectNames()` | WebSearch | ~2 min |
| Competition Research (quick) | `conductResearch(input, {mode:'quick'})` | WebSearch | ~3 min |
| Competition Research (full) | `conductResearch(input, {mode:'full'})` | WebSearch | ~10 min |
| Competition Research (URL) | `conductResearch(url, {mode:'url'})` | WebSearch, WebFetch | ~10 min |
| Project Analysis | `analyzeProject()` | None | ~15 sec |
| Content Generation | `claudeGenerate()` | None | ~30 sec |
| Domain Suggestions | `claudeGenerate()` (domain cmd) | WebSearch, WebFetch (URL) or None | ~15-30 sec |

All AI features degrade gracefully if Claude Code unavailable.

## Key Files

- **State machine**: `src/cli/index.ts` (WizardState type, 17 states)
- **Claude wrapper**: `src/ai/claude-cli.ts`
- **Unified research**: `src/ai/research.ts` (quick/full/url modes)
- **Types**: `src/core/context.ts` (SaasIdea, MarketResearch, etc.)

## Commands

```bash
bun run build    # Build with tsup
bun run dev      # Development mode
bun link         # Link CLI globally
saasfactory create [name]    # Main wizard
saasfactory config           # Configure credentials
saasfactory domain [name]    # AI domain suggestions + availability check (Vercel)
saasfactory compete <input>  # Research competitors (idea or URL)
```

## Runtime

- **Package Manager**: Bun (>= 1.0.0)
- **Lockfile**: `bun.lock` (text-based, Bun 1.3+)
