# SaasFactory

CLI tool that generates production-ready SaaS boilerplates using Claude AI.

```
  ███████╗ █████╗  █████╗ ███████╗
  ██╔════╝██╔══██╗██╔══██╗██╔════╝
  ███████╗███████║███████║███████╗
  ╚════██║██╔══██║██╔══██║╚════██║
  ███████║██║  ██║██║  ██║███████║
  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

  ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗
  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝
  █████╗  ███████║██║        ██║   ██║   ██║██████╔╝ ╚████╔╝
  ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝
  ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║
  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝
```

## Features

- **AI-Powered Generation** - Uses Claude Code CLI to generate marketing content, legal docs, and more
- **Full Stack** - Next.js 16+ with App Router, Convex database, Clerk auth, Stripe payments
- **Modern UI** - shadcn/ui components with Tailwind CSS
- **Production Ready** - Security headers, SEO optimization, PostHog analytics
- **One Command Deploy** - GitHub repo creation and Vercel deployment built-in

## Quick Start

```bash
npx saasfactory create my-app
```

Or run interactively:

```bash
npx saasfactory
```

## Requirements

- Node.js 20+
- [Claude Code CLI](https://claude.ai/code) (optional, for AI features)
- Git

## Commands

### `create [name]`

Create a new SaaS project interactively.

```bash
saasfactory create my-app
```

Options:
- `-y, --yes` - Skip confirmations
- `--skip-ai` - Skip AI content generation
- `--skip-git` - Skip git initialization
- `--skip-github` - Skip GitHub repo creation
- `--private` - Make GitHub repo private

### `config`

Configure API keys and credentials.

```bash
saasfactory config
```

Stores credentials in `~/.saasfactory/credentials.json` with restricted permissions.

### `domain <name>`

Check domain availability and get suggestions.

```bash
saasfactory domain myapp
saasfactory domain myapp.io --suggest
```

### `deploy [directory]`

Deploy project to Vercel.

```bash
saasfactory deploy
saasfactory deploy ./my-app --prod
```

## Generated Project Structure

```
my-app/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Landing page
│   ├── (marketing)/
│   │   ├── pricing/page.tsx    # Stripe pricing
│   │   ├── about/page.tsx
│   │   └── privacy/page.tsx
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Authenticated layout
│   │   ├── page.tsx            # Dashboard home
│   │   └── settings/page.tsx
│   └── api/webhooks/
│       ├── stripe/route.ts
│       └── clerk/route.ts
├── convex/
│   ├── schema.ts               # Database schema
│   ├── auth.config.ts
│   └── [domain].ts
├── components/
│   ├── ui/                     # shadcn components
│   ├── marketing/
│   └── dashboard/
├── lib/
│   ├── convex.ts
│   ├── stripe.ts
│   └── utils.ts
├── emails/                     # React Email templates
├── public/
│   ├── logo.svg
│   ├── favicon.ico
│   └── og-image.png
└── .env.local
```

## Tech Stack

### Generated Projects
| Component | Technology |
|-----------|------------|
| Framework | Next.js 16+ (App Router) |
| Database | Convex |
| Auth | Clerk |
| Payments | Stripe |
| UI | shadcn/ui + Tailwind CSS |
| Analytics | PostHog |
| Email | React Email + Resend |
| Hosting | Vercel |

### SaasFactory CLI
| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| CLI | Commander.js + Inquirer.js |
| AI | Claude Code CLI |
| Templates | EJS |

## Configuration

### API Keys

Run `saasfactory config` to set up:

- **GitHub Token** - For automatic repo creation
- **Vercel Token** - For deployment
- **Google API Key** - For logo generation (Gemini 2.0 Flash)
- **Namecheap API** - For domain availability checking

### Claude Code

SaasFactory uses your Claude Code subscription (not API billing) for AI features. Install from https://claude.ai/code

## Security

Generated projects include:
- Security headers (CSP, X-Frame-Options, etc.)
- Input validation with Zod
- Environment variables for secrets
- Pre-commit hooks for secret detection
- CSRF protection
- Rate limiting setup

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

## License

MIT
