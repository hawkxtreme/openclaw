import {
  markdownToIRWithMeta,
  type MarkdownIR,
  type MarkdownLinkSpan,
  type MarkdownStyle,
  type MarkdownStyleSpan,
} from "openclaw/plugin-sdk/text-runtime";
import { resolveVkCommandFromPayload } from "./keyboard.js";
import type {
  VkFormatData,
  VkFormatDataItem,
  VkFormatDataType,
  VkFormattedText,
} from "./vk-core/types/format.js";

type VkInboundBodySource = {
  text: string;
  messagePayload?: unknown;
};

const MARKDOWN_TABLE_ROW_PATTERN = /^\s*\|(.+)\|\s*$/;
const MARKDOWN_TABLE_SEPARATOR_PATTERN = /^:?-{3,}:?$/;

const VK_FALLBACK_STYLE_MARKERS = {
  strikethrough: { open: "[S]", close: "[/S]" },
  code: { open: "`", close: "`" },
  code_block: { open: "[code]\n", close: "\n[/code]" },
} as const;

type VkFallbackMarkerStyle = keyof typeof VK_FALLBACK_STYLE_MARKERS;

const STYLE_ORDER: MarkdownStyle[] = [
  "blockquote",
  "code_block",
  "code",
  "bold",
  "italic",
  "strikethrough",
  "spoiler",
];

const STYLE_RANK = new Map<MarkdownStyle, number>(
  STYLE_ORDER.map((style, index) => [style, index]),
);

type VkOpeningItem =
  | {
      kind: "link";
      end: number;
      open: string;
      close: string;
      index: number;
    }
  | {
      kind: "style";
      end: number;
      style: MarkdownStyle;
      marker?: { open: string; close: string };
      nativeType?: VkFormatDataType;
      index: number;
    };

type VkStackItem =
  | {
      kind: "output";
      end: number;
      close: string;
    }
  | {
      kind: "native";
      end: number;
      style: VkFormatDataType;
      startOffset: number;
    };

function normalizeVkFormatItems(items: VkFormatDataItem[]): VkFormatData | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return {
    version: "1",
    items: [...items].toSorted((left, right) => {
      if (left.offset !== right.offset) {
        return left.offset - right.offset;
      }
      if (left.length !== right.length) {
        return right.length - left.length;
      }
      return left.type.localeCompare(right.type);
    }),
  };
}

function resolveVkLinkFallback(
  link: MarkdownLinkSpan,
  plainText: string,
): VkOpeningItem | null {
  const href = link.href.trim();
  if (!href) {
    return null;
  }

  const label = plainText.slice(link.start, link.end).trim();
  if (!label || label === href) {
    return null;
  }

  return {
    kind: "link",
    end: link.end,
    open: "",
    close: ` (${href})`,
    index: 0,
  };
}

function resolveVkNativeStyle(
  style: MarkdownStyle,
): VkFormatDataType | undefined {
  if (style === "bold" || style === "italic") {
    return style;
  }

  return undefined;
}

function resolveVkFallbackStyleMarker(
  style: MarkdownStyle,
): (typeof VK_FALLBACK_STYLE_MARKERS)[VkFallbackMarkerStyle] | undefined {
  switch (style) {
    case "strikethrough":
    case "code":
    case "code_block":
      return VK_FALLBACK_STYLE_MARKERS[style];
    default:
      return undefined;
  }
}

function buildVkFormattedText(ir: MarkdownIR): VkFormattedText {
  const plainText = ir.text ?? "";
  if (!plainText) {
    return { text: "" };
  }

  const relevantStyles = ir.styles.filter((span) => {
    return (
      span.start !== span.end &&
      (resolveVkNativeStyle(span.style) !== undefined ||
        resolveVkFallbackStyleMarker(span.style) !== undefined)
    );
  });
  const startsAt = new Map<number, MarkdownStyleSpan[]>();
  const linkStarts = new Map<number, VkOpeningItem[]>();
  const boundaries = new Set<number>([0, plainText.length]);

  for (const span of relevantStyles) {
    boundaries.add(span.start);
    boundaries.add(span.end);
    const bucket = startsAt.get(span.start);
    if (bucket) {
      bucket.push(span);
    } else {
      startsAt.set(span.start, [span]);
    }
  }

  for (const spans of startsAt.values()) {
    spans.sort((left, right) => {
      if (left.end !== right.end) {
        return right.end - left.end;
      }
      return (STYLE_RANK.get(left.style) ?? 0) - (STYLE_RANK.get(right.style) ?? 0);
    });
  }

  for (const [index, link] of ir.links.entries()) {
    if (link.start === link.end) {
      continue;
    }

    const rendered = resolveVkLinkFallback(link, plainText);
    if (!rendered) {
      continue;
    }

    boundaries.add(link.start);
    boundaries.add(link.end);
    const bucket = linkStarts.get(link.start);
    const item = {
      ...rendered,
      index,
    } satisfies VkOpeningItem;
    if (bucket) {
      bucket.push(item);
    } else {
      linkStarts.set(link.start, [item]);
    }
  }

  const boundaryPoints = [...boundaries].toSorted((left, right) => left - right);
  const stack: VkStackItem[] = [];
  const formatItems: VkFormatDataItem[] = [];
  let renderedText = "";

  for (let index = 0; index < boundaryPoints.length; index += 1) {
    const position = boundaryPoints[index] ?? 0;

    while (stack.length > 0 && stack[stack.length - 1]?.end === position) {
      const item = stack.pop();
      if (!item) {
        continue;
      }

      if (item.kind === "output") {
        renderedText += item.close;
        continue;
      }

      const length = renderedText.length - item.startOffset;
      if (length > 0) {
        formatItems.push({
          offset: item.startOffset,
          length,
          type: item.style,
        });
      }
    }

    const openingItems: VkOpeningItem[] = [];
    const openingLinks = linkStarts.get(position);
    if (openingLinks) {
      openingItems.push(...openingLinks);
    }

    const openingStyles = startsAt.get(position);
    if (openingStyles) {
      openingItems.push(
        ...openingStyles.map((span, itemIndex) => ({
          kind: "style" as const,
          end: span.end,
          style: span.style,
          marker: resolveVkFallbackStyleMarker(span.style),
          nativeType: resolveVkNativeStyle(span.style),
          index: itemIndex,
        })),
      );
    }

    openingItems.sort((left, right) => {
      if (left.end !== right.end) {
        return right.end - left.end;
      }
      if (left.kind !== right.kind) {
        return left.kind === "link" ? -1 : 1;
      }
      if (left.kind === "style" && right.kind === "style") {
        return (STYLE_RANK.get(left.style) ?? 0) - (STYLE_RANK.get(right.style) ?? 0);
      }
      return left.index - right.index;
    });

    for (const item of openingItems) {
      if (item.kind === "link") {
        renderedText += item.open;
        stack.push({
          kind: "output",
          end: item.end,
          close: item.close,
        });
        continue;
      }

      if (item.nativeType) {
        stack.push({
          kind: "native",
          end: item.end,
          style: item.nativeType,
          startOffset: renderedText.length,
        });
        continue;
      }

      if (item.marker) {
        renderedText += item.marker.open;
        stack.push({
          kind: "output",
          end: item.end,
          close: item.marker.close,
        });
      }
    }

    const nextPosition = boundaryPoints[index + 1];
    if (nextPosition !== undefined && nextPosition > position) {
      renderedText += plainText.slice(position, nextPosition);
    }
  }

  return {
    text: renderedText,
    formatData: normalizeVkFormatItems(formatItems),
  };
}

function parseMarkdownTableRow(line: string): string[] | null {
  const match = line.match(MARKDOWN_TABLE_ROW_PATTERN);
  if (!match) {
    return null;
  }

  return match[1]
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(row: string[]): boolean {
  return row.length > 0 && row.every((cell) => MARKDOWN_TABLE_SEPARATOR_PATTERN.test(cell));
}

function flattenMarkdownTables(text: string): string {
  const lines = text.split(/\r?\n/);
  const rendered: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = parseMarkdownTableRow(lines[index] ?? "");
    const separator = parseMarkdownTableRow(lines[index + 1] ?? "");

    if (
      !header ||
      !separator ||
      header.length === 0 ||
      header.length !== separator.length ||
      !isMarkdownTableSeparator(separator)
    ) {
      rendered.push(lines[index] ?? "");
      continue;
    }

    const tableRows: string[] = [];
    let rowIndex = index + 2;

    for (; rowIndex < lines.length; rowIndex += 1) {
      const row = parseMarkdownTableRow(lines[rowIndex] ?? "");
      if (!row) {
        break;
      }

      const pairs = header
        .map((label, cellIndex) => {
          const value = row[cellIndex]?.trim() ?? "";
          if (!label || !value) {
            return null;
          }

          return `${label}: ${value}`;
        })
        .filter((entry): entry is string => Boolean(entry));

      if (pairs.length > 0) {
        tableRows.push(`- ${pairs.join(", ")}`);
      }
    }

    if (tableRows.length === 0) {
      rendered.push(lines[index] ?? "");
      continue;
    }

    rendered.push(...tableRows);
    index = rowIndex - 1;
  }

  return rendered.join("\n");
}

export function normalizeVkInboundBody(body: string): string {
  const trimmed = body.trim();
  return trimmed === "/" ? "/commands" : trimmed;
}

export function resolveVkInboundBody(source: VkInboundBodySource): string {
  const rawBody = resolveVkCommandFromPayload(source.messagePayload) ?? source.text;
  return normalizeVkInboundBody(String(rawBody));
}

export function isVkSlashCommandBody(body: string): boolean {
  return normalizeVkInboundBody(body).startsWith("/");
}

export function isVkSlashCommandMessage(source: VkInboundBodySource): boolean {
  return isVkSlashCommandBody(resolveVkInboundBody(source));
}

export function formatVkOutboundMessage(text: string): VkFormattedText {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text: "",
    };
  }

  const { ir } = markdownToIRWithMeta(flattenMarkdownTables(trimmed), {
    linkify: false,
    autolink: false,
    headingStyle: "none",
    blockquotePrefix: "> ",
    tableMode: "off",
  });

  return buildVkFormattedText(ir);
}

export function formatVkOutboundText(text: string): string {
  return formatVkOutboundMessage(text).text;
}
