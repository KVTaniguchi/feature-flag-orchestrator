const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const runFlagFromComments = require('../commands/flag-from-comments');

const FLAGS_YML = path.join(__dirname, '../state/flags.yml');

describe('/flag-from-comments command', () => {
  let originalFlagsYml;
  let tmpDir;

  beforeEach(() => {
    originalFlagsYml = fs.readFileSync(FLAGS_YML, 'utf8');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flag-orchestrator-'));
  });

  afterEach(() => {
    fs.writeFileSync(FLAGS_YML, originalFlagsYml, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns aggregate graph, rollout order, and action plan fallback', async () => {
    fs.writeFileSync(path.join(tmpDir, 'checkout.ts'), [
      '// @flag key=legacy-checkout group=checkout',
      '// @flag-intent: Legacy fallback switch',
      'const x = 1;',
      '// @flag key=new-checkout prereq=legacy-checkout when=false group=checkout platforms=web,android',
      '// @flag-intent: New checkout experience',
      'const y = 2;',
    ].join('\n'));

    const result = await runFlagFromComments({
      dir: tmpDir,
      format: 'json',
      executeLd: false,
    });

    expect(result.annotations).toHaveLength(2);
    expect(result.graph.rolloutOrder).toEqual(['legacy-checkout', 'new-checkout']);
    expect(result.graph.dependentsById['legacy-checkout']).toEqual(['new-checkout']);
    expect(result.ld.mode).toBe('action-plan');
    expect(result.ld.actionPlan.setPrerequisites).toEqual([
      { key: 'new-checkout', prereq: 'legacy-checkout', when: 'false' },
    ]);

    const manifest = yaml.load(fs.readFileSync(FLAGS_YML, 'utf8'));
    const newCheckout = manifest.flags.find(f => f.id === 'new-checkout');
    expect(newCheckout.dependencies).toEqual(['legacy-checkout']);
  });
});
