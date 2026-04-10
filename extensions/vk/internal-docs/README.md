# VK Internal Docs

This directory is for internal product and engineering work on the bundled VK
plugin. It is intentionally not referenced from public docs or plugin metadata.

Contents:

- `long-poll-research.md`: official VK Long Poll API notes, constraints, and
  product implications.
- `competitive-analysis.md`: current market snapshot and competitor takeaways.
- `sdd-long-poll-first.md`: design and execution plan for the long-poll-first
  product line.
- `sdd-fast-ux.md`: design and execution plan for speed, onboarding, and
  day-one usability.
- `2026-04-10-long-poll-delivery-plan.md`: active execution plan for the
  current delivery push.
- `separate-repo-extraction.md`: standalone repository extraction notes for the
  VK plugin.

Working rules:

- Treat Long Poll as the default user path.
- Treat Callback API as archived on `feature/vk-callback-archive`, not part of
  the ordinary setup story in the active branch.
- Keep product-facing work inside `extensions/vk` unless a plugin SDK seam is
  truly required.

Primary external sources used for this internal packet:

- `https://dev.vk.com/ru/api/bots-long-poll/getting-started`
- `https://dev.vk.com/ru/method/groups.setLongPollSettings`
- `https://dev.vk.com/ru/method/messages.send`
- `https://github.com/pfrankov/openclaw-vk`
- `https://www.npmjs.com/package/@openclaw-vk/vk`
- `https://github.com/Perevalov/openclaw-vkbots-plugin`
