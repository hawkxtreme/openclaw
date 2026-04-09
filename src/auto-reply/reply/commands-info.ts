import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveEffectiveToolInventory } from "../../agents/tools-effective-inventory.js";
import { getChannelPlugin } from "../../channels/plugins/index.js";
import { logVerbose } from "../../globals.js";
import { listSkillCommandsForAgents } from "../skill-commands.js";
import {
  buildCommandsMessage,
  buildCommandsMessagePaginated,
  buildHelpMessage,
  buildToolsMessage,
} from "../status.js";
import type { ReplyPayload } from "../types.js";
import { buildThreadingToolContext } from "./agent-runner-utils.js";
import { resolveChannelAccountId } from "./channel-context.js";
import { buildExportSessionReply } from "./commands-export-session.js";
import { buildStatusReply } from "./commands-status.js";
import type { CommandHandler } from "./commands-types.js";
import { extractExplicitGroupId } from "./group-id.js";
import { resolveReplyToMode } from "./reply-threading.js";
export { handleContextCommand } from "./commands-context-command.js";
export { handleWhoamiCommand } from "./commands-whoami.js";

const TOOLS_GROUPS_PER_PAGE = 6;
const TOOLS_PER_PAGE = 6;

type InteractiveToolsGroup = {
  id: string;
  label: string;
  tools: Array<{
    id: string;
    label: string;
    description: string;
    rawDescription: string;
    pluginId?: string;
    channelId?: string;
  }>;
};

type InteractiveToolsBrowseTarget =
  | { kind: "groups"; page: number }
  | { kind: "group"; groupId: string; page: number }
  | { kind: "tool"; groupId: string; toolId: string };

function parseCommandsPageArg(commandBodyNormalized: string):
  | { matched: false }
  | { matched: true; page: number }
  | { matched: true; error: string } {
  const normalized = commandBodyNormalized.trim();
  if (normalized === "/commands") {
    return { matched: true, page: 1 };
  }
  if (!normalized.startsWith("/commands ")) {
    return { matched: false };
  }

  const rawArg = normalized.replace(/^\/commands\b/i, "").trim().toLowerCase();
  if (!rawArg) {
    return { matched: true, page: 1 };
  }
  const pageToken = rawArg.startsWith("page=") ? rawArg.slice("page=".length) : rawArg;
  if (/^[0-9]+$/.test(pageToken)) {
    const page = Number.parseInt(pageToken, 10);
    if (Number.isFinite(page) && page > 0) {
      return { matched: true, page };
    }
  }
  return { matched: true, error: "Usage: /commands [page|page=<n>]" };
}

function parsePositivePage(value: string): number | null {
  if (!/^[0-9]+$/u.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseInteractiveToolsTarget(
  commandBodyNormalized: string,
): InteractiveToolsBrowseTarget | null {
  const trimmed = commandBodyNormalized.trim();
  if (!trimmed.startsWith("/tools")) {
    return null;
  }
  const argText = trimmed.replace(/^\/tools\b/i, "").trim();
  if (!argText || argText === "compact" || argText === "verbose") {
    return { kind: "groups", page: 1 };
  }

  const tokens = argText.split(/\s+/g).filter(Boolean);
  const [firstToken, secondToken, thirdToken] = tokens;
  if (!firstToken || thirdToken) {
    return null;
  }

  const rootPage = parsePositivePage(firstToken);
  if (rootPage) {
    return { kind: "groups", page: rootPage };
  }

  if (!secondToken || secondToken === "compact" || secondToken === "verbose") {
    return { kind: "group", groupId: firstToken.toLowerCase(), page: 1 };
  }

  const groupPage = parsePositivePage(secondToken);
  if (groupPage) {
    return { kind: "group", groupId: firstToken.toLowerCase(), page: groupPage };
  }

  return {
    kind: "tool",
    groupId: firstToken.toLowerCase(),
    toolId: secondToken,
  };
}

function buildInteractiveToolsGroups(result: EffectiveToolInventoryResult): InteractiveToolsGroup[] {
  return result.groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      tools: group.tools.map((tool) => ({
        id: tool.id,
        label: tool.label,
        description: tool.description,
        rawDescription: tool.rawDescription,
        pluginId: tool.pluginId,
        channelId: tool.channelId,
      })),
    }))
    .filter((group) => group.tools.length > 0);
}

function buildInteractiveToolsReply(params: {
  result: EffectiveToolInventoryResult;
  commandBodyNormalized: string;
  commandPlugin: NonNullable<ReturnType<typeof getChannelPlugin>>;
}): ReplyPayload | null {
  const target = parseInteractiveToolsTarget(params.commandBodyNormalized);
  if (!target) {
    return null;
  }

  const groups = buildInteractiveToolsGroups(params.result);
  if (groups.length === 0) {
    return null;
  }

  if (target.kind === "groups") {
    const totalPages = Math.max(1, Math.ceil(groups.length / TOOLS_GROUPS_PER_PAGE));
    const currentPage = Math.max(1, Math.min(target.page, totalPages));
    const startIndex = (currentPage - 1) * TOOLS_GROUPS_PER_PAGE;
    const channelData = params.commandPlugin.commands?.buildToolsGroupListChannelData?.({
      groups: groups.slice(startIndex, startIndex + TOOLS_GROUPS_PER_PAGE).map((group) => ({
        id: group.id,
        label: group.label,
        count: group.tools.length,
      })),
      currentPage,
      totalPages,
    });
    if (!channelData) {
      return null;
    }
    return {
      text: `Available tools\n\nProfile: ${params.result.profile}\nChoose a tool group:`,
      channelData,
    };
  }

  const group = groups.find((entry) => entry.id === target.groupId);
  if (!group) {
    return null;
  }

  if (target.kind === "group") {
    const totalPages = Math.max(1, Math.ceil(group.tools.length / TOOLS_PER_PAGE));
    const currentPage = Math.max(1, Math.min(target.page, totalPages));
    const startIndex = (currentPage - 1) * TOOLS_PER_PAGE;
    const pageTools = group.tools.slice(startIndex, startIndex + TOOLS_PER_PAGE);
    const channelData = params.commandPlugin.commands?.buildToolsListChannelData?.({
      groupId: group.id,
      groupLabel: group.label,
      tools: pageTools.map((tool) => ({
        id: tool.id,
        label: tool.label,
      })),
      currentPage,
      totalPages,
    });
    if (!channelData) {
      return null;
    }
    const header =
      totalPages > 1
        ? `${group.label} — ${group.tools.length} available (page ${currentPage}/${totalPages})`
        : `${group.label} — ${group.tools.length} available`;
    return {
      text: `${header}\nTap a tool for details.`,
      channelData,
    };
  }

  const toolIndex = group.tools.findIndex(
    (tool) => tool.id.toLowerCase() === target.toolId.toLowerCase(),
  );
  if (toolIndex < 0) {
    return null;
  }
  const tool = group.tools[toolIndex];
  const currentPage = Math.max(1, Math.floor(toolIndex / TOOLS_PER_PAGE) + 1);
  const channelData = params.commandPlugin.commands?.buildToolDetailsChannelData?.({
    groupId: group.id,
    currentPage,
  });
  if (!channelData) {
    return null;
  }
  return {
    text: `${tool.label}\n\n${group.label}\n${tool.rawDescription || tool.description}`,
    channelData,
  };
}

export const handleHelpCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  if (params.command.commandBodyNormalized !== "/help") {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /help from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  return {
    shouldContinue: false,
    reply: { text: buildHelpMessage(params.cfg) },
  };
};

export const handleCommandsListCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsedPage = parseCommandsPageArg(params.command.commandBodyNormalized);
  if (!parsedPage.matched) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /commands from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  if ("error" in parsedPage) {
    return {
      shouldContinue: false,
      reply: { text: parsedPage.error },
    };
  }
  const skillCommands =
    params.skillCommands ??
    listSkillCommandsForAgents({
      cfg: params.cfg,
      agentIds: params.agentId ? [params.agentId] : undefined,
    });
  const surface = params.ctx.Surface;
  const commandPlugin = surface ? getChannelPlugin(surface) : null;
  const paginated = buildCommandsMessagePaginated(params.cfg, skillCommands, {
    page: parsedPage.page,
    surface,
  });
  const channelData = commandPlugin?.commands?.buildCommandsListChannelData?.({
    currentPage: paginated.currentPage,
    totalPages: paginated.totalPages,
    agentId: params.agentId,
  });
  if (channelData) {
    return {
      shouldContinue: false,
      reply: {
        text: paginated.text,
        channelData,
      },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: buildCommandsMessage(params.cfg, skillCommands, { surface }) },
  };
};

export const handleToolsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  const surface = params.ctx.Surface;
  const commandPlugin = surface ? getChannelPlugin(surface) : null;
  const hasInteractiveToolsSupport = Boolean(
    commandPlugin?.commands?.buildToolsGroupListChannelData ||
      commandPlugin?.commands?.buildToolsListChannelData ||
      commandPlugin?.commands?.buildToolDetailsChannelData,
  );
  const interactiveTarget = hasInteractiveToolsSupport
    ? parseInteractiveToolsTarget(normalized)
    : null;
  let verbose = false;
  if (interactiveTarget) {
    verbose = false;
  } else if (normalized === "/tools" || normalized === "/tools compact") {
    verbose = false;
  } else if (normalized === "/tools verbose") {
    verbose = true;
  } else if (normalized.startsWith("/tools ")) {
    return { shouldContinue: false, reply: { text: "Usage: /tools [compact|verbose]" } };
  } else {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /tools from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  try {
    const effectiveAccountId = resolveChannelAccountId({
      cfg: params.cfg,
      ctx: params.ctx,
      command: params.command,
    });
    const agentId =
      params.agentId ??
      resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });
    const threadingContext = buildThreadingToolContext({
      sessionCtx: params.ctx,
      config: params.cfg,
      hasRepliedRef: undefined,
    });
    const result = resolveEffectiveToolInventory({
      cfg: params.cfg,
      agentId,
      sessionKey: params.sessionKey,
      workspaceDir: params.workspaceDir,
      agentDir: params.agentDir,
      modelProvider: params.provider,
      modelId: params.model,
      messageProvider: params.command.channel,
      senderIsOwner: params.command.senderIsOwner,
      senderId: params.command.senderId,
      senderName: params.ctx.SenderName,
      senderUsername: params.ctx.SenderUsername,
      senderE164: params.ctx.SenderE164,
      accountId: effectiveAccountId,
      currentChannelId: threadingContext.currentChannelId,
      currentThreadTs:
        typeof params.ctx.MessageThreadId === "string" ||
        typeof params.ctx.MessageThreadId === "number"
          ? String(params.ctx.MessageThreadId)
          : undefined,
      currentMessageId: threadingContext.currentMessageId,
      groupId: params.sessionEntry?.groupId ?? extractExplicitGroupId(params.ctx.From),
      groupChannel:
        params.sessionEntry?.groupChannel ?? params.ctx.GroupChannel ?? params.ctx.GroupSubject,
      groupSpace: params.sessionEntry?.space ?? params.ctx.GroupSpace,
      replyToMode: resolveReplyToMode(
        params.cfg,
        params.ctx.OriginatingChannel ?? params.ctx.Provider,
        effectiveAccountId,
        params.ctx.ChatType,
      ),
    });
    const interactiveReply = commandPlugin
      ? buildInteractiveToolsReply({
          result,
          commandBodyNormalized: normalized,
          commandPlugin,
        })
      : null;
    if (interactiveReply) {
      return {
        shouldContinue: false,
        reply: interactiveReply,
      };
    }
    return {
      shouldContinue: false,
      reply: { text: buildToolsMessage(result, { verbose }) },
    };
  } catch (err) {
    const message = String(err);
    const text = message.includes("missing scope:")
      ? "You do not have permission to view available tools."
      : "Couldn't load available tools right now. Try again in a moment.";
    return {
      shouldContinue: false,
      reply: { text },
    };
  }
};

export const handleStatusCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const statusRequested =
    params.directives.hasStatusDirective || params.command.commandBodyNormalized === "/status";
  if (!statusRequested) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /status from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  const reply = await buildStatusReply({
    cfg: params.cfg,
    command: params.command,
    sessionEntry: params.sessionEntry,
    sessionKey: params.sessionKey,
    parentSessionKey: params.ctx.ParentSessionKey,
    sessionScope: params.sessionScope,
    provider: params.provider,
    model: params.model,
    contextTokens: params.contextTokens,
    resolvedThinkLevel: params.resolvedThinkLevel,
    resolvedVerboseLevel: params.resolvedVerboseLevel,
    resolvedReasoningLevel: params.resolvedReasoningLevel,
    resolvedElevatedLevel: params.resolvedElevatedLevel,
    resolveDefaultThinkingLevel: params.resolveDefaultThinkingLevel,
    isGroup: params.isGroup,
    defaultGroupActivation: params.defaultGroupActivation,
    mediaDecisions: params.ctx.MediaUnderstandingDecisions,
  });
  return { shouldContinue: false, reply };
};

export const handleExportSessionCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  if (
    normalized !== "/export-session" &&
    !normalized.startsWith("/export-session ") &&
    normalized !== "/export" &&
    !normalized.startsWith("/export ")
  ) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /export-session from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  return { shouldContinue: false, reply: await buildExportSessionReply(params) };
};
