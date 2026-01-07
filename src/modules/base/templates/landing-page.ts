import type { ProjectContext } from '../../../core/context.js';

export function generateLandingPage(context: ProjectContext): string {
  const headline = context.content.heroHeadline || `Welcome to ${context.displayName}`;
  const subheadline = context.content.heroSubheadline || context.description;
  const tagline = context.content.tagline || 'The smarter way to work';

  return `import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Check, Zap, Shield, BarChart3, Users } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold">${context.displayName}</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="#features" className="transition-colors hover:text-foreground/80">
              Features
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-foreground/80">
              Pricing
            </Link>
            <Link href="/about" className="transition-colors hover:text-foreground/80">
              About
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="container flex flex-col items-center justify-center space-y-8 py-24 text-center md:py-32">
          <Badge variant="secondary" className="px-4 py-1">
            ${tagline}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            ${headline}
          </h1>
          <p className="max-w-[700px] text-lg text-muted-foreground sm:text-xl">
            ${subheadline}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            No credit card required. 14-day free trial.
          </p>
        </section>

        {/* Features Section */}
        <section id="features" className="container py-24 md:py-32">
          <div className="mx-auto max-w-[58rem] text-center">
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
              Everything you need to succeed
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Powerful features designed to help you work smarter, not harder.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Lightning Fast"
              description="Built for speed. Get things done in seconds, not minutes."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Secure by Default"
              description="Enterprise-grade security to keep your data safe."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Powerful Analytics"
              description="Gain insights with comprehensive dashboards and reports."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Team Collaboration"
              description="Work together seamlessly with your entire team."
            />
            <FeatureCard
              icon={<Check className="h-6 w-6" />}
              title="Easy Integration"
              description="Connect with your favorite tools in just a few clicks."
            />
            <FeatureCard
              icon={<ArrowRight className="h-6 w-6" />}
              title="Automation"
              description="Automate repetitive tasks and focus on what matters."
            />
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t bg-muted/50">
          <div className="container py-24 md:py-32">
            <div className="mx-auto max-w-[58rem] text-center">
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
                Ready to get started?
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Join thousands of users who are already using ${context.displayName}.
              </p>
              <div className="mt-8">
                <Link href="/sign-up">
                  <Button size="lg" className="gap-2">
                    Start Your Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ${context.displayName}. All rights reserved.
          </p>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-background p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
`;
}

export function generateDashboardPage(context: ProjectContext): string {
  return `import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, CreditCard, Activity } from 'lucide-react';

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button>Download Report</Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Revenue"
          value="$45,231.89"
          description="+20.1% from last month"
          icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Subscriptions"
          value="+2,350"
          description="+180.1% from last month"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Active Users"
          value="+12,234"
          description="+19% from last month"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Active Now"
          value="+573"
          description="+201 since last hour"
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[350px] flex items-center justify-center text-muted-foreground">
              Chart placeholder - integrate with your preferred charting library
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your recent transactions and events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center">
                  <div className="h-9 w-9 rounded-full bg-muted" />
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      Activity item {i}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Description of activity
                    </p>
                  </div>
                  <div className="ml-auto font-medium">+$XX.XX</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
`;
}

export function generateDashboardLayout(context: ProjectContext): string {
  return `import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
            <Link href="/dashboard" className="flex items-center space-x-2">
              <span className="text-xl font-bold">${context.displayName}</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r bg-muted/40">
          <nav className="flex flex-col gap-2 p-4">
            <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </NavLink>
            <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
              Settings
            </NavLink>
            <NavLink href="/dashboard/billing" icon={<CreditCard className="h-4 w-4" />}>
              Billing
            </NavLink>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:bg-muted"
    >
      {icon}
      {children}
    </Link>
  );
}
`;
}
