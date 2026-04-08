import { describe, expect, it } from "vitest";

import {
  formatVkOutboundMessage,
  formatVkOutboundText,
  normalizeVkInboundBody,
} from "../../src/text-format.js";

describe("vk text format", () => {
  it("normalizes a bare slash to the commands list shortcut", () => {
    expect(normalizeVkInboundBody("/")).toBe("/commands");
    expect(normalizeVkInboundBody("  /  ")).toBe("/commands");
    expect(normalizeVkInboundBody("/models")).toBe("/models");
  });

  it("renders markdown as readable plain text for VK", () => {
    const rendered = formatVkOutboundText(`
TEXT LIVE

*Italic*
**Bold**
***Bold+Italic***
> Quote

| Name | Value |
| --- | --- |
| Row1 | A |

\`inline code\`
\`\`\`txt
block code
\`\`\`

[OpenClaw](https://openclaw.ai)
`.trim());

    expect(rendered).toContain("Italic");
    expect(rendered).toContain("Bold");
    expect(rendered).toContain("Bold+Italic");
    expect(rendered).toContain("> Quote");
    expect(rendered).toContain("Name: Row1, Value: A");
    expect(rendered).toContain("inline code");
    expect(rendered).toContain("[code]");
    expect(rendered).toContain("block code");
    expect(rendered).toContain("[/code]");
    expect(rendered).toContain("OpenClaw (https://openclaw.ai)");
    expect(rendered).not.toContain("| --- | --- |");
    expect(rendered).not.toContain("***Bold+Italic***");
    expect(rendered).not.toContain("[I]Italic[/I]");
    expect(rendered).not.toContain("[B]Bold[/B]");
  });

  it("returns native VK format_data for supported inline styles", () => {
    const formatted = formatVkOutboundMessage(`
TEXT LIVE

*Italic*
**Bold**
***Bold+Italic***

> Quote

| Name | Value |
| --- | --- |
| Row1 | A |

\`inline code\`
\`\`\`txt
block code
\`\`\`

[OpenClaw](https://openclaw.ai)
`.trim());

    expect(formatted.text).toContain("Italic");
    expect(formatted.text).toContain("Bold");
    expect(formatted.text).toContain("Bold+Italic");
    expect(formatted.text).toContain("> Quote");
    expect(formatted.text).toContain("Name: Row1, Value: A");
    expect(formatted.text).toContain("[code]");
    expect(formatted.text).toContain("OpenClaw (https://openclaw.ai)");
    expect(formatted.text).not.toContain("[I]Italic[/I]");
    expect(formatted.text).not.toContain("[B]Bold[/B]");

    expect(formatted.formatData).toEqual({
      version: "1",
      items: [
        {
          offset: formatted.text.indexOf("Italic"),
          length: "Italic".length,
          type: "italic",
        },
        {
          offset: formatted.text.indexOf("Bold"),
          length: "Bold".length,
          type: "bold",
        },
        {
          offset: formatted.text.indexOf("Bold+Italic"),
          length: "Bold+Italic".length,
          type: "bold",
        },
        {
          offset: formatted.text.indexOf("Bold+Italic"),
          length: "Bold+Italic".length,
          type: "italic",
        },
      ],
    });
  });
});
