import { describe, expect, it } from 'vitest';
import { mergeHealth } from '../compatibility/merge.js';

const rule = (id: string, status: string, explanation = `rule says ${status}`) => ({ id, aId: 'a', bId: 'b', aName: 'A', bName: 'B', status, explanation, check: 'rules' });
const report = (pairs: any[]) => ({ pairs, totals: { compatible: 0, incompatible: 0, unknown: 0 }, checked: pairs.length, parts: 2 });
const agent = (id: string, status: string, extra: any = {}) => ({ id, status, explanation: `agent says ${status}`, agentUsed: true, assessmentState: 'assessed', failure: null, ...extra });

describe('mergeHealth', () => {
  it('keeps a definite rule answer and never replaces a match', () => {
    const merged = mergeHealth(report([rule('p1', 'compatible')]), report([agent('p1', 'unknown')]));
    expect(merged.pairs[0]).toMatchObject({ status: 'compatible', explanation: 'rule says compatible' });
    expect(merged.totals).toEqual({ compatible: 1, incompatible: 0, unknown: 0 });
  });
  it('fills an unverified pair with the agent verdict and its next step', () => {
    const merged = mergeHealth(report([rule('p1', 'unknown')]), report([agent('p1', 'unknown', { bestNextStep: 'Find the bolt pattern.' })]));
    expect(merged.pairs[0].explanation).toContain('agent says unknown');
    expect(merged.pairs[0].explanation).toContain('Suggested next step: Find the bolt pattern.');
    const resolved = mergeHealth(report([rule('p1', 'unknown')]), report([agent('p1', 'compatible')]));
    expect(resolved.pairs[0].status).toBe('compatible');
    expect(resolved.totals.unknown).toBe(0);
  });
  it('adds a replacement to a conflict without changing its verdict', () => {
    const merged = mergeHealth(report([rule('p1', 'incompatible')]), report([agent('p1', 'incompatible', { alternatives: { adapterOptions: [{ name: '8mm to 14mm hub', priceUsd: 6.99 }] } })]));
    expect(merged.pairs[0].status).toBe('incompatible');
    expect(merged.pairs[0].explanation).toContain('Possible fix: 8mm to 14mm hub ($6.99).');
  });
  it('lets a conflict found by the agent win over a rule match', () => {
    const merged = mergeHealth(report([rule('p1', 'compatible')]), report([agent('p1', 'incompatible')]));
    expect(merged.pairs[0].status).toBe('incompatible');
  });
  it('ignores pending, failed and unverified agent answers', () => {
    for (const bad of [{ assessmentState: 'pending', agentUsed: false }, { assessmentState: 'unavailable', agentUsed: false, failure: { code: 'x' } }, { assessmentState: 'unverified', agentUsed: false }]) {
      const merged = mergeHealth(report([rule('p1', 'unknown')]), report([agent('p1', 'compatible', bad)]));
      expect(merged.pairs[0]).toMatchObject({ status: 'unknown', explanation: 'rule says unknown' });
    }
  });
  it('returns the rule report untouched when Elastic gave nothing', () => {
    const base = report([rule('p1', 'unknown')]);
    expect(mergeHealth(base, null)).toBe(base);
  });
});
