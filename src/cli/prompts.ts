import * as p from '@clack/prompts';
import color from 'picocolors';
import path from 'path';
import type { PricingType, SaasType, AnalyticsProvider, SaasIdea } from '../core/context.js';
import { formatIdeaForSelection } from '../ai/idea-report.js';
import type { RefinedIdea } from '../ai/idea-refiner.js';
import type { ProjectAnalysis, ProjectQuestion } from '../ai/project-analyzer.js';
import { killAllChildProcesses } from '../ai/claude-cli.js';

export type IdeaMode = 'has_idea' | 'discover' | 'validate';

export interface InitialPromptAnswers {
  projectName: string;
  description: string;
}

export interface FeaturePromptAnswers {
  saasType: SaasType;
  pricingType: PricingType;
  features: string[];
  analytics: AnalyticsProvider;
}

export interface BrandingPromptAnswers {
  domain: string;
  tagline: string;
}

export const GO_BACK_SECTION = Symbol('GO_BACK_SECTION');

// Track ESC presses for double-ESC detection
let lastEscTime = 0;

let signalHandlersSetup = false;

/**
 * Setup Ctrl-C handler to exit properly
 * Must be called before any prompts
 *
 * Note: @clack/prompts uses raw mode which captures Ctrl-C as a character (0x03)
 * instead of sending SIGINT. We intercept it at the stdin level using 'data' event
 * with prependListener to ensure we see it first.
 */
export function setupSignalHandlers(): void {
  if (signalHandlersSetup) return;
  signalHandlersSetup = true;

  const exitWithCancel = () => {
    console.log(''); // New line after ^C
    // Kill any spawned child processes (Claude CLI) before exiting
    killAllChildProcesses();
    p.outro(color.yellow('Cancelled'));
    process.exit(0);
  };

  // Handle SIGINT for non-TTY mode
  process.on('SIGINT', exitWithCancel);

  // For TTY mode, intercept Ctrl-C at the raw stdin level
  // Use prependListener to run before @clack/prompts handlers
  if (process.stdin.isTTY) {
    process.stdin.prependListener('data', (data: Buffer) => {
      // Ctrl-C is byte 0x03 (ETX - End of Text)
      if (data.length === 1 && data[0] === 0x03) {
        exitWithCancel();
      }
    });
  }
}

/**
 * Sanitize project name for use as folder, npm package, GitHub repo, etc.
 */
function sanitizeProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Check if ESC was pressed (cancel) and handle double-ESC for going back
 * Returns: 'back' if double ESC, 'hint' if single ESC, null if not cancelled
 */
function checkEscForBack(value: unknown): 'back' | 'hint' | null {
  if (!p.isCancel(value)) return null;

  const now = Date.now();
  const timeSinceLastEsc = now - lastEscTime;
  lastEscTime = now;

  if (timeSinceLastEsc < 1000) {
    // Double ESC within 1 second - go back
    return 'back';
  } else {
    // Single ESC - show hint
    p.log.info(color.dim('Press ESC again within 1 second to go back'));
    return 'hint';
  }
}


/**
 * Prompt for project name with optional AI suggestions
 */
export async function promptName(
  suggestedNames?: string[],
  canGoBack = false,
  initialValue?: string,
): Promise<string | typeof GO_BACK_SECTION> {
  p.log.info(color.dim('Tip: Double-press ESC to go back, Ctrl-C to quit'));

  // If we have suggestions, show them as options
  if (suggestedNames && suggestedNames.length > 0) {
    while (true) {
      const options = suggestedNames.map(name => ({
        value: name,
        label: name,
        hint: sanitizeProjectName(name),
      }));

      // Add custom option
      options.push({
        value: '__custom__',
        label: 'Enter custom name',
        hint: 'Type your own project name',
      });

      const selection = await p.select({
        message: 'Choose a project name:',
        options,
      });

      const escAction = checkEscForBack(selection);
      if (escAction === 'hint') continue;
      if (escAction === 'back') {
        if (canGoBack) return GO_BACK_SECTION;
        continue;
      }

      if (selection === '__custom__') {
        // Fall through to text input
        break;
      }

      const sanitized = sanitizeProjectName(String(selection));
      p.log.info(`Folder name: ${color.cyan(sanitized)}`);
      return sanitized;
    }
  }

  // Text input for custom name
  while (true) {
    const projectName = await p.text({
      message: 'What is your project name?',
      placeholder: 'my-saas-app',
      initialValue,
      validate: (value) => {
        if (!value.trim()) return 'Project name is required';
        const sanitized = sanitizeProjectName(value);
        if (!sanitized) return 'Must contain at least one letter or number';
      },
    });

    const escAction = checkEscForBack(projectName);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    const sanitized = sanitizeProjectName(String(projectName));

    // Show sanitized name if different
    if (sanitized !== projectName) {
      p.log.info(`Folder name: ${color.cyan(sanitized)}`);
    }

    return sanitized;
  }
}

export async function promptDescription(canGoBack = false, initialValue?: string): Promise<string | typeof GO_BACK_SECTION> {
  while (true) {
    const descText = await p.text({
      message: 'Describe your SaaS idea:',
      placeholder: 'A platform that helps users...',
      initialValue,
      validate: (value) => {
        if (!value.trim()) return 'Please describe your SaaS idea';
        if (value.length < 20) return 'Please provide more detail (at least 20 characters)';
      },
    });

    const escAction = checkEscForBack(descText);
    if (escAction === 'hint') continue; // Re-ask
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue; // Can't go back, re-ask
    }

    return String(descText);
  }
}

export async function promptFeatures(canGoBack = false): Promise<FeaturePromptAnswers | typeof GO_BACK_SECTION> {
  let step = 0;
  const answers: Partial<FeaturePromptAnswers> = {};

  while (step < 4) {
    if (step === 0) {
      const saasType = await p.select({
        message: 'What type of SaaS is this?',
        options: [
          { value: 'b2b', label: 'B2B', hint: 'Business to Business' },
          { value: 'b2c', label: 'B2C', hint: 'Business to Consumer' },
          { value: 'marketplace', label: 'Marketplace', hint: 'Two-sided platform' },
          { value: 'tool', label: 'Tool', hint: 'Utility/Productivity' },
        ],
      });

      const escAction = checkEscForBack(saasType);
      if (escAction === 'hint') continue;
      if (escAction === 'back') {
        if (canGoBack) return GO_BACK_SECTION;
        continue; // Can't go back further, re-ask
      }

      answers.saasType = saasType as SaasType;
      step++;
    } else if (step === 1) {
      const pricingType = await p.select({
        message: 'What is your pricing model?',
        options: [
          { value: 'freemium', label: 'Freemium', hint: 'Free tier + paid plans' },
          { value: 'subscription', label: 'Subscription', hint: 'Monthly/yearly' },
          { value: 'one-time', label: 'One-time', hint: 'Single payment' },
          { value: 'usage-based', label: 'Usage-based', hint: 'Pay per use' },
        ],
      });

      const escAction = checkEscForBack(pricingType);
      if (escAction === 'hint') continue;
      if (escAction === 'back') { step--; continue; }

      answers.pricingType = pricingType as PricingType;
      step++;
    } else if (step === 2) {
      const features = await p.multiselect({
        message: 'Select additional features (space to toggle, enter to confirm):',
        options: [
          { value: 'waitlist', label: 'Waitlist / Early Access' },
          { value: 'support-chat', label: 'Support Chat (Crisp)' },
          { value: 'feature-flags', label: 'Feature Flags' },
          { value: 'changelog', label: 'Changelog Page' },
          { value: 'status-page', label: 'Status Page' },
          { value: 'referral', label: 'Referral System' },
          { value: 'multi-tenancy', label: 'Multi-tenancy' },
          { value: 'api-docs', label: 'API Documentation' },
          { value: 'i18n', label: 'i18n (Multi-language)' },
          { value: 'ab-testing', label: 'A/B Testing' },
          { value: 'onboarding', label: 'Onboarding Flow' },
          { value: 'admin', label: 'Admin Dashboard' },
        ],
        required: false,
      });

      const escAction = checkEscForBack(features);
      if (escAction === 'hint') continue;
      if (escAction === 'back') { step--; continue; }

      answers.features = (features as string[]) || [];
      step++;
    } else if (step === 3) {
      const analytics = await p.select({
        message: 'Which analytics provider?',
        options: [
          { value: 'posthog', label: 'PostHog', hint: 'Recommended' },
          { value: 'plausible', label: 'Plausible', hint: 'Privacy-focused' },
          { value: 'none', label: 'None' },
        ],
      });

      const escAction = checkEscForBack(analytics);
      if (escAction === 'hint') continue;
      if (escAction === 'back') { step--; continue; }

      answers.analytics = analytics as AnalyticsProvider;
      step++;
    }
  }

  return answers as FeaturePromptAnswers;
}

export async function promptBranding(canGoBack = false): Promise<BrandingPromptAnswers | typeof GO_BACK_SECTION> {
  let step = 0;
  const answers: Partial<BrandingPromptAnswers> = {};

  while (step < 2) {
    if (step === 0) {
      const domain = await p.text({
        message: 'Preferred domain (without .com):',
        placeholder: 'myapp',
        initialValue: answers.domain,
      });

      const escAction = checkEscForBack(domain);
      if (escAction === 'hint') continue;
      if (escAction === 'back') {
        if (canGoBack) return GO_BACK_SECTION;
        continue; // Can't go back further, re-ask
      }

      answers.domain = String(domain || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      step++;
    } else if (step === 1) {
      const tagline = await p.text({
        message: 'Tagline for your SaaS (optional):',
        placeholder: 'The easiest way to...',
        initialValue: answers.tagline,
      });

      const escAction = checkEscForBack(tagline);
      if (escAction === 'hint') continue;
      if (escAction === 'back') { step--; continue; }

      answers.tagline = String(tagline || '');
      step++;
    }
  }

  return answers as BrandingPromptAnswers;
}

export async function promptConfirm(message: string, canGoBack = false): Promise<boolean | typeof GO_BACK_SECTION> {
  while (true) {
    const result = await p.confirm({
      message,
      initialValue: true,
    });

    const escAction = checkEscForBack(result);
    if (escAction === 'hint') continue; // Re-ask
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue; // Can't go back, re-ask
    }

    return Boolean(result);
  }
}

export async function promptApiKeys(): Promise<Record<string, string>> {
  p.log.info('Enter your API keys (optional - can be set later in .env)');

  let githubToken: string | symbol = '';
  while (true) {
    githubToken = await p.password({
      message: 'GitHub Token:',
      mask: '*',
    });
    const escAction = checkEscForBack(githubToken);
    if (escAction === 'hint' || escAction === 'back') continue;
    break;
  }

  let vercelToken: string | symbol = '';
  while (true) {
    vercelToken = await p.password({
      message: 'Vercel Token:',
      mask: '*',
    });
    const escAction = checkEscForBack(vercelToken);
    if (escAction === 'hint' || escAction === 'back') continue;
    break;
  }

  let openaiApiKey: string | symbol = '';
  while (true) {
    openaiApiKey = await p.password({
      message: 'OpenAI API Key:',
      mask: '*',
    });
    const escAction = checkEscForBack(openaiApiKey);
    if (escAction === 'hint' || escAction === 'back') continue;
    break;
  }

  return {
    githubToken: String(githubToken || ''),
    vercelToken: String(vercelToken || ''),
    openaiApiKey: String(openaiApiKey || ''),
  };
}

/**
 * Prompt user to choose between having an idea, discovering one, or validating a rough idea
 */
export async function promptIdeaMode(canGoBack = false): Promise<IdeaMode | typeof GO_BACK_SECTION> {
  while (true) {
    const mode = await p.select({
      message: 'Do you have a SaaS idea?',
      options: [
        { value: 'has_idea', label: 'Yes, I have an idea', hint: 'Continue with your idea' },
        { value: 'discover', label: 'No, help me discover one', hint: 'AI-powered idea research' },
        { value: 'validate', label: 'I have a rough idea to refine', hint: 'Validate and improve your concept' },
      ],
    });

    const escAction = checkEscForBack(mode);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    return mode as IdeaMode;
  }
}

/**
 * Prompt for optional sector/industry focus
 */
export async function promptSectorFocus(canGoBack = false): Promise<string | null | typeof GO_BACK_SECTION> {
  while (true) {
    const wantSector = await p.confirm({
      message: 'Would you like to focus on a specific sector or industry?',
      initialValue: false,
    });

    const escAction = checkEscForBack(wantSector);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    if (!wantSector) return null;

    while (true) {
      const sector = await p.text({
        message: 'What sector or industry? (e.g., "developer tools", "healthcare", "e-commerce")',
        placeholder: 'developer tools',
      });

      const sectorEscAction = checkEscForBack(sector);
      if (sectorEscAction === 'hint') continue;
      if (sectorEscAction === 'back') break; // Go back to wantSector question

      return String(sector).trim() || null;
    }
  }
}

/**
 * Prompt for rough idea to validate/refine
 */
export async function promptRoughIdea(canGoBack = false): Promise<string | typeof GO_BACK_SECTION> {
  while (true) {
    const idea = await p.text({
      message: 'Describe your rough idea (we\'ll research and refine it):',
      placeholder: 'A tool that helps...',
      validate: (value) => {
        if (!value.trim()) return 'Please describe your idea';
        if (value.length < 10) return 'Please provide a bit more detail';
      },
    });

    const escAction = checkEscForBack(idea);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    return String(idea);
  }
}

/**
 * Prompt user to select from discovered ideas or request more
 */
export async function promptIdeaSelection(
  ideas: SaasIdea[],
  canGoBack = false,
): Promise<SaasIdea | 'more' | 'sector' | typeof GO_BACK_SECTION> {
  while (true) {
    const options = ideas.map((idea, index) => formatIdeaForSelection(idea, index));

    // Add action options
    options.push(
      { value: '__more__', label: 'Generate more ideas', hint: 'Run another discovery search' },
      { value: '__sector__', label: 'Focus on different sector', hint: 'Search in a specific industry' },
    );

    const selection = await p.select({
      message: 'Select an idea to continue:',
      options,
    });

    const escAction = checkEscForBack(selection);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    if (selection === '__more__') return 'more';
    if (selection === '__sector__') return 'sector';

    // Find selected idea
    const selectedIdea = ideas.find(i => i.id === selection);
    if (selectedIdea) return selectedIdea;

    continue; // Invalid selection, re-prompt
  }
}

/**
 * Prompt user to confirm selected idea before proceeding
 */
export async function promptIdeaConfirmation(
  idea: SaasIdea,
  canGoBack = false,
): Promise<boolean | typeof GO_BACK_SECTION> {
  while (true) {
    const confirmed = await p.confirm({
      message: `Proceed with "${idea.name}"?`,
      initialValue: true,
    });

    const escAction = checkEscForBack(confirmed);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    return Boolean(confirmed);
  }
}

export type IdeaRefinementSelection =
  | { type: 'selected'; idea: RefinedIdea }
  | { type: 'custom'; text: string }
  | { type: 'skip' }
  | typeof GO_BACK_SECTION;

/**
 * Prompt user to select from refined idea versions
 */
export async function promptIdeaRefinement(
  refinedIdeas: RefinedIdea[],
  originalIdea: string,
  _clarifyingQuestions?: string[], // Not used - kept for API compatibility
  canGoBack = false,
): Promise<IdeaRefinementSelection> {
  // Display all versions with full details BEFORE the select
  p.log.info(color.cyan('Refined versions of your idea:'));
  p.log.message('');

  refinedIdeas.forEach((idea, index) => {
    const label = index === 0 ? `${color.green('Version 1 (Recommended)')}` : `Version ${index + 1}`;
    p.log.message(`${color.bold(label)}`);
    p.log.message(`${color.dim('Summary:')} ${idea.summary}`);
    if (idea.keyFeatures?.length > 0) {
      p.log.message(`${color.dim('Features:')} ${idea.keyFeatures.join(', ')}`);
    }
    if (idea.targetAudience) {
      p.log.message(`${color.dim('Target:')} ${idea.targetAudience}`);
    }
    if (idea.uniqueAngle) {
      p.log.message(`${color.dim('Angle:')} ${idea.uniqueAngle}`);
    }
    p.log.message('');
  });

  while (true) {
    const options = refinedIdeas.map((idea, index) => ({
      value: `idea_${index}`,
      label: `Version ${index + 1}${index === 0 ? ' (Recommended)' : ''}`,
    }));

    // Add custom and skip options
    options.push(
      { value: '__custom__', label: 'Write my own version' },
      { value: '__skip__', label: 'Use original as-is' },
    );

    const selection = await p.select({
      message: 'Which version do you want to use?',
      options,
    });

    const escAction = checkEscForBack(selection);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    if (selection === '__skip__') {
      return { type: 'skip' };
    }

    if (selection === '__custom__') {
      while (true) {
        const customText = await p.text({
          message: 'Enter your refined idea description:',
          placeholder: 'A platform that...',
          initialValue: originalIdea,
          validate: (value) => {
            if (!value.trim()) return 'Please enter a description';
            if (value.length < 20) return 'Please provide more detail';
          },
        });

        const customEscAction = checkEscForBack(customText);
        if (customEscAction === 'hint') continue;
        if (customEscAction === 'back') break; // Go back to selection

        return { type: 'custom', text: String(customText) };
      }
      continue; // Back to selection
    }

    // Parse selection index
    const match = String(selection).match(/^idea_(\d+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (index >= 0 && index < refinedIdeas.length) {
        return { type: 'selected', idea: refinedIdeas[index] };
      }
    }

    continue; // Invalid selection, re-prompt
  }
}

/**
 * Prompt user to confirm or change the project folder location
 */
export async function promptProjectLocation(
  projectName: string,
  canGoBack = false,
): Promise<string | typeof GO_BACK_SECTION> {
  const defaultPath = path.join(process.cwd(), projectName);

  while (true) {
    p.log.info(`Project will be created at: ${color.cyan(defaultPath)}`);

    const useDefault = await p.confirm({
      message: 'Create project here?',
      initialValue: true,
    });

    const escAction = checkEscForBack(useDefault);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    if (useDefault) {
      return defaultPath;
    }

    // Ask for custom path
    while (true) {
      const customPath = await p.text({
        message: 'Enter the folder path for your project:',
        placeholder: defaultPath,
        initialValue: defaultPath,
        validate: (value) => {
          if (!value.trim()) return 'Path is required';
          // Basic path validation
          if (value.includes('\0')) return 'Invalid path';
        },
      });

      const customEscAction = checkEscForBack(customPath);
      if (customEscAction === 'hint') continue;
      if (customEscAction === 'back') break; // Go back to confirm question

      // Resolve the path (handle relative paths)
      const resolvedPath = path.resolve(String(customPath));
      return resolvedPath;
    }
  }
}

export interface ProjectConfigAnswers {
  projectType: string;
  pricing: string;
  features: string[];
  customAnswers: Record<string, string | string[]>;
}

/**
 * Prompt user with AI-generated project configuration options
 */
export async function promptProjectConfig(
  analysis: ProjectAnalysis,
  canGoBack = false,
): Promise<ProjectConfigAnswers | typeof GO_BACK_SECTION> {
  const answers: ProjectConfigAnswers = {
    projectType: analysis.projectType,
    pricing: '',
    features: [],
    customAnswers: {},
  };

  let step = 0;
  const totalSteps = 2 + analysis.questions.length; // pricing + features + custom questions

  while (step < totalSteps) {
    // Step 0: Pricing
    if (step === 0) {
      p.log.info(`${color.dim('Project type:')} ${analysis.projectType}`);
      p.log.message('');

      const pricing = await p.select({
        message: 'How will you monetize this?',
        options: analysis.pricingOptions.map(opt => ({
          value: opt.value,
          label: opt.label,
          hint: opt.hint,
        })),
      });

      const escAction = checkEscForBack(pricing);
      if (escAction === 'hint') continue;
      if (escAction === 'back') {
        if (canGoBack) return GO_BACK_SECTION;
        continue;
      }

      answers.pricing = String(pricing);
      step++;

    // Step 1: Features
    } else if (step === 1) {
      // Show feature descriptions
      p.log.info(color.cyan('Suggested features for your project:'));
      analysis.suggestedFeatures.forEach(f => {
        p.log.message(`  ${color.bold(f.label)}: ${color.dim(f.description)}`);
      });
      p.log.message('');

      const features = await p.multiselect({
        message: 'Select features to include:',
        options: analysis.suggestedFeatures.map(f => ({
          value: f.id,
          label: f.label,
        })),
        required: false,
      });

      const escAction = checkEscForBack(features);
      if (escAction === 'hint') continue;
      if (escAction === 'back') { step--; continue; }

      answers.features = (features as string[]) || [];
      step++;

    // Steps 2+: Custom AI-generated questions
    } else {
      const questionIndex = step - 2;
      const question = analysis.questions[questionIndex];

      if (!question) {
        step++;
        continue;
      }

      if (question.multiSelect) {
        const result = await p.multiselect({
          message: question.question,
          options: question.options.map(opt => ({
            value: opt.value,
            label: opt.label,
          })),
          required: false,
        });

        const escAction = checkEscForBack(result);
        if (escAction === 'hint') continue;
        if (escAction === 'back') { step--; continue; }

        answers.customAnswers[question.id] = (result as string[]) || [];
      } else {
        const result = await p.select({
          message: question.question,
          options: question.options.map(opt => ({
            value: opt.value,
            label: opt.label,
          })),
        });

        const escAction = checkEscForBack(result);
        if (escAction === 'hint') continue;
        if (escAction === 'back') { step--; continue; }

        answers.customAnswers[question.id] = String(result);
      }

      step++;
    }
  }

  return answers;
}

/**
 * Result type for prompts with follow-up question option
 */
export type FollowUpPromptResult<T> =
  | { type: 'answer'; value: T }
  | { type: 'followUp'; question: string }
  | typeof GO_BACK_SECTION;

/**
 * Prompt with Yes/No/Ask something else... options
 * Allows users to ask follow-up questions before making a decision
 */
export async function promptWithFollowUp(
  message: string,
  canGoBack = false,
): Promise<FollowUpPromptResult<boolean>> {
  while (true) {
    const selection = await p.select({
      message,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'ask', label: 'Ask something else...', hint: 'Ask a follow-up question' },
      ],
    });

    const escAction = checkEscForBack(selection);
    if (escAction === 'hint') continue;
    if (escAction === 'back') {
      if (canGoBack) return GO_BACK_SECTION;
      continue;
    }

    if (selection === 'yes') {
      return { type: 'answer', value: true };
    }

    if (selection === 'no') {
      return { type: 'answer', value: false };
    }

    if (selection === 'ask') {
      // Get the follow-up question
      while (true) {
        const question = await p.text({
          message: 'What would you like to know?',
          placeholder: 'e.g., Which competitor has the best pricing?',
          validate: (value) => {
            if (!value.trim()) return 'Please enter a question';
          },
        });

        const questionEscAction = checkEscForBack(question);
        if (questionEscAction === 'hint') continue;
        if (questionEscAction === 'back') break; // Go back to Yes/No/Ask selection

        return { type: 'followUp', question: String(question) };
      }
      continue; // Back to main selection
    }

    continue; // Invalid selection, re-prompt
  }
}

/**
 * Display a follow-up answer and prompt for next action
 * Returns true if user wants to ask another question, false to continue
 */
export async function promptAfterFollowUp(): Promise<boolean | typeof GO_BACK_SECTION> {
  while (true) {
    const selection = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'continue', label: 'Continue', hint: 'Proceed to next step' },
        { value: 'ask', label: 'Ask another question' },
      ],
    });

    const escAction = checkEscForBack(selection);
    if (escAction === 'hint') continue;
    if (escAction === 'back') return GO_BACK_SECTION;

    return selection === 'ask';
  }
}
