import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { buildTestCtx } from "./test-ctx.js";

describe("abort import boundary", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not load the broad embedded PI barrel for non-abort messages", async () => {
    const piEmbeddedLoads = vi.fn();
    const subagentRegistryLoads = vi.fn();

    vi.doMock("../../agents/pi-embedded.js", () => {
      piEmbeddedLoads();
      return {
        abortEmbeddedPiRun: vi.fn(() => true),
      };
    });

    vi.doMock("../../agents/subagent-registry.js", () => ({
      ...(subagentRegistryLoads(), {}),
      getLatestSubagentRunByChildSessionKey: vi.fn(() => null),
      listSubagentRunsForController: vi.fn(() => []),
      markSubagentRunTerminated: vi.fn(() => 0),
    }));

    vi.doMock("../../acp/control-plane/manager.js", () => ({
      getAcpSessionManager: () => ({
        resolveSession: () => ({ kind: "none" as const }),
        cancelSession: vi.fn(async () => {}),
      }),
    }));

    const { tryFastAbortFromMessage } = await import("./abort.js");

    const result = await tryFastAbortFromMessage({
      ctx: buildTestCtx({
        Provider: "vk",
        Surface: "vk",
        ChatType: "direct",
        RawBody: "hello",
        Body: "hello",
        CommandBody: "hello",
        SessionKey: "agent:main:vk:dm:123",
        From: "vk:user:42",
        To: "vk:peer:123",
      }),
      cfg: {} as OpenClawConfig,
    });

    expect(result).toEqual({ handled: false, aborted: false });
    expect(piEmbeddedLoads).not.toHaveBeenCalled();
    expect(subagentRegistryLoads).not.toHaveBeenCalled();
  });
});
