import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DualLinearLedgerService } from './dual-linear-ledger.service';

describe('DualLinearLedgerService', () => {
  let directory: string;
  let original: string | undefined;
  beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'dual-ledger-')); original = process.env.DUAL_LINEAR_LEDGER_DIR; process.env.DUAL_LINEAR_LEDGER_DIR = directory; });
  afterEach(async () => { if (original === undefined) delete process.env.DUAL_LINEAR_LEDGER_DIR; else process.env.DUAL_LINEAR_LEDGER_DIR = original; await fs.rm(directory, { recursive: true, force: true }); });
  const draw = (No: number, numbers = [1,2,3,4,5,6,7]) => ({ year:2026,No,numbers });
  const next = (No: number, number = 1) => ({ target:{year:2026,No}, algorithms:['L14','L100','D2','W2'].map(key=>({key,prediction:{number,selectedBase:'L14'}})) });
  it('starts with no settled sample and keeps predictions unchanged on concurrent refresh or restart', async () => {
    const ledger = new DualLinearLedgerService();
    await ledger.observe([draw(243)],next(244));
    await Promise.all([ledger.observe([draw(243)],next(244,49)),new DualLinearLedgerService().observe([draw(243)],next(244,48))]);
    const state=await ledger.observe([draw(243)]);
    expect(state.start).toEqual({year:2026,No:244});
    expect(state.algorithms[0]).toMatchObject({count:0,pendingCount:1,rows:[{number:1,success:null}]});
  });
  it('settles saved predictions only, separates special misses, preserves first settlement on corrections', async () => {
    const ledger=new DualLinearLedgerService();
    await ledger.observe([draw(243)],next(244));
    const state=await ledger.observe([draw(243),draw(244),draw(245)],next(246));
    expect(state.algorithms[0]).toMatchObject({count:1,successCount:0,specialCodeMissCount:1,pendingCount:1});
    const corrected=await ledger.observe([draw(243),draw(244,[8,9,10,11,12,13,1])]);
    expect(corrected.algorithms[0]).toMatchObject({count:1,specialCodeMissCount:1});
    expect(corrected.algorithms[0].rows.find(r=>r.target.No===244)?.revised).toBe(true);
  });
  it('does not backfill an already known draw or count special hits as misses', async () => {
    const ledger=new DualLinearLedgerService();
    expect((await ledger.observe([draw(243)],next(243))).start).toBe(null);
    await ledger.observe([draw(243)],next(244,7));
    expect((await ledger.observe([draw(243),draw(244)])).algorithms[0]).toMatchObject({count:1,successCount:0,specialCodeMissCount:0});
  });
});
