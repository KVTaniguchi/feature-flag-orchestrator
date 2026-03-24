/**
 * Vendor-neutral plan: which flags to create and which prerequisite edges to enforce.
 * Used by LaunchDarkly, Harness, and other provider sync agents.
 */

function buildActionPlan({ flags, graph }) {
  const ordered = graph.rolloutOrder.length
    ? graph.rolloutOrder
    : (flags || []).map(f => f.id);
  const byId = {};
  for (const f of flags || []) byId[f.id] = f;

  const createFlags = [];
  const setPrerequisites = [];
  for (const id of ordered) {
    const flag = byId[id];
    if (!flag) continue;
    createFlags.push({
      key: flag.id,
      name: flag.id,
      description: flag.intent || flag.description || `Feature flag: ${flag.id}`,
      tags: Array.from(new Set([flag.group, ...(flag.platforms || [])].filter(Boolean))),
    });

    if (flag.prereq) {
      setPrerequisites.push({
        key: flag.id,
        prereq: flag.prereq,
        when: String(flag.when || 'false'),
      });
    }
  }

  return { createFlags, setPrerequisites };
}

module.exports = { buildActionPlan };
