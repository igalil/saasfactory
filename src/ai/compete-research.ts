import { claudeGenerateWithProgress, isClaudeCodeAvailable, type ProgressEvent } from './claude-cli.js';
import type { MarketResearch } from '../core/context.js';
import type { MarketResearchResult } from './market-research.js';

/**
 * Result from compete research including session ID for follow-up questions
 */
export interface CompeteResearchResult extends MarketResearchResult {
  sessionId?: string;
}

export interface CompeteProgressCallback {
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

const COMPETE_URL_PROMPT = `You are a SaaS competitive analysis expert.

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

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
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

const COMPETE_IDEA_PROMPT = `You are a SaaS competitive analysis expert.

Your task is to research competitors for a SaaS idea.

Guidelines:
- Use WebSearch to find REAL competitors (not hypothetical ones)
- Search for 5-8 direct competitors in the same space
- Analyze each competitor's features, pricing, strengths and weaknesses
- Be honest about market saturation
- Focus on actionable insights

IMPORTANT: You MUST use WebSearch tool. Do not make up competitors.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "ideaSummary": "Brief summary of the idea being researched",
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
 * Research competition for a SaaS idea or analyze a competitor URL
 * Returns research results and session ID for follow-up questions
 */
export async function competeResearch(
  input: string,
  onProgress?: CompeteProgressCallback,
): Promise<CompeteResearchResult | null> {
  const available = await isClaudeCodeAvailable();
  if (!available) {
    return null;
  }

  const isUrlInput = isUrl(input);
  let searchCount = 0;

  const prompt = isUrlInput
    ? `Analyze this website and find its competitors:

URL: ${input}

First fetch and analyze the URL to understand what the product does, then search for competitors.

${COMPETE_URL_PROMPT}`
    : `Research competitors for this SaaS idea:

"${input}"

Search for competitors using queries like:
- "${input} alternatives"
- "${input} competitors"
- "best ${input} software"
- "${input} SaaS tools"

Find 5-8 real competitors, analyze their features and pricing, and identify market opportunities.

${COMPETE_IDEA_PROMPT}`;

  try {
    onProgress?.({
      type: 'analyzing',
      message: isUrlInput ? 'Analyzing website...' : 'Researching competitors...',
    });

    const response = await claudeGenerateWithProgress(prompt, {
      allowedTools: isUrlInput ? ['WebSearch', 'WebFetch'] : ['WebSearch'],
      maxTurns: 15,
      timeout: 600000, // 10 minutes
      onProgress: (event: ProgressEvent) => {
        if (event.tool === 'status') {
          onProgress?.({
            type: 'status',
            message: event.message || 'Researching...',
            ...(event.searchCount !== undefined && { totalSearches: event.searchCount }),
            ...(event.totalSources !== undefined && { totalSources: event.totalSources }),
          });
        } else if (event.type === 'result' && event.sources) {
          onProgress?.({
            type: 'sources',
            sources: event.sources,
            message: event.message || 'Found sources',
            ...(event.searchCount !== undefined && { totalSearches: event.searchCount }),
            ...(event.totalSources !== undefined && { totalSources: event.totalSources }),
          });
        } else if (event.tool?.toLowerCase().includes('search') || event.tool === 'WebSearch') {
          searchCount = event.searchCount ?? searchCount + 1;
          onProgress?.({
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
          onProgress?.({
            type: 'analyzing',
            message: 'Fetching and analyzing website...',
          });
        }
      },
    });

    // Extract session ID for follow-up questions
    const { result: responseText, sessionId } = response;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const fallback = createFallbackResearch(input, isUrlInput);
      fallback.marketValidation.reasoning = 'AI response did not contain valid JSON. ' + fallback.marketValidation.reasoning;
      return { research: fallback, isFallback: true, error: 'Invalid AI response format', sessionId };
    }

    const parsed = JSON.parse(jsonMatch[0]) as MarketResearch;

    // Validate required fields
    if (!parsed.marketValidation || !parsed.competitors) {
      const fallback = createFallbackResearch(input, isUrlInput);
      return { research: fallback, isFallback: true, error: 'Incomplete research data', sessionId };
    }

    return { research: parsed, isFallback: false, sessionId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallback = createFallbackResearch(input, isUrlInput);
    return { research: fallback, isFallback: true, error: errorMessage };
  }
}

/**
 * Create fallback research when AI fails
 */
function createFallbackResearch(input: string, isUrl: boolean): MarketResearch {
  return {
    ideaSummary: isUrl ? `Analysis of ${input}` : input,
    marketValidation: {
      score: 5,
      verdict: 'moderate',
      reasoning: 'Unable to conduct full competitive research. Consider researching competitors manually.',
    },
    targetAudience: ['Target audience to be determined'],
    competitors: [],
    opportunities: ['Market research incomplete - opportunities to be identified'],
    risks: ['Market research incomplete - risks to be assessed'],
    featureIdeas: ['Feature ideas to be determined based on competitor analysis'],
    recommendations: ['Conduct manual competitor research'],
  };
}
