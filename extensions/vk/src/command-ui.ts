import type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
import type { VkKeyboardSpec, VkReplyButton, VkReplyButtons } from "./keyboard.js";

type ProviderInfo = {
  id: string;
  count: number;
};

type VkCommandSuggestion = {
  label: string;
  command: string;
};

export const VK_CLOSE_MENU_COMMAND = "/vk-menu-close";

const MODELS_PAGE_SIZE = 6;
const PROVIDERS_PAGE_SIZE = 8;
const PROVIDERS_PER_ROW = 2;
const MODELS_PER_ROW = 2;
const MAX_MODEL_LABEL_CHARS = 36;
const COMMAND_SUGGESTIONS_PER_ROW = 2;
const VK_PRIMARY_COMMAND_SUGGESTIONS: readonly VkCommandSuggestion[] = [
  { label: "Menu", command: "/commands" },
  { label: "Help", command: "/help" },
  { label: "New", command: "/new" },
  { label: "Reset", command: "/reset" },
  { label: "Model", command: "/model" },
  { label: "Models", command: "/models" },
  { label: "Status", command: "/status" },
  { label: "Tools", command: "/tools" },
];

const VK_COMMAND_SUGGESTIONS: readonly VkCommandSuggestion[] = [
  ...VK_PRIMARY_COMMAND_SUGGESTIONS,
  { label: "Compact", command: "/compact" },
  { label: "Context", command: "/context" },
  { label: "Stop", command: "/stop" },
  { label: "Tasks", command: "/tasks" },
  { label: "Whoami", command: "/whoami" },
];

const VK_COMMAND_ALIASES = new Map<string, string>([
  ["menu", "/commands"],
  ["commands", "/commands"],
  ["help", "/help"],
  ["new", "/new"],
  ["reset", "/reset"],
  ["model", "/model"],
  ["models", "/models"],
  ["status", "/status"],
  ["tools", "/tools"],
  ["compact", "/compact"],
  ["context", "/context"],
  ["stop", "/stop"],
  ["tasks", "/tasks"],
  ["whoami", "/whoami"],
  ["меню", "/commands"],
  ["команды", "/commands"],
  ["помощь", "/help"],
  ["новый", "/new"],
  ["сброс", "/reset"],
  ["модель", "/model"],
  ["модели", "/models"],
  ["статус", "/status"],
  ["инструменты", "/tools"],
  ["стоп", "/stop"],
  ["задачи", "/tasks"],
  ["cancel", VK_CLOSE_MENU_COMMAND],
  ["close", VK_CLOSE_MENU_COMMAND],
  ["отмена", VK_CLOSE_MENU_COMMAND],
  ["закрыть", VK_CLOSE_MENU_COMMAND],
]);

function chunkButtons(buttons: readonly VkReplyButton[], size: number): VkReplyButtons {
  const rows: VkReplyButton[][] = [];
  for (let index = 0; index < buttons.length; index += size) {
    const row = buttons.slice(index, index + size);
    if (row.length > 0) {
      rows.push([...row]);
    }
  }
  return rows;
}

function toChannelData(
  buttons: VkReplyButtons,
  options: { inline?: boolean; oneTime?: boolean } = {},
): ReplyPayload["channelData"] | null {
  if (buttons.length === 0) {
    return null;
  }

  const spec: VkKeyboardSpec = {
    buttons,
    ...(options.inline ? { inline: true } : {}),
    ...(options.oneTime !== undefined ? { oneTime: options.oneTime } : {}),
  };

  return { vk: spec };
}

function truncateLabel(value: string, maxChars = MAX_MODEL_LABEL_CHARS): string {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) {
    return value.trim();
  }
  return `${chars.slice(0, maxChars - 3).join("")}...`;
}

function appendCloseRow(rows: VkReplyButton[][]): VkReplyButton[][] {
  return [
    ...rows,
    [{ text: "Close", callback_data: VK_CLOSE_MENU_COMMAND }],
  ];
}

function isCurrentModelSelection(params: {
  currentModel?: string;
  provider: string;
  model: string;
}): boolean {
  const currentModel = params.currentModel?.trim();
  if (!currentModel) {
    return false;
  }
  return currentModel.includes("/")
    ? currentModel === `${params.provider}/${params.model}`
    : currentModel === params.model;
}

export function buildVkCommandsListChannelData(params: {
  currentPage: number;
  totalPages: number;
}): ReplyPayload["channelData"] | null {
  const rows: VkReplyButton[][] = [
    [
      { text: "Models", callback_data: "/models" },
      { text: "Status", callback_data: "/status" },
    ],
    [
      { text: "Tools", callback_data: "/tools" },
      { text: "Help", callback_data: "/help" },
    ],
  ];

  const pagination: VkReplyButton[] = [];
  if (params.currentPage > 1) {
    pagination.push({
      text: "< Prev",
      callback_data: `/commands ${params.currentPage - 1}`,
    });
  }
  if (params.currentPage < params.totalPages) {
    pagination.push({
      text: "Next >",
      callback_data: `/commands ${params.currentPage + 1}`,
    });
  }
  if (pagination.length > 0) {
    rows.push(pagination);
  }

  return toChannelData(appendCloseRow(rows), {
    inline: true,
    oneTime: true,
  });
}

export function buildVkModelsProviderChannelData(params: {
  providers: ProviderInfo[];
  currentPage?: number;
  totalPages?: number;
}): ReplyPayload["channelData"] | null {
  if (params.providers.length === 0) {
    return null;
  }
  const rows = chunkButtons(
    params.providers.map((provider) => ({
      text: `${provider.id} (${provider.count})`,
      callback_data: `/models ${provider.id}`,
    })),
    PROVIDERS_PER_ROW,
  ).slice(0, Math.ceil(PROVIDERS_PAGE_SIZE / PROVIDERS_PER_ROW));

  if ((params.totalPages ?? 1) > 1) {
    const currentPage = Math.max(1, params.currentPage ?? 1);
    const totalPages = Math.max(currentPage, params.totalPages ?? currentPage);
    const pagination: VkReplyButton[] = [];
    if (currentPage > 1) {
      pagination.push({
        text: "< Prev",
        callback_data: `/models ${currentPage - 1}`,
      });
    }
    if (currentPage < totalPages) {
      pagination.push({
        text: "Next >",
        callback_data: `/models ${currentPage + 1}`,
      });
    }
    rows.push(pagination);
  }

  return toChannelData(appendCloseRow(rows), {
    inline: true,
    oneTime: true,
  });
}

export function buildVkModelsListChannelData(params: {
  provider: string;
  models: readonly string[];
  currentModel?: string;
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  modelNames?: ReadonlyMap<string, string>;
}): ReplyPayload["channelData"] | null {
  const pageSize = params.pageSize ?? MODELS_PAGE_SIZE;
  const startIndex = (params.currentPage - 1) * pageSize;
  const pageModels = params.models.slice(startIndex, startIndex + pageSize);
  const rows = chunkButtons(
    pageModels.map((model) => {
      const displayLabel = params.modelNames?.get(`${params.provider}/${model}`) ?? model;
      const selected = isCurrentModelSelection({
        currentModel: params.currentModel,
        provider: params.provider,
        model,
      });
      return {
        text: selected ? `${truncateLabel(displayLabel)} ✓` : truncateLabel(displayLabel),
        callback_data: `/model ${params.provider}/${model}`,
      };
    }),
    MODELS_PER_ROW,
  );

  if (params.totalPages > 1) {
    const pagination: VkReplyButton[] = [];
    if (params.currentPage > 1) {
      pagination.push({
        text: "< Prev",
        callback_data: `/models ${params.provider} ${params.currentPage - 1}`,
      });
    }
    if (params.currentPage < params.totalPages) {
      pagination.push({
        text: "Next >",
        callback_data: `/models ${params.provider} ${params.currentPage + 1}`,
      });
    }
    rows.push(pagination);
  }

  rows.push([
    {
      text: "< Back",
      callback_data: "/models",
    },
    {
      text: "Close",
      callback_data: VK_CLOSE_MENU_COMMAND,
    },
  ]);

  return toChannelData(rows, {
    inline: true,
    oneTime: true,
  });
}

export function buildVkModelBrowseChannelData(): ReplyPayload["channelData"] {
  return {
    vk: {
      inline: true,
      oneTime: true,
      buttons: [
        [{ text: "Browse providers", callback_data: "/models" }],
        [{ text: "Close", callback_data: VK_CLOSE_MENU_COMMAND }],
      ],
    },
  };
}

export function normalizeVkCommandShortcut(body: string): string {
  const normalized = body.trim();
  if (!normalized) {
    return normalized;
  }
  return VK_COMMAND_ALIASES.get(normalized.toLowerCase()) ?? normalized;
}

export function resolveVkSlashCommandSuggestionReply(
  body: string,
): { text: string; channelData: ReplyPayload["channelData"] } | null {
  const normalized = body.trim().toLowerCase();
  if (!normalized.startsWith("/") || normalized.includes(" ")) {
    return null;
  }

  const matches =
    normalized === "/"
      ? VK_PRIMARY_COMMAND_SUGGESTIONS
      : VK_COMMAND_SUGGESTIONS.filter((entry) =>
          entry.command.startsWith(normalized),
        );
  if (matches.length === 0) {
    return null;
  }
  if (normalized !== "/" && matches.some((entry) => entry.command === normalized)) {
    return null;
  }

  const channelData = toChannelData(
    appendCloseRow(
      chunkButtons(
        matches.map((entry) => ({
          text: entry.label,
          callback_data: entry.command,
        })),
        COMMAND_SUGGESTIONS_PER_ROW,
      ) as VkReplyButton[][],
    ),
    {
      inline: true,
      oneTime: true,
    },
  );
  if (!channelData) {
    return null;
  }

  return {
    text:
      normalized === "/"
        ? "VK uses buttons for command menus. Choose a command:"
        : "VK uses buttons for command menus. Matching commands:",
    channelData,
  };
}
