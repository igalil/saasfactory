import path from 'path';
import fs from 'fs-extra';
import type { ProjectContext } from '../../core/context.js';
import { ensureDir } from '../../utils/file-system.js';

/**
 * Generate assets (logo, favicon, OG images) using Google Imagen API
 */
export async function generateAssets(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  await ensureDir(path.join(projectPath, 'public'));

  // Generate logo using Google Imagen (Gemini)
  await generateLogo(context, projectPath);

  // Generate favicon from logo
  await generateFavicon(context, projectPath);

  // Generate Open Graph image
  await generateOGImage(context, projectPath);

  // Generate Product Hunt assets
  await generateProductHuntAssets(context, projectPath);
}

async function generateLogo(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const apiKey = process.env['GOOGLE_API_KEY'];

  if (!apiKey) {
    // Generate placeholder SVG logo if no API key
    await generatePlaceholderLogo(context, projectPath);
    return;
  }

  try {
    // Use Google Gemini 2.0 Flash for image generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate a modern, minimalist logo for a SaaS company called "${context.displayName}".

Description: ${context.description}
Type: ${context.saasType}

Requirements:
- Simple, clean design suitable for a tech startup
- Works well at small sizes (favicon) and large sizes
- Professional and modern look
- Single color or simple gradient
- No text in the logo, just an icon/symbol
- Vector-style design

Return the logo as an SVG.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // Extract SVG from response
    const svgMatch = content?.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      await fs.writeFile(path.join(projectPath, 'public', 'logo.svg'), svgMatch[0]);
    } else {
      // Fallback to placeholder
      await generatePlaceholderLogo(context, projectPath);
    }
  } catch (error) {
    console.warn('Failed to generate logo with AI, using placeholder:', error);
    await generatePlaceholderLogo(context, projectPath);
  }
}

async function generatePlaceholderLogo(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate a simple placeholder SVG logo
  const initials = context.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="url(#gradient)"/>
  <text x="32" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="white" text-anchor="middle">${initials}</text>
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`;

  await fs.writeFile(path.join(projectPath, 'public', 'logo.svg'), svg);
}

async function generateFavicon(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // For now, generate a simple ICO placeholder
  // In production, you'd convert the SVG to ICO format
  const initials = context.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Create a simple 32x32 SVG favicon
  const faviconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="#6366f1"/>
  <text x="16" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="white" text-anchor="middle">${initials}</text>
</svg>`;

  await fs.writeFile(path.join(projectPath, 'public', 'favicon.svg'), faviconSvg);

  // Create apple-touch-icon placeholder
  const appleTouchIcon = `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="40" fill="url(#gradient)"/>
  <text x="90" y="110" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="600" fill="white" text-anchor="middle">${initials}</text>
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`;

  await fs.writeFile(
    path.join(projectPath, 'public', 'apple-touch-icon.svg'),
    appleTouchIcon
  );

  // Create web manifest
  const manifest = {
    name: context.displayName,
    short_name: context.name,
    icons: [
      { src: '/favicon.svg', sizes: '32x32', type: 'image/svg+xml' },
      { src: '/logo.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/apple-touch-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
    theme_color: '#6366f1',
    background_color: '#ffffff',
    display: 'standalone',
  };

  await fs.writeJson(path.join(projectPath, 'public', 'site.webmanifest'), manifest, {
    spaces: 2,
  });
}

async function generateOGImage(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate a placeholder OG image (1200x630)
  const tagline = context.content.tagline || context.description.substring(0, 60);

  const ogSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="url(#bg-gradient)"/>

  <!-- Logo area -->
  <rect x="80" y="80" width="80" height="80" rx="16" fill="white" fill-opacity="0.2"/>

  <!-- Title -->
  <text x="80" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="white">
    ${context.displayName}
  </text>

  <!-- Tagline -->
  <text x="80" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="32" fill="white" fill-opacity="0.9">
    ${tagline}
  </text>

  <!-- URL -->
  <text x="80" y="550" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="white" fill-opacity="0.6">
    ${context.domain ? `${context.domain}.com` : 'example.com'}
  </text>

  <defs>
    <linearGradient id="bg-gradient" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4f46e5"/>
      <stop offset="0.5" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`;

  await fs.writeFile(path.join(projectPath, 'public', 'og-image.svg'), ogSvg);
}

async function generateProductHuntAssets(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  await ensureDir(path.join(projectPath, 'public', 'product-hunt'));

  // Generate Product Hunt thumbnail (240x240)
  const initials = context.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const thumbnail = `<svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="240" height="240" rx="48" fill="url(#gradient)"/>
  <text x="120" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="80" font-weight="600" fill="white" text-anchor="middle">${initials}</text>
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="240" y2="240" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`;

  await fs.writeFile(
    path.join(projectPath, 'public', 'product-hunt', 'thumbnail.svg'),
    thumbnail
  );

  // Generate gallery image placeholder (1270x760)
  const tagline = context.content.tagline || context.description.substring(0, 80);

  const gallery = `<svg width="1270" height="760" viewBox="0 0 1270 760" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1270" height="760" fill="#f8fafc"/>

  <!-- Browser mockup -->
  <rect x="60" y="60" width="1150" height="640" rx="12" fill="white" stroke="#e2e8f0" stroke-width="2"/>

  <!-- Browser bar -->
  <rect x="60" y="60" width="1150" height="48" rx="12" fill="#f1f5f9"/>
  <circle cx="88" cy="84" r="6" fill="#ef4444"/>
  <circle cx="108" cy="84" r="6" fill="#f59e0b"/>
  <circle cx="128" cy="84" r="6" fill="#22c55e"/>

  <!-- URL bar -->
  <rect x="200" y="72" width="400" height="24" rx="4" fill="#e2e8f0"/>
  <text x="220" y="90" font-family="monospace" font-size="12" fill="#64748b">${context.domain || context.name}.com</text>

  <!-- Content area -->
  <text x="635" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="#1f2937" text-anchor="middle">
    ${context.displayName}
  </text>
  <text x="635" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#6b7280" text-anchor="middle">
    ${tagline}
  </text>

  <!-- CTA Button -->
  <rect x="555" y="480" width="160" height="48" rx="8" fill="#6366f1"/>
  <text x="635" y="512" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">Get Started</text>
</svg>`;

  await fs.writeFile(
    path.join(projectPath, 'public', 'product-hunt', 'gallery-1.svg'),
    gallery
  );
}
