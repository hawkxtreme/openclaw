import { describe, expect, it } from "vitest";

import {
  createVkCallbackHandler,
  runVkReleaseReadinessChecks,
} from "../../api.js";

describe("vk release smoke", () => {
  it("flags missing callback secrets and passes a complete callback config", async () => {
    expect(
      runVkReleaseReadinessChecks({
        groupId: 77,
        accessToken: "replace-me-callback-token",
        callback: {
          path: "/plugins/vk/webhook/default",
        },
      }),
    ).toEqual([
      "channels.vk.callback.secret is required for callback-api transport",
      "channels.vk.callback.confirmationCode is required for callback-api transport",
    ]);

    expect(
      runVkReleaseReadinessChecks({
        groupId: 77,
        accessToken: "replace-me-callback-token",
        callback: {
          path: "/plugins/vk/webhook/default",
          secret: "replace-me-callback-secret",
          confirmationCode: "confirm-77",
        },
      }),
    ).toEqual([]);
  });

  it("handles confirmation, message_new and duplicate replay in one flow", async () => {
    const seenMessages: string[] = [];
    const handler = createVkCallbackHandler({
      config: {
        groupId: 77,
        accessToken: "replace-me-callback-token",
        callback: {
          path: "/plugins/vk/webhook/default",
          secret: "replace-me-callback-secret",
          confirmationCode: "confirm-77",
        },
      },
      onMessage: async (message) => {
        seenMessages.push(message.messageId);
      },
    });

    const confirmation = await handler({
      method: "POST",
      body: JSON.stringify({
        type: "confirmation",
        group_id: 77,
        secret: "replace-me-callback-secret",
      }),
    });
    const payload = JSON.stringify({
      type: "message_new",
      group_id: 77,
      secret: "replace-me-callback-secret",
      event_id: "evt-smoke-1",
      object: {
        message: {
          id: 7001,
          peer_id: 42,
          from_id: 42,
          text: "hello",
          date: 1_700_000_000,
        },
      },
    });
    const first = await handler({
      method: "POST",
      body: payload,
    });
    const duplicate = await handler({
      method: "POST",
      body: payload,
    });

    expect(confirmation.body).toBe("confirm-77");
    expect(first).toMatchObject({
      statusCode: 200,
      eventType: "message_new",
      duplicate: false,
    });
    expect(duplicate).toMatchObject({
      statusCode: 200,
      eventType: "duplicate",
      duplicate: true,
    });
    expect(seenMessages).toEqual(["7001"]);
  });
});
