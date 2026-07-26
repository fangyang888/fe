import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'special-code-tracker-v1';
const FORUM_URL = 'https://ymhvqps.j3qbv-clrlq-nxeepy.work:17455/';
const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const ZODIAC_NUMBERS_2026 = {
  鼠: [7, 19, 31, 43],
  牛: [6, 18, 30, 42],
  虎: [5, 17, 29, 41],
  兔: [4, 16, 28, 40],
  龙: [3, 15, 27, 39],
  蛇: [2, 14, 26, 38],
  马: [1, 13, 25, 37, 49],
  羊: [12, 24, 36, 48],
  猴: [11, 23, 35, 47],
  鸡: [10, 22, 34, 46],
  狗: [9, 21, 33, 45],
  猪: [8, 20, 32, 44],
};

const INITIAL_RECORDS = [
  {
    issue: 207,
    createdAt: '2026-07-26',
    latestKnown: 47,
    primary: 38,
    keyNumbers: [38, 25, 9],
    extendedNumbers: [38, 25, 9, 26, 3, 15],
    tails: [8, 5, 9],
    zodiacPrimary: '羊',
    zodiacKey: ['羊', '蛇', '龙'],
    zodiacExtended: ['羊', '蛇', '龙', '猪', '鸡', '鼠'],
    actual: null,
    source: '特别码与生肖分别统计，最后展示交集',
  },
];

const SIGNALS = [
  { name: '论坛聚合焦点', numbers: [38], note: '多个资料组重复出现' },
  { name: '五期八码', numbers: [2, 9, 13, 23, 25, 38, 44, 45], note: '覆盖 205–209 期' },
  { name: '九码资料', numbers: [9, 33, 45, 14, 26, 38, 10, 22, 34], note: '近期样本未显示额外优势' },
  { name: '滚动十码', numbers: [47, 38, 34, 35, 17, 12, 20, 4, 22, 11], note: '覆盖 206–210 期' },
];

const ZODIAC_SIGNALS = [
  { zodiac: '羊', count: 14 },
  { zodiac: '蛇', count: 12 },
  { zodiac: '龙', count: 12 },
  { zodiac: '猪', count: 11 },
  { zodiac: '鸡', count: 10 },
  { zodiac: '鼠', count: 10 },
];

const parseNumbers = (value) =>
  [...new Set(
    String(value)
      .split(/[\s,，、./]+/)
      .map(Number)
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 49),
  )];

const parseTails = (value) =>
  [...new Set(
    String(value)
      .split(/[\s,，、./]+/)
      .map(Number)
      .filter((number) => Number.isInteger(number) && number >= 0 && number <= 9),
  )];

const parseZodiacs = (value) =>
  [...new Set(String(value).match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g) || [])];

const formatNumbers = (numbers) =>
  numbers.map((number) => String(number).padStart(2, '0')).join(' · ');

const zodiacOf = (number) =>
  ZODIACS.find((zodiac) => ZODIAC_NUMBERS_2026[zodiac].includes(number)) || '';

const numbersForZodiacs = (zodiacs) =>
  [...new Set(zodiacs.flatMap((zodiac) => ZODIAC_NUMBERS_2026[zodiac] || []))];

const intersection = (numbers, candidates) =>
  numbers.filter((number) => candidates.includes(number));

const loadRecords = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(stored) || !stored.length) return INITIAL_RECORDS;
    return stored.map((record) => {
      if (record.issue !== 207 || record.zodiacPrimary) return record;
      return {
        ...record,
        zodiacPrimary: '羊',
        zodiacKey: ['羊', '蛇', '龙'],
        zodiacExtended: ['羊', '蛇', '龙', '猪', '鸡', '鼠'],
      };
    });
  } catch {
    return INITIAL_RECORDS;
  }
};

const saveRecords = (records) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return records;
};

const hitLabel = (record) => {
  if (!record.actual) return { text: '待开奖', className: 'is-pending' };
  if (record.primary === record.actual) return { text: '主码命中', className: 'is-primary-hit' };
  if (record.keyNumbers.includes(record.actual)) return { text: '三码命中', className: 'is-hit' };
  if (record.extendedNumbers.includes(record.actual)) return { text: '六码命中', className: 'is-hit' };
  return { text: '未命中', className: 'is-miss' };
};

const zodiacHitLabel = (record) => {
  if (!record.actual) return { text: '生肖待开奖', className: 'is-pending' };
  const actualZodiac = zodiacOf(record.actual);
  if (record.zodiacPrimary === actualZodiac) return { text: '主肖命中', className: 'is-primary-hit' };
  if (record.zodiacKey?.includes(actualZodiac)) return { text: '三肖命中', className: 'is-hit' };
  if (record.zodiacExtended?.includes(actualZodiac)) return { text: '六肖命中', className: 'is-hit' };
  return { text: '生肖未中', className: 'is-miss' };
};

const rate = (hits, total) => (total ? `${((hits / total) * 100).toFixed(1)}%` : '--');

export default function SpecialCodeTracker() {
  const [records, setRecords] = useState(loadRecords);
  const [resultInputs, setResultInputs] = useState({});
  const [showForm, setShowForm] = useState(false);
  const nextIssue = Math.max(...records.map((record) => record.issue), 206) + 1;
  const [draft, setDraft] = useState({
    issue: nextIssue,
    primary: '',
    keyNumbers: '',
    extendedNumbers: '',
    tails: '',
    zodiacPrimary: '',
    zodiacKey: '',
    zodiacExtended: '',
    source: '人工记录',
  });
  const [formError, setFormError] = useState('');

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.issue - a.issue),
    [records],
  );

  const stats = useMemo(() => {
    const settled = records.filter((record) => Number.isInteger(record.actual));
    return {
      tracked: records.length,
      settled: settled.length,
      primaryHits: settled.filter((record) => record.primary === record.actual).length,
      keyHits: settled.filter((record) => record.keyNumbers.includes(record.actual)).length,
      extendedHits: settled.filter((record) => record.extendedNumbers.includes(record.actual)).length,
      zodiacPrimaryHits: settled.filter(
        (record) => record.zodiacPrimary === zodiacOf(record.actual),
      ).length,
      zodiacKeyHits: settled.filter(
        (record) => record.zodiacKey?.includes(zodiacOf(record.actual)),
      ).length,
      zodiacExtendedHits: settled.filter(
        (record) => record.zodiacExtended?.includes(zodiacOf(record.actual)),
      ).length,
    };
  }, [records]);

  const recordResult = (issue) => {
    const actual = Number(resultInputs[issue]);
    if (!Number.isInteger(actual) || actual < 1 || actual > 49) return;
    setRecords((current) =>
      saveRecords(current.map((record) => (record.issue === issue ? { ...record, actual } : record))),
    );
    setResultInputs((current) => ({ ...current, [issue]: '' }));
  };

  const addPrediction = (event) => {
    event.preventDefault();
    const issue = Number(draft.issue);
    const primary = Number(draft.primary);
    const keyNumbers = parseNumbers(draft.keyNumbers);
    const extendedNumbers = parseNumbers(draft.extendedNumbers);
    const tails = parseTails(draft.tails);
    const zodiacPrimary = parseZodiacs(draft.zodiacPrimary)[0];
    const zodiacKey = parseZodiacs(draft.zodiacKey);
    const zodiacExtended = parseZodiacs(draft.zodiacExtended);

    if (!Number.isInteger(issue) || issue < 1 || records.some((record) => record.issue === issue)) {
      setFormError('期号无效或已经存在。');
      return;
    }
    if (!Number.isInteger(primary) || primary < 1 || primary > 49) {
      setFormError('主码请输入 1–49 之间的一个号码。');
      return;
    }
    if (keyNumbers.length !== 3 || extendedNumbers.length !== 6) {
      setFormError('重点号码需要 3 个，扩展号码需要 6 个。');
      return;
    }
    if (!zodiacPrimary || zodiacKey.length !== 3 || zodiacExtended.length !== 6) {
      setFormError('主肖需要 1 个，重点生肖需要 3 个，扩展生肖需要 6 个。');
      return;
    }

    const newRecord = {
      issue,
      createdAt: new Date().toISOString().slice(0, 10),
      latestKnown: null,
      primary,
      keyNumbers,
      extendedNumbers,
      tails,
      zodiacPrimary,
      zodiacKey,
      zodiacExtended,
      actual: null,
      source: draft.source.trim() || '人工记录',
    };
    setRecords((current) => saveRecords([...current, newRecord]));
    setDraft({
      issue: issue + 1,
      primary: '',
      keyNumbers: '',
      extendedNumbers: '',
      tails: '',
      zodiacPrimary: '',
      zodiacKey: '',
      zodiacExtended: '',
      source: '人工记录',
    });
    setFormError('');
    setShowForm(false);
  };

  return (
    <main className="code-tracker-page">
      <header className="code-tracker-hero">
        <div>
          <p className="code-tracker-eyebrow">澳门特别码 · 独立留痕</p>
          <h1>预测跟踪台</h1>
          <p>
            先记录预测，开奖后只填写结果。用真实累计表现判断资料价值，不用单期命中替代长期概率。
          </p>
        </div>
        <button className="code-tracker-add" type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? '收起新增' : '新增一期预测'}
        </button>
      </header>

      <section className="code-tracker-stats" aria-label="累计统计">
        <article>
          <span>已跟踪</span>
          <strong>{stats.tracked}</strong>
          <small>期预测</small>
        </article>
        <article>
          <span>已开奖</span>
          <strong>{stats.settled}</strong>
          <small>期待验证</small>
        </article>
        <article>
          <span>主码命中率</span>
          <strong>{rate(stats.primaryHits, stats.settled)}</strong>
          <small>{stats.primaryHits} / {stats.settled}</small>
        </article>
        <article>
          <span>三码命中率</span>
          <strong>{rate(stats.keyHits, stats.settled)}</strong>
          <small>{stats.keyHits} / {stats.settled}</small>
        </article>
        <article>
          <span>六码命中率</span>
          <strong>{rate(stats.extendedHits, stats.settled)}</strong>
          <small>{stats.extendedHits} / {stats.settled}</small>
        </article>
        <article>
          <span>独立主肖命中率</span>
          <strong>{rate(stats.zodiacPrimaryHits, stats.settled)}</strong>
          <small>{stats.zodiacPrimaryHits} / {stats.settled}</small>
        </article>
        <article>
          <span>独立三肖命中率</span>
          <strong>{rate(stats.zodiacKeyHits, stats.settled)}</strong>
          <small>{stats.zodiacKeyHits} / {stats.settled}</small>
        </article>
        <article>
          <span>独立六肖命中率</span>
          <strong>{rate(stats.zodiacExtendedHits, stats.settled)}</strong>
          <small>{stats.zodiacExtendedHits} / {stats.settled}</small>
        </article>
      </section>

      {showForm && (
        <form className="code-tracker-form" onSubmit={addPrediction}>
          <div className="code-tracker-section-head">
            <div>
              <span>建立预测快照</span>
              <h2>新增一期</h2>
            </div>
            <small>保存后预测号码不在结果区修改</small>
          </div>
          <div className="code-tracker-fields">
            <label>
              期号
              <input
                type="number"
                min="1"
                value={draft.issue}
                onChange={(event) => setDraft({ ...draft, issue: event.target.value })}
              />
            </label>
            <label>
              主码
              <input
                type="number"
                min="1"
                max="49"
                placeholder="例如 38"
                value={draft.primary}
                onChange={(event) => setDraft({ ...draft, primary: event.target.value })}
              />
            </label>
            <label>
              重点三码
              <input
                placeholder="38 25 09"
                value={draft.keyNumbers}
                onChange={(event) => setDraft({ ...draft, keyNumbers: event.target.value })}
              />
            </label>
            <label>
              扩展六码
              <input
                placeholder="38 25 09 26 03 15"
                value={draft.extendedNumbers}
                onChange={(event) => setDraft({ ...draft, extendedNumbers: event.target.value })}
              />
            </label>
            <label>
              参考尾数
              <input
                placeholder="8 5 9"
                value={draft.tails}
                onChange={(event) => setDraft({ ...draft, tails: event.target.value })}
              />
            </label>
            <label>
              独立主肖
              <input
                placeholder="例如 羊"
                value={draft.zodiacPrimary}
                onChange={(event) => setDraft({ ...draft, zodiacPrimary: event.target.value })}
              />
            </label>
            <label>
              独立重点三肖
              <input
                placeholder="羊 蛇 龙"
                value={draft.zodiacKey}
                onChange={(event) => setDraft({ ...draft, zodiacKey: event.target.value })}
              />
            </label>
            <label>
              独立扩展六肖
              <input
                placeholder="羊 蛇 龙 猪 鸡 鼠"
                value={draft.zodiacExtended}
                onChange={(event) => setDraft({ ...draft, zodiacExtended: event.target.value })}
              />
            </label>
            <label>
              来源说明
              <input
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              />
            </label>
          </div>
          {formError && <p className="code-tracker-form-error">{formError}</p>}
          <button className="code-tracker-submit" type="submit">保存预测快照</button>
        </form>
      )}

      <section className="code-tracker-layout">
        <div className="code-tracker-records">
          <div className="code-tracker-section-head">
            <div>
              <span>逐期验证</span>
              <h2>跟踪记录</h2>
            </div>
            <small>数据保存在当前设备</small>
          </div>

          {sortedRecords.map((record) => {
            const result = hitLabel(record);
            const zodiacResult = zodiacHitLabel(record);
            const primaryOverlap = intersection(
              record.extendedNumbers,
              numbersForZodiacs([record.zodiacPrimary]),
            );
            const keyOverlap = intersection(
              record.extendedNumbers,
              numbersForZodiacs(record.zodiacKey || []),
            );
            return (
              <article className="code-tracker-record" key={record.issue}>
                <div className="code-tracker-record-top">
                  <div>
                    <span>澳门第</span>
                    <strong>{String(record.issue).padStart(3, '0')}</strong>
                    <span>期</span>
                  </div>
                  <div className="code-tracker-badges">
                    <span className={`code-tracker-badge ${result.className}`}>号码：{result.text}</span>
                    <span className={`code-tracker-badge ${zodiacResult.className}`}>{zodiacResult.text}</span>
                  </div>
                </div>

                <div className="code-tracker-primary">
                  <span>主推特别码</span>
                  <strong>{String(record.primary).padStart(2, '0')}</strong>
                  <small>{record.primary % 10} 尾</small>
                </div>

                <dl className="code-tracker-picks">
                  <div>
                    <dt>重点三码</dt>
                    <dd>{formatNumbers(record.keyNumbers)}</dd>
                  </div>
                  <div>
                    <dt>扩展六码</dt>
                    <dd>{formatNumbers(record.extendedNumbers)}</dd>
                  </div>
                  <div>
                    <dt>尾数参考</dt>
                    <dd>{record.tails.length ? record.tails.join(' · ') : '未记录'}</dd>
                  </div>
                </dl>

                <div className="code-tracker-zodiac">
                  <div className="code-tracker-zodiac-primary">
                    <span>独立主肖</span>
                    <strong>{record.zodiacPrimary || '—'}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>重点三肖</dt>
                      <dd>{record.zodiacKey?.join(' · ') || '未记录'}</dd>
                    </div>
                    <div>
                      <dt>扩展六肖</dt>
                      <dd>{record.zodiacExtended?.join(' · ') || '未记录'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="code-tracker-overlap">
                  <span>两个模型独立交叉</span>
                  <div>
                    <small>主肖 ∩ 扩展六码</small>
                    <strong>{primaryOverlap.length ? formatNumbers(primaryOverlap) : '无重叠'}</strong>
                  </div>
                  <div>
                    <small>重点三肖 ∩ 扩展六码</small>
                    <strong>{keyOverlap.length ? formatNumbers(keyOverlap) : '无重叠'}</strong>
                  </div>
                </div>

                <div className="code-tracker-meta">
                  <span>记录于 {record.createdAt}</span>
                  <span>{record.source}</span>
                </div>

                {record.actual ? (
                  <div className="code-tracker-actual">
                    <span>实际特别号</span>
                    <strong>{String(record.actual).padStart(2, '0')}</strong>
                    <b>{zodiacOf(record.actual)}肖</b>
                  </div>
                ) : (
                  <div className="code-tracker-result-form">
                    <label htmlFor={`actual-${record.issue}`}>开奖后录入特别号</label>
                    <div>
                      <input
                        id={`actual-${record.issue}`}
                        type="number"
                        min="1"
                        max="49"
                        placeholder="1–49"
                        value={resultInputs[record.issue] || ''}
                        onChange={(event) =>
                          setResultInputs({ ...resultInputs, [record.issue]: event.target.value })
                        }
                      />
                      <button type="button" onClick={() => recordResult(record.issue)}>确认结果</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className="code-tracker-evidence">
          <div className="code-tracker-section-head">
            <div>
              <span>第 207 期资料</span>
              <h2>信号拆解</h2>
            </div>
          </div>
          <div className="code-tracker-signal-list">
            {SIGNALS.map((signal) => (
              <div className="code-tracker-signal" key={signal.name}>
                <span>{signal.name}</span>
                <strong>{formatNumbers(signal.numbers)}</strong>
                <small>{signal.note}</small>
              </div>
            ))}
          </div>
          <div className="code-tracker-section-head code-tracker-zodiac-head">
            <div>
              <span>独立生肖统计</span>
              <h2>去重后出现次数</h2>
            </div>
            <small>共 26 组资料</small>
          </div>
          <div className="code-tracker-zodiac-ranking">
            {ZODIAC_SIGNALS.map((signal, index) => (
              <div key={signal.zodiac}>
                <span>{index + 1}</span>
                <strong>{signal.zodiac}</strong>
                <small>{signal.count} / 26</small>
              </div>
            ))}
          </div>
          <div className="code-tracker-warning">
            <strong>真实性检查</strong>
            <p>
              生肖与特别码分别统计，生肖结果没有使用主码 38 作为输入。多个不同标题的帖子仍可能来自同一站点，不能当成完全独立的共识。
            </p>
          </div>
          <a className="code-tracker-source" href={FORUM_URL} target="_blank" rel="noreferrer">
            查看原始资料站
          </a>
        </aside>
      </section>
    </main>
  );
}
