import { z } from 'zod';

// Type definitions
export type ProjectType = 'web-saas' | 'mobile-app' | 'game' | 'marketplace' | 'api-service' | 'other';
export type SaasType = 'b2b' | 'b2c' | 'marketplace' | 'tool'; // Legacy, kept for compatibility
export type PricingType = 'freemium' | 'subscription' | 'one-time' | 'usage-based' | 'free-with-ads';
export type AnalyticsProvider = 'plausible' | 'posthog' | 'none';

export interface PricingTier {
  name: string;
  price: number;
  interval: 'month' | 'year' | 'one-time';
  features: string[];
  highlighted?: boolean;
}

export interface Feature {
  title: string;
  description: string;
  icon?: string;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

// Market Research Types
export type MarketVerdict = 'strong' | 'moderate' | 'weak' | 'saturated';

// Idea Discovery Types
export type DifficultyLabel = 'trivial' | 'easy' | 'moderate' | 'challenging' | 'complex';
export type CostEstimate = 'free' | 'low' | 'medium' | 'high';
export type IncomeModel = 'subscription' | 'freemium' | 'one-time' | 'usage-based';

export interface ClaudeCodeDifficulty {
  score: 1 | 2 | 3 | 4 | 5;
  label: DifficultyLabel;
  reasoning: string;
  estimatedHours: string;
  aiStrengths: string[];
}

export interface MarketingTactic {
  channel: string;
  approach: string;
  expectedOutcome?: string;
}

export interface MarketingStrategy {
  primaryChannels: string[];
  launchStrategy: string;
  estimatedCost: CostEstimate;
  timeToFirstUsers: string;
  tactics: MarketingTactic[];
}

export interface IncomeProjection {
  model: IncomeModel;
  suggestedPricing: string;
  monthlyPotential: string;
  timeToFirstRevenue?: string;
}

export interface SaasIdea {
  id: string;
  name: string;
  tagline: string;
  description: string;
  problemSolved: string;
  targetAudience: string[];
  coreFeatures: string[];

  marketOpportunity: {
    score: number;
    verdict: MarketVerdict;
    reasoning: string;
    competitors: string[];
    gap: string;
  };

  difficulty: ClaudeCodeDifficulty;
  marketing: MarketingStrategy;
  income: IncomeProjection;
  sources: string[];
}

export interface Competitor {
  name: string;
  url: string;
  description: string;
  pricing?: string;
  features: string[];
  strengths: string[];
  weaknesses: string[];
  // Enhanced fields from deep research
  type?: 'direct' | 'indirect';
  userRating?: string; // e.g., "4.5/5 on G2 (234 reviews)"
  funding?: string; // e.g., "$15M Series A - 2023"
}

export interface ReviewInsights {
  commonPraises: string[];
  commonComplaints: string[];
  featureRequests: string[];
}

export interface MarketResearch {
  ideaSummary: string;
  marketValidation: {
    score: number; // 1-10
    verdict: MarketVerdict | 'low' | 'high' | 'very_high';
    reasoning: string;
  };
  marketSize?: string;
  marketTrends?: string[]; // Industry trends from research
  targetAudience: string[];
  competitors: Competitor[];
  reviewInsights?: ReviewInsights; // Aggregated review data
  opportunities: string[];
  risks: string[];
  featureIdeas: string[];
  positioningStrategy?: string; // How to differentiate
  recommendations: string[];
}

export interface ProjectFeatures {
  // Core (always enabled)
  auth: boolean;
  database: boolean;
  payments: boolean;
  seo: boolean;

  // Optional
  analytics: AnalyticsProvider;
  email: boolean;
  legal: boolean;
  assets: boolean;

  // Extras (user-selected)
  waitlist: boolean;
  supportChat: boolean;
  featureFlags: boolean;
  changelog: boolean;
  statusPage: boolean;
  referral: boolean;
  multiTenancy: boolean;
  apiDocs: boolean;
  i18n: boolean;
  abTesting: boolean;
  onboarding: boolean;
  admin: boolean;
}

export interface GeneratedContent {
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  features: Feature[];
  testimonials: Testimonial[];
  faqItems: FAQItem[];
  seoKeywords: string[];
  metaDescription: string;
  privacyPolicy?: string;
  termsOfService?: string;
}

export interface EnvironmentConfig {
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  convexUrl?: string;
  convexDeployKey?: string;
  stripePublishableKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  sentryDsn?: string;
  analyticsId?: string;
  resendApiKey?: string;
}

export interface ProjectContext {
  // Basic Info
  name: string;
  displayName: string;
  description: string;
  domain?: string;

  // SaaS Details
  saasType: SaasType;
  industry?: string;
  targetAudience?: string;
  valueProposition?: string;

  // Features
  features: ProjectFeatures;

  // Pricing
  pricing: {
    type: PricingType;
    tiers: PricingTier[];
  };

  // Generated Content (by Claude)
  content: GeneratedContent;

  // Market Research (optional, from AI analysis)
  marketResearch?: MarketResearch;

  // Discovered Idea (if user used idea discovery)
  discoveredIdea?: SaasIdea;

  // Environment
  environment: EnvironmentConfig;

  // Metadata
  createdAt: string;
  saasfactoryVersion: string;
}

// Zod schema for validation
export const ProjectContextSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  description: z.string().min(20),
  domain: z.string().optional(),
  saasType: z.enum(['b2b', 'b2c', 'marketplace', 'tool']),
  industry: z.string().optional(),
  targetAudience: z.string().optional(),
  valueProposition: z.string().optional(),
  features: z.object({
    auth: z.boolean(),
    database: z.boolean(),
    payments: z.boolean(),
    seo: z.boolean(),
    analytics: z.enum(['plausible', 'posthog', 'none']),
    email: z.boolean(),
    legal: z.boolean(),
    assets: z.boolean(),
    waitlist: z.boolean(),
    supportChat: z.boolean(),
    featureFlags: z.boolean(),
    changelog: z.boolean(),
    statusPage: z.boolean(),
    referral: z.boolean(),
    multiTenancy: z.boolean(),
    apiDocs: z.boolean(),
    i18n: z.boolean(),
    abTesting: z.boolean(),
    onboarding: z.boolean(),
    admin: z.boolean(),
  }),
  pricing: z.object({
    type: z.enum(['freemium', 'subscription', 'one-time', 'usage-based']),
    tiers: z.array(z.object({
      name: z.string(),
      price: z.number(),
      interval: z.enum(['month', 'year', 'one-time']),
      features: z.array(z.string()),
      highlighted: z.boolean().optional(),
    })),
  }),
  content: z.object({
    tagline: z.string(),
    heroHeadline: z.string(),
    heroSubheadline: z.string(),
    features: z.array(z.object({
      title: z.string(),
      description: z.string(),
      icon: z.string().optional(),
    })),
    testimonials: z.array(z.object({
      quote: z.string(),
      author: z.string(),
      role: z.string(),
      company: z.string(),
      avatar: z.string().optional(),
    })),
    faqItems: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })),
    seoKeywords: z.array(z.string()),
    metaDescription: z.string(),
    privacyPolicy: z.string().optional(),
    termsOfService: z.string().optional(),
  }),
  marketResearch: z.object({
    ideaSummary: z.string(),
    marketValidation: z.object({
      score: z.number().min(1).max(10),
      verdict: z.enum(['strong', 'moderate', 'weak', 'saturated']),
      reasoning: z.string(),
    }),
    marketSize: z.string().optional(),
    targetAudience: z.array(z.string()),
    competitors: z.array(z.object({
      name: z.string(),
      url: z.string(),
      description: z.string(),
      pricing: z.string().optional(),
      features: z.array(z.string()),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
    })),
    opportunities: z.array(z.string()),
    risks: z.array(z.string()),
    featureIdeas: z.array(z.string()),
    recommendations: z.array(z.string()),
  }).optional(),
  discoveredIdea: z.object({
    id: z.string(),
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    problemSolved: z.string(),
    targetAudience: z.array(z.string()),
    coreFeatures: z.array(z.string()),
    marketOpportunity: z.object({
      score: z.number().min(1).max(10),
      verdict: z.enum(['strong', 'moderate', 'weak', 'saturated']),
      reasoning: z.string(),
      competitors: z.array(z.string()),
      gap: z.string(),
    }),
    difficulty: z.object({
      score: z.number().min(1).max(5),
      label: z.enum(['trivial', 'easy', 'moderate', 'challenging', 'complex']),
      reasoning: z.string(),
      estimatedHours: z.string(),
      aiStrengths: z.array(z.string()),
    }),
    marketing: z.object({
      primaryChannels: z.array(z.string()),
      launchStrategy: z.string(),
      estimatedCost: z.enum(['free', 'low', 'medium', 'high']),
      timeToFirstUsers: z.string(),
      tactics: z.array(z.object({
        channel: z.string(),
        approach: z.string(),
        expectedOutcome: z.string().optional(),
      })),
    }),
    income: z.object({
      model: z.enum(['subscription', 'freemium', 'one-time', 'usage-based']),
      suggestedPricing: z.string(),
      monthlyPotential: z.string(),
      timeToFirstRevenue: z.string().optional(),
    }),
    sources: z.array(z.string()),
  }).optional(),
  environment: z.object({
    clerkPublishableKey: z.string().optional(),
    clerkSecretKey: z.string().optional(),
    convexUrl: z.string().optional(),
    convexDeployKey: z.string().optional(),
    stripePublishableKey: z.string().optional(),
    stripeSecretKey: z.string().optional(),
    stripeWebhookSecret: z.string().optional(),
    sentryDsn: z.string().optional(),
    analyticsId: z.string().optional(),
    resendApiKey: z.string().optional(),
  }),
  createdAt: z.string(),
  saasfactoryVersion: z.string(),
});

// Helper to create default context
export function createDefaultContext(
  name: string,
  description: string,
): ProjectContext {
  const displayName = name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    name,
    displayName,
    description,
    saasType: 'b2b',
    features: {
      auth: true,
      database: true,
      payments: true,
      seo: true,
      analytics: 'posthog',
      email: true,
      legal: true,
      assets: true,
      waitlist: true,
      supportChat: false,
      featureFlags: false,
      changelog: false,
      statusPage: false,
      referral: false,
      multiTenancy: false,
      apiDocs: false,
      i18n: false,
      abTesting: false,
      onboarding: true,
      admin: false,
    },
    pricing: {
      type: 'freemium',
      tiers: [
        {
          name: 'Free',
          price: 0,
          interval: 'month',
          features: ['Basic features', 'Community support'],
        },
        {
          name: 'Pro',
          price: 19,
          interval: 'month',
          features: ['All Free features', 'Priority support', 'Advanced features'],
          highlighted: true,
        },
        {
          name: 'Enterprise',
          price: 99,
          interval: 'month',
          features: ['All Pro features', 'Dedicated support', 'Custom integrations'],
        },
      ],
    },
    content: {
      tagline: '',
      heroHeadline: '',
      heroSubheadline: '',
      features: [],
      testimonials: [],
      faqItems: [],
      seoKeywords: [],
      metaDescription: '',
    },
    environment: {},
    createdAt: new Date().toISOString(),
    saasfactoryVersion: '0.1.0',
  };
}

// Helper to convert feature string array to ProjectFeatures
export function mapSelectedFeatures(
  selectedFeatures: string[],
  analytics: AnalyticsProvider,
): Partial<ProjectFeatures> {
  return {
    analytics,
    waitlist: selectedFeatures.includes('waitlist'),
    supportChat: selectedFeatures.includes('support-chat'),
    featureFlags: selectedFeatures.includes('feature-flags'),
    changelog: selectedFeatures.includes('changelog'),
    statusPage: selectedFeatures.includes('status-page'),
    referral: selectedFeatures.includes('referral'),
    multiTenancy: selectedFeatures.includes('multi-tenancy'),
    apiDocs: selectedFeatures.includes('api-docs'),
    i18n: selectedFeatures.includes('i18n'),
    abTesting: selectedFeatures.includes('ab-testing'),
    onboarding: selectedFeatures.includes('onboarding'),
    admin: selectedFeatures.includes('admin'),
  };
}
