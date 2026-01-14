import { claudeGenerate, isClaudeCodeAvailable } from './claude-cli.js';

export interface ProjectQuestion {
  id: string;
  question: string;
  options: { value: string; label: string }[];
  multiSelect?: boolean;
}

export interface ProjectAnalysis {
  projectType: string; // e.g., "mobile game", "web saas", "api service"
  suggestedFeatures: { id: string; label: string; description: string }[];
  pricingOptions: { value: string; label: string; hint: string }[];
  questions: ProjectQuestion[];
  success: boolean;
  error?: string;
}

const PROJECT_ANALYZER_PROMPT = `You are a product strategist. Analyze this project idea and suggest RELEVANT options.

Return ONLY valid JSON (no markdown):
{
  "projectType": "short description of what type of project this is (e.g., 'mobile game app', 'B2B SaaS', 'e-commerce platform')",
  "suggestedFeatures": [
    { "id": "feature-id", "label": "Feature Name", "description": "Why this is relevant" }
  ],
  "pricingOptions": [
    { "value": "pricing-id", "label": "Pricing Model", "hint": "Brief explanation" }
  ],
  "questions": [
    {
      "id": "question-id",
      "question": "A relevant question about the project?",
      "options": [
        { "value": "option1", "label": "Option 1" },
        { "value": "option2", "label": "Option 2" }
      ],
      "multiSelect": false
    }
  ]
}

Guidelines:
- suggestedFeatures: 5-8 features RELEVANT to this specific project type (not generic SaaS features)
- pricingOptions: 3-4 pricing models that make sense for this project
- questions: 2-4 important questions to clarify the project scope
- Keep everything concise and actionable
- For games: think achievements, leaderboards, multiplayer, etc.
- For SaaS: think integrations, team features, API access, etc.
- For mobile apps: think offline mode, push notifications, etc.`;

function createFallback(error?: string): ProjectAnalysis {
  return {
    projectType: 'web application',
    suggestedFeatures: [
      { id: 'user-accounts', label: 'User Accounts', description: 'Basic authentication' },
      { id: 'analytics', label: 'Analytics', description: 'Track usage' },
    ],
    pricingOptions: [
      { value: 'freemium', label: 'Freemium', hint: 'Free tier + paid' },
      { value: 'subscription', label: 'Subscription', hint: 'Monthly/yearly' },
      { value: 'one-time', label: 'One-time', hint: 'Single purchase' },
    ],
    questions: [],
    success: false,
    error,
  };
}

/**
 * Analyze a project idea and generate relevant questions/options
 */
export async function analyzeProject(ideaDescription: string): Promise<ProjectAnalysis> {
  const debug = process.env.DEBUG_ANALYZER === '1';

  if (!await isClaudeCodeAvailable()) {
    if (debug) console.error('[analyzeProject] Claude Code not available');
    return createFallback('Claude Code not available');
  }

  try {
    if (debug) console.error('[analyzeProject] Calling claudeGenerate...');

    const response = await claudeGenerate(
      `Analyze this project and suggest relevant features, pricing, and questions:\n\n"${ideaDescription}"\n\n${PROJECT_ANALYZER_PROMPT}`,
      { outputFormat: 'json', timeout: 60000 },
    );

    if (debug) console.error('[analyzeProject] Response:', response.slice(0, 500));

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (debug) console.error('[analyzeProject] No JSON match found');
      return createFallback('Invalid AI response format');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ProjectAnalysis;

    // Ensure arrays exist
    parsed.suggestedFeatures = parsed.suggestedFeatures || [];
    parsed.pricingOptions = parsed.pricingOptions || [];
    parsed.questions = parsed.questions || [];

    return { ...parsed, success: true };
  } catch (error) {
    if (debug) console.error('[analyzeProject] Error:', error);
    return createFallback(error instanceof Error ? error.message : String(error));
  }
}
