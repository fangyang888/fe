import {
  rankBayesianPositions,
  rankRecentChampionPositions,
} from './bayesian-position-selector';

describe('rankBayesianPositions', () => {
  it('selects the position with the strongest sustained evidence', () => {
    const outcomes = Array.from({ length: 40 }, (_, index) => ({
      success: [index % 10 !== 0, true, index % 3 !== 0],
    }));

    const ranked = rankBayesianPositions(outcomes, { positionCount: 3 });

    expect(ranked[0].position).toBe(2);
    expect(ranked[0].posteriorRate).toBeGreaterThan(ranked[1].posteriorRate);
  });

  it('gives newer observations more influence than stale observations', () => {
    const outcomes = [
      ...Array.from({ length: 30 }, () => ({ success: [true, false] })),
      ...Array.from({ length: 30 }, () => ({ success: [false, true] })),
    ];

    const ranked = rankBayesianPositions(outcomes, {
      positionCount: 2,
      halfLife: 8,
    });

    expect(ranked[0].position).toBe(2);
  });

  it('uses a deterministic lower position tie-break', () => {
    const ranked = rankBayesianPositions([], { positionCount: 3 });
    expect(ranked.map((item) => item.position)).toEqual([1, 2, 3]);
  });
});

describe('rankRecentChampionPositions', () => {
  it('selects the position with the most successes in the latest ten rows', () => {
    const outcomes = Array.from({ length: 15 }, (_, index) => ({
      success: [index < 5, index !== 14, true],
    }));

    const ranked = rankRecentChampionPositions(outcomes, { positionCount: 3 });

    expect(ranked[0].position).toBe(3);
    expect(ranked[0].successes).toBe(10);
    expect(ranked[0].samples).toBe(10);
  });

  it('uses the lower position as a deterministic tie-break', () => {
    const outcomes = Array.from({ length: 10 }, () => ({
      success: [true, true],
    }));

    const ranked = rankRecentChampionPositions(outcomes, { positionCount: 2 });

    expect(ranked.map((item) => item.position)).toEqual([1, 2]);
  });

  it('does not report a perfect conservative lower bound for a 10/10 streak', () => {
    const outcomes = Array.from({ length: 10 }, () => ({ success: [true] }));
    const [ranked] = rankRecentChampionPositions(outcomes, { positionCount: 1 });

    expect(ranked.recentRate).toBe(1);
    expect(ranked.confidenceLowerBound).toBeGreaterThan(0.7);
    expect(ranked.confidenceLowerBound).toBeLessThan(0.8);
  });
});
