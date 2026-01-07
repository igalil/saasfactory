import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, writeJson, ensureDir } from '../../utils/file-system.js';
import {
  generateLandingPage,
  generateDashboardPage,
  generateDashboardLayout,
} from './templates/landing-page.js';

/**
 * Generate base Next.js project structure
 */
export async function generateBase(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Create directory structure
  const dirs = [
    'app',
    'app/(marketing)',
    'app/(auth)',
    'app/(dashboard)',
    'app/api',
    'app/api/webhooks',
    'components',
    'components/ui',
    'components/marketing',
    'components/dashboard',
    'components/shared',
    'components/providers',
    'lib',
    'hooks',
    'public',
    'convex',
    'emails',
  ];

  for (const dir of dirs) {
    await ensureDir(path.join(projectPath, dir));
  }

  // Generate package.json
  await generatePackageJson(context, projectPath);

  // Generate next.config.ts
  await generateNextConfig(context, projectPath);

  // Generate tsconfig.json
  await generateTsConfig(projectPath);

  // Generate tailwind.config.ts
  await generateTailwindConfig(projectPath);

  // Generate postcss.config.js
  await generatePostCssConfig(projectPath);

  // Generate .gitignore
  await generateGitignore(projectPath);

  // Generate .env.example
  await generateEnvExample(context, projectPath);

  // Generate globals.css
  await generateGlobalsCss(projectPath);

  // Generate lib/utils.ts
  await generateUtilsLib(projectPath);

  // Generate landing page
  await writeFile(
    path.join(projectPath, 'app', 'page.tsx'),
    generateLandingPage(context)
  );

  // Generate dashboard pages
  await writeFile(
    path.join(projectPath, 'app', '(dashboard)', 'layout.tsx'),
    generateDashboardLayout(context)
  );
  await writeFile(
    path.join(projectPath, 'app', '(dashboard)', 'page.tsx'),
    generateDashboardPage(context)
  );
}

async function generatePackageJson(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const packageJson = {
    name: context.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev --turbopack',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
      'convex:dev': 'convex dev',
      'convex:deploy': 'convex deploy',
    },
    dependencies: {
      next: '^16.0.10',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      '@clerk/nextjs': '^6.12.0',
      convex: '^1.17.4',
      stripe: '^17.5.0',
      '@stripe/stripe-js': '^5.5.0',
      'class-variance-authority': '^0.7.1',
      clsx: '^2.1.1',
      'tailwind-merge': '^2.6.0',
      'lucide-react': '^0.468.0',
      '@radix-ui/react-slot': '^1.1.1',
      '@radix-ui/react-label': '^2.1.1',
      zod: '^3.24.1',
      ...(context.features.analytics === 'posthog'
        ? { 'posthog-js': '^1.194.0', '@posthog/next': '^1.2.0' }
        : {}),
      ...(context.features.email
        ? {
            resend: '^4.0.1',
            '@react-email/components': '^0.0.31',
          }
        : {}),
    },
    devDependencies: {
      typescript: '^5.7.2',
      '@types/node': '^22.10.5',
      '@types/react': '^19.0.2',
      '@types/react-dom': '^19.0.2',
      tailwindcss: '^3.4.17',
      postcss: '^8.4.49',
      autoprefixer: '^10.4.20',
      eslint: '^9.17.0',
      'eslint-config-next': '^15.1.3',
      'tailwindcss-animate': '^1.0.7',
    },
  };

  await writeJson(path.join(projectPath, 'package.json'), packageJson);
}

async function generateNextConfig(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const config = `import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
};

export default nextConfig;
`;

  await writeFile(path.join(projectPath, 'next.config.ts'), config);
}

async function generateTsConfig(projectPath: string): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: {
        '@/*': ['./*'],
      },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };

  await writeJson(path.join(projectPath, 'tsconfig.json'), tsConfig);
}

async function generateTailwindConfig(projectPath: string): Promise<void> {
  const config = `import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
`;

  await writeFile(path.join(projectPath, 'tailwind.config.ts'), config);
}

async function generatePostCssConfig(projectPath: string): Promise<void> {
  const config = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

  await writeFile(path.join(projectPath, 'postcss.config.js'), config);
}

async function generateGitignore(projectPath: string): Promise<void> {
  const gitignore = `# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage

# Next.js
.next/
out/

# Production
build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts

# Sentry
.sentryclirc

# Convex
.convex
`;

  await writeFile(path.join(projectPath, '.gitignore'), gitignore);
}

async function generateEnvExample(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  let envContent = `# =================================
# ${context.displayName} Environment Variables
# =================================

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Convex
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOY_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`;

  if (context.features.analytics === 'plausible') {
    envContent += `
# Plausible Analytics
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
`;
  } else if (context.features.analytics === 'posthog') {
    envContent += `
# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
`;
  }

  if (context.features.email) {
    envContent += `
# Email (Resend)
RESEND_API_KEY=
`;
  }

  await writeFile(path.join(projectPath, '.env.example'), envContent);
}

async function generateGlobalsCss(projectPath: string): Promise<void> {
  const css = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

  await writeFile(path.join(projectPath, 'app', 'globals.css'), css);
}

async function generateUtilsLib(projectPath: string): Promise<void> {
  const utils = `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

  await writeFile(path.join(projectPath, 'lib', 'utils.ts'), utils);
}
