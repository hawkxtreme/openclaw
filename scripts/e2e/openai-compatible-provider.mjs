const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "openai/gpt-4.1-mini";

export function buildOpenAiCompatibleProviderConfig(params) {
  const rawModel = String(params.model ?? "").trim();
  const primaryModel = rawModel || DEFAULT_OPENAI_MODEL;
  const providerId = primaryModel.split("/", 1)[0]?.trim() || "openai";
  const modelId = primaryModel.includes("/") ? primaryModel.slice(primaryModel.indexOf("/") + 1) : "";
  const baseUrl = String(params.baseUrl ?? "").trim() || DEFAULT_OPENAI_BASE_URL;

  if (providerId === "openai") {
    return {
      primaryModel,
      providers: {
        openai: {
          apiKey: params.apiKey,
          baseUrl,
          models: [],
        },
      },
    };
  }

  return {
    primaryModel,
    providers: {
      [providerId]: {
        api: "openai-completions",
        apiKey: params.apiKey,
        baseUrl,
        models: modelId ? [{ id: modelId, name: modelId }] : [],
      },
    },
  };
}
