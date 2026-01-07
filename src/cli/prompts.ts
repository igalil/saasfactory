import * as p from '@clack/prompts';
import color from 'picocolors';
import type { PricingType, SaasType, AnalyticsProvider } from '../core/context.js';

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
 * Prompt for project name only
 */
export async function promptName(initialValue?: string): Promise<string> {
  p.log.info(color.dim('Tip: Double-press ESC to go back, Ctrl-C to quit'));

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
    if (escAction === 'hint' || escAction === 'back') continue; // Re-ask (first step, can't go back)

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
