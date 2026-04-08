import { beforeEach, describe, expect, it, vi } from "vitest";

type MockSecretTargetRegistryEntry = {
  id: string;
  targetType: string;
  configFile: "openclaw.json" | "auth-profiles.json";
  pathPattern: string;
  secretShape: "secret_input" | "sibling_ref";
  expectedResolvedValue: "string";
  includeInPlan: boolean;
  includeInConfigure: boolean;
  includeInAudit: boolean;
};

function buildEntry(id: string): MockSecretTargetRegistryEntry {
  return {
    id,
    targetType: id,
    configFile: "openclaw.json",
    pathPattern: id,
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  };
}

describe("target registry data import", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads bootstrap channel plugins only for channels without contract artifacts", async () => {
    const bootstrapLoadedIds: string[] = [];
    const bootstrapPlugins = new Map([
      [
        "mattermost",
        {
          id: "mattermost",
          secrets: { secretTargetRegistryEntries: [buildEntry("channels.mattermost.botToken")] },
        },
      ],
      [
        "vk",
        {
          id: "vk",
          secrets: { secretTargetRegistryEntries: [buildEntry("channels.vk.accessToken")] },
        },
      ],
    ]);

    const getBootstrapChannelPlugin = vi.fn((id: string) => {
      bootstrapLoadedIds.push(id);
      return bootstrapPlugins.get(id);
    });

    vi.doMock("../plugins/bundled-plugin-metadata.js", () => ({
      listBundledPluginMetadata: () => [
        {
          dirName: "mattermost",
          manifest: { id: "mattermost", channels: ["mattermost"] },
          publicSurfaceArtifacts: ["contract-api.js"],
        },
        {
          dirName: "vk",
          manifest: { id: "vk", channels: ["vk"] },
          publicSurfaceArtifacts: [],
        },
      ],
    }));

    vi.doMock("../plugin-sdk/facade-runtime.js", () => ({
      loadBundledPluginPublicSurfaceModuleSync: vi.fn(({ dirName }: { dirName: string }) => ({
        secretTargetRegistryEntries: [buildEntry(`channels.${dirName}.contractSecret`)],
      })),
    }));

    vi.doMock("../channels/plugins/bootstrap-registry.js", () => ({
      getBootstrapChannelPlugin,
      iterateBootstrapChannelPlugins: function* () {
        for (const id of ["mattermost", "vk"]) {
          bootstrapLoadedIds.push(id);
          const plugin = bootstrapPlugins.get(id);
          if (plugin) {
            yield plugin;
          }
        }
      },
    }));

    const mod = await import("./target-registry-data.js");

    expect(bootstrapLoadedIds).toEqual(["vk"]);
    expect(getBootstrapChannelPlugin).toHaveBeenCalledTimes(1);
    expect(mod.SECRET_TARGET_REGISTRY.some((entry) => entry.id === "channels.mattermost.contractSecret")).toBe(
      true,
    );
    expect(mod.SECRET_TARGET_REGISTRY.some((entry) => entry.id === "channels.vk.accessToken")).toBe(
      true,
    );
  });

  it("skips bootstrap fallback entirely when channel contract artifacts cover every channel", async () => {
    const bootstrapLoadedIds: string[] = [];
    const getBootstrapChannelPlugin = vi.fn((id: string) => {
      bootstrapLoadedIds.push(id);
      return undefined;
    });

    vi.doMock("../plugins/bundled-plugin-metadata.js", () => ({
      listBundledPluginMetadata: () => [
        {
          dirName: "mattermost",
          manifest: { id: "mattermost", channels: ["mattermost"] },
          publicSurfaceArtifacts: ["contract-api.js"],
        },
        {
          dirName: "vk",
          manifest: { id: "vk", channels: ["vk"] },
          publicSurfaceArtifacts: ["contract-api.js"],
        },
      ],
    }));

    vi.doMock("../plugin-sdk/facade-runtime.js", () => ({
      loadBundledPluginPublicSurfaceModuleSync: vi.fn(({ dirName }: { dirName: string }) => ({
        secretTargetRegistryEntries: [buildEntry(`channels.${dirName}.contractSecret`)],
      })),
    }));

    vi.doMock("../channels/plugins/bootstrap-registry.js", () => ({
      getBootstrapChannelPlugin,
      iterateBootstrapChannelPlugins: function* () {
        throw new Error("bootstrap fallback should not run");
      },
    }));

    const mod = await import("./target-registry-data.js");

    expect(bootstrapLoadedIds).toEqual([]);
    expect(getBootstrapChannelPlugin).not.toHaveBeenCalled();
    expect(mod.SECRET_TARGET_REGISTRY.some((entry) => entry.id === "channels.vk.contractSecret")).toBe(
      true,
    );
  });
});
