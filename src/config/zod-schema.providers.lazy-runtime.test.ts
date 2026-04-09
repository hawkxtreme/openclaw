import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../../test/helpers/import-fresh.ts";

const validateJsonSchemaValueMock = vi.hoisted(() =>
  vi.fn((params: { value: unknown }) => ({
    ok: true as const,
    value: params.value,
  })),
);

describe("ChannelsSchema bundled runtime loading", () => {
  beforeEach(() => {
    validateJsonSchemaValueMock.mockClear();
    vi.doMock("../plugins/schema-validator.js", () => ({
      validateJsonSchemaValue: (params: unknown) => validateJsonSchemaValueMock(params as never),
    }));
    vi.doMock("./bundled-channel-config-metadata.generated.js", () => ({
      GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA: [
        {
          pluginId: "discord",
          channelId: "discord",
          label: "Discord",
          description: "Discord channel",
          schema: {
            type: "object",
            properties: {
              dmPolicy: {
                type: "string",
                default: "pairing",
              },
            },
            additionalProperties: true,
          },
        },
      ],
    }));
  });

  it("skips bundled channel runtime discovery when only core channel keys are present", async () => {
    const runtime = await importFreshModule<typeof import("./zod-schema.providers.js")>(
      import.meta.url,
      "./zod-schema.providers.js?scope=channels-core-only",
    );

    const parsed = runtime.ChannelsSchema.parse({
      defaults: {
        groupPolicy: "open",
      },
      modelByChannel: {
        telegram: {
          primary: "gpt-5.4",
        },
      },
    });

    expect(parsed?.defaults?.groupPolicy).toBe("open");
    expect(validateJsonSchemaValueMock).not.toHaveBeenCalled();
  });

  it("validates plugin-owned channel config from generated bundled metadata", async () => {
    const runtime = await importFreshModule<typeof import("./zod-schema.providers.js")>(
      import.meta.url,
      "./zod-schema.providers.js?scope=channels-plugin-owned",
    );

    runtime.ChannelsSchema.parse({
      discord: {},
    });

    expect(validateJsonSchemaValueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: "bundled-channel:discord",
        applyDefaults: true,
        value: {},
      }),
    );
  });
});
