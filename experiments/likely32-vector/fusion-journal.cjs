const {createHash, randomUUID} = require('node:crypto');
const {link, mkdir, readFile, readdir, unlink, writeFile} = require('node:fs/promises');
const {join} = require('node:path');

const issueKey = ({year, No}) => `${year}-${No}`;
const validPicks = picks => Array.isArray(picks) && picks.length === 32 && new Set(picks).size === 32
  && picks.every(number => Number.isInteger(number) && number >= 1 && number <= 49);

function indexHistory(history) {
  const digest = createHash('sha256');
  return new Map(history.map((row, index) => {
    digest.update(JSON.stringify([row.year, row.No, row.numbers]));
    return [issueKey(row), {index, digest: digest.copy().digest('hex')}];
  }));
}

async function saveFirst(dir, snapshot) {
  const path = join(dir, `${issueKey(snapshot.after)}.json`);
  const temporary = join(dir, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2), {flag: 'wx', mode: 0o600});
  try {
    await link(temporary, path);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await unlink(temporary);
  }
}

async function updateFusionJournal({root, model, version, history, sourceRows, confirmation, current, baseline}) {
  const track = createHash('sha256').update(JSON.stringify([version, model])).digest('hex');
  const dir = join(root, track);
  await mkdir(dir, {recursive: true});
  const index = indexHistory(history);
  if (current?.picks && confirmation?.length === history.length) {
    const key = issueKey(current.after), entry = index.get(key);
    const confirmed = indexHistory(confirmation).get(key);
    if (entry?.index === history.length - 1 && confirmed?.index === confirmation.length - 1 && entry.digest === confirmed.digest) {
      if (!validPicks(current.picks) || !validPicks(baseline)) throw new Error('留档号码校验失败');
      await saveFirst(dir, {version, model, after: current.after, digest: entry.digest,
        recordedAt: new Date().toISOString(), enabled: current.enabled, picks: current.picks, baseline});
    }
  }

  const importedAt = new Map((sourceRows ?? []).map(row => [issueKey(row), Date.parse(row.created_at)]));
  const summaries = {count: 0, gated: 0, vector: 0, gains: 0, losses: 0,
    pending: 0, late: 0, timingUnknown: 0, historyChanged: 0, currentPending: false, latest: null};
  const files = (await readdir(dir)).filter(name => /^\d{4}-\d+\.json$/.test(name));
  for (const name of files) {
    const record = JSON.parse(await readFile(join(dir, name), 'utf8'));
    const recordedAt = Date.parse(record.recordedAt);
    if (record.version !== version || record.model !== model || name !== `${issueKey(record.after)}.json`
        || !Number.isFinite(recordedAt) || !validPicks(record.picks) || !validPicks(record.baseline)) {
      throw new Error('融合预测留档校验失败');
    }
    if (!summaries.latest || recordedAt > Date.parse(summaries.latest.recordedAt)) {
      summaries.latest = {after: record.after, recordedAt: record.recordedAt};
    }
    const entry = index.get(issueKey(record.after));
    if (entry?.digest !== record.digest) {
      summaries.historyChanged++;
      continue;
    }
    const actual = history[entry.index + 1];
    if (!actual) {
      summaries.pending++;
      if (current?.picks && issueKey(current.after) === issueKey(record.after)
          && current.enabled === record.enabled && current.picks.every((number, index) => number === record.picks[index])) {
        summaries.currentPending = true;
      }
      continue;
    }
    const arrival = importedAt.get(issueKey(actual));
    if (!Number.isFinite(arrival)) {
      summaries.timingUnknown++;
      continue;
    }
    if (recordedAt >= arrival) {
      summaries.late++;
      continue;
    }
    const special = actual.numbers[6];
    const hit = record.picks.includes(special), baselineHit = record.baseline.includes(special);
    summaries.count++;
    summaries.gated += Number(hit);
    summaries.vector += Number(baselineHit);
    summaries.gains += Number(hit && !baselineHit);
    summaries.losses += Number(!hit && baselineHit);
  }
  return summaries;
}

module.exports = {updateFusionJournal};
