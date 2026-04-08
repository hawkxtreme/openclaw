import { afterEach, describe, expect, it, vi } from "vitest";

const getShellEnvAppliedKeysMock = vi.hoisted(() => vi.fn(() => []));
const resolvePluginSetupProviderMock = vi.hoisted(() => vi.fn(() => undefined));
const getEnvApiKeyMock = vi.hoisted(() => vi.fn(() => null));
const candidateResolverMock = vi.hoisted(() => vi.fn(() => ({ broken: ["BROKEN_API_KEY"] })));

vi.mock("../infra/shell-env.js", () => ({
  getShellEnvAppliedKeys: getShellEnvAppliedKeysMock,
}));

vi.mock("../plugins/setup-registry.js", () => ({
  resolvePluginSetupProvider: resolvePluginSetupProviderMock,
}));

vi.mock("@mariozechner/pi-ai", () => ({
  getEnvApiKey: getEnvApiKeyMock,
}));

vi.mock("./model-auth-env-vars.js", () => ({
  PROVIDER_ENV_API_KEY_CANDIDATES: {
    testprovider: ["TEST_PROVIDER_API_KEY"],
  },
  listKnownProviderEnvApiKeyNames: () => ["TEST_PROVIDER_API_KEY"],
  resolveProviderEnvApiKeyCandidates: candidateResolverMock,
}));

describe("resolveEnvApiKey", () => {
  afterEach(() => {
    vi.resetModules();
    getShellEnvAppliedKeysMock.mockClear();
    resolvePluginSetupProviderMock.mockClear();
    getEnvApiKeyMock.mockClear();
    candidateResolverMock.mockClear();
  });

  it("uses the static provider env candidate map without rebuilding it per call", async () => {
    const { resolveEnvApiKey } = await import("./model-auth-env.js");

    const resolved = resolveEnvApiKey("testprovider", {
      TEST_PROVIDER_API_KEY: "test-provider-key",
    } as NodeJS.ProcessEnv);

    expect(resolved).toEqual({
      apiKey: "test-provider-key",
      source: "env: TEST_PROVIDER_API_KEY",
    });
    expect(candidateResolverMock).not.toHaveBeenCalled();
    expect(resolvePluginSetupProviderMock).not.toHaveBeenCalled();
  });
});
