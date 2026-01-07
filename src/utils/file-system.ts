import fs from 'fs-extra';
import path from 'path';
import ejs from 'ejs';
import type { ProjectContext } from '../core/context.js';

/**
 * Create directory if it doesn't exist
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * Write file with optional EJS template rendering
 */
export async function writeFile(
  filePath: string,
  content: string,
  context?: ProjectContext,
): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));

  // If content contains EJS tags and context provided, render template
  if (context && content.includes('<%')) {
    content = ejs.render(content, { ctx: context, ...context });
  }

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Copy file from source to destination
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/**
 * Copy directory recursively with optional EJS rendering
 */
export async function copyDir(
  srcDir: string,
  destDir: string,
  context?: ProjectContext,
): Promise<void> {
  await fs.ensureDir(destDir);

  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    let destPath = path.join(destDir, entry.name);

    // Remove .ejs extension from destination
    if (destPath.endsWith('.ejs')) {
      destPath = destPath.slice(0, -4);
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, context);
    } else if (entry.name.endsWith('.ejs') && context) {
      // Render EJS template
      const template = await fs.readFile(srcPath, 'utf-8');
      const rendered = ejs.render(template, { ctx: context, ...context });
      await writeFile(destPath, rendered);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Check if path exists
 */
export async function exists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

/**
 * Remove file or directory
 */
export async function remove(filePath: string): Promise<void> {
  await fs.remove(filePath);
}

/**
 * Get templates directory path
 */
export function getTemplatesDir(): string {
  // Templates are bundled with the package
  return path.join(import.meta.dirname, '..', 'templates');
}

/**
 * Render EJS template string
 */
export function renderTemplate(
  template: string,
  context: ProjectContext,
): string {
  return ejs.render(template, { ctx: context, ...context });
}

/**
 * Render EJS template file
 */
export async function renderTemplateFile(
  templatePath: string,
  context: ProjectContext,
): Promise<string> {
  const template = await readFile(templatePath);
  return renderTemplate(template, context);
}

/**
 * Create project directory structure
 */
export async function createProjectStructure(
  projectDir: string,
  dirs: string[],
): Promise<void> {
  for (const dir of dirs) {
    await ensureDir(path.join(projectDir, dir));
  }
}

/**
 * Write JSON file
 */
export async function writeJson(
  filePath: string,
  data: unknown,
  spaces = 2,
): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces });
}

/**
 * Read JSON file
 */
export async function readJson<T>(filePath: string): Promise<T> {
  return fs.readJson(filePath) as Promise<T>;
}

/**
 * Append to file
 */
export async function appendFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.appendFile(filePath, content, 'utf-8');
}
