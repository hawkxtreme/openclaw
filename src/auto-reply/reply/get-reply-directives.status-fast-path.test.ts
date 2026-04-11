import { describe, expect, it, vi } from "vitest";
import { buildModelAliasIndex } from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";
import { buildTestCtx } from "./test-ctx.js";
import { createTypingController } from "./typing.js";

const createModelSelectionStateMock = vi.fn();
const buildStatusReplyMock = vi.fn();

vi.mock("./model-selection.js", async (importActual) => {
  const actual = await importActual<typeof import("./model-selection.js")>("./model-selection.js");
  return {
    ...actual,
    createModelSelectionState: (...args: unknown[]) => createModelSelectionStateMock(...args),
  };
});

vi.mock("./commands-status.runtime.js", () => ({
  buildStatusReply: (...args: unknown[]) => buildStatusReplyMock(...args),
}));

describe("resolveReplyDirectives bare /status fast path", () => {
  it("skips model catalog creation for whole-message status commands", async () => {
    createModelSelectionStateMock.mockReset();
    createModelSelectionStateMock.mockRejectedValue(
      new Error("createModelSelectionState should not run for bare /status"),
    );
    buildStatusReplyMock.mockReset();
    buildStatusReplyMock.mockResolvedValue({
      text: "🦞 OpenClaw\n🧠 Model: cerebras/llama3.1-8b",
    });

    const { resolveReplyDirectives } = await import("./get-reply-directives.js");
    const cfg = {
      agents: {
        defaults: {
          model: {
            primary: "cerebras/llama3.1-8b",
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
      Body: "/status",
      RawBody: "/status",
      CommandBody: "/status",
      BodyForCommands: "/status",
      SessionKey: "agent:main:main",
      CommandAuthorized: true,
    });
    const aliasIndex = buildModelAliasIndex({
      cfg,
      defaultProvider: "cerebras",
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
      triggerBodyNormalized: "/status",
      commandAuthorized: true,
      defaultProvider: "cerebras",
      defaultModel: "llama3.1-8b",
      aliasIndex,
      provider: "cerebras",
      model: "llama3.1-8b",
      hasResolvedHeartbeatModelOverride: false,
      typing: createTypingController({}),
      opts: undefined,
      skillFilter: undefined,
    });

    expect(createModelSelectionStateMock).not.toHaveBeenCalled();
    expect(buildStatusReplyMock).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") {
      return;
    }
    expect(result.reply?.text).toContain("OpenClaw");
    expect(result.reply?.text).toContain("cerebras/llama3.1-8b");
  });
});
