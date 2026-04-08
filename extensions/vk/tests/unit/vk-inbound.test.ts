import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchInboundDirectDmWithRuntimeMock = vi.hoisted(() => vi.fn());
const resolveInboundDirectDmAccessWithRuntimeMock = vi.hoisted(() => vi.fn());
const dispatchInboundReplyWithBaseMock = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk/channel-inbound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/channel-inbound")>();
  return {
    ...actual,
    dispatchInboundDirectDmWithRuntime: dispatchInboundDirectDmWithRuntimeMock,
  };
});

vi.mock("openclaw/plugin-sdk/direct-dm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/direct-dm")>();
  return {
    ...actual,
    resolveInboundDirectDmAccessWithRuntime: resolveInboundDirectDmAccessWithRuntimeMock,
  };
});

vi.mock("openclaw/plugin-sdk/inbound-reply-dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/inbound-reply-dispatch")>();
  return {
    ...actual,
    dispatchInboundReplyWithBase: dispatchInboundReplyWithBaseMock,
  };
});

import {
  handleVkInboundMessage,
} from "../../src/inbound.js";
import { resolveVkAccount } from "../../src/accounts.js";
import { clearVkRuntime, setVkRuntime } from "../../src/runtime.js";
import type { OpenClawConfig } from "../../src/types.js";
import { createVkAccessController } from "../../src/vk-core/inbound/access.js";

function createRuntimeMock() {
  return {
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          agentId: "agent-1",
          sessionKey: "session-1",
          accountId: "default",
        })),
      },
      session: {
        resolveStorePath: vi.fn(() => ".openclaw/sessions"),
        readSessionUpdatedAt: vi.fn(() => undefined),
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => ({})),
        formatAgentEnvelope: vi.fn(({ body }) => `ENV:${String(body)}`),
        finalizeInboundContext: vi.fn((payload) => payload),
      },
      commands: {
        shouldComputeCommandAuthorized: vi.fn(() => false),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => true),
      },
    },
  };
}

describe("vk inbound handling", () => {
  beforeEach(() => {
    dispatchInboundDirectDmWithRuntimeMock.mockReset();
    resolveInboundDirectDmAccessWithRuntimeMock.mockReset();
    dispatchInboundReplyWithBaseMock.mockReset();
    setVkRuntime(createRuntimeMock() as never);
  });

  afterEach(() => {
    clearVkRuntime();
  });

  it("routes direct messages through the direct-DM dispatcher", async () => {
    resolveInboundDirectDmAccessWithRuntimeMock.mockResolvedValue({
      access: {
        decision: "allow",
        reason: "allowlist",
        reasonCode: "allowlist",
        effectiveAllowFrom: ["42"],
      },
      shouldComputeAuth: false,
      senderAllowedForCommands: true,
      commandAuthorized: true,
    });
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          dmPolicy: "allowlist",
          allowFrom: ["42"],
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });

    await handleVkInboundMessage({
      cfg,
      account,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "callback-api",
        eventType: "message_new",
        dedupeKey: "event:1",
        messageId: "501",
        peerId: 42,
        senderId: 42,
        text: "hello from vk",
        createdAt: 1700000000000,
        isGroupChat: false,
        rawUpdate: {},
      },
    });

    expect(dispatchInboundDirectDmWithRuntimeMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundDirectDmWithRuntimeMock.mock.calls[0]?.[0]).toMatchObject({
      channel: "vk",
      channelLabel: "VK",
      accountId: "default",
      peer: {
        kind: "direct",
        id: "42",
      },
      senderId: "42",
      messageId: "501",
      commandAuthorized: true,
    });
  });

  it("prefers hidden VK payload commands over visible button labels in DMs", async () => {
    resolveInboundDirectDmAccessWithRuntimeMock.mockResolvedValue({
      access: {
        decision: "allow",
        reason: "allowlist",
        reasonCode: "allowlist",
        effectiveAllowFrom: ["42"],
      },
      shouldComputeAuth: false,
      senderAllowedForCommands: true,
      commandAuthorized: true,
    });
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          dmPolicy: "allowlist",
          allowFrom: ["42"],
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });

    await handleVkInboundMessage({
      cfg,
      account,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "callback-api",
        eventType: "message_new",
        dedupeKey: "event:payload-1",
        messageId: "502",
        peerId: 42,
        senderId: 42,
        text: "OpenAI",
        createdAt: 1700000000000,
        isGroupChat: false,
        rawUpdate: {},
        messagePayload: { oc: "/models openai" },
      } as never,
    });

    expect(dispatchInboundDirectDmWithRuntimeMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundDirectDmWithRuntimeMock.mock.calls[0]?.[0]).toMatchObject({
      rawBody: "/models openai",
    });
  });

  it("uses plain-string VK payload commands over visible button labels in DMs", async () => {
    resolveInboundDirectDmAccessWithRuntimeMock.mockResolvedValue({
      access: {
        decision: "allow",
        reason: "allowlist",
        reasonCode: "allowlist",
        effectiveAllowFrom: ["42"],
      },
      shouldComputeAuth: false,
      senderAllowedForCommands: true,
      commandAuthorized: true,
    });
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          dmPolicy: "allowlist",
          allowFrom: ["42"],
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });

    await handleVkInboundMessage({
      cfg,
      account,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "callback-api",
        eventType: "message_new",
        dedupeKey: "event:payload-2",
        messageId: "504",
        peerId: 42,
        senderId: 42,
        text: "OpenAI",
        createdAt: 1700000000000,
        isGroupChat: false,
        rawUpdate: {},
        messagePayload: "/models openai",
      } as never,
    });

    expect(dispatchInboundDirectDmWithRuntimeMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundDirectDmWithRuntimeMock.mock.calls[0]?.[0]).toMatchObject({
      rawBody: "/models openai",
    });
  });

  it("routes allowed group messages through the shared reply dispatcher", async () => {
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          groupPolicy: "open",
          groups: {
            "2000000123": {
              requireMention: true,
            },
          },
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });
    const accessController = createVkAccessController();

    await handleVkInboundMessage({
      cfg,
      account,
      accessController,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "callback-api",
        eventType: "message_new",
        dedupeKey: "event:2",
        messageId: "777",
        peerId: 2000000123,
        senderId: 42,
        text: "@club77 hello group",
        createdAt: 1700000100000,
        isGroupChat: true,
        rawUpdate: {},
      },
    });

    expect(dispatchInboundReplyWithBaseMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0]).toMatchObject({
      channel: "vk",
      accountId: "default",
      route: {
        agentId: "agent-1",
        sessionKey: "session-1",
      },
    });

    const ctxPayload = dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0]?.ctxPayload as Record<
      string,
      unknown
    >;
    expect(ctxPayload.ChatType).toBe("group");
    expect(ctxPayload.GroupChannel).toBe("2000000123");
    expect(ctxPayload.WasMentioned).toBe(true);
  });

  it("omits VK group reply_to when only a global message id is available", async () => {
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          groupPolicy: "open",
          groups: {
            "2000000123": {
              requireMention: true,
            },
          },
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });
    const accessController = createVkAccessController();
    let requestedUrl: URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        requestedUrl = new URL(String(input));
        return new Response(
          JSON.stringify({
            response: 9006,
          }),
        );
      }),
    );

    await handleVkInboundMessage({
      cfg,
      account,
      accessController,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "long-poll",
        eventType: "message_new",
        dedupeKey: "event:group-reply-fallback",
        messageId: "0",
        peerId: 2000000123,
        senderId: 42,
        text: "@club77 hello group",
        createdAt: 1700000100000,
        isGroupChat: true,
        rawUpdate: {},
      },
    });

    const params = dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0] as
      | {
          ctxPayload?: Record<string, unknown>;
          deliver?: (payload: unknown) => Promise<void>;
        }
      | undefined;

    expect(params?.ctxPayload?.ReplyToId).toBeUndefined();
    await params?.deliver?.({
      text: "Reply text",
    });

    expect(requestedUrl?.searchParams.get("reply_to")).toBeNull();
  });

  it("passes typing callbacks into DM dispatch and starts VK typing activity", async () => {
    resolveInboundDirectDmAccessWithRuntimeMock.mockResolvedValue({
      access: {
        decision: "allow",
        reason: "allowlist",
        reasonCode: "allowlist",
        effectiveAllowFrom: ["42"],
      },
      shouldComputeAuth: false,
      senderAllowedForCommands: true,
      commandAuthorized: true,
    });
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          accessToken: "replace-me-callback-token",
          dmPolicy: "allowlist",
          allowFrom: ["42"],
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("messages.setActivity");
      return new Response(
        JSON.stringify({
          response: 1,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await handleVkInboundMessage({
      cfg,
      account,
      message: {
        accountId: "default",
        groupId: 77,
        transport: "callback-api",
        eventType: "message_new",
        dedupeKey: "event:typing-1",
        messageId: "503",
        peerId: 42,
        senderId: 42,
        text: "hello from vk",
        createdAt: 1700000000000,
        isGroupChat: false,
        rawUpdate: {},
      },
    });

    const params = dispatchInboundDirectDmWithRuntimeMock.mock.calls[0]?.[0] as
      | { typingCallbacks?: { onReplyStart: () => Promise<void> } }
      | undefined;
    expect(params?.typingCallbacks?.onReplyStart).toBeTypeOf("function");
    await params?.typingCallbacks?.onReplyStart?.();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
