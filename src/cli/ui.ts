import chalk from 'chalk';
import ora, { type Ora } from 'ora';

let bannerShown = false;

// Color helpers (separate from ui object to avoid naming conflicts)
export const colors = {
  primary: chalk.hex('#6366f1'),    // Indigo
  secondary: chalk.hex('#8b5cf6'),  // Purple
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  dim: chalk.dim,
  bold: chalk.bold,
};

export const ui = {
  // Color helpers accessible via ui.colors
  colors,

  // Logo/Banner (only shows once per process)
  banner(): void {
    if (bannerShown) return;
    bannerShown = true;
    console.log('');
    console.log(chalk.hex('#6366f1').bold('  ███████╗ █████╗  █████╗ ███████╗'));
    console.log(chalk.hex('#7c3aed').bold('  ██╔════╝██╔══██╗██╔══██╗██╔════╝'));
    console.log(chalk.hex('#8b5cf6').bold('  ███████╗███████║███████║███████╗'));
    console.log(chalk.hex('#a78bfa').bold('  ╚════██║██╔══██║██╔══██║╚════██║'));
    console.log(chalk.hex('#c4b5fd').bold('  ███████║██║  ██║██║  ██║███████║'));
    console.log(chalk.hex('#ddd6fe').bold('  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝'));
    console.log('');
    console.log(chalk.hex('#6366f1').bold('  ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗'));
    console.log(chalk.hex('#7c3aed').bold('  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝'));
    console.log(chalk.hex('#8b5cf6').bold('  █████╗  ███████║██║        ██║   ██║   ██║██████╔╝ ╚████╔╝ '));
    console.log(chalk.hex('#a78bfa').bold('  ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝  '));
    console.log(chalk.hex('#c4b5fd').bold('  ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║   '));
    console.log(chalk.hex('#ddd6fe').bold('  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   '));
    console.log('');
    console.log(chalk.dim('  Generate production-ready SaaS projects with AI'));
    console.log('');
  },

  // Headings
  heading(text: string): void {
    console.log('');
    console.log(chalk.hex('#6366f1').bold(`▸ ${text}`));
    console.log('');
  },

  subheading(text: string): void {
    console.log(chalk.dim(`  ${text}`));
  },

  // Messages
  log(message: string): void {
    console.log(`  ${message}`);
  },

  success(message: string): void {
    console.log(chalk.green(`  ✓ ${message}`));
  },

  error(message: string): void {
    console.log(chalk.red(`  ✗ ${message}`));
  },

  // Detailed error with suggestion
  errorWithSuggestion(message: string, suggestion?: string): void {
    console.log('');
    console.log(chalk.red(`  ✗ Error: ${message}`));
    if (suggestion) {
      console.log(chalk.yellow(`    Suggestion: ${suggestion}`));
    }
    console.log('');
  },

  // Fatal error that exits the process
  fatal(message: string, suggestion?: string): never {
    console.log('');
    console.log(chalk.red.bold(`  ✗ Fatal: ${message}`));
    if (suggestion) {
      console.log(chalk.yellow(`    ${suggestion}`));
    }
    console.log('');
    process.exit(1);
  },

  warn(message: string): void {
    console.log(chalk.yellow(`  ⚠ ${message}`));
  },

  info(message: string): void {
    console.log(chalk.cyan(`  ℹ ${message}`));
  },

  // Spinners
  spinner(text: string): Ora {
    return ora({
      text,
      prefixText: '  ',
      color: 'magenta',
    }).start();
  },

  // Lists
  list(items: string[]): void {
    items.forEach(item => {
      console.log(chalk.dim(`    • ${item}`));
    });
  },

  // Key-value pairs
  keyValue(key: string, value: string): void {
    console.log(`  ${chalk.dim(key + ':')} ${value}`);
  },

  // Divider
  divider(): void {
    console.log(chalk.dim('  ' + '─'.repeat(50)));
  },

  // Box for important messages
  box(title: string, content: string[]): void {
    const width = 54;
    const border = chalk.dim('│');

    console.log('');
    console.log(chalk.dim('  ┌' + '─'.repeat(width) + '┐'));
    console.log(`  ${border} ${chalk.bold(title.padEnd(width - 1))}${border}`);
    console.log(chalk.dim('  ├' + '─'.repeat(width) + '┤'));

    content.forEach(line => {
      console.log(`  ${border} ${line.padEnd(width - 1)}${border}`);
    });

    console.log(chalk.dim('  └' + '─'.repeat(width) + '┘'));
    console.log('');
  },

  // Next steps after generation
  nextSteps(projectPath: string, steps: string[]): void {
    console.log('');
    console.log(chalk.hex('#6366f1').bold('  Next steps:'));
    console.log('');
    steps.forEach((step, index) => {
      console.log(chalk.dim(`  ${index + 1}.`) + ` ${step}`);
    });
    console.log('');
  },
};

export type { Ora };
