import path from 'path';
import { ui } from '../cli/ui.js';
import type { ProjectContext } from './context.js';
import {
  ensureDir,
  writeFile,
  writeJson,
  exists,
} from '../utils/file-system.js';

// Import modules
import { generateBase } from '../modules/base/index.js';
import { generateUI } from '../modules/ui/index.js';
import { generateAuth } from '../modules/auth/index.js';
import { generateDatabase } from '../modules/database/index.js';
import { generatePayments } from '../modules/payments/index.js';
import { generateSEO } from '../modules/seo/index.js';
import { generateAnalytics } from '../modules/analytics/index.js';
import { generateEmail } from '../modules/email/index.js';
import { generateLegal } from '../modules/legal/index.js';
import { generateAssets } from '../modules/assets/index.js';

export interface GenerateResult {
  success: boolean;
  projectPath: string;
  errors: string[];
}

/**
 * Main generator orchestrator
 * @param context - Project configuration context
 * @param targetDir - Optional target directory path (defaults to cwd + project name)
 */
export async function generate(context: ProjectContext, targetDir?: string): Promise<GenerateResult> {
  const projectPath = targetDir || path.join(process.cwd(), context.name);
  const errors: string[] = [];

  // Check if directory exists
  if (await exists(projectPath)) {
    ui.error(`Directory already exists: ${projectPath}`);
    return { success: false, projectPath, errors: ['Directory already exists'] };
  }

  // Create project directory
  await ensureDir(projectPath);

  // Track progress
  const modules = [
    { name: 'Base project', fn: generateBase, enabled: true },
    { name: 'UI components', fn: generateUI, enabled: true },
    { name: 'Authentication', fn: generateAuth, enabled: context.features.auth },
    { name: 'Database', fn: generateDatabase, enabled: context.features.database },
    { name: 'Payments', fn: generatePayments, enabled: context.features.payments },
    { name: 'SEO', fn: generateSEO, enabled: context.features.seo },
    { name: 'Analytics', fn: generateAnalytics, enabled: context.features.analytics !== 'none' },
    { name: 'Email templates', fn: generateEmail, enabled: context.features.email },
    { name: 'Legal documents', fn: generateLegal, enabled: context.features.legal },
    { name: 'Assets', fn: generateAssets, enabled: context.features.assets },
  ];

  // Run enabled modules
  for (const module of modules) {
    if (!module.enabled) continue;

    const spinner = ui.spinner(`Generating ${module.name}...`);

    try {
      await module.fn(context, projectPath);
      spinner.succeed(`${module.name} generated`);
    } catch (error) {
      spinner.fail(`${module.name} failed`);
      errors.push(`${module.name}: ${String(error)}`);
    }
  }

  // Generate project config file
  const configSpinner = ui.spinner('Saving project configuration...');
  try {
    await writeJson(
      path.join(projectPath, 'saasfactory.json'),
      {
        version: context.saasfactoryVersion,
        createdAt: context.createdAt,
        context,
      },
      2,
    );
    configSpinner.succeed('Project configuration saved');
  } catch (error) {
    configSpinner.fail('Failed to save configuration');
    errors.push(`Config: ${String(error)}`);
  }

  // Generate README
  const readmeSpinner = ui.spinner('Generating README...');
  try {
    await generateReadme(context, projectPath);
    readmeSpinner.succeed('README generated');
  } catch (error) {
    readmeSpinner.fail('Failed to generate README');
    errors.push(`README: ${String(error)}`);
  }

  return {
    success: errors.length === 0,
    projectPath,
    errors,
  };
}

/**
 * Generate README.md
 */
async function generateReadme(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const readme = `# ${context.displayName}

${context.description}

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Convex
- **Authentication**: Clerk
- **Payments**: Stripe
- **UI**: shadcn/ui + Tailwind CSS
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- npm/pnpm/yarn

### Installation

\`\`\`bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your API keys in .env.local

# Initialize Convex
npx convex dev

# Start development server
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Copy \`.env.example\` to \`.env.local\` and fill in:

| Variable | Description | Required |
|----------|-------------|----------|
| \`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\` | Clerk public key | Yes |
| \`CLERK_SECRET_KEY\` | Clerk secret key | Yes |
| \`NEXT_PUBLIC_CONVEX_URL\` | Convex deployment URL | Yes |
| \`STRIPE_SECRET_KEY\` | Stripe secret key | Yes |
| \`STRIPE_WEBHOOK_SECRET\` | Stripe webhook secret | Yes |

## Project Structure

\`\`\`
${context.name}/
├── app/                    # Next.js App Router
│   ├── (marketing)/       # Public pages
│   ├── (auth)/            # Auth pages
│   └── (dashboard)/       # Protected pages
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── marketing/        # Landing page components
│   └── dashboard/        # Dashboard components
├── convex/               # Convex backend
├── lib/                  # Utility functions
└── public/               # Static assets
\`\`\`

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

## License

MIT

---

Generated with [SaasFactory](https://github.com/your-username/saasfactory)
`;

  await writeFile(path.join(projectPath, 'README.md'), readme);
}
