import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { createEmptyPluginRegistry } from "./registry.js";

type MockManifestRegistry = {
  plugins: Array<Record<string, unknown>>;
  diagnostics: unknown[];
};

function createEmptyMockManifestRegistry(): MockManifestRegistry {
  return { plugins: [], diagnostics: [] };
}

const mocks = vi.hoisted(() => ({
  resolveRuntimePluginRegistry: vi.fn<
    (params?: unknown) => ReturnType<typeof createEmptyPluginRegistry> | undefined
  >(() => undefined),
  loadPluginManifestRegistry: vi.fn<() => MockManifestRegistry>(() =>
    createEmptyMockManifestRegistry(),
  ),
  withBundledPluginEnablementCompat: vi.fn(({ config }) => config),
  withBundledPluginVitestCompat: vi.fn(({ config }) => config),
  loadBundledCapabilityRuntimeRegistry: vi.fn<
    (params: { pluginIds: string[]; env?: NodeJS.ProcessEnv }) => ReturnType<typeof createEmptyPluginRegistry>
  >(() => createEmptyPluginRegistry()),
  hasExplicitPluginConfig: vi.fn(() => false),
}));

vi.mock("./loader.js", () => ({
  resolveRuntimePluginRegistry: mocks.resolveRuntimePluginRegistry,
}));

vi.mock("./manifest-registry.js", () => ({
  loadPluginManifestRegistry: mocks.loadPluginManifestRegistry,
}));

vi.mock("./bundled-compat.js", () => ({
  withBundledPluginEnablementCompat: mocks.withBundledPluginEnablementCompat,
  withBundledPluginVitestCompat: mocks.withBundledPluginVitestCompat,
}));

vi.mock("./bundled-capability-runtime.js", () => ({
  loadBundledCapabilityRuntimeRegistry: mocks.loadBundledCapabilityRuntimeRegistry,
}));

vi.mock("./config-policy.js", () => ({
  hasExplicitPluginConfig: mocks.hasExplicitPluginConfig,
}));

let resolvePluginCapabilityProviders: typeof import("./capability-provider-runtime.js").resolvePluginCapabilityProviders;

function expectResolvedCapabilityProviderIds(providers: Array<{ id: string }>, expected: string[]) {
  expect(providers.map((provider) => provider.id)).toEqual(expected);
}

function expectNoResolvedCapabilityProviders(providers: Array<{ id: string }>) {
  expectResolvedCapabilityProviderIds(providers, []);
}

function expectBundledCompatLoadPath(params: {
  cfg: OpenClawConfig;
  enablementCompat: {
    plugins: {
      allow?: string[];
      entries: { openai: { enabled: boolean } };
    };
  };
}) {
  expect(mocks.loadPluginManifestRegistry).toHaveBeenCalledWith({
    config: params.cfg,
    env: process.env,
  });
  expect(mocks.withBundledPluginEnablementCompat).toHaveBeenCalledWith({
    config: params.cfg,
    pluginIds: ["openai"],
  });
  expect(mocks.withBundledPluginVitestCompat).toHaveBeenCalledWith({
    config: params.enablementCompat,
    pluginIds: ["openai"],
    env: process.env,
  });
  expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
    config: params.enablementCompat,
  });
}

function createCompatChainConfig() {
  const cfg = { plugins: { allow: ["custom-plugin"] } } as OpenClawConfig;
  const enablementCompat = {
    plugins: {
      allow: ["custom-plugin"],
      entries: { openai: { enabled: true } },
    },
  };
  return { cfg, enablementCompat };
}

function setBundledCapabilityFixture(contractKey: string) {
  mocks.loadPluginManifestRegistry.mockReturnValue({
    plugins: [
      {
        id: "openai",
        origin: "bundled",
        contracts: { [contractKey]: ["openai"] },
      },
      {
        id: "custom-plugin",
        origin: "workspace",
        contracts: {},
      },
    ] as never,
    diagnostics: [],
  });
}

function expectCompatChainApplied(params: {
  key:
    | "memoryEmbeddingProviders"
    | "speechProviders"
    | "realtimeTranscriptionProviders"
    | "realtimeVoiceProviders"
    | "mediaUnderstandingProviders"
    | "imageGenerationProviders";
  contractKey: string;
  cfg: OpenClawConfig;
  enablementCompat: {
    plugins: {
      allow?: string[];
      entries: { openai: { enabled: boolean } };
    };
  };
}) {
  setBundledCapabilityFixture(params.contractKey);
  mocks.withBundledPluginEnablementCompat.mockReturnValue(params.enablementCompat);
  mocks.withBundledPluginVitestCompat.mockReturnValue(params.enablementCompat);
  expectNoResolvedCapabilityProviders(
    resolvePluginCapabilityProviders({ key: params.key, cfg: params.cfg }),
  );
  expectBundledCompatLoadPath(params);
}

describe("resolvePluginCapabilityProviders", () => {
  beforeAll(async () => {
    ({ resolvePluginCapabilityProviders } = await import("./capability-provider-runtime.js"));
  });

  beforeEach(() => {
    mocks.resolveRuntimePluginRegistry.mockReset();
    mocks.resolveRuntimePluginRegistry.mockReturnValue(undefined);
    mocks.loadPluginManifestRegistry.mockReset();
    mocks.loadPluginManifestRegistry.mockReturnValue(createEmptyMockManifestRegistry());
    mocks.withBundledPluginEnablementCompat.mockReset();
    mocks.withBundledPluginEnablementCompat.mockImplementation(({ config }) => config);
    mocks.withBundledPluginVitestCompat.mockReset();
    mocks.withBundledPluginVitestCompat.mockImplementation(({ config }) => config);
    mocks.loadBundledCapabilityRuntimeRegistry.mockReset();
    mocks.loadBundledCapabilityRuntimeRegistry.mockReturnValue(createEmptyPluginRegistry());
    mocks.hasExplicitPluginConfig.mockReset();
    mocks.hasExplicitPluginConfig.mockReturnValue(false);
  });

  it("uses the active registry when capability providers are already loaded", () => {
    const active = createEmptyPluginRegistry();
    active.speechProviders.push({
      pluginId: "openai",
      pluginName: "openai",
      source: "test",
      provider: {
        id: "openai",
        label: "openai",
        isConfigured: () => true,
        synthesize: async () => ({
          audioBuffer: Buffer.from("x"),
          outputFormat: "mp3",
          voiceCompatible: false,
          fileExtension: ".mp3",
        }),
      },
    } as never);
    mocks.resolveRuntimePluginRegistry.mockReturnValue(active);

    const providers = resolvePluginCapabilityProviders({ key: "speechProviders" });

    expectResolvedCapabilityProviderIds(providers, ["openai"]);
    expect(mocks.loadPluginManifestRegistry).not.toHaveBeenCalled();
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith();
  });

  it("keeps active capability providers even when cfg is passed", () => {
    const active = createEmptyPluginRegistry();
    active.speechProviders.push({
      pluginId: "microsoft",
      pluginName: "microsoft",
      source: "test",
      provider: {
        id: "microsoft",
        label: "microsoft",
        aliases: ["edge"],
        isConfigured: () => true,
        synthesize: async () => ({
          audioBuffer: Buffer.from("x"),
          outputFormat: "mp3",
          voiceCompatible: false,
          fileExtension: ".mp3",
        }),
      },
    } as never);
    mocks.resolveRuntimePluginRegistry.mockImplementation((params?: unknown) =>
      params === undefined ? active : createEmptyPluginRegistry(),
    );

    const providers = resolvePluginCapabilityProviders({
      key: "speechProviders",
      cfg: { messages: { tts: { provider: "edge" } } } as OpenClawConfig,
    });

    expectResolvedCapabilityProviderIds(providers, ["microsoft"]);
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith();
    expect(mocks.resolveRuntimePluginRegistry).not.toHaveBeenCalledWith({
      config: expect.anything(),
    });
  });

  it.each([
    ["memoryEmbeddingProviders", "memoryEmbeddingProviders"],
    ["speechProviders", "speechProviders"],
    ["realtimeTranscriptionProviders", "realtimeTranscriptionProviders"],
    ["realtimeVoiceProviders", "realtimeVoiceProviders"],
    ["mediaUnderstandingProviders", "mediaUnderstandingProviders"],
    ["imageGenerationProviders", "imageGenerationProviders"],
  ] as const)("applies bundled compat before fallback loading for %s", (key, contractKey) => {
    const { cfg, enablementCompat } = createCompatChainConfig();
    expectCompatChainApplied({
      key,
      contractKey,
      cfg,
      enablementCompat,
    });
  });

  it("does not re-add bundled capability plugins excluded by an explicit allowlist", () => {
    const cfg = { plugins: { allow: ["custom-plugin"] } } as OpenClawConfig;
    const enablementCompat = {
      plugins: {
        allow: ["custom-plugin"],
        entries: { openai: { enabled: true } },
      },
    };

    setBundledCapabilityFixture("speechProviders");
    mocks.withBundledPluginEnablementCompat.mockReturnValue(enablementCompat);
    mocks.withBundledPluginVitestCompat.mockReturnValue(enablementCompat);

    expectNoResolvedCapabilityProviders(
      resolvePluginCapabilityProviders({ key: "speechProviders", cfg }),
    );

    expect(mocks.withBundledPluginEnablementCompat).toHaveBeenCalledWith({
      config: cfg,
      pluginIds: ["openai"],
    });
    expect(mocks.withBundledPluginVitestCompat).toHaveBeenCalledWith({
      config: enablementCompat,
      pluginIds: ["openai"],
      env: process.env,
    });
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
      config: enablementCompat,
    });
  });

  it("uses bundled capability runtime when the active registry is loaded without explicit plugin config", () => {
    const active = createEmptyPluginRegistry();
    const bundled = createEmptyPluginRegistry();
    bundled.mediaUnderstandingProviders.push({
      pluginId: "google",
      pluginName: "google",
      source: "test",
      provider: {
        id: "google",
        capabilities: ["image"],
        describeImage: vi.fn(),
      },
    } as never);
    mocks.resolveRuntimePluginRegistry.mockReturnValue(active);
    setBundledCapabilityFixture("mediaUnderstandingProviders");
    mocks.loadBundledCapabilityRuntimeRegistry.mockReturnValue(bundled);

    const providers = resolvePluginCapabilityProviders({
      key: "mediaUnderstandingProviders",
      cfg: {} as OpenClawConfig,
    });

    expectResolvedCapabilityProviderIds(providers, ["google"]);
    expect(mocks.loadBundledCapabilityRuntimeRegistry).toHaveBeenCalledWith({
      pluginIds: ["openai"],
      env: process.env,
    });
    expect(mocks.withBundledPluginEnablementCompat).not.toHaveBeenCalled();
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith();
    expect(mocks.resolveRuntimePluginRegistry).not.toHaveBeenCalledWith({
      config: expect.anything(),
    });
  });

  it("loads bundled capability providers even without an explicit cfg", () => {
    const active = createEmptyPluginRegistry();
    const bundled = createEmptyPluginRegistry();
    bundled.mediaUnderstandingProviders.push({
      pluginId: "google",
      pluginName: "google",
      source: "test",
      provider: {
        id: "google",
        capabilities: ["image", "audio", "video"],
        describeImage: vi.fn(),
        transcribeAudio: vi.fn(),
        describeVideo: vi.fn(),
        autoPriority: { image: 30, audio: 40, video: 10 },
        nativeDocumentInputs: ["pdf"],
      },
    } as never);
    setBundledCapabilityFixture("mediaUnderstandingProviders");
    mocks.resolveRuntimePluginRegistry.mockReturnValue(active);
    mocks.loadBundledCapabilityRuntimeRegistry.mockReturnValue(bundled);

    const providers = resolvePluginCapabilityProviders({ key: "mediaUnderstandingProviders" });

    expectResolvedCapabilityProviderIds(providers, ["google"]);
    expect(mocks.loadPluginManifestRegistry).toHaveBeenCalledWith({
      config: undefined,
      env: process.env,
    });
    expect(mocks.loadBundledCapabilityRuntimeRegistry).toHaveBeenCalledWith({
      pluginIds: ["openai"],
      env: process.env,
    });
    expect(mocks.withBundledPluginEnablementCompat).not.toHaveBeenCalled();
  });

  it("keeps the compat loader path when plugin config is explicit", () => {
    const active = createEmptyPluginRegistry();
    const compatConfig = {
      plugins: {
        allow: ["custom-plugin"],
        entries: { openai: { enabled: true } },
      },
    } as OpenClawConfig;
    mocks.resolveRuntimePluginRegistry.mockImplementation((params?: unknown) =>
      params === undefined ? active : createEmptyPluginRegistry(),
    );
    mocks.hasExplicitPluginConfig.mockReturnValue(true);
    setBundledCapabilityFixture("mediaUnderstandingProviders");
    mocks.withBundledPluginEnablementCompat.mockReturnValue(compatConfig);
    mocks.withBundledPluginVitestCompat.mockReturnValue(compatConfig);

    expectNoResolvedCapabilityProviders(
      resolvePluginCapabilityProviders({
        key: "mediaUnderstandingProviders",
        cfg: { plugins: { allow: ["custom-plugin"] } } as OpenClawConfig,
      }),
    );

    expect(mocks.loadBundledCapabilityRuntimeRegistry).not.toHaveBeenCalled();
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
      config: compatConfig,
    });
  });

  it("ignores unrelated plugin entries when deciding whether the fast path is safe", () => {
    const active = createEmptyPluginRegistry();
    const bundled = createEmptyPluginRegistry();
    bundled.mediaUnderstandingProviders.push({
      pluginId: "google",
      pluginName: "google",
      source: "test",
      provider: {
        id: "google",
        capabilities: ["image"],
        describeImage: vi.fn(),
      },
    } as never);
    mocks.resolveRuntimePluginRegistry.mockReturnValue(active);
    setBundledCapabilityFixture("mediaUnderstandingProviders");
    mocks.loadBundledCapabilityRuntimeRegistry.mockReturnValue(bundled);

    resolvePluginCapabilityProviders({
      key: "mediaUnderstandingProviders",
      cfg: { plugins: { entries: { vk: { enabled: true } } } } as OpenClawConfig,
    });

    expect(mocks.hasExplicitPluginConfig).toHaveBeenCalledWith({
      entries: {},
    });
    expect(mocks.loadBundledCapabilityRuntimeRegistry).toHaveBeenCalledWith({
      pluginIds: ["openai"],
      env: process.env,
    });
  });
});
