import { DualLinearAnchorService } from './dual-linear-anchor.service';

const history = (): Array<Record<string, number>> => Array.from({ length: 365 + 247 }, (_, i) => ({
  year: i < 365 ? 2025 : 2026, No: i < 365 ? i + 1 : i - 364,
  ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, (i + j) % 49 + 1])),
}));
const run = (rows: any[], latest = false) => new DualLinearAnchorService({ findAll: async () => rows } as any).getPrediction(latest) as Promise<any>;

describe('DualLinearAnchorService', () => {
  it('defaults to 243 and computes both next predictions using the exact source position', async () => {
    const rows = history(), result = await run(rows);
    expect(result.evaluatedThrough).toEqual({ year: 2026, No: 243 });
    expect(result.target).toEqual({ year: 2026, No: 244 });
    for (const [i, lag, position, a, b] of [[0,14,1,2,15],[1,100,7,48,0]]) {
      const source = rows[365 + 243 - lag];
      const x = source[`n${position}`];
      expect(result.algorithms[i].prediction).toMatchObject({ source: { year: source.year, No: source.No }, anchor: x, number: (a*x+b-1)%49+1 });
    }
    expect(result.algorithms[0].windows.map((w: any) => w.count)).toEqual([10,20,50,100,200]);
  });
  it('stops before missing or duplicate periods rather than shifting anchors', async () => {
    const rows = history().filter(r => !(r.year === 2026 && r.No === 244));
    const result = await run(rows, true);
    expect(result.evaluatedThrough.No).toBe(243);
    expect(result.notice).toContain('缺期');
    const full = history(); full.splice(365 + 243, 0, full[365 + 242]);
    expect((await run(full, true)).evaluatedThrough.No).toBe(243);
  });
  it('keeps earlier predictions unchanged when later data is appended', async () => {
    const rows = history();
    const past = await run(rows.slice(0,365+220),true), later = await run(rows,true);
    for (let i=0;i<4;i++) expect(later.algorithms[i].recent.find((r:any)=>r.year===2026&&r.No===221).number).toBe(past.algorithms[i].prediction.number);
  });
  it('scores only preceding outcomes, weights the previous draw by 0.5, and resolves ties to L100', async () => {
    // Constant anchors: L14 predicts 17, L100 predicts 42.
    const rows = history().slice(0,130).map(r => ({...r,n1:1,n2:2,n3:3,n4:4,n5:5,n6:6,n7:7}));
    // L14 failed two periods ago; L100 failed one period ago.
    rows[128] = {...rows[128],n2:17};
    rows[129] = {...rows[129],n2:42};
    const result = await run(rows,true);
    expect(result.algorithms.map((a:any)=>a.key)).toEqual(['L14','L100','D2','W2']);
    const [d2,w2] = result.algorithms.slice(2);
    expect(d2.prediction.evidence.map((e:any)=>e.score)).toEqual([1,1]);
    expect(w2.prediction.evidence.map((e:any)=>e.score)).toEqual([1,0.5]);
    expect(d2.prediction.selectedBase).toBe('L100');
    expect(w2.prediction.selectedBase).toBe('L100');
    // Reverse failures: weighted selection must now choose L14.
    rows[128] = {...rows[128],n2:42}; rows[129] = {...rows[129],n2:17};
    expect((await run(rows,true)).algorithms[3].prediction.selectedBase).toBe('L14');
  });
  it('handles insufficient data and next-year target', async () => {
    expect((await run(history().slice(0,50))).status).toBe('insufficient-history');
    expect((await run(history().slice(0,365),true)).target).toEqual({year:2026,No:1});
  });
});
