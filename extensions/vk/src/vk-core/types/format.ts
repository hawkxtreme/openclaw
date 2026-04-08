export type VkFormatDataType = "bold" | "italic";

export type VkFormatDataItem = {
  offset: number;
  length: number;
  type: VkFormatDataType;
};

export type VkFormatData = {
  version: "1";
  items: VkFormatDataItem[];
};

export type VkFormattedText = {
  text: string;
  formatData?: VkFormatData;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/u.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

function isVkFormatDataType(value: unknown): value is VkFormatDataType {
  return value === "bold" || value === "italic";
}

export function parseVkFormatData(value: unknown): VkFormatData | undefined {
  const normalizedValue =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return undefined;
          }
        })()
      : value;

  const record = asRecord(normalizedValue);
  if (!record || record.version !== "1" || !Array.isArray(record.items)) {
    return undefined;
  }

  const items: VkFormatDataItem[] = [];
  for (const entry of record.items) {
    const item = asRecord(entry);
    const offset = normalizePositiveInteger(item?.offset);
    const length = normalizePositiveInteger(item?.length);
    const type = item?.type;

    if (offset === null || length === null || !isVkFormatDataType(type)) {
      return undefined;
    }

    items.push({
      offset,
      length,
      type,
    });
  }

  return {
    version: "1",
    items,
  };
}
