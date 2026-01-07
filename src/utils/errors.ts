/**
 * Custom error classes for SaasFactory
 */

export class SaasFactoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'SaasFactoryError';
  }
}

export class ConfigurationError extends SaasFactoryError {
  constructor(message: string, suggestion?: string) {
    super(message, 'CONFIGURATION_ERROR', suggestion);
    this.name = 'ConfigurationError';
  }
}

export class GenerationError extends SaasFactoryError {
  constructor(message: string, suggestion?: string) {
    super(message, 'GENERATION_ERROR', suggestion);
    this.name = 'GenerationError';
  }
}

export class NetworkError extends SaasFactoryError {
  constructor(message: string, suggestion?: string) {
    super(message, 'NETWORK_ERROR', suggestion);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends SaasFactoryError {
  constructor(message: string, suggestion?: string) {
    super(message, 'VALIDATION_ERROR', suggestion);
    this.name = 'ValidationError';
  }
}

export class ExternalServiceError extends SaasFactoryError {
  constructor(
    service: string,
    message: string,
    suggestion?: string,
  ) {
    super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', suggestion);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Format error for CLI display
 */
export function formatError(error: unknown): {
  message: string;
  suggestion?: string;
} {
  if (error instanceof SaasFactoryError) {
    return {
      message: error.message,
      suggestion: error.suggestion,
    };
  }

  if (error instanceof Error) {
    // Handle common Node.js errors
    if (error.message.includes('ENOENT')) {
      return {
        message: 'File or directory not found',
        suggestion: 'Check that the path exists and you have permission to access it',
      };
    }
    if (error.message.includes('EACCES')) {
      return {
        message: 'Permission denied',
        suggestion: 'Try running with appropriate permissions or check file ownership',
      };
    }
    if (error.message.includes('EEXIST')) {
      return {
        message: 'File or directory already exists',
        suggestion: 'Use a different name or remove the existing file/directory',
      };
    }
    if (error.message.includes('ECONNREFUSED')) {
      return {
        message: 'Connection refused',
        suggestion: 'Check your internet connection and try again',
      };
    }
    if (error.message.includes('ETIMEDOUT')) {
      return {
        message: 'Connection timed out',
        suggestion: 'Check your internet connection and try again',
      };
    }

    return { message: error.message };
  }

  return { message: String(error) };
}

/**
 * Wrap async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SaasFactoryError) {
      throw error;
    }
    throw new GenerationError(
      `Failed during ${context}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Retry async operation with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  throw lastError;
}
