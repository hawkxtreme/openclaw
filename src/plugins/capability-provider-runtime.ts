import type { OpenClawConfig } from "../config/config.js";
import { loadBundledCapabilityRuntimeRegistry } from "./bundled-capability-runtime.js";
import {
  withBundledPluginEnablementCompat,
  withBundledPluginVitestCompat,
} from "./bundled-compat.js";
import { hasExplicitPluginConfig, normalizePluginsConfigWithResolver } from "./config-policy.js";
import { resolveRuntimePluginRegistry } from "./loader.js";
import { loadPluginManifestRegistry } from "./manifest-registry.js";
import type { PluginRegistry } from "./registry.js";

type CapabilityProviderRegistryKey =
  | "memoryEmbeddingProviders"
  | "speechProviders"
  | "realtimeTranscriptionProviders"
  | "realtimeVoiceProviders"
  | "mediaUnderstandingProviders"
  | "imageGenerationProviders"
  | "videoGenerationProviders"
  | "musicGenerationProviders";

type CapabilityContractKey =
  | "memoryEmbeddingProviders"
  | "speechProviders"
  | "realtimeTranscriptionProviders"
  | "realtimeVoiceProviders"
  | "mediaUnderstandingProviders"
  | "imageGenerationProviders"
  | "videoGenerationProviders"
  | "musicGenerationProviders";

type CapabilityProviderForKey<K extends CapabilityProviderRegistryKey> =
  PluginRegistry[K][number] extends { provider: infer T } ? T : never;

const CAPABILITY_CONTRACT_KEY: Record<CapabilityProviderRegistryKey, CapabilityContractKey> = {
  memoryEmbeddingProviders: "memoryEmbeddingProviders",
  speechProviders: "speechProviders",
  realtimeTranscriptionProviders: "realtimeTranscriptionProviders",
  realtimeVoiceProviders: "realtimeVoiceProviders",
  mediaUnderstandingProviders: "mediaUnderstandingProviders",
  imageGenerationProviders: "imageGenerationProviders",
  videoGenerationProviders: "videoGenerationProviders",
  musicGenerationProviders: "musicGenerationProviders",
};

const bundledCapabilityCompatPluginIdsCache = new WeakMap<PluginRegistry, Map<string, string[]>>();
const bundledCapabilityProvidersCache = new WeakMap<PluginRegistry, Map<string, unknown[]>>();

function createCapabilityTimingTracer(key: CapabilityProviderRegistryKey) {
  const enabled = process.env.OPENCLAW_DEBUG_INGRESS_TIMING === "1";
  const startedAt = enabled ? Date.now() : 0;
  return (step: string) => {
    if (!enabled) {
      return;
    }
    console.warn(`[capability-providers] key=${key} ${step} elapsedMs=${Date.now() - startedAt}`);
  };
}

function hasExplicitCapabilityPluginConfig(params: {
  cfg?: OpenClawConfig;
  pluginIds: readonly string[];
}): boolean {
  const plugins = params.cfg?.plugins;
  if (!plugins) {
    return false;
  }
  const relevantPluginIds = new Set(
    params.pluginIds.map((pluginId) => pluginId.trim()).filter(Boolean),
  );
  const relevantEntries = Object.fromEntries(
    Object.entries(plugins.entries ?? {}).filter(([pluginId]) => relevantPluginIds.has(pluginId)),
  );
  return hasExplicitPluginConfig({
    ...plugins,
    entries: relevantEntries,
  });
}

function buildCapabilityConfigCacheKey(params: {
  key: CapabilityProviderRegistryKey;
  cfg?: OpenClawConfig;
}): string {
  return JSON.stringify({
    key: params.key,
    plugins: normalizePluginsConfigWithResolver(params.cfg?.plugins),
  });
}

function getOrCreateRegistryCache<T>(
  cache: WeakMap<PluginRegistry, Map<string, T>>,
  registry: PluginRegistry,
): Map<string, T> {
  const cached = cache.get(registry);
  if (cached) {
    return cached;
  }
  const created = new Map<string, T>();
  cache.set(registry, created);
  return created;
}

function resolveBundledCapabilityCompatPluginIds(params: {
  key: CapabilityProviderRegistryKey;
  cfg?: OpenClawConfig;
  activeRegistry?: PluginRegistry;
}): string[] {
  if (params.activeRegistry) {
    const cacheKey = buildCapabilityConfigCacheKey(params);
    const cache = getOrCreateRegistryCache(
      bundledCapabilityCompatPluginIdsCache,
      params.activeRegistry,
    );
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const resolved = resolveBundledCapabilityCompatPluginIds({
      key: params.key,
      cfg: params.cfg,
    });
    cache.set(cacheKey, resolved);
    return resolved;
  }
  const contractKey = CAPABILITY_CONTRACT_KEY[params.key];
  return loadPluginManifestRegistry({
    config: params.cfg,
    env: process.env,
  })
    .plugins.filter(
      (plugin) => plugin.origin === "bundled" && (plugin.contracts?.[contractKey]?.length ?? 0) > 0,
    )
    .map((plugin) => plugin.id)
    .toSorted((left, right) => left.localeCompare(right));
}

function resolveCapabilityProviderConfig(params: {
  key: CapabilityProviderRegistryKey;
  cfg?: OpenClawConfig;
}) {
  const pluginIds = resolveBundledCapabilityCompatPluginIds(params);
  const enablementCompat = withBundledPluginEnablementCompat({
    config: params.cfg,
    pluginIds,
  });
  return withBundledPluginVitestCompat({
    config: enablementCompat,
    pluginIds,
    env: process.env,
  });
}

export function resolvePluginCapabilityProviders<K extends CapabilityProviderRegistryKey>(params: {
  key: K;
  cfg?: OpenClawConfig;
}): CapabilityProviderForKey<K>[] {
  const trace = createCapabilityTimingTracer(params.key);
  trace("start");
  const activeRegistry = resolveRuntimePluginRegistry();
  const activeProviders = activeRegistry?.[params.key] ?? [];
  trace(`after-active-registry active=${activeProviders.length}`);
  if (activeProviders.length > 0) {
    trace("return-active");
    return activeProviders.map((entry) => entry.provider) as CapabilityProviderForKey<K>[];
  }
  trace("before-resolve-bundled-plugin-ids");
  const pluginIds = resolveBundledCapabilityCompatPluginIds({
    ...params,
    activeRegistry,
  });
  trace(`after-resolve-bundled-plugin-ids count=${pluginIds.length}`);
  if (
    activeRegistry &&
    !hasExplicitCapabilityPluginConfig({ cfg: params.cfg, pluginIds }) &&
    pluginIds.length > 0
  ) {
    const cache = getOrCreateRegistryCache(bundledCapabilityProvidersCache, activeRegistry);
    const providersCacheKey = JSON.stringify({
      key: params.key,
      pluginIds,
    });
    const cachedProviders = cache.get(providersCacheKey);
    if (cachedProviders) {
      trace(`return-cached-bundled-capability-runtime providers=${cachedProviders.length}`);
      return cachedProviders as CapabilityProviderForKey<K>[];
    }
    trace("before-bundled-capability-runtime");
    const registry = loadBundledCapabilityRuntimeRegistry({
      pluginIds,
      env: process.env,
    });
    const providers = registry?.[params.key] ?? [];
    trace(`after-bundled-capability-runtime providers=${providers.length}`);
    const resolvedProviders = (registry?.[params.key] ?? []).map(
      (entry) => entry.provider,
    ) as CapabilityProviderForKey<K>[];
    cache.set(providersCacheKey, resolvedProviders);
    return resolvedProviders;
  }
  trace("before-full-compat-loader");
  const compatConfig = resolveCapabilityProviderConfig({ key: params.key, cfg: params.cfg });
  const loadOptions = compatConfig === undefined ? undefined : { config: compatConfig };
  const registry = resolveRuntimePluginRegistry(loadOptions);
  trace(`after-full-compat-loader providers=${registry?.[params.key]?.length ?? 0}`);
  return (registry?.[params.key] ?? []).map(
    (entry) => entry.provider,
  ) as CapabilityProviderForKey<K>[];
}
