import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../../test/helpers/import-fresh.js";

const state = vi.hoisted(() => ({
  commandSecretsRuntimeImported: false,
  createSecretsHandlersImpl: vi.fn(),
  gatewaySecretsHandlersRuntimeImported: false,
  resolveCommandSecretsImpl: vi.fn(),
}));

vi.mock("./server-methods/secrets.js", () => ({
  createSecretsHandlers: (...args: unknown[]) => {
    state.gatewaySecretsHandlersRuntimeImported = true;
    return state.createSecretsHandlersImpl(...args);
  },
}));

vi.mock("../secrets/runtime-command-secrets.js", () => ({
  resolveCommandSecretsFromActiveRuntimeSnapshot: (...args: unknown[]) => {
    state.commandSecretsRuntimeImported = true;
    return state.resolveCommandSecretsImpl(...args);
  },
}));

async function loadModule() {
  return await importFreshModule<typeof import("./server-runtime-loaders.js")>(
    import.meta.url,
    `./server-runtime-loaders.js?scope=${Math.random().toString(36).slice(2)}`,
  );
}

describe("server runtime loaders", () => {
  beforeEach(() => {
    state.commandSecretsRuntimeImported = false;
    state.createSecretsHandlersImpl.mockReset();
    state.gatewaySecretsHandlersRuntimeImported = false;
    state.resolveCommandSecretsImpl.mockReset();
  });

  it("does not import secret runtimes on module load", async () => {
    await loadModule();

    expect(state.gatewaySecretsHandlersRuntimeImported).toBe(false);
    expect(state.commandSecretsRuntimeImported).toBe(false);
  });

  it("loads gateway secrets handlers only when requested", async () => {
    const handlers = {
      "secrets.reload": vi.fn(),
    };
    state.createSecretsHandlersImpl.mockReturnValue(handlers);

    const { createLazySecretsHandlers } = await import("./server-runtime-loaders.js");

    await expect(
      createLazySecretsHandlers({
        reloadSecrets: async () => ({ warningCount: 0 }),
        resolveSecrets: async () => ({
          assignments: [],
          diagnostics: [],
          inactiveRefPaths: [],
        }),
      }),
    ).resolves.toBe(handlers);

    expect(state.gatewaySecretsHandlersRuntimeImported).toBe(true);
  });

  it("loads command secrets runtime only when resolving secrets", async () => {
    const result = {
      assignments: [],
      diagnostics: ["ok"],
      inactiveRefPaths: [],
    };
    state.resolveCommandSecretsImpl.mockReturnValue(result);

    const { resolveCommandSecretsFromRuntimeSnapshot } =
      await import("./server-runtime-loaders.js");

    await expect(
      resolveCommandSecretsFromRuntimeSnapshot({
        commandName: "send",
        targetIds: new Set(["models.providers.*.apiKey"]),
      }),
    ).resolves.toEqual(result);

    expect(state.commandSecretsRuntimeImported).toBe(true);
  });
});
