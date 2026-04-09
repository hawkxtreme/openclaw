import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const watchMock = vi.fn(() => ({
  on: vi.fn(),
  close: vi.fn(async () => undefined),
}));

let refreshModule: typeof import("./refresh.js");

vi.mock("chokidar", () => ({
  default: { watch: watchMock },
}));

vi.mock("./plugin-skills.js", () => ({
  resolvePluginSkillDirs: vi.fn(() => []),
}));

describe("ensureSkillsWatcher", () => {
  beforeAll(async () => {
    refreshModule = await import("./refresh.js");
  });

  beforeEach(() => {
    watchMock.mockClear();
  });

  afterEach(async () => {
    await refreshModule.resetSkillsRefreshForTest();
  });

  it("ignores node_modules, dist, .git, and Python venvs by default", async () => {
    refreshModule.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });

    expect(watchMock).toHaveBeenCalledTimes(1);
    const firstCall = (
      watchMock.mock.calls as unknown as Array<[string[], { ignored?: unknown }]>
    )[0];
    const targets = firstCall?.[0] ?? [];
    const opts = firstCall?.[1] ?? {};

    expect(opts.ignored).toBe(refreshModule.DEFAULT_SKILLS_WATCH_IGNORED);
    const posix = (p: string) => p.replaceAll("\\", "/");
    expect(targets).toEqual(
      expect.arrayContaining([
        posix(path.join("/tmp/workspace", "skills", "SKILL.md")),
        posix(path.join("/tmp/workspace", "skills", "*", "SKILL.md")),
        posix(path.join("/tmp/workspace", ".agents", "skills", "SKILL.md")),
        posix(path.join("/tmp/workspace", ".agents", "skills", "*", "SKILL.md")),
        posix(path.join(os.homedir(), ".agents", "skills", "SKILL.md")),
        posix(path.join(os.homedir(), ".agents", "skills", "*", "SKILL.md")),
      ]),
    );
    expect(targets.every((target) => target.includes("SKILL.md"))).toBe(true);
    const ignored = refreshModule.DEFAULT_SKILLS_WATCH_IGNORED;

    // Node/JS paths
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/node_modules/pkg/index.js"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/dist/index.js"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.git/config"))).toBe(true);

    // Python virtual environments and caches
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/scripts/.venv/bin/python"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/venv/lib/python3.10/site.py"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/__pycache__/module.pyc"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.mypy_cache/3.10/foo.json"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.pytest_cache/v/cache"))).toBe(true);

    // Build artifacts and caches
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/build/output.js"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.cache/data.json"))).toBe(true);

    // Should NOT ignore normal skill files
    expect(ignored.some((re) => re.test("/tmp/.hidden/skills/index.md"))).toBe(false);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/my-skill/SKILL.md"))).toBe(false);
  });

  it("disposes a single workspace watcher on demand", async () => {
    refreshModule.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });
    refreshModule.ensureSkillsWatcher({ workspaceDir: "/tmp/other-workspace" });

    const firstWatcher = watchMock.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> };
    const secondWatcher = watchMock.mock.results[1]?.value as { close: ReturnType<typeof vi.fn> };

    await refreshModule.disposeSkillsWatchers({ workspaceDir: "/tmp/workspace" });

    expect(firstWatcher.close).toHaveBeenCalledTimes(1);
    expect(secondWatcher.close).not.toHaveBeenCalled();
  });

  it("skips watcher setup and closes an existing watcher when env disables skills watch", async () => {
    refreshModule.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });
    const firstWatcher = watchMock.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> };

    process.env.OPENCLAW_DISABLE_SKILLS_WATCH = "1";
    try {
      refreshModule.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });
      expect(watchMock).toHaveBeenCalledTimes(1);
      expect(firstWatcher.close).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.OPENCLAW_DISABLE_SKILLS_WATCH;
    }
  });
});
