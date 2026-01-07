import { describe, it, expect } from 'vitest';
import {
  createDefaultContext,
  mapSelectedFeatures,
  ProjectContextSchema,
} from '../src/core/context.js';

describe('context', () => {
  describe('createDefaultContext', () => {
    it('creates context with basic info', () => {
      const context = createDefaultContext('my-app', 'A test SaaS application');

      expect(context.name).toBe('my-app');
      expect(context.displayName).toBe('My App');
      expect(context.description).toBe('A test SaaS application');
    });

    it('handles kebab-case names correctly', () => {
      const context = createDefaultContext('my-awesome-app', 'Description');

      expect(context.name).toBe('my-awesome-app');
      expect(context.displayName).toBe('My Awesome App');
    });

    it('sets default values', () => {
      const context = createDefaultContext('test', 'Test app description for validation');

      expect(context.saasType).toBe('b2b');
      expect(context.pricing.type).toBe('freemium');
      expect(context.features.auth).toBe(true);
      expect(context.features.analytics).toBe('posthog');
    });

    it('sets default pricing tiers', () => {
      const context = createDefaultContext('test', 'Test app');

      expect(context.pricing.tiers).toHaveLength(3);
      expect(context.pricing.tiers[0].name).toBe('Free');
      expect(context.pricing.tiers[1].name).toBe('Pro');
      expect(context.pricing.tiers[2].name).toBe('Enterprise');
    });

    it('sets createdAt timestamp', () => {
      const before = new Date().toISOString();
      const context = createDefaultContext('test', 'Test app');
      const after = new Date().toISOString();

      expect(context.createdAt >= before).toBe(true);
      expect(context.createdAt <= after).toBe(true);
    });
  });

  describe('ProjectContextSchema validation', () => {
    it('validates a correct context', () => {
      const context = createDefaultContext('valid-app', 'A valid description that is long enough');
      const result = ProjectContextSchema.safeParse(context);

      expect(result.success).toBe(true);
    });

    it('rejects invalid name with spaces', () => {
      const context = createDefaultContext('invalid app', 'Valid description text');
      const result = ProjectContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });

    it('rejects short description', () => {
      const context = createDefaultContext('my-app', 'Short');
      const result = ProjectContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });

    it('rejects invalid saasType', () => {
      const context = createDefaultContext('my-app', 'A valid long description') as Record<string, unknown>;
      context.saasType = 'invalid';
      const result = ProjectContextSchema.safeParse(context);

      expect(result.success).toBe(false);
    });
  });

  describe('mapSelectedFeatures', () => {
    it('maps feature selections correctly', () => {
      const features = mapSelectedFeatures(
        ['waitlist', 'onboarding', 'admin'],
        'posthog',
      );

      expect(features.waitlist).toBe(true);
      expect(features.onboarding).toBe(true);
      expect(features.admin).toBe(true);
      expect(features.analytics).toBe('posthog');
      expect(features.changelog).toBe(false);
    });

    it('handles empty features', () => {
      const features = mapSelectedFeatures([], 'none');

      expect(features.waitlist).toBe(false);
      expect(features.admin).toBe(false);
      expect(features.analytics).toBe('none');
    });

    it('handles kebab-case feature names', () => {
      const features = mapSelectedFeatures(
        ['support-chat', 'feature-flags', 'multi-tenancy', 'api-docs', 'ab-testing', 'status-page'],
        'posthog',
      );

      expect(features.supportChat).toBe(true);
      expect(features.featureFlags).toBe(true);
      expect(features.multiTenancy).toBe(true);
      expect(features.apiDocs).toBe(true);
      expect(features.abTesting).toBe(true);
      expect(features.statusPage).toBe(true);
    });
  });
});
