import { spawnPnpmRunner } from "./pnpm-runner.mjs";
import { pathToFileURL } from "node:url";

export function createDockerAllPlan() {
  return [
    { script: "test:docker:live-build", env: {} },
    { script: "test:docker:live-models", env: { OPENCLAW_SKIP_DOCKER_BUILD: "1" } },
    { script: "test:docker:live-gateway", env: { OPENCLAW_SKIP_DOCKER_BUILD: "1" } },
    { script: "test:docker:openwebui", env: {} },
    { script: "test:docker:onboard", env: {} },
    { script: "test:docker:gateway-network", env: {} },
    { script: "test:docker:mcp-channels", env: {} },
    { script: "test:docker:qr", env: {} },
    { script: "test:docker:doctor-switch", env: {} },
    { script: "test:docker:plugins", env: {} },
    { script: "test:docker:cleanup", env: {} },
  ];
}

async function runStep(step) {
  const child = spawnPnpmRunner({
    pnpmArgs: [step.script],
    env: {
      ...process.env,
      ...step.env,
    },
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${step.script} terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function main() {
  for (const step of createDockerAllPlan()) {
    await runStep(step);
  }
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  await main();
}
