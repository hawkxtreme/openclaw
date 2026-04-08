import { afterEach, describe, expect, it, vi } from "vitest";

import { vkMessagingAdapter, vkOutboundAdapter, vkPlugin } from "../../api.js";

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

  it("omits VK reply_to when the upstream reply id is not numeric", async () => {
    let requestedUrl: URL | undefined;
    const fetchMock = vi.fn(async (input: string | URL) => {
      requestedUrl = new URL(String(input));
      return new Response(
        JSON.stringify({
          response: 9004,
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
      text: "reply without numeric id",
      accountId: "default",
      replyToId: "evt-non-numeric",
    });

    expect(result).toMatchObject({
      channel: "vk",
      messageId: "9004",
      conversationId: "42",
    });
    expect(requestedUrl?.searchParams.get("reply_to")).toBeNull();
  });

  it("renders VK keyboards from interactive outbound payloads", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url).toBeDefined();
      expect(url.searchParams.get("keyboard")).toBeTruthy();
      return new Response(
        JSON.stringify({
          response: 9002,
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await vkOutboundAdapter.sendPayload?.({
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      to: "vk:42",
      payload: {
        text: "Choose a provider",
        interactive: {
          blocks: [
            {
              type: "buttons",
              buttons: [
                { label: "OpenAI", value: "/models openai", style: "primary" },
                { label: "Anthropic", value: "/models anthropic" },
              ],
            },
          ],
        },
      },
      accountId: "default",
      text: "",
    });

    expect(result).toMatchObject({
      channel: "vk",
      messageId: "9002",
      conversationId: "42",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("builds VK command keyboards for model navigation", () => {
    const providerData = vkPlugin.commands?.buildModelsProviderChannelData?.({
      providers: [
        { id: "anthropic", count: 2 },
        { id: "openai", count: 5 },
      ],
    });
    expect(providerData).toEqual({
      vk: {
        buttons: [
          [
            { text: "anthropic (2)", callback_data: "/models anthropic" },
            { text: "openai (5)", callback_data: "/models openai" },
          ],
        ],
      },
    });

    const listData = vkPlugin.commands?.buildModelsListChannelData?.({
      provider: "openai",
      models: ["gpt-5.4", "gpt-5.2-codex", "o3"],
      currentModel: "openai/gpt-5.4",
      currentPage: 1,
      totalPages: 2,
      pageSize: 2,
      modelNames: new Map([
        ["openai/gpt-5.4", "GPT-5.4"],
        ["openai/gpt-5.2-codex", "GPT-5.2 Codex"],
      ]),
    });
    expect(listData).toEqual({
      vk: {
        buttons: [
          [{ text: "GPT-5.4 ✓", callback_data: "/model openai/gpt-5.4" }],
          [{ text: "GPT-5.2 Codex", callback_data: "/model openai/gpt-5.2-codex" }],
          [
            { text: "1/2", callback_data: "/models openai 1" },
            { text: "Next >", callback_data: "/models openai 2" },
          ],
          [{ text: "< Back", callback_data: "/models" }],
        ],
      },
    });

    expect(vkPlugin.commands?.buildModelBrowseChannelData?.()).toEqual({
      vk: {
        buttons: [[{ text: "Browse providers", callback_data: "/models" }]],
      },
    });
  });

  it("advertises VK inline buttons to the agent prompt and message tool", () => {
    expect(
      vkPlugin.agentPrompt?.messageToolCapabilities?.({
        cfg: {
          channels: {
            vk: {
              groupId: 77,
              accessToken: "replace-me-callback-token",
            },
          },
        },
        accountId: "default",
      }),
    ).toEqual(["inlineButtons"]);

    const discovery = vkPlugin.actions?.describeMessageTool?.({
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      accountId: "default",
      currentChannelProvider: "vk",
    });

    expect(discovery?.actions).toEqual(["send"]);
    expect(discovery?.capabilities).toEqual(["interactive", "buttons"]);
    expect(discovery?.schema).toBeTruthy();
  });

  it("sends VK message-tool buttons through the plugin action adapter", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("peer_id")).toBe("42");
      expect(url.searchParams.get("keyboard")).toBeTruthy();
      return new Response(
        JSON.stringify({
          response: 9003,
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await vkPlugin.actions?.handleAction?.({
      channel: "vk",
      action: "send",
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      params: {
        to: "vk:42",
        message: "Choose a model",
        buttons: [[{ text: "Browse providers", callback_data: "/models" }]],
      },
      accountId: "default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const jsonText = result?.content.find((entry) => entry.type === "text")?.text;
    expect(jsonText).toBeTruthy();
    expect(JSON.parse(jsonText ?? "{}")).toMatchObject({
      channel: "vk",
      messageId: "9003",
      conversationId: "42",
    });
  });

  it("accepts replyToId on the VK message action surface", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("reply_to")).toBe("501");
      return new Response(
        JSON.stringify({
          response: 9005,
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await vkPlugin.actions?.handleAction?.({
      channel: "vk",
      action: "send",
      cfg: {
        channels: {
          vk: {
            groupId: 77,
            accessToken: "replace-me-callback-token",
          },
        },
      },
      params: {
        to: "vk:42",
        message: "Reply via alias",
        replyToId: "501",
      },
      accountId: "default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const jsonText = result?.content.find((entry) => entry.type === "text")?.text;
    expect(jsonText).toBeTruthy();
    expect(JSON.parse(jsonText ?? "{}")).toMatchObject({
      channel: "vk",
      messageId: "9005",
      conversationId: "42",
    });
  });
});
