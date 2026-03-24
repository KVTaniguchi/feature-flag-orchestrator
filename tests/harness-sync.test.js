const HarnessSync = require('../agents/harness-sync');

describe('HarnessSync', () => {
  const flags = [
    { id: 'legacy-checkout', intent: 'Legacy checkout guard', state: 'off', platforms: ['web'] },
    { id: 'new-checkout', intent: 'New checkout rollout', state: 'off', prereq: 'legacy-checkout', when: 'false', group: 'checkout', platforms: ['web', 'android'] },
  ];
  const graph = { rolloutOrder: ['legacy-checkout', 'new-checkout'] };

  test('builds same action plan as other providers', () => {
    const sync = new HarnessSync({ fetchImpl: null });
    const plan = sync.buildActionPlan({ flags, graph });

    expect(plan.createFlags.map(f => f.key)).toEqual(['legacy-checkout', 'new-checkout']);
    expect(plan.setPrerequisites).toEqual([
      { key: 'new-checkout', prereq: 'legacy-checkout', when: 'false' },
    ]);
  });

  test('falls back to action plan when API config is unavailable', async () => {
    const sync = new HarnessSync({
      fetchImpl: null,
      apiKey: '',
      accountIdentifier: '',
      orgIdentifier: '',
      projectIdentifier: '',
    });
    const result = await sync.sync({ flags, graph });

    expect(result.mode).toBe('action-plan');
    expect(result.provider).toBe('harness');
    expect(result.executed).toEqual([]);
  });

  test('creates new flag with prerequisites embedded in POST', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });

      if (options.method === 'GET' && url.includes('/legacy-checkout')) {
        return { ok: true, status: 200, json: async () => ({ identifier: 'legacy-checkout', prerequisites: [] }) };
      }
      if (options.method === 'GET' && url.includes('/new-checkout')) {
        return { ok: false, status: 404, text: async () => 'not found' };
      }
      if (options.method === 'POST') {
        return { ok: true, status: 201, text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const sync = new HarnessSync({
      fetchImpl,
      apiKey: 'k',
      accountIdentifier: 'acct',
      orgIdentifier: 'org',
      projectIdentifier: 'proj',
    });

    const result = await sync.sync({ flags, graph });

    expect(result.mode).toBe('harness-api');
    expect(result.provider).toBe('harness');
    expect(result.executed.some(e => e.type === 'create' && e.key === 'new-checkout')).toBe(true);
    expect(result.executed.filter(e => e.type === 'prerequisite').length).toBeGreaterThanOrEqual(1);

    const post = calls.find(c => c.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(post.body);
    expect(body.identifier).toBe('new-checkout');
    expect(body.prerequisites).toEqual([
      { feature: 'legacy-checkout', variations: ['false'] },
    ]);
  });

  test('patches prerequisites when flag already exists', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });

      if (options.method === 'GET' && url.includes('/new-checkout')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            identifier: 'new-checkout',
            prerequisites: [],
          }),
        };
      }
      if (options.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const sync = new HarnessSync({
      fetchImpl,
      apiKey: 'k',
      accountIdentifier: 'acct',
      orgIdentifier: 'org',
      projectIdentifier: 'proj',
    });

    const result = await sync.sync({ flags, graph });

    const patch = calls.find(c => c.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(patch.body);
    expect(body.instructions[0].kind).toBe('replacePrerequisites');
    expect(body.instructions[0].parameters.prerequisites).toEqual([
      { feature: 'legacy-checkout', variations: ['false'] },
    ]);
    expect(result.results.prereqResults.some(r => r.status === 'applied')).toBe(true);
  });
});
