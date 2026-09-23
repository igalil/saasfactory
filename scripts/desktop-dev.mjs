import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
await import("./desktop-build.mjs");
const server = await createServer();
await server.listen();
const child = spawn(electron, ["dist-desktop/main/main.js"], {
  stdio: "inherit",
  env: { ...process.env, SAASFACTORY_DEV_URL: "http://localhost:5173" },
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill();
  await server.close();
}
child.on("exit", async (code) => {
  await close();
  process.exitCode = code ?? 0;
});
child.on("error", async (error) => {
  console.error(error.message);
  await close();
  process.exitCode = 1;
});
process.on("SIGINT", close);
process.on("SIGTERM", close);
