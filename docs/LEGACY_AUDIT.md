# Original project review

The original product was a terminal wizard, not a running SaaS or desktop interface. It combined opportunity discovery and validation with generation/deployment of a Next.js/Convex/Clerk/Stripe starter project.

## Kept

- Idea discovery from a sector or rough idea, refinement, name suggestions, and contextual project analysis.
- Streaming Claude CLI research in quick/full/URL modes, terminal research summaries, Markdown reports, and session metadata for follow-up questions.
- Vercel domain availability/pricing, credential configuration, Git/GitHub integration, Vercel deployment, and project-generation modules.
- Existing context, filesystem, and error tests.

The desktop reuses the registrar integration. Its lifecycle and report contract are new because the terminal wizard was tightly coupled to project generation and did not have durable multi-idea storage, cancellation state, a fast capture inbox, or multiple official SDK providers.

## Corrected during the desktop work

- Existing strict TypeScript failures involving optional fields, indexed values, and an out-of-scope progress interval.
- Discovery passed a Claude result object to a string parser; it now extracts the response text correctly.
- Failed discovery returned two plausible sample ideas. It now returns an empty result and communicates the failure.
- Failed competition research received a middling score and a moderate verdict. It now reports unproven/unrated and does not recommend proceeding.
- Missing discovery pricing and revenue values no longer receive invented dollar defaults.
- Registrar calls now have network timeouts.
- Documentation claiming generated projects were production-ready has been removed.

## Preserved but not finalized here

The code-generation templates are an experimental older feature. The desktop does not call them automatically. A separate generated-project integration pass is needed before marketing them as deployable software:

- The base landing page and dashboard route-group template can both produce `/`; route ownership needs reconciliation.
- Generated Convex user/subscription functions and payment/auth webhook flows require a complete authorization and identity review.
- Landing/SEO templates include placeholder testimonials, customer counts, ratings, and claims that must be removed or replaced with real evidence before publishing.
- Selected product features do not all have corresponding implemented application behavior.
- Generated Clerk/Stripe/Convex services need real credentials, migrations/configuration, webhook verification, and end-to-end deployment tests.
- Legacy Claude execution inherits the user's CLI configuration. The stricter desktop account/tool boundary is not a retroactive guarantee for the CLI.

These modules remain available so existing work is not discarded. They are not represented as finished functionality in the desktop product.
