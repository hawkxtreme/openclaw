import { describe, expect, it } from "vitest";

import { createDockerAllPlan } from "../../scripts/test-docker-all.mjs";

describe("scripts/test-docker-all.mjs", () => {
  it("runs the Docker gates in the expected order", () => {
    expect(createDockerAllPlan().map((step) => step.script)).toEqual([
      "test:docker:live-build",
      "test:docker:live-models",
      "test:docker:live-gateway",
      "test:docker:openwebui",
      "test:docker:onboard",
      "test:docker:gateway-network",
      "test:docker:mcp-channels",
      "test:docker:qr",
      "test:docker:doctor-switch",
      "test:docker:plugins",
      "test:docker:cleanup",
    ]);
  });

  it("reuses the Docker image after the initial live-build step", () => {
    const plan = createDockerAllPlan();

    expect(plan[0]).toMatchObject({
      script: "test:docker:live-build",
      env: {},
    });
    expect(plan[1]).toMatchObject({
      script: "test:docker:live-models",
      env: { OPENCLAW_SKIP_DOCKER_BUILD: "1" },
    });
    expect(plan[2]).toMatchObject({
      script: "test:docker:live-gateway",
      env: { OPENCLAW_SKIP_DOCKER_BUILD: "1" },
    });
  });
});
