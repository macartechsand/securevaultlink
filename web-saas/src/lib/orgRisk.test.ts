import { describe, expect, it } from 'vitest';
import { type RiskInput, memberRisk, orgActions, orgSummary, riskCsv } from './orgRisk';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const base: RiskInput = {
  email: 'ana@acme.test',
  role: 'member',
  mfa: true,
  has_vault: true,
  recovery: true,
  reported_at: '2026-11-12T12:00:00Z',
  last_sign_in_at: null,
  score: 92,
  items: 30,
  weak: 0,
  reused: 0,
  exposed: 0,
  rotation_due: 0,
  unsafe_sites: 0,
};

describe('company risk panel', () => {
  it('levels: exposed is critical, no MFA is high, weak is medium, clean is low', () => {
    expect(memberRisk({ ...base, exposed: 1 }, NOW).level).toBe('critical');
    expect(memberRisk({ ...base, mfa: false }, NOW).level).toBe('high');
    expect(memberRisk({ ...base, weak: 2, score: 85 }, NOW).level).toBe('medium');
    expect(memberRisk(base, NOW)).toEqual({ level: 'low', reasons: [] });
  });

  it('no vault or no report is unknown, stale report is flagged', () => {
    expect(memberRisk({ ...base, has_vault: false }, NOW).level).toBe('unknown');
    expect(memberRisk({ ...base, score: null, reported_at: null }, NOW).level).toBe('unknown');
    expect(memberRisk({ ...base, reported_at: '2026-10-01T00:00:00Z' }, NOW).reasons.join()).toMatch(/14 dias/);
  });

  it('summary and prioritised actions', () => {
    const rows = [base, { ...base, email: 'b', mfa: false, exposed: 2, score: 50 }, { ...base, email: 'c', score: null, reported_at: null }];
    const s = orgSummary(rows, NOW);
    expect(s).toMatchObject({ members: 3, averageScore: 71, mfaPercent: 67, exposed: 2, critical: 1, unknown: 1 });
    const actions = orgActions(rows, NOW);
    expect(actions[0]).toMatch(/2 senha\(s\) vazada/);
    expect(actions.some((a) => a.includes('MFA'))).toBe(true);
  });

  it('CSV neutralises formulas in e-mails', () => {
    const csv = riskCsv([{ ...base, email: '=HYPERLINK("x")' }], NOW);
    expect(csv.split('\r\n')[1].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});
