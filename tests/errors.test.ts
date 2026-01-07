import { describe, it, expect } from 'vitest';
import {
  SaasFactoryError,
  ConfigurationError,
  GenerationError,
  NetworkError,
  ValidationError,
  ExternalServiceError,
  formatError,
  withRetry,
} from '../src/utils/errors.js';

describe('errors', () => {
  describe('SaasFactoryError', () => {
    it('creates error with message and code', () => {
      const error = new SaasFactoryError('Test error', 'TEST_ERROR');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('SaasFactoryError');
    });

    it('includes suggestion when provided', () => {
      const error = new SaasFactoryError('Test error', 'TEST', 'Try again');

      expect(error.suggestion).toBe('Try again');
    });
  });

  describe('ConfigurationError', () => {
    it('creates configuration error', () => {
      const error = new ConfigurationError('Config not found');

      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIGURATION_ERROR');
    });
  });

  describe('GenerationError', () => {
    it('creates generation error', () => {
      const error = new GenerationError('Failed to generate');

      expect(error.name).toBe('GenerationError');
      expect(error.code).toBe('GENERATION_ERROR');
    });
  });

  describe('NetworkError', () => {
    it('creates network error', () => {
      const error = new NetworkError('Connection failed');

      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });

  describe('ValidationError', () => {
    it('creates validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ExternalServiceError', () => {
    it('creates external service error with service name', () => {
      const error = new ExternalServiceError('GitHub', 'API rate limited');

      expect(error.message).toBe('GitHub: API rate limited');
      expect(error.name).toBe('ExternalServiceError');
    });
  });

  describe('formatError', () => {
    it('formats SaasFactoryError', () => {
      const error = new ConfigurationError('Missing config', 'Add config file');
      const result = formatError(error);

      expect(result.message).toBe('Missing config');
      expect(result.suggestion).toBe('Add config file');
    });

    it('formats generic Error', () => {
      const error = new Error('Something went wrong');
      const result = formatError(error);

      expect(result.message).toBe('Something went wrong');
    });

    it('handles ENOENT errors', () => {
      const error = new Error('ENOENT: no such file');
      const result = formatError(error);

      expect(result.message).toBe('File or directory not found');
      expect(result.suggestion).toBeDefined();
    });

    it('handles EACCES errors', () => {
      const error = new Error('EACCES: permission denied');
      const result = formatError(error);

      expect(result.message).toBe('Permission denied');
    });

    it('handles non-Error objects', () => {
      const result = formatError('string error');

      expect(result.message).toBe('string error');
    });
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'success';
      };

      const result = await withRetry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('retries on failure', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('throws after max retries', async () => {
      const fn = async () => {
        throw new Error('Persistent failure');
      };

      await expect(
        withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }),
      ).rejects.toThrow('Persistent failure');
    });

    it('respects shouldRetry function', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error('Do not retry');
      };

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 10,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow('Do not retry');

      expect(attempts).toBe(1);
    });
  });
});
