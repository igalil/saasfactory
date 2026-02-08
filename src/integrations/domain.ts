import { loadCredentials } from '../core/config.js';

const VERCEL_API_BASE = 'https://api.vercel.com';

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  price?: {
    registration: number;
    renewal: number;
    currency: string;
  };
}

export interface BulkAvailabilityResult {
  domain: string;
  available: boolean;
}

export interface DomainPriceResult {
  years: number;
  purchasePrice: number;
  renewalPrice: number;
  transferPrice: number;
}

/**
 * Check if a Vercel token is configured (non-throwing check)
 */
export async function hasVercelToken(): Promise<boolean> {
  const credentials = await loadCredentials();
  return !!credentials.vercelToken;
}

/**
 * Get the Vercel auth header, throwing if no token is configured
 */
async function getVercelHeaders(): Promise<Record<string, string>> {
  const credentials = await loadCredentials();

  if (!credentials.vercelToken) {
    throw new Error(
      'MISCONFIGURED: No Vercel token found. Run `saasfactory config` to set your Vercel token.',
    );
  }

  return {
    Authorization: `Bearer ${credentials.vercelToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Check single domain availability via Vercel Registrar API
 * GET /v1/registrar/domains/{domain}/availability
 */
export async function checkDomainAvailability(
  domain: string,
): Promise<DomainCheckResult> {
  const headers = await getVercelHeaders();

  const response = await fetch(
    `${VERCEL_API_BASE}/v1/registrar/domains/${encodeURIComponent(domain)}/availability`,
    { headers },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vercel API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { available: boolean };

  const result: DomainCheckResult = {
    domain,
    available: data.available,
  };

  // Fetch pricing if available
  if (data.available) {
    const price = await getDomainPrice(domain);
    if (price) {
      result.price = {
        registration: price.purchasePrice,
        renewal: price.renewalPrice,
        currency: 'USD',
      };
    }
  }

  return result;
}

/**
 * Check bulk domain availability via Vercel Registrar API
 * POST /v1/registrar/domains/availability (max 50 domains)
 */
export async function checkBulkAvailability(
  domains: string[],
): Promise<BulkAvailabilityResult[]> {
  const headers = await getVercelHeaders();

  // API limit is 50 domains per request
  const batch = domains.slice(0, 50);

  const response = await fetch(
    `${VERCEL_API_BASE}/v1/registrar/domains/availability`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ domains: batch }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vercel API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    results: Array<{ domain: string; available: boolean }>;
  };

  return data.results;
}

/**
 * Get domain pricing via Vercel Registrar API
 * GET /v1/registrar/domains/{domain}/price
 */
export async function getDomainPrice(
  domain: string,
): Promise<DomainPriceResult | null> {
  const headers = await getVercelHeaders();

  try {
    const response = await fetch(
      `${VERCEL_API_BASE}/v1/registrar/domains/${encodeURIComponent(domain)}/price`,
      { headers },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      years: number;
      purchasePrice: number | string;
      renewalPrice: number | string;
      transferPrice: number | string;
    };

    return {
      years: data.years,
      purchasePrice: typeof data.purchasePrice === 'string' ? parseFloat(data.purchasePrice) : data.purchasePrice,
      renewalPrice: typeof data.renewalPrice === 'string' ? parseFloat(data.renewalPrice) : data.renewalPrice,
      transferPrice: typeof data.transferPrice === 'string' ? parseFloat(data.transferPrice) : data.transferPrice,
    };
  } catch {
    return null;
  }
}
