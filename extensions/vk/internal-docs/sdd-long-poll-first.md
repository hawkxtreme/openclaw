# SDD: Long-Poll-First VK Product

Status: draft for execution

## Goal

Turn the bundled VK plugin into a Long-Poll-first product that ordinary users
can install and run without tunnel infrastructure, while preserving Callback
code as an advanced branch for future work.

## Non-Goals

- deleting Callback API support from the codebase
- expanding core OpenClaw surfaces unless the plugin SDK truly blocks us
- building a hosted relay service in this phase

## Product Principles

1. No public ingress in the default setup path.
2. No typed-command memorization required for basic navigation.
3. No dead-end keyboard states.
4. No plugin behavior that requires core special-casing.

## Workstream A: Default Setup And Readiness

### Deliverables

- Long Poll remains the default transport in schema and status
- setup copy explains Long Poll first
- readiness surfaces explain missing event toggles and missing bot settings

### Acceptance Criteria

- a user with only `groupId` and a valid community token can complete setup
  without callback fields
- status output does not imply webhook requirements for Long Poll accounts
- callback-only config is only mentioned when transport is explicitly
  `callback-api`

### Verification

- `extensions/vk/tests/unit/vk-config.test.ts`
- `extensions/vk/tests/unit/vk-secret-contract.test.ts`
- new setup/status tests as needed

## Workstream B: Long Poll Runtime Completeness

### Deliverables

- `message_new`, `message_allow`, `message_deny`, and `message_event` work in
  Long Poll mode
- long-poll interactive event answers are supported where VK allows them
- Long Poll monitor status clearly reports reconnect and dedupe health

### Acceptance Criteria

- interactive command buttons in Long Poll can drive model and tool navigation
- consent changes update pairing or access state correctly
- poll-loop recovery handles `failed:1`, `failed:2`, and `failed:3`

### Verification

- `extensions/vk/tests/unit/vk-longpoll-monitor.test.ts`
- `extensions/vk/tests/unit/vk-gateway-longpoll-events.test.ts`

## Workstream C: Mobile-First Command UX

### Deliverables

- persistent launcher keyboard for Long Poll
- button-first entry to commands, models, tools, status, and help
- close, back, and cancel states that always leave a visible re-entry path

### Acceptance Criteria

- after closing a menu, the user still sees a launcher button without typing
- selecting a menu item does not leave stale or misleading keyboards behind
- tools and model selection are reachable without manual slash typing

### Verification

- extend `extensions/vk/tests/unit/vk-inbound.test.ts`
- extend `extensions/vk/tests/unit/vk-plugin-adapter.test.ts`
- final live smoke in real VK chat plus Docker runtime

## Workstream D: Message Quality And Operator Clarity

### Deliverables

- stronger formatting and fallback behavior
- clearer error messages for scope, chat access, and keyboard failures
- onboarding docs that match real VK settings screens

### Acceptance Criteria

- formatting does not silently degrade for common reply shapes
- operators can identify missing token scopes without reading source code
- docs cover `messages`, `manage`, `photos`, and `docs`

### Verification

- `extensions/vk/tests/unit/vk-text-format.test.ts`
- targeted media/send tests

## Workstream E: Release Shape

### Deliverables

- plugin assets are easy to extract into a dedicated repo
- callback backlog is documented separately instead of blocking ship
- final verification includes local runtime and Docker runtime

### Acceptance Criteria

- separate-repo extraction no longer needs core edits
- release notes can honestly claim Long Poll as the primary product mode

## Priority Order

1. Setup and readiness
2. Mobile-first command UX
3. Error and troubleshooting polish
4. Repo extraction and packaging
5. Callback backlog cleanup notes
