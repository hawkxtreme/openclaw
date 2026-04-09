import { collectChannelLegacyConfigRules } from "../channels/plugins/legacy-config.js";
import { LEGACY_CONFIG_RULES } from "./legacy.rules.js";
import type { LegacyConfigRule } from "./legacy.shared.js";
import type { LegacyConfigIssue } from "./types.js";

function getPathValue(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

export function findLegacyConfigIssues(
  raw: unknown,
  sourceRaw?: unknown,
  extraRules: LegacyConfigRule[] = [],
  options?: {
    includeChannelRules?: boolean;
  },
): LegacyConfigIssue[] {
  const traceEnabled = process.env.OPENCLAW_DEBUG_CONFIG_VALIDATE === "1";
  const startedAt = traceEnabled ? Date.now() : 0;
  const trace = (step: string) => {
    if (!traceEnabled) {
      return;
    }
    console.warn(`[config-legacy] ${step} elapsedMs=${Date.now() - startedAt}`);
  };
  if (!raw || typeof raw !== "object") {
    return [];
  }
  trace("start");
  const root = raw as Record<string, unknown>;
  const sourceRoot =
    sourceRaw && typeof sourceRaw === "object" ? (sourceRaw as Record<string, unknown>) : root;
  const issues: LegacyConfigIssue[] = [];
  trace("before-channel-rules");
  const channelRules = options?.includeChannelRules === false ? [] : collectChannelLegacyConfigRules();
  trace("after-channel-rules");
  trace("before-scan");
  for (const rule of [
    ...LEGACY_CONFIG_RULES,
    ...channelRules,
    ...extraRules,
  ]) {
    const cursor = getPathValue(root, rule.path);
    if (cursor !== undefined && (!rule.match || rule.match(cursor, root))) {
      if (rule.requireSourceLiteral) {
        const sourceCursor = getPathValue(sourceRoot, rule.path);
        if (sourceCursor === undefined) {
          continue;
        }
        if (rule.match && !rule.match(sourceCursor, sourceRoot)) {
          continue;
        }
      }
      issues.push({ path: rule.path.join("."), message: rule.message });
    }
  }
  trace("after-scan");
  return issues;
}
