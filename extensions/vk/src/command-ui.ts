import type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
import type { VkReplyButton, VkReplyButtons } from "./keyboard.js";

type ProviderInfo = {
  id: string;
  count: number;
};

const MODELS_PAGE_SIZE = 8;
const PROVIDERS_PER_ROW = 2;
const MAX_MODEL_LABEL_CHARS = 36;

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

function toChannelData(buttons: VkReplyButtons): ReplyPayload["channelData"] | null {
  return buttons.length > 0 ? { vk: { buttons } } : null;
}

function truncateLabel(value: string, maxChars = MAX_MODEL_LABEL_CHARS): string {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) {
    return value.trim();
  }
  return `${chars.slice(0, maxChars - 3).join("")}...`;
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
  if (params.totalPages <= 1) {
    return null;
  }

  const buttons: VkReplyButton[] = [];
  if (params.currentPage > 1) {
    buttons.push({
      text: "< Prev",
      callback_data: `/commands ${params.currentPage - 1}`,
    });
  }
  buttons.push({
    text: `${params.currentPage}/${params.totalPages}`,
    callback_data: `/commands ${params.currentPage}`,
  });
  if (params.currentPage < params.totalPages) {
    buttons.push({
      text: "Next >",
      callback_data: `/commands ${params.currentPage + 1}`,
    });
  }
  return toChannelData([buttons]);
}

export function buildVkModelsProviderChannelData(params: {
  providers: ProviderInfo[];
}): ReplyPayload["channelData"] | null {
  if (params.providers.length === 0) {
    return null;
  }
  return toChannelData(
    chunkButtons(
      params.providers.map((provider) => ({
        text: `${provider.id} (${provider.count})`,
        callback_data: `/models ${provider.id}`,
      })),
      PROVIDERS_PER_ROW,
    ),
  );
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
  const rows: VkReplyButton[][] = pageModels.map((model) => {
    const displayLabel = params.modelNames?.get(`${params.provider}/${model}`) ?? model;
    const selected = isCurrentModelSelection({
      currentModel: params.currentModel,
      provider: params.provider,
      model,
    });
    return [
      {
        text: selected ? `${truncateLabel(displayLabel)} ✓` : truncateLabel(displayLabel),
        callback_data: `/model ${params.provider}/${model}`,
      },
    ];
  });

  if (params.totalPages > 1) {
    const pagination: VkReplyButton[] = [];
    if (params.currentPage > 1) {
      pagination.push({
        text: "< Prev",
        callback_data: `/models ${params.provider} ${params.currentPage - 1}`,
      });
    }
    pagination.push({
      text: `${params.currentPage}/${params.totalPages}`,
      callback_data: `/models ${params.provider} ${params.currentPage}`,
    });
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
  ]);

  return toChannelData(rows);
}

export function buildVkModelBrowseChannelData(): ReplyPayload["channelData"] {
  return {
    vk: {
      buttons: [[{ text: "Browse providers", callback_data: "/models" }]],
    },
  };
}
