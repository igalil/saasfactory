#!/usr/bin/env node

import { runCLI } from './cli/index.js';
import { ui } from './cli/ui.js';
import { formatError, SaasFactoryError } from './utils/errors.js';

// Global error handlers
process.on('uncaughtException', (error) => {
  const { message, suggestion } = formatError(error);
  ui.errorWithSuggestion(message, suggestion);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const { message, suggestion } = formatError(reason);
  ui.errorWithSuggestion(message, suggestion);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', () => {
  console.log('');
  ui.info('Operation cancelled by user');
  process.exit(0);
});

// Run the CLI
try {
  runCLI();
} catch (error) {
  if (error instanceof SaasFactoryError) {
    ui.errorWithSuggestion(error.message, error.suggestion);
  } else {
    const { message, suggestion } = formatError(error);
    ui.errorWithSuggestion(message, suggestion);
  }
  process.exit(1);
}
