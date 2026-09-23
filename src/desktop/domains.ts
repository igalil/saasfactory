import {
  checkDomainAvailability,
  hasVercelToken,
} from "../integrations/domain.js";
import { DomainName, type DomainResult } from "./shared.js";

const registries: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  org: "https://rdap.publicinterestregistry.org/rdap/domain/",
};

export async function checkDomain(input: string): Promise<DomainResult> {
  const domain = DomainName.parse(input);
  const checkedAt = new Date().toISOString();
  try {
    if (await hasVercelToken()) {
      const result = await checkDomainAvailability(domain);
      return {
        domain,
        checkedAt,
        status: result.available ? "available" : "registered",
        detail:
          "Checked with Vercel Registrar. Availability and pricing may change before checkout.",
        ...(result.price ? { price: result.price } : {}),
      };
    }
    const endpoint = registries[domain.split(".").at(-1) ?? ""];
    if (endpoint) {
      const response = await fetch(endpoint + encodeURIComponent(domain), {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/rdap+json" },
      });
      if (response.ok)
        return {
          domain,
          checkedAt,
          status: "registered",
          detail: "A domain registration exists in the registry (RDAP).",
        };
      if (response.status === 404)
        return {
          domain,
          checkedAt,
          status: "unknown",
          detail:
            "No registry record found. It may be available, reserved, or premium. Confirm with a registrar.",
        };
    }
    return {
      domain,
      checkedAt,
      status: "unknown",
      detail:
        "Registrar confirmation needed. Configure a Vercel token with the existing saasfactory config command for availability and prices.",
    };
  } catch {
    return {
      domain,
      checkedAt,
      status: "unknown",
      detail:
        "The lookup could not be completed. Try again or check directly with a registrar.",
    };
  }
}
