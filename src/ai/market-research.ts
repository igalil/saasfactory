import { claudeGenerateWithProgress, isClaudeCodeAvailable, type ProgressEvent } from './claude-cli.js';
import type { MarketResearch, SaasType } from '../core/context.js';

export interface ResearchProgressCallback {
  (event: {
    type: 'search' | 'status' | 'sources';
    count?: number;
    message: string;
    query?: string;
    sources?: string[];
    totalSearches?: number;
    totalSources?: number;
  }): void;
}

const MARKET_RESEARCH_PROMPT = `You are a SaaS market research analyst with expertise in competitive analysis.

Your task is to research a SaaS idea and provide actionable insights.

Guidelines:
- Use web search to find REAL competitors (not hypothetical ones)
- Be honest about market saturation - don't sugarcoat if the market is crowded
- Focus on actionable opportunities and gaps
- Suggest features that fill gaps in the market
- Consider pricing strategies of competitors
- Look for underserved niches or audiences

IMPORTANT: You MUST use web search to find current, real competitors. Do not make up competitors.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "ideaSummary": "Brief summary of the idea",
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
 * Conduct market research for a SaaS idea using Claude with web search
 */
export async function conductMarketResearch(
  ideaDescription: string,
  saasType: SaasType,
  onProgress?: ResearchProgressCallback,
): Promise<MarketResearchResult | null> {
  // Check if Claude Code is available
  const available = await isClaudeCodeAvailable();
  if (!available) {
    return null;
  }

  // Extract keywords for search
  const keywords = extractKeywords(ideaDescription);

  const prompt = `Research this SaaS idea:

"${ideaDescription}"

Type: ${saasType.toUpperCase()} SaaS

Search for competitors using queries like:
- "${keywords} SaaS"
- "${keywords} software"
- "${keywords} tool"
- "best ${keywords} platforms"

Find 3-5 real competitors, analyze their features and pricing, and identify market opportunities.

${MARKET_RESEARCH_PROMPT}`;

  // Track search count for progress
  let searchCount = 0;

  try {
    const response = await claudeGenerateWithProgress(prompt, {
      allowedTools: ['WebSearch'],
      maxTurns: 15,
      timeout: 1200000, // 20 minutes for thorough research
      onProgress: (event: ProgressEvent) => {
        if (event.tool === 'status') {
          // Pass through status/elapsed time updates
          onProgress?.({
            type: 'status',
            message: event.message || 'Researching...',
            totalSearches: event.searchCount,
            totalSources: event.totalSources,
          });
        } else if (event.type === 'result' && event.sources) {
          // Pass through found sources
          onProgress?.({
            type: 'sources',
            sources: event.sources,
            message: event.message || 'Found sources',
            totalSearches: event.searchCount,
            totalSources: event.totalSources,
          });
        } else if (event.tool?.toLowerCase().includes('search') || event.tool === 'WebSearch') {
          searchCount = event.searchCount ?? searchCount + 1;
          onProgress?.({
            type: 'search',
            count: searchCount,
            query: event.query,
            message: event.query
              ? `Searching: "${event.query}"`
              : `Web search #${searchCount}...`,
            totalSearches: searchCount,
            totalSources: event.totalSources,
          });
        }
      },
    });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Return fallback with flag
      const fallback = createFallbackResearch(ideaDescription);
      fallback.marketValidation.reasoning = 'AI response did not contain valid JSON. ' + fallback.marketValidation.reasoning;
      return { research: fallback, isFallback: true, error: 'Invalid AI response format' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as MarketResearch;

    // Validate required fields
    if (!parsed.marketValidation || !parsed.competitors) {
      const fallback = createFallbackResearch(ideaDescription);
      return { research: fallback, isFallback: true, error: 'Incomplete research data' };
    }

    return { research: parsed, isFallback: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallback = createFallbackResearch(ideaDescription);
    return { research: fallback, isFallback: true, error: errorMessage };
  }
}

export interface MarketResearchResult {
  research: MarketResearch;
  isFallback: boolean;
  error?: string;
}

/**
 * Extract keywords from idea description for search
 */
function extractKeywords(description: string): string {
  // Remove common words and extract key terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom',
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

  // Return top 3-4 unique keywords
  const unique = [...new Set(words)];
  return unique.slice(0, 4).join(' ');
}

/**
 * Create fallback research when AI fails
 */
function createFallbackResearch(ideaDescription: string): MarketResearch {
  return {
    ideaSummary: ideaDescription,
    marketValidation: {
      score: 5,
      verdict: 'moderate',
      reasoning: 'Unable to conduct full market research. Consider researching competitors manually before proceeding.',
    },
    targetAudience: ['Target audience to be determined'],
    competitors: [],
    opportunities: ['Market research incomplete - opportunities to be identified'],
    risks: ['Market research incomplete - risks to be assessed'],
    featureIdeas: ['Feature ideas to be determined based on competitor analysis'],
    recommendations: ['Conduct manual competitor research before building'],
  };
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
