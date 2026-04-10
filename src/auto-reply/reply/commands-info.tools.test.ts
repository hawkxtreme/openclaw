import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";

async function loadToolsHarness(options?: {
  resolveToolsMock?: ReturnType<typeof vi.fn>;
  channelPlugin?: {
    commands?: {
      buildToolsGroupListChannelData?: (params: {
        groups: Array<{ id: string; label: string; count: number }>;
        currentPage: number;
        totalPages: number;
      }) => unknown;
      buildToolsListChannelData?: (params: {
        groupId: string;
        groupLabel: string;
        tools: Array<{ id: string; label: string }>;
        currentPage: number;
        totalPages: number;
      }) => unknown;
      buildToolDetailsChannelData?: (params: { groupId: string; currentPage: number }) => unknown;
    };
  } | null;
  resolveTools?: () => {
    agentId: string;
    profile: string;
    groups: Array<{
      id: "core" | "plugin" | "channel";
      label: string;
      source: "core" | "plugin" | "channel";
      pluginId?: string;
      channelId?: string;
      tools: Array<{
        id: string;
        label: string;
        description: string;
        source: "core" | "plugin" | "channel";
        pluginId?: string;
        channelId?: string;
      }>;
    }>;
  };
}) {
  vi.resetModules();
  vi.doMock("../../agents/agent-scope.js", async () => {
    const actual = await vi.importActual<typeof import("../../agents/agent-scope.js")>(
      "../../agents/agent-scope.js",
    );
    return {
      ...actual,
      resolveSessionAgentId: () => "main",
    };
  });
  const resolveToolsMock =
    options?.resolveToolsMock ??
    vi.fn(
      options?.resolveTools ??
        (() => ({
          agentId: "main",
          profile: "coding",
          groups: [
            {
              id: "core" as const,
              label: "Built-in tools",
              source: "core" as const,
              tools: [
                {
                  id: "exec",
                  label: "Exec",
                  description: "Run shell commands",
                  source: "core" as const,
                },
              ],
            },
            {
              id: "plugin" as const,
              label: "Connected tools",
              source: "plugin" as const,
              tools: [
                {
                  id: "docs_lookup",
                  label: "Docs Lookup",
                  description: "Search internal documentation",
                  source: "plugin" as const,
                  pluginId: "docs",
                },
              ],
            },
          ],
        })),
    );
  vi.doMock("../../agents/tools-effective-inventory.js", () => ({
    resolveEffectiveToolInventory: resolveToolsMock,
  }));
  vi.doMock("./agent-runner-utils.js", () => ({
    buildThreadingToolContext: () => ({
      currentChannelId: "channel-123",
      currentMessageId: "message-456",
    }),
  }));
  vi.doMock("./reply-threading.js", () => ({
    resolveReplyToMode: () => "all",
  }));
  vi.doMock("../../channels/plugins/index.js", async () => {
    const actual = await vi.importActual<typeof import("../../channels/plugins/index.js")>(
      "../../channels/plugins/index.js",
    );
    return {
      ...actual,
      getChannelPlugin: () => options?.channelPlugin ?? null,
    };
  });
  const { buildCommandTestParams } = await import("./commands.test-harness.js");
  const { handleCommandsListCommand, handleToolsCommand } = await import("./commands-info.js");
  return {
    buildCommandTestParams,
    handleCommandsListCommand,
    handleToolsCommand,
    resolveToolsMock,
  };
}

function buildConfig() {
  return {
    commands: { text: true },
    channels: { whatsapp: { allowFrom: ["*"] } },
  } as OpenClawConfig;
}

describe("handleToolsCommand", () => {
  it("renders a product-facing tool list", async () => {
    const { buildCommandTestParams, handleToolsCommand, resolveToolsMock } =
      await loadToolsHarness();
    const result = await handleToolsCommand(
      buildCommandTestParams("/tools", buildConfig(), undefined, {
        workspaceDir: "/tmp",
      }),
      true,
    );

    expect(result?.reply?.text).toContain("Available tools");
    expect(result?.reply?.text).toContain("Profile: coding");
    expect(result?.reply?.text).toContain("Built-in tools");
    expect(result?.reply?.text).toContain("exec");
    expect(result?.reply?.text).toContain("Connected tools");
    expect(result?.reply?.text).toContain("docs_lookup (docs)");
    expect(result?.reply?.text).not.toContain("unavailable right now");
    expect(resolveToolsMock).toHaveBeenCalledTimes(1);
  }, 180_000);

  it("returns usage when arguments are provided", async () => {
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness();
    const result = await handleToolsCommand(
      buildCommandTestParams("/tools extra", buildConfig(), undefined, { workspaceDir: "/tmp" }),
      true,
    );

    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "Usage: /tools [compact|verbose]" },
    });
  });

  it("does not synthesize group ids for direct-chat sender ids", async () => {
    const { buildCommandTestParams, handleToolsCommand, resolveToolsMock } =
      await loadToolsHarness();
    const params = buildCommandTestParams("/tools", buildConfig(), undefined, {
      workspaceDir: "/tmp",
    });
    params.ctx = {
      ...params.ctx,
      From: "telegram:8231046597",
      Provider: "telegram",
      ChatType: "dm",
    };

    await handleToolsCommand(params, true);

    expect(resolveToolsMock).toHaveBeenCalledWith(expect.objectContaining({ groupId: undefined }));
  });

  it("renders the detailed tool list in verbose mode", async () => {
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness();
    const result = await handleToolsCommand(
      buildCommandTestParams("/tools verbose", buildConfig(), undefined, { workspaceDir: "/tmp" }),
      true,
    );

    expect(result?.reply?.text).toContain("What this agent can use right now:");
    expect(result?.reply?.text).toContain("Profile: coding");
    expect(result?.reply?.text).toContain("Exec - Run shell commands");
    expect(result?.reply?.text).toContain("Docs Lookup - Search internal documentation");
  });

  it("accepts explicit compact mode", async () => {
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness();
    const result = await handleToolsCommand(
      buildCommandTestParams("/tools compact", buildConfig(), undefined, { workspaceDir: "/tmp" }),
      true,
    );

    expect(result?.reply?.text).toContain("exec");
    expect(result?.reply?.text).toContain("Use /tools verbose for descriptions.");
  });

  it("returns a VK button menu for tool groups", async () => {
    const buildToolsGroupListChannelData = vi.fn((params) => ({
      vk: {
        groups: params.groups,
        currentPage: params.currentPage,
        totalPages: params.totalPages,
      },
    }));
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness({
      channelPlugin: {
        commands: {
          buildToolsGroupListChannelData,
        },
      },
    });
    const params = buildCommandTestParams(
      "/tools",
      buildConfig(),
      { Surface: "vk", Provider: "vk" },
      { workspaceDir: "/tmp" },
    );

    const result = await handleToolsCommand(params, true);

    expect(result).toEqual({
      shouldContinue: false,
      reply: {
        text: "Available tools\n\nProfile: coding\nChoose a tool group:",
        channelData: {
          vk: {
            groups: [
              { id: "core", label: "Built-in tools", count: 1 },
              { id: "plugin", label: "Connected tools", count: 1 },
            ],
            currentPage: 1,
            totalPages: 1,
          },
        },
      },
    });
    expect(buildToolsGroupListChannelData).toHaveBeenCalledWith({
      groups: [
        { id: "core", label: "Built-in tools", count: 1 },
        { id: "plugin", label: "Connected tools", count: 1 },
      ],
      currentPage: 1,
      totalPages: 1,
    });
  });

  it("returns a VK button menu for tools inside a group", async () => {
    const buildToolsListChannelData = vi.fn((params) => ({
      vk: {
        groupId: params.groupId,
        tools: params.tools,
        currentPage: params.currentPage,
        totalPages: params.totalPages,
      },
    }));
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness({
      channelPlugin: {
        commands: {
          buildToolsListChannelData,
        },
      },
    });
    const params = buildCommandTestParams(
      "/tools plugin",
      buildConfig(),
      { Surface: "vk", Provider: "vk" },
      { workspaceDir: "/tmp" },
    );

    const result = await handleToolsCommand(params, true);

    expect(result).toEqual({
      shouldContinue: false,
      reply: {
        text: "Connected tools — 1 available\nTap a tool for details.",
        channelData: {
          vk: {
            groupId: "plugin",
            tools: [{ id: "docs_lookup", label: "Docs Lookup" }],
            currentPage: 1,
            totalPages: 1,
          },
        },
      },
    });
    expect(buildToolsListChannelData).toHaveBeenCalledWith({
      groupId: "plugin",
      groupLabel: "Connected tools",
      tools: [{ id: "docs_lookup", label: "Docs Lookup" }],
      currentPage: 1,
      totalPages: 1,
    });
  });

  it("returns a VK tool details view without requiring /tools verbose", async () => {
    const buildToolDetailsChannelData = vi.fn((params) => ({
      vk: {
        groupId: params.groupId,
        currentPage: params.currentPage,
      },
    }));
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness({
      channelPlugin: {
        commands: {
          buildToolDetailsChannelData,
        },
      },
    });
    const params = buildCommandTestParams(
      "/tools plugin docs_lookup",
      buildConfig(),
      { Surface: "vk", Provider: "vk" },
      { workspaceDir: "/tmp" },
    );

    const result = await handleToolsCommand(params, true);

    expect(result).toEqual({
      shouldContinue: false,
      reply: {
        text: "Docs Lookup\n\nConnected tools\nSearch internal documentation",
        channelData: {
          vk: {
            groupId: "plugin",
            currentPage: 1,
          },
        },
      },
    });
    expect(buildToolDetailsChannelData).toHaveBeenCalledWith({
      groupId: "plugin",
      currentPage: 1,
    });
  });

  it("reuses the cached inventory while browsing VK tool menus", async () => {
    const { buildCommandTestParams, handleToolsCommand, resolveToolsMock } = await loadToolsHarness(
      {
        channelPlugin: {
          commands: {
            buildToolsGroupListChannelData: vi.fn(() => ({ vk: { kind: "groups" } })),
            buildToolsListChannelData: vi.fn(() => ({ vk: { kind: "group" } })),
          },
        },
      },
    );
    const rootParams = buildCommandTestParams(
      "/tools",
      buildConfig(),
      { Surface: "vk", Provider: "vk" },
      { workspaceDir: "/tmp" },
    );
    const groupParams = buildCommandTestParams(
      "/tools plugin",
      buildConfig(),
      { Surface: "vk", Provider: "vk" },
      { workspaceDir: "/tmp" },
    );

    await handleToolsCommand(rootParams, true);
    await handleToolsCommand(groupParams, true);

    expect(resolveToolsMock).toHaveBeenCalledTimes(1);
  });

  it("ignores unauthorized senders", async () => {
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness();
    const params = buildCommandTestParams("/tools", buildConfig(), undefined, {
      workspaceDir: "/tmp",
    });
    params.command = {
      ...params.command,
      isAuthorizedSender: false,
      senderId: "unauthorized",
    };

    const result = await handleToolsCommand(params, true);

    expect(result).toEqual({ shouldContinue: false });
  });

  it("uses the configured default account when /tools omits AccountId", async () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "telegram",
          source: "test",
          plugin: {
            ...createChannelTestPluginBase({
              id: "telegram",
              label: "Telegram",
              config: {
                listAccountIds: () => ["default", "work"],
                defaultAccountId: () => "work",
                resolveAccount: (_cfg, accountId) => ({ accountId: accountId ?? "work" }),
              },
            }),
          },
        },
      ]),
    );

    const { buildCommandTestParams, handleToolsCommand, resolveToolsMock } =
      await loadToolsHarness();
    const params = buildCommandTestParams(
      "/tools",
      {
        commands: { text: true },
        channels: { telegram: { defaultAccount: "work" } },
      } as OpenClawConfig,
      undefined,
      { workspaceDir: "/tmp" },
    );
    params.agentId = "main";
    params.provider = "openai";
    params.model = "gpt-4.1";
    params.ctx = {
      ...params.ctx,
      OriginatingChannel: "telegram",
      Provider: "telegram",
      Surface: "telegram",
      ChatType: "group",
      AccountId: undefined,
    };
    params.command = {
      ...params.command,
      channel: "telegram",
    };

    await handleToolsCommand(params, true);

    expect(resolveToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "work",
      }),
    );
  });

  it("warms the inventory cache when interactive commands menu opens", async () => {
    vi.useFakeTimers();
    try {
      const {
        buildCommandTestParams,
        handleCommandsListCommand,
        handleToolsCommand,
        resolveToolsMock,
      } = await loadToolsHarness({
        channelPlugin: {
          commands: {
            buildToolsGroupListChannelData: vi.fn(() => ({ vk: { kind: "groups" } })),
          },
        },
      });
      const commandsParams = buildCommandTestParams(
        "/commands",
        buildConfig(),
        { Surface: "vk", Provider: "vk" },
        { workspaceDir: "/tmp" },
      );
      const toolsParams = buildCommandTestParams(
        "/tools",
        buildConfig(),
        { Surface: "vk", Provider: "vk" },
        { workspaceDir: "/tmp" },
      );

      await handleCommandsListCommand(commandsParams, true);
      await vi.runAllTimersAsync();
      await handleToolsCommand(toolsParams, true);

      expect(resolveToolsMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a concise fallback error on effective inventory failures", async () => {
    const { buildCommandTestParams, handleToolsCommand } = await loadToolsHarness({
      resolveTools: () => {
        throw new Error("boom");
      },
    });

    const result = await handleToolsCommand(
      buildCommandTestParams("/tools", buildConfig(), undefined, { workspaceDir: "/tmp" }),
      true,
    );

    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "Couldn't load available tools right now. Try again in a moment." },
    });
  });
});
