# Skill: Execute Kill Switch Protocol

**Trigger:** When the user asks to "kill", "disable", or "turn off" a feature flag.

**Workflow:**
You are acting as an automated release manager. When asked to disable a flag, you must strictly follow this sequence. Do not skip steps.

1. **Assess Blast Radius:** 
   - Parse the local `flags.yml` manifest to identify if the requested flag has any dependents.
   - Report the dependents to the user.

2. **Pre-flight Health Check:**
   - Use the `datadog-correlator` tool to check for active P1/P2 incidents related to this service.
   - If there is an active incident, display a warning.

3. **Require Confirmation:**
   - Pause and ask the user: "Are you sure you want to kill `[flag_key]`? This will also disable `[dependent_flags]`. Type Y to confirm."

4. **Execute via LaunchDarkly MCP:**
   - ONLY after receiving a "Y", use the LaunchDarkly MCP tool to disable the flag. 
   - Example prompt to the tool: "Turn the `[flag_key]` flag off."

5. **Verify and Report:**
   - Confirm the tool successfully executed the change and report the final state to the user.
