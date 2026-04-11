import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../../test/helpers/import-fresh.js";

const state = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  isNixMode: false,
  loadConfigMock: vi.fn(),
  readConfigFileSnapshotMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  resolveConfigPathMock: vi.fn(),
  resolveConfigSnapshotHashMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: (...args: unknown[]) => state.existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => state.readFileSyncMock(...args),
  },
}));

vi.mock("../config/config.js", () => ({
  get isNixMode() {
    return state.isNixMode;
  },
  loadConfig: (...args: unknown[]) => state.loadConfigMock(...args),
  readConfigFileSnapshot: (...args: unknown[]) => state.readConfigFileSnapshotMock(...args),
  resolveConfigPath: (...args: unknown[]) => state.resolveConfigPathMock(...args),
  resolveConfigSnapshotHash: (...args: unknown[]) => state.resolveConfigSnapshotHashMock(...args),
}));

async function loadModule() {
  return await importFreshModule<typeof import("./server-startup-config.js")>(
    import.meta.url,
    `./server-startup-config.js?scope=${Math.random().toString(36).slice(2)}`,
  );
}

describe("server startup config", () => {
  beforeEach(() => {
    state.existsSyncMock.mockReset().mockReturnValue(true);
    state.isNixMode = false;
    state.loadConfigMock.mockReset().mockReturnValue({ gateway: { bind: "lan" } });
    state.readConfigFileSnapshotMock.mockReset();
    state.readFileSyncMock.mockReset().mockReturnValue('{"gateway":{"bind":"lan"}}');
    state.resolveConfigPathMock.mockReset().mockReturnValue("/tmp/openclaw.json");
    state.resolveConfigSnapshotHashMock.mockReset().mockReturnValue("hash123");
  });

  it("uses the fast load path outside nix mode", async () => {
    const { readGatewayStartupConfigSnapshot } = await loadModule();

    await expect(readGatewayStartupConfigSnapshot()).resolves.toEqual({
      config: { gateway: { bind: "lan" } },
      exists: true,
      hash: "hash123",
      issues: [],
      legacyIssues: [],
      path: "/tmp/openclaw.json",
      valid: true,
    });

    expect(state.readConfigFileSnapshotMock).not.toHaveBeenCalled();
  });

  it("falls back to the full config snapshot when fast load fails", async () => {
    const fallbackSnapshot = {
      config: { gateway: { bind: "loopback" } },
      exists: true,
      hash: "fallback",
      issues: [{ path: "gateway.bind", message: "invalid" }],
      legacyIssues: [{ path: "channels.telegram", message: "legacy" }],
      path: "/tmp/fallback.json",
      valid: false,
    };
    state.loadConfigMock.mockImplementation(() => {
      throw new Error("boom");
    });
    state.readConfigFileSnapshotMock.mockResolvedValue(fallbackSnapshot);

    const { readGatewayStartupConfigSnapshot } = await loadModule();

    await expect(readGatewayStartupConfigSnapshot()).resolves.toEqual(fallbackSnapshot);
  });

  it("uses the full snapshot path in nix mode", async () => {
    const fallbackSnapshot = {
      config: {},
      exists: false,
      hash: "nix",
      issues: [],
      legacyIssues: [{ path: "gateway.bind", message: "legacy" }],
      path: "/tmp/nix.json",
      valid: true,
    };
    state.isNixMode = true;
    state.readConfigFileSnapshotMock.mockResolvedValue(fallbackSnapshot);

    const { readGatewayStartupConfigSnapshot } = await loadModule();

    await expect(readGatewayStartupConfigSnapshot()).resolves.toEqual(fallbackSnapshot);
    expect(state.loadConfigMock).not.toHaveBeenCalled();
  });
});
