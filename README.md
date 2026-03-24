# Feature Flag Orchestrator Plugin

Teaches Claude how to manage feature flags as code—automating releases, executing safe kill switches, and stripping out stale flag debt without ever touching a vendor UI.

## The Problem

Most teams manage feature flags through "ClickOps", leading to:
* **Human Error** — Toggling the wrong flag or missing a prerequisite.
* **Blind Releases** — Flipping switches without immediately correlating the action to active error rates.
* **Technical Debt** — Leaving `if/else` flag logic in the codebase for months after a feature is fully launched.

This plugin teaches Claude to manage the entire lifecycle of your flags via a local manifest, DataDog APM, and a feature-flag backend (LaunchDarkly or Harness REST; LaunchDarkly MCP is still an option for manual steps).

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

### Feature flag provider (LaunchDarkly or Harness)

`/flag-from-comments` syncs the manifest to **one** backend. Choose it with `FEATURE_FLAG_PROVIDER` (`launchdarkly` is the default) or pass `provider` in code when invoking the command.

| Variable | LaunchDarkly | Harness |
| --- | --- | --- |
| Provider | `FEATURE_FLAG_PROVIDER=launchdarkly` | `FEATURE_FLAG_PROVIDER=harness` |
| Auth | `LD_API_TOKEN` | `HARNESS_API_KEY` (Admin API key; `x-api-key` header) |
| Scope | `LD_PROJECT_KEY`, `LD_ENV_KEY` | `HARNESS_ACCOUNT_ID`, `HARNESS_ORG_ID`, `HARNESS_PROJECT_ID` |
| Optional | — | `HARNESS_ENV_ID` (passed on GET/PATCH when set) |

Harness uses the Admin API at `https://api.harness.io/cf/admin/features` ([reference](https://apidocs.harness.io/feature-flags)). New boolean flags are created with `true` / `false` variation identifiers. Prerequisites are sent on **create**; if a flag already exists, the agent attempts **PATCH** with `replacePrerequisites`—confirm this instruction against your Harness version if calls fail (capture a working PATCH from the UI or official examples).

## Usage

### Comment-Driven Flag Creation

The fastest way to create a flag is to annotate the code you want to guard, then let Claude handle the rest.

**Step 1 — Write a `@flag` annotation above the code you want to guard:**

```typescript
// @flag key=new-checkout-flow prereq=legacy-checkout when=false group=checkout-redesign platforms=web,android
// @flag-intent: Skip new checkout block until legacy checkout is fully disabled
function runNewCheckout() {
  // ...
}
```

```kotlin
// @flag key=new-checkout-flow prereq=legacy-checkout when=false platforms=android
// @flag-intent: Skip new checkout block until legacy checkout is fully disabled
fun runNewCheckout() {
    // ...
}
```

**Annotation fields:**

| Field | Required | Description |
| --- | --- | --- |
| `key` | ✅ | Flag identifier (must be unique) |
| `prereq` | — | Key of a prerequisite flag |
| `when` | — | Required state of prereq for this flag to activate (`true`/`false`, default: `false`) |
| `group` | — | Release group for batch operations |
| `platforms` | — | Comma-separated target platforms: `web`, `android`, `ios`, `backend`. Inferred from file extension if omitted. |

The line immediately after the `@flag` line can be a `@flag-intent:` comment with a human-readable description.

**Step 2 — Tell Claude to run `/flag-from-comments`.**

Claude will:
1. Scan the codebase for all `@flag` annotations
2. Merge new flags into `state/flags.yml`
3. Create each flag in LaunchDarkly via MCP (boolean, default off)
4. Set up prerequisite rules in LD to match the `prereq`/`when` constraints
5. Output ready-to-use implementation snippets for every platform listed

### Commands

```bash
/flag-from-comments # Scans @flag annotations → flags.yml → LaunchDarkly
/flag-sync          # Syncs your local flags.yml to LaunchDarkly
/flag-release [grp] # Executes a pre-flight check and batch-toggles a release group
/flag-audit         # Scans codebase for flag evaluations and maps dependencies
/flag-debt          # Identifies and removes code for flags at 100% for >30 days
```

### Natural Prompts

```text
"Create flags from the annotations I just added."
"Set up the flags for the new user profile redesign."
"Checkout is throwing 500s. Check Datadog and kill the responsible flag."
"Initiate the profile redesign release group."
"Rip out the code for the Apple Pay promo flag, it's been live for a month."
```

## Agents

Agent definitions that Claude uses to understand your code and telemetry.

### `comment-scanner`

Scans TypeScript, Kotlin, and Swift files for `@flag` annotations.
**Focus Areas:**

* Parses `@flag` and `@flag-intent:` comment syntax.
* Infers target platform from file extension (`.ts`/`.tsx` → web, `.kt` → android, `.swift` → ios).
* Merges duplicate keys when the same flag is annotated in multiple files.

### `flag-merger`

Reads `state/flags.yml`, upserts annotation data, and writes it back.
**Focus Areas:**

* Adds new flags with `state: "off"` (flags are off until explicitly released).
* Preserves existing `state` values — annotations never override developer-set state.
* Translates `prereq` into the `dependencies` array for LaunchDarkly compatibility.

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
| `flag-from-comments` | `@flag` annotation in code / `/flag-from-comments` / "create flags from comments" |
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
