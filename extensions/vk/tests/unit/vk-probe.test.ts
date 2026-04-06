import { describe, expect, it } from "vitest";

import {
  parseVkConfig,
  probeVkAccount,
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
        accessToken: "replace-me-probe-token",
      },
    ),
    accountId: overrides?.accountId,
    env: overrides?.env ?? {},
  });
}

describe("vk probe", () => {
  it("returns success for direct array response", async () => {
    const account = createAccount();
    const result = await probeVkAccount({
      account,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            response: [
              {
                id: 77,
                name: "VK Bot",
                screen_name: "vk-bot",
              },
            ],
          }),
        ),
    });

    expect(result).toEqual({
      ok: true,
      accountId: "default",
      tokenSource: "config",
      group: {
        id: 77,
        name: "VK Bot",
        screenName: "vk-bot",
      },
    });
  });

  it("accepts nested groups response shape", async () => {
    const account = createAccount();
    const result = await probeVkAccount({
      account,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            response: {
              groups: [
                {
                  id: 77,
                  name: "VK Bot",
                  screen_name: "vk-bot",
                },
              ],
            },
          }),
        ),
    });

    expect(result.ok).toBe(true);
  });

  it("returns mismatch error when probed group differs from config", async () => {
    const account = createAccount();
    const result = await probeVkAccount({
      account,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            response: [
              {
                id: 88,
                name: "Different",
                screen_name: "different",
              },
            ],
          }),
        ),
    });

    expect(result).toEqual({
      ok: false,
      accountId: "default",
      tokenSource: "config",
      error: "Configured groupId 77 does not match probed group 88",
    });
  });

  it("fails fast when token is missing", async () => {
    const account = createAccount({
      config: {
        groupId: 77,
      },
      env: {},
    });

    const result = await probeVkAccount({ account });
    expect(result).toEqual({
      ok: false,
      accountId: "default",
      tokenSource: "none",
      error: "VK token is not configured",
    });
  });

  it("returns timeout error when fetch aborts", async () => {
    const account = createAccount();
    const result = await probeVkAccount({
      account,
      timeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    });

    expect(result).toEqual({
      ok: false,
      accountId: "default",
      tokenSource: "config",
      error: "VK probe timed out after 20ms",
    });
  });
});
