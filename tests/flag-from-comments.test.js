const fs = require('fs');
const path = require('path');
const CommentScanner = require('../agents/comment-scanner');

// ─── Skill structure tests ────────────────────────────────────────────────────

describe('Flag From Comments Skill', () => {
  let skillContent;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../skills/flag-from-comments.md');
    skillContent = fs.readFileSync(filePath, 'utf8');
  });

  test('should define triggers for @flag annotation processing', () => {
    expect(skillContent).toMatch(/\/flag-from-comments/);
    expect(skillContent).toMatch(/@flag/);
  });

  test('should include a scan and parse step', () => {
    expect(skillContent).toContain('1. **Scan and Parse:**');
    expect(skillContent).toContain('comment-scanner');
  });

  test('should require merging to flags.yml', () => {
    expect(skillContent).toContain('2. **Merge to flags.yml:**');
    expect(skillContent).toContain('state/flags.yml');
  });

  test('should mandate LaunchDarkly MCP for flag creation', () => {
    expect(skillContent).toContain('3. **Create Flags in LaunchDarkly via MCP:**');
    expect(skillContent).toContain('LaunchDarkly MCP tool');
  });

  test('should include a prerequisite setup step', () => {
    expect(skillContent).toContain('4. **Set Prerequisites in LaunchDarkly:**');
    expect(skillContent).toContain('prereq');
    expect(skillContent).toContain('when');
  });

  test('should emit per-platform implementation snippets', () => {
    expect(skillContent).toContain('5. **Output Per-Platform Implementation Snippets:**');
    expect(skillContent).toContain('TypeScript');
    expect(skillContent).toContain('Kotlin');
    expect(skillContent).toContain('Swift');
  });

  test('should include the @flag annotation in snippet templates', () => {
    expect(skillContent).toMatch(/\/\/ @flag key=\[key\]/);
    expect(skillContent).toMatch(/\/\/ @flag-intent: \[intent\]/);
  });

  test('should document the when=false safety pattern', () => {
    expect(skillContent).toContain('when');
    expect(skillContent).toMatch(/false.*off|off.*false/i);
  });
});

// ─── CommentScanner unit tests ────────────────────────────────────────────────

describe('CommentScanner', () => {
  let scanner;

  beforeEach(() => {
    scanner = new CommentScanner();
  });

  function writeTmpFile(ext, content) {
    const tmp = path.join(__dirname, `_fixture${ext}`);
    fs.writeFileSync(tmp, content);
    return tmp;
  }

  function cleanup(...files) {
    for (const f of files) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  test('parses a basic @flag annotation with explicit platforms', () => {
    const tmp = writeTmpFile('.ts', [
      '// @flag key=my-feature group=my-group platforms=web',
      '// @flag-intent: Enable the new feature',
      'function myFeature() {}',
    ].join('\n'));

    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('my-feature');
    expect(results[0].group).toBe('my-group');
    expect(results[0].platforms).toEqual(['web']);
    expect(results[0].intent).toBe('Enable the new feature');
    expect(results[0].prereq).toBeNull();
  });

  test('parses a @flag annotation with prereq and when', () => {
    const tmp = writeTmpFile('.kt', [
      '// @flag key=new-checkout prereq=legacy-checkout when=false platforms=android',
      '// @flag-intent: Skip new checkout until legacy is disabled',
      'fun checkout() {}',
    ].join('\n'));

    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results[0].key).toBe('new-checkout');
    expect(results[0].prereq).toBe('legacy-checkout');
    expect(results[0].when).toBe('false');
    expect(results[0].platforms).toEqual(['android']);
    expect(results[0].intent).toBe('Skip new checkout until legacy is disabled');
  });

  test('infers platform from file extension when platforms attr is absent', () => {
    const tmp = writeTmpFile('.swift', '// @flag key=ios-feature\n// @flag-intent: iOS only\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results[0].platforms).toEqual(['ios']);
  });

  test('infers android platform from .kt extension', () => {
    const tmp = writeTmpFile('.kt', '// @flag key=android-feature\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results[0].platforms).toEqual(['android']);
  });

  test('ignores lines without @flag', () => {
    const tmp = writeTmpFile('.ts', '// regular comment\nconst x = 1;\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results).toHaveLength(0);
  });

  test('ignores @flag annotations without a key', () => {
    const tmp = writeTmpFile('.ts', '// @flag group=foo platforms=web\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results).toHaveLength(0);
  });

  test('uses default when=false when when attr is absent', () => {
    const tmp = writeTmpFile('.ts', '// @flag key=my-flag prereq=other-flag\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results[0].when).toBe('false');
  });

  test('records sourceFile and sourceLine', () => {
    const tmp = writeTmpFile('.ts', 'const x = 1;\n// @flag key=tracked-flag\n');
    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results[0].sourceFile).toBe(tmp);
    expect(results[0].sourceLine).toBe(2);
  });

  test('handles multiple annotations in a single file', () => {
    const tmp = writeTmpFile('.ts', [
      '// @flag key=flag-a',
      '// @flag-intent: First flag',
      'const a = 1;',
      '// @flag key=flag-b prereq=flag-a when=true',
      '// @flag-intent: Second flag',
      'const b = 2;',
    ].join('\n'));

    const results = scanner.scanFile(tmp);
    cleanup(tmp);

    expect(results).toHaveLength(2);
    expect(results[0].key).toBe('flag-a');
    expect(results[1].key).toBe('flag-b');
    expect(results[1].prereq).toBe('flag-a');
    expect(results[1].when).toBe('true');
  });
});
