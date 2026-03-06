# Feature Flag Orchestrator Plugin

Teaches Claude how to manage feature flags as code—automating releases, executing safe kill switches, and stripping out stale flag debt without ever touching a vendor UI.

## The Problem

Most teams manage feature flags through "ClickOps", leading to:
* **Human Error** — Toggling the wrong flag or missing a prerequisite.
* **Blind Releases** — Flipping switches without immediately correlating the action to active error rates.
* **Technical Debt** — Leaving `if/else` flag logic in the codebase for months after a feature is fully launched.

This plugin teaches Claude to manage the entire lifecycle of your flags via a local manifest, DataDog APM, and the LaunchDarkly MCP server.

Here is a simple, step-by-step workflow of how you would use this tool in your scenario:

Step 1: Define your flags in code instead of a spreadsheet Instead of just keeping that list of URLs, keys, and descriptions in a wiki or spreadsheet, you create a simple file in your code repository called flags.yml (inside the state/ folder).

It looks like this:

```
yaml
flags:
  - id: "new_checkout_flow"
    description: "The redesigned Apple Pay checkout screen"
    group: "checkout_redesign"
    state: "off"
  - id: "promo_banner_v2"
    description: "Holiday promo banner on the homepage"
    group: "marketing"
    state: "rollout"
```

Step 2: Sync to your Flag Provider (like Datadog) Instead of going to the Datadog website and manually clicking "Create Flag" 50 times, you open your terminal and simply type: /flag-sync The plugin reads your flags.yml and makes all the API calls to set them up for you.

Step 3: Release a group safely When the marketing team says, "Turn on the holiday promo," you don't go hunt for the toggle in a Web UI. You just tell Claude in your terminal:

"Initiate the marketing release group."

The tool will:

Check your error monitors first (Pre-flight safety check).
Flip the switch via the API.
Watch the error rates for a minute. If they spike, it automatically flips the switch back off!

## Installation

```bash
claude plugin marketplace add custom/feature-flag-orchestrator
claude plugin install feature-flag-orchestrator
```

## Usage

### Commands

```bash
/flag-sync          # Syncs your local flags.yml to Datadog
/flag-release [grp] # Executes a pre-flight check and batch-toggles a release group
/flag-audit         # Scans codebase for flag evaluations and maps dependencies
/flag-debt          # Identifies and removes code for flags at 100% for >30 days
```

### Natural Prompts

```text
"Set up the flags for the new user profile redesign."
"Checkout is throwing 500s. Check Datadog and kill the responsible flag."
"Initiate the profile redesign release group."
"Rip out the code for the Apple Pay promo flag, it's been live for a month."
```

## Agents

Agent definitions that Claude uses to understand your code and telemetry.

### `flag-analyzer`

Scans mobile and backend codebases to identify flag dependencies.
**Focus Areas:**

* Detects vendor SDK usage (Datadog, OpenFeature).
* Maps application entry points to specific flag evaluations.
* Identifies dead code paths for stale flags.

### `datadog-correlator`

Connects local flag keys to real-time observability data.
**Focus Areas:**

* Checks active Datadog Monitors for P1/P2 alerts.
* Correlates flag keys with RUM (Real User Monitoring) error rates.
* Verifies HTTP 200 responses from observability endpoints during releases.

### `launchdarkly-actuator`

Interfaces with the required LaunchDarkly MCP server.
**Focus Areas:**

* Translates orchestrated intents into LaunchDarkly MCP tool calls.
* Safely updates boolean feature flag states in LaunchDarkly.

## Skills

Skills that activate automatically based on context:

| Skill | Trigger |
| --- | --- |
| `config-as-code` | "Create a flag" / "Set up flags" |
| `batch-release-coordinator` | "Release [X]" / "Toggle the group" |
| `kill-switch-protocol` | "Kill [X]" / "Disable the feature" |
| `automated-rollback` | Automatically triggers if RUM errors spike post-release |
| `stale-flag-removal` | "Remove old flags" / "Clean up flag debt" |

## Directory Structure

```text
feature-flag-orchestrator/
├── commands/       # /flag-sync, /flag-release, /flag-audit, /flag-debt
├── agents/         # flag-analyzer, datadog-correlator
├── skills/         # Release, rollback, and cleanup skills
├── hooks/          # Pre-flight safety checks
└── state/          # Schema definitions for flags.yml
```

## Philosophy

1. **No ClickOps** — If you have to log into a web dashboard to toggle a feature, the deployment pipeline is broken.
2. **Safety First** — Never flip a flag without checking system health before *and* after.
3. **Debt is a Bug** — A flag is not "done" when it is rolled out; it is done when the fallback code is deleted from the repository.

## License

MIT
