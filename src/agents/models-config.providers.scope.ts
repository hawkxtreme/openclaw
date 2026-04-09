import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { resolveOwningPluginIdsForProvider } from "../plugins/providers.js";

export const IMPLICIT_PROVIDER_ENV_TO_PROVIDER_IDS: Record<string, string[]> = {
  AI_GATEWAY_API_KEY: ["vercel-ai-gateway"],
  ANTHROPIC_VERTEX_PROJECT_ID: ["anthropic-vertex"],
  ANTHROPIC_VERTEX_USE_GCP_METADATA: ["anthropic-vertex"],
  AWS_ACCESS_KEY_ID: ["amazon-bedrock"],
  AWS_BEARER_TOKEN_BEDROCK: ["amazon-bedrock"],
  AWS_CONFIG_FILE: ["amazon-bedrock"],
  AWS_DEFAULT_REGION: ["amazon-bedrock"],
  AWS_PROFILE: ["amazon-bedrock"],
  AWS_REGION: ["amazon-bedrock"],
  AWS_SECRET_ACCESS_KEY: ["amazon-bedrock"],
  AWS_SESSION_TOKEN: ["amazon-bedrock"],
  AWS_SHARED_CREDENTIALS_FILE: ["amazon-bedrock"],
  BYTEPLUS_API_KEY: ["byteplus"],
  CHUTES_API_KEY: ["chutes"],
  CHUTES_OAUTH_TOKEN: ["chutes"],
  CLOUD_ML_REGION: ["anthropic-vertex"],
  CLOUDFLARE_AI_GATEWAY_API_KEY: ["cloudflare-ai-gateway"],
  COPILOT_GITHUB_TOKEN: ["github-copilot"],
  GEMINI_API_KEY: ["google"],
  GITHUB_TOKEN: ["github-copilot"],
  GH_TOKEN: ["github-copilot"],
  GOOGLE_APPLICATION_CREDENTIALS: ["anthropic-vertex"],
  GOOGLE_CLOUD_LOCATION: ["anthropic-vertex"],
  GOOGLE_CLOUD_PROJECT: ["anthropic-vertex"],
  GOOGLE_CLOUD_PROJECT_ID: ["anthropic-vertex"],
  HF_TOKEN: ["huggingface"],
  HUGGINGFACE_HUB_TOKEN: ["huggingface"],
  KILOCODE_API_KEY: ["kilocode"],
  KIMI_API_KEY: ["moonshot", "kimi"],
  KIMICODE_API_KEY: ["kimi-coding"],
  MINIMAX_API_KEY: ["minimax"],
  MINIMAX_OAUTH_TOKEN: ["minimax"],
  MODELSTUDIO_API_KEY: ["chutes"],
  MOONSHOT_API_KEY: ["moonshot"],
  NVIDIA_API_KEY: ["nvidia"],
  OLLAMA_API_KEY: ["ollama"],
  OPENAI_API_KEY: ["openai"],
  OPENROUTER_API_KEY: ["openrouter"],
  QIANFAN_API_KEY: ["qianfan"],
  STEPFUN_API_KEY: ["stepfun"],
  SYNTHETIC_API_KEY: ["custom-proxy"],
  TOGETHER_API_KEY: ["together"],
  VENICE_API_KEY: ["venice"],
  VLLM_API_KEY: ["vllm"],
  VOLCANO_ENGINE_API_KEY: ["volcengine"],
  XIAOMI_API_KEY: ["xiaomi"],
};

async function inferAuthProfileProviderIds(agentDir?: string): Promise<string[]> {
  if (!agentDir) {
    return [];
  }
  try {
    const raw = await fs.readFile(path.join(agentDir, "auth-profiles.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      profiles?: Record<string, { provider?: string }>;
      order?: Record<string, unknown>;
    };
    const providers = new Set<string>();
    for (const providerId of Object.keys(parsed.order ?? {})) {
      if (providerId.trim()) {
        providers.add(providerId.trim());
      }
    }
    for (const profile of Object.values(parsed.profiles ?? {})) {
      const providerId = profile?.provider?.trim();
      if (providerId) {
        providers.add(providerId);
      }
    }
    return [...providers];
  } catch {
    return [];
  }
}

export async function inferImplicitProviderPluginIds(params: {
  agentDir?: string;
  config?: OpenClawConfig;
  explicitProviders?: Record<string, unknown> | null;
  env: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<string[]> {
  const providerIds = new Set<string>();
  for (const providerId of Object.keys(params.config?.models?.providers ?? {})) {
    if (providerId.trim()) {
      providerIds.add(providerId.trim());
    }
  }
  for (const providerId of Object.keys(params.explicitProviders ?? {})) {
    if (providerId.trim()) {
      providerIds.add(providerId.trim());
    }
  }
  const legacyGrokApiKey =
    params.config?.tools?.web?.search &&
    typeof params.config.tools.web.search === "object" &&
    "grok" in params.config.tools.web.search
      ? (params.config.tools.web.search.grok as { apiKey?: unknown } | undefined)?.apiKey
      : undefined;
  if (legacyGrokApiKey !== undefined && params.config?.plugins?.entries?.xai?.enabled !== false) {
    providerIds.add("xai");
  }
  for (const [envVar, mappedProviderIds] of Object.entries(IMPLICIT_PROVIDER_ENV_TO_PROVIDER_IDS)) {
    if (!params.env[envVar]?.trim()) {
      continue;
    }
    for (const providerId of mappedProviderIds) {
      providerIds.add(providerId);
    }
  }
  for (const providerId of await inferAuthProfileProviderIds(params.agentDir)) {
    providerIds.add(providerId);
  }
  for (const [pluginId, entry] of Object.entries(params.config?.plugins?.entries ?? {})) {
    if (!pluginId.trim() || entry?.enabled === false) {
      continue;
    }
    const pluginConfig =
      entry.config && typeof entry.config === "object"
        ? (entry.config as { webSearch?: { apiKey?: unknown } })
        : undefined;
    if (pluginConfig?.webSearch?.apiKey !== undefined) {
      providerIds.add(pluginId);
    }
  }
  if (providerIds.size === 0) {
    // Keep ambient no-hint discovery focused on the localhost provider instead
    // of walking every provider catalog on routine runtime paths.
    return ["ollama"];
  }

  const pluginIds = new Set<string>();
  for (const providerId of providerIds) {
    const owningPluginIds =
      resolveOwningPluginIdsForProvider({
        provider: providerId,
        config: params.config,
        workspaceDir: params.workspaceDir,
        env: params.env,
      }) ?? [];
    for (const pluginId of owningPluginIds) {
      pluginIds.add(pluginId);
    }
  }
  return [...pluginIds].toSorted((left, right) => left.localeCompare(right));
}
