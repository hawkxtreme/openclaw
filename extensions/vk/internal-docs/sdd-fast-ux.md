# SDD: Fast UX And Frictionless Onboarding

Status: draft for execution

## Goal

Make the VK plugin feel fast, discoverable, and low-friction enough that a new
user can go from install to first useful interaction with minimal manual setup
and no tunnel knowledge.

## User Promise

"Install the plugin, paste the community token, restart the gateway, and talk to
the bot."

## Experience Targets

- first successful setup should fit into a short checklist
- the user should always have a visible way to reopen commands
- the user should not need to remember slash commands for common operations
- Long Poll command interactions should avoid unnecessary extra messages

## Speed Targets

These are product targets, not yet enforced SLAs:

- channel overhead from inbound event acceptance to command dispatch start
  should stay well below model latency
- interactive command acknowledgements should feel immediate
- setup failures should produce one obvious next action

## Workstream A: One-Touch Setup

### Deliverables

- stronger setup copy in README and setup surfaces
- token guidance that spells out required scopes
- operator checklist for enabling community messages, Long Poll, and chat-bot
  permissions

### Acceptance Criteria

- setup instructions do not mention callback, tunnels, or webhook secrets in the
  default path
- required VK settings are listed in the order a human actually needs them

## Workstream B: Persistent Launcher UX

### Deliverables

- top-level launcher keyboard for Long Poll with `one_time=false`
- close action that collapses to launcher, not to nothing
- consistent `Back` and `Close` semantics across commands, models, and tools

### Acceptance Criteria

- the user can recover from any menu state with visible buttons alone
- closing a menu does not require typing `/` to continue

## Workstream C: Tool And Model Navigation

### Deliverables

- direct button paths into tools and models
- pagination that stays understandable on small screens
- selected state that is visually obvious but compact

### Acceptance Criteria

- model switching can be completed entirely through buttons
- tool browsing can be completed entirely through buttons

## Workstream D: Troubleshooting And Status

### Deliverables

- explicit status hints for invalid token, missing scope, disabled chat-bot
  settings, and inaccessible chats
- internal docs plus external README guidance for the highest-frequency VK
  failures

### Acceptance Criteria

- a failing setup should point the user to the next concrete fix
- `openclaw channels status --probe` should be enough to diagnose common setup
  mistakes

## Workstream E: Final Verification

### Deliverables

- targeted unit coverage for new UX behavior
- normal-runtime smoke on Long Poll only
- Docker smoke on Long Poll only

### Acceptance Criteria

- final verification demonstrates the same setup story both locally and in
  Docker
- no callback infrastructure is required for the sign-off run
