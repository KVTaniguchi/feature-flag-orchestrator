# Skill: Flag From Comments

**Trigger:** When the user:
- Runs `/flag-from-comments`
- Says "create flags from comments", "set up these flags", "implement this flag from the annotation"
- Points to code containing a `// @flag` annotation

**Workflow:**

You are acting as a feature flag provisioning agent. When asked to process flag annotations, follow this sequence. Do not skip steps.

1. **Scan and Parse:**
   - Run the `/flag-from-comments` command (which uses the `comment-scanner` agent) on the project root or the directory the user specifies.
   - Display the summary table output: key, intent, prereq condition, platforms, and source file location.
   - If no annotations are found, show the user the annotation syntax and stop.

2. **Merge to flags.yml:**
   - The command automatically upserts all parsed annotations into `state/flags.yml`.
   - Report how many flags were added vs. updated.
   - Remind the user: existing flags keep their current `state` value — only annotation metadata is refreshed.

3. **Create Flags in LaunchDarkly via MCP:**
   - For each newly added flag, use the LaunchDarkly MCP tool to create the flag.
   - Set the flag key, description (from `intent`), and type to boolean.
   - Set the default variation to `false` — flags are off until explicitly released.
   - Apply tags from the flag's `group` and each platform in `platforms`.
   - Example MCP prompt: "Create a boolean feature flag with key `[key]`, description `[intent]`, default variation false, tags: `[group, platforms]`."
   - Before creating, check that the flag does not already exist in LaunchDarkly.

4. **Set Prerequisites in LaunchDarkly:**
   - For each flag that has a `prereq` field, use the LaunchDarkly MCP tool to add a prerequisite rule after the flag exists.
   - The rule: this flag is only served `true` when `[prereq]` equals `[when]`.
   - Example MCP prompt: "Add a prerequisite to `[key]`: flag `[prereq]` must be `[when]` for this flag to be evaluated."
   - This enforces the dependency declared in the code comment — no manual LD dashboard configuration needed.
   - If `when` is `"false"`, the meaning is: this flag is active only when the prereq flag is **off**. This is the standard safety pattern for guarding new features behind a rollback switch.

5. **Output Per-Platform Implementation Snippets:**
   - For each flag, emit a ready-to-use code snippet for every platform listed in `platforms`.
   - The snippet must include the original `@flag` annotation comment above the guard so the next developer can see the metadata inline.
   - Substitute `[key]`, `[intent]`, `[prereq]`, and `[when]` into the templates below.

---

**TypeScript / Web:**

```typescript
// @flag key=[key] prereq=[prereq] when=[when]
// @flag-intent: [intent]
if (ldClient.variation('[key]', false)) {
  // guarded code
}
```

**Kotlin / Android:**

```kotlin
// @flag key=[key] prereq=[prereq] when=[when]
// @flag-intent: [intent]
if (ldClient.boolVariation("[key]", false)) {
    // guarded code
}
```

**Swift / iOS:**

```swift
// @flag key=[key] prereq=[prereq] when=[when]
// @flag-intent: [intent]
if ldClient.variation("[key]", defaultValue: false) {
    // guarded code
}
```

---

**Rules:**
- Never create a flag in LaunchDarkly without first confirming it does not already exist.
- Always set prerequisites *after* the flag is created, never in the same call.
- Never set `state: "on"` in flags.yml — state is managed by `/flag-release`, not this skill.
- All platforms listed in the annotation receive an implementation snippet, even if the code comment is only in one platform's file. This ensures consistent cross-platform implementation.
