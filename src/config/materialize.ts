import {
  applyCompactionDefaults,
  applyContextPruningDefaults,
  applyAgentDefaults,
  applyLoggingDefaults,
  applyMessageDefaults,
  applyModelDefaults,
  applySessionDefaults,
  applyTalkConfigNormalization,
} from "./defaults.js";
import { normalizeExecSafeBinProfilesInConfig } from "./normalize-exec-safe-bin.js";
import { normalizeConfigPaths } from "./normalize-paths.js";
import type { OpenClawConfig, ResolvedSourceConfig, RuntimeConfig } from "./types.js";

export type ConfigMaterializationMode = "load" | "missing" | "snapshot";

type MaterializationProfile = {
  includeCompactionDefaults: boolean;
  includeContextPruningDefaults: boolean;
  includeLoggingDefaults: boolean;
  normalizePaths: boolean;
};

const MATERIALIZATION_PROFILES: Record<ConfigMaterializationMode, MaterializationProfile> = {
  load: {
    includeCompactionDefaults: true,
    includeContextPruningDefaults: true,
    includeLoggingDefaults: true,
    normalizePaths: true,
  },
  missing: {
    includeCompactionDefaults: true,
    includeContextPruningDefaults: true,
    includeLoggingDefaults: false,
    normalizePaths: false,
  },
  snapshot: {
    includeCompactionDefaults: false,
    includeContextPruningDefaults: false,
    includeLoggingDefaults: true,
    normalizePaths: true,
  },
};

export function asResolvedSourceConfig(config: OpenClawConfig): ResolvedSourceConfig {
  return config as ResolvedSourceConfig;
}

export function asRuntimeConfig(config: OpenClawConfig): RuntimeConfig {
  return config as RuntimeConfig;
}

export function materializeRuntimeConfig(
  config: OpenClawConfig,
  mode: ConfigMaterializationMode,
): RuntimeConfig {
  const traceEnabled = process.env.OPENCLAW_DEBUG_CONFIG_VALIDATE === "1";
  const startedAt = traceEnabled ? Date.now() : 0;
  const trace = (step: string) => {
    if (!traceEnabled) {
      return;
    }
    console.warn(`[config-materialize] mode=${mode} step=${step} elapsedMs=${Date.now() - startedAt}`);
  };
  const profile = MATERIALIZATION_PROFILES[mode];
  trace("start");
  let next = applyMessageDefaults(config);
  trace("after-message");
  if (profile.includeLoggingDefaults) {
    next = applyLoggingDefaults(next);
    trace("after-logging");
  }
  next = applySessionDefaults(next);
  trace("after-session");
  next = applyAgentDefaults(next);
  trace("after-agent");
  if (profile.includeContextPruningDefaults) {
    next = applyContextPruningDefaults(next);
    trace("after-context-pruning");
  }
  if (profile.includeCompactionDefaults) {
    next = applyCompactionDefaults(next);
    trace("after-compaction");
  }
  next = applyModelDefaults(next);
  trace("after-model");
  next = applyTalkConfigNormalization(next);
  trace("after-talk");
  if (profile.normalizePaths) {
    normalizeConfigPaths(next);
    trace("after-paths");
  }
  normalizeExecSafeBinProfilesInConfig(next);
  trace("after-exec-safe-bin");
  return asRuntimeConfig(next);
}
