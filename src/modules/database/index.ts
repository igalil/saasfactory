import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile } from '../../utils/file-system.js';

/**
 * Generate Convex database setup
 */
export async function generateDatabase(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate auth.config.ts for Clerk integration
  await generateAuthConfig(projectPath);

  // Generate schema.ts
  await generateSchema(context, projectPath);

  // Generate users queries/mutations
  await generateUsersModule(projectPath);

  // Generate subscriptions module
  if (context.features.payments) {
    await generateSubscriptionsModule(projectPath);
  }
}

async function generateAuthConfig(projectPath: string): Promise<void> {
  const config = `export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
`;

  await writeFile(path.join(projectPath, 'convex', 'auth.config.ts'), config);
}

async function generateSchema(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  let schema = `import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_id', ['clerkId'])
    .index('by_email', ['email']),
`;

  if (context.features.payments) {
    schema += `
  subscriptions: defineTable({
    userId: v.id('users'),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    status: v.string(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_stripe_customer_id', ['stripeCustomerId'])
    .index('by_stripe_subscription_id', ['stripeSubscriptionId']),
`;
  }

  if (context.features.waitlist) {
    schema += `
  waitlist: defineTable({
    email: v.string(),
    referralCode: v.optional(v.string()),
    referredBy: v.optional(v.string()),
    position: v.number(),
    joinedAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_referral_code', ['referralCode']),
`;
  }

  schema += `});
`;

  await writeFile(path.join(projectPath, 'convex', 'schema.ts'), schema);
}

async function generateUsersModule(projectPath: string): Promise<void> {
  const users = `import { v } from 'convex/values';
import { mutation, query, QueryCtx, MutationCtx } from './_generated/server';

export const getUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    return user;
  },
});

export const getUserById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const createOrUpdateUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    const now = Date.now();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
        updatedAt: now,
      });
      return existingUser._id;
    }

    return await ctx.db.insert('users', {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteUser = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

// Helper function to get current user (for use in other mutations)
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
    .unique();
}
`;

  await writeFile(path.join(projectPath, 'convex', 'users.ts'), users);
}

async function generateSubscriptionsModule(projectPath: string): Promise<void> {
  const subscriptions = `import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUser } from './users';

export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query('subscriptions')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .unique();
  },
});

export const createSubscription = mutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('User not found');

    const now = Date.now();

    // Check for existing subscription
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('subscriptions', {
      userId: user._id,
      ...args,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSubscription = mutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: v.string(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_subscription_id', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId)
      )
      .unique();

    if (!subscription) throw new Error('Subscription not found');

    await ctx.db.patch(subscription._id, {
      status: args.status,
      ...(args.currentPeriodStart && {
        currentPeriodStart: args.currentPeriodStart,
      }),
      ...(args.currentPeriodEnd && { currentPeriodEnd: args.currentPeriodEnd }),
      ...(args.cancelAtPeriodEnd !== undefined && {
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      }),
      updatedAt: Date.now(),
    });
  },
});

export const cancelSubscription = mutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_subscription_id', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId)
      )
      .unique();

    if (!subscription) throw new Error('Subscription not found');

    await ctx.db.patch(subscription._id, {
      status: 'canceled',
      cancelAtPeriodEnd: true,
      updatedAt: Date.now(),
    });
  },
});

// Helper to check if user has active subscription
export const hasActiveSubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .unique();

    if (!subscription) return false;

    return (
      subscription.status === 'active' ||
      subscription.status === 'trialing'
    );
  },
});
`;

  await writeFile(path.join(projectPath, 'convex', 'subscriptions.ts'), subscriptions);
}
