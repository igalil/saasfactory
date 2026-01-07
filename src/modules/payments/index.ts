import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, ensureDir } from '../../utils/file-system.js';

/**
 * Generate Stripe payments setup
 */
export async function generatePayments(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  // Generate lib/stripe.ts
  await generateStripeLib(projectPath);

  // Generate Stripe webhook handler
  await ensureDir(path.join(projectPath, 'app', 'api', 'webhooks', 'stripe'));
  await generateStripeWebhook(projectPath);

  // Generate checkout API route
  await ensureDir(path.join(projectPath, 'app', 'api', 'checkout'));
  await generateCheckoutRoute(projectPath);

  // Generate billing portal API route
  await ensureDir(path.join(projectPath, 'app', 'api', 'billing'));
  await generateBillingPortalRoute(projectPath);

  // Generate pricing page
  await ensureDir(path.join(projectPath, 'app', '(marketing)', 'pricing'));
  await generatePricingPage(context, projectPath);

  // Generate pricing components
  await generatePricingCard(projectPath);
}

async function generateStripeLib(projectPath: string): Promise<void> {
  const stripeLib = `import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const STRIPE_PLANS = {
  free: {
    name: 'Free',
    description: 'For individuals getting started',
    price: 0,
    priceId: null,
    features: ['Basic features', 'Community support', '1 project'],
  },
  pro: {
    name: 'Pro',
    description: 'For professionals and small teams',
    price: 19,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      'All Free features',
      'Priority support',
      'Unlimited projects',
      'Advanced analytics',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations',
    price: 99,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      'All Pro features',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'Team management',
    ],
  },
} as const;

export type PlanKey = keyof typeof STRIPE_PLANS;

export function getPlanFromPriceId(priceId: string): PlanKey | null {
  for (const [key, plan] of Object.entries(STRIPE_PLANS)) {
    if (plan.priceId === priceId) {
      return key as PlanKey;
    }
  }
  return null;
}
`;

  await writeFile(path.join(projectPath, 'lib', 'stripe.ts'), stripeLib);
}

async function generateStripeWebhook(projectPath: string): Promise<void> {
  const webhook = `import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type Stripe from 'stripe';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        console.log(\`Unhandled event type: \${event.type}\`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  await convex.mutation(api.subscriptions.createSubscription, {
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0]?.price.id ?? '',
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start * 1000,
    currentPeriodEnd: subscription.current_period_end * 1000,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await convex.mutation(api.subscriptions.updateSubscription, {
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start * 1000,
    currentPeriodEnd: subscription.current_period_end * 1000,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await convex.mutation(api.subscriptions.cancelSubscription, {
    stripeSubscriptionId: subscription.id,
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Handle successful payment (e.g., send confirmation email)
  console.log('Invoice payment succeeded:', invoice.id);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Handle failed payment (e.g., send notification)
  console.log('Invoice payment failed:', invoice.id);
}
`;

  await writeFile(
    path.join(projectPath, 'app', 'api', 'webhooks', 'stripe', 'route.ts'),
    webhook
  );
}

async function generateCheckoutRoute(projectPath: string): Promise<void> {
  const checkout = `import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { priceId } = await req.json();

    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID is required' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true\`,
      cancel_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true\`,
      metadata: {
        userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
`;

  await writeFile(
    path.join(projectPath, 'app', 'api', 'checkout', 'route.ts'),
    checkout
  );
}

async function generateBillingPortalRoute(projectPath: string): Promise<void> {
  const billingPortal = `import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's subscription from Convex
    const subscription = await convex.query(api.subscriptions.getSubscription);

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings\`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}
`;

  await writeFile(
    path.join(projectPath, 'app', 'api', 'billing', 'route.ts'),
    billingPortal
  );
}

async function generatePricingPage(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const page = `import { PricingCard } from '@/components/marketing/pricing-card';
import { STRIPE_PLANS } from '@/lib/stripe';

export const metadata = {
  title: 'Pricing - ${context.displayName}',
  description: 'Choose the plan that fits your needs',
};

export default function PricingPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-primary">
            Pricing
          </h2>
          <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Choose the right plan for you
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-muted-foreground">
          Start free and scale as you grow. All plans include a 14-day free trial.
        </p>

        <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8">
          {Object.entries(STRIPE_PLANS).map(([key, plan]) => (
            <PricingCard
              key={key}
              name={plan.name}
              description={plan.description}
              price={plan.price}
              priceId={plan.priceId}
              features={plan.features}
              highlighted={key === 'pro'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'app', '(marketing)', 'pricing', 'page.tsx'),
    page
  );
}

async function generatePricingCard(projectPath: string): Promise<void> {
  const card = `'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  name: string;
  description: string;
  price: number;
  priceId: string | null;
  features: string[];
  highlighted?: boolean;
}

export function PricingCard({
  name,
  description,
  price,
  priceId,
  features,
  highlighted = false,
}: PricingCardProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!isSignedIn) {
      router.push('/sign-up');
      return;
    }

    if (!priceId) {
      router.push('/dashboard');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className={cn(
        'flex flex-col',
        highlighted && 'border-primary shadow-lg ring-1 ring-primary'
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{name}</CardTitle>
          {highlighted && <Badge>Popular</Badge>}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mt-2 flex items-baseline gap-x-2">
          <span className="text-5xl font-bold tracking-tight">
            \${price}
          </span>
          {price > 0 && (
            <span className="text-sm font-semibold leading-6 tracking-wide text-muted-foreground">
              /month
            </span>
          )}
        </div>
        <ul className="mt-8 space-y-3 text-sm leading-6">
          {features.map((feature) => (
            <li key={feature} className="flex gap-x-3">
              <Check className="h-6 w-5 flex-none text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full"
          variant={highlighted ? 'default' : 'outline'}
        >
          {loading ? 'Loading...' : price === 0 ? 'Get started' : 'Subscribe'}
        </Button>
      </CardFooter>
    </Card>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'components', 'marketing', 'pricing-card.tsx'),
    card
  );
}
