import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { OpenClawConfig } from "../config/config.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";

vi.mock("../channels/plugins/bootstrap-registry.js", async () => {
  const vkSecrets = await import("../../extensions/vk/src/secret-contract.ts");
  return {
    getBootstrapChannelPlugin: (id: string) =>
      id === "vk"
        ? {
            secrets: {
              collectRuntimeConfigAssignments: vkSecrets.collectRuntimeConfigAssignments,
            },
          }
        : undefined,
  };
});

function asConfig(value: unknown): OpenClawConfig {
  return value as OpenClawConfig;
}

function loadAuthStoreWithProfiles(profiles: AuthProfileStore["profiles"]): AuthProfileStore {
  return {
    version: 1,
    profiles,
  };
}

let clearConfigCache: typeof import("../config/config.js").clearConfigCache;
let clearRuntimeConfigSnapshot: typeof import("../config/config.js").clearRuntimeConfigSnapshot;
let clearSecretsRuntimeSnapshot: typeof import("./runtime.js").clearSecretsRuntimeSnapshot;
let prepareSecretsRuntimeSnapshot: typeof import("./runtime.js").prepareSecretsRuntimeSnapshot;

describe("secrets runtime snapshot VK secret contract", () => {
  beforeAll(async () => {
    ({ clearConfigCache, clearRuntimeConfigSnapshot } = await import("../config/config.js"));
    ({ clearSecretsRuntimeSnapshot, prepareSecretsRuntimeSnapshot } = await import("./runtime.js"));
  });

  afterEach(() => {
    setActivePluginRegistry(createEmptyPluginRegistry());
    clearSecretsRuntimeSnapshot();
    clearRuntimeConfigSnapshot();
    clearConfigCache();
  });

  it("fails when an enabled VK account inherits an unresolved top-level accessToken ref", async () => {
    await expect(
      prepareSecretsRuntimeSnapshot({
        config: asConfig({
          channels: {
            vk: {
              accessToken: {
                source: "env",
                provider: "default",
                id: "MISSING_VK_BASE_TOKEN",
              },
              accounts: {
                work: {
                  enabled: true,
                },
              },
            },
          },
        }),
        env: {},
        agentDirs: ["/tmp/openclaw-agent-main"],
        loadAuthStore: () => loadAuthStoreWithProfiles({}),
      }),
    ).rejects.toThrow('Environment variable "MISSING_VK_BASE_TOKEN" is missing or empty.');
  });

  it("treats top-level VK accessToken refs as inactive when all enabled accounts define their own token source", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        channels: {
          vk: {
            accessToken: {
              source: "env",
              provider: "default",
              id: "UNUSED_VK_BASE_TOKEN",
            },
            accounts: {
              work: {
                enabled: true,
                tokenFile: "/tmp/vk-work-token",
              },
              ops: {
                enabled: true,
                accessToken: {
                  source: "env",
                  provider: "default",
                  id: "VK_OPS_TOKEN",
                },
              },
            },
          },
        },
      }),
      env: {
        VK_OPS_TOKEN: "vk-ops-token",
      },
      agentDirs: ["/tmp/openclaw-agent-main"],
      loadAuthStore: () => loadAuthStoreWithProfiles({}),
    });

    expect(snapshot.config.channels?.vk?.accessToken).toEqual({
      source: "env",
      provider: "default",
      id: "UNUSED_VK_BASE_TOKEN",
    });
    expect(snapshot.config.channels?.vk?.accounts?.ops?.accessToken).toBe("vk-ops-token");
    expect(snapshot.warnings.map((warning) => warning.path)).toContain("channels.vk.accessToken");
  });

  it("treats top-level VK callback.secret refs as inactive when the effective transport is long-poll", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        channels: {
          vk: {
            transport: "long-poll",
            callback: {
              secret: {
                source: "env",
                provider: "default",
                id: "MISSING_VK_CALLBACK_SECRET",
              },
            },
          },
        },
      }),
      env: {},
      agentDirs: ["/tmp/openclaw-agent-main"],
      loadAuthStore: () => loadAuthStoreWithProfiles({}),
    });

    expect(snapshot.config.channels?.vk?.callback?.secret).toEqual({
      source: "env",
      provider: "default",
      id: "MISSING_VK_CALLBACK_SECRET",
    });
    expect(snapshot.warnings.map((warning) => warning.path)).toContain(
      "channels.vk.callback.secret",
    );
  });

  it("keeps top-level VK callback.secret refs active when accounts only override callback.path", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        channels: {
          vk: {
            callback: {
              secret: {
                source: "env",
                provider: "default",
                id: "VK_CALLBACK_SECRET",
              },
            },
            accounts: {
              work: {
                enabled: true,
                callback: {
                  path: "/vk/work",
                },
              },
            },
          },
        },
      }),
      env: {
        VK_CALLBACK_SECRET: "vk-callback-secret",
      },
      agentDirs: ["/tmp/openclaw-agent-main"],
      loadAuthStore: () => loadAuthStoreWithProfiles({}),
    });

    expect(snapshot.config.channels?.vk?.callback?.secret).toBe("vk-callback-secret");
    expect(snapshot.warnings.map((warning) => warning.path)).not.toContain(
      "channels.vk.callback.secret",
    );
  });

  it("treats VK account callback.secret refs as inactive when that account uses long-poll", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        channels: {
          vk: {
            accounts: {
              work: {
                enabled: true,
                transport: "long-poll",
                callback: {
                  secret: {
                    source: "env",
                    provider: "default",
                    id: "MISSING_VK_WORK_CALLBACK_SECRET",
                  },
                },
              },
            },
          },
        },
      }),
      env: {},
      agentDirs: ["/tmp/openclaw-agent-main"],
      loadAuthStore: () => loadAuthStoreWithProfiles({}),
    });

    expect(snapshot.config.channels?.vk?.accounts?.work?.callback?.secret).toEqual({
      source: "env",
      provider: "default",
      id: "MISSING_VK_WORK_CALLBACK_SECRET",
    });
    expect(snapshot.warnings.map((warning) => warning.path)).toContain(
      "channels.vk.accounts.work.callback.secret",
    );
  });
});
