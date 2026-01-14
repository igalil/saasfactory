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
│   ├── index.ts   # Main wizard state machine (16 states)
│   ├── prompts.ts # User input prompts
│   └── ui.ts      # Terminal UI helpers
├── ai/            # AI features (all use Claude Code CLI)
│   ├── claude-cli.ts      # Claude Code wrapper
│   ├── idea-discovery.ts  # Discover SaaS ideas (WebSearch)
│   ├── idea-refiner.ts    # Refine descriptions
│   ├── market-research.ts # Competitor analysis (WebSearch)
│   ├── compete-research.ts # Standalone competition research
│   ├── idea-report.ts     # Display ideas
│   └── research-report.ts # Display research
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
        [idea_mode]                  [name]
              │                         │
    ┌─────────┼─────────┐               │
    ▼         ▼         ▼               │
 has_idea  discover  validate           │
    │         │         │               │
    │    [discovery_sector]             │
    │         │                         │
    │    [discovery_research]  ◄─┐      │
    │      (AI: 5-8 min)         │      │
    │         │                  │      │
    │    [discovery_select]──────┘      │
    │         │                         │
    │    [discovery_confirm]            │
    │         │                         │
    └────►[name]◄───────────────────────┘
              │
        [description]
              │
        [idea_refinement]  (AI: ~15 sec)
              │
        [research_confirm]
              │
         ┌────┴────┐
         ▼         │
      [research]   │  (AI: 15-20 min)
         │         │
         └────┬────┘
              ▼
         [features] → [branding] → [ai_content] → [summary] → [generate]
                                    (AI: ~30s)
```

## AI/LLM Usage

**Provider**: Claude Code CLI only (no direct API calls)

| Feature | Function | Tools | Duration |
|---------|----------|-------|----------|
| Idea Discovery | `discoverSaasIdeas()` | WebSearch | 5-8 min |
| Idea Refinement | `refineIdea()` | None | ~15 sec |
| Market Research | `conductMarketResearch()` | WebSearch | 15-20 min |
| Competition Research | `competeResearch()` | WebSearch, WebFetch | ~5-10 min |
| Content Generation | `claudeGenerate()` | None | ~30 sec |

All AI features degrade gracefully if Claude Code unavailable.

## Key Files

- **State machine**: `src/cli/index.ts` (WizardState type, lines 85-105)
- **Claude wrapper**: `src/ai/claude-cli.ts`
- **Types**: `src/core/context.ts` (SaasIdea, MarketResearch, etc.)

## Commands

```bash
bun run build    # Build with tsup
bun run dev      # Development mode
bun link         # Link CLI globally
saasfactory create [name]    # Main wizard
saasfactory config           # Configure credentials
saasfactory domain <name>    # Check domain availability
saasfactory compete <input>  # Research competitors (idea or URL)
```

## Runtime

- **Package Manager**: Bun (>= 1.0.0)
- **Lockfile**: `bun.lock` (text-based, Bun 1.3+)
