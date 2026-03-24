const { buildActionPlan } = require('../agents/build-action-plan');

describe('buildActionPlan', () => {
  test('returns empty plans when flags is empty', () => {
    expect(buildActionPlan({ flags: [], graph: { rolloutOrder: [] } })).toEqual({
      createFlags: [],
      setPrerequisites: [],
    });
  });

  test('uses graph.rolloutOrder when provided', () => {
    const flags = [
      { id: 'b', intent: 'B', state: 'off' },
      { id: 'a', intent: 'A', state: 'off' },
    ];
    const graph = { rolloutOrder: ['a', 'b'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags.map(c => c.key)).toEqual(['a', 'b']);
  });

  test('falls back to flag array order when rolloutOrder is empty', () => {
    const flags = [
      { id: 'first', intent: '1', state: 'off' },
      { id: 'second', intent: '2', state: 'off' },
    ];
    const graph = { rolloutOrder: [] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags.map(c => c.key)).toEqual(['first', 'second']);
  });

  test('skips ids in rolloutOrder that are not in flags', () => {
    const flags = [{ id: 'only', intent: 'Only', state: 'off' }];
    const graph = { rolloutOrder: ['missing', 'only'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags.map(c => c.key)).toEqual(['only']);
  });

  test('builds createFlags with intent, description fallback, and tags', () => {
    const flags = [
      {
        id: 'checkout',
        intent: 'New checkout',
        state: 'off',
        group: 'payments',
        platforms: ['web', 'android'] },
    ];
    const graph = { rolloutOrder: ['checkout'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags).toEqual([
      {
        key: 'checkout',
        name: 'checkout',
        description: 'New checkout',
        tags: ['payments', 'web', 'android'],
      },
    ]);
  });

  test('uses description when intent is absent', () => {
    const flags = [{ id: 'x', description: 'From description', state: 'off' }];
    const graph = { rolloutOrder: ['x'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags[0].description).toBe('From description');
  });

  test('uses default description when intent and description are absent', () => {
    const flags = [{ id: 'bare', state: 'off' }];
    const graph = { rolloutOrder: ['bare'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags[0].description).toBe('Feature flag: bare');
  });

  test('dedupes tags from group and platform overlap', () => {
    const flags = [
      { id: 'f', intent: 'i', state: 'off', group: 'web', platforms: ['web', 'ios'] },
    ];
    const graph = { rolloutOrder: ['f'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.createFlags[0].tags).toEqual(['web', 'ios']);
  });

  test('emits setPrerequisites with string when and default false', () => {
    const flags = [
      { id: 'parent', intent: 'p', state: 'off' },
      { id: 'child', intent: 'c', state: 'off', prereq: 'parent', when: 'false' },
    ];
    const graph = { rolloutOrder: ['parent', 'child'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.setPrerequisites).toEqual([
      { key: 'child', prereq: 'parent', when: 'false' },
    ]);
  });

  test('defaults when to false when prereq is set but when is omitted', () => {
    const flags = [{ id: 'child', intent: 'c', state: 'off', prereq: 'parent' }];
    const graph = { rolloutOrder: ['child'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.setPrerequisites).toEqual([
      { key: 'child', prereq: 'parent', when: 'false' },
    ]);
  });

  test('preserves when true as string', () => {
    const flags = [
      { id: 'a', intent: 'a', state: 'off' },
      { id: 'b', intent: 'b', state: 'off', prereq: 'a', when: 'true' },
    ];
    const graph = { rolloutOrder: ['a', 'b'] };

    const plan = buildActionPlan({ flags, graph });

    expect(plan.setPrerequisites).toEqual([
      { key: 'b', prereq: 'a', when: 'true' },
    ]);
  });

  test('handles missing flags array like empty', () => {
    const plan = buildActionPlan({ flags: undefined, graph: { rolloutOrder: [] } });
    expect(plan.createFlags).toEqual([]);
    expect(plan.setPrerequisites).toEqual([]);
  });
});
