/**
 * Unified research module for competitive analysis
 * Supports quick (find competitors) and full (deep analysis) modes
 */
import { claudeGenerateWithProgress, isClaudeCodeAvailable, type ProgressEvent } from './claude-cli.js';
import type { MarketResearch } from '../core/context.js';

/**
 * Research modes with different depth/token usage
 */
export type ResearchMode = 'quick' | 'full' | 'url';

/**
 * Progress callback for research operations
 */
export interface ResearchProgressCallback {
  (event: {
    type: 'search' | 'status' | 'sources' | 'analyzing';
    count?: number;
    message: string;
    query?: string;
    sources?: string[];
    totalSearches?: number;
    totalSources?: number;
  }): void;
}

/**
 * Research result with metadata
 */
export interface ResearchResult {
  research: MarketResearch;
  isFallback: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Research options
 */
export interface ResearchOptions {
  mode: ResearchMode;
  onProgress?: ResearchProgressCallback;
}

// Mode-specific configurations
const MODE_CONFIG = {
  quick: {
    competitors: '3-5',
    timeout: 180000, // 3 minutes
    maxTurns: 10,
    tools: ['WebSearch'] as string[],
    description: 'Find main competitors quickly',
  },
  full: {
    competitors: '5-8',
    timeout: 600000, // 10 minutes
    maxTurns: 15,
    tools: ['WebSearch'] as string[],
    description: 'Deep competitive analysis',
  },
  url: {
    competitors: '5-8',
    timeout: 600000, // 10 minutes
    maxTurns: 15,
    tools: ['WebSearch', 'WebFetch'] as string[],
    description: 'Analyze website and find competitors',
  },
};

// Prompts for each mode
const QUICK_PROMPT = `You are a SaaS competitive analysis expert.

Find the main competitors for this SaaS idea. Focus on speed over depth.

Guidelines:
- Use WebSearch to find REAL competitors (not hypothetical ones)
- Find 3-5 direct competitors
- Get basic info: name, URL, brief description, approximate pricing
- Don't spend time on deep analysis

IMPORTANT: You MUST use WebSearch. Do not make up competitors.

Return ONLY valid JSON (no markdown):
{
  "ideaSummary": "Brief summary",
  "marketValidation": {
    "score": 7,
    "verdict": "moderate",
    "reasoning": "Brief assessment"
  },
  "targetAudience": ["Audience 1"],
  "competitors": [
    {
      "name": "Name",
      "url": "https://...",
      "description": "What they do",
      "pricing": "$X/month"
    }
  ],
  "opportunities": ["Key opportunity"],
  "risks": ["Key risk"],
  "recommendations": ["Quick recommendation"]
}`;

const FULL_PROMPT = `You are a SaaS market research analyst with expertise in competitive analysis.

Your task is to thoroughly research a SaaS idea and provide actionable insights.

Guidelines:
- Use WebSearch to find REAL competitors (not hypothetical ones)
- Find 5-8 direct competitors
- Analyze features, pricing, strengths, and weaknesses of each
- Be honest about market saturation
- Focus on actionable opportunities and gaps
- Consider pricing strategies
- Look for underserved niches

IMPORTANT: You MUST use WebSearch. Do not make up competitors.

Return ONLY valid JSON (no markdown):
{
  "ideaSummary": "Brief summary of the idea",
  "marketValidation": {
    "score": 7,
    "verdict": "moderate",
    "reasoning": "Detailed explanation of market opportunity"
  },
  "marketSize": "Estimated market size if found",
  "targetAudience": ["Audience 1", "Audience 2"],
  "competitors": [
    {
      "name": "Competitor Name",
      "url": "https://competitor.com",
      "description": "What they do",
      "pricing": "$X-Y/month",
      "features": ["Feature 1", "Feature 2"],
      "strengths": ["Strength 1"],
      "weaknesses": ["Weakness 1"]
    }
  ],
  "opportunities": ["Gap in market", "Underserved audience"],
  "risks": ["Risk 1", "Risk 2"],
  "featureIdeas": ["Feature idea from research"],
  "recommendations": ["Strategic recommendation"]
}`;

const URL_PROMPT = `You are a SaaS competitive analysis expert.

Your task is to analyze a website/product and find its competitors.

STEP 1: First, use WebFetch to analyze the provided URL and understand what the product does.
STEP 2: Then use WebSearch to find 5-8 direct competitors in the same space.
STEP 3: Analyze each competitor's features, pricing, strengths and weaknesses.

Guidelines:
- Use WebFetch first to understand the target website
- Use WebSearch to find REAL competitors (not hypothetical ones)
- Be honest about market saturation
- Focus on actionable insights

IMPORTANT: You MUST use WebFetch and WebSearch tools. Do not make up competitors.

Return ONLY valid JSON (no markdown):
{
  "ideaSummary": "Brief summary of what the analyzed product does",
  "marketValidation": {
    "score": 7,
    "verdict": "moderate",
    "reasoning": "Explanation of market opportunity"
  },
  "marketSize": "Estimated market size if found",
  "targetAudience": ["Audience 1", "Audience 2"],
  "competitors": [
    {
      "name": "Competitor Name",
      "url": "https://competitor.com",
      "description": "What they do",
      "pricing": "$X-Y/month",
      "features": ["Feature 1", "Feature 2"],
      "strengths": ["Strength 1"],
      "weaknesses": ["Weakness 1"]
    }
  ],
  "opportunities": ["Gap in market 1", "Underserved audience"],
  "risks": ["Risk 1", "Risk 2"],
  "featureIdeas": ["Feature idea inspired by research"],
  "recommendations": ["Strategic recommendation"]
}`;

/**
 * Check if input is a URL
 */
function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

/**
 * Extract keywords from description for search queries
 */
function extractKeywords(description: string): string {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
    'saas', 'app', 'application', 'software', 'platform', 'tool', 'service',
    'want', 'create', 'build', 'make', 'help', 'helps', 'allows', 'lets',
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)].slice(0, 4).join(' ');
}

/**
 * Build the prompt based on mode and input
 */
function buildPrompt(input: string, mode: ResearchMode): string {
  const config = MODE_CONFIG[mode];

  if (mode === 'url') {
    return `Analyze this website and find its competitors:

URL: ${input}

First fetch and analyze the URL to understand what the product does, then search for competitors.

${URL_PROMPT}`;
  }

  const keywords = extractKeywords(input);
  const basePrompt = mode === 'quick' ? QUICK_PROMPT : FULL_PROMPT;

  return `Research competitors for this SaaS idea:

"${input}"

Search for competitors using queries like:
- "${keywords} alternatives"
- "${keywords} competitors"
- "best ${keywords} software"

Find ${config.competitors} real competitors.

${basePrompt}`;
}

/**
 * Create fallback research when AI fails
 */
function createFallbackResearch(input: string, mode: ResearchMode): MarketResearch {
  const isUrlInput = isUrl(input);
  return {
    ideaSummary: isUrlInput ? `Analysis of ${input}` : input,
    marketValidation: {
      score: 5,
      verdict: 'moderate',
      reasoning: 'Unable to conduct research. Consider researching competitors manually.',
    },
    targetAudience: ['Target audience to be determined'],
    competitors: [],
    opportunities: ['Research incomplete - opportunities to be identified'],
    risks: ['Research incomplete - risks to be assessed'],
    featureIdeas: mode === 'quick' ? [] : ['Feature ideas to be determined'],
    recommendations: ['Conduct manual competitor research'],
  };
}

/**
 * Conduct competitive research
 *
 * @param input - SaaS idea description or URL to analyze
 * @param options - Research options including mode and progress callback
 * @returns Research result with competitors and analysis
 *
 * Modes:
 * - 'quick': Fast search for 3-5 competitors (~3 min, fewer tokens)
 * - 'full': Deep analysis of 5-8 competitors (~10 min, thorough)
 * - 'url': Analyze a URL and find its competitors (~10 min)
 */
export async function conductResearch(
  input: string,
  options: ResearchOptions,
): Promise<ResearchResult | null> {
  const available = await isClaudeCodeAvailable();
  if (!available) {
    return null;
  }

  // Auto-detect URL mode if URL is provided
  const mode = isUrl(input) ? 'url' : options.mode;
  const config = MODE_CONFIG[mode];
  const prompt = buildPrompt(input, mode);

  let searchCount = 0;

  try {
    options.onProgress?.({
      type: 'analyzing',
      message: mode === 'url' ? 'Analyzing website...' : 'Researching competitors...',
    });

    const response = await claudeGenerateWithProgress(prompt, {
      allowedTools: config.tools,
      maxTurns: config.maxTurns,
      timeout: config.timeout,
      onProgress: (event: ProgressEvent) => {
        if (event.tool === 'status') {
          options.onProgress?.({
            type: 'status',
            message: event.message || 'Researching...',
            ...(event.searchCount !== undefined && { totalSearches: event.searchCount }),
            ...(event.totalSources !== undefined && { totalSources: event.totalSources }),
          });
        } else if (event.type === 'result' && event.sources) {
          options.onProgress?.({
            type: 'sources',
            sources: event.sources,
            message: event.message || 'Found sources',
            ...(event.searchCount !== undefined && { totalSearches: event.searchCount }),
            ...(event.totalSources !== undefined && { totalSources: event.totalSources }),
          });
        } else if (event.tool?.toLowerCase().includes('search') || event.tool === 'WebSearch') {
          searchCount = event.searchCount ?? searchCount + 1;
          options.onProgress?.({
            type: 'search',
            count: searchCount,
            message: event.query
              ? `Searching: "${event.query}"`
              : `Web search #${searchCount}...`,
            totalSearches: searchCount,
            ...(event.query && { query: event.query }),
            ...(event.totalSources !== undefined && { totalSources: event.totalSources }),
          });
        } else if (event.tool === 'WebFetch') {
          options.onProgress?.({
            type: 'analyzing',
            message: 'Fetching and analyzing website...',
          });
        }
      },
    });

    // Extract session ID and result
    const { result: responseText, sessionId } = response;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const fallback = createFallbackResearch(input, mode);
      fallback.marketValidation.reasoning = 'AI response did not contain valid JSON. ' + fallback.marketValidation.reasoning;
      return { research: fallback, isFallback: true, sessionId, error: 'Invalid AI response format' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as MarketResearch;

    // Validate required fields
    if (!parsed.marketValidation || !parsed.competitors) {
      const fallback = createFallbackResearch(input, mode);
      return { research: fallback, isFallback: true, sessionId, error: 'Incomplete research data' };
    }

    return { research: parsed, isFallback: false, sessionId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallback = createFallbackResearch(input, mode);
    return { research: fallback, isFallback: true, error: errorMessage };
  }
}

/**
 * Quick competitor search (fewer tokens, faster)
 * Alias for conductResearch with mode='quick'
 */
export async function findCompetitors(
  input: string,
  onProgress?: ResearchProgressCallback,
): Promise<ResearchResult | null> {
  return conductResearch(input, { mode: 'quick', onProgress });
}

/**
 * Full market research (more tokens, thorough)
 * Alias for conductResearch with mode='full'
 */
export async function fullMarketResearch(
  input: string,
  onProgress?: ResearchProgressCallback,
): Promise<ResearchResult | null> {
  return conductResearch(input, { mode: 'full', onProgress });
}

/**
 * Check if market research suggests proceeding
 */
export function shouldProceedWithIdea(research: MarketResearch): {
  proceed: boolean;
  reason: string;
} {
  const { score, verdict } = research.marketValidation;

  if (verdict === 'saturated') {
    return {
      proceed: false,
      reason: 'Market appears saturated. Consider pivoting or finding a unique angle.',
    };
  }

  if (score <= 3) {
    return {
      proceed: false,
      reason: 'Low market validation score. The idea may need refinement.',
    };
  }

  if (score <= 5) {
    return {
      proceed: true,
      reason: 'Moderate opportunity. Proceed with caution and focus on differentiation.',
    };
  }

  return {
    proceed: true,
    reason: 'Good market opportunity identified.',
  };
}

/**
 * Get mode configuration (for UI display)
 */
export function getModeConfig(mode: ResearchMode) {
  return MODE_CONFIG[mode];
}
