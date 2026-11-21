import {describe, expect, it} from 'vitest';
import {decideFusion, replayFusionGate} from './likely32FusionGate';

const win = {fusion: true, vector: false};
const loss = {fusion: false, vector: true};
const tie = {fusion: true, vector: true};

describe('Qwen fusion gate', () => {
  it('requires a full window, enough disagreements and 60% smoothed support', () => {
    const ties = (count: number) => Array.from({length: count}, () => tie);
    expect(decideFusion([...ties(95), win, win, win, win]).enabled).toBe(false);
    expect(decideFusion([...ties(97), win, win, win]).enabled).toBe(false);
    expect(decideFusion([...ties(96), win, win, loss, loss]).enabled).toBe(false);
    expect(decideFusion([...ties(96), win, win, win, loss])).toMatchObject({gains: 3, losses: 1, enabled: true});
  });

  it('excludes the result of the predicted draw and expires evidence outside the rolling window', () => {
    const earlier = [win, win, win, loss, ...Array.from({length: 96}, () => tie)];
    expect(replayFusionGate([...earlier, loss]).rows.at(-1)).toMatchObject({enabled: true, hit: false});
    expect(replayFusionGate([...earlier, win]).rows.at(-1)).toMatchObject({enabled: true, hit: true});
    expect(replayFusionGate([...earlier, loss]).current).toMatchObject({gains: 2, losses: 2, enabled: false});
  });
});
