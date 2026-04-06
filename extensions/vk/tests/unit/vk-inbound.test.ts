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
    const cfg = {
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

  it("routes allowed group messages through the shared reply dispatcher", async () => {
    const cfg = {
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
});
