import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LIVE_MODEL_SCRIPT = path.join(process.cwd(), "scripts", "test-live-models-docker.sh");
const LIVE_GATEWAY_SCRIPT = path.join(
  process.cwd(),
  "scripts",
  "test-live-gateway-models-docker.sh",
);

async function readScript(filePath: string) {
  return readFile(filePath, "utf8");
}

describe("live Docker shell wrappers", () => {
  it("normalizes mounted host paths before docker run", async () => {
    const modelScript = await readScript(LIVE_MODEL_SCRIPT);
    const gatewayScript = await readScript(LIVE_GATEWAY_SCRIPT);

    expect(modelScript).toContain('cygpath -am "$target"');
    expect(gatewayScript).toContain('cygpath -am "$target"');
  });

  it("disables MSYS path mangling for docker run mounts", async () => {
    const modelScript = await readScript(LIVE_MODEL_SCRIPT);
    const gatewayScript = await readScript(LIVE_GATEWAY_SCRIPT);

    expect(modelScript).toMatch(/MSYS_NO_PATHCONV=1\s+MSYS2_ARG_CONV_EXCL=['"]\*['"]\s+docker run/);
    expect(gatewayScript).toMatch(
      /MSYS_NO_PATHCONV=1\s+MSYS2_ARG_CONV_EXCL=['"]\*['"]\s+docker run/,
    );
  });
});
