import { claudeGenerateWithProgress, isClaudeCodeAvailable, type ProgressEvent } from './claude-cli.js';
import type { SaasIdea, MarketVerdict, DifficultyLabel, CostEstimate, IncomeModel } from '../core/context.js';

export interface DiscoveryProgressEvent {
  type: 'search' | 'status' | 'sources' | 'phase';
  phase?: 'gaps' | 'competitors' | 'ideas' | 'difficulty' | 'marketing';
  message: string;
  query?: string;
  sources?: string[];
  searchCount?: number;
  totalSources?: number;
}

export interface DiscoveryOptions {
  sector?: string;
  roughIdea?: string;
  count?: number;
  onProgress?: (event: DiscoveryProgressEvent) => void;
}

export interface DiscoveryResult {
  ideas: SaasIdea[];
  isFallback: boolean;
  error?: string;
}

const IDEA_DISCOVERY_PROMPT = `You are a micro-SaaS idea researcher and validator. Your job is to discover REAL, VIABLE micro-SaaS ideas that can be built quickly by an AI coding assistant (Claude Code).

CRITICAL CONSTRAINTS:
1. Every idea MUST be validated through web search - no hypothetical ideas
2. Ideas must be ONE-FEATURE focused (or 2-3 features maximum)
3. Ideas must be implementable by Claude Code in 1-3 days
4. Ideas must have clear monetization potential (generate income for users)

WHAT MAKES A GOOD MICRO-SAAS FOR AI IMPLEMENTATION:
EASY (recommend these):
- Simple CRUD operations with forms and tables
- Standard auth patterns (Clerk, NextAuth)
- Landing page + dashboard + settings pattern
- Single API integration (Stripe, Resend, etc.)
- 3-5 database tables maximum

AVOID (don't recommend these):
- Real-time multiplayer features
- Complex video/audio processing
- Custom ML models
- Hardware integrations
- Complex financial calculations or compliance

SEARCH STRATEGY:
1. Search for pain points: "[sector] tool complaints reddit", "[profession] workflow frustrations"
2. Search for gaps: "micro-saas ideas 2024", "[sector] underserved market"
3. Search for trending needs: "[sector] what tools missing", "indie hackers [sector] ideas"
4. Validate: For each potential idea, search if solutions exist and identify gaps

DIFFICULTY SCORING FOR CLAUDE CODE:
1 (Trivial, 2-4 hrs): Single CRUD, basic landing page
2 (Easy, 4-8 hrs): 2-3 resources, standard auth, 1 API
3 (Moderate, 1-2 days): User roles, email notifications, 2-3 APIs
4 (Challenging, 2-3 days): File uploads, background jobs, complex workflows
5 (Complex, 3+ days): Real-time, multiple integrations, complex business logic

MARKETING RESEARCH:
For each idea, search for:
- Communities where target users hang out (Reddit, Discord, Slack groups)
- Successful launch strategies for similar products
- Content marketing opportunities

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):`;

const JSON_SCHEMA = `{
  "ideas": [
    {
      "id": "unique-id-1",
      "name": "ShortName",
      "tagline": "One-liner value proposition",
      "description": "2-3 sentence description of what it does and who it's for",
      "problemSolved": "The specific pain point this addresses",
      "targetAudience": ["Audience 1", "Audience 2"],
      "coreFeatures": ["Feature 1", "Feature 2"],
      "marketOpportunity": {
        "score": 7,
        "verdict": "strong",
        "reasoning": "Why this is a good opportunity",
        "competitors": ["Competitor 1", "Competitor 2"],
        "gap": "What gap this fills that competitors miss"
      },
      "difficulty": {
        "score": 2,
        "label": "easy",
        "reasoning": "Why this is easy/hard for AI to build",
        "estimatedHours": "4-8 hours",
        "aiStrengths": ["Standard CRUD", "Simple data model"]
      },
      "marketing": {
        "primaryChannels": ["r/subreddit", "IndieHackers"],
        "launchStrategy": "Step-by-step plan to get first 100 users",
        "estimatedCost": "free",
        "timeToFirstUsers": "2-4 weeks",
        "tactics": [
          {"channel": "Reddit", "approach": "How to post without being spammy"}
        ]
      },
      "income": {
        "model": "freemium",
        "suggestedPricing": "$0 free / $9/mo pro",
        "monthlyPotential": "$500-2000/month"
      },
      "sources": ["url1.com", "url2.com"]
    }
  ]
}`;

/**
 * Discover SaaS ideas through AI-powered market research
 */
export async function discoverSaasIdeas(
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const available = await isClaudeCodeAvailable();
  if (!available) {
    return {
      ideas: createFallbackIdeas(),
      isFallback: true,
      error: 'Claude Code CLI not available',
    };
  }

  const count = options.count ?? 5;
  const sectorContext = options.sector
    ? `Focus specifically on the "${options.sector}" sector/industry.`
    : 'Look across different sectors for opportunities.';

  const roughIdeaContext = options.roughIdea
    ? `The user has a rough idea they want to validate and refine: "${options.roughIdea}". Search for similar products, identify gaps, and suggest variations or improvements.`
    : '';

  const prompt = `${IDEA_DISCOVERY_PROMPT}

${JSON_SCHEMA}

TASK:
Discover ${count} viable micro-SaaS ideas. ${sectorContext}
${roughIdeaContext}

RESEARCH PROCESS:
1. First, search for market gaps and pain points${options.sector ? ` in ${options.sector}` : ''}
2. For each potential opportunity, search for existing solutions
3. Identify gaps where no good solution exists or competitors have weaknesses
4. Assess implementation difficulty specifically for Claude Code (AI assistant)
5. Research marketing channels for each idea

${roughIdeaContext ? 'Since the user has a rough idea, include at least 2 variations of their idea along with other opportunities you discover.' : ''}

IMPORTANT:
- All ideas must be validated through actual web searches
- Prioritize ideas with difficulty score 1-3 (trivial to moderate)
- Every idea must have clear income potential
- Be specific about marketing channels (exact subreddits, communities, etc.)`;

  let searchCount = 0;
  const allSources: string[] = [];

  try {
    options.onProgress?.({
      type: 'phase',
      phase: 'gaps',
      message: 'Starting market research...',
    });

    const response = await claudeGenerateWithProgress(prompt, {
      allowedTools: ['WebSearch'],
      maxTurns: 25, // More turns for thorough research
      timeout: 600000, // 10 minutes
      onProgress: (event: ProgressEvent) => {
        if (event.tool === 'status') {
          options.onProgress?.({
            type: 'status',
            message: event.message || 'Researching...',
            searchCount,
            totalSources: allSources.length,
          });
        } else if (event.type === 'result' && event.sources) {
          for (const src of event.sources) {
            if (!allSources.includes(src)) allSources.push(src);
          }
          options.onProgress?.({
            type: 'sources',
            sources: event.sources,
            message: `Found ${event.sources.length} sources`,
            searchCount,
            totalSources: allSources.length,
          });
        } else if (event.tool?.toLowerCase().includes('search') || event.tool === 'WebSearch') {
          searchCount = event.searchCount ?? searchCount + 1;

          // Infer phase from query
          let phase: DiscoveryProgressEvent['phase'] = 'gaps';
          const query = event.query?.toLowerCase() || '';
          if (query.includes('competitor') || query.includes('alternative')) {
            phase = 'competitors';
          } else if (query.includes('reddit') || query.includes('community') || query.includes('launch')) {
            phase = 'marketing';
          }

          options.onProgress?.({
            type: 'search',
            phase,
            query: event.query,
            message: event.query
              ? `Searching: "${event.query}"`
              : `Web search #${searchCount}`,
            searchCount,
            totalSources: allSources.length,
          });
        }
      },
    });

    // Parse response - extract JSON more carefully
    const parsed = extractJsonFromResponse(response);
    if (!parsed) {
      return {
        ideas: createFallbackIdeas(),
        isFallback: true,
        error: 'Invalid AI response format',
      };
    }

    if (!parsed.ideas || !Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      return {
        ideas: createFallbackIdeas(),
        isFallback: true,
        error: 'No ideas found in response',
      };
    }

    // Validate and normalize ideas
    const ideas = parsed.ideas.map((idea, index) => normalizeIdea(idea, index));

    return {
      ideas,
      isFallback: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ideas: createFallbackIdeas(),
      isFallback: true,
      error: errorMessage,
    };
  }
}

// Raw idea type from AI response (may have missing/invalid fields)
interface RawSaasIdea {
  id?: string;
  name?: string;
  tagline?: string;
  description?: string;
  problemSolved?: string;
  targetAudience?: string[];
  coreFeatures?: string[];
  marketOpportunity?: {
    score?: number;
    verdict?: string;
    reasoning?: string;
    competitors?: string[];
    gap?: string;
  };
  difficulty?: {
    score?: number;
    label?: string;
    reasoning?: string;
    estimatedHours?: string;
    aiStrengths?: string[];
  };
  marketing?: {
    primaryChannels?: string[];
    launchStrategy?: string;
    estimatedCost?: string;
    timeToFirstUsers?: string;
    tactics?: Array<{ channel?: string; approach?: string; expectedOutcome?: string }>;
  };
  income?: {
    model?: string;
    suggestedPricing?: string;
    monthlyPotential?: string;
    timeToFirstRevenue?: string;
  };
  sources?: string[];
}

/**
 * Normalize and validate a raw idea from AI response
 */
function normalizeIdea(raw: RawSaasIdea, index: number): SaasIdea {
  const difficultyScore = Math.min(5, Math.max(1, raw.difficulty?.score ?? 3)) as 1 | 2 | 3 | 4 | 5;
  const difficultyLabels: Record<number, DifficultyLabel> = {
    1: 'trivial',
    2: 'easy',
    3: 'moderate',
    4: 'challenging',
    5: 'complex',
  };

  const marketScore = Math.min(10, Math.max(1, raw.marketOpportunity?.score ?? 5));
  const marketVerdict = normalizeVerdict(raw.marketOpportunity?.verdict);
  const costEstimate = normalizeCost(raw.marketing?.estimatedCost);
  const incomeModel = normalizeIncomeModel(raw.income?.model);

  return {
    id: raw.id || `idea-${index + 1}`,
    name: raw.name || `Idea ${index + 1}`,
    tagline: raw.tagline || 'A micro-SaaS opportunity',
    description: raw.description || 'No description provided',
    problemSolved: raw.problemSolved || 'Problem to be defined',
    targetAudience: raw.targetAudience || ['General users'],
    coreFeatures: raw.coreFeatures?.slice(0, 3) || ['Core feature'],

    marketOpportunity: {
      score: marketScore,
      verdict: marketVerdict,
      reasoning: raw.marketOpportunity?.reasoning || 'Market analysis pending',
      competitors: raw.marketOpportunity?.competitors || [],
      gap: raw.marketOpportunity?.gap || 'Gap to be identified',
    },

    difficulty: {
      score: difficultyScore,
      label: (raw.difficulty?.label as DifficultyLabel) || difficultyLabels[difficultyScore],
      reasoning: raw.difficulty?.reasoning || 'Difficulty assessment pending',
      estimatedHours: raw.difficulty?.estimatedHours || getDefaultHours(difficultyScore),
      aiStrengths: raw.difficulty?.aiStrengths || ['Standard patterns'],
    },

    marketing: {
      primaryChannels: raw.marketing?.primaryChannels || ['To be researched'],
      launchStrategy: raw.marketing?.launchStrategy || 'Launch strategy pending',
      estimatedCost: costEstimate,
      timeToFirstUsers: raw.marketing?.timeToFirstUsers || '2-4 weeks',
      tactics: (raw.marketing?.tactics || []).map(t => ({
        channel: t.channel || 'Unknown',
        approach: t.approach || 'Approach TBD',
        expectedOutcome: t.expectedOutcome,
      })),
    },

    income: {
      model: incomeModel,
      suggestedPricing: raw.income?.suggestedPricing || '$9-29/month',
      monthlyPotential: raw.income?.monthlyPotential || '$500-2000/month',
      timeToFirstRevenue: raw.income?.timeToFirstRevenue,
    },

    sources: raw.sources || [],
  };
}

function normalizeVerdict(verdict?: string): MarketVerdict {
  const v = verdict?.toLowerCase();
  if (v === 'strong') return 'strong';
  if (v === 'moderate') return 'moderate';
  if (v === 'weak') return 'weak';
  if (v === 'saturated') return 'saturated';
  return 'moderate';
}

function normalizeCost(cost?: string): CostEstimate {
  const c = cost?.toLowerCase();
  if (c === 'free') return 'free';
  if (c === 'low') return 'low';
  if (c === 'medium') return 'medium';
  if (c === 'high') return 'high';
  return 'free';
}

function normalizeIncomeModel(model?: string): IncomeModel {
  const m = model?.toLowerCase();
  if (m === 'subscription') return 'subscription';
  if (m === 'freemium') return 'freemium';
  if (m === 'one-time') return 'one-time';
  if (m === 'usage-based') return 'usage-based';
  return 'freemium';
}

function getDefaultHours(score: number): string {
  switch (score) {
    case 1: return '2-4 hours';
    case 2: return '4-8 hours';
    case 3: return '1-2 days';
    case 4: return '2-3 days';
    case 5: return '3+ days';
    default: return '1-2 days';
  }
}

/**
 * Extract JSON from AI response, handling various formats
 */
function extractJsonFromResponse(response: string): { ideas: RawSaasIdea[] } | null {
  // Try multiple strategies to extract JSON

  // Strategy 1: Look for ```json code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: Find the outermost { } that contains "ideas"
  const ideasIndex = response.indexOf('"ideas"');
  if (ideasIndex !== -1) {
    // Find the opening brace before "ideas"
    let braceStart = response.lastIndexOf('{', ideasIndex);
    if (braceStart !== -1) {
      // Find matching closing brace
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < response.length; i++) {
        if (response[i] === '{') depth++;
        if (response[i] === '}') {
          depth--;
          if (depth === 0) {
            braceEnd = i;
            break;
          }
        }
      }
      if (braceEnd !== -1) {
        try {
          return JSON.parse(response.slice(braceStart, braceEnd + 1));
        } catch {
          // Continue to next strategy
        }
      }
    }
  }

  // Strategy 3: Simple regex match (original approach)
  const simpleMatch = response.match(/\{[\s\S]*\}/);
  if (simpleMatch) {
    try {
      return JSON.parse(simpleMatch[0]);
    } catch {
      // Try to fix common JSON issues
      let jsonStr = simpleMatch[0];

      // Remove trailing commas before } or ]
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

      try {
        return JSON.parse(jsonStr);
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 4: Look for array of ideas directly
  const arrayMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arrayMatch) {
    try {
      const ideas = JSON.parse(arrayMatch[0]);
      return { ideas };
    } catch {
      // Give up
    }
  }

  return null;
}

/**
 * Create fallback ideas when AI fails
 */
function createFallbackIdeas(): SaasIdea[] {
  return [
    {
      id: 'fallback-1',
      name: 'WaitlistKit',
      tagline: 'Launch a waitlist in 5 minutes',
      description: 'Simple waitlist builder for pre-launch products. Collect emails, show position, referral bonuses.',
      problemSolved: 'Founders need to validate ideas before building, but setting up waitlists is tedious',
      targetAudience: ['Indie hackers', 'Startup founders', 'Product managers'],
      coreFeatures: ['Email collection', 'Referral tracking', 'Embeddable widget'],
      marketOpportunity: {
        score: 7,
        verdict: 'moderate',
        reasoning: 'Proven demand - competitors like LaunchList exist but leave room for simpler alternatives',
        competitors: ['LaunchList', 'Waitlist.me'],
        gap: 'Most solutions are overpriced or overcomplicated for simple use cases',
      },
      difficulty: {
        score: 2,
        label: 'easy',
        reasoning: 'Simple CRUD with email collection and counter logic',
        estimatedHours: '4-6 hours',
        aiStrengths: ['Standard form handling', 'Simple database schema', 'Embeddable components'],
      },
      marketing: {
        primaryChannels: ['r/SideProject', 'IndieHackers', 'Product Hunt'],
        launchStrategy: 'Build in public on Twitter, launch on Product Hunt, post in founder communities',
        estimatedCost: 'free',
        timeToFirstUsers: '1-2 weeks',
        tactics: [
          { channel: 'IndieHackers', approach: 'Share building journey, offer early access' },
          { channel: 'Product Hunt', approach: 'Launch with maker story' },
        ],
      },
      income: {
        model: 'freemium',
        suggestedPricing: '$0 free (100 signups) / $9/mo pro',
        monthlyPotential: '$500-1500/month',
      },
      sources: [],
    },
    {
      id: 'fallback-2',
      name: 'FeedbackDrop',
      tagline: 'Collect user feedback without leaving your app',
      description: 'Lightweight feedback widget for web apps. Screenshot capture, categorization, Slack notifications.',
      problemSolved: 'Developers lose valuable feedback because users won\'t switch to external tools',
      targetAudience: ['SaaS developers', 'Product teams', 'Indie makers'],
      coreFeatures: ['Embedded widget', 'Screenshot capture', 'Slack integration'],
      marketOpportunity: {
        score: 6,
        verdict: 'moderate',
        reasoning: 'Canny and similar tools are expensive. Room for lightweight alternative.',
        competitors: ['Canny', 'UserVoice'],
        gap: 'Simple, affordable option for small teams',
      },
      difficulty: {
        score: 3,
        label: 'moderate',
        reasoning: 'Widget embedding and screenshot capture add some complexity',
        estimatedHours: '1-2 days',
        aiStrengths: ['React components', 'API integration', 'Webhook handling'],
      },
      marketing: {
        primaryChannels: ['r/webdev', 'HackerNews', 'Dev.to'],
        launchStrategy: 'Write technical blog posts about building feedback systems',
        estimatedCost: 'free',
        timeToFirstUsers: '2-4 weeks',
        tactics: [
          { channel: 'Dev.to', approach: 'Technical tutorials on feedback collection' },
        ],
      },
      income: {
        model: 'freemium',
        suggestedPricing: '$0 free / $19/mo pro',
        monthlyPotential: '$1000-3000/month',
      },
      sources: [],
    },
  ];
}

/**
 * Get a one-liner summary for CLI display
 */
export function getDiscoveryOneLiner(result: DiscoveryResult): string {
  if (result.isFallback) {
    return `Using example ideas (research unavailable: ${result.error})`;
  }
  return `Found ${result.ideas.length} viable micro-SaaS opportunities`;
}
