import { spawn } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const [hostname = "0.0.0.0", port = "3000"] = process.argv.slice(2);
const root = process.cwd();
const standaloneDirectory = path.join(root, ".next", "standalone");
const standaloneNextDirectory = path.join(standaloneDirectory, ".next");
const serverPath = path.join(standaloneDirectory, "server.js");

await stat(serverPath).catch(() => {
  throw new Error("Standalone build not found. Run `npm run build` first.");
});

await mkdir(standaloneNextDirectory, { recursive: true });
await cp(
  path.join(root, ".next", "static"),
  path.join(standaloneNextDirectory, "static"),
  {
    recursive: true,
    force: true,
  },
);

const publicDirectory = path.join(root, "public");
if (await stat(publicDirectory).catch(() => null)) {
  await cp(publicDirectory, path.join(standaloneDirectory, "public"), {
    recursive: true,
    force: true,
  });
}

const server = spawn(process.execPath, [serverPath], {
  cwd: standaloneDirectory,
  env: { ...process.env, HOSTNAME: hostname, PORT: port },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
