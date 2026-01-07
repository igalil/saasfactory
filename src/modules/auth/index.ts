import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, ensureDir } from '../../utils/file-system.js';

/**
 * Generate Clerk authentication setup
 */
export async function generateAuth(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate middleware.ts
  await generateMiddleware(projectPath);

  // Generate auth pages
  await ensureDir(path.join(projectPath, 'app', '(auth)', 'sign-in', '[[...sign-in]]'));
  await ensureDir(path.join(projectPath, 'app', '(auth)', 'sign-up', '[[...sign-up]]'));

  await generateSignInPage(projectPath);
  await generateSignUpPage(projectPath);
  await generateAuthLayout(projectPath);

  // Generate ConvexClientProvider with Clerk
  await generateConvexProvider(projectPath);
}

async function generateMiddleware(projectPath: string): Promise<void> {
  const middleware = `import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing',
  '/about',
  '/privacy',
  '/terms',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
`;

  await writeFile(path.join(projectPath, 'middleware.ts'), middleware);
}

async function generateSignInPage(projectPath: string): Promise<void> {
  const page = `import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'app', '(auth)', 'sign-in', '[[...sign-in]]', 'page.tsx'),
    page
  );
}

async function generateSignUpPage(projectPath: string): Promise<void> {
  const page = `import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'app', '(auth)', 'sign-up', '[[...sign-up]]', 'page.tsx'),
    page
  );
}

async function generateAuthLayout(projectPath: string): Promise<void> {
  const layout = `export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {children}
    </div>
  );
}
`;

  await writeFile(path.join(projectPath, 'app', '(auth)', 'layout.tsx'), layout);
}

async function generateConvexProvider(projectPath: string): Promise<void> {
  const provider = `'use client';

import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import { ReactNode } from 'react';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
`;

  await writeFile(path.join(projectPath, 'components', 'providers', 'convex-provider.tsx'), provider);

  // Also create providers directory index
  const providersIndex = `export { Providers } from './convex-provider';
`;

  await writeFile(path.join(projectPath, 'components', 'providers', 'index.tsx'), providersIndex);
}
