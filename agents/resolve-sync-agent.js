/**
 * Selects the feature-flag vendor sync agent from FEATURE_FLAG_PROVIDER (default: launchdarkly).
 */

const LaunchDarklySync = require('./launchdarkly-sync');
const HarnessSync = require('./harness-sync');

function resolveSyncAgent(opts = {}) {
  const id = String(opts.provider || process.env.FEATURE_FLAG_PROVIDER || 'launchdarkly')
    .toLowerCase()
    .trim();

  if (id === 'harness' || id === 'harness_ff' || id === 'harness-ff') {
    return new HarnessSync(opts);
  }
  if (id === 'launchdarkly' || id === 'ld') {
    return new LaunchDarklySync(opts);
  }

  throw new Error(
    `Unknown FEATURE_FLAG_PROVIDER "${id}". Use "launchdarkly" or "harness".`,
  );
}

module.exports = { resolveSyncAgent };
