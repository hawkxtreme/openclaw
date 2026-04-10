# Separate Repo Extraction Notes

Status: internal planning note

## Goal

Prepare the VK plugin to live as a separate repository without reintroducing
core edits or callback-first complexity.

## Recommended Product Shape

- primary mode: `long-poll`
- supported chat types: direct messages and group chats
- command UX: persistent text keyboards attached to the VK input field
- callback work: archived on `feature/vk-callback-archive`, not part of the
  default product

## Files And Folders To Extract

Copy as the initial standalone package:

- `extensions/vk/**`

The standalone repo should still depend on the published OpenClaw Plugin SDK
surface and should not copy core `src/**` internals.

## Package Invariants To Keep

- plugin id: `vk`
- package name: `@openclaw/vk`
- `openclaw.install.npmSpec`: `@openclaw/vk`
- `openclaw.channel.id`: `vk`

## Publish Story

1. Keep the bundled plugin as the source of truth until the standalone repo is
   stable.
2. Extract `extensions/vk` as-is into a dedicated repository.
3. Replace workspace-only metadata with standalone install/test scripts.
4. Publish only the long-poll product path first.
5. Treat callback as a later optional track, not as part of the initial public
   README or onboarding.

## Standalone README Requirements

The standalone repo README should lead with:

- no tunnel required
- community token + group id + long poll toggles
- direct messages and group chats
- model and tools menus through buttons
- troubleshooting with `openclaw channels status --probe`

The standalone README should not lead with:

- webhook setup
- callback secrets
- confirmation codes
- public ingress

## Standalone Verification Gates

Before publishing the separate repo:

- targeted VK unit tests pass
- long-poll probe/setup tests pass
- local non-Docker smoke passes
- Docker smoke passes

## Competitive Positioning

The standalone repo can win if it is clearly better on:

- setup simplicity
- explainability of required VK settings
- stable long-poll menus on mobile
- group chat support
- official ownership and maintenance

It should not position itself around callback transport unless that path is
revived and hardened later.
