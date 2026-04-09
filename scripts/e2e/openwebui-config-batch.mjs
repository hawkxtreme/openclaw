import { pathToFileURL } from "node:url";
import { buildOpenAiCompatibleProviderConfig } from "./openai-compatible-provider.mjs";

export function buildOpenWebUiConfigBatch(params) {
  const resolved = buildOpenAiCompatibleProviderConfig({
    apiKey: params.apiKey,
    baseUrl: params.openAiBaseUrl,
    model: params.model,
  });
  const providerEntries = Object.entries(resolved.providers).flatMap(([providerId, config]) =>
    Object.entries(config).map(([key, value]) => ({
      path: `models.providers.${providerId}.${key}`,
      value,
    })),
  );

  return [
    ...providerEntries,
    { path: "gateway.controlUi.enabled", value: false },
    { path: "gateway.mode", value: "local" },
    { path: "gateway.bind", value: "lan" },
    { path: "gateway.auth.mode", value: "token" },
    { path: "gateway.auth.token", value: params.gatewayToken },
    { path: "gateway.http.endpoints.chatCompletions.enabled", value: true },
    { path: "agents.defaults.model.primary", value: resolved.primaryModel },
  ];
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  const payload = buildOpenWebUiConfigBatch({
    apiKey: process.argv[2],
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    model: process.env.OPENCLAW_OPENWEBUI_MODEL,
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
  });

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
