import { loadCredentials } from '../core/config.js';

interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  link?: {
    type: string;
    repo: string;
  };
}

interface VercelDeployment {
  id: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  readyState: string;
}

interface EnvVariable {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type?: 'plain' | 'secret' | 'encrypted';
}

/**
 * Check if Vercel token is configured and valid
 */
export async function isVercelConfigured(): Promise<boolean> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) return false;

  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${credentials.vercelToken}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get authenticated Vercel user
 */
export async function getVercelUser(): Promise<{
  id: string;
  username: string;
  email: string;
} | null> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) return null;

  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${credentials.vercelToken}`,
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      user: { id: string; username: string; email: string };
    };
    return {
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new Vercel project
 */
export async function createVercelProject(
  name: string,
  options?: {
    framework?: string;
    gitRepository?: {
      type: 'github';
      repo: string; // format: "owner/repo"
    };
  }
): Promise<{ success: boolean; project?: VercelProject; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) {
    return { success: false, error: 'Vercel token not configured' };
  }

  try {
    const body: Record<string, unknown> = {
      name,
      framework: options?.framework || 'nextjs',
    };

    if (options?.gitRepository) {
      body['gitRepository'] = options.gitRepository;
    }

    const response = await fetch('https://api.vercel.com/v10/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message?: string } };
      return {
        success: false,
        error: errorData.error?.message || `Vercel API error: ${response.status}`,
      };
    }

    const projectData = (await response.json()) as VercelProject;
    const result: VercelProject = {
      id: projectData.id,
      name: projectData.name,
      accountId: projectData.accountId,
    };
    if (projectData.link) {
      result.link = projectData.link;
    }
    return {
      success: true,
      project: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Link Vercel project to GitHub repository
 */
export async function linkVercelToGitHub(
  projectId: string,
  repoFullName: string
): Promise<{ success: boolean; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) {
    return { success: false, error: 'Vercel token not configured' };
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/link`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'github',
          repo: repoFullName,
        }),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message?: string } };
      return {
        success: false,
        error: errorData.error?.message || `Vercel API error: ${response.status}`,
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
 * Add environment variables to Vercel project
 */
export async function addVercelEnvVariables(
  projectId: string,
  variables: EnvVariable[]
): Promise<{ success: boolean; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) {
    return { success: false, error: 'Vercel token not configured' };
  }

  try {
    // Add each variable
    for (const variable of variables) {
      const response = await fetch(
        `https://api.vercel.com/v10/projects/${projectId}/env`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: variable.key,
            value: variable.value,
            target: variable.target,
            type: variable.type || 'encrypted',
          }),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: { message?: string } };
        console.warn(`Failed to add env ${variable.key}:`, errorData.error?.message);
      }
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
 * Trigger a deployment
 */
export async function triggerDeployment(
  projectName: string,
  options?: {
    ref?: string; // git ref to deploy
    target?: 'production' | 'preview';
  }
): Promise<{ success: boolean; deployment?: VercelDeployment; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) {
    return { success: false, error: 'Vercel token not configured' };
  }

  try {
    const body: Record<string, unknown> = {
      name: projectName,
      target: options?.target || 'production',
    };

    if (options?.ref) {
      body['gitSource'] = {
        ref: options.ref,
      };
    }

    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message?: string } };
      return {
        success: false,
        error: errorData.error?.message || `Vercel API error: ${response.status}`,
      };
    }

    const deployment = (await response.json()) as VercelDeployment;
    return {
      success: true,
      deployment: {
        id: deployment.id,
        url: deployment.url,
        state: deployment.state,
        readyState: deployment.readyState,
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
 * Get deployment status
 */
export async function getDeploymentStatus(
  deploymentId: string
): Promise<{ success: boolean; deployment?: VercelDeployment; error?: string }> {
  const credentials = await loadCredentials();
  if (!credentials.vercelToken) {
    return { success: false, error: 'Vercel token not configured' };
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.vercelToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: { message?: string } };
      return {
        success: false,
        error: errorData.error?.message || `Vercel API error: ${response.status}`,
      };
    }

    const deployment = (await response.json()) as VercelDeployment;
    return {
      success: true,
      deployment: {
        id: deployment.id,
        url: deployment.url,
        state: deployment.state,
        readyState: deployment.readyState,
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
 * Wait for deployment to be ready
 */
export async function waitForDeployment(
  deploymentId: string,
  timeoutMs = 300000 // 5 minutes
): Promise<{ success: boolean; url?: string; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getDeploymentStatus(deploymentId);

    if (!result.success) {
      return { success: false, error: result.error || 'Deployment status check failed' };
    }

    const state = result.deployment?.state;

    if (state === 'READY') {
      return {
        success: true,
        url: `https://${result.deployment?.url}`,
      };
    }

    if (state === 'ERROR' || state === 'CANCELED') {
      return {
        success: false,
        error: `Deployment ${state.toLowerCase()}`,
      };
    }

    // Wait 3 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return { success: false, error: 'Deployment timed out' };
}

/**
 * Full Vercel setup: create project, add env vars, link to GitHub
 */
export async function setupVercelProject(
  projectName: string,
  options?: {
    githubRepo?: string; // format: "owner/repo"
    envVariables?: EnvVariable[];
  }
): Promise<{
  success: boolean;
  projectUrl?: string;
  error?: string;
}> {
  // Check if configured
  if (!(await isVercelConfigured())) {
    return { success: false, error: 'Vercel token not configured or invalid' };
  }

  // Create project
  const createOptions: {
    framework?: string;
    gitRepository?: { type: 'github'; repo: string };
  } = {
    framework: 'nextjs',
  };
  if (options?.githubRepo) {
    createOptions.gitRepository = { type: 'github', repo: options.githubRepo };
  }

  const createResult = await createVercelProject(projectName, createOptions);

  if (!createResult.success || !createResult.project) {
    return { success: false, error: createResult.error || 'Failed to create Vercel project' };
  }

  // Add environment variables if provided
  if (options?.envVariables?.length) {
    await addVercelEnvVariables(createResult.project.id, options.envVariables);
  }

  const user = await getVercelUser();

  const result: { success: boolean; projectUrl?: string; error?: string } = {
    success: true,
  };

  if (user) {
    result.projectUrl = `https://vercel.com/${user.username}/${projectName}`;
  }

  return result;
}
