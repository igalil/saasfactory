import { execa, type ExecaError } from 'execa';

export interface ClaudeOptions {
  outputFormat?: 'text' | 'json' | 'stream-json';
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  resume?: string;
  timeout?: number;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  type: 'tool_use' | 'text' | 'result';
  tool?: string;
  message?: string;
  query?: string;
  sources?: string[];
  searchCount?: number;
  totalSources?: number;
}

interface StreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result';
  message?: {
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      input?: { query?: string };
      content?: string;
    }>;
  };
  result?: string;
  // Tool result with structured data (at root level for 'user' type)
  tool_use_result?: {
    query?: string;
    results?: Array<{
      content?: Array<{ url?: string; title?: string }>;
    }>;
  };
}

function extractDomains(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((r: { url?: string }) => r.url)
        .map((r: { url: string }) => {
          try {
            return new URL(r.url).hostname.replace(/^www\./, '');
          } catch {
            return null;
          }
        })
        .filter((h): h is string => h !== null);
    }
  } catch {
    // Fallback: extract URLs with regex
    const urlMatches = content.match(/https?:\/\/[^\s"<>]+/g) || [];
    return [...new Set(
      urlMatches
        .map(url => {
          try {
            return new URL(url).hostname.replace(/^www\./, '');
          } catch {
            return null;
          }
        })
        .filter((h): h is string => h !== null)
    )];
  }
  return [];
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

interface ClaudeJsonResponse {
  type: string;
  subtype?: string;
  result?: string;
  is_error?: boolean;
  session_id?: string;
}

/**
 * Check if Claude Code CLI is available
 */
export async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    await execa('claude', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a prompt using Claude Code CLI
 * Uses your Claude Code subscription (not API billing)
 */
export async function claudeGenerate(
  prompt: string,
  options: ClaudeOptions = {},
): Promise<string> {
  const args: string[] = ['-p', prompt];

  // Output format
  if (options.outputFormat) {
    args.push('--output-format', options.outputFormat);
  }

  // System prompt
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  // Allowed tools
  if (options.allowedTools?.length) {
    args.push('--allowedTools', options.allowedTools.join(','));
  }

  // Max turns (to prevent runaway loops)
  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }

  // Resume previous conversation
  if (options.resume) {
    args.push('--resume', options.resume);
  }

  try {
    const { stdout } = await execa('claude', args, {
      timeout: options.timeout ?? 120000, // 2 minute default
      stdin: 'ignore', // Don't wait for stdin (execa v9 change)
      env: {
        ...process.env,
        // Ensure non-interactive mode
        CI: 'true',
      },
    });

    // If JSON output, parse and extract result
    if (options.outputFormat === 'json') {
      try {
        const parsed = JSON.parse(stdout) as ClaudeJsonResponse;
        if (parsed.is_error) {
          throw new Error(parsed.result ?? 'Unknown error');
        }
        return parsed.result ?? stdout;
      } catch (e) {
        // If parsing fails, return raw output
        if (e instanceof SyntaxError) {
          return stdout;
        }
        throw e;
      }
    }

    return stdout;
  } catch (error) {
    const execaError = error as ExecaError & { killed?: boolean };
    if (execaError.timedOut) {
      throw new Error('Claude Code request timed out');
    }
    if (execaError.killed) {
      throw new Error('Claude Code process was killed');
    }
    throw new Error(`Claude Code failed: ${execaError.message}`);
  }
}

/**
 * Execute a prompt with streaming progress updates
 * Parses stream-json output to report tool usage in real-time
 */
export async function claudeGenerateWithProgress(
  prompt: string,
  options: ClaudeOptions = {},
): Promise<string> {
  const args: string[] = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

  // System prompt
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  // Allowed tools
  if (options.allowedTools?.length) {
    args.push('--allowedTools', options.allowedTools.join(','));
  }

  // Max turns
  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }

  // Resume previous conversation
  if (options.resume) {
    args.push('--resume', options.resume);
  }

  const startTime = Date.now();
  let searchCount = 0;
  const allSources: string[] = [];
  let finalResult = '';
  let buffer = '';

  // Periodic fallback status update (in case stream events are slow)
  const statusInterval = setInterval(() => {
    options.onProgress?.({
      type: 'tool_use',
      tool: 'status',
      message: `Researching... (${formatElapsed(Date.now() - startTime)} elapsed)`,
      searchCount,
      totalSources: allSources.length,
    });
  }, 5000);

  try {
    // Use spawn to get real-time streaming (execa v9 buffers by default)
    const { spawn } = await import('child_process');

    return new Promise<string>((resolve, reject) => {
      const child = spawn('claude', args, {
        env: {
          ...process.env,
          CI: 'true',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately to signal we're not sending input
      child.stdin?.end();

      let stdout = '';
      let stderr = '';

      // Set up timeout
      const timeoutId = setTimeout(() => {
        child.kill();
        clearInterval(statusInterval);
        reject(new Error('Claude Code request timed out'));
      }, options.timeout ?? 120000);

      child.stdout?.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        stdout += data;
        buffer += data;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed) as StreamEvent;

            // Handle WebSearch tool invocations
            if (event.type === 'assistant' && event.message?.content) {
              for (const content of event.message.content) {
                if (content.type === 'tool_use' && content.name === 'WebSearch') {
                  searchCount++;
                  options.onProgress?.({
                    type: 'tool_use',
                    tool: 'WebSearch',
                    query: content.input?.query,
                    message: content.input?.query
                      ? `Searching: "${content.input.query}"`
                      : `Web search #${searchCount}`,
                    searchCount,
                    totalSources: allSources.length,
                  });
                }
              }
            }

            // Handle tool results with source URLs
            if (event.type === 'user') {
              let domains: string[] = [];

              // Try structured tool_use_result first (has parsed URL data)
              if (event.tool_use_result?.results) {
                for (const result of event.tool_use_result.results) {
                  if (result.content && Array.isArray(result.content)) {
                    for (const item of result.content) {
                      if (item.url) {
                        try {
                          const hostname = new URL(item.url).hostname.replace(/^www\./, '');
                          if (!domains.includes(hostname)) {
                            domains.push(hostname);
                          }
                        } catch {
                          // Invalid URL, skip
                        }
                      }
                    }
                  }
                }
              }

              // Fallback: extract from message content text
              if (domains.length === 0 && event.message?.content) {
                for (const content of event.message.content) {
                  if (content.type === 'tool_result' && content.content) {
                    domains = extractDomains(content.content);
                  }
                }
              }

              const newDomains = domains.filter(d => !allSources.includes(d));
              if (newDomains.length > 0) {
                allSources.push(...newDomains);
                options.onProgress?.({
                  type: 'result',
                  sources: newDomains,
                  message: `Found ${newDomains.length} sources`,
                  searchCount,
                  totalSources: allSources.length,
                });
              }
            }

            // Capture final result
            if (event.type === 'result' && event.result) {
              finalResult = event.result;
            }
          } catch {
            // Non-JSON line or parse error, skip
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        clearInterval(statusInterval);

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim()) as StreamEvent;
            if (event.type === 'result' && event.result) {
              finalResult = event.result;
            }
          } catch {
            // Ignore parse errors
          }
        }

        if (code !== 0 && !finalResult) {
          reject(new Error(`Claude Code failed with code ${code}: ${stderr}`));
          return;
        }

        // Return final result or try to parse from stdout
        if (finalResult) {
          resolve(finalResult);
          return;
        }

        // Fallback: try to find result in last NDJSON line
        const lines = stdout.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const event = JSON.parse(lines[i]) as StreamEvent;
            if (event.type === 'result' && event.result) {
              resolve(event.result);
              return;
            }
          } catch {
            continue;
          }
        }

        resolve(stdout);
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        clearInterval(statusInterval);
        reject(new Error(`Claude Code failed: ${err.message}`));
      });
    });
  } catch (error) {
    clearInterval(statusInterval);
    const execaError = error as ExecaError & { timedOut?: boolean; killed?: boolean };
    if (execaError.timedOut) {
      throw new Error('Claude Code request timed out');
    }
    if (execaError.killed) {
      throw new Error('Claude Code process was killed');
    }
    throw new Error(`Claude Code failed: ${execaError.message}`);
  }
}

/**
 * Generate content with structured output
 */
export async function claudeGenerateStructured<T>(
  prompt: string,
  options: ClaudeOptions = {},
): Promise<T> {
  const response = await claudeGenerate(prompt, {
    ...options,
    outputFormat: 'json',
  });

  // Try to extract JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]) as T;
  }

  // Try to parse entire response as JSON
  return JSON.parse(response) as T;
}

/**
 * Continue a multi-turn conversation
 */
export async function claudeContinue(
  sessionId: string,
  prompt: string,
  options: ClaudeOptions = {},
): Promise<string> {
  return claudeGenerate(prompt, {
    ...options,
    resume: sessionId,
  });
}

/**
 * Generate code with specific tools enabled
 */
export async function claudeGenerateCode(
  prompt: string,
  options: ClaudeOptions = {},
): Promise<string> {
  return claudeGenerate(prompt, {
    ...options,
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: options.maxTurns ?? 10,
  });
}

/**
 * Predefined system prompts for different tasks
 */
export const systemPrompts = {
  marketingContent: `You are a SaaS marketing expert. Generate compelling, conversion-focused content.
Output only valid JSON without any markdown formatting or explanation.
Be specific and avoid generic phrases. Focus on benefits over features.`,

  codeGeneration: `You are an expert Next.js and TypeScript developer.
Generate clean, production-ready code following best practices.
Use modern patterns: App Router, Server Components, Tailwind CSS.
Include proper TypeScript types and error handling.`,

  legalDocs: `You are a legal document specialist for SaaS companies.
Generate professional privacy policies and terms of service.
Include standard clauses for: data collection, user rights, liability, termination.
Use clear, readable language while maintaining legal accuracy.`,

  schemaDesign: `You are a database schema designer for Convex.
Design efficient, normalized schemas with proper relationships.
Consider query patterns and real-time sync requirements.
Use appropriate field types and indexes.`,

  seoOptimization: `You are an SEO specialist for SaaS products.
Generate meta tags, structured data, and content optimized for search.
Include keywords naturally. Focus on user intent.
Follow Google's latest guidelines and best practices.`,
};
