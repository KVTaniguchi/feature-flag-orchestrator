const { resolveSyncAgent } = require('../agents/resolve-sync-agent');

describe('resolveSyncAgent', () => {
  const prev = process.env.FEATURE_FLAG_PROVIDER;

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_FLAG_PROVIDER;
    else process.env.FEATURE_FLAG_PROVIDER = prev;
  });

  test('defaults to LaunchDarkly', () => {
    delete process.env.FEATURE_FLAG_PROVIDER;
    const agent = resolveSyncAgent();
    expect(agent.providerId).toBe('launchdarkly');
  });

  test('selects Harness from env', () => {
    process.env.FEATURE_FLAG_PROVIDER = 'harness';
    const agent = resolveSyncAgent();
    expect(agent.providerId).toBe('harness');
  });

  test('selects Harness from opts.provider', () => {
    process.env.FEATURE_FLAG_PROVIDER = 'launchdarkly';
    const agent = resolveSyncAgent({ provider: 'harness' });
    expect(agent.providerId).toBe('harness');
  });

  test('throws on unknown provider', () => {
    expect(() => resolveSyncAgent({ provider: 'unknown-vendor' })).toThrow(/Unknown FEATURE_FLAG_PROVIDER/);
  });
});
