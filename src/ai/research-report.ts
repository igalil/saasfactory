import chalk from 'chalk';
import fs from 'fs-extra';
import type { MarketResearch, MarketVerdict } from '../core/context.js';

type ExtendedVerdict = MarketVerdict | 'low' | 'high' | 'very_high';

const VERDICT_COLORS: Record<string, (text: string) => string> = {
  strong: chalk.green,
  moderate: chalk.yellow,
  weak: chalk.red,
  saturated: chalk.red.bold,
  low: chalk.red,
  high: chalk.green,
  very_high: chalk.green.bold,
};

const VERDICT_LABELS: Record<string, string> = {
  strong: 'STRONG OPPORTUNITY',
  moderate: 'MODERATE OPPORTUNITY',
  weak: 'WEAK OPPORTUNITY',
  saturated: 'SATURATED MARKET',
  low: 'LOW OPPORTUNITY',
  high: 'HIGH OPPORTUNITY',
  very_high: 'EXCELLENT OPPORTUNITY',
};

/**
 * Get color function for verdict with fallback
 */
function getVerdictColor(verdict: string | undefined): (text: string) => string {
  if (!verdict) return chalk.yellow;
  const key = verdict.toLowerCase() as MarketVerdict;
  return VERDICT_COLORS[key] || chalk.yellow;
}

/**
 * Get label for verdict with fallback
 */
function getVerdictLabel(verdict: string | undefined): string {
  if (!verdict) return 'MODERATE OPPORTUNITY';
  const key = verdict.toLowerCase() as MarketVerdict;
  return VERDICT_LABELS[key] || 'MODERATE OPPORTUNITY';
}

/**
 * Display market research summary in terminal
 */
export function displayResearchSummary(research: MarketResearch): void {
  const { marketValidation, competitors, opportunities, featureIdeas } = research;
  const verdictColor = getVerdictColor(marketValidation.verdict);
  const verdictLabel = getVerdictLabel(marketValidation.verdict);

  console.log('');
  console.log(chalk.hex('#6366f1').bold('▸ Market Research Results'));
  console.log('');

  // Idea Summary
  console.log(chalk.dim('  Idea:'));
  console.log(`  ${research.ideaSummary}`);
  console.log('');

  // Market Validation Score
  const scoreBar = '█'.repeat(marketValidation.score) + '░'.repeat(10 - marketValidation.score);
  console.log(chalk.dim('  Market Validation:'));
  console.log(`  ${verdictColor(`${marketValidation.score}/10`)} ${chalk.dim('[')}${verdictColor(scoreBar)}${chalk.dim(']')} ${verdictColor(verdictLabel)}`);
  console.log(`  ${chalk.dim(marketValidation.reasoning)}`);
  console.log('');

  // Market Size (if available)
  if (research.marketSize) {
    console.log(chalk.dim('  Market Size:'));
    console.log(`  ${research.marketSize}`);
    console.log('');
  }

  // Target Audience
  if (research.targetAudience.length > 0) {
    console.log(chalk.dim('  Target Audience:'));
    research.targetAudience.forEach(audience => {
      console.log(`  ${chalk.dim('•')} ${audience}`);
    });
    console.log('');
  }

  // Competitors
  console.log(chalk.dim(`  Competitors Found: ${competitors.length}`));
  if (competitors.length > 0) {
    console.log(chalk.dim('  ┌' + '─'.repeat(52) + '┐'));
    competitors.forEach((comp, i) => {
      console.log(chalk.dim('  │') + ` ${chalk.bold(`${i + 1}. ${comp.name}`)}`.padEnd(52) + chalk.dim('│'));
      console.log(chalk.dim('  │') + `    ${chalk.cyan(comp.url)}`.padEnd(52) + chalk.dim('│'));
      if (comp.pricing) {
        console.log(chalk.dim('  │') + `    Pricing: ${comp.pricing}`.padEnd(52) + chalk.dim('│'));
      }
      if (comp.features.length > 0) {
        const featuresStr = comp.features.slice(0, 3).join(', ');
        console.log(chalk.dim('  │') + `    Features: ${featuresStr}`.padEnd(52) + chalk.dim('│'));
      }
      if (i < competitors.length - 1) {
        console.log(chalk.dim('  ├' + '─'.repeat(52) + '┤'));
      }
    });
    console.log(chalk.dim('  └' + '─'.repeat(52) + '┘'));
    console.log('');
  }

  // Opportunities
  if (opportunities.length > 0) {
    console.log(chalk.green('  Opportunities:'));
    opportunities.forEach(opp => {
      console.log(`  ${chalk.green('•')} ${opp}`);
    });
    console.log('');
  }

  // Risks
  if (research.risks.length > 0) {
    console.log(chalk.yellow('  Risks:'));
    research.risks.forEach(risk => {
      console.log(`  ${chalk.yellow('•')} ${risk}`);
    });
    console.log('');
  }

  // Feature Ideas
  if (featureIdeas.length > 0) {
    console.log(chalk.cyan('  Feature Ideas (inspired by competitors):'));
    featureIdeas.slice(0, 5).forEach(idea => {
      console.log(`  ${chalk.cyan('•')} ${idea}`);
    });
    console.log('');
  }

  // Recommendations
  if (research.recommendations.length > 0) {
    console.log(chalk.hex('#6366f1')('  Recommendations:'));
    research.recommendations.forEach(rec => {
      console.log(`  ${chalk.hex('#6366f1')('→')} ${rec}`);
    });
    console.log('');
  }
}

/**
 * Generate detailed markdown report
 */
export async function generateResearchReport(
  research: MarketResearch,
  outputPath: string,
  projectName: string,
): Promise<void> {
  const { marketValidation, competitors } = research;
  const verdictLabel = getVerdictLabel(marketValidation.verdict);

  const markdown = `# Market Research Report: ${projectName}

Generated by SaasFactory on ${new Date().toLocaleDateString()}

---

## Executive Summary

**Idea:** ${research.ideaSummary}

**Market Validation Score:** ${marketValidation.score}/10 - ${verdictLabel}

${marketValidation.reasoning}

${research.marketSize ? `**Estimated Market Size:** ${research.marketSize}` : ''}

---

## Target Audience

${research.targetAudience.map(a => `- ${a}`).join('\n')}

---

## Competitive Landscape

${competitors.length === 0 ? '*No direct competitors identified. This could indicate a blue ocean opportunity or an untested market.*' : ''}

${competitors.map((comp, i) => `
### ${i + 1}. ${comp.name}

**Website:** [${comp.url}](${comp.url})

${comp.description}

${comp.pricing ? `**Pricing:** ${comp.pricing}` : ''}

**Key Features:**
${comp.features.map(f => `- ${f}`).join('\n')}

**Strengths:**
${comp.strengths.map(s => `- ✅ ${s}`).join('\n')}

**Weaknesses:**
${comp.weaknesses.map(w => `- ⚠️ ${w}`).join('\n')}
`).join('\n---\n')}

---

## Market Opportunities

${research.opportunities.map(o => `- 🎯 ${o}`).join('\n')}

---

## Potential Risks

${research.risks.map(r => `- ⚠️ ${r}`).join('\n')}

---

## Feature Ideas

Based on competitor analysis, consider implementing:

${research.featureIdeas.map((f, i) => `${i + 1}. ${f}`).join('\n')}

---

## Strategic Recommendations

${research.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

## Next Steps

${marketValidation.verdict === 'saturated' ? `
⚠️ **Caution:** The market appears saturated. Before proceeding, consider:
1. Finding a unique angle or niche
2. Focusing on underserved audience segments
3. Differentiating through superior UX or pricing
` : marketValidation.verdict === 'weak' ? `
⚠️ **Caution:** Market opportunity appears weak. Consider:
1. Validating demand through customer interviews
2. Building a waitlist before development
3. Starting with an MVP to test assumptions
` : `
✅ **Proceed with confidence.** Key actions:
1. Focus on the identified opportunities
2. Differentiate from competitors on key weaknesses
3. Target the specific audience segments identified
`}

---

*This report was generated by SaasFactory using AI-powered market research.*
`;

  await fs.writeFile(outputPath, markdown, 'utf-8');
}

/**
 * Get a brief one-line summary for CLI
 */
export function getResearchOneLiner(research: MarketResearch): string {
  const { score, verdict } = research.marketValidation;
  const verdictLabel = getVerdictLabel(verdict);
  const competitorCount = research.competitors.length;

  return `Score: ${score}/10 (${verdictLabel}) | ${competitorCount} competitors found | ${research.opportunities.length} opportunities identified`;
}
