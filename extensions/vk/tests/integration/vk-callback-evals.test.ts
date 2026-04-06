import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createVkCallbackHandler,
  createVkTraceCollector,
} from "../../api.js";

type EvalScenario = {
  name: string;
  request: {
    method: string;
    body: unknown;
  };
  expected: {
    statusCode: number;
    body: string;
    eventType: string;
  };
};

const scenarios = JSON.parse(
  readFileSync("extensions/vk/evals/vk-callback-regression.json", "utf8"),
) as EvalScenario[];

describe("vk callback eval regression", () => {
  it("passes all callback scenarios from the eval fixture", async () => {
    const tracer = createVkTraceCollector();
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
      tracer,
    });

    for (const scenario of scenarios) {
      const result = await handler({
        method: scenario.request.method,
        body: JSON.stringify(scenario.request.body),
      });
      expect(result, scenario.name).toMatchObject(scenario.expected);
    }

    expect(tracer.getCounters()["webhook.accepted"]).toBeGreaterThan(0);
  });
});
