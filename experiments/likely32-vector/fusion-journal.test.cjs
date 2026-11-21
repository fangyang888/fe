const assert = require('node:assert/strict');
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {test} = require('node:test');
const {updateFusionJournal} = require('./fusion-journal.cjs');

test('keeps the first confirmed forecast and scores only its immediate successor', async t => {
  const root = await mkdtemp(join(tmpdir(), 'likely32-ledger-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const start = {year: 2026, No: 323, numbers: [1, 2, 3, 4, 5, 6, 7]};
  const next = {year: 2026, No: 324, numbers: [2, 3, 4, 5, 6, 7, 1]};
  const subsequent = {year: 2026, No: 325, numbers: [1, 2, 3, 4, 5, 6, 33]};
  const included = Array.from({length: 32}, (_, index) => index + 1);
  const excluded = Array.from({length: 32}, (_, index) => index + 2);
  const settings = {root, model: 'fixture', version: 'v1', history: [start], confirmation: [start],
    current: {after: {year: 2026, No: 323}, picks: included, enabled: true}, baseline: excluded};

  const stale = await updateFusionJournal({...settings, confirmation: [start, next]});
  assert.equal(stale.pending, 0);
  const saved = await updateFusionJournal(settings);
  const duplicate = await updateFusionJournal({...settings, current: {...settings.current, picks: excluded}});
  assert.equal(saved.pending, 1);
  assert.equal(duplicate.pending, 1);
  assert.deepEqual(duplicate.latest, saved.latest);

  const settled = {...settings, history: [start, next, subsequent], confirmation: null, current: null};
  const unavailable = await updateFusionJournal(settled);
  assert.equal(unavailable.timingUnknown, 1);
  assert.equal(unavailable.count, 0);
  const arrival = new Date(Date.parse(saved.latest.recordedAt) + 1_000).toISOString();
  const scored = await updateFusionJournal({...settled, sourceRows: [{...next, created_at: arrival}]});
  assert.deepEqual([scored.count, scored.gated, scored.vector, scored.gains, scored.losses], [1, 1, 0, 1, 0]);
  const late = await updateFusionJournal({...settled, sourceRows: [{...next, created_at: saved.latest.recordedAt}]});
  assert.equal(late.late, 1);
  assert.equal(late.count, 0);
  const revised = await updateFusionJournal({...settled, history: [{...start, numbers: next.numbers}, next]});
  assert.equal(revised.historyChanged, 1);
  assert.equal(revised.count, 0);
});
