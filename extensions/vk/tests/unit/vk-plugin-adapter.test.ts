import { afterEach, describe, expect, it, vi } from "vitest";

import { vkMessagingAdapter, vkOutboundAdapter } from "../../api.js";

describe("vk plugin adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes vk targets and resolves outbound session routes", () => {
    expect(vkMessagingAdapter.normalizeTarget?.("vk:user:42")).toBe("42");
    expect(vkMessagingAdapter.normalizeTarget?.("conversation:2000000123")).toBe(
      "2000000123",
    );

    const route = vkMessagingAdapter.resolveOutboundSessionRoute?.({
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      agentId: "agent-1",
      accountId: "default",
      target: "vk:2000000123",
      threadId: null,
    });

    expect(route).toMatchObject({
      chatType: "group",
      to: "2000000123",
      peer: {
        kind: "group",
        id: "2000000123",
      },
    });
  });

  it("sends text through the official outbound adapter", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(String(input)).toContain("messages.send");
      expect(String(input)).toContain("peer_id=42");
      return new Response(
        JSON.stringify({
          response: 9001,
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await vkOutboundAdapter.sendText?.({
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      to: "vk:42",
      text: "hello from adapter",
      accountId: "default",
    });

    expect(result).toMatchObject({
      channel: "vk",
      messageId: "9001",
      conversationId: "42",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
