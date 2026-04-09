import { describe, expect, it } from "vitest";

import { buildOpenAiCompatibleProviderConfig } from "../../scripts/e2e/openai-compatible-provider.mjs";

describe("scripts/e2e/openai-compatible-provider.mjs", () => {
  it("keeps OpenAI models on the OpenAI provider by default", () => {
    expect(
      buildOpenAiCompatibleProviderConfig({
        apiKey: "key",
        baseUrl: "",
        model: "openai/gpt-4.1-mini",
      }),
    ).toEqual({
      primaryModel: "openai/gpt-4.1-mini",
      providers: {
        openai: {
          apiKey: "key",
          baseUrl: "https://api.openai.com/v1",
          models: [],
        },
      },
    });
  });

  it("maps proxy models to an OpenAI-compatible custom provider", () => {
    expect(
      buildOpenAiCompatibleProviderConfig({
        apiKey: "key",
        baseUrl: "http://host.docker.internal:8317/v1",
        model: "proxy/gpt-5.4-proxy",
      }),
    ).toEqual({
      primaryModel: "proxy/gpt-5.4-proxy",
      providers: {
        proxy: {
          api: "openai-completions",
          apiKey: "key",
          baseUrl: "http://host.docker.internal:8317/v1",
          models: [{ id: "gpt-5.4-proxy", name: "gpt-5.4-proxy" }],
        },
      },
    });
  });
});
