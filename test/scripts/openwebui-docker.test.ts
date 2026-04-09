import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "e2e", "openwebui-docker.sh");

describe("scripts/e2e/openwebui-docker.sh", () => {
  it("disables MSYS path conversion for the container probe path", async () => {
    const script = await readFile(SCRIPT, "utf8");

    expect(script).toMatch(
      /MSYS_NO_PATHCONV=1\s+MSYS2_ARG_CONV_EXCL=['"]\*['"]\s+docker exec[\s\S]*node \/app\/scripts\/e2e\/openwebui-probe\.mjs/,
    );
  });
});
