import { access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

/** Deliberately omit inherited API credentials, endpoints, and provider overrides. */
export function subscriptionEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SHELL",
  ]) {
    if (source[key]) env[key] = source[key];
  }
  env["PATH"] = [
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    env["PATH"] ?? "",
  ].join(path.delimiter);
  return env;
}

export async function findExecutable(name: string): Promise<string> {
  const env = subscriptionEnvironment();
  const suffixes = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const directory of (env["PATH"] ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const suffix of suffixes) {
      const candidate = path.join(directory, name + suffix);
      try {
        await access(candidate);
        return candidate;
      } catch {
        /* next location */
      }
    }
  }
  throw new Error(
    `${name} is not installed or is not on PATH. Install it, then reopen SaasFactory.`,
  );
}

/** Prefer the SDK's version-matched native binary, including inside a packaged app. */
export async function providerExecutable(
  provider: "claude" | "codex",
): Promise<string> {
  const require = createRequire(import.meta.url);
  const suffix = process.platform === "win32" ? ".exe" : "";
  try {
    let candidate: string;
    if (provider === "claude") {
      const packageFile = require.resolve(
        `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`,
      );
      candidate = path.join(path.dirname(packageFile), `claude${suffix}`);
    } else {
      const triples: Record<string, string> = {
        "darwin-arm64": "aarch64-apple-darwin",
        "darwin-x64": "x86_64-apple-darwin",
        "linux-arm64": "aarch64-unknown-linux-musl",
        "linux-x64": "x86_64-unknown-linux-musl",
        "win32-arm64": "aarch64-pc-windows-msvc",
        "win32-x64": "x86_64-pc-windows-msvc",
      };
      const platform = `${process.platform}-${process.arch}`;
      const triple = triples[platform];
      if (!triple) throw new Error("Unsupported architecture");
      const packageFile = require.resolve(
        `@openai/codex-${platform}/package.json`,
      );
      candidate = path.join(
        path.dirname(packageFile),
        "vendor",
        triple,
        "bin",
        `codex${suffix}`,
      );
    }
    candidate = candidate.replace(/app\.asar([/\\])/, "app.asar.unpacked$1");
    await access(candidate);
    return candidate;
  } catch {
    return findExecutable(provider);
  }
}
