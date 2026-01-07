import { execa } from 'execa';
import path from 'path';

/**
 * Initialize git repository in project directory
 */
export async function initGitRepo(projectPath: string): Promise<void> {
  await execa('git', ['init'], { cwd: projectPath });
}

/**
 * Create initial commit
 */
export async function createInitialCommit(
  projectPath: string,
  projectName: string
): Promise<void> {
  // Stage all files
  await execa('git', ['add', '.'], { cwd: projectPath });

  // Create commit
  await execa(
    'git',
    [
      'commit',
      '-m',
      `Initial commit: ${projectName}

Generated with SaasFactory
https://github.com/your-username/saasfactory`,
    ],
    { cwd: projectPath }
  );
}

/**
 * Add remote origin
 */
export async function addRemoteOrigin(
  projectPath: string,
  repoUrl: string
): Promise<void> {
  await execa('git', ['remote', 'add', 'origin', repoUrl], { cwd: projectPath });
}

/**
 * Push to remote
 */
export async function pushToRemote(
  projectPath: string,
  branch = 'main'
): Promise<void> {
  // Rename branch to main if needed
  await execa('git', ['branch', '-M', branch], { cwd: projectPath });

  // Push with upstream tracking
  await execa('git', ['push', '-u', 'origin', branch], { cwd: projectPath });
}

/**
 * Check if git is installed
 */
export async function isGitInstalled(): Promise<boolean> {
  try {
    await execa('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if directory is already a git repo
 */
export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(projectPath: string): Promise<string> {
  const { stdout } = await execa('git', ['branch', '--show-current'], {
    cwd: projectPath,
  });
  return stdout.trim() || 'main';
}

/**
 * Create .gitignore if not exists
 */
export async function ensureGitignore(projectPath: string): Promise<void> {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const fs = await import('fs-extra');

  if (!(await fs.pathExists(gitignorePath))) {
    const gitignoreContent = `# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage

# Next.js
.next/
out/

# Production
build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts

# Convex
.convex
`;
    await fs.writeFile(gitignorePath, gitignoreContent);
  }
}

/**
 * Full git setup: init, commit, and optionally push
 */
export async function setupGit(
  projectPath: string,
  projectName: string,
  options?: {
    remoteUrl?: string;
    push?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if git is installed
    if (!(await isGitInstalled())) {
      return { success: false, error: 'Git is not installed' };
    }

    // Check if already a git repo
    if (await isGitRepo(projectPath)) {
      return { success: false, error: 'Directory is already a git repository' };
    }

    // Ensure .gitignore exists
    await ensureGitignore(projectPath);

    // Initialize repo
    await initGitRepo(projectPath);

    // Create initial commit
    await createInitialCommit(projectPath, projectName);

    // Add remote and push if provided
    if (options?.remoteUrl) {
      await addRemoteOrigin(projectPath, options.remoteUrl);

      if (options.push) {
        await pushToRemote(projectPath);
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
