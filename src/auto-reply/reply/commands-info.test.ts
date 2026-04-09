import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import { handleContextCommand } from "./commands-context-command.js";
import { handleCommandsListCommand } from "./commands-info.js";
import type { HandleCommandsParams } from "./commands-types.js";
import { handleWhoamiCommand } from "./commands-whoami.js";

const buildContextReplyMock = vi.hoisted(() => vi.fn());

vi.mock("./commands-context-report.js", () => ({
  buildContextReply: buildContextReplyMock,
}));

function buildInfoParams(
  commandBodyNormalized: string,
  cfg: OpenClawConfig,
  ctxOverrides?: Partial<MsgContext>,
  commandOverrides?: Partial<HandleCommandsParams["command"]>,
): HandleCommandsParams {
  return {
    cfg,
    ctx: {
      Provider: "whatsapp",
      Surface: "whatsapp",
      CommandSource: "text",
      ...ctxOverrides,
    },
    command: {
      commandBodyNormalized,
      isAuthorizedSender: true,
      senderIsOwner: true,
      senderId: "12345",
      channel: "whatsapp",
      channelId: "whatsapp",
      surface: "whatsapp",
      ownerList: [],
      from: "12345",
      to: "bot",
      ...commandOverrides,
    },
    sessionKey: "agent:main:whatsapp:direct:12345",
    workspaceDir: "/tmp",
    provider: "whatsapp",
    model: "test-model",
    contextTokens: 0,
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolveDefaultThinkingLevel: async () => undefined,
    isGroup: false,
    directives: {},
    elevated: { enabled: true, allowed: true, failures: [] },
  } as unknown as HandleCommandsParams;
}

describe("info command handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePluginRegistry(createTestRegistry([]));
    buildContextReplyMock.mockImplementation(async (params: HandleCommandsParams) => {
      const normalized = params.command.commandBodyNormalized;
      if (normalized === "/context list") {
        return { text: "Injected workspace files:\n- AGENTS.md" };
      }
      if (normalized === "/context detail") {
        return { text: "Context breakdown (detailed)\nTop tools (schema size):" };
      }
      return { text: "/context\n- /context list\nInline shortcut" };
    });
  });

  it("returns sender details for /whoami", async () => {
    const result = await handleWhoamiCommand(
      buildInfoParams(
        "/whoami",
        {
          commands: { text: true },
          channels: { whatsapp: { allowFrom: ["*"] } },
        } as OpenClawConfig,
        {
          SenderId: "12345",
          SenderUsername: "TestUser",
          ChatType: "direct",
        },
      ),
      true,
    );
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Channel: whatsapp");
    expect(result?.reply?.text).toContain("User id: 12345");
    expect(result?.reply?.text).toContain("Username: @TestUser");
    expect(result?.reply?.text).toContain("AllowFrom: 12345");
  });

  it("returns expected details for /context commands", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as OpenClawConfig;
    const cases = [
      { commandBody: "/context", expectedText: ["/context list", "Inline shortcut"] },
      { commandBody: "/context list", expectedText: ["Injected workspace files:", "AGENTS.md"] },
      {
        commandBody: "/context detail",
        expectedText: ["Context breakdown (detailed)", "Top tools (schema size):"],
      },
    ] as const;

    for (const testCase of cases) {
      const result = await handleContextCommand(buildInfoParams(testCase.commandBody, cfg), true);
      expect(result?.shouldContinue).toBe(false);
      for (const expectedText of testCase.expectedText) {
        expect(result?.reply?.text).toContain(expectedText);
      }
    }
  });

  it("supports paginated /commands navigation on text-button surfaces", async () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "vk",
          source: "test",
          plugin: {
            ...createChannelTestPluginBase({
              id: "vk",
              label: "VK",
              docsPath: "/channels/vk",
              capabilities: { chatTypes: ["direct", "group"], media: true },
            }),
            commands: {
              buildCommandsListChannelData: ({ currentPage, totalPages }: { currentPage: number; totalPages: number; }) => ({
                vk: {
                  buttons: [[{ text: `${currentPage}/${totalPages}`, callback_data: `/commands ${currentPage}` }]],
                },
              }),
            },
          },
        },
      ]),
    );

    const params = buildInfoParams(
        "/commands 2",
        {
          commands: { text: true },
        } as OpenClawConfig,
        {
          Provider: "vk",
          Surface: "vk",
        },
        {
          channel: "vk",
          channelId: "vk",
          surface: "vk",
        },
      );
    params.skillCommands = [];

    const result = await handleCommandsListCommand(params, true);

    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Commands (2/");
    expect(result?.reply?.channelData).toEqual({
      vk: {
        buttons: [[{ text: expect.stringMatching(/^2\//), callback_data: "/commands 2" }]],
      },
    });
  });
});
