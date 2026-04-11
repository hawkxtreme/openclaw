import fs from "node:fs";
import type { ConfigFileSnapshot } from "../config/config.js";
import {
  isNixMode,
  loadConfig,
  readConfigFileSnapshot,
  resolveConfigPath,
  resolveConfigSnapshotHash,
} from "../config/config.js";

export type GatewayStartupConfigSnapshot = Pick<
  ConfigFileSnapshot,
  "config" | "exists" | "hash" | "issues" | "legacyIssues" | "path" | "valid"
>;

function toGatewayStartupConfigSnapshot(
  snapshot: ConfigFileSnapshot,
): GatewayStartupConfigSnapshot {
  return {
    config: snapshot.config,
    exists: snapshot.exists,
    hash: snapshot.hash,
    issues: snapshot.issues,
    legacyIssues: snapshot.legacyIssues,
    path: snapshot.path,
    valid: snapshot.valid,
  };
}

export async function readGatewayStartupConfigSnapshot(): Promise<GatewayStartupConfigSnapshot> {
  if (isNixMode) {
    return toGatewayStartupConfigSnapshot(await readConfigFileSnapshot());
  }

  try {
    const config = loadConfig();
    const configPath = resolveConfigPath();
    const exists = fs.existsSync(configPath);
    const raw = exists ? fs.readFileSync(configPath, "utf8") : null;
    return {
      config,
      exists,
      hash: resolveConfigSnapshotHash({ raw }) ?? undefined,
      issues: [],
      legacyIssues: [],
      path: configPath,
      valid: true,
    };
  } catch {
    return toGatewayStartupConfigSnapshot(await readConfigFileSnapshot());
  }
}
