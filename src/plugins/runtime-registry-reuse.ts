import type { PluginRegistry } from "./registry.js";
import {
  getActivePluginRegistry,
  getActivePluginRegistryKey,
  getActivePluginRegistryWorkspaceDir,
  getActivePluginRuntimeSubagentMode,
} from "./runtime.js";

export function resolveGatewayBindableActiveRegistry(params: {
  workspaceDir?: string;
  requiredPluginIds?: readonly string[];
}): PluginRegistry | undefined {
  const activeRegistry = getActivePluginRegistry();
  if (!activeRegistry || !getActivePluginRegistryKey()) {
    return undefined;
  }
  if (getActivePluginRuntimeSubagentMode() !== "gateway-bindable") {
    return undefined;
  }
  const activeWorkspaceDir = getActivePluginRegistryWorkspaceDir();
  const requestedWorkspaceDir = params.workspaceDir ?? activeWorkspaceDir;
  if (requestedWorkspaceDir !== activeWorkspaceDir) {
    return undefined;
  }
  const requiredPluginIds = params.requiredPluginIds?.filter(Boolean) ?? [];
  if (requiredPluginIds.length === 0) {
    return activeRegistry;
  }
  const loadedPluginIds = new Set(
    activeRegistry.plugins
      .filter((plugin) => plugin.status === "loaded")
      .map((plugin) => plugin.id),
  );
  return requiredPluginIds.every((pluginId) => loadedPluginIds.has(pluginId))
    ? activeRegistry
    : undefined;
}
