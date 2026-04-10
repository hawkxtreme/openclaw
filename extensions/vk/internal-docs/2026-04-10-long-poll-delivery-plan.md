# VK Long Poll Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the bundled VK plugin as a clean, long-poll-first product that ordinary users can set up without tunnels, while preserving callback work only in the archive branch.

**Architecture:** Narrow the active branch to one transport, keep all behavior inside `extensions/vk`, and move setup, runtime, UX, and verification toward a single long-poll story. Treat callback as archived history instead of a supported runtime path in this branch.

**Tech Stack:** TypeScript, Vitest, OpenClaw plugin SDK, VK Bots Long Poll API, Docker

---

## File Map

- Modify: `extensions/vk/src/config-schema.ts`
- Modify: `extensions/vk/src/channel-shared.ts`
- Modify: `extensions/vk/src/secret-contract.ts`
- Modify: `extensions/vk/src/setup-core.ts`
- Modify: `extensions/vk/src/status.ts`
- Modify: `extensions/vk/src/keyboard.ts`
- Modify: `extensions/vk/src/gateway.ts`
- Modify: `extensions/vk/src/inbound.ts`
- Modify: `extensions/vk/src/vk-core/index.ts`
- Modify: `extensions/vk/src/vk-core/config/schema.ts`
- Modify: `extensions/vk/src/vk-core/setup/readiness.ts`
- Modify: `extensions/vk/src/vk-core/types/config.ts`
- Modify: `extensions/vk/README.md`
- Modify: `extensions/vk/tests/unit/*.test.ts`
- Add/modify: `extensions/vk/internal-docs/*.md`

### Task 1: Cut The Active Branch To Long Poll Only

**Files:**

- Modify: `extensions/vk/src/config-schema.ts`
- Modify: `extensions/vk/src/vk-core/types/config.ts`
- Modify: `extensions/vk/src/vk-core/config/schema.ts`
- Modify: `extensions/vk/src/setup-core.ts`
- Modify: `extensions/vk/src/status.ts`
- Modify: `extensions/vk/src/secret-contract.ts`

- [ ] Remove `callback-api` from the active branch config contract and keep `transport` fixed to `long-poll`.
- [ ] Remove callback-only setup expectations such as `webhookPath`, `callback.secret`, and `confirmationCode` from active-branch config parsing and readiness.
- [ ] Update status and security surfaces so they no longer imply webhook setup in this branch.
- [ ] Run targeted config/setup tests and update them to prove the branch is long-poll-only.

Run:

```bash
corepack pnpm test extensions/vk/tests/unit/vk-config.test.ts extensions/vk/tests/unit/vk-secret-contract.test.ts extensions/vk/tests/unit/vk-setup.test.ts extensions/vk/tests/unit/vk-probe.test.ts
```

### Task 2: Remove Callback Runtime Paths From The Active Plugin

**Files:**

- Modify: `extensions/vk/src/gateway.ts`
- Modify: `extensions/vk/src/inbound.ts`
- Modify: `extensions/vk/src/keyboard.ts`
- Modify: `extensions/vk/src/vk-core/index.ts`
- Modify: `extensions/vk/src/vk-core/setup/readiness.ts`
- Modify: `extensions/vk/src/vk-core/transport/longpoll.ts`

- [ ] Remove webhook route registration and callback transport branching from the active gateway.
- [ ] Keep interactive menus working through long-poll `message_event` only.
- [ ] Make keyboard generation always emit long-poll text keyboards in this branch.
- [ ] Update runtime exports so the active branch does not advertise callback transport as a supported path.
- [ ] Run focused runtime tests for inbound, keyboard, gateway, and long-poll monitor behavior.

Run:

```bash
corepack pnpm test extensions/vk/tests/unit/vk-inbound.test.ts extensions/vk/tests/unit/vk-plugin-adapter.test.ts extensions/vk/tests/unit/vk-gateway-longpoll-events.test.ts extensions/vk/tests/unit/vk-longpoll-monitor.test.ts
```

### Task 3: Finish The One-Touch User Experience

**Files:**

- Modify: `extensions/vk/src/command-ui.ts`
- Modify: `extensions/vk/src/inbound.ts`
- Modify: `extensions/vk/README.md`
- Modify: `extensions/vk/internal-docs/sdd-long-poll-first.md`
- Modify: `extensions/vk/internal-docs/sdd-fast-ux.md`

- [ ] Keep a visible launcher path after every close or cancel action.
- [ ] Ensure models, tools, status, and help remain reachable without slash memorization.
- [ ] Tighten README setup order around real VK community settings and probe behavior.
- [ ] Record remaining UX gaps and the winner features we want to match or beat from competitors.
- [ ] Re-run UX-centered unit tests after the menu and setup changes.

Run:

```bash
corepack pnpm test extensions/vk/tests/unit/vk-inbound.test.ts extensions/vk/tests/unit/vk-plugin-adapter.test.ts
```

### Task 4: Validate Shipping Shape

**Files:**

- Modify: `extensions/vk/README.md`
- Modify: `extensions/vk/internal-docs/competitive-analysis.md`
- Add/modify: separate-repo notes under `extensions/vk/internal-docs/`

- [ ] Document exactly how to extract the plugin into its own repository without core edits.
- [ ] Record why long poll is the primary product path and callback stays archived.
- [ ] Run plugin-scoped verification in normal mode and Docker mode.
- [ ] Capture final ship checklist for publication.

Run:

```bash
corepack pnpm test extensions/vk/tests/unit/vk-config.test.ts extensions/vk/tests/unit/vk-secret-contract.test.ts extensions/vk/tests/unit/vk-probe.test.ts extensions/vk/tests/unit/vk-setup.test.ts extensions/vk/tests/unit/vk-longpoll-monitor.test.ts extensions/vk/tests/unit/vk-gateway-longpoll-events.test.ts extensions/vk/tests/unit/vk-plugin-adapter.test.ts extensions/vk/tests/unit/vk-inbound.test.ts
```

Docker verification:

```bash
corepack pnpm test:docker:live-gateway
```
