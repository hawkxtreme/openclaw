import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const {
  resolvePluginDiscoveryProvidersMock,
  runProviderCatalogMock,
  normalizePluginDiscoveryResultMock,
} = vi.hoisted(() => ({
  resolvePluginDiscoveryProvidersMock: vi.fn(async () => []),
  runProviderCatalogMock: vi.fn(),
  normalizePluginDiscoveryResultMock: vi.fn(() => ({})),
}));

vi.mock("../plugins/provider-discovery.js", () => ({
  resolvePluginDiscoveryProviders: (...args: unknown[]) => resolvePluginDiscoveryProvidersMock(...args),
  groupPluginDiscoveryProvidersByOrder: () => ({
    simple: [],
    profile: [],
    paired: [],
    late: [],
  }),
  normalizePluginDiscoveryResult: (...args: unknown[]) => normalizePluginDiscoveryResultMock(...args),
  runProviderCatalog: (...args: unknown[]) => runProviderCatalogMock(...args),
}));

const CUSTOM_PROXY_CONFIG: OpenClawConfig = {
  models: {
    providers: {
      "custom-proxy": {
        baseUrl: "http://localhost:4000/v1",
        apiKey: "TEST_KEY",
        api: "openai-completions",
        models: [],
      },
    },
  },
};

describe("resolveImplicitProviders discovery scope", () => {
  beforeEach(() => {
    resolvePluginDiscoveryProvidersMock.mockClear();
    resolvePluginDiscoveryProvidersMock.mockResolvedValue([]);
    runProviderCatalogMock.mockReset();
    normalizePluginDiscoveryResultMock.mockClear();
    normalizePluginDiscoveryResultMock.mockReturnValue({});
  });

  it("skips plugin discovery when only explicit non-plugin providers are configured", async () => {
    const { resolveImplicitProviders } = await import("./models-config.providers.implicit.js");
    const agentDir = mkdtempSync(path.join(tmpdir(), "openclaw-test-"));

    const providers = await resolveImplicitProviders({
      agentDir,
      config: CUSTOM_PROXY_CONFIG,
      explicitProviders: CUSTOM_PROXY_CONFIG.models?.providers,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(providers).toEqual({});
    expect(resolvePluginDiscoveryProvidersMock).not.toHaveBeenCalled();
  });
});
