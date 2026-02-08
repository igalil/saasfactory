import { Command } from 'commander';
import { ui } from './ui.js';
import {
  promptName,
  promptDescription,
  promptBranding,
  promptConfirm,
  promptApiKeys,
  promptIdeaMode,
  promptSectorFocus,
  promptRoughIdea,
  promptIdeaSelection,
  promptIdeaConfirmation,
  promptIdeaRefinement,
  promptProjectLocation,
  promptProjectConfig,
  promptWithFollowUp,
  promptAfterFollowUp,
  GO_BACK_SECTION,
  setupSignalHandlers,
  type IdeaMode,
  type ProjectConfigAnswers,
} from './prompts.js';
import { createDefaultContext } from '../core/context.js';
import {
  loadCredentials,
  saveCredentials,
  getConfigDir,
} from '../core/config.js';
import { claudeGenerate, isClaudeCodeAvailable, claudeFollowUp } from '../ai/claude-cli.js';
import { conductResearch, getModeConfig, type ResearchMode } from '../ai/research.js';
import { displayResearchSummary, generateResearchReport } from '../ai/research-report.js';
import { discoverSaasIdeas, type DiscoveryProgressEvent } from '../ai/idea-discovery.js';
import { displayIdeasList, displayIdeaDetails } from '../ai/idea-report.js';
import { refineIdea, suggestProjectNames } from '../ai/idea-refiner.js';
import { analyzeProject, type ProjectAnalysis } from '../ai/project-analyzer.js';
import type { SaasIdea } from '../core/context.js';
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
    // States: idea_mode → [discovery flow | has_idea flow] → name → project_config → branding → ai_content → summary → project_location → generate
    type WizardState =
      | 'idea_mode'
      | 'discovery_sector'
      | 'discovery_rough_idea'
      | 'discovery_research'
      | 'discovery_results'
      | 'discovery_select'
      | 'discovery_confirm'
      | 'name'
      | 'description'
      | 'idea_refinement'
      | 'name_research'  // Search competitors + suggest names (after user picks description)
      | 'project_config' // AI-driven project configuration (replaces features)
      | 'branding'
      | 'ai_content'
      | 'summary'
      | 'project_location'
      | 'generate';

    // Determine starting state based on CLI args and Claude availability
    // If name is provided, skip to description; otherwise start with idea_mode (if Claude available)
    let wizardState: WizardState = name ? 'description' : (claudeAvailable ? 'idea_mode' : 'name');
    let aiContentGenerated = false;

    // Wizard data
    let projectName = name || '';
    let description = '';
    let context = createDefaultContext('temp', '');
    let brandingAnswers: Awaited<ReturnType<typeof promptBranding>> | null = null;
    const showResearch = claudeAvailable && !options?.skipResearch;

    // Discovery data
    let ideaMode: IdeaMode = 'has_idea';
    let discoverySector: string | null = null;
    let roughIdea: string | null = null;
    let discoveredIdeas: SaasIdea[] = [];
    let selectedIdea: SaasIdea | null = null;

    // Project location
    let projectPath: string | null = null;

    // Refinement data (from idea refinement with competitor search)
    let suggestedNames: string[] = [];
    let foundCompetitors: { name: string; description: string }[] = [];

    // Project analysis (AI-driven configuration)
    let projectAnalysis: ProjectAnalysis | null = null;
    let projectConfig: ProjectConfigAnswers | null = null;

    while (wizardState !== 'generate') {
      // ─────────────────────────────────────────────────────────────
      // STATE: idea_mode - Ask if user has an idea
      // ─────────────────────────────────────────────────────────────
      if (wizardState === 'idea_mode') {
        ui.heading('SaaS Idea');
        ui.info('Let\'s start by understanding your idea.');
        ui.log('');

        const mode = await promptIdeaMode();

        if (mode === GO_BACK_SECTION) {
          // Can't go back from first state
          continue;
        }

        ideaMode = mode;

        if (ideaMode === 'has_idea') {
          wizardState = 'description'; // Description first, then refinement, then name
        } else if (ideaMode === 'discover') {
          wizardState = 'discovery_sector';
        } else if (ideaMode === 'validate') {
          wizardState = 'discovery_rough_idea';
        }

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_rough_idea - Get rough idea to validate
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_rough_idea') {
        const result = await promptRoughIdea(true);

        if (result === GO_BACK_SECTION) {
          wizardState = 'idea_mode';
          continue;
        }

        roughIdea = result;
        wizardState = 'discovery_sector';

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_sector - Optional sector focus
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_sector') {
        const result = await promptSectorFocus(true);

        if (result === GO_BACK_SECTION) {
          if (ideaMode === 'validate') {
            wizardState = 'discovery_rough_idea';
          } else {
            wizardState = 'idea_mode';
          }
          continue;
        }

        discoverySector = result;
        wizardState = 'discovery_research';

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_research - AI research phase
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_research') {
        ui.heading('Idea Discovery');
        if (roughIdea) {
          ui.info(`Researching and refining your idea: "${roughIdea.slice(0, 50)}${roughIdea.length > 50 ? '...' : ''}"`);
        } else {
          ui.info('Searching for viable micro-SaaS opportunities...');
        }
        if (discoverySector) {
          ui.info(`Focusing on: ${discoverySector}`);
        }
        ui.log('');
        ui.info('This takes 5-8 minutes for thorough research.');
        ui.log('');

        let researchSpinner = ui.spinner('Starting idea discovery...');
        let searchCount = 0;
        let sourcesCount = 0;

        const result = await discoverSaasIdeas({
          sector: discoverySector || undefined,
          roughIdea: roughIdea || undefined,
          count: 5,
          onProgress: (event: DiscoveryProgressEvent) => {
            if (event.type === 'search') {
              searchCount = event.searchCount ?? searchCount + 1;
              const query = event.query
                ? `"${event.query.length > 40 ? event.query.slice(0, 40) + '...' : event.query}"`
                : `#${searchCount}`;
              researchSpinner.text = `Searching: ${query}`;
            } else if (event.type === 'sources' && event.sources) {
              sourcesCount = event.totalSources ?? sourcesCount + event.sources.length;
              researchSpinner.text = `Found ${sourcesCount} sources...`;
            } else if (event.type === 'status') {
              researchSpinner.text = event.message;
            } else if (event.type === 'phase') {
              const phaseMessages: Record<string, string> = {
                gaps: 'Finding market gaps...',
                competitors: 'Analyzing competitors...',
                ideas: 'Synthesizing ideas...',
                difficulty: 'Assessing implementation difficulty...',
                marketing: 'Researching marketing channels...',
              };
              researchSpinner.text = phaseMessages[event.phase || ''] || event.message;
            }
          },
        });

        if (result.isFallback) {
          researchSpinner.warn(`Discovery incomplete: ${result.error}`);
          ui.log('');
          ui.info('Using example ideas. You can research opportunities manually.');
        } else {
          researchSpinner.succeed(`Discovery complete! Found ${result.ideas.length} ideas (${searchCount} searches, ${sourcesCount} sources)`);
        }

        discoveredIdeas = result.ideas;
        wizardState = 'discovery_results';

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_results - Display discovered ideas
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_results') {
        displayIdeasList(discoveredIdeas);
        wizardState = 'discovery_select';

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_select - User selects an idea
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_select') {
        const selection = await promptIdeaSelection(discoveredIdeas, true);

        if (selection === GO_BACK_SECTION) {
          wizardState = 'discovery_sector';
          continue;
        }

        if (selection === 'more') {
          // Run discovery again
          wizardState = 'discovery_research';
          continue;
        }

        if (selection === 'sector') {
          // Let user pick a different sector
          wizardState = 'discovery_sector';
          continue;
        }

        selectedIdea = selection;
        wizardState = 'discovery_confirm';

      // ─────────────────────────────────────────────────────────────
      // STATE: discovery_confirm - Confirm selected idea
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'discovery_confirm') {
        if (selectedIdea) {
          displayIdeaDetails(selectedIdea);

          const confirmed = await promptIdeaConfirmation(selectedIdea, true);

          if (confirmed === GO_BACK_SECTION) {
            wizardState = 'discovery_results';
            continue;
          }

          if (!confirmed) {
            wizardState = 'discovery_select';
            continue;
          }

          // Pre-fill project data from selected idea
          projectName = selectedIdea.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          description = selectedIdea.description;
          context = createDefaultContext(projectName, description);
          context.discoveredIdea = selectedIdea;

          // Set SaaS type based on target audience (best guess)
          const audienceLower = selectedIdea.targetAudience.join(' ').toLowerCase();
          if (audienceLower.includes('business') || audienceLower.includes('team') || audienceLower.includes('enterprise')) {
            context.saasType = 'b2b';
          } else if (audienceLower.includes('developer') || audienceLower.includes('maker')) {
            context.saasType = 'tool';
          }

          // Set pricing type based on income model
          if (selectedIdea.income.model === 'subscription') {
            context.pricing.type = 'subscription';
          } else if (selectedIdea.income.model === 'freemium') {
            context.pricing.type = 'freemium';
          } else if (selectedIdea.income.model === 'one-time') {
            context.pricing.type = 'one-time';
          }

          ui.success(`Selected: ${selectedIdea.name}`);
          ui.log('');

          // Let user confirm or change the project name
          wizardState = 'name';
        } else {
          wizardState = 'discovery_select';
        }

      // ─────────────────────────────────────────────────────────────
      // STATE: name - Now comes after description and refinement
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'name') {
        ui.heading('Project Name');

        // Show competitors if found during refinement
        if (foundCompetitors.length > 0) {
          ui.subheading('Competitors found:');
          foundCompetitors.slice(0, 5).forEach(c => {
            ui.log(`  ${c.name}: ${c.description}`);
          });
          ui.log('');
        }

        const result = await promptName(
          suggestedNames.length > 0 ? suggestedNames : undefined,
          true, // Can go back to refinement
          projectName || undefined,
        );

        if (result === GO_BACK_SECTION) {
          if (ideaMode === 'discover' || ideaMode === 'validate') {
            // Go back to idea selection in discovery flow
            wizardState = 'discovery_results';
          } else {
            // Go back to refinement in has_idea flow
            wizardState = 'idea_refinement';
            suggestedNames = [];
            foundCompetitors = [];
          }
          continue;
        }

        projectName = result;
        context = createDefaultContext(projectName, description);

        // Restore discovery data if coming from discovery flow
        if (selectedIdea) {
          context.discoveredIdea = selectedIdea;

          // Restore saasType derived from target audience
          const audienceLower = selectedIdea.targetAudience.join(' ').toLowerCase();
          if (audienceLower.includes('business') || audienceLower.includes('team') || audienceLower.includes('enterprise')) {
            context.saasType = 'b2b';
          } else if (audienceLower.includes('developer') || audienceLower.includes('maker')) {
            context.saasType = 'tool';
          }

          // Restore pricing from income model
          if (selectedIdea.income.model === 'subscription') {
            context.pricing.type = 'subscription';
          } else if (selectedIdea.income.model === 'freemium') {
            context.pricing.type = 'freemium';
          } else if (selectedIdea.income.model === 'one-time') {
            context.pricing.type = 'one-time';
          }
        }

        // Go to AI-driven project configuration
        wizardState = 'project_config';

      // ─────────────────────────────────────────────────────────────
      // STATE: description - Now comes before name
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'description') {
        ui.heading('Your Idea');

        const result = await promptDescription(true, description || undefined);

        if (result === GO_BACK_SECTION) {
          wizardState = 'idea_mode';
          continue;
        }

        description = result;
        // Go to idea refinement if Claude is available, otherwise go to name
        wizardState = claudeAvailable ? 'idea_refinement' : 'name';

      // ─────────────────────────────────────────────────────────────
      // STATE: idea_refinement - Quick refinement (no web search)
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'idea_refinement') {
        ui.heading('Idea Refinement');

        const spinner = ui.spinner('Analyzing your idea...');

        const result = await refineIdea(description);

        if (!result.success) {
          spinner.warn('Could not refine idea - continuing with original');
          wizardState = claudeAvailable ? 'name_research' : 'name';
          continue;
        }

        spinner.succeed('Generated refined versions');
        ui.log('');

        const selection = await promptIdeaRefinement(
          result.versions,
          description,
          result.clarifyingQuestions,
          true,
        );

        if (selection === GO_BACK_SECTION) {
          wizardState = 'description';
          continue;
        }

        // Update description based on selection
        if (selection.type === 'selected') {
          description = selection.idea.summary;
          ui.success(`Selected version ${result.versions.indexOf(selection.idea) + 1}`);
        } else if (selection.type === 'custom') {
          description = selection.text;
          ui.success('Using your custom version.');
        } else {
          ui.info('Using original description.');
        }

        ui.log('');
        // Go to name research (competitor search + name suggestions)
        wizardState = claudeAvailable ? 'name_research' : 'name';

      // ─────────────────────────────────────────────────────────────
      // STATE: name_research - Search competitors and suggest names
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'name_research') {
        ui.heading('Finding Competitors & Suggesting Names');
        ui.info('Searching for similar products and generating name ideas...');
        ui.log('');

        const spinner = ui.spinner('Researching market...');

        const result = await suggestProjectNames(description);

        if (!result.success) {
          spinner.warn('Could not search competitors - continuing without suggestions');
          suggestedNames = [];
          foundCompetitors = [];
        } else {
          foundCompetitors = result.competitors || [];
          suggestedNames = result.suggestedNames || [];

          const competitorCount = foundCompetitors.length;
          const nameCount = suggestedNames.length;
          spinner.succeed(`Found ${competitorCount} competitors, generated ${nameCount} name suggestions`);
        }

        ui.log('');
        wizardState = 'name';

      // ─────────────────────────────────────────────────────────────
      // STATE: project_config - AI-driven project configuration
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'project_config') {
        ui.heading('Project Configuration');

        // Analyze the project if not already done
        if (!projectAnalysis) {
          ui.info('Analyzing your project to suggest relevant options...');
          ui.log('');

          const spinner = ui.spinner('Generating configuration options...');
          projectAnalysis = await analyzeProject(description);

          if (!projectAnalysis.success) {
            spinner.warn('Could not analyze project - using defaults');
          } else {
            spinner.succeed(`Detected: ${projectAnalysis.projectType}`);
          }
          ui.log('');
        }

        const result = await promptProjectConfig(projectAnalysis!, true);

        if (result === GO_BACK_SECTION) {
          wizardState = 'name';
          continue;
        }

        projectConfig = result;

        // Update context with project config
        context.pricing.type = result.pricing as any;

        wizardState = 'branding';

      // ─────────────────────────────────────────────────────────────
      // STATE: branding
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'branding') {
        ui.heading('Branding');
        const result = await promptBranding(true);

        if (result === GO_BACK_SECTION) {
          wizardState = 'project_config';
          continue;
        }

        brandingAnswers = result;

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
        ui.keyValue('Type', projectConfig?.projectType || 'Web Application');
        ui.keyValue('Pricing', context.pricing.type);
        ui.keyValue('Domain', context.domain ?? 'Not set');
        ui.log('');

        if (projectConfig?.features && projectConfig.features.length > 0) {
          ui.subheading('Selected features:');
          ui.list(projectConfig.features);
        }

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

        wizardState = 'project_location';

      // ─────────────────────────────────────────────────────────────
      // STATE: project_location - Ask where to create the project folder
      // ─────────────────────────────────────────────────────────────
      } else if (wizardState === 'project_location') {
        ui.heading('Project Location');

        // If --yes flag is set, use default path
        if (options?.yes) {
          projectPath = path.join(process.cwd(), projectName);
          ui.info(`Creating project at: ${projectPath}`);
          wizardState = 'generate';
          continue;
        }

        const result = await promptProjectLocation(projectName, true);

        if (result === GO_BACK_SECTION) {
          wizardState = 'summary';
          continue;
        }

        projectPath = result;
        wizardState = 'generate';
      }
    }

    // Generate project
    ui.heading('Generating Project');
    const result = await generate(context, projectPath || undefined);

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
      if (newCreds['googleApiKey']) updatedCreds.googleApiKey = newCreds['googleApiKey'];

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

// Compete command - research competition
program
  .command('compete <input>')
  .description('Research competitors for a SaaS idea or analyze a competitor URL')
  .option('-q, --quick', 'Quick mode: find 3-5 competitors faster')
  .option('-f, --full', 'Full mode: thorough analysis of 5-8 competitors')
  .action(async (input: string, options?: { quick?: boolean; full?: boolean }) => {
    setupSignalHandlers();
    ui.banner();

    // Check Claude Code availability
    const claudeAvailable = await isClaudeCodeAvailable();
    if (!claudeAvailable) {
      ui.error('Claude Code CLI not found. This feature requires Claude Code.');
      ui.info('Install Claude Code: https://claude.ai/code');
      return;
    }

    // Detect input type
    const isUrl = input.startsWith('http://') || input.startsWith('https://');

    // Determine research mode
    let researchMode: ResearchMode;
    if (isUrl) {
      researchMode = 'url'; // URL mode auto-detected
    } else if (options?.quick) {
      researchMode = 'quick';
    } else if (options?.full) {
      researchMode = 'full';
    } else {
      // Ask user to select mode
      const { select } = await import('@clack/prompts');
      const modeSelection = await select({
        message: 'Choose research depth:',
        options: [
          {
            value: 'quick' as ResearchMode,
            label: 'Quick (Recommended)',
            hint: '3-5 competitors, ~3 minutes, fewer tokens',
          },
          {
            value: 'full' as ResearchMode,
            label: 'Full',
            hint: '5-8 competitors, ~10 minutes, thorough analysis',
          },
        ],
      });

      if (typeof modeSelection !== 'string') {
        return; // User cancelled
      }
      researchMode = modeSelection as ResearchMode;
    }

    const modeConfig = getModeConfig(researchMode);

    ui.heading('Competitive Research');
    if (isUrl) {
      ui.info(`Analyzing: ${input}`);
      ui.info('Will fetch the website, understand the product, and find competitors.');
    } else {
      ui.info(`Researching: "${input}"`);
      ui.info(`Mode: ${modeConfig.description} (${modeConfig.competitors} competitors)`);
    }
    ui.log('');

    // Rich feedback during research
    let spinner = ui.spinner(isUrl ? 'Phase 1/3: Analyzing website...' : 'Phase 1/3: Searching for competitors...');
    let searchCount = 0;
    let sourcesCount = 0;
    const foundSources: string[] = [];
    let currentPhase = 1;

    const result = await conductResearch(input, {
      mode: researchMode,
      onProgress: (event) => {
        if (event.type === 'analyzing') {
          // Phase 1 for URLs: Fetching website
          if (currentPhase === 1) {
            spinner.text = 'Phase 1/3: Analyzing website...';
          }
        } else if (event.type === 'search') {
          // Phase 2: Searching
          if (currentPhase < 2) {
            currentPhase = 2;
            spinner.succeed('Phase 1/3: Website analyzed');
            spinner = ui.spinner('Phase 2/3: Searching for competitors...');
          }

          searchCount = event.count ?? searchCount + 1;
          if (event.query) {
            // Log search query
            spinner.stop();
            ui.log(`  ${ui.colors.dim('Search:')} ${event.query.length > 60 ? event.query.slice(0, 60) + '...' : event.query}`);
            spinner = ui.spinner(`Phase 2/3: Searching... (${searchCount} searches)`);
          } else {
            spinner.text = `Phase 2/3: Searching... (${searchCount} searches)`;
          }
        } else if (event.type === 'sources' && event.sources) {
          // Show new sources found
          const newSources = event.sources.filter(s => !foundSources.includes(s));
          if (newSources.length > 0) {
            foundSources.push(...newSources);
            sourcesCount = foundSources.length;
            spinner.stop();
            ui.log(`  ${ui.colors.dim('Found:')} ${newSources.slice(0, 3).join(', ')}${newSources.length > 3 ? ` +${newSources.length - 3} more` : ''}`);
            spinner = ui.spinner(`Phase 2/3: Searching... (${sourcesCount} sources)`);
          }
        } else if (event.type === 'status') {
          // Phase 3: Analyzing results
          if (event.message?.toLowerCase().includes('analy')) {
            if (currentPhase < 3) {
              currentPhase = 3;
              spinner.succeed(`Phase 2/3: Found ${sourcesCount} sources from ${searchCount} searches`);
              spinner = ui.spinner('Phase 3/3: Analyzing competitors...');
            }
          } else {
            spinner.text = event.message;
          }
        }
      },
    });

    if (!result) {
      spinner.fail('Competitive research failed - Claude Code unavailable');
      return;
    }

    if (result.isFallback) {
      spinner.warn(`Research incomplete: ${result.error}`);
      ui.log('');
      ui.info('Using placeholder data. You can research competitors manually.');
    } else {
      spinner.succeed(`Research complete! (${searchCount} searches, ${result.research.competitors.length} competitors found)`);
    }

    ui.log('');
    displayResearchSummary(result.research);

    // Follow-up question loop
    const sessionId = result.sessionId;
    let pendingQuestion: string | null = null;

    // Single loop: ask follow-ups, then offer to save
    while (true) {
      // If we have a pending question (from "Ask something else..." or "Ask another question"), process it
      if (pendingQuestion && sessionId) {
        let spinner = ui.spinner('Researching...');
        try {
          const answer = await claudeFollowUp(sessionId, pendingQuestion, {
            allowedTools: ['WebSearch', 'WebFetch'],
            timeout: 120000,
            onProgress: (event) => {
              if (event.tool === 'WebSearch' && event.query) {
                spinner.stop();
                ui.log(`  ${ui.colors.dim('Search:')} ${event.query.length > 60 ? event.query.slice(0, 60) + '...' : event.query}`);
                spinner = ui.spinner(`Researching... (${event.searchCount} searches)`);
              }
            },
          });
          spinner.stop();

          ui.log('');
          ui.log(answer);
          ui.log('');

          // Ask if they want to continue or ask another question
          const continueResult = await promptAfterFollowUp();
          if (continueResult === GO_BACK_SECTION) {
            return;
          }
          if (continueResult) {
            // User wants to ask another question
            const { text } = await import('@clack/prompts');
            const nextQ = await text({
              message: 'What would you like to know?',
              placeholder: 'e.g., How does their pricing compare?',
              validate: (value) => {
                if (!value.trim()) return 'Please enter a question';
              },
            });
            pendingQuestion = typeof nextQ === 'string' ? nextQ : null;
            continue;
          }
          // User chose to continue - fall through to save prompt
        } catch (error) {
          spinner.fail('Failed to get answer');
          ui.error(error instanceof Error ? error.message : String(error));
        }
        pendingQuestion = null;
      }

      // Save report prompt
      ui.log('');
      const promptResult = await promptWithFollowUp('Save report to file?');

      if (promptResult === GO_BACK_SECTION) {
        return;
      }

      if (promptResult.type === 'answer') {
        if (promptResult.value) {
          let filename: string;
          if (isUrl) {
            try {
              const url = new URL(input);
              filename = url.hostname.replace(/^www\./, '').replace(/\./g, '-');
            } catch {
              filename = 'competitor-research';
            }
          } else {
            filename = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
          }

          const reportPath = path.join(process.cwd(), `${filename}-competition.md`);
          await generateResearchReport(result.research, reportPath, isUrl ? input : `"${input}"`);
          ui.success(`Report saved: ${reportPath}`);
        }
        break; // Done
      }

      if (promptResult.type === 'followUp') {
        if (!sessionId) {
          ui.warn('Session not available for follow-up questions.');
          continue;
        }
        pendingQuestion = promptResult.question;
      }
    }
  });

// Default command (interactive mode selection)
program
  .action(async () => {
    setupSignalHandlers();
    ui.banner();

    const { select } = await import('@clack/prompts');

    const mode = await select({
      message: 'What would you like to do?',
      options: [
        {
          value: 'create',
          label: 'Create a new SaaS project',
          hint: 'Full wizard: idea discovery, market research, and project generation',
        },
        {
          value: 'compete',
          label: 'Research competitors',
          hint: 'Analyze competition for an idea or URL',
        },
        {
          value: 'config',
          label: 'Configure settings',
          hint: 'Set up API keys and credentials',
        },
        {
          value: 'domain',
          label: 'Check domain availability',
          hint: 'See if a domain is available and get suggestions',
        },
      ],
    });

    if (typeof mode !== 'string') {
      // User cancelled
      return;
    }

    ui.log('');

    if (mode === 'create') {
      await program.commands.find(cmd => cmd.name() === 'create')?.parseAsync([]);
    } else if (mode === 'compete') {
      const { text } = await import('@clack/prompts');
      const input = await text({
        message: 'Enter a SaaS idea or competitor URL to analyze:',
        placeholder: 'e.g., "AI-powered invoicing" or https://example.com',
        validate: (value) => {
          if (!value.trim()) return 'Please enter an idea or URL';
        },
      });

      if (typeof input !== 'string') return;

      // Re-run with the compete command
      await program.parseAsync(['node', 'saasfactory', 'compete', input]);
    } else if (mode === 'config') {
      await program.commands.find(cmd => cmd.name() === 'config')?.parseAsync([]);
    } else if (mode === 'domain') {
      const { text } = await import('@clack/prompts');
      const domain = await text({
        message: 'Enter a domain name to check:',
        placeholder: 'e.g., myapp or myapp.com',
        validate: (value) => {
          if (!value.trim()) return 'Please enter a domain name';
        },
      });

      if (typeof domain !== 'string') return;

      await program.parseAsync(['node', 'saasfactory', 'domain', domain]);
    }
  });

export function runCLI(): void {
  program.parse();
}
