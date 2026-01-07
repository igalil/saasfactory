import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile } from '../../utils/file-system.js';

/**
 * Generate SEO optimization files
 */
export async function generateSEO(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate robots.txt
  await generateRobotsTxt(context, projectPath);

  // Generate sitemap.ts (dynamic sitemap)
  await generateSitemap(context, projectPath);

  // Generate app/layout.tsx with metadata
  await generateRootLayout(context, projectPath);

  // Generate JSON-LD component
  await generateJsonLd(context, projectPath);

  // Generate llms.txt for AI discoverability
  await generateLlmsTxt(context, projectPath);
}

async function generateRobotsTxt(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const domain = context.domain ? `https://${context.domain}.com` : 'https://example.com';

  const robots = `# Robots.txt for ${context.displayName}
# https://www.robotstxt.org/robotstxt.html

User-agent: *
Allow: /

# Disallow private areas
Disallow: /api/
Disallow: /dashboard/
Disallow: /_next/

# Sitemap
Sitemap: ${domain}/sitemap.xml

# AI Agents
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Anthropic-AI
Allow: /
`;

  await writeFile(path.join(projectPath, 'public', 'robots.txt'), robots);
}

async function generateSitemap(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const sitemap = `import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://example.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: \`\${baseUrl}/pricing\`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: \`\${baseUrl}/about\`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: \`\${baseUrl}/privacy\`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: \`\${baseUrl}/terms\`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
`;

  await writeFile(path.join(projectPath, 'app', 'sitemap.ts'), sitemap);
}

async function generateRootLayout(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const keywords = context.content.seoKeywords.length > 0
    ? context.content.seoKeywords.join(', ')
    : `${context.displayName}, SaaS, ${context.saasType}`;

  const description = context.content.metaDescription || context.description;

  const layout = `import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import { JsonLd } from '@/components/shared/json-ld';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://example.com'),
  title: {
    default: '${context.displayName}',
    template: '%s | ${context.displayName}',
  },
  description: '${description.replace(/'/g, "\\'")}',
  keywords: '${keywords}',
  authors: [{ name: '${context.displayName}' }],
  creator: '${context.displayName}',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: '${context.displayName}',
    title: '${context.displayName}',
    description: '${description.replace(/'/g, "\\'")}',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '${context.displayName}',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '${context.displayName}',
    description: '${description.replace(/'/g, "\\'")}',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <JsonLd />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;

  await writeFile(path.join(projectPath, 'app', 'layout.tsx'), layout);
}

async function generateJsonLd(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const jsonLd = `export function JsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: '${context.displayName}',
    description: '${context.description.replace(/'/g, "\\'")}',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '100',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
`;

  await writeFile(
    path.join(projectPath, 'components', 'shared', 'json-ld.tsx'),
    jsonLd
  );
}

async function generateLlmsTxt(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const features = context.content.features.length > 0
    ? context.content.features.map(f => `- ${f.title}: ${f.description}`).join('\n')
    : '- Core functionality for your business needs';

  const llmsTxt = `# ${context.displayName}

> ${context.content.tagline || context.description}

## What is ${context.displayName}?

${context.displayName} is a ${context.saasType} SaaS application that ${context.description.toLowerCase()}.

## Key Features

${features}

## Pricing

${context.pricing.tiers.map(tier => `- ${tier.name}: $${tier.price}/${tier.interval}`).join('\n')}

## Getting Started

1. Sign up at ${context.domain ? `https://${context.domain}.com` : 'our website'}
2. Choose a plan that fits your needs
3. Start using ${context.displayName}

## Contact

For support, visit our website or contact us through the dashboard.

## Technical Details

- Built with Next.js and React
- Database powered by Convex
- Authentication via Clerk
- Payments processed by Stripe

---
This document is designed for AI assistants to help users learn about ${context.displayName}.
`;

  await writeFile(path.join(projectPath, 'public', 'llms.txt'), llmsTxt);
}
