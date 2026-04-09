import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveAuthProfileStore } from "./auth-profiles.js";

async function createAgentDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-pi-env-scan-"));
}

describe("discoverAuthStorage env credential scan", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    vi.resetModules();
    vi.doUnmock("./model-auth-env-vars.js");
    vi.doUnmock("./model-auth-env.js");
  });

  it("only resolves providers whose candidate env vars are currently set", async () => {
    const agentDir = await createAgentDir();
    try {
      saveAuthProfileStore(
        {
          version: 1,
          profiles: {},
        },
        agentDir,
      );
      process.env.MISTRAL_API_KEY = "mistral-env-test-key";

      const resolveEnvApiKey = vi.fn((provider: string) =>
        provider === "mistral" ? { apiKey: "mistral-env-test-key", source: "env" } : null,
      );

      vi.doMock("./model-auth-env-vars.js", () => ({
        resolveProviderEnvApiKeyCandidates: () => ({
          anthropic: ["ANTHROPIC_API_KEY"],
          mistral: ["MISTRAL_API_KEY"],
          "google-vertex": ["GOOGLE_APPLICATION_CREDENTIALS"],
        }),
      }));
      vi.doMock("./model-auth-env.js", () => ({
        resolveEnvApiKey,
      }));

      const { discoverAuthStorage } = await import("./pi-model-discovery.js");
      const authStorage = discoverAuthStorage(agentDir);

      expect(authStorage.hasAuth("mistral")).toBe(true);
      await expect(authStorage.getApiKey("mistral")).resolves.toBe("mistral-env-test-key");
      expect(resolveEnvApiKey).toHaveBeenCalledTimes(1);
      expect(resolveEnvApiKey).toHaveBeenCalledWith("mistral");
    } finally {
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  });
});
