# VK Extension

Bundled VK channel extension for OpenClaw.

Current integration scope:

- VK config/account resolution
- callback-api ingress helpers
- long-poll monitor primitives
- outbound text/media helpers
- release readiness checks

The copied transport/runtime logic lives under `src/vk-core/`.
The official OpenClaw adapter layer lives under `src/`.
