import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsExtra from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  ensureDir,
  writeFile,
  copyFile,
  copyDir,
  readFile,
  exists,
  remove,
  writeJson,
  readJson,
  renderTemplate,
  createProjectStructure,
} from '../src/utils/file-system.js';
import { createDefaultContext } from '../src/core/context.js';

describe('file-system', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `saasfactory-test-${Date.now()}`);
    await fsExtra.ensureDir(testDir);
  });

  afterEach(async () => {
    await fsExtra.remove(testDir);
  });

  describe('ensureDir', () => {
    it('creates a new directory', async () => {
      const dirPath = path.join(testDir, 'new-dir');
      await ensureDir(dirPath);

      expect(await fsExtra.pathExists(dirPath)).toBe(true);
    });

    it('creates nested directories', async () => {
      const dirPath = path.join(testDir, 'nested', 'deep', 'dir');
      await ensureDir(dirPath);

      expect(await fsExtra.pathExists(dirPath)).toBe(true);
    });

    it('does not fail if directory exists', async () => {
      const dirPath = path.join(testDir, 'existing');
      await fsExtra.ensureDir(dirPath);

      await expect(ensureDir(dirPath)).resolves.not.toThrow();
    });
  });

  describe('writeFile', () => {
    it('writes content to file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await writeFile(filePath, 'Hello, World!');

      const content = await fsExtra.readFile(filePath, 'utf8');
      expect(content).toBe('Hello, World!');
    });

    it('creates parent directories', async () => {
      const filePath = path.join(testDir, 'nested', 'file.txt');
      await writeFile(filePath, 'content');

      expect(await fsExtra.pathExists(filePath)).toBe(true);
    });

    it('renders EJS template when context provided', async () => {
      const filePath = path.join(testDir, 'template.txt');
      const context = createDefaultContext('my-app', 'A test description that is long enough');
      await writeFile(filePath, 'Project: <%= name %>', context);

      const content = await fsExtra.readFile(filePath, 'utf8');
      expect(content).toBe('Project: my-app');
    });
  });

  describe('copyFile', () => {
    it('copies file to destination', async () => {
      const srcPath = path.join(testDir, 'source.txt');
      const destPath = path.join(testDir, 'dest.txt');
      await fsExtra.writeFile(srcPath, 'original content');

      await copyFile(srcPath, destPath);

      const content = await fsExtra.readFile(destPath, 'utf8');
      expect(content).toBe('original content');
    });

    it('creates parent directories for destination', async () => {
      const srcPath = path.join(testDir, 'source.txt');
      const destPath = path.join(testDir, 'nested', 'dest.txt');
      await fsExtra.writeFile(srcPath, 'content');

      await copyFile(srcPath, destPath);

      expect(await fsExtra.pathExists(destPath)).toBe(true);
    });
  });

  describe('copyDir', () => {
    it('copies directory contents', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');
      await fsExtra.ensureDir(srcDir);
      await fsExtra.writeFile(path.join(srcDir, 'file.txt'), 'content');

      await copyDir(srcDir, destDir);

      expect(await fsExtra.pathExists(path.join(destDir, 'file.txt'))).toBe(true);
    });

    it('copies nested directories', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');
      await fsExtra.ensureDir(path.join(srcDir, 'nested'));
      await fsExtra.writeFile(path.join(srcDir, 'nested', 'file.txt'), 'nested content');

      await copyDir(srcDir, destDir);

      const content = await fsExtra.readFile(path.join(destDir, 'nested', 'file.txt'), 'utf8');
      expect(content).toBe('nested content');
    });
  });

  describe('readFile', () => {
    it('reads file content', async () => {
      const filePath = path.join(testDir, 'read.txt');
      await fsExtra.writeFile(filePath, 'file content');

      const content = await readFile(filePath);

      expect(content).toBe('file content');
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      await fsExtra.writeFile(filePath, 'content');

      expect(await exists(filePath)).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      expect(await exists(path.join(testDir, 'not-exists.txt'))).toBe(false);
    });
  });

  describe('remove', () => {
    it('removes file', async () => {
      const filePath = path.join(testDir, 'to-remove.txt');
      await fsExtra.writeFile(filePath, 'content');

      await remove(filePath);

      expect(await fsExtra.pathExists(filePath)).toBe(false);
    });

    it('removes directory recursively', async () => {
      const dirPath = path.join(testDir, 'to-remove-dir');
      await fsExtra.ensureDir(dirPath);
      await fsExtra.writeFile(path.join(dirPath, 'file.txt'), 'content');

      await remove(dirPath);

      expect(await fsExtra.pathExists(dirPath)).toBe(false);
    });
  });

  describe('writeJson/readJson', () => {
    it('writes and reads JSON', async () => {
      const filePath = path.join(testDir, 'data.json');
      const data = { name: 'test', count: 42 };

      await writeJson(filePath, data);
      const result = await readJson<typeof data>(filePath);

      expect(result).toEqual(data);
    });
  });

  describe('renderTemplate', () => {
    it('renders EJS template', () => {
      const context = createDefaultContext('my-app', 'A test description that is long enough');
      const result = renderTemplate('Hello, <%= displayName %>!', context);

      expect(result).toBe('Hello, My App!');
    });

    it('handles complex templates', () => {
      const context = createDefaultContext('my-app', 'A test description that is long enough');
      const template = `
Features:
<% pricing.tiers.forEach(tier => { %>
- <%= tier.name %>: $<%= tier.price %>
<% }); %>`;

      const result = renderTemplate(template, context);

      expect(result).toContain('- Free: $0');
      expect(result).toContain('- Pro: $19');
      expect(result).toContain('- Enterprise: $99');
    });
  });

  describe('createProjectStructure', () => {
    it('creates directory structure', async () => {
      const projectDir = path.join(testDir, 'project');
      await fsExtra.ensureDir(projectDir);

      await createProjectStructure(projectDir, ['src', 'public', 'src/components']);

      expect(await fsExtra.pathExists(path.join(projectDir, 'src'))).toBe(true);
      expect(await fsExtra.pathExists(path.join(projectDir, 'public'))).toBe(true);
      expect(await fsExtra.pathExists(path.join(projectDir, 'src/components'))).toBe(true);
    });
  });
});
