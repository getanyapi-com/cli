import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const skillsDir = join(process.cwd(), 'skills');

function readSkill(name: string): string {
  return readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
}

describe('bundled agent skills', () => {
  it('document the current discovery, execution, and onboarding commands', () => {
    const discover = readSkill('anyapi-discover');
    expect(discover).toContain('anyapi search <query>');
    expect(discover).toContain('anyapi list --category <cat>');
    expect(discover).toContain('anyapi describe <sku>');
    expect(discover).toContain('dedicated ranked discovery search');
    expect(discover).toContain('nested under `pricing`');
    expect(discover).toContain('`pricing.from`');
    expect(discover).toContain('`pricing.failoverMaxUsd`');

    const onboarding = readSkill('anyapi-onboarding');
    expect(onboarding).toContain('npx -y anyapi-cli@latest init');
    expect(onboarding).toContain('anyapi signup --label agent');
    expect(onboarding).toContain('anyapi connect');

    const run = readSkill('anyapi-run');
    expect(run).toContain('anyapi run reddit.search --input');
    expect(run).toContain('anyapi view --last');
    expect(run).toContain('costUsd');
  });

  it('contains no legacy discovery commands, flat price aliases, or credit fields', () => {
    const forbidden = [
      /fromCredits/i,
      /perItemCredits/i,
      /priceUsd/i,
      /catalog\?query/i,
      /apis\?query/i,
      /list_apis[^\n]*\bquery\b/i,
      /["'`]\w*credit\w*["'`]\s*:/i,
    ];

    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skill = readSkill(entry.name);
      for (const pattern of forbidden) {
        expect(skill, `${entry.name} contains ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
