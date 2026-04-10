# VK Competitive Analysis

Last refreshed: 2026-04-10

## Market Snapshot

### Strongest current competitor

`pfrankov/openclaw-vk`

- GitHub repo: `https://github.com/pfrankov/openclaw-vk`
- Latest GitHub release seen: `v2026.4.4`, published 2026-04-05
- npm package: `@openclaw-vk/vk`
- GitHub repo metadata seen on 2026-04-10: 12 stars, last push 2026-04-05

### Older, narrower competitor

`Perevalov/openclaw-vkbots-plugin`

- GitHub repo: `https://github.com/Perevalov/openclaw-vkbots-plugin`
- Simpler scope: direct messages only, Long Poll, outbound text

## What The Strong Competitor Already Does Well

Based on the current README, package metadata, and npm package contents,
`pfrankov/openclaw-vk` is optimizing for practical shipping value:

- Long Poll only, so no callback or tunnel burden in the primary flow
- direct messages and group chats
- media pipeline with explicit `photos` and `docs` token guidance
- pairing and allowlist policies
- per-group overrides with `requireMention`
- multiple account support
- troubleshooting documentation that maps concrete VK API failures to concrete
  fixes
- lightweight packaging as a standalone installable plugin

Additional signals:

- dependency on `markdown-to-vk`, suggesting stronger shipped text formatting
  ergonomics
- dependency on `vk-io`, suggesting an intentional higher-level VK client stack

## What The Older Competitor Still Represents

`Perevalov/openclaw-vkbots-plugin` is no longer the bar we should optimize
against, but it still captures the simplest competitive promise:

- installable
- understandable
- direct-message bot works

If our product is harder than that and still not clearly better, the market will
reject the extra complexity.

## Our Current Position

### Current strengths

- bundled, repo-owned plugin path
- Long Poll plus retained Callback code for future advanced mode
- richer command UI builders for `/commands`, `/models`, and `/tools`
- group chat support
- policy model for direct and group traffic
- existing test coverage around command navigation and interactive menu behavior

### Current weaknesses

- too much callback-shaped residue in the user experience and internal wording
- command discovery still leans too heavily on typed slash commands
- long-poll menu behavior is functional but not yet clearly superior on mobile
- setup and status do not yet fully behave like a true one-touch product
- no extracted standalone repo/package surface for our own product line

## What We Should Intentionally Take From Competitors

### From `pfrankov/openclaw-vk`

- Long Poll as the only primary story
- very explicit token-scope guidance for `messages`, `manage`, `photos`, and
  `docs`
- troubleshooting docs that map exact VK failures to recovery actions
- minimal setup path with low operator burden
- standalone repo packaging discipline

### From `Perevalov/openclaw-vkbots-plugin`

- ruthless scope clarity
- understandable install and verify flow

## Where We Can Still Win

We should not try to win on Callback API. Public competitors are already
teaching the market that Long Poll is the sane default.

We can win on:

- easier onboarding than `pfrankov`
- better mobile-first command UX
- stronger structured menu system for models and tools
- cleaner official ownership inside the OpenClaw ecosystem
- better Docker-backed verification story
- more confidence from test coverage and release-readiness checks

## Product Direction

### Do

- beat the market on Long Poll usability
- make the first successful reply painfully easy to achieve
- preserve Callback only as an advanced branch or future mode

### Do not

- sell Callback as a mainstream advantage
- require users to understand tunnels
- rely on typed slash commands as the only discoverability mechanism
