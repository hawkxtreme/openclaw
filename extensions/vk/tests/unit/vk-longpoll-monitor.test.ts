import { describe, expect, it } from "vitest";

import {
  createVkLongPollMonitor,
  parseVkConfig,
  resolveVkAccount,
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
        accessToken: "replace-me-longpoll-token",
      },
    ),
    accountId: overrides?.accountId,
    env: overrides?.env ?? {},
  });
}

describe("vk long poll monitor", () => {
  it("delivers normalized message_new updates and dedupes repeats", async () => {
    const account = createAccount();
    const received: Array<{
      eventId?: string;
      dedupeKey: string;
      messageId: string;
      peerId: number;
      senderId: number;
      text: string;
      isGroupChat: boolean;
    }> = [];
    const requests: string[] = [];

    const monitor = createVkLongPollMonitor({
      account,
      waitSeconds: 1,
      reconnectDelayMs: 0,
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);

        if (url.includes("groups.getLongPollServer")) {
          return new Response(
            JSON.stringify({
              response: {
                server: "https://lp.vk.test/longpoll",
                key: "longpoll-key",
                ts: "100",
              },
            }),
          );
        }

        return new Response(
          JSON.stringify({
            ts: "101",
            updates: [
              {
                type: "message_new",
                group_id: 77,
                event_id: "evt-1",
                object: {
                  message: {
                    id: 501,
                    conversation_message_id: 17,
                    peer_id: 42,
                    from_id: 42,
                    text: "Привет из VK",
                    date: 1_700_000_000,
                  },
                },
              },
              {
                type: "message_new",
                group_id: 77,
                event_id: "evt-1",
                object: {
                  message: {
                    id: 501,
                    conversation_message_id: 17,
                    peer_id: 42,
                    from_id: 42,
                    text: "Привет из VK",
                    date: 1_700_000_000,
                  },
                },
              },
            ],
          }),
        );
      },
      onMessage: (message) => {
        received.push({
          eventId: message.eventId,
          dedupeKey: message.dedupeKey,
          messageId: message.messageId,
          peerId: message.peerId,
          senderId: message.senderId,
          text: message.text,
          isGroupChat: message.isGroupChat,
        });
      },
      onStatusChange: (status) => {
        if (status.dedupedEvents === 1) {
          monitor.stop("test-complete");
        }
      },
    });

    await monitor.start();

    expect(received).toEqual([
      {
        eventId: "evt-1",
        dedupeKey: "event:evt-1",
        messageId: "501",
        peerId: 42,
        senderId: 42,
        text: "Привет из VK",
        isGroupChat: false,
      },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("groups.getLongPollServer");
    expect(requests[1]).toContain("https://lp.vk.test/longpoll");
    expect(monitor.getStatus()).toMatchObject({
      state: "stopped",
      connected: false,
      receivedEvents: 2,
      deliveredEvents: 1,
      dedupedEvents: 1,
      stopReason: "test-complete",
    });
  });

  it("refreshes server state after long poll failure and reconnects", async () => {
    const account = createAccount();
    const serverRequests: string[] = [];
    const pollRequests: string[] = [];
    let longPollServerCall = 0;

    const monitor = createVkLongPollMonitor({
      account,
      waitSeconds: 1,
      reconnectDelayMs: 0,
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes("groups.getLongPollServer")) {
          serverRequests.push(url);
          longPollServerCall += 1;

          return new Response(
            JSON.stringify({
              response: {
                server: `https://lp.vk.test/${String(longPollServerCall)}`,
                key: `key-${String(longPollServerCall)}`,
                ts: `${String(longPollServerCall)}00`,
              },
            }),
          );
        }

        pollRequests.push(url);
        if (pollRequests.length === 1) {
          return new Response(
            JSON.stringify({
              failed: 2,
            }),
          );
        }

        return new Response(
          JSON.stringify({
            ts: "201",
            updates: [
              {
                type: "message_new",
                group_id: 77,
                event_id: "evt-2",
                object: {
                  message: {
                    id: 777,
                    peer_id: 42,
                    from_id: 42,
                    text: "После переподключения",
                    date: 1_700_000_100,
                  },
                },
              },
            ],
          }),
        );
      },
      onMessage: () => {
        monitor.stop("received-after-reconnect");
      },
    });

    await monitor.start();

    expect(serverRequests).toHaveLength(2);
    expect(pollRequests).toHaveLength(2);
    expect(pollRequests[0]).toContain("https://lp.vk.test/1");
    expect(pollRequests[1]).toContain("https://lp.vk.test/2");
    expect(monitor.getStatus()).toMatchObject({
      state: "stopped",
      reconnectAttempts: 1,
      deliveredEvents: 1,
      stopReason: "received-after-reconnect",
    });
  });

  it("stops cleanly while waiting for a long poll response", async () => {
    const account = createAccount();
    let pollWasAborted = false;

    const monitor = createVkLongPollMonitor({
      account,
      waitSeconds: 1,
      reconnectDelayMs: 0,
      fetchImpl: (input, init) => {
        const url = String(input);
        if (url.includes("groups.getLongPollServer")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                response: {
                  server: "https://lp.vk.test/hanging",
                  key: "key-hanging",
                  ts: "300",
                },
              }),
            ),
          );
        }

        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            pollWasAborted = true;
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }

          init?.signal?.addEventListener(
            "abort",
            () => {
              pollWasAborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
      onMessage: () => {
        throw new Error("message handler should not be called");
      },
    });

    const startPromise = monitor.start();
    await Promise.resolve();
    monitor.stop("manual-stop");
    await startPromise;

    expect(pollWasAborted).toBe(true);
    expect(monitor.getStatus()).toMatchObject({
      state: "stopped",
      connected: false,
      active: false,
      stopReason: "manual-stop",
    });
  });
});
