import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, ensureDir } from '../../utils/file-system.js';

/**
 * Generate analytics setup (PostHog or Plausible)
 */
export async function generateAnalytics(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  if (context.features.analytics === 'none') return;

  await ensureDir(path.join(projectPath, 'lib'));

  if (context.features.analytics === 'posthog') {
    await generatePostHog(context, projectPath);
  } else if (context.features.analytics === 'plausible') {
    await generatePlausible(context, projectPath);
  }
}

async function generatePostHog(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate PostHog provider
  const provider = `'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: false, // We capture manually for better control
        capture_pageleave: true,
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            posthog.debug();
          }
        },
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

// Hook to identify users after sign-in
export function PostHogIdentify() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.emailAddresses[0]?.emailAddress,
        name: user.fullName,
        createdAt: user.createdAt,
      });
    } else {
      posthog.reset();
    }
  }, [isSignedIn, user]);

  return null;
}
`;

  await writeFile(
    path.join(projectPath, 'components', 'providers', 'posthog-provider.tsx'),
    provider
  );

  // Generate PostHog pageview component
  const pageview = `'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import posthog from 'posthog-js';

function PostHogPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url = url + '?' + searchParams.toString();
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'components', 'providers', 'posthog-pageview.tsx'),
    pageview
  );

  // Generate analytics utility functions
  const analyticsLib = `import posthog from 'posthog-js';

// Track custom events
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  posthog.capture(eventName, properties);
}

// Track when user starts a subscription
export function trackSubscriptionStarted(plan: string, price: number) {
  trackEvent('subscription_started', {
    plan,
    price,
    currency: 'USD',
  });
}

// Track when user upgrades/downgrades
export function trackSubscriptionChanged(
  fromPlan: string,
  toPlan: string
) {
  trackEvent('subscription_changed', {
    from_plan: fromPlan,
    to_plan: toPlan,
  });
}

// Track when user cancels
export function trackSubscriptionCancelled(plan: string, reason?: string) {
  trackEvent('subscription_cancelled', {
    plan,
    reason,
  });
}

// Track feature usage
export function trackFeatureUsed(featureName: string, metadata?: Record<string, unknown>) {
  trackEvent('feature_used', {
    feature: featureName,
    ...metadata,
  });
}

// Track errors
export function trackError(error: Error, context?: Record<string, unknown>) {
  trackEvent('error_occurred', {
    error_message: error.message,
    error_stack: error.stack,
    ...context,
  });
}

// Set user properties
export function setUserProperties(properties: Record<string, unknown>) {
  posthog.people.set(properties);
}

// Feature flags
export function isFeatureEnabled(flagKey: string): boolean {
  return posthog.isFeatureEnabled(flagKey) ?? false;
}

export function getFeatureFlag(flagKey: string): string | boolean | undefined {
  return posthog.getFeatureFlag(flagKey);
}
`;

  await writeFile(path.join(projectPath, 'lib', 'analytics.ts'), analyticsLib);

  // Update providers index to export PostHog
  const providersIndex = `export { Providers } from './convex-provider';
export { PostHogProvider, PostHogIdentify } from './posthog-provider';
export { PostHogPageView } from './posthog-pageview';
`;

  await writeFile(
    path.join(projectPath, 'components', 'providers', 'index.tsx'),
    providersIndex
  );
}

async function generatePlausible(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate Plausible script component
  const plausible = `import Script from 'next/script';

export function PlausibleAnalytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  if (!domain) return null;

  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  );
}

// Track custom events
export function trackEvent(eventName: string, props?: Record<string, string | number | boolean>) {
  if (typeof window !== 'undefined' && (window as any).plausible) {
    (window as any).plausible(eventName, { props });
  }
}

// Common events
export function trackSignUp() {
  trackEvent('Sign Up');
}

export function trackSubscription(plan: string) {
  trackEvent('Subscription', { plan });
}

export function trackFeatureUsed(feature: string) {
  trackEvent('Feature Used', { feature });
}
`;

  await writeFile(
    path.join(projectPath, 'components', 'providers', 'plausible-analytics.tsx'),
    plausible
  );

  // Generate analytics lib for Plausible
  const analyticsLib = `// Plausible analytics helpers

export function trackEvent(
  eventName: string,
  props?: Record<string, string | number | boolean>
) {
  if (typeof window !== 'undefined' && (window as any).plausible) {
    (window as any).plausible(eventName, { props });
  }
}

export function trackSubscriptionStarted(plan: string) {
  trackEvent('Subscription Started', { plan });
}

export function trackSubscriptionCancelled(plan: string) {
  trackEvent('Subscription Cancelled', { plan });
}

export function trackFeatureUsed(feature: string) {
  trackEvent('Feature Used', { feature });
}
`;

  await writeFile(path.join(projectPath, 'lib', 'analytics.ts'), analyticsLib);
}
