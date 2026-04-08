import { listBundledChannelPluginIds } from "./bundled-ids.js";
import { getBundledChannelPlugin, getBundledChannelSetupPlugin } from "./bundled.js";
import type { ChannelId, ChannelPlugin } from "./types.js";

type CachedBootstrapPlugins = {
  sortedIds: string[];
  byId: Map<string, ChannelPlugin>;
  missingIds: Set<string>;
};

function preferDefined<T>(primary: T | undefined, fallback: T | undefined): T | undefined {
  return primary ?? fallback;
}

let cachedBootstrapPlugins: CachedBootstrapPlugins | null = null;

function mergePluginSection<T>(
  runtimeValue: T | undefined,
  setupValue: T | undefined,
): T | undefined {
  if (
    runtimeValue &&
    setupValue &&
    typeof runtimeValue === "object" &&
    typeof setupValue === "object"
  ) {
    return {
      ...(runtimeValue as Record<string, unknown>),
      ...(setupValue as Record<string, unknown>),
    } as T;
  }
  return setupValue ?? runtimeValue;
}

function mergeBootstrapPlugin(
  runtimePlugin: ChannelPlugin,
  setupPlugin: ChannelPlugin,
): ChannelPlugin {
  return {
    id: setupPlugin.id ?? runtimePlugin.id,
    meta: mergePluginSection(runtimePlugin.meta, setupPlugin.meta),
    capabilities: mergePluginSection(runtimePlugin.capabilities, setupPlugin.capabilities),
    defaults: mergePluginSection(runtimePlugin.defaults, setupPlugin.defaults),
    setupWizard: preferDefined(setupPlugin.setupWizard, runtimePlugin.setupWizard),
    configSchema: preferDefined(setupPlugin.configSchema, runtimePlugin.configSchema),
    commands: mergePluginSection(runtimePlugin.commands, setupPlugin.commands),
    doctor: mergePluginSection(runtimePlugin.doctor, setupPlugin.doctor),
    reload: mergePluginSection(runtimePlugin.reload, setupPlugin.reload),
    config: mergePluginSection(runtimePlugin.config, setupPlugin.config),
    setup: mergePluginSection(runtimePlugin.setup, setupPlugin.setup),
    pairing: mergePluginSection(runtimePlugin.pairing, setupPlugin.pairing),
    security: mergePluginSection(runtimePlugin.security, setupPlugin.security),
    groups: mergePluginSection(runtimePlugin.groups, setupPlugin.groups),
    mentions: mergePluginSection(runtimePlugin.mentions, setupPlugin.mentions),
    outbound: mergePluginSection(runtimePlugin.outbound, setupPlugin.outbound),
    status: mergePluginSection(runtimePlugin.status, setupPlugin.status),
    gatewayMethods: preferDefined(setupPlugin.gatewayMethods, runtimePlugin.gatewayMethods),
    gateway: mergePluginSection(runtimePlugin.gateway, setupPlugin.gateway),
    auth: mergePluginSection(runtimePlugin.auth, setupPlugin.auth),
    approvalCapability: preferDefined(
      setupPlugin.approvalCapability,
      runtimePlugin.approvalCapability,
    ),
    elevated: mergePluginSection(runtimePlugin.elevated, setupPlugin.elevated),
    lifecycle: mergePluginSection(runtimePlugin.lifecycle, setupPlugin.lifecycle),
    messaging: mergePluginSection(runtimePlugin.messaging, setupPlugin.messaging),
    actions: mergePluginSection(runtimePlugin.actions, setupPlugin.actions),
    secrets: mergePluginSection(runtimePlugin.secrets, setupPlugin.secrets),
    approvals: mergePluginSection(runtimePlugin.approvals, setupPlugin.approvals),
    allowlist: mergePluginSection(runtimePlugin.allowlist, setupPlugin.allowlist),
    bindings: mergePluginSection(runtimePlugin.bindings, setupPlugin.bindings),
    conversationBindings: mergePluginSection(
      runtimePlugin.conversationBindings,
      setupPlugin.conversationBindings,
    ),
    streaming: mergePluginSection(runtimePlugin.streaming, setupPlugin.streaming),
    threading: mergePluginSection(runtimePlugin.threading, setupPlugin.threading),
    agentPrompt: mergePluginSection(runtimePlugin.agentPrompt, setupPlugin.agentPrompt),
    directory: mergePluginSection(runtimePlugin.directory, setupPlugin.directory),
    resolver: mergePluginSection(runtimePlugin.resolver, setupPlugin.resolver),
    heartbeat: mergePluginSection(runtimePlugin.heartbeat, setupPlugin.heartbeat),
    agentTools: preferDefined(setupPlugin.agentTools, runtimePlugin.agentTools),
  } as ChannelPlugin;
}

function buildBootstrapPlugins(): CachedBootstrapPlugins {
  return {
    sortedIds: listBundledChannelPluginIds(),
    byId: new Map(),
    missingIds: new Set(),
  };
}

function getBootstrapPlugins(): CachedBootstrapPlugins {
  cachedBootstrapPlugins ??= buildBootstrapPlugins();
  return cachedBootstrapPlugins;
}

export function listBootstrapChannelPluginIds(): readonly string[] {
  return getBootstrapPlugins().sortedIds;
}

export function* iterateBootstrapChannelPlugins(): IterableIterator<ChannelPlugin> {
  for (const id of listBootstrapChannelPluginIds()) {
    const plugin = getBootstrapChannelPlugin(id);
    if (plugin) {
      yield plugin;
    }
  }
}

export function listBootstrapChannelPlugins(): readonly ChannelPlugin[] {
  return [...iterateBootstrapChannelPlugins()];
}

export function getBootstrapChannelSetupPlugin(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = String(id).trim();
  if (!resolvedId) {
    return undefined;
  }
  return getBundledChannelSetupPlugin(resolvedId);
}

export function* iterateBootstrapChannelSetupPlugins(): IterableIterator<ChannelPlugin> {
  for (const id of listBootstrapChannelPluginIds()) {
    const plugin = getBootstrapChannelSetupPlugin(id);
    if (plugin) {
      yield plugin;
    }
  }
}

export function getBootstrapChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = String(id).trim();
  if (!resolvedId) {
    return undefined;
  }
  const registry = getBootstrapPlugins();
  const cached = registry.byId.get(resolvedId);
  if (cached) {
    return cached;
  }
  if (registry.missingIds.has(resolvedId)) {
    return undefined;
  }
  const runtimePlugin = getBundledChannelPlugin(resolvedId);
  const setupPlugin = getBundledChannelSetupPlugin(resolvedId);
  const provisional = runtimePlugin ?? setupPlugin;
  if (provisional) {
    // Seed the cache before merging so lazy plugin proxies can safely re-enter
    // bootstrap lookups while their real runtime module graph is still loading.
    registry.byId.set(resolvedId, provisional);
  }
  let merged: ChannelPlugin | undefined;
  try {
    merged =
      runtimePlugin && setupPlugin
        ? mergeBootstrapPlugin(runtimePlugin, setupPlugin)
        : provisional;
  } catch (error) {
    registry.byId.delete(resolvedId);
    throw error;
  }
  if (!merged) {
    registry.byId.delete(resolvedId);
    registry.missingIds.add(resolvedId);
    return undefined;
  }
  registry.byId.set(resolvedId, merged);
  return merged;
}

export function clearBootstrapChannelPluginCache(): void {
  cachedBootstrapPlugins = null;
}
