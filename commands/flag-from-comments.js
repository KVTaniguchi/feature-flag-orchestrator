/**
 * Command: /flag-from-comments
 *
 * Scans source files for @flag annotations, merges them into state/flags.yml,
 * and outputs a vendor sync plan (LaunchDarkly or Harness) for Claude to execute via API/MCP.
 *
 * Usage: /flag-from-comments [--dir <path>]
 *
 * After this command runs, Claude will:
 *  1. Show a summary of discovered annotations
 *  2. Confirm what was written to flags.yml
 *  3. Create each new flag via the configured provider (API or MCP)
 *  4. Set prerequisite rules per the annotation's prereq/when fields
 *  5. Output per-platform implementation snippets
 */

const CommentScanner = require('../agents/comment-scanner');
const FlagMerger = require('../agents/flag-merger');
const FlagGraph = require('../agents/flag-graph');
const { resolveSyncAgent } = require('../agents/resolve-sync-agent');

module.exports = async function flagFromComments(args = {}) {
  const rootDir = args.dir || process.cwd();
  const format = args.format || 'text';
  const executeLd = args.executeLd !== false;
  const syncAgent = resolveSyncAgent({ provider: args.provider });

  const emit = (...msg) => {
    if (format === 'text') console.log(...msg);
  };

  emit(`\nScanning ${rootDir} for @flag annotations...\n`);

  const scanner = new CommentScanner();
  const annotations = scanner.scan(rootDir);

  if (annotations.length === 0) {
    emit('No @flag annotations found.\n');
    emit('Add comments to your source files like:\n');
    emit('  // @flag key=my-feature prereq=other-flag when=false group=my-group platforms=web,android');
    emit('  // @flag-intent: Skip this block until the prereq flag is disabled\n');
    return {
      annotations: [],
      added: [],
      updated: [],
      graph: null,
      ld: {
        mode: 'none',
        provider: syncAgent.providerId,
        actionPlan: { createFlags: [], setPrerequisites: [] },
      },
    };
  }

  // Print discovery summary
  emit(`Found ${annotations.length} annotation(s):\n`);
  emit('─────────────────────────────────────────────────────');
  for (const ann of annotations) {
    emit(`  key:       ${ann.key}`);
    emit(`  intent:    ${ann.intent}`);
    if (ann.prereq) emit(`  prereq:    ${ann.prereq} == ${ann.when}`);
    if (ann.group) emit(`  group:     ${ann.group}`);
    emit(`  platforms: ${ann.platforms.join(', ')}`);
    emit(`  source:    ${ann.sourceFile}:${ann.sourceLine}`);
    emit();
  }

  // Merge into flags.yml
  const merger = new FlagMerger();
  const { manifest, added, updated } = merger.merge(annotations);

  emit('flags.yml updated:');
  if (added.length) emit(`  Added:   ${added.join(', ')}`);
  if (updated.length) emit(`  Updated: ${updated.join(', ')}`);
  if (!added.length && !updated.length) emit('  No changes.');
  emit();

  const graphBuilder = new FlagGraph();
  const graph = graphBuilder.build(manifest.flags || []);

  emit('Aggregate control report:');
  emit('─────────────────────────────────────────────────────');
  for (const id of Object.keys(graph.flagsById).sort()) {
    const flag = graph.flagsById[id];
    const requires = flag.prereq ? `${flag.prereq} == ${flag.when}` : 'none';
    const requiredBy = (graph.dependentsById[id] || []).join(', ') || 'none';
    const controls = flag.group || 'ungrouped';
    const platforms = (flag.platforms || []).join(', ') || 'none';
    emit(`  ${id}`);
    emit(`    controls:   ${controls}`);
    emit(`    requires:   ${requires}`);
    emit(`    requiredBy: ${requiredBy}`);
    emit(`    platforms:  ${platforms}`);
    emit(`    state:      ${flag.state}`);
  }
  emit();
  emit(`Recommended rollout order: ${graph.rolloutOrder.join(' -> ')}`);
  if (graph.issues.missingPrereqs.length > 0) {
    emit('Missing prerequisites detected:');
    for (const issue of graph.issues.missingPrereqs) {
      emit(`  - ${issue.flag} references missing prereq ${issue.prereq}`);
    }
  }
  if (graph.issues.cycles.length > 0) {
    emit('Dependency cycles detected:');
    for (const cycle of graph.issues.cycles) {
      emit(`  - ${cycle.join(' -> ')}`);
    }
  }
  emit();

  const mermaidLines = ['flowchart TD'];
  for (const id of Object.keys(graph.flagsById).sort()) {
    mermaidLines.push(`  ${sanitizeId(id)}["${id}"]`);
  }
  for (const id of Object.keys(graph.flagsById).sort()) {
    const flag = graph.flagsById[id];
    if (flag.prereq && graph.flagsById[flag.prereq]) {
      mermaidLines.push(`  ${sanitizeId(flag.prereq)} -->|"${id} when ${String(flag.when || 'false')}"| ${sanitizeId(id)}`);
    }
  }
  const mermaidGraph = mermaidLines.join('\n');

  emit('Dependency map (Mermaid):');
  emit('```mermaid');
  emit(mermaidGraph);
  emit('```');
  emit();

  const ld = executeLd
    ? await syncAgent.sync({ flags: manifest.flags || [], graph })
    : {
        mode: 'action-plan',
        provider: syncAgent.providerId,
        actionPlan: syncAgent.buildActionPlan({ flags: manifest.flags || [], graph }),
        executed: [],
      };

  const apiModes = new Set(['launchdarkly-api', 'harness-api']);
  if (apiModes.has(ld.mode)) {
    emit(`Feature flag sync (${ld.provider}): executed via API`);
    emit(`  Creates: ${ld.results.createResults.length}`);
    emit(`  Prerequisite results: ${ld.results.prereqResults.length}`);
  } else if (ld.mode === 'action-plan') {
    emit(`Feature flag sync (${ld.provider}): API unavailable or dry-run, action plan only`);
    emit(`  Planned creates: ${ld.actionPlan.createFlags.length}`);
    emit(`  Planned prerequisites: ${ld.actionPlan.setPrerequisites.length}`);
  }
  emit();

  const result = { annotations, added, updated, graph, mermaidGraph, ld };
  if (format === 'json') {
    return result;
  }
  return result;
};

function sanitizeId(id) {
  const cleaned = String(id || '').replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || 'flagNode';
}
