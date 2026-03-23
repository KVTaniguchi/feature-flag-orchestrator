/**
 * Agent: launchdarkly-sync
 *
 * Executes idempotent LaunchDarkly synchronization when API credentials are
 * available, otherwise produces a machine-readable action plan.
 */

const API_BASE = 'https://app.launchdarkly.com/api/v2';

class LaunchDarklySync {
  constructor(opts = {}) {
    this.fetchImpl = opts.fetchImpl || global.fetch;
    this.apiToken = opts.apiToken || process.env.LD_API_TOKEN || '';
    this.projectKey = opts.projectKey || process.env.LD_PROJECT_KEY || '';
    this.environmentKey = opts.environmentKey || process.env.LD_ENV_KEY || '';
  }

  isAvailable() {
    return Boolean(this.fetchImpl && this.apiToken && this.projectKey && this.environmentKey);
  }

  headers() {
    return {
      Authorization: this.apiToken,
      'Content-Type': 'application/json',
    };
  }

  async sync({ flags, graph }) {
    const actionPlan = this.buildActionPlan({ flags, graph });
    if (!this.isAvailable()) {
      return { mode: 'action-plan', actionPlan, executed: [] };
    }

    const executed = [];
    const createResults = [];
    const prereqResults = [];

    for (const op of actionPlan.createFlags) {
      const existing = await this.getFlag(op.key);
      if (existing) {
        createResults.push({ key: op.key, status: 'exists' });
        continue;
      }
      await this.createFlag(op);
      createResults.push({ key: op.key, status: 'created' });
      executed.push({ type: 'create', key: op.key });
    }

    for (const op of actionPlan.setPrerequisites) {
      await this.patchPrerequisite(op);
      prereqResults.push({ key: op.key, prereq: op.prereq, when: op.when, status: 'applied' });
      executed.push({ type: 'prerequisite', key: op.key, prereq: op.prereq, when: op.when });
    }

    return {
      mode: 'launchdarkly-api',
      actionPlan,
      executed,
      results: { createResults, prereqResults },
    };
  }

  buildActionPlan({ flags, graph }) {
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

  async getFlag(key) {
    const url = `${API_BASE}/flags/${this.projectKey}/${key}`;
    const res = await this.fetchImpl(url, { method: 'GET', headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LaunchDarkly get flag failed for "${key}" (${res.status}): ${body}`);
    }
    return res.json();
  }

  async createFlag(op) {
    const url = `${API_BASE}/flags/${this.projectKey}`;
    const body = {
      key: op.key,
      name: op.name,
      description: op.description,
      kind: 'boolean',
      defaults: { onVariation: 1, offVariation: 0 },
      variations: [{ value: false, name: 'off' }, { value: true, name: 'on' }],
      tags: op.tags,
      temporary: false,
      includeInSnippet: true,
      clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: true },
    };

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 409) {
      const text = await res.text();
      throw new Error(`LaunchDarkly create flag failed for "${op.key}" (${res.status}): ${text}`);
    }
  }

  async patchPrerequisite(op) {
    const url = `${API_BASE}/flags/${this.projectKey}/${op.key}`;
    const value = op.when === 'true';
    const patch = [{
      op: 'add',
      path: `/environments/${this.environmentKey}/prerequisites/-`,
      value: { key: op.prereq, variation: value ? 1 : 0 },
    }];

    const res = await this.fetchImpl(url, {
      method: 'PATCH',
      headers: { ...this.headers(), 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LaunchDarkly prerequisite patch failed for "${op.key}" (${res.status}): ${text}`);
    }
  }
}

module.exports = LaunchDarklySync;
