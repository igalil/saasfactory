import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const CONFIG_DIR = path.join(os.homedir(), '.saasfactory');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

// Schema for user config
const UserConfigSchema = z.object({
  defaults: z.object({
    packageManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).default('npm'),
    analytics: z.enum(['plausible', 'posthog', 'none']).default('plausible'),
    emailProvider: z.enum(['resend', 'sendgrid']).default('resend'),
  }).default({}),
  templates: z.object({
    customPath: z.string().optional(),
  }).default({}),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;

// Schema for credentials
const CredentialsSchema = z.object({
  githubToken: z.string().optional(),
  vercelToken: z.string().optional(),
  googleApiKey: z.string().optional(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

// Ensure config directory exists
async function ensureConfigDir(): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
}

// Load user config
export async function loadConfig(): Promise<UserConfig> {
  await ensureConfigDir();

  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const data = await fs.readJson(CONFIG_FILE);
      return UserConfigSchema.parse(data);
    }
  } catch {
    // If parsing fails, return default config
  }

  return UserConfigSchema.parse({});
}

// Save user config
export async function saveConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}

// Load credentials
export async function loadCredentials(): Promise<Credentials> {
  await ensureConfigDir();

  try {
    if (await fs.pathExists(CREDENTIALS_FILE)) {
      const data = await fs.readJson(CREDENTIALS_FILE);
      return CredentialsSchema.parse(data);
    }
  } catch {
    // If parsing fails, return empty credentials
  }

  return {};
}

// Save credentials
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await ensureConfigDir();
  // Set restrictive permissions on credentials file
  await fs.writeJson(CREDENTIALS_FILE, credentials, { spaces: 2, mode: 0o600 });
}

// Update specific credential
export async function updateCredential(
  key: keyof Credentials,
  value: string,
): Promise<void> {
  const credentials = await loadCredentials();
  credentials[key] = value;
  await saveCredentials(credentials);
}

// Check if a credential exists and is non-empty
export async function hasCredential(key: keyof Credentials): Promise<boolean> {
  const credentials = await loadCredentials();
  return !!credentials[key];
}

// Get config directory path (for debugging)
export function getConfigDir(): string {
  return CONFIG_DIR;
}

// Reset all config (for testing)
export async function resetConfig(): Promise<void> {
  await fs.remove(CONFIG_DIR);
}
