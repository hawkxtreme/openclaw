import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const beginWebhookRequestPipelineOrRejectMock = vi.hoisted(() =>
  vi.fn(() => ({
    ok: true as const,
    release: vi.fn(),
  })),
);
const createWebhookInFlightLimiterMock = vi.hoisted(() => vi.fn(() => ({ release: vi.fn() })));
const handleVkInboundMessageMock = vi.hoisted(() => vi.fn());
const readWebhookBodyOrRejectMock = vi.hoisted(() => vi.fn());
const registerPluginHttpRouteMock = vi.hoisted(() => vi.fn());
const resolveLatestVkInteractiveMenuIdMock = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk/webhook-ingress", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/webhook-ingress")>();
  return {
    ...actual,
    beginWebhookRequestPipelineOrReject: beginWebhookRequestPipelineOrRejectMock,
    createWebhookInFlightLimiter: createWebhookInFlightLimiterMock,
    readWebhookBodyOrReject: readWebhookBodyOrRejectMock,
    registerPluginHttpRoute: registerPluginHttpRouteMock,
  };
});

vi.mock("../../src/inbound.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/inbound.js")>();
  return {
    ...actual,
    handleVkInboundMessage: handleVkInboundMessageMock,
  };
});

vi.mock("../../src/interactive-menu.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/interactive-menu.js")>();
  return {
    ...actual,
    resolveLatestVkInteractiveMenuId: resolveLatestVkInteractiveMenuIdMock,
  };
});

import { resolveVkAccount } from "../../src/accounts.js";
import { vkGatewayAdapter } from "../../src/gateway.js";
import type { OpenClawConfig } from "../../src/types.js";

function createResponseHarness() {
  return {
    res: {
      statusCode: 0,
      headersSent: false,
      setHeader: vi.fn(),
      end: vi.fn(function (this: { headersSent: boolean }, _body?: string) {
        this.headersSent = true;
      }),
    },
  };
}

describe("vk gateway adapter", () => {
  beforeEach(() => {
    handleVkInboundMessageMock.mockReset();
    registerPluginHttpRouteMock.mockReset();
    readWebhookBodyOrRejectMock.mockReset();
    beginWebhookRequestPipelineOrRejectMock.mockClear();
    resolveLatestVkInteractiveMenuIdMock.mockReset();
    resolveLatestVkInteractiveMenuIdMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers and unregisters the callback route for callback-api transport", async () => {
    const unregisterMock = vi.fn();
    registerPluginHttpRouteMock.mockReturnValue(unregisterMock);
    const abortController = new AbortController();
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          transport: "callback-api",
          accessToken: "replace-me-callback-token",
          callback: {
            path: "/plugins/vk/webhook/default",
            secret: "replace-me-callback-secret",
            confirmationCode: "confirm-77",
          },
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });
    const statusPatches: Array<Record<string, unknown>> = [];

    const started = vkGatewayAdapter.startAccount?.({
      cfg,
      accountId: "default",
      account,
      runtime: {} as never,
      abortSignal: abortController.signal,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      getStatus: () => ({ accountId: "default" }),
      setStatus: (next) => {
        statusPatches.push(next as Record<string, unknown>);
      },
    });

    expect(registerPluginHttpRouteMock).toHaveBeenCalledTimes(1);
    expect(registerPluginHttpRouteMock.mock.calls[0]?.[0]).toMatchObject({
      path: "/plugins/vk/webhook/default",
      pluginId: "vk",
      accountId: "default",
      auth: "plugin",
    });

    abortController.abort();
    await started;

    expect(unregisterMock).toHaveBeenCalledTimes(1);
    expect(statusPatches.some((patch) => patch.running === true)).toBe(true);
    expect(statusPatches.some((patch) => patch.running === false)).toBe(true);
  });

  it("serves confirmation responses through the registered callback route", async () => {
    const unregisterMock = vi.fn();
    let registeredHandler:
      | ((req: unknown, res: unknown) => Promise<boolean | void> | boolean | void)
      | undefined;
    registerPluginHttpRouteMock.mockImplementation((params) => {
      registeredHandler = params.handler;
      return unregisterMock;
    });
    readWebhookBodyOrRejectMock.mockResolvedValue({
      ok: true,
      value: JSON.stringify({
        type: "confirmation",
        group_id: 77,
        secret: "replace-me-callback-secret",
      }),
    });

    const abortController = new AbortController();
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          transport: "callback-api",
          accessToken: "replace-me-callback-token",
          callback: {
            path: "/plugins/vk/webhook/default",
            secret: "replace-me-callback-secret",
            confirmationCode: "confirm-77",
          },
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });

    const started = vkGatewayAdapter.startAccount?.({
      cfg,
      accountId: "default",
      account,
      runtime: {} as never,
      abortSignal: abortController.signal,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      getStatus: () => ({ accountId: "default" }),
      setStatus: vi.fn(),
    });

    expect(registeredHandler).toBeTypeOf("function");
    const { res } = createResponseHarness();
    const req = {
      method: "POST",
    };

    await registeredHandler?.(req, res);

    expect(beginWebhookRequestPipelineOrRejectMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalledWith("confirm-77");

    abortController.abort();
    await started;
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });

  it("routes callback message_event payloads into the inbound message handler", async () => {
    const unregisterMock = vi.fn();
    let registeredHandler:
      | ((req: unknown, res: unknown) => Promise<boolean | void> | boolean | void)
      | undefined;
    registerPluginHttpRouteMock.mockImplementation((params) => {
      registeredHandler = params.handler;
      return unregisterMock;
    });
    readWebhookBodyOrRejectMock.mockResolvedValue({
      ok: true,
      value: JSON.stringify({
        type: "message_event",
        group_id: 77,
        event_id: "evt-interactive-1",
        secret: "replace-me-callback-secret",
        object: {
          user_id: 42,
          peer_id: 2_000_000_123,
          event_id: "callback-event-1",
          conversation_message_id: 99,
          payload: JSON.stringify({ oc: "/models openai" }),
        },
      }),
    });

    const abortController = new AbortController();
    const cfg: OpenClawConfig = {
      channels: {
        vk: {
          groupId: 77,
          transport: "callback-api",
          accessToken: "replace-me-callback-token",
          callback: {
            path: "/plugins/vk/webhook/default",
            secret: "replace-me-callback-secret",
            confirmationCode: "confirm-77",
          },
        },
      },
    };
    const account = resolveVkAccount({
      cfg,
      accountId: "default",
    });

    const started = vkGatewayAdapter.startAccount?.({
      cfg,
      accountId: "default",
      account,
      runtime: {} as never,
      abortSignal: abortController.signal,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      getStatus: () => ({ accountId: "default" }),
      setStatus: vi.fn(),
    });

    expect(registeredHandler).toBeTypeOf("function");
    const { res } = createResponseHarness();
    const req = {
      method: "POST",
    };

    await registeredHandler?.(req, res);

    expect(handleVkInboundMessageMock).toHaveBeenCalledTimes(1);
    expect(handleVkInboundMessageMock.mock.calls[0]?.[0]).toMatchObject({
      message: {
        text: "/models openai",
        peerId: 2_000_000_123,
        senderId: 42,
      },
    });

    abortController.abort();
    await started;
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });
});
