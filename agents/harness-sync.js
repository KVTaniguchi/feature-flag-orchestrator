/**
 * Agent: harness-sync
 *
 * Harness Feature Flags Admin API (api.harness.io/cf/admin/features).
 * Creates boolean flags with prerequisites on POST; merges prerequisites via PATCH
 * when the flag already exists (Harness supports prerequisites on create — see
 * https://apidocs.harness.io/feature-flags/createfeatureflag).
 */

const { buildActionPlan } = require('./build-action-plan');

const API_BASE = 'https://api.harness.io/cf/admin/features';

/** Default boolean variation identifiers (match typical Harness boolean templates). */
const VAR_TRUE = 'true';
const VAR_FALSE = 'false';

class HarnessSync {
  constructor(opts = {}) {
    this.providerId = 'harness';
    this.fetchImpl = opts.fetchImpl || global.fetch;
    this.apiKey = opts.apiKey || process.env.HARNESS_API_KEY || '';
    this.accountIdentifier = opts.accountIdentifier || process.env.HARNESS_ACCOUNT_ID || '';
    this.orgIdentifier = opts.orgIdentifier || process.env.HARNESS_ORG_ID || '';
    this.projectIdentifier = opts.projectIdentifier || process.env.HARNESS_PROJECT_ID || '';
    /** Optional; included on GET/PATCH when set (matches Harness query params). */
    this.environmentIdentifier = opts.environmentIdentifier || process.env.HARNESS_ENV_ID || '';
  }

  isAvailable() {
    return Boolean(
      this.fetchImpl &&
        this.apiKey &&
        this.accountIdentifier &&
        this.orgIdentifier &&
        this.projectIdentifier,
    );
  }

  headers() {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  buildActionPlan(args) {
    return buildActionPlan(args);
  }

  queryBase() {
    const q = new URLSearchParams({
      accountIdentifier: this.accountIdentifier,
      orgIdentifier: this.orgIdentifier,
    });
    return q.toString();
  }

  queryProject() {
    const q = new URLSearchParams({
      accountIdentifier: this.accountIdentifier,
      orgIdentifier: this.orgIdentifier,
      projectIdentifier: this.projectIdentifier,
    });
    if (this.environmentIdentifier) {
      q.set('environmentIdentifier', this.environmentIdentifier);
    }
    return q.toString();
  }

  whenToVariationIds(when) {
    return [String(when) === 'true' ? VAR_TRUE : VAR_FALSE];
  }

  buildBooleanCreateBody(op) {
    return {
      identifier: op.key,
      name: op.name,
      description: op.description || `Feature flag: ${op.key}`,
      kind: 'boolean',
      permanent: false,
      project: this.projectIdentifier,
      defaultOffVariation: VAR_FALSE,
      defaultOnVariation: VAR_TRUE,
      variations: [
        { identifier: VAR_FALSE, name: 'off', value: 'false' },
        { identifier: VAR_TRUE, name: 'on', value: 'true' },
      ],
      tags: (op.tags || []).map(t => ({ identifier: t, name: t })),
    };
  }

  /**
   * @param {object} op - createFlags entry plus optional prerequisites from setPrerequisites
   */
  async sync({ flags, graph }) {
    const actionPlan = this.buildActionPlan({ flags, graph });
    if (!this.isAvailable()) {
      return { mode: 'action-plan', provider: 'harness', actionPlan, executed: [] };
    }

    const prereqByKey = {};
    for (const p of actionPlan.setPrerequisites) {
      prereqByKey[p.key] = p;
    }

    const executed = [];
    const createResults = [];
    const prereqResults = [];

    for (const op of actionPlan.createFlags) {
      const existing = await this.getFlag(op.key);
      if (existing) {
        createResults.push({ key: op.key, status: 'exists' });
        const pre = prereqByKey[op.key];
        if (pre) {
          const r = await this.ensurePrerequisite(existing, pre);
          prereqResults.push(r);
          if (r.status === 'applied') {
            executed.push({ type: 'prerequisite', key: pre.key, prereq: pre.prereq, when: pre.when });
          }
        }
        continue;
      }

      const body = this.buildBooleanCreateBody(op);
      const pre = prereqByKey[op.key];
      if (pre) {
        body.prerequisites = [
          {
            feature: pre.prereq,
            variations: this.whenToVariationIds(pre.when),
          },
        ];
      }

      await this.createFlag(body);
      createResults.push({ key: op.key, status: 'created' });
      executed.push({ type: 'create', key: op.key });
      if (pre) {
        prereqResults.push({
          key: pre.key,
          prereq: pre.prereq,
          when: pre.when,
          status: 'applied_on_create',
        });
        executed.push({ type: 'prerequisite', key: pre.key, prereq: pre.prereq, when: pre.when });
      }
    }

    return {
      mode: 'harness-api',
      provider: 'harness',
      actionPlan,
      executed,
      results: { createResults, prereqResults },
    };
  }

  async getFlag(identifier) {
    const url = `${API_BASE}/${encodeURIComponent(identifier)}?${this.queryProject()}`;
    const res = await this.fetchImpl(url, { method: 'GET', headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Harness get flag failed for "${identifier}" (${res.status}): ${body}`);
    }
    return res.json();
  }

  async createFlag(body) {
    const url = `${API_BASE}?${this.queryBase()}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 409) {
      const text = await res.text();
      throw new Error(`Harness create flag failed for "${body.identifier}" (${res.status}): ${text}`);
    }
  }

  prerequisiteSatisfied(existingPrereqs, op) {
    const want = op.prereq;
    const wantVars = new Set(this.whenToVariationIds(op.when));
    const row = (existingPrereqs || []).find(p => p.feature === want);
    if (!row || !row.variations) return false;
    const got = new Set(row.variations);
    return wantVars.size === got.size && [...wantVars].every(v => got.has(v));
  }

  /**
   * Merge prerequisite onto existing flag via PATCH. Instruction kind is not fully
   * documented publicly; we send a merged prerequisites list (Harness may accept
   * `replacePrerequisites` — verify against your account or capture UI network calls).
   */
  async ensurePrerequisite(existingFlag, op) {
    if (this.prerequisiteSatisfied(existingFlag.prerequisites, op)) {
      return { key: op.key, prereq: op.prereq, when: op.when, status: 'already_set' };
    }

    const merged = [...(existingFlag.prerequisites || [])].filter(p => p.feature !== op.prereq);
    merged.push({
      feature: op.prereq,
      variations: this.whenToVariationIds(op.when),
    });

    const url = `${API_BASE}/${encodeURIComponent(op.key)}?${this.queryProject()}`;
    const patchBody = {
      instructions: [
        {
          kind: 'replacePrerequisites',
          parameters: { prerequisites: merged },
        },
      ],
    };

    const res = await this.fetchImpl(url, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(patchBody),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        key: op.key,
        prereq: op.prereq,
        when: op.when,
        status: 'patch_failed',
        httpStatus: res.status,
        detail: text,
      };
    }

    return { key: op.key, prereq: op.prereq, when: op.when, status: 'applied' };
  }
}

module.exports = HarnessSync;
