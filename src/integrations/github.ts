import { loadCredentials } from '../core/config.js';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  private: boolean;
}

interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

/**
 * Check if GitHub token is configured and valid
 */
export async function isGitHubConfigured(): Promise<boolean> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) return false;

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${credentials.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get authenticated GitHub user
 */
export async function getGitHubUser(): Promise<{
  login: string;
  name: string;
  email: string;
} | null> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) return null;

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${credentials.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      login: string;
      name?: string;
      email?: string;
    };
    return {
      login: data.login,
      name: data.name || data.login,
      email: data.email || `${data.login}@users.noreply.github.com`,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a repository name is available
 */
export async function isRepoNameAvailable(name: string): Promise<boolean> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) return false;

  const user = await getGitHubUser();
  if (!user) return false;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${user.login}/${name}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    // 404 means repo doesn't exist = name is available
    return response.status === 404;
  } catch {
    return false;
  }
}

/**
 * Create a new GitHub repository
 */
export async function createGitHubRepo(
  options: CreateRepoOptions
): Promise<{ success: boolean; repo?: GitHubRepo; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: options.name,
        description: options.description || '',
        private: options.private ?? false,
        auto_init: options.autoInit ?? false,
        has_issues: true,
        has_projects: false,
        has_wiki: false,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { message?: string };
      return {
        success: false,
        error: errorData.message || `GitHub API error: ${response.status}`,
      };
    }

    const repo = (await response.json()) as GitHubRepo;
    return {
      success: true,
      repo: {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        private: repo.private,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delete a GitHub repository (use with caution!)
 */
export async function deleteGitHubRepo(
  repoFullName: string
): Promise<{ success: boolean; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${credentials.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorData = (await response.json()) as { message?: string };
      return {
        success: false,
        error: errorData.message || `GitHub API error: ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Add repository secrets (for CI/CD)
 */
export async function addRepoSecret(
  repoFullName: string,
  secretName: string,
  secretValue: string
): Promise<{ success: boolean; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    // Get the repository's public key for encrypting secrets
    const keyResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/actions/secrets/public-key`,
      {
        headers: {
          Authorization: `Bearer ${credentials.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!keyResponse.ok) {
      return { success: false, error: 'Failed to get repository public key' };
    }

    const keyData = (await keyResponse.json()) as { key: string; key_id: string };
    const { key, key_id } = keyData;

    // Encrypt the secret using libsodium (would need to be imported)
    // For now, we'll skip encryption and note this limitation
    console.warn('Secret encryption not implemented - skipping secret creation', key, key_id);

    return { success: false, error: 'Secret encryption not yet implemented' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Enable GitHub Pages for a repository
 */
export async function enableGitHubPages(
  repoFullName: string,
  branch = 'main'
): Promise<{ success: boolean; url?: string; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.githubToken) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/pages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: {
            branch,
            path: '/',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as { message?: string };
      return {
        success: false,
        error: errorData.message || `GitHub API error: ${response.status}`,
      };
    }

    const pages = (await response.json()) as { html_url: string };
    return {
      success: true,
      url: pages.html_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Full GitHub setup: create repo and return clone URL
 */
export async function setupGitHubRepo(
  projectName: string,
  description: string,
  options?: {
    private?: boolean;
  }
): Promise<{
  success: boolean;
  repoUrl?: string;
  cloneUrl?: string;
  sshUrl?: string;
  error?: string;
}> {
  // Check if configured
  if (!(await isGitHubConfigured())) {
    return { success: false, error: 'GitHub token not configured or invalid' };
  }

  // Check if repo name is available
  const available = await isRepoNameAvailable(projectName);
  if (!available) {
    return { success: false, error: `Repository "${projectName}" already exists` };
  }

  // Create the repository
  const result = await createGitHubRepo({
    name: projectName,
    description,
    private: options?.private ?? false,
  });

  if (!result.success || !result.repo) {
    return { success: false, error: result.error || 'Failed to create repository' };
  }

  return {
    success: true,
    repoUrl: result.repo.html_url,
    cloneUrl: result.repo.clone_url,
    sshUrl: result.repo.ssh_url,
  };
}
