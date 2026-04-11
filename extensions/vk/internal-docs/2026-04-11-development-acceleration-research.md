# VK Development Acceleration Research

Last refreshed: 2026-04-11

## Goal

Reduce delivery time, live-debug churn, and token burn for the VK product line
without lowering product quality.

## Current Repo Facts

- Active product shape in `extensions/vk/README.md` is already Long-Poll-first.
- The plugin has a meaningful surface already:
  - `58` source files under `extensions/vk/src`
  - `18` unit test files under `extensions/vk/tests/unit`
- Recent VK-only hardening work touched five files and added strong targeted
  test coverage for inbound menu-id refresh and outbound edit fallback.
- The plugin is still bundled and `private` in `extensions/vk/package.json`,
  while the strongest public competitor already ships as a standalone npm
  plugin.

## Why Development Has Been Slow

### 1. We mixed product delivery and transport R&D

The same iteration repeatedly tried to solve:

- Long Poll product UX
- Callback transport
- webhook and tunnel operations
- live browser verification
- Docker runtime
- standalone repo packaging

This created long sessions with moving targets instead of short vertical slices.

### 2. We optimized for live debugging before contract stability

The current plugin has good unit coverage for many VK surfaces, but we still
spent too much time discovering product behavior through real VK chats instead
of first locking the contract with tests.

### 3. Long-Poll UX is carrying callback-shaped residue

The plugin already contains dedicated Long Poll transport and `message_event`
support, but several outbound and menu decisions still branch on
`transport === "callback-api"`:

- `extensions/vk/src/keyboard.ts`
- `extensions/vk/src/outbound.ts`
- `extensions/vk/src/inbound.ts`
- `extensions/vk/src/gateway.ts`

That makes the Long Poll path more complex than necessary and hides an
important VK capability we can use.

### 4. We have been solving the hardest UX problem first

Telegram-like "single-message evolving menu" is the hardest VK behavior to
stabilize. It depends on:

- correct `conversation_message_id`
- deterministic edit targeting
- history lookups
- stale-menu retirement
- transport-specific event semantics

Trying to perfect that before the simpler launcher and navigation path is
stable is the wrong order.

## Official VK Findings That Matter

Primary sources:

- `https://dev.vk.com/ru/api/bots-long-poll/getting-started`
- `https://dev.vk.com/ru/method/groups.setLongPollSettings`
- `https://dev.vk.com/ru/method/messages.send`
- `https://dev.vk.com/ru/api/bots/development/keyboard`
- `https://dev.vk.com/ru/api/bots/development/messages`

### Stable Long Poll contract

Official VK documents that:

- Long Poll bootstrap uses `groups.getLongPollServer`
- poll requests should use `wait=25`
- `failed:1`, `failed:2`, and `failed:3` are the core recovery modes
- Long Poll event structure matches the Callback event family closely enough to
  share normalization logic

### The minimum event toggles are clear

For our product, the useful baseline is:

- `message_new`
- `message_allow`
- `message_deny`
- `message_event`

`message_reply` is optional and best treated as diagnostics, not a hard setup
requirement.

### The biggest hidden product opportunity

VK keyboard docs explicitly state that callback buttons emit `message_event` in
either Callback API or Long Poll API.

This means:

- callback-style inline navigation is not exclusive to webhook transport
- Long Poll can support richer button UX than we previously treated as normal
- our current `transport === "callback-api"` gate for inline callback behavior
  is stricter than the platform contract requires

This is the single highest-value technical insight from the external research.

### Chat keyboard and inline keyboard are different tools

VK documents two distinct keyboard modes:

- chat keyboard with `inline: false`, shown under the input field
- inline keyboard with `inline: true`, shown inside the message

Operational implications:

- the root launcher should stay a persistent chat keyboard
- deeper navigation can be inline callback-driven in Long Poll if we validate
  it end to end
- we do not need to force one keyboard type onto every stage of the UX

### Message editing and `conversation_message_id`

VK message docs confirm:

- `conversation_message_id` is the right handle for editing bot messages
- `messages.edit` works with that identifier
- bot access in group chats depends on mention, leading slash, or explicit chat
  permissions

This explains why menu edit flows become fragile in group-chat cases when the
product leans on history or synthetic recovery.

## Competitor Findings That Matter

### `pfrankov/openclaw-vk`

Primary sources:

- `https://github.com/pfrankov/openclaw-vk`
- `https://github.com/pfrankov/openclaw-vk/releases/tag/v2026.4.4`

Observed strengths:

- standalone npm package
- Long Poll only
- clear token-scope guidance
- direct messages and group chats
- strong troubleshooting copy
- media pipeline includes docs and voice-message handling

Important implementation idea:

- the competitor derives many VK buttons from ordinary text replies instead of
  requiring a large custom interactive state machine for every menu surface

This is not enough for our preferred final UX on its own, but it is a strong
acceleration tactic for intermediate delivery.

### `Perevalov/openclaw-vkbots-plugin`

Primary source:

- `https://github.com/Perevalov/openclaw-vkbots-plugin`

Observed strength:

- ruthless scope simplicity

This repo is no longer the strongest feature competitor, but it is still a
useful reminder that "easy to install and easy to understand" beats ambitious
but unstable complexity.

## Recommended Product Strategy

### Recommended target shape

Use a hybrid Long Poll UX:

1. persistent root launcher as chat keyboard under the input field
2. inline callback menus for deeper navigation where Long Poll `message_event`
   is available and stable
3. plain text fallback path if inline callback is unavailable or rejected

This gives us:

- visible re-entry at all times
- less user-message spam during menu navigation
- better fit to VK's documented model
- no tunnel dependency

### What to stop doing immediately

- Stop treating Callback transport as part of the current delivery scope.
- Stop bundling Docker, live smoke, packaging, and UX redesign into the same
  iteration.
- Stop using real VK chat as the first discovery tool for behavior that can be
  locked with tests.
- Stop trying to perfect one-message edit UX before the root launcher and basic
  navigation path are green.

## Acceleration Plan

### Slice 0: Freeze scope

Delivery branch scope:

- Long Poll only
- direct messages and group chats
- root launcher
- tools, models, status, help
- media send

Out of scope for delivery:

- callback webhook transport
- tunnel workflows
- standalone repo publish
- deep formatting expansion beyond proven VK support

### Slice 1: Prove Long Poll inline callback viability

Goal:

- validate that our existing Long Poll `message_event` path can power inline
  callback buttons without webhook transport

Work:

- add a focused unit test around `extensions/vk/src/keyboard.ts`
- allow inline callback buttons when Long Poll account configuration and menu
  surface permit it
- smoke only one narrow menu flow end to end

Success gate:

- a real Long Poll menu button produces `message_event`
- `messages.sendMessageEventAnswer` works
- no extra user text message is required for that path

### Slice 2: Stabilize the launcher contract

Goal:

- guarantee that users always retain a visible recovery path

Work:

- root keyboard stays persistent
- `Close` collapses to launcher, not to empty state
- `Back` is consistent everywhere
- `Status`, `Help`, `Tools`, and `Models` behave the same in DM and group chat

Success gate:

- zero dead-end menu states in tests

### Slice 3: Simplify submenu generation

Goal:

- reduce custom VK-only state machinery where simpler derivation works

Work:

- evaluate where competitor-style button derivation from stable text replies is
  enough
- keep explicit VK-specific logic only for state that truly needs edit targets
  or callback event answers

Success gate:

- less menu-specific branching in outbound and inbound paths
- fewer history lookups for ordinary command navigation

### Slice 4: Only then run full smoke

Final verification order:

1. targeted VK unit tests
2. local host runtime smoke
3. Docker smoke
4. final live DM and group-chat smoke

## Token And Time Savings Rules

To reduce future session cost:

- keep an active short execution note in `extensions/vk/internal-docs`
- end each work slice with a commit or at least a compact status summary
- never debug more than one new variable in the same cycle
- time-box transport or environment blockers to 20-30 minutes
- if a blocker survives the time box, change strategy instead of extending the
  session

## Highest-Value Next Step

The next best use of engineering time is not another broad live-debug session.

It is a narrow experiment:

- enable inline callback keyboard behavior for Long Poll on one menu surface
- prove it with a focused test
- run one live smoke for that exact scenario

If that works, it becomes the main accelerator for the rest of the UX.
