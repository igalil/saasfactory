import { Command } from 'commander';
import { ui } from './ui.js';
import {
  promptName,
  promptDescription,
  promptFeatures,
  promptBranding,
  promptConfirm,
  promptApiKeys,
  GO_BACK_SECTION,
  setupSignalHandlers,
} from './prompts.js';
import {
  createDefaultContext,
  mapSelectedFeatures,
} from '../core/context.js';
import {
  loadCredentials,
  saveCredentials,
  getConfigDir,
} from '../core/config.js';
import { claudeGenerate, isClaudeCodeAvailable } from '../ai/claude-cli.js';
import { conductMarketResearch } from '../ai/market-research.js';
import { displayResearchSummary, generateResearchReport } from '../ai/research-report.js';
import { generate } from '../core/generator.js';
import path from 'path';
import { checkDomainAvailability, suggestDomains } from '../integrations/domain.js';
import { setupGit } from '../integrations/git.js';
import { isGitHubConfigured, setupGitHubRepo, getGitHubUser } from '../integrations/github.js';
import { isVercelConfigured, setupVercelProject } from '../integrations/vercel.js';

const version = '0.1.0';

const program = new Command();

program
  .name('saasfactory')
  .description('Generate production-ready SaaS projects with AI')
  .version(version);

// Main interactive command
program
  .command('create [name]')
  .description('Create a new SaaS project')
  .option('-y, --yes', 'Skip confirmations')
  .option('--skip-ai', 'Skip AI content generation')
  .option('--skip-research', 'Skip market research')
  .option('--skip-git', 'Skip git initialization')
  .option('--skip-github', 'Skip GitHub repo creation')
  .option('--private', 'Make GitHub repo private')
  .action(async (name?: string, options?: {
    yes?: boolean;
    skipAi?: boolean;
    skipResearch?: boolean;
    skipGit?: boolean;
    skipGithub?: boolean;
    private?: boolean;
  }) => {
    // Setup Ctrl-C handler (must be before any prompts)
    setupSignalHandlers();

    ui.banner();

    // Check Claude Code availability
    const claudeAvailable = await isClaudeCodeAvailable();
    if (!claudeAvailable && !options?.skipAi) {
      ui.warn('Claude Code CLI not found. AI features will be limited.');
      ui.info('Install Claude Code: https://claude.ai/code');
      ui.log('');
    }

    // Granular state machine with back navigation at every step
    // States: name → description → research_confirm → research → features → branding → ai_content → summary → generate
    type WizardState = 'name' | 'description' | 'research_confirm' | 'research' | 'features' | 'branding' | 'ai_content' | 'summary' | 'generate';

    // Determine starting state based on CLI args
    let wizardState: WizardState = name ? 'description' : 'name';
    let aiContentGenerated = false;

    // Wizard data
    let projectName = name || '';
    let description = '';
    let context = createDefaultContext('temp', '');
    let featureAnswers: Awaited<ReturnType<typeof promptFeatures>> | null = null;
    let brandingAnswers: Awaited<ReturnType<typeof promptBranding>> | null = null;
    const showResearch = claudeAvailable && !options?.skipResearch;

    while (wizardState !== 'generate') {
      // ─────────────────────────────────────────────────────────────
      // STATE: name
      // ─────────────────────────────────────────────────────────────
      if (wizardState === 'name') {
        projectName = await promptName(projectName);
        wizardState = 'description';

      // ─────────────────────────────────────────────────────────────
      // STATE: description
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'description') {
        const result = await promptDescription(true, description || undefined);

        if (result === GO_BACK_SECTION) {
          wizardState = 'name';
          continue;
        }

        description = result;
        context = createDefaultContext(projectName, description);
        wizardState = showResearch ? 'research_confirm' : 'features';

      // ─────────────────────────────────────────────────────────────
      // STATE: research_confirm
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'research_confirm') {
        ui.heading('Market Research');
        ui.info('AI can analyze the market, find competitors, and validate your idea.');
        ui.info('This takes several minutes but helps you understand the competitive landscape.');
        ui.log('');

        const runResearch = await promptConfirm('Run market research?', true);

        if (runResearch === GO_BACK_SECTION) {
          wizardState = 'description';
          continue;
        }

        wizardState = runResearch ? 'research' : 'features';

      // ─────────────────────────────────────────────────────────────
      // STATE: research
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'research') {
        ui.log('');
        let researchSpinner = ui.spinner('Starting research...');
        let searchCount = 0;
        let lastLoggedSourceCount = 0;
        const sourcesFound: string[] = [];

        const result = await conductMarketResearch(
          description,
          'b2b',
          (event) => {
            if (event.type === 'search') {
              searchCount = event.count ?? searchCount + 1;
              const query = event.query
                ? `"${event.query.length > 40 ? event.query.slice(0, 40) + '...' : event.query}"`
                : `#${searchCount}`;
              researchSpinner.text = `Searching: ${query}`;
            } else if (event.type === 'sources' && event.sources) {
              for (const src of event.sources) {
                if (!sourcesFound.includes(src)) sourcesFound.push(src);
              }
              const newSourceCount = sourcesFound.length - lastLoggedSourceCount;
              if (newSourceCount >= 3) {
                const recentSources = sourcesFound.slice(lastLoggedSourceCount, lastLoggedSourceCount + 3);
                researchSpinner.stopAndPersist({ symbol: '  +', text: `Sources: ${recentSources.join(', ')}` });
                lastLoggedSourceCount = sourcesFound.length;
                researchSpinner = ui.spinner(`${sourcesFound.length} sources found...`);
              } else {
                researchSpinner.text = `${sourcesFound.length} sources found...`;
              }
            } else if (event.type === 'status') {
              const elapsed = event.message.match(/\d+[ms]?\s*elapsed/)?.[0] || '';
              if (searchCount > 0 || sourcesFound.length > 0) {
                researchSpinner.text = `${searchCount} searches, ${sourcesFound.length} sources (${elapsed})`;
              } else {
                researchSpinner.text = event.message;
              }
            }
          },
        );

        if (result) {
          if (result.isFallback) {
            researchSpinner.warn(`Market research incomplete: ${result.error}`);
            ui.log('');
            ui.info('Using placeholder data. You can research competitors manually.');
          } else {
            researchSpinner.succeed(`Market research complete (${searchCount} searches, ${result.research.competitors.length} competitors found)`);
          }
          ui.log('');
          displayResearchSummary(result.research);
          const reportPath = path.join(process.cwd(), `${projectName}-market-research.md`);
          await generateResearchReport(result.research, reportPath, context.displayName);
          ui.success(`Full report saved: ${reportPath}`);
          ui.log('');
          context.marketResearch = result.research;

          if (!result.isFallback) {
            if (result.research.marketValidation.verdict === 'saturated') {
              ui.warn('Market appears saturated. Consider finding a unique angle.');
            } else if (result.research.marketValidation.verdict === 'weak') {
              ui.warn('Market opportunity appears weak. Consider validating demand first.');
            }
          }

          if (!options?.yes) {
            const proceed = await promptConfirm('Continue with project setup?', true);
            if (proceed === GO_BACK_SECTION) {
              wizardState = 'research_confirm';
              continue;
            }
            if (!proceed) {
              ui.log('');
              ui.info('Project generation cancelled. Review the market research report.');
              return;
            }
          }
        } else {
          researchSpinner.warn('Market research unavailable (Claude Code not found)');
        }
        wizardState = 'features';

      // ─────────────────────────────────────────────────────────────
      // STATE: features
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'features') {
        ui.heading('Features');
        const result = await promptFeatures(true);

        if (result === GO_BACK_SECTION) {
          // Go back to research_confirm if research is enabled, otherwise description
          wizardState = showResearch ? 'research_confirm' : 'description';
          continue;
        }

        featureAnswers = result;
        wizardState = 'branding';

      // ─────────────────────────────────────────────────────────────
      // STATE: branding
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'branding') {
        ui.heading('Branding');
        const result = await promptBranding(true);

        if (result === GO_BACK_SECTION) {
          wizardState = 'features';
          continue;
        }

        brandingAnswers = result;

        // Update context with features and branding before AI content generation
        if (featureAnswers && featureAnswers !== GO_BACK_SECTION) {
          context.saasType = featureAnswers.saasType;
          context.pricing.type = featureAnswers.pricingType;
          Object.assign(
            context.features,
            mapSelectedFeatures(featureAnswers.features, featureAnswers.analytics),
          );
        }
        if (brandingAnswers && brandingAnswers !== GO_BACK_SECTION) {
          context.domain = brandingAnswers.domain;
          if (brandingAnswers.tagline) {
            context.content.tagline = brandingAnswers.tagline;
          }
        }

        wizardState = 'ai_content';

      // ─────────────────────────────────────────────────────────────
      // STATE: ai_content (auto - no user input)
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'ai_content') {
        // AI Content Generation (only run once unless user goes back)
        if (!aiContentGenerated && claudeAvailable && !options?.skipAi) {
          ui.heading('AI Content Generation');
          const spinner = ui.spinner('Generating marketing content with Claude...');

          // Build competitor context if research was done
          let competitorContext = '';
          if (context.marketResearch?.competitors.length) {
            const competitors = context.marketResearch.competitors;
            competitorContext = `
Competitor Analysis (use to differentiate):
${competitors.map(c => `- ${c.name}: ${c.description}${c.weaknesses.length ? ` (weaknesses: ${c.weaknesses.join(', ')})` : ''}`).join('\n')}

Market Opportunities to highlight:
${context.marketResearch.opportunities.map(o => `- ${o}`).join('\n')}
`;
          }

          try {
            const aiContent = await claudeGenerate(
              `Generate marketing content for a ${context.saasType} SaaS called "${context.displayName}".

Description: ${context.description}
Pricing model: ${context.pricing.type}
${competitorContext}
Generate JSON with:
- tagline: Short catchy tagline (max 10 words)${competitorContext ? ' that differentiates from competitors' : ''}
- heroHeadline: Main headline for landing page
- heroSubheadline: Supporting text (1-2 sentences)
- features: Array of 4 features with title and description${competitorContext ? ' (address competitor weaknesses)' : ''}
- metaDescription: SEO meta description (max 160 chars)
- seoKeywords: Array of 5-7 SEO keywords`,
              { outputFormat: 'json' },
            );

            // Parse and merge AI content
            try {
              const parsed = JSON.parse(aiContent);
              Object.assign(context.content, parsed);
              spinner.succeed('Marketing content generated');
              aiContentGenerated = true;
            } catch {
              spinner.warn('Could not parse AI response, using defaults');
            }
          } catch (error) {
            spinner.fail('AI generation failed');
            ui.log(String(error));
          }
        }

        wizardState = 'summary';

      // ─────────────────────────────────────────────────────────────
      // STATE: summary
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'summary') {
        ui.heading('Project Summary');
        ui.keyValue('Name', context.displayName);
        ui.keyValue('Type', context.saasType.toUpperCase());
        ui.keyValue('Pricing', context.pricing.type);
        ui.keyValue('Domain', context.domain ?? 'Not set');
        ui.log('');

        ui.subheading('Enabled features:');
        const enabledFeatures = Object.entries(context.features)
          .filter(([, enabled]) => enabled === true || enabled !== 'none')
          .map(([feature]) => feature);
        ui.list(enabledFeatures);

        if (!options?.yes) {
          ui.log('');
          const confirmed = await promptConfirm('Generate this project?', true);

          if (confirmed === GO_BACK_SECTION) {
            // Go back to branding - mark AI as needing regeneration
            aiContentGenerated = false;
            wizardState = 'branding';
            continue;
          }

          if (!confirmed) {
            ui.log('');
            ui.info('Project generation cancelled.');
            return;
          }
        }

        wizardState = 'generate';
      }
    }

    // Generate project
    ui.heading('Generating Project');
    const result = await generate(context);

    if (!result.success) {
      ui.error('Project generation failed');
      result.errors.forEach(err => ui.log(`  ${err}`));
      return;
    }

    // Git initialization
    if (!options?.skipGit) {
      ui.heading('Git Setup');
      const gitSpinner = ui.spinner('Initializing git repository...');

      const gitResult = await setupGit(result.projectPath, context.name);
      if (gitResult.success) {
        gitSpinner.succeed('Git repository initialized');
      } else {
        gitSpinner.warn(`Git init failed: ${gitResult.error}`);
      }

      // GitHub setup
      if (!options?.skipGithub && gitResult.success) {
        const githubConfigured = await isGitHubConfigured();

        if (githubConfigured) {
          const createRepo = options?.yes || await promptConfirm('Create GitHub repository?');

          if (createRepo) {
            const ghSpinner = ui.spinner('Creating GitHub repository...');

            const ghOptions: { private?: boolean } = {};
            if (options?.private !== undefined) {
              ghOptions.private = options.private;
            }

            const ghResult = await setupGitHubRepo(
              context.name,
              context.description,
              ghOptions
            );

            if (ghResult.success && ghResult.cloneUrl) {
              ghSpinner.succeed(`GitHub repo created: ${ghResult.repoUrl}`);

              // Add remote and push
              const { addRemoteOrigin, pushToRemote } = await import('../integrations/git.js');
              await addRemoteOrigin(result.projectPath, ghResult.cloneUrl);

              const pushSpinner = ui.spinner('Pushing to GitHub...');
              try {
                await pushToRemote(result.projectPath);
                pushSpinner.succeed('Code pushed to GitHub');
              } catch (error) {
                pushSpinner.warn('Push failed - you can push manually later');
              }
            } else {
              ghSpinner.warn(`GitHub repo creation failed: ${ghResult.error}`);
            }
          }
        } else {
          ui.info('GitHub token not configured. Run `saasfactory config` to set up.');
        }
      }
    }

    // Success message
    ui.heading('Success!');
    ui.success(`Project "${context.displayName}" created successfully!`);

    ui.nextSteps(context.name, [
      `cd ${context.name}`,
      'Copy .env.example to .env.local and fill in your API keys',
      'npm install',
      'npx convex dev  # Initialize Convex',
      'npm run dev',
    ]);
  });

// Config command
program
  .command('config')
  .description('Configure SaasFactory settings and credentials')
  .action(async () => {
    setupSignalHandlers();
    ui.banner();
    ui.heading('Configuration');

    ui.keyValue('Config directory', getConfigDir());
    ui.log('');

    const credentials = await loadCredentials();
    const hasGithub = !!credentials.githubToken;
    const hasVercel = !!credentials.vercelToken;
    const hasGoogle = !!credentials.googleApiKey;

    ui.subheading('Saved credentials:');
    ui.keyValue('GitHub Token', hasGithub ? '********' : 'Not set');
    ui.keyValue('Vercel Token', hasVercel ? '********' : 'Not set');
    ui.keyValue('Google API Key', hasGoogle ? '********' : 'Not set');
    ui.log('');

    const updateCreds = await promptConfirm('Update credentials?');
    if (updateCreds) {
      const newCreds = await promptApiKeys();

      // Only update non-empty values
      const updatedCreds = { ...credentials };
      if (newCreds['githubToken']) updatedCreds.githubToken = newCreds['githubToken'];
      if (newCreds['vercelToken']) updatedCreds.vercelToken = newCreds['vercelToken'];
      if (newCreds['openaiApiKey']) updatedCreds.googleApiKey = newCreds['openaiApiKey'];

      await saveCredentials(updatedCreds);
      ui.success('Credentials saved securely');
    }
  });

// Domain check command
program
  .command('domain <name>')
  .description('Check domain availability and get suggestions')
  .option('-s, --suggest', 'Show domain suggestions')
  .action(async (name: string, options?: { suggest?: boolean }) => {
    ui.banner();
    ui.heading('Domain Check');

    // Ensure domain has TLD
    const domain = name.includes('.') ? name : `${name}.com`;

    const spinner = ui.spinner(`Checking ${domain} availability...`);

    try {
      const result = await checkDomainAvailability(domain);
      spinner.stop();

      ui.log('');
      ui.keyValue('Domain', result.domain);
      ui.keyValue('Available', result.available ? 'Yes' : 'No');

      if (result.premium) {
        ui.keyValue('Premium', 'Yes (higher price)');
      }

      if (result.price) {
        ui.keyValue('Registration', `$${result.price.registration} ${result.price.currency}`);
        ui.keyValue('Renewal', `$${result.price.renewal}/year`);
      }

      // Show suggestions if requested or if domain is taken
      if (options?.suggest || !result.available) {
        ui.log('');
        ui.heading('Suggestions');

        const suggestSpinner = ui.spinner('Finding available alternatives...');
        const baseName = name.replace(/\.[^.]+$/, '');
        const suggestions = await suggestDomains(baseName, '');
        suggestSpinner.stop();

        const available = suggestions.filter(s => s.available).slice(0, 6);
        if (available.length > 0) {
          ui.subheading('Available domains:');
          available.forEach(s => {
            ui.success(s.domain);
          });
        } else {
          ui.info('No available alternatives found.');
        }
      }
    } catch (error) {
      spinner.fail('Domain check failed');
      ui.log(String(error));
    }
  });

// Deploy command
program
  .command('deploy [directory]')
  .description('Deploy project to Vercel')
  .option('--prod', 'Deploy to production')
  .action(async (directory?: string, options?: { prod?: boolean }) => {
    ui.banner();
    ui.heading('Deploy to Vercel');

    const projectPath = directory || process.cwd();

    // Check Vercel configuration
    const vercelConfigured = await isVercelConfigured();
    if (!vercelConfigured) {
      ui.error('Vercel token not configured.');
      ui.info('Run `saasfactory config` to set up your Vercel token.');
      return;
    }

    // Read project config
    const fs = await import('fs-extra');
    const path = await import('path');
    const configPath = path.join(projectPath, 'saasfactory.json');

    if (!(await fs.pathExists(configPath))) {
      ui.error('Not a SaasFactory project (saasfactory.json not found)');
      return;
    }

    const projectConfig = await fs.readJson(configPath);
    const projectName = projectConfig.context?.name || path.basename(projectPath);

    // Check GitHub configuration
    const githubConfigured = await isGitHubConfigured();
    let githubRepo: string | undefined;

    if (githubConfigured) {
      const user = await getGitHubUser();
      if (user) {
        githubRepo = `${user.login}/${projectName}`;
      }
    }

    // Create Vercel project
    const spinner = ui.spinner('Setting up Vercel project...');

    const vercelOptions: { githubRepo?: string } = {};
    if (githubRepo) {
      vercelOptions.githubRepo = githubRepo;
    }

    const result = await setupVercelProject(projectName, vercelOptions);

    if (!result.success) {
      spinner.fail(`Vercel setup failed: ${result.error}`);
      return;
    }

    spinner.succeed('Vercel project created');

    if (result.projectUrl) {
      ui.log('');
      ui.success(`Project URL: ${result.projectUrl}`);
      ui.log('');
      ui.info('Push to GitHub to trigger automatic deployments.');
    }
  });

// Default command (interactive)
program
  .action(async () => {
    // Run create command by default
    await program.commands.find(cmd => cmd.name() === 'create')?.parseAsync([]);
  });

export function runCLI(): void {
  program.parse();
}
