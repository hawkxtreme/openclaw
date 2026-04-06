import { describe, expect, it } from "vitest";

import {
  createVkCallbackHandler,
  createVkReplayGuard,
  createVkTraceCollector,
} from "../../api.js";

function createConfig() {
  return {
    groupId: 77,
    accessToken: "replace-me-callback-token",
    callback: {
      path: "/plugins/vk/webhook/default",
      secret: "replace-me-callback-secret",
      confirmationCode: "confirm-77",
    },
    accounts: {
      support: {
        groupId: 88,
        accessToken: "replace-me-support-token",
        callback: {
          path: "/plugins/vk/webhook/support",
          secret: "replace-me-support-secret",
          confirmationCode: "confirm-88",
        },
      },
    },
  };
}

describe("vk callback webhook", () => {
  it("returns confirmation code for the matched account", async () => {
    const handler = createVkCallbackHandler({
      config: createConfig(),
    });

    const result = await handler({
      method: "POST",
      body: JSON.stringify({
        type: "confirmation",
        group_id: 88,
        secret: "replace-me-support-secret",
      }),
    });

    expect(result).toEqual({
      statusCode: 200,
      body: "confirm-88",
      eventType: "confirmation",
      accountId: "support",
    });
  });

  it("rejects invalid secrets before processing the payload", async () => {
    const handler = createVkCallbackHandler({
      config: createConfig(),
    });

    const result = await handler({
      method: "POST",
      body: JSON.stringify({
        type: "message_new",
        group_id: 77,
        secret: "mismatch-token",
        event_id: "evt-secret",
        object: {
          message: {
            id: 1,
            peer_id: 42,
            from_id: 42,
            text: "hello",
            date: 1_700_000_000,
          },
        },
      }),
    });

    expect(result).toEqual({
      statusCode: 401,
      body: "invalid secret",
      eventType: "rejected",
      accountId: "default",
    });
  });

  it("dedupes callback events by event_id", async () => {
    const replayGuard = createVkReplayGuard({
      ttlMs: 60_000,
      now: () => 1_700_000_000_000,
    });
    const received: string[] = [];
    const handler = createVkCallbackHandler({
      config: createConfig(),
      replayGuard,
      onMessage: async (message) => {
        received.push(message.messageId);
      },
    });
    const body = JSON.stringify({
      type: "message_new",
      group_id: 77,
      secret: "replace-me-callback-secret",
      event_id: "evt-duplicate",
      object: {
        message: {
          id: 501,
          peer_id: 42,
          from_id: 42,
          text: "hello",
          date: 1_700_000_000,
        },
      },
    });

    const first = await handler({
      method: "POST",
      body,
    });
    const second = await handler({
      method: "POST",
      body,
    });

    expect(first).toMatchObject({
      statusCode: 200,
      body: "ok",
      duplicate: false,
      eventType: "message_new",
    });
    expect(second).toMatchObject({
      statusCode: 200,
      body: "ok",
      duplicate: true,
      eventType: "duplicate",
    });
    expect(received).toEqual(["501"]);
  });

  it("routes message_event payloads and sends sendMessageEventAnswer responses", async () => {
    const sentUrls: string[] = [];
    const tracer = createVkTraceCollector();
    const handler = createVkCallbackHandler({
      config: createConfig(),
      tracer,
      fetchImpl: async (input) => {
        const url = String(input);
        sentUrls.push(url);
        return new Response(
          JSON.stringify({
            response: 1,
          }),
        );
      },
      onInteractiveEvent: async (event) => {
        expect(event.payload).toEqual({
          action: "approve",
          ticketId: "REQ-7",
        });
        return {
          eventData: {
            type: "show_snackbar",
            text: "Approved",
          },
        };
      },
    });

    const result = await handler({
      method: "POST",
      body: JSON.stringify({
        type: "message_event",
        group_id: 77,
        secret: "replace-me-callback-secret",
        event_id: "evt-interactive",
        object: {
          user_id: 42,
          peer_id: 2_000_000_123,
          event_id: "callback-event-1",
          conversation_message_id: 17,
          payload: '{"action":"approve","ticketId":"REQ-7"}',
        },
      }),
    });

    expect(result).toMatchObject({
      statusCode: 200,
      body: "ok",
      eventType: "message_event",
    });
    expect(sentUrls).toHaveLength(1);
    expect(sentUrls[0]).toContain("messages.sendMessageEventAnswer");
    expect(sentUrls[0]).toContain("event_id=callback-event-1");
    expect(tracer.getCounters()).toMatchObject({
      "interactive.answer.sent": 1,
      "webhook.accepted": 1,
    });
  });
});
