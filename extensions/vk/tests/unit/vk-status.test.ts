import { describe, expect, it } from "vitest";
import { vkStatusAdapter } from "../../src/status.js";

describe("vk status adapter", () => {
  it("skips stale-socket health checks for idle long-poll sessions", () => {
    expect(vkStatusAdapter.skipStaleSocketHealthCheck).toBe(true);
  });
});
