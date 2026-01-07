import { loadCredentials } from '../core/config.js';

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  premium: boolean;
  price?: {
    registration: number;
    renewal: number;
    currency: string;
  };
}

export interface DomainSuggestion {
  domain: string;
  available: boolean;
}

/**
 * Check domain availability using Namecheap API
 */
export async function checkDomainAvailability(
  domain: string
): Promise<DomainCheckResult> {
  const credentials = await loadCredentials();

  if (!credentials.namecheapApiKey || !credentials.namecheapUsername) {
    // Fallback: Use a simple DNS check
    return checkDomainWithDNS(domain);
  }

  try {
    const apiUser = credentials.namecheapUsername;
    const apiKey = credentials.namecheapApiKey;
    const clientIp = await getPublicIP();

    const params = new URLSearchParams({
      ApiUser: apiUser,
      ApiKey: apiKey,
      UserName: apiUser,
      ClientIp: clientIp,
      Command: 'namecheap.domains.check',
      DomainList: domain,
    });

    const response = await fetch(
      `https://api.namecheap.com/xml.response?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.statusText}`);
    }

    const text = await response.text();

    // Parse XML response
    const availableMatch = text.match(/Available="(\w+)"/);
    const premiumMatch = text.match(/IsPremiumName="(\w+)"/);

    const available = availableMatch?.[1]?.toLowerCase() === 'true';
    const premium = premiumMatch?.[1]?.toLowerCase() === 'true';

    // Get pricing if available
    let price: DomainCheckResult['price'];
    if (available) {
      price = await getDomainPrice(domain, {
        namecheapApiKey: credentials.namecheapApiKey,
        namecheapUsername: credentials.namecheapUsername,
      });
    }

    const result: DomainCheckResult = {
      domain,
      available,
      premium,
    };
    if (price) {
      result.price = price;
    }
    return result;
  } catch (error) {
    console.warn('Namecheap API failed, using DNS fallback:', error);
    return checkDomainWithDNS(domain);
  }
}

/**
 * Fallback domain check using DNS lookup
 */
async function checkDomainWithDNS(domain: string): Promise<DomainCheckResult> {
  try {
    // Try to resolve the domain - if it fails, domain might be available
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const data = (await response.json()) as { Answer?: unknown[] };

    // If there's an answer, domain is taken
    const available = !data.Answer || data.Answer.length === 0;

    return {
      domain,
      available,
      premium: false,
      // Can't get pricing without Namecheap API
    };
  } catch {
    // If DNS lookup fails, assume domain might be available
    return {
      domain,
      available: true,
      premium: false,
    };
  }
}

/**
 * Get domain pricing from Namecheap
 */
async function getDomainPrice(
  domain: string,
  credentials: { namecheapApiKey?: string; namecheapUsername?: string }
): Promise<DomainCheckResult['price'] | undefined> {
  if (!credentials.namecheapApiKey || !credentials.namecheapUsername) {
    return undefined;
  }

  try {
    const tld = domain.split('.').pop() || 'com';
    const clientIp = await getPublicIP();

    const params = new URLSearchParams({
      ApiUser: credentials.namecheapUsername,
      ApiKey: credentials.namecheapApiKey,
      UserName: credentials.namecheapUsername,
      ClientIp: clientIp,
      Command: 'namecheap.users.getPricing',
      ProductType: 'DOMAIN',
      ProductCategory: 'DOMAINS',
      ProductName: tld,
    });

    const response = await fetch(
      `https://api.namecheap.com/xml.response?${params.toString()}`
    );

    if (!response.ok) return undefined;

    const text = await response.text();

    // Parse registration price
    const registerMatch = text.match(/register.*?Price="([\d.]+)"/i);
    const renewMatch = text.match(/renew.*?Price="([\d.]+)"/i);

    if (registerMatch) {
      return {
        registration: parseFloat(registerMatch[1] ?? '0'),
        renewal: parseFloat(renewMatch?.[1] ?? registerMatch[1] ?? '0'),
        currency: 'USD',
      };
    }
  } catch {
    // Pricing lookup failed
  }

  return undefined;
}

/**
 * Generate domain name suggestions based on project name
 */
export async function suggestDomains(
  projectName: string,
  description: string
): Promise<DomainSuggestion[]> {
  const baseName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tlds = ['com', 'io', 'co', 'app', 'dev', 'ai'];

  const suggestions: DomainSuggestion[] = [];

  // Generate variations
  const variations = [
    baseName,
    `get${baseName}`,
    `try${baseName}`,
    `use${baseName}`,
    `${baseName}app`,
    `${baseName}hq`,
  ];

  // Check availability for each variation + TLD combo
  for (const variation of variations) {
    for (const tld of tlds) {
      const domain = `${variation}.${tld}`;
      try {
        const result = await checkDomainAvailability(domain);
        suggestions.push({
          domain,
          available: result.available,
        });

        // Limit to prevent too many API calls
        if (suggestions.length >= 12) break;
      } catch {
        // Skip failed checks
      }
    }
    if (suggestions.length >= 12) break;
  }

  // Sort: available first, then by TLD preference
  return suggestions.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    const tldOrder = ['com', 'io', 'co', 'app', 'dev', 'ai'];
    const aTld = a.domain.split('.').pop() || '';
    const bTld = b.domain.split('.').pop() || '';
    return tldOrder.indexOf(aTld) - tldOrder.indexOf(bTld);
  });
}

/**
 * Get public IP for Namecheap API
 */
async function getPublicIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = (await response.json()) as { ip: string };
    return data.ip;
  } catch {
    return '127.0.0.1';
  }
}
