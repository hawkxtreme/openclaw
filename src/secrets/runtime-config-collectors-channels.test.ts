import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { collectChannelConfigAssignments } from "./runtime-config-collectors-channels.js";

const getBootstrapChannelPlugin = vi.hoisted(() => vi.fn());
const listBundledPluginMetadata = vi.hoisted(() => vi.fn());
const loadBundledPluginPublicSurfaceModuleSync = vi.hoisted(() => vi.fn());

vi.mock("../channels/plugins/bootstrap-registry.js", () => ({
  getBootstrapChannelPlugin,
}));

vi.mock("../plugins/bundled-plugin-metadata.js", () => ({
  listBundledPluginMetadata,
}));

vi.mock("../plugin-sdk/facade-runtime.js", () => ({
  loadBundledPluginPublicSurfaceModuleSync,
}));

function createParams(config: OpenClawConfig = { channels: { vk: {} } }) {
  return {
    config,
    defaults: undefined,
    context: {
      sourceConfig: config,
      env: process.env,
      cache: {},
      warnings: [],
      warningKeys: new Set<string>(),
      assignments: [],
    },
  };
}

describe("collectChannelConfigAssignments", () => {
  beforeEach(() => {
    getBootstrapChannelPlugin.mockReset();
    listBundledPluginMetadata.mockReset();
    loadBundledPluginPublicSurfaceModuleSync.mockReset();
  });

  it("prefers channel contract-api collectors when available", () => {
    const collectRuntimeConfigAssignments = vi.fn();
    listBundledPluginMetadata.mockReturnValue([
      {
        dirName: "vk",
        manifest: { channels: ["vk"] },
        publicSurfaceArtifacts: ["contract-api.js"],
      },
    ]);
    loadBundledPluginPublicSurfaceModuleSync.mockReturnValue({
      collectRuntimeConfigAssignments,
    });

    const params = createParams();
    collectChannelConfigAssignments(params);

    expect(loadBundledPluginPublicSurfaceModuleSync).toHaveBeenCalledWith({
      dirName: "vk",
      artifactBasename: "contract-api.js",
    });
    expect(collectRuntimeConfigAssignments).toHaveBeenCalledWith(params);
    expect(getBootstrapChannelPlugin).not.toHaveBeenCalled();
  });

  it("falls back to bootstrap secrets when contract-api is unavailable", () => {
    const bootstrapCollector = vi.fn();
    listBundledPluginMetadata.mockReturnValue([
      {
        dirName: "vk",
        manifest: { channels: ["vk"] },
        publicSurfaceArtifacts: ["contract-api.js"],
      },
    ]);
    loadBundledPluginPublicSurfaceModuleSync.mockImplementation(() => {
      throw new Error("missing contract");
    });
    getBootstrapChannelPlugin.mockReturnValue({
      secrets: {
        collectRuntimeConfigAssignments: bootstrapCollector,
      },
    });

    const params = createParams();
    collectChannelConfigAssignments(params);

    expect(getBootstrapChannelPlugin).toHaveBeenCalledWith("vk");
    expect(bootstrapCollector).toHaveBeenCalledWith(params);
  });
});
