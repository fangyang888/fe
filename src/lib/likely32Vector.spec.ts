import {describe, expect, it} from 'vitest';
import {createVectorState, numberContext, updateVectorState, vectorPrediction} from './likely32Vector';

describe('vector evidence gate', () => {
  it('switches on after realized gains and off after losses without learning during prediction', () => {
    const order = Array.from({length: 49}, (_, i) => i + 1);
    const items = order.map(n => ({n, miss: n % 8, ratio: n / 20}));
    const history = Array.from({length: 200}, (_, i) => ({year: 2026, No: i + 1, numbers: [2, 3, 4, 5, 6, 7, 49]}));
    const state = createVectorState(), context = numberContext(history, items, order);
    expect(context).toHaveLength(343);
    expect(context.reduce((s, n) => s + n * n, 0)).toBeCloseTo(1);
    expect(vectorPrediction(history, items, order, state).details.guardActive).toBe(false);
    for (const row of history) updateVectorState(state, context, row, order.slice(0, 32), order.slice(17));
    const before = structuredClone(state);
    expect(vectorPrediction(history, items, order, state).details.guardActive).toBe(true);
    expect(state).toEqual(before);
    for (let i = 0; i < 200; i++) updateVectorState(state, context, {year: 2027, No: i + 1, numbers: [2, 3, 4, 5, 6, 7, 1]}, order.slice(0, 32), order.slice(17));
    const decision = vectorPrediction(history, items, order, state);
    expect(decision.details.guardActive).toBe(false);
    expect(decision.guardedPicks).toEqual(order.slice(0, 32));
  });
});
