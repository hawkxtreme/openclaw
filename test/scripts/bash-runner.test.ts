import { describe, expect, it } from "vitest";

import { resolveBashRunner } from "../../scripts/bash-runner.mjs";

describe("scripts/bash-runner.mjs", () => {
  it("uses bare bash on non-Windows platforms", () => {
    expect(
      resolveBashRunner({
        argv: ["scripts/test-live-build-docker.sh"],
        platform: "linux",
      }),
    ).toEqual({
      command: "bash",
      args: ["scripts/test-live-build-docker.sh"],
    });
  });

  it("prefers Git Bash on Windows when present", () => {
    expect(
      resolveBashRunner({
        argv: ["scripts/test-live-build-docker.sh"],
        env: {
          ProgramFiles: "C:\\Program Files",
        },
        existsSync: (target) => target === "C:\\Program Files\\Git\\bin\\bash.exe",
        platform: "win32",
      }),
    ).toEqual({
      command: "C:\\Program Files\\Git\\bin\\bash.exe",
      args: ["scripts/test-live-build-docker.sh"],
    });
  });
});
