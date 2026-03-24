const LaunchDarklySync = require('../agents/launchdarkly-sync');

describe('LaunchDarklySync', () => {
  const flags = [
    { id: 'legacy-checkout', intent: 'Legacy checkout guard', state: 'off', platforms: ['web'] },
    { id: 'new-checkout', intent: 'New checkout rollout', state: 'off', prereq: 'legacy-checkout', when: 'false', group: 'checkout', platforms: ['web', 'android'] },
  ];
  const graph = { rolloutOrder: ['legacy-checkout', 'new-checkout'] };

  test('builds deterministic action plan in rollout order', () => {
    const sync = new LaunchDarklySync({ fetchImpl: null });
    const plan = sync.buildActionPlan({ flags, graph });

    expect(plan.createFlags.map(f => f.key)).toEqual(['legacy-checkout', 'new-checkout']);
    expect(plan.setPrerequisites).toEqual([
      { key: 'new-checkout', prereq: 'legacy-checkout', when: 'false' },
    ]);
  });

  test('falls back to action plan when API config is unavailable', async () => {
    const sync = new LaunchDarklySync({ fetchImpl: null, apiToken: '', projectKey: '', environmentKey: '' });
    const result = await sync.sync({ flags, graph });

    expect(result.mode).toBe('action-plan');
    expect(result.provider).toBe('launchdarkly');
    expect(result.executed).toEqual([]);
    expect(result.actionPlan.createFlags).toHaveLength(2);
  });

  test('executes create and prerequisite operations when API is available', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });

      if (options.method === 'GET' && url.includes('/flags/project/legacy-checkout')) {
        return { ok: true, status: 200, json: async () => ({ key: 'legacy-checkout' }) };
      }
      if (options.method === 'GET' && url.includes('/flags/project/new-checkout')) {
        return { ok: false, status: 404, text: async () => 'not found' };
      }
      if (options.method === 'POST') {
        return { ok: true, status: 201, text: async () => '' };
      }
      if (options.method === 'PATCH') {
        return { ok: true, status: 200, text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const sync = new LaunchDarklySync({
      fetchImpl,
      apiToken: 'token',
      projectKey: 'project',
      environmentKey: 'dev',
    });

    const result = await sync.sync({ flags, graph });

    expect(result.mode).toBe('launchdarkly-api');
    expect(result.provider).toBe('launchdarkly');
    expect(result.executed).toEqual([
      { type: 'create', key: 'new-checkout' },
      { type: 'prerequisite', key: 'new-checkout', prereq: 'legacy-checkout', when: 'false' },
    ]);
    expect(calls.some(c => c.method === 'POST')).toBe(true);
    expect(calls.some(c => c.method === 'PATCH')).toBe(true);
  });
});
