import type { ChildProcess } from 'child_process';

/**
 * Centralized process manager to track and clean up spawned child processes.
 * Prevents orphan processes when the parent CLI is killed or exits.
 */

const activeProcesses = new Set<ChildProcess>();
let cleanupRegistered = false;

/**
 * Track a child process for cleanup on exit
 */
export function trackProcess(child: ChildProcess): void {
  activeProcesses.add(child);

  // Auto-remove when process exits normally
  child.on('exit', () => {
    activeProcesses.delete(child);
  });

  child.on('error', () => {
    activeProcesses.delete(child);
  });
}

/**
 * Stop tracking a process (use when manually cleaned up)
 */
export function untrackProcess(child: ChildProcess): void {
  activeProcesses.delete(child);
}

/**
 * Kill all tracked processes
 */
export function killAllProcesses(): void {
  for (const proc of activeProcesses) {
    if (!proc.killed) {
      try {
        // Try graceful termination first
        proc.kill('SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
  }

  // Force kill any remaining after a short delay
  setTimeout(() => {
    for (const proc of activeProcesses) {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    }
  }, 500);
}

/**
 * Get count of active processes (for debugging)
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}

/**
 * Register global cleanup handlers for process exit signals.
 * Should be called once at CLI startup.
 */
export function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    killAllProcesses();
  };

  // Handle various exit signals
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);

  // Handle uncaught exceptions - cleanup before crashing
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup();
    process.exit(1);
  });
}
