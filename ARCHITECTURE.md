# SaasFactory Architecture

## Wizard State Diagram

```
                              START
                                │
                    ┌───────────┴───────────┐
                    │   Claude available?    │
                    └───────────┬───────────┘
                         yes    │    no
                    ┌───────────┴───────────┐
                    ▼                       ▼
             [idea_mode]               [name]───────┐
                    │                               │
        ┌───────────┼───────────┐                   │
        ▼           ▼           ▼                   │
   "has_idea"  "discover"  "validate"               │
        │           │           │                   │
        │           │     [discovery_rough_idea]    │
        │           │           │                   │
        │           └─────┬─────┘                   │
        │                 ▼                         │
        │        [discovery_sector]                 │
        │                 │                         │
        │                 ▼                         │
        │       [discovery_research] ◄──┐           │
        │          (AI: 5-8 min)        │           │
        │                 │             │           │
        │                 ▼             │           │
        │       [discovery_results]     │           │
        │                 │             │           │
        │                 ▼             │           │
        │        [discovery_select]─────┤           │
        │          │      │    "more"   │           │
        │          │      └─────────────┘           │
        │          ▼                                │
        │    [discovery_confirm]                    │
        │          │                                │
        ▼          │ (prefills name & description)  │
     [name] ◄──────┘                                │
        │                                           │
        ▼                                           │
  [description] ◄───────────────────────────────────┘
        │
        ▼
  [idea_refinement]  (AI: ~15 sec)
        │
        ▼
  [research_confirm]
        │
   yes  │  no
   ┌────┴────┐
   ▼         │
[research]   │   (AI: 15-20 min)
   │         │
   └────┬────┘
        ▼
   [features]
        │
        ▼
   [branding]
        │
        ▼
   [ai_content]  (AI: auto, ~30 sec)
        │
        ▼
    [summary]
        │
        ▼
   [generate]
        │
        ▼
      END
```

## State Descriptions

| State | Description | AI Used |
|-------|-------------|---------|
| `idea_mode` | Choose: has idea / discover / validate | - |
| `discovery_rough_idea` | Input rough idea to validate | - |
| `discovery_sector` | Optional sector focus | - |
| `discovery_research` | AI searches for SaaS opportunities | Claude + WebSearch |
| `discovery_results` | Display discovered ideas | - |
| `discovery_select` | Select an idea or request more | - |
| `discovery_confirm` | Confirm selected idea | - |
| `name` | Enter project name | - |
| `description` | Describe SaaS idea | - |
| `idea_refinement` | AI refines description into 2-3 versions | Claude |
| `research_confirm` | Opt-in to market research | - |
| `research` | AI analyzes competitors & market | Claude + WebSearch |
| `features` | Select features (auth, payments, etc.) | - |
| `branding` | Domain, tagline, colors | - |
| `ai_content` | Auto-generate marketing copy | Claude |
| `summary` | Review before generation | - |
| `generate` | Create project files | - |

## LLM Usage

### Provider: Claude Code CLI

All AI features use **Claude Code CLI** (`claude` command) - not direct API calls.

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code CLI                       │
│                                                          │
│  Invoked via: execa('claude', [...args])                │
│  Auth: User's Claude Code session                       │
│  Billing: Claude Code subscription                      │
└─────────────────────────────────────────────────────────┘
```

### AI Features

| Feature | Function | Tools | Timeout | Output |
|---------|----------|-------|---------|--------|
| **Idea Discovery** | `discoverSaasIdeas()` | WebSearch | 10 min | 5 SaaS ideas with analysis |
| **Idea Refinement** | `refineIdea()` | None | 1 min | 2-3 refined versions |
| **Market Research** | `conductMarketResearch()` | WebSearch | 20 min | Competitors, gaps, opportunities |
| **Content Generation** | `claudeGenerate()` | None | 2 min | Tagline, hero, SEO |

### AI Files

```
src/ai/
├── claude-cli.ts      # Claude Code wrapper (spawn, streaming, JSON parsing)
├── idea-discovery.ts  # Discover SaaS opportunities via web search
├── idea-refiner.ts    # Refine raw ideas into polished versions
├── idea-report.ts     # Display formatting for ideas
├── market-research.ts # Competitor & market analysis
└── research-report.ts # Display formatting for research
```

## Graceful Degradation

All AI features check `isClaudeCodeAvailable()` and degrade gracefully:

| If Claude unavailable... | Behavior |
|--------------------------|----------|
| At startup | Skip `idea_mode`, go directly to `name` |
| Idea refinement | Skip, use original description |
| Market research | Skip, warn user |
| Content generation | Use hardcoded defaults |
| Idea discovery | Return 2 example ideas |

## CLI Flags

```bash
saasfactory create [name]
  --skip-ai        # Disable all AI content generation
  --skip-research  # Disable market research
  --skip-git       # Skip git initialization
  --skip-github    # Skip GitHub repo creation
  --private        # Make GitHub repo private
  -y, --yes        # Skip confirmations
```
