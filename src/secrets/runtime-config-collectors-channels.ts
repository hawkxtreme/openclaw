import { getBootstrapChannelPlugin } from "../channels/plugins/bootstrap-registry.js";
import type { OpenClawConfig } from "../config/config.js";
import { loadBundledPluginPublicSurfaceModuleSync } from "../plugin-sdk/facade-runtime.js";
import { listBundledPluginMetadata } from "../plugins/bundled-plugin-metadata.js";
import { type ResolverContext, type SecretDefaults } from "./runtime-shared.js";

type ChannelSecretContract = {
  collectRuntimeConfigAssignments?: (params: {
    config: OpenClawConfig;
    defaults: SecretDefaults | undefined;
    context: ResolverContext;
  }) => void;
};

function resolveChannelSecretContract(channelId: string): ChannelSecretContract | null {
  const metadata = listBundledPluginMetadata({
    includeChannelConfigs: false,
    includeSyntheticChannelConfigs: false,
  }).find((entry) => entry.manifest.channels?.includes(channelId));
  if (!metadata?.publicSurfaceArtifacts?.includes("contract-api.js")) {
    return null;
  }

  try {
    return loadBundledPluginPublicSurfaceModuleSync<ChannelSecretContract>({
      dirName: metadata.dirName,
      artifactBasename: "contract-api.js",
    });
  } catch {
    return null;
  }
}

export function collectChannelConfigAssignments(params: {
  config: OpenClawConfig;
  defaults: SecretDefaults | undefined;
  context: ResolverContext;
}): void {
  const channelIds = Object.keys(params.config.channels ?? {});
  if (channelIds.length === 0) {
    return;
  }
  for (const channelId of channelIds) {
    const contract = resolveChannelSecretContract(channelId);
    if (contract?.collectRuntimeConfigAssignments) {
      contract.collectRuntimeConfigAssignments(params);
      continue;
    }

    const plugin = getBootstrapChannelPlugin(channelId);
    plugin?.secrets?.collectRuntimeConfigAssignments?.(params);
  }
}
