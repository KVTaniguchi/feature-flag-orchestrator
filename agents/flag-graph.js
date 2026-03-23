/**
 * Agent: flag-graph
 *
 * Builds a dependency graph from discovered flags and validates prerequisite
 * quality so release order and blast radius are explicit.
 */

class FlagGraph {
  /**
   * @param {Array} flags
   * @returns {{
   *  flagsById: Record<string, any>,
   *  dependentsById: Record<string, string[]>,
   *  rolloutOrder: string[],
   *  issues: { missingPrereqs: Array<{flag:string, prereq:string}>, cycles: string[][] },
   *  groups: Record<string, any[]>,
   *  platformCoverage: Record<string, string[]>,
   * }}
   */
  build(flags) {
    const flagsById = {};
    const dependentsById = {};
    const missingPrereqs = [];
    const indegree = {};
    const edges = {};
    const groups = {};
    const platformCoverage = {};

    for (const flag of flags || []) {
      flagsById[flag.id] = flag;
      dependentsById[flag.id] = [];
      indegree[flag.id] = 0;
      edges[flag.id] = [];

      const groupName = flag.group || 'ungrouped';
      groups[groupName] = groups[groupName] || [];
      groups[groupName].push(flag);

      platformCoverage[flag.id] = Array.from(new Set(flag.platforms || []));
    }

    for (const flag of flags || []) {
      if (!flag.prereq) continue;
      if (!flagsById[flag.prereq]) {
        missingPrereqs.push({ flag: flag.id, prereq: flag.prereq });
        continue;
      }
      edges[flag.prereq].push(flag.id);
      indegree[flag.id] += 1;
      dependentsById[flag.prereq].push(flag.id);
    }

    const rolloutOrder = this.topologicalSort(indegree, edges);
    const cycles = rolloutOrder.length === Object.keys(flagsById).length
      ? []
      : this.detectCycles(edges);

    return {
      flagsById,
      dependentsById,
      rolloutOrder,
      issues: { missingPrereqs, cycles },
      groups,
      platformCoverage,
    };
  }

  topologicalSort(indegree, edges) {
    const queue = Object.keys(indegree).filter(id => indegree[id] === 0).sort();
    const ordered = [];

    while (queue.length) {
      const id = queue.shift();
      ordered.push(id);
      for (const next of edges[id] || []) {
        indegree[next] -= 1;
        if (indegree[next] === 0) {
          queue.push(next);
          queue.sort();
        }
      }
    }
    return ordered;
  }

  detectCycles(edges) {
    const state = {};
    const stack = [];
    const cycles = [];
    const seenCycle = new Set();

    const visit = id => {
      state[id] = 'visiting';
      stack.push(id);

      for (const next of edges[id] || []) {
        if (!state[next]) {
          visit(next);
          continue;
        }
        if (state[next] !== 'visiting') continue;

        const start = stack.indexOf(next);
        if (start >= 0) {
          const cycle = stack.slice(start).concat(next);
          const key = cycle.join('->');
          if (!seenCycle.has(key)) {
            seenCycle.add(key);
            cycles.push(cycle);
          }
        }
      }

      stack.pop();
      state[id] = 'visited';
    };

    for (const id of Object.keys(edges).sort()) {
      if (!state[id]) visit(id);
    }

    return cycles;
  }
}

module.exports = FlagGraph;
