# Provider account integrations

Official documentation checked September 23, 2026. These are current provider capabilities, not a guarantee that a plan will remain unchanged.

| Provider | Source | Implication |
| --- | --- | --- |
| Claude | [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) | The announced separate SDK pricing change was paused; the article describes SDK/headless/third-party use under subscription limits. Use account authentication and respect extra-usage settings. |
| Codex | [Codex SDK](https://developers.openai.com/codex/sdk/) and [authentication](https://developers.openai.com/codex/auth/) | The official TypeScript SDK wraps Codex; ChatGPT account sign-in is distinct from API-key billing. Force ChatGPT mode and reject API-key sessions. |
| Cursor | [TypeScript SDK](https://cursor.com/docs/sdk/typescript) | Official local/cloud SDK supports user browser login. User keys consume the user's plan pools under Cursor rules; team/service keys differ. No claim of unlimited usage. |
| Grok / SpaceXAI | [xAI developer quickstart](https://docs.x.ai/developers/quickstart) | Documented SDK usage requires developer API credentials/credits. No verified consumer subscription route was found, so this adapter is unavailable. |

## Implementation choices

- Claude/Codex sign in separately for SaasFactory under `userData/providers`. This avoids inheriting unrelated project settings, hooks, MCP servers, or API-key sessions from the user's coding environment.
- Provider subprocess environments allow essential OS/path variables but omit API keys, custom endpoints, and runtime injection variables.
- SDK-supplied native Claude/Codex runtimes are preferred and unpacked from ASAR. Optional platform packages must be included in distribution builds. PATH fallback exists for installations lacking them.
- Cursor uses `Cursor.auth.login()` and `FileCredentialStore`, not the editor's session or an inherited `CURSOR_API_KEY`. Its user credential store is managed by Cursor. Local research uses no external MCP servers and only the selected tool list.
- Provider readiness means login detection, not verified quota, eligible model, or current billing state. Errors from exhausted quotas and unavailable models are surfaced without changing providers or auth methods.
- The app limits concurrent jobs and elapsed time, but a request already processed by the provider may consume usage even when cancelled.
- Native sign-in explicitly requests Claude account authentication or forces ChatGPT mode, then verifies subscription login. It is cancellable and bounded to three minutes. Disconnect uses app-specific Claude/Codex logout or Cursor’s shared SDK logout. Cursor logout forgets the local SDK key; it does not revoke the key at the provider.
- Custom Cursor endpoint overrides and stored nonproduction credentials are refused before a key can be sent. Explicit stored user keys prevent ambient team/API keys from taking precedence.
- Claude and Codex receive a structural output schema derived from the report contract. Claude’s `structured_output` is the authoritative result; Codex must finish its turn. All providers still pass local Zod validation. Errors are categorized and sanitized before display/storage.
- Codex subscription quick and deep execution passed live acceptance on September 23, 2026. Claude and Cursor still need live account-specific acceptance. Automated adapter tests use controlled SDK responses and do not charge an account. See [verification details](VERIFICATION.md).

No reverse-engineered web sessions, cookie extraction, token resale, or account-pool workaround is used.

## Codex task selection

Following [OpenAI’s model guidance](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna), the desktop defaults to Luna/High for bounded first impressions, Sol/Medium for normal market research, and Astra/High for an explicit challenge of an existing current-version report. Astra/High is an application choice for examining multiple sources and tradeoffs. No Max/Ultra or automatic subagent escalation is requested.

Per-task model choices are visible before a run, configurable in Settings, and retained with new reports and Markdown exports. Legacy global overrides migrate to quick/research choices without overwriting the user’s preference. Historical reports do not receive guessed model labels. A model-access failure remains a failed run; the app does not retry with another model or billing route.

[Codex subscription/credit guidance](https://learn.chatgpt.com/docs/pricing) explains that models, reasoning, context, tools, and caching affect usage. API token prices are not a measure of the user’s included subscription allowance. Standard speed remains the default.
