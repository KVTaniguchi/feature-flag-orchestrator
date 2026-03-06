const fs = require('fs');
const path = require('path');

describe('Kill Switch Protocol Configuration', () => {
    let skillContent;

    beforeAll(() => {
        const filePath = path.join(__dirname, '../skills/kill-switch-protocol.md');
        skillContent = fs.readFileSync(filePath, 'utf8');
    });

    test('should define a trigger for disabling flags', () => {
        expect(skillContent).toMatch(/\*\*Trigger:\*\*.*"kill".*"disable".*"turn off"/i);
    });

    test('should require a blast radius assessment', () => {
        expect(skillContent).toContain('1. **Assess Blast Radius:**');
        expect(skillContent).toContain('`flags.yml` manifest');
    });

    test('should enforce a pre-flight health check', () => {
        expect(skillContent).toContain('2. **Pre-flight Health Check:**');
        expect(skillContent).toContain('`datadog-correlator`');
    });

    test('should require user confirmation before execution', () => {
        expect(skillContent).toContain('3. **Require Confirmation:**');
        expect(skillContent).toContain('Type Y to confirm');
    });

    test('should mandate the use of LaunchDarkly MCP for execution', () => {
        expect(skillContent).toContain('4. **Execute via LaunchDarkly MCP:**');
        expect(skillContent).toContain('ONLY after receiving a "Y"');
    });

    test('should include a verification and reporting step', () => {
        expect(skillContent).toContain('5. **Verify and Report:**');
    });
});
