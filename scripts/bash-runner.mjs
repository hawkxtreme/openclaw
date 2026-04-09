import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

function createWindowsCandidates(env) {
  const candidates = [];
  const add = (value) => {
    if (typeof value === "string" && value.length > 0 && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  add(env.OPENCLAW_BASH);
  if (typeof env.ProgramFiles === "string" && env.ProgramFiles.length > 0) {
    add(path.win32.join(env.ProgramFiles, "Git", "bin", "bash.exe"));
  }
  if (typeof env.ProgramW6432 === "string" && env.ProgramW6432.length > 0) {
    add(path.win32.join(env.ProgramW6432, "Git", "bin", "bash.exe"));
  }
  if (typeof env["ProgramFiles(x86)"] === "string" && env["ProgramFiles(x86)"].length > 0) {
    add(path.win32.join(env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"));
  }
  if (typeof env.LocalAppData === "string" && env.LocalAppData.length > 0) {
    add(path.win32.join(env.LocalAppData, "Programs", "Git", "bin", "bash.exe"));
  }
  add("C:\\Program Files\\Git\\bin\\bash.exe");
  add("C:\\Program Files (x86)\\Git\\bin\\bash.exe");

  return candidates;
}

export function resolveBashRunner(params = {}) {
  const argv = params.argv ?? process.argv.slice(2);
  const platform = params.platform ?? process.platform;
  const env = params.env ?? process.env;
  const existsSync = params.existsSync ?? fs.existsSync;

  if (platform !== "win32") {
    return { command: "bash", args: argv };
  }

  for (const candidate of createWindowsCandidates(env)) {
    if (existsSync(candidate)) {
      return { command: candidate, args: argv };
    }
  }

  return { command: "bash", args: argv };
}

async function main() {
  const runner = resolveBashRunner();
  const child = spawn(runner.command, runner.args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`bash runner terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  process.exit(exitCode);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  await main();
}
