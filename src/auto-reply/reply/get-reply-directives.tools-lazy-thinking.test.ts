import { describe, expect, it, vi } from "vitest";
import { buildModelAliasIndex } from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";
import { buildTestCtx } from "./test-ctx.js";
import { createTypingController } from "./typing.js";

const createModelSelectionStateMock = vi.fn();

vi.mock("./model-selection.js", async (importActual) => {
  const actual = await importActual<typeof import("./model-selection.js")>("./model-selection.js");
  return {
    ...actual,
    createModelSelectionState: (...args: unknown[]) => createModelSelectionStateMock(...args),
  };
});

describe("resolveReplyDirectives /tools lazy model defaults", () => {
  it("does not resolve thinking or reasoning defaults before command handling", async () => {
    const resolveDefaultThinkingLevelMock = vi
      .fn()
      .mockRejectedValue(new Error("resolveDefaultThinkingLevel should stay lazy for /tools"));
    const resolveDefaultReasoningLevelMock = vi
      .fn()
      .mockRejectedValue(new Error("resolveDefaultReasoningLevel should stay lazy for /tools"));
    createModelSelectionStateMock.mockReset();
    createModelSelectionStateMock.mockResolvedValue({
      provider: "proxy",
      model: "gpt-5.4-proxy",
      allowedModelKeys: new Set<string>(),
      allowedModelCatalog: [],
      resetModelOverride: false,
      resolveDefaultThinkingLevel: resolveDefaultThinkingLevelMock,
      resolveDefaultReasoningLevel: resolveDefaultReasoningLevelMock,
      needsModelCatalog: false,
    });

    const { resolveReplyDirectives } = await import("./get-reply-directives.js");
    const cfg = {
      agents: {
        defaults: {
          model: {
            primary: "proxy/gpt-5.4-proxy",
          },
        },
      },
    } satisfies OpenClawConfig;
    const ctx = buildTestCtx({
      Provider: "vk",
      Surface: "vk",
      From: "17965322",
      To: "17965322",
      SenderId: "17965322",
      Body: "/tools",
      RawBody: "/tools",
      CommandBody: "/tools",
      BodyForCommands: "/tools",
      SessionKey: "agent:main:main",
      CommandAuthorized: true,
    });
    const aliasIndex = buildModelAliasIndex({
      cfg,
      defaultProvider: "proxy",
    });

    const result = await resolveReplyDirectives({
      ctx,
      cfg,
      agentId: "main",
      agentDir: "",
      workspaceDir: "",
      agentCfg: cfg.agents?.defaults ?? {},
      sessionCtx: ctx,
      sessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:main",
      storePath: undefined,
      sessionScope: "per-sender",
      groupResolution: undefined,
      isGroup: false,
      triggerBodyNormalized: "/tools",
      commandAuthorized: true,
      defaultProvider: "proxy",
      defaultModel: "gpt-5.4-proxy",
      aliasIndex,
      provider: "proxy",
      model: "gpt-5.4-proxy",
      hasResolvedHeartbeatModelOverride: false,
      typing: createTypingController({}),
      opts: undefined,
      skillFilter: undefined,
    });

    expect(createModelSelectionStateMock).toHaveBeenCalledTimes(1);
    expect(resolveDefaultThinkingLevelMock).not.toHaveBeenCalled();
    expect(resolveDefaultReasoningLevelMock).not.toHaveBeenCalled();
    expect(result.kind).toBe("continue");
    if (result.kind !== "continue") {
      return;
    }
    expect(result.result.provider).toBe("proxy");
    expect(result.result.model).toBe("gpt-5.4-proxy");
    expect(result.result.resolvedThinkLevel).toBeUndefined();
    expect(result.result.resolvedReasoningLevel).toBe("off");
  });
});
