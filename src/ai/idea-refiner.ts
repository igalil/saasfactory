import { claudeGenerate, isClaudeCodeAvailable } from './claude-cli.js';

export interface RefinedIdea {
  summary: string;
  keyFeatures: string[];
  targetAudience: string;
  uniqueAngle?: string;
}

export interface CompetitorInfo {
  name: string;
  description: string;
}

export interface IdeaRefinementResult {
  versions: RefinedIdea[];
  clarifyingQuestions?: string[];
  success: boolean;
  error?: string;
}

export interface NameSuggestionResult {
  competitors: CompetitorInfo[];
  suggestedNames: string[];
  success: boolean;
  error?: string;
}

const IDEA_REFINER_PROMPT = `You are a SaaS product strategist helping refine rough idea descriptions into clear, actionable concepts.

Your task is to take a user's raw idea description and:
1. Clean up grammar and make it more professional
2. Identify the core value proposition
3. Suggest 2-3 refined versions with slightly different angles/focuses

Return ONLY valid JSON matching this structure (no markdown):
{
  "versions": [
    {
      "summary": "A concise, grammatically correct description of the SaaS idea (2-3 sentences max)",
      "keyFeatures": ["Feature 1", "Feature 2", "Feature 3"],
      "targetAudience": "Who this is for",
      "uniqueAngle": "What makes this version different from others"
    }
  ],
  "clarifyingQuestions": ["Optional questions if critical info is missing"]
}

Guidelines:
- Keep summaries concise but complete (2-3 sentences)
- Each version should have a slightly different focus or angle
- Version 1: Most faithful to user's original intent
- Version 2: A broader/more commercial interpretation
- Version 3: A more niche/focused interpretation
- Only include clarifyingQuestions if genuinely ambiguous`;

const NAME_SUGGESTION_PROMPT = `You are a SaaS naming expert. Given a product description, you need to:
1. Search for 3-5 existing competitors in this space
2. Suggest 5 creative, memorable project names that don't conflict with competitors

IMPORTANT: You MUST use web search to find real competitors. Search for terms like "[idea keywords] website", "[idea keywords] app", "[idea keywords] tool".

Return ONLY valid JSON matching this structure (no markdown):
{
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do (1 sentence)"
    }
  ],
  "suggestedNames": ["Name1", "Name2", "Name3", "Name4", "Name5"]
}

Guidelines for names:
- Short, catchy, brandable (1-2 words max)
- Easy to spell and remember
- Avoid generic names like "SaaS Tool" or "App Builder"
- Names should NOT match competitor names
- Consider combining relevant words creatively`;

function createRefinementFallback(rawIdea: string, error?: string): IdeaRefinementResult {
  return {
    versions: [{ summary: rawIdea, keyFeatures: [], targetAudience: 'To be determined' }],
    success: false,
    error,
  };
}

function createNameFallback(error?: string): NameSuggestionResult {
  return {
    competitors: [],
    suggestedNames: [],
    success: false,
    error,
  };
}

/**
 * Refine a raw user idea into 2-3 polished versions (quick, no web search)
 */
export async function refineIdea(rawIdea: string): Promise<IdeaRefinementResult> {
  const debug = process.env.DEBUG_REFINE === '1';

  if (!await isClaudeCodeAvailable()) {
    if (debug) console.error('[refineIdea] Claude Code not available');
    return createRefinementFallback(rawIdea, 'Claude Code not available');
  }

  try {
    if (debug) console.error('[refineIdea] Calling claudeGenerate...');

    const response = await claudeGenerate(
      `Refine this SaaS idea into 2-3 clear, professional versions:\n\nUser's raw input:\n"${rawIdea}"\n\n${IDEA_REFINER_PROMPT}`,
      { outputFormat: 'json', timeout: 60000 },
    );

    if (debug) console.error('[refineIdea] Response:', response.slice(0, 500));

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (debug) console.error('[refineIdea] No JSON match found');
      return createRefinementFallback(rawIdea, 'Invalid AI response format');
    }

    if (debug) console.error('[refineIdea] JSON match:', jsonMatch[0].slice(0, 300));

    const parsed = JSON.parse(jsonMatch[0]) as IdeaRefinementResult;
    if (!parsed.versions?.length) {
      if (debug) console.error('[refineIdea] No versions in parsed result');
      return createRefinementFallback(rawIdea, 'No refined versions generated');
    }

    return { ...parsed, success: true };
  } catch (error) {
    if (debug) console.error('[refineIdea] Error:', error);
    return createRefinementFallback(rawIdea, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Search for competitors and suggest project names based on the finalized idea
 */
export async function suggestProjectNames(ideaDescription: string): Promise<NameSuggestionResult> {
  const debug = process.env.DEBUG_REFINE === '1';

  if (!await isClaudeCodeAvailable()) {
    if (debug) console.error('[suggestNames] Claude Code not available');
    return createNameFallback('Claude Code not available');
  }

  try {
    if (debug) console.error('[suggestNames] Calling claudeGenerate with web search...');

    const response = await claudeGenerate(
      `Find competitors and suggest project names for this product:\n\n"${ideaDescription}"\n\n${NAME_SUGGESTION_PROMPT}`,
      {
        outputFormat: 'json',
        timeout: 120000,
        allowedTools: ['WebSearch'],
      },
    );

    if (debug) console.error('[suggestNames] Response:', response.slice(0, 500));

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (debug) console.error('[suggestNames] No JSON match found');
      return createNameFallback('Invalid AI response format');
    }

    const parsed = JSON.parse(jsonMatch[0]) as NameSuggestionResult;

    // Ensure arrays exist
    parsed.competitors = parsed.competitors || [];
    parsed.suggestedNames = parsed.suggestedNames || [];

    return { ...parsed, success: true };
  } catch (error) {
    if (debug) console.error('[suggestNames] Error:', error);
    return createNameFallback(error instanceof Error ? error.message : String(error));
  }
}
