import { describe, expect, it } from 'vitest';
import { compose, readDescription } from '../lib/composer.js';
import { BY_SKU } from '../lib/catalog.js';

describe('readDescription', () => {
  it('reads wheels, budget, arm and size from plain English', () => {
    expect(readDescription('A 4-wheel rover that can carry 2 kg, under $250')).toMatchObject({ body: 'drive', wheels: 4, strong: true, budget: 250, arm: false });
    expect(readDescription('Rover with a servo claw arm')).toMatchObject({ arm: true });
    expect(readDescription('tiny two wheel robot')).toMatchObject({ wheels: 2, small: true });
    expect(readDescription('a little walking duck')).toMatchObject({ body: 'duck' });
  });
});

describe('compose', () => {
  it('uses only catalog parts and connects every wheel and arm', () => {
    for (const text of ['A 4-wheel rover under $250', 'Mecanum drivetrain that can strafe', 'Rover with a servo claw arm', '6 wheel truck', 'small 2 wheel bot']) {
      const design = compose(text);
      for (const part of design.parts) expect(BY_SKU[part.sku], `${text}: ${part.sku}`).toBeDefined();
      const keys = new Set(design.parts.map((p: { key: string }) => p.key));
      expect(keys.size).toBe(design.parts.length);
      for (const m of design.mates) { expect(keys.has(m.moving)).toBe(true); expect(keys.has(m.target)).toBe(true); }
    }
  });
  it('stays under a budget when a cheaper layout exists and says so when none does', () => {
    expect(compose('4 wheel rover under $400').cost).toBeLessThanOrEqual(400);
    expect(compose('4 wheel rover under $20').notes.join(' ')).toMatch(/over the \$20 budget/);
  });
  it('explains what it could not build', () => {
    expect(compose('mecanum rover').notes.join(' ')).toMatch(/omni wheels stand in/);
    expect(compose('rover with a claw').notes.join(' ')).toMatch(/no claw/i);
  });
});
