import { describe, expect, it } from "vitest";

import {
  normalizeVkMessageNewUpdate,
  normalizeVkPeerId,
  parseVkConfig,
  resolveVkAccount,
  resolveVkRandomId,
  sendVkReply,
  sendVkText,
} from "../../api.js";

function createAccount(overrides?: {
  config?: unknown;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}) {
  return resolveVkAccount({
    config: parseVkConfig(
      overrides?.config ?? {
        groupId: 77,
        transport: "long-poll",
        accessToken: "replace-me-send-token",
      },
    ),
    accountId: overrides?.accountId,
    env: overrides?.env ?? {},
  });
}

describe("vk outbound text", () => {
  it("normalizes target ids and sends message text with reply_to", async () => {
    const account = createAccount();
    let requestedUrl: URL | undefined;

    const result = await sendVkText({
      account,
      peerId: "vk:user:42",
      text: "Hello from OpenClaw",
      replyTo: "501",
      fetchImpl: async (input) => {
        requestedUrl = new URL(String(input));
        return new Response(
          JSON.stringify({
            response: 9001,
          }),
        );
      },
    });

    expect(result.messageId).toBe("9001");
    expect(result.peerId).toBe(42);
    expect(result.randomId).toBeGreaterThan(0);
    expect(requestedUrl?.pathname).toBe("/method/messages.send");
    expect(requestedUrl?.searchParams.get("peer_id")).toBe("42");
    expect(requestedUrl?.searchParams.get("message")).toBe(
      "Hello from OpenClaw",
    );
    expect(requestedUrl?.searchParams.get("reply_to")).toBe("501");
    expect(requestedUrl?.searchParams.get("random_id")).toBe(
      String(result.randomId),
    );
  });

  it("uses stable random ids when dedupeKey is provided", async () => {
    const account = createAccount();
    const observedRandomIds: string[] = [];

    const fetchImpl = async (input: URL | RequestInfo) => {
      observedRandomIds.push(
        new URL(String(input)).searchParams.get("random_id") ?? "",
      );
      return new Response(
        JSON.stringify({
          response: observedRandomIds.length,
        }),
      );
    };

    const first = await sendVkText({
      account,
      peerId: 42,
      text: "Same delivery key",
      dedupeKey: "thread:42:reply:1",
      fetchImpl,
    });
    const second = await sendVkText({
      account,
      peerId: 42,
      text: "Same delivery key",
      dedupeKey: "thread:42:reply:1",
      fetchImpl,
    });

    expect(first.randomId).toBe(second.randomId);
    expect(observedRandomIds).toEqual([
      String(first.randomId),
      String(second.randomId),
    ]);
    expect(resolveVkRandomId({ dedupeKey: "thread:42:reply:1" })).toBe(
      first.randomId,
    );
  });

  it("builds reply sends from normalized inbound VK messages", async () => {
    const account = createAccount();
    let requestedUrl: URL | undefined;
    const inbound = normalizeVkMessageNewUpdate({
      accountId: account.accountId,
      groupId: 77,
      update: {
        type: "message_new",
        group_id: 77,
        event_id: "evt-1",
        object: {
          message: {
            id: 501,
            peer_id: 42,
            from_id: 42,
            text: "Incoming",
            date: 1_700_000_000,
          },
        },
      },
    });

    expect(inbound).not.toBeNull();

    const result = await sendVkReply({
      account,
      message: inbound!,
      text: "Reply text",
      fetchImpl: async (input) => {
        requestedUrl = new URL(String(input));
        return new Response(
          JSON.stringify({
            response: 9100,
          }),
        );
      },
    });

    expect(result.messageId).toBe("9100");
    expect(requestedUrl?.searchParams.get("peer_id")).toBe("42");
    expect(requestedUrl?.searchParams.get("reply_to")).toBe("501");
  });

  it("fails fast on missing token or invalid peer ids", async () => {
    const account = createAccount({
      config: {
        groupId: 77,
      },
    });

    await expect(
      sendVkText({
        account,
        peerId: "vk:user:42",
        text: "No token",
      }),
    ).rejects.toThrow("VK token is not configured");

    const goodAccount = createAccount();
    await expect(
      sendVkText({
        account: goodAccount,
        peerId: "vk:user:not-a-number",
        text: "Bad peer",
      }),
    ).rejects.toThrow("Invalid VK peer id");

    expect(normalizeVkPeerId("vk:chat:2000000001")).toBe(2_000_000_001);
  });
});
