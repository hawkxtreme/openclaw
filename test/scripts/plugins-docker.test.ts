import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "e2e", "plugins-docker.sh");

describe("scripts/e2e/plugins-docker.sh", () => {
  it("passes explicit plugin model env into the container", async () => {
    const script = await readFile(SCRIPT, "utf8");

    expect(script).toContain('DOCKER_ENV_ARGS+=(-e OPENCLAW_OPENWEBUI_MODEL)');
    expect(script).toContain('DOCKER_ENV_ARGS+=(-e OPENCLAW_PLUGIN_COMMAND_MODEL)');
  });
});
