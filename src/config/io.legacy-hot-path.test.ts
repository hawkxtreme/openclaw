import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPluginDoctorLegacyConfigRules = vi.fn(() => [
  {
    path: ["plugins", "legacyExample"],
    message: "legacy plugin config",
  },
]);
const collectChannelLegacyConfigRules = vi.fn(() => [
  {
    path: ["channels", "legacyExample"],
    message: "legacy channel config",
  },
]);

vi.mock("../plugins/doctor-contract-registry.js", () => ({
  listPluginDoctorLegacyConfigRules,
}));
vi.mock("../channels/plugins/legacy-config.js", () => ({
  collectChannelLegacyConfigRules,
}));

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-config-"));
  try {
    await run(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

async function writeConfig(home: string, config: unknown): Promise<void> {
  const configDir = path.join(home, ".openclaw");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "openclaw.json"), JSON.stringify(config, null, 2), "utf8");
}

describe("config io legacy detection hot paths", () => {
  beforeEach(() => {
    listPluginDoctorLegacyConfigRules.mockClear();
    collectChannelLegacyConfigRules.mockClear();
  });

  it("skips plugin doctor legacy rules during loadConfig", async () => {
    await withTempHome(async (home) => {
      await writeConfig(home, { gateway: { port: 18789 } });

      const { createConfigIO } = await import("./io.js");
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      expect(io.loadConfig().gateway?.port).toBe(18789);
      expect(listPluginDoctorLegacyConfigRules).not.toHaveBeenCalled();
      expect(collectChannelLegacyConfigRules).not.toHaveBeenCalled();
    });
  });

  it("still includes plugin doctor legacy rules for config snapshots", async () => {
    await withTempHome(async (home) => {
      await writeConfig(home, { gateway: { port: 18789 } });

      const { createConfigIO } = await import("./io.js");
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      const snapshot = await io.readConfigFileSnapshot();
      expect(snapshot.valid).toBe(true);
      expect(listPluginDoctorLegacyConfigRules).toHaveBeenCalledOnce();
      expect(collectChannelLegacyConfigRules).toHaveBeenCalledOnce();
    });
  });
});
