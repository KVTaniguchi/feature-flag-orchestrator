const FlagGraph = require('../agents/flag-graph');

describe('FlagGraph', () => {
  test('builds dependents and rollout order', () => {
    const graph = new FlagGraph().build([
      { id: 'legacy', state: 'off', platforms: ['web'] },
      { id: 'checkout', state: 'off', prereq: 'legacy', when: 'false', platforms: ['web', 'android'] },
      { id: 'receipt', state: 'off', prereq: 'checkout', when: 'true', platforms: ['ios'] },
    ]);

    expect(graph.rolloutOrder).toEqual(['legacy', 'checkout', 'receipt']);
    expect(graph.dependentsById.legacy).toEqual(['checkout']);
    expect(graph.dependentsById.checkout).toEqual(['receipt']);
    expect(graph.issues.missingPrereqs).toEqual([]);
    expect(graph.issues.cycles).toEqual([]);
  });

  test('reports missing prerequisites', () => {
    const graph = new FlagGraph().build([
      { id: 'checkout', state: 'off', prereq: 'legacy', when: 'false', platforms: ['web'] },
    ]);

    expect(graph.issues.missingPrereqs).toEqual([{ flag: 'checkout', prereq: 'legacy' }]);
    expect(graph.rolloutOrder).toEqual(['checkout']);
  });

  test('detects dependency cycles', () => {
    const graph = new FlagGraph().build([
      { id: 'a', state: 'off', prereq: 'b', when: 'false', platforms: ['web'] },
      { id: 'b', state: 'off', prereq: 'a', when: 'false', platforms: ['android'] },
    ]);

    expect(graph.rolloutOrder).toEqual([]);
    expect(graph.issues.cycles.length).toBeGreaterThan(0);
  });
});
