import { describe, expect, it } from "vitest";

import { buildOpenWebUiConfigBatch } from "../../scripts/e2e/openwebui-config-batch.mjs";

describe("scripts/e2e/openwebui-config-batch.mjs", () => {
  it("builds the default OpenAI provider config for openai/* models", () => {
    const entries = buildOpenWebUiConfigBatch({
      apiKey: "openai-key",
      gatewayToken: "gateway-token",
      model: "openai/gpt-4.1-mini",
      openAiBaseUrl: "",
    });

    expect(entries).toContainEqual({
      path: "models.providers.openai.apiKey",
      value: "openai-key",
    });
    expect(entries).toContainEqual({
      path: "models.providers.openai.baseUrl",
      value: "https://api.openai.com/v1",
    });
    expect(entries).toContainEqual({
      path: "models.providers.openai.models",
      value: [],
    });
    expect(entries).not.toContainEqual({
      path: "models.providers.proxy.api",
      value: "openai-completions",
    });
  });

  it("builds an OpenAI-compatible custom provider config for proxy/* models", () => {
    const entries = buildOpenWebUiConfigBatch({
      apiKey: "proxy-key",
      gatewayToken: "gateway-token",
      model: "proxy/gpt-5.4-proxy",
      openAiBaseUrl: "http://host.docker.internal:8317/v1",
    });

    expect(entries).toContainEqual({
      path: "models.providers.proxy.api",
      value: "openai-completions",
    });
    expect(entries).toContainEqual({
      path: "models.providers.proxy.apiKey",
      value: "proxy-key",
    });
    expect(entries).toContainEqual({
      path: "models.providers.proxy.baseUrl",
      value: "http://host.docker.internal:8317/v1",
    });
    expect(entries).toContainEqual({
      path: "models.providers.proxy.models",
      value: [{ id: "gpt-5.4-proxy", name: "gpt-5.4-proxy" }],
    });
    expect(entries).not.toContainEqual({
      path: "models.providers.openai.apiKey",
      value: "proxy-key",
    });
  });
});
