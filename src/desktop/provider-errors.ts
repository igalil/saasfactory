import type { ProviderId } from "./shared.js";

export type ProviderFailureCode =
  | "auth"
  | "quota"
  | "model"
  | "network"
  | "timeout"
  | "cancelled"
  | "invalid_output"
  | "runtime"
  | "configuration"
  | "unknown";

export class ProviderFailure extends Error {
  constructor(
    readonly code: ProviderFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderFailure";
  }
}

/** Never send SDK command lines, credentials, or echoed idea prompts to the UI/log. */
export function providerFailure(
  provider: ProviderId,
  error: unknown,
): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  const name = {
    codex: "Codex",
    claude: "Claude",
    cursor: "Cursor",
    xai: "Grok",
  }[provider];
  const detail = error instanceof Error ? error.message : String(error);
  const kind = error instanceof Error ? error.name : "";
  if (/AbortError/.test(kind) || /aborted|cancelled|canceled/i.test(detail))
    return new ProviderFailure(
      "cancelled",
      `${name} check or sign-in stopped. Your ideas are saved.`,
    );
  if (/TimeoutError/.test(kind) || /timed?\s?out|ETIMEDOUT/i.test(detail))
    return new ProviderFailure(
      "timeout",
      `${name} did not respond in time. Check your connection, then try again.`,
    );
  if (
    /rate.?limit|usage.?limit|quota|429|billing_error|credit|overage|account_on_hold/i.test(
      detail,
    )
  )
    return new ProviderFailure(
      "quota",
      `${name} reports an account or usage limit. Check your plan and reset time with the provider before retrying. SaasFactory will not switch to API billing.`,
    );
  if (
    /auth|unauthorized|401|403|log.?in|sign.?in|expired.?token|verification_required|oauth_org_not_allowed/i.test(
      detail,
    )
  )
    return new ProviderFailure(
      "auth",
      `${name} could not verify your subscription login. Reconnect this account in Settings & connections.`,
    );
  if (
    /model_not_found|model.{0,50}(unavailable|not found|not supported|invalid|does not exist)|invalid.{0,20}model/i.test(
      detail,
    )
  )
    return new ProviderFailure(
      "model",
      `${name} cannot use the selected model. Clear the model override in Settings or choose a model supported by your account.`,
    );
  if (
    /structured.?output|json.?schema|invalid.*schema|max_output_tokens|error_max_turns/i.test(
      detail,
    )
  )
    return new ProviderFailure(
      "invalid_output",
      `${name} could not finish a complete report. Your idea and previous reports are safe; try again with a supported model.`,
    );
  if (/ENOENT|EACCES|not installed|executable|spawn/i.test(detail))
    return new ProviderFailure(
      "runtime",
      `${name}'s bundled agent could not start. Reopen SaasFactory; if it persists, reinstall the app.`,
    );
  if (
    /network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|unavailable|overloaded|server_error|502|503|504/i.test(
      detail,
    )
  )
    return new ProviderFailure(
      "network",
      `${name} is temporarily unreachable. Check your connection or the provider's status, then try again.`,
    );
  return new ProviderFailure(
    "unknown",
    `${name} could not complete this request. Check your connection, account access, and selected model, then retry. Your ideas are saved.`,
  );
}
