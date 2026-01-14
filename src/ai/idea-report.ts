import chalk from 'chalk';
import type { SaasIdea, MarketVerdict, DifficultyLabel, CostEstimate } from '../core/context.js';

const VERDICT_COLORS: Record<string, (text: string) => string> = {
  strong: chalk.green,
  moderate: chalk.yellow,
  weak: chalk.red,
  saturated: chalk.red.bold,
};

const DIFFICULTY_COLORS: Record<string, (text: string) => string> = {
  trivial: chalk.green.bold,
  easy: chalk.green,
  moderate: chalk.yellow,
  challenging: chalk.hex('#ff8c00'), // Orange
  complex: chalk.red,
};

/**
 * Get color function for verdict with fallback
 */
function getVerdictColor(verdict: string): (text: string) => string {
  const key = verdict?.toLowerCase?.() || 'moderate';
  return VERDICT_COLORS[key] || chalk.yellow;
}

/**
 * Get color function for difficulty with fallback
 */
function getDifficultyColor(label: string): (text: string) => string {
  const key = label?.toLowerCase?.() || 'moderate';
  return DIFFICULTY_COLORS[key] || chalk.yellow;
}

const COST_LABELS: Record<CostEstimate, string> = {
  free: 'Free',
  low: '$',
  medium: '$$',
  high: '$$$',
};

/**
 * Generate difficulty stars (inverted: more stars = easier)
 */
function difficultyStars(score: number): string {
  const filled = '★'.repeat(6 - score);
  const empty = '☆'.repeat(score - 1);
  return filled + empty;
}

/**
 * Generate market opportunity indicator
 */
function marketIndicator(score: number): string {
  if (score >= 7) return chalk.green('●●●');
  if (score >= 4) return chalk.yellow('●●○');
  return chalk.red('●○○');
}

/**
 * Display a compact list of all discovered ideas
 */
export function displayIdeasList(ideas: SaasIdea[]): void {
  console.log('');
  console.log(chalk.hex('#6366f1').bold('▸ Discovered SaaS Ideas'));
  console.log('');

  ideas.forEach((idea, index) => {
    const diffColor = getDifficultyColor(idea.difficulty.label);
    const verdictColor = getVerdictColor(idea.marketOpportunity.verdict);
    const stars = difficultyStars(idea.difficulty.score);

    console.log(chalk.bold(`  ${index + 1}. ${idea.name}`));
    console.log(`     ${chalk.dim('"')}${idea.tagline}${chalk.dim('"')}`);
    console.log('');
    console.log(`     ${chalk.dim('Difficulty:')} ${diffColor(stars)} ${diffColor(idea.difficulty.label)} ${chalk.dim(`(${idea.difficulty.estimatedHours})`)}`);
    console.log(`     ${chalk.dim('Market:')} ${marketIndicator(idea.marketOpportunity.score)} ${verdictColor(`${idea.marketOpportunity.score}/10`)} ${chalk.dim(`- ${idea.marketOpportunity.verdict}`)}`);
    console.log(`     ${chalk.dim('Income:')} ${chalk.green(idea.income.monthlyPotential)} ${chalk.dim(`(${idea.income.model})`)}`);
    console.log(`     ${chalk.dim('Marketing:')} ${idea.marketing.primaryChannels.slice(0, 2).join(', ')} ${chalk.dim(`| ${COST_LABELS[idea.marketing.estimatedCost]} cost`)}`);
    console.log('');
    console.log(chalk.dim('     ─'.repeat(25)));
    console.log('');
  });
}

/**
 * Display full details of a single idea
 */
export function displayIdeaDetails(idea: SaasIdea): void {
  const diffColor = getDifficultyColor(idea.difficulty.label);
  const verdictColor = getVerdictColor(idea.marketOpportunity.verdict);
  const stars = difficultyStars(idea.difficulty.score);

  console.log('');
  console.log(chalk.hex('#6366f1').bold(`▸ ${idea.name}`));
  console.log(`  ${chalk.dim('"')}${idea.tagline}${chalk.dim('"')}`);
  console.log('');

  // Description & Problem
  console.log(chalk.dim('  Description:'));
  console.log(`  ${idea.description}`);
  console.log('');
  console.log(chalk.dim('  Problem Solved:'));
  console.log(`  ${idea.problemSolved}`);
  console.log('');

  // Target Audience
  console.log(chalk.dim('  Target Audience:'));
  idea.targetAudience.forEach(audience => {
    console.log(`  ${chalk.dim('•')} ${audience}`);
  });
  console.log('');

  // Core Features
  console.log(chalk.dim('  Core Features (1-3):'));
  idea.coreFeatures.forEach(feature => {
    console.log(`  ${chalk.cyan('•')} ${feature}`);
  });
  console.log('');

  // Market Opportunity Box
  console.log(chalk.hex('#6366f1').bold('  ┌─ Market Opportunity ─────────────────────────┐'));
  const scoreBar = '█'.repeat(idea.marketOpportunity.score) + '░'.repeat(10 - idea.marketOpportunity.score);
  console.log(`  │ Score: ${verdictColor(`${idea.marketOpportunity.score}/10`)} ${chalk.dim('[')}${verdictColor(scoreBar)}${chalk.dim(']')}`);
  console.log(`  │ Verdict: ${verdictColor(idea.marketOpportunity.verdict.toUpperCase())}`);
  console.log(`  │`);
  console.log(`  │ ${chalk.dim(idea.marketOpportunity.reasoning)}`);
  console.log(`  │`);
  if (idea.marketOpportunity.competitors.length > 0) {
    console.log(`  │ ${chalk.dim('Competitors:')} ${idea.marketOpportunity.competitors.join(', ')}`);
  }
  console.log(`  │ ${chalk.dim('Gap:')} ${idea.marketOpportunity.gap}`);
  console.log(chalk.hex('#6366f1')('  └────────────────────────────────────────────────┘'));
  console.log('');

  // Claude Code Difficulty Box
  console.log(chalk.hex('#8b5cf6').bold('  ┌─ Claude Code Difficulty ──────────────────────┐'));
  console.log(`  │ ${diffColor(stars)} ${diffColor(idea.difficulty.label.toUpperCase())} ${chalk.dim(`(${idea.difficulty.score}/5)`)}`);
  console.log(`  │ ${chalk.dim('Estimated build time:')} ${idea.difficulty.estimatedHours}`);
  console.log(`  │`);
  console.log(`  │ ${chalk.dim(idea.difficulty.reasoning)}`);
  console.log(`  │`);
  console.log(`  │ ${chalk.green('AI Strengths:')}`);
  idea.difficulty.aiStrengths.forEach(strength => {
    console.log(`  │   ${chalk.green('✓')} ${strength}`);
  });
  console.log(chalk.hex('#8b5cf6')('  └────────────────────────────────────────────────┘'));
  console.log('');

  // Marketing Strategy Box
  console.log(chalk.hex('#10b981').bold('  ┌─ Marketing Strategy ──────────────────────────┐'));
  console.log(`  │ ${chalk.dim('Primary Channels:')} ${idea.marketing.primaryChannels.join(', ')}`);
  console.log(`  │ ${chalk.dim('Cost:')} ${COST_LABELS[idea.marketing.estimatedCost]} ${chalk.dim(`| Time to first users:`)} ${idea.marketing.timeToFirstUsers}`);
  console.log(`  │`);
  console.log(`  │ ${chalk.dim('Launch Strategy:')}`);
  // Wrap long text
  const strategyWords = idea.marketing.launchStrategy.split(' ');
  let line = '  │ ';
  strategyWords.forEach(word => {
    if (line.length + word.length > 52) {
      console.log(line);
      line = '  │ ' + word + ' ';
    } else {
      line += word + ' ';
    }
  });
  if (line.trim() !== '│') console.log(line);
  console.log(`  │`);
  if (idea.marketing.tactics.length > 0) {
    console.log(`  │ ${chalk.dim('Tactics:')}`);
    idea.marketing.tactics.slice(0, 3).forEach(tactic => {
      console.log(`  │   ${chalk.cyan(tactic.channel)}: ${tactic.approach}`);
    });
  }
  console.log(chalk.hex('#10b981')('  └────────────────────────────────────────────────┘'));
  console.log('');

  // Income Potential Box
  console.log(chalk.hex('#f59e0b').bold('  ┌─ Income Potential ─────────────────────────────┐'));
  console.log(`  │ ${chalk.dim('Model:')} ${idea.income.model}`);
  console.log(`  │ ${chalk.dim('Suggested Pricing:')} ${idea.income.suggestedPricing}`);
  console.log(`  │ ${chalk.green.bold('Monthly Potential:')} ${chalk.green.bold(idea.income.monthlyPotential)}`);
  if (idea.income.timeToFirstRevenue) {
    console.log(`  │ ${chalk.dim('Time to first revenue:')} ${idea.income.timeToFirstRevenue}`);
  }
  console.log(chalk.hex('#f59e0b')('  └────────────────────────────────────────────────┘'));
  console.log('');

  // Sources
  if (idea.sources.length > 0) {
    console.log(chalk.dim('  Sources researched:'));
    idea.sources.slice(0, 5).forEach(source => {
      console.log(`  ${chalk.dim('•')} ${chalk.dim(source)}`);
    });
    console.log('');
  }
}

/**
 * Display a brief summary line for an idea
 */
export function getIdeaOneLiner(idea: SaasIdea): string {
  const diffColor = getDifficultyColor(idea.difficulty.label);
  const stars = difficultyStars(idea.difficulty.score);
  return `${chalk.bold(idea.name)} - ${diffColor(stars)} ${idea.difficulty.label} | ${idea.marketOpportunity.score}/10 market | ${chalk.green(idea.income.monthlyPotential)}`;
}

/**
 * Display discovery summary after research completes
 */
export function displayDiscoverySummary(ideas: SaasIdea[], searchCount: number, sourcesCount: number): void {
  console.log('');
  console.log(chalk.hex('#6366f1').bold('▸ Discovery Complete'));
  console.log('');
  console.log(`  ${chalk.dim('Ideas found:')} ${chalk.bold(String(ideas.length))}`);
  console.log(`  ${chalk.dim('Searches performed:')} ${searchCount}`);
  console.log(`  ${chalk.dim('Sources analyzed:')} ${sourcesCount}`);
  console.log('');

  // Quick stats
  const easyIdeas = ideas.filter(i => i.difficulty.score <= 2).length;
  const strongMarket = ideas.filter(i => i.marketOpportunity.score >= 7).length;

  if (easyIdeas > 0) {
    console.log(chalk.green(`  ✓ ${easyIdeas} idea${easyIdeas > 1 ? 's' : ''} rated easy for Claude Code to build`));
  }
  if (strongMarket > 0) {
    console.log(chalk.green(`  ✓ ${strongMarket} idea${strongMarket > 1 ? 's' : ''} with strong market opportunity`));
  }
  console.log('');
}

/**
 * Format idea for selection prompt
 */
export function formatIdeaForSelection(idea: SaasIdea, index: number): { value: string; label: string; hint: string } {
  const diffColor = getDifficultyColor(idea.difficulty.label);
  const stars = difficultyStars(idea.difficulty.score);

  return {
    value: idea.id,
    label: `${idea.name}`,
    hint: `${diffColor(stars)} ${idea.difficulty.label} | ${idea.marketOpportunity.score}/10 market | ${idea.income.monthlyPotential}`,
  };
}
