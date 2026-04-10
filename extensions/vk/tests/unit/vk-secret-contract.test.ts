import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { createResolverContext } from "../../../../src/secrets/runtime-shared.js";
import { collectRuntimeConfigAssignments } from "../../src/secret-contract.js";

function asConfig(value: unknown): OpenClawConfig {
  return value as OpenClawConfig;
}

function envRef(id: string) {
  return { source: "env" as const, provider: "default", id };
}

describe("vk secret contract", () => {
  it("collects the inherited top-level VK token for enabled long-poll accounts", () => {
    const config = asConfig({
      channels: {
        vk: {
          enabled: true,
          accessToken: envRef("VK_GROUP_TOKEN"),
          accounts: {
            support: {
              enabled: true,
              groupId: 77,
            },
          },
        },
      },
    });
    const context = createResolverContext({
      sourceConfig: config,
      env: {},
    });

    collectRuntimeConfigAssignments({
      config,
      defaults: undefined,
      context,
    });

    expect(context.assignments).toHaveLength(1);
    expect(context.assignments[0]?.path).toBe("channels.vk.accessToken");
  });

  it("collects account-local VK tokens when the account owns its token", () => {
    const config = asConfig({
      channels: {
        vk: {
          enabled: true,
          accounts: {
            support: {
              enabled: true,
              groupId: 77,
              accessToken: envRef("VK_SUPPORT_TOKEN"),
            },
          },
        },
      },
    });
    const context = createResolverContext({
      sourceConfig: config,
      env: {},
    });

    collectRuntimeConfigAssignments({
      config,
      defaults: undefined,
      context,
    });

    expect(context.assignments).toHaveLength(1);
    expect(context.assignments[0]?.path).toBe("channels.vk.accounts.support.accessToken");
  });
});
