import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

interface SearchStock {
  Code: string;
  Name: string;
  QuoteID: string;
  SecurityTypeName?: string;
  Classify?: string;
}

interface KlinePoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number;
  changePercent: number;
  change: number;
  turnover: number;
}

interface FinancialRow {
  period: string;
  reportType: string;
  noticeDate: string;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  roe: number | null;
  grossMargin: number | null;
  debtRatio: number | null;
  operatingCash: number | null;
  netProfit: number | null;
  cashProfitRatio: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  accountsReceivable: number | null;
  accountsReceivableGrowth: number | null;
  goodwill: number | null;
  inventory: number | null;
}

interface AnalysisEvent {
  date: string;
  type: string;
  tone: 'positive' | 'neutral' | 'warning';
  title: string;
  detail: string;
  source: string;
  url?: string;
}

interface ScoreBreakdown {
  quality: number;
  growth: number;
  valuation: number;
  catalysts: number;
  trend: number;
  safety: number;
  riskPenalty: number;
  total: number;
}

interface HardCheck {
  label: string;
  status: 'passed' | 'failed' | 'unavailable';
  detail: string;
}

interface MarketCandidate {
  symbol: string;
  code: string;
  name: string;
  price: number;
  changePercent: number;
  amount: number;
  pe: number;
  pb: number;
  marketCap: number;
  turnover: number;
  quoteId: string;
}

interface IndustryEntry {
  industry: string;
  candidate: MarketCandidate;
}

interface IndustryHeatSignal {
  industry: string;
  score: number;
  label: string;
  averageChange: number;
  positiveRatio: number;
  sampleCount: number;
  totalAmount: number;
  totalAmountFormatted: string;
  mainNetInflow?: number;
  mainNetInflowFormatted?: string;
  mainNetRatio?: number;
  source?: 'market-board' | 'candidate-sample';
}

interface CapitalFlowSignal {
  score: number;
  label: string;
  mainNetInflow: number;
  mainNetInflowFormatted: string;
  mainNetRatio: number;
  superLargeNetInflow: number;
  largeNetInflow: number;
  available: boolean;
  flowDays: number;
  positiveDays: number;
  dataAsOf?: string;
}

interface SetupSignal {
  score: number;
  label: string;
  return5: number;
  return20: number;
  distanceToHigh60: number;
  distanceToMa20: number;
  volumeRatio: number;
  volatilityRatio: number;
}

interface IndustryRelativeSignal {
  score: number;
  label: string;
  percentile: number;
  sampleCount: number;
  industry: string;
  peerScope: 'industry' | 'market';
}

interface MarketRegimeSignal {
  score: number;
  label: '进攻' | '均衡' | '防守';
  tone: 'positive' | 'neutral' | 'warning';
  targetPickCount: number;
  indexReturn20: number;
  indexDistanceMa20: number;
  indexDistanceMa60: number;
  breadth: number;
  volatility20: number;
  dataAsOf: string;
  reason: string;
}

interface WalkForwardSummary {
  available: boolean;
  checkpoints: number;
  observations: number;
  horizonDays: number;
  averageReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  positiveRate: number;
  maxDrawdown: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  limitation: string;
}

const EASTMONEY_SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';
const FINANCE_KEYWORDS = [
  '银行',
  '证券',
  '保险',
  '信托',
  '期货',
  '多元金融',
  '货币金融',
  '资本市场服务',
];
const POSITIVE_EVENT_WORDS = [
  '增持',
  '回购',
  '预增',
  '增长',
  '分红',
  '中标',
  '签订',
  '获批',
  '盈利',
  '上调',
];
const NEGATIVE_EVENT_WORDS = [
  '减持',
  '立案',
  '处罚',
  '问询',
  '风险',
  '亏损',
  '下修',
  '诉讼',
  '终止',
  '退市',
  '减值',
];

@Injectable()
export class StockService {
  private picksCache:
    | {
        expiresAt: number;
        payload: JsonRecord;
      }
    | undefined;

  private picksPromise: Promise<JsonRecord> | undefined;

  private capitalFlowCache:
    | {
        expiresAt: number;
        signals: Map<string, CapitalFlowSignal>;
      }
    | undefined;

  async getHealth(): Promise<JsonRecord> {
    const probes = await Promise.all([
      this.probeSource(
        '新浪A股市场列表',
        'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=1&sort=amount&asc=0&node=hs_a',
        (text) => Array.isArray(JSON.parse(text)),
      ),
      this.probeSource(
        '腾讯实时行情',
        'https://qt.gtimg.cn/q=sh600519',
        (text) => text.includes('600519') && text.length > 30,
      ),
      this.probeSource(
        '东方财富证券搜索',
        `http://searchapi.eastmoney.com/api/suggest/get?input=600519&type=14&token=${EASTMONEY_SEARCH_TOKEN}&count=1`,
        (text) => text.includes('600519'),
      ),
    ]);

    return {
      status: probes.every((item) => item.status === 'ok') ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'stock-api',
      sources: probes,
    };
  }

  async getPicks(rawLimit?: string, rawRefresh?: string): Promise<JsonRecord> {
    const limit = this.clamp(Math.round(Number(rawLimit) || 10), 1, 10);
    const forceRefresh = rawRefresh === '1' || rawRefresh === 'true';
    const now = Date.now();

    if (!forceRefresh && this.picksCache && this.picksCache.expiresAt > now) {
      return {
        ...this.picksCache.payload,
        cached: true,
        picks: (this.picksCache.payload.picks as unknown[]).slice(0, limit),
      };
    }

    if (this.picksPromise) {
      const payload = await this.picksPromise;
      return {
        ...payload,
        picks: (payload.picks as unknown[]).slice(0, limit),
      };
    }

    this.picksPromise = this.buildMarketPicks();
    try {
      const payload = await this.picksPromise;
      this.picksCache = {
        expiresAt: Date.now() + 15 * 60 * 1000,
        payload,
      };
      return {
        ...payload,
        picks: (payload.picks as unknown[]).slice(0, limit),
      };
    } finally {
      this.picksPromise = undefined;
    }
  }

  async getQuotes(rawCodes?: string) {
    const codes = Array.from(
      new Set(
        (rawCodes || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 20);

    if (!codes.length) {
      throw new BadRequestException('请提供需要刷新行情的股票代码');
    }

    const quotes = [];
    for (const input of codes) {
      try {
        const stock = await this.resolveStock(input);
        if (!stock) {
          quotes.push({
            code: input,
            status: 'unavailable',
            message: '未找到该股票',
          });
          continue;
        }

        const quote = await this.fetchQuote(stock.QuoteID);
        quotes.push({
          code: stock.Code,
          name: stock.Name,
          status: 'ready',
          price: this.scaledNumber(quote.f43),
          providerTime: this.asString(quote.quoteTime),
        });
      } catch {
        quotes.push({
          code: input,
          status: 'unavailable',
          message: '实时行情暂时不可用',
        });
      }
    }

    return {
      fetchedAt: new Date().toISOString(),
      quotes,
    };
  }

  async analyze(rawQuery?: string) {
    const query = rawQuery?.trim();
    if (!query) {
      throw new BadRequestException('请输入股票代码或名称');
    }

    const stock = await this.resolveStock(query);
    if (!stock) {
      throw new NotFoundException(`未找到 A 股股票：${query}`);
    }

    if (/(^|\s)\*?ST|退市/i.test(stock.Name)) {
      return {
        excluded: true,
        reason: `${stock.Name} 带有 ST、*ST 或退市标识，不符合当前分析范围。`,
        code: stock.Code,
        name: stock.Name,
      };
    }

    const secucode = this.toSecucode(stock);
    const company = await this.fetchCompany(secucode);
    const industry =
      this.asString(company.EM2016) || this.asString(company.INDUSTRYCSRC1);
    const financeKeyword = FINANCE_KEYWORDS.find((keyword) =>
      `${industry} ${stock.Name}`.includes(keyword),
    );

    if (financeKeyword) {
      return {
        excluded: true,
        reason: `${stock.Name} 属于${industry || financeKeyword}，不符合当前“排除金融行业”的分析范围。`,
        code: stock.Code,
        name: stock.Name,
      };
    }

    // 核心数据顺序请求，避免公开行情服务在短时间并发连接时主动断开。
    const quote = await this.fetchQuote(stock.QuoteID);
    const klines = await this.fetchKlines(stock.QuoteID);
    const financeRows = await this.fetchFinancials(secucode);
    const [announcements, news] = await Promise.all([
      this.fetchAnnouncements(stock.Code),
      this.fetchNews(stock.Name),
    ]);

    if (!quote || klines.length < 20) {
      throw new BadGatewayException('行情数据暂时不完整，请稍后重试');
    }

    const events = [...announcements, ...news]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
    const scores = this.calculateScores(quote, klines, financeRows, events);
    const hardChecks = this.buildHardChecks(financeRows, events);
    const assessment = this.buildAssessment(
      scores,
      financeRows,
      klines,
      hardChecks,
    );
    const latestKline = klines.at(-1);
    const latestFinance = financeRows[0];
    const annualFinancials = financeRows
      .filter((row) => row.reportType.includes('年报'))
      .slice(0, 3)
      .reverse();
    const displayFinancials = [
      ...annualFinancials,
      ...(latestFinance && !latestFinance.reportType.includes('年报')
        ? [latestFinance]
        : []),
    ].slice(-4);
    const priceSignals = this.buildPriceSignals(klines);
    const riskFactors = this.buildRiskFactors(
      financeRows,
      klines,
      events,
      quote,
    );
    const positives = this.buildPositiveFactors(financeRows, klines, scores);
    const watchlist = this.buildWatchlist(financeRows, klines, scores);
    const pe = this.scaledNumber(quote.f162);
    const pb = this.scaledNumber(quote.f167);

    return {
      excluded: false,
      code: stock.Code,
      name: stock.Name,
      exchange: stock.SecurityTypeName || this.exchangeName(stock.QuoteID),
      industry: industry || '行业信息暂缺',
      updatedAt: `行情截至 ${latestKline?.date || '未知'} · 财报披露 ${latestFinance?.noticeDate || '未知'}`,
      rating: assessment.rating,
      ratingTone: assessment.tone,
      score: scores.total,
      summary: assessment.summary,
      decisionRule: assessment.rule,
      quote: {
        price: this.formatPrice(this.scaledNumber(quote.f43)),
        change: this.formatPercent(this.scaledNumber(quote.f170)),
        turnover: this.formatPercent(this.scaledNumber(quote.f168), false),
        marketCap: this.formatMarketCap(this.asNumber(quote.f116)),
      },
      dimensions: [
        {
          label: '公司质量',
          score: scores.quality,
          note: this.scoreNote(scores.quality, '盈利质量'),
        },
        {
          label: '成长预期',
          score: scores.growth,
          note: this.growthScoreNote(scores.growth),
        },
        {
          label: '估值空间',
          score: scores.valuation,
          note: this.valuationNote(pe),
        },
        {
          label: '催化剂',
          score: scores.catalysts,
          note: this.eventScoreNote(scores.catalysts),
        },
        {
          label: '价格位置',
          score: scores.trend,
          note: priceSignals[0]?.value || '数据不足',
        },
        {
          label: '财务安全',
          score: scores.safety,
          note: this.safetyScoreNote(scores.safety),
        },
      ],
      hardChecks,
      financials: displayFinancials.map((row) => ({
        period: row.period,
        revenue: row.revenueGrowth,
        profit: row.profitGrowth,
        roe: row.roe,
        cash: this.cashQuality(row),
      })),
      chart: this.downsample(
        klines.map((item) => item.close),
        24,
      ),
      performance: this.buildPeriodPerformance(klines),
      valuation: [
        {
          label: 'PE-TTM',
          value: pe === null ? '--' : `${pe.toFixed(2)} 倍`,
          status: pe === null ? '当前不可用' : '实时估值快照',
        },
        {
          label: 'PB',
          value: pb === null ? '--' : `${pb.toFixed(2)} 倍`,
          status: pb === null ? '当前不可用' : '实时估值快照',
        },
        {
          label: '总市值',
          value: this.formatMarketCap(this.asNumber(quote.f116)),
          status: '按最新行情计算',
        },
      ],
      signals: priceSignals,
      events,
      positives,
      risks: riskFactors,
      watchlist,
      scoring: {
        weights: {
          quality: '30%',
          growth: '20%',
          valuation: '20%',
          catalysts: '15%',
          trend: '10%',
          safety: '5%',
        },
        riskPenalty: scores.riskPenalty,
      },
      dataSources: [
        {
          label: '实时行情与历史日线',
          provider: '腾讯证券行情接口',
          url: `https://gu.qq.com/${this.quotePageCode(stock.QuoteID)}/gp`,
        },
        {
          label: '财务指标与公司行业',
          provider: '东方财富数据中心',
          url: `https://emweb.securities.eastmoney.com/PC_HSF10/FinanceAnalysis/Index?code=${this.f10Code(stock.QuoteID)}`,
        },
        {
          label: '公司公告',
          provider: '东方财富公告中心（交易所公告聚合）',
          url: `https://data.eastmoney.com/notices/stock/${stock.Code}.html`,
        },
        {
          label: '财经新闻',
          provider: '东方财富新闻搜索（展示原媒体名称）',
          url: `https://so.eastmoney.com/news/s?keyword=${encodeURIComponent(stock.Name)}`,
        },
      ],
      disclaimer:
        '数据来自公开市场信息，可能存在延迟、字段缺失或第三方接口变更。评分用于研究整理，不构成投资建议。',
    };
  }

  private async buildMarketPicks(): Promise<JsonRecord> {
    const [universe, marketIndexKlines] = await Promise.all([
      this.fetchMarketUniverse(),
      this.fetchKlines('1.000300').catch(() => [] as KlinePoint[]),
    ]);
    const marketRegime = this.buildMarketRegime(marketIndexKlines, universe);
    const preselected = universe
      .map((candidate) => ({
        candidate,
        score: this.broadCandidateScore(candidate),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 36)
      .map((item) => item.candidate);

    const detailed = (
      await this.processInBatches(preselected, 4, async (candidate) => {
        try {
          const stock: SearchStock = {
            Code: candidate.code,
            Name: candidate.name,
            QuoteID: candidate.quoteId,
          };
          const company = await this.fetchCompany(this.toSecucode(stock));
          const industry =
            this.asString(company.EM2016) ||
            this.asString(company.INDUSTRYCSRC1) ||
            '行业信息暂缺';
          if (
            FINANCE_KEYWORDS.some((keyword) => industry.includes(keyword)) ||
            this.looksLikeFinanceName(candidate.name)
          ) {
            return null;
          }

          const [financeRows, klines] = await Promise.all([
            this.fetchFinancials(this.toSecucode(stock)),
            this.fetchKlines(candidate.quoteId),
          ]);
          if (!financeRows.length || klines.length < 120) return null;

          const quote = this.marketCandidateQuote(candidate);
          const scores = this.calculateScores(quote, klines, financeRows, []);
          const hardChecks = this.buildHardChecks(financeRows, []);
          if (hardChecks.some((item) => item.status === 'failed')) return null;

          return {
            candidate,
            industry,
            financeRows,
            klines,
            quote,
            scores,
          };
        } catch {
          return null;
        }
      })
    )
      .filter((item) => item !== null)
      .sort((a, b) => b.scores.total - a.scores.total);

    if (detailed.length < 10) {
      throw new BadGatewayException(
        '本轮真实数据覆盖不足，未能形成10家公司候选池，请稍后重试',
      );
    }

    const eventCandidates = detailed.slice(0, Math.min(22, detailed.length));
    const rescored = (
      await this.processInBatches(eventCandidates, 3, async (entry) => {
        const [announcements, news] = await Promise.all([
          this.fetchAnnouncements(entry.candidate.code),
          this.fetchNews(entry.candidate.name),
        ]);
        const events = [...announcements, ...news]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8);
        const scores = this.calculateScores(
          entry.quote,
          entry.klines,
          entry.financeRows,
          events,
        );
        const hardChecks = this.buildHardChecks(entry.financeRows, events);
        return {
          ...entry,
          events,
          scores,
          hardChecks,
        };
      })
    )
      .filter(
        (entry) =>
          !entry.hardChecks.some((item) => item.status === 'failed') &&
          entry.scores.quality >= 55 &&
          entry.scores.valuation >= 45 &&
          entry.scores.safety >= 50,
      )
      .sort((a, b) => b.scores.total - a.scores.total);

    // Only event-checked companies may enter the final pool. Empty event arrays
    // are acceptable only when the upstream sources really returned no records.
    const eligible = rescored;

    const uniqueEligible = Array.from(
      new Map(eligible.map((entry) => [entry.candidate.code, entry])).values(),
    );

    const industryEntries: IndustryEntry[] = detailed.map((entry) => ({
      industry: entry.industry,
      candidate: entry.candidate,
    }));
    const industryRelativeScores = this.buildIndustryRelativeScores(detailed);
    const backtest = this.buildWalkForwardBacktest(detailed);
    const sampleIndustryHeat = this.buildIndustryHeat(industryEntries);
    const [marketIndustryHeat, capitalFlows] = await Promise.all([
      this.fetchMarketIndustryHeat(),
      this.fetchCapitalFlows(uniqueEligible.map((entry) => entry.candidate)),
    ]);
    const capitalCoverageCount = Array.from(capitalFlows.values()).filter(
      (signal) => signal.available,
    ).length;
    if (capitalCoverageCount < marketRegime.targetPickCount) {
      throw new BadGatewayException(
        `本轮主力资金流覆盖不足${marketRegime.targetPickCount}家公司，为避免用成交活跃度冒充资金流入，请稍后重新学习`,
      );
    }
    const capitalIndustryHeat = this.buildCapitalIndustryHeat(
      industryEntries,
      capitalFlows,
    );
    const fullyRanked = uniqueEligible
      .map((entry) => {
        const industryGroup = this.industryGroup(entry.industry);
        const heat =
          this.findIndustryHeat(marketIndustryHeat, industryGroup) ??
          capitalIndustryHeat.get(industryGroup) ??
          sampleIndustryHeat.get(industryGroup) ??
          this.neutralIndustryHeat(industryGroup);
        const capital =
          capitalFlows.get(entry.candidate.code) ?? this.neutralCapitalFlow();
        const setup = this.buildSetupSignal(entry.klines);
        const relative =
          industryRelativeScores.get(entry.candidate.code) ??
          this.neutralIndustryRelative(entry.industry);
        const signalCount = [
          capital.available && capital.mainNetInflow > 0 && capital.score >= 55,
          heat.mainNetInflow !== undefined &&
            heat.mainNetInflow > 0 &&
            heat.score >= 63,
          setup.score >= 68,
          relative.score >= 68,
        ].filter(Boolean).length;
        return {
          ...entry,
          capital,
          industryHeat: heat,
          setup,
          relative,
          signalCount,
          selectionScore: Math.round(
            entry.scores.total * 0.34 +
              relative.score * 0.16 +
              capital.score * 0.22 +
              heat.score * 0.16 +
              setup.score * 0.12 +
              (signalCount >= 3 ? 5 : signalCount === 2 ? 2 : -4),
          ),
        };
      })
      .sort((a, b) => b.selectionScore - a.selectionScore);
    const highSignal = fullyRanked.filter((entry) => entry.signalCount >= 2);
    const rankingPool =
      highSignal.length >= marketRegime.targetPickCount
        ? highSignal
        : highSignal.concat(
            fullyRanked.filter((entry) => entry.signalCount < 2),
          );
    const rankedEligible = this.selectDiversifiedPicks(
      rankingPool,
      marketRegime.targetPickCount,
    );

    const picks = rankedEligible.map((entry, index) => {
      const latest = entry.financeRows[0];
      const latestKline = entry.klines.at(-1);
      const assessment = this.buildAssessment(
        entry.scores,
        entry.financeRows,
        entry.klines,
        entry.hardChecks,
      );
      const modelReasons = this.buildPickReasons(
        latest,
        entry.scores,
        entry.klines,
        entry.events,
        entry.candidate,
      );
      const contextReasons: string[] = [];
      if (entry.capital.available && entry.capital.score >= 68) {
        contextReasons.push(
          `近${entry.capital.flowDays}日主力净流入 ${entry.capital.mainNetInflowFormatted}（日均占比 ${this.formatPercent(entry.capital.mainNetRatio)}），大单资金重点流入`,
        );
      }
      if (entry.industryHeat.score >= 70) {
        contextReasons.push(
          `${entry.industryHeat.industry}板块主力净流入 ${entry.industryHeat.mainNetInflowFormatted || '--'}，板块热度处于前列`,
        );
      }
      if (entry.setup.score >= 70) {
        contextReasons.push(
          `近20日涨跌 ${this.formatPercent(entry.setup.return20)}，距60日高点 ${this.formatPercent(entry.setup.distanceToHigh60)}，形态处于${entry.setup.label}区间`,
        );
      }
      if (entry.relative.score >= 70) {
        contextReasons.push(
          `${entry.relative.peerScope === 'industry' ? `${entry.relative.industry}行业内` : '本轮复评样本中'}质量、成长、估值与安全综合位于前 ${Math.max(1, Math.round(100 - entry.relative.percentile))}%`,
        );
      }
      const reasons = Array.from(
        new Set([...contextReasons, ...modelReasons]),
      ).slice(0, 3);
      const riskItems = this.buildRiskFactors(
        entry.financeRows,
        entry.klines,
        entry.events,
        entry.quote,
      );

      return {
        rank: index + 1,
        code: entry.candidate.code,
        name: entry.candidate.name,
        industry: entry.industry,
        price: entry.candidate.price,
        changePercent: entry.candidate.changePercent,
        score: entry.selectionScore,
        baseScore: entry.scores.total,
        rating: assessment.rating === '可以关注' ? '优先关注' : '模型关注',
        reasons,
        risk:
          riskItems.find((item) => !item.includes('未触发重大风险扣分项')) ||
          '当前公开数据未触发硬性风险红线',
        metrics: {
          pe: entry.candidate.pe,
          pb: entry.candidate.pb,
          roe: latest?.roe ?? null,
          revenueGrowth: latest?.revenueGrowth ?? null,
          profitGrowth: latest?.profitGrowth ?? null,
          return60: this.periodReturn(
            entry.klines.map((item) => item.close),
            60,
          ),
        },
        capital: {
          ...entry.capital,
          amount: entry.candidate.amount,
          amountFormatted: this.formatAmount(entry.candidate.amount),
          turnover: entry.candidate.turnover,
        },
        industryHeat: entry.industryHeat,
        setup: entry.setup,
        industryRelative: entry.relative,
        signalCount: entry.signalCount,
        dimensions: {
          quality: entry.scores.quality,
          growth: entry.scores.growth,
          valuation: entry.scores.valuation,
          catalysts: entry.scores.catalysts,
          trend: entry.scores.trend,
          safety: entry.scores.safety,
        },
        dataAsOf: latestKline?.date || '',
        reportDate: latest?.noticeDate || '',
      };
    });

    if (picks.length < marketRegime.targetPickCount) {
      throw new BadGatewayException(
        `本轮通过硬性红线与数据完整性检查的公司不足${marketRegime.targetPickCount}家，请稍后重新学习`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      cached: false,
      model: 'A股市场自适应相对价值模型 v4',
      scannedCount: universe.length,
      detailedCount: detailed.length,
      capitalCoverageCount,
      marketRegime,
      backtest,
      targetPickCount: marketRegime.targetPickCount,
      picks,
      methodology:
        '从活跃A股中排除ST、金融及异常估值公司，执行年度亏损、负净资产、经营现金流、高杠杆、商誉、应收账款和重大风险事件红线；最终按六维基本面34%、行业内相对排名16%、个股近1—5日主力净流入22%、行业资金热度16%、蓄势结构12%排序。模型根据沪深300趋势、全市场涨跌广度与波动率切换进攻、均衡、防守状态，分别最多输出10、7、4家公司；同一一级行业最多优先保留3家。滚动评估只使用各检查点之前已披露的财报和价格，不使用未来数据。',
      disclaimer:
        '候选池依据公开市场数据和规则模型生成，仅用于缩小研究范围，不构成买入建议或收益保证。',
      dataSources: [
        '新浪财经A股实时列表',
        '腾讯证券前复权历史行情',
        '东方财富主力资金流、行业板块、财务数据、公告与新闻',
      ],
    };
  }

  private async fetchMarketUniverse(): Promise<MarketCandidate[]> {
    const params = new URLSearchParams({
      page: '1',
      num: '400',
      sort: 'amount',
      asc: '0',
      node: 'hs_a',
      symbol: '',
      _s_r_a: 'page',
    });
    const text = await this.fetchText(
      `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${params.toString()}`,
    );
    const rows = JSON.parse(text) as unknown;
    if (!Array.isArray(rows)) {
      throw new BadGatewayException('全市场行情数据格式异常');
    }

    const hasLiveTradingData = rows.some((item) => {
      const row = this.asRecord(item);
      return (this.asNumber(row.amount) ?? 0) > 0;
    });
    let sourceRows = rows;
    if (!hasLiveTradingData) {
      const fallbackParams = new URLSearchParams(params);
      fallbackParams.set('num', '500');
      fallbackParams.set('sort', 'mktcap');
      const fallback = JSON.parse(
        await this.fetchText(
          `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${fallbackParams.toString()}`,
        ),
      ) as unknown;
      if (Array.isArray(fallback)) sourceRows = fallback;
    }

    return sourceRows
      .map((item) => this.asRecord(item))
      .map((row) => {
        const code = this.asString(row.code);
        const symbol = this.asString(row.symbol);
        const trade = this.asNumber(row.trade) ?? 0;
        const settlement = this.asNumber(row.settlement) ?? 0;
        return {
          symbol,
          code,
          name: this.asString(row.name),
          price: trade > 0 ? trade : settlement,
          changePercent: this.asNumber(row.changepercent) ?? 0,
          amount: this.asNumber(row.amount) ?? 0,
          pe: this.asNumber(row.per) ?? 0,
          pb: this.asNumber(row.pb) ?? 0,
          marketCap: (this.asNumber(row.mktcap) ?? 0) * 10_000,
          turnover: this.asNumber(row.turnoverratio) ?? 0,
          quoteId: `${symbol.startsWith('sh') ? '1' : '0'}.${code}`,
        };
      })
      .filter(
        (item) =>
          /^(00|30|60|68)\d{4}$/.test(item.code) &&
          item.name &&
          !/(^|\s)\*?ST|退市/i.test(item.name) &&
          !/^[NC]/i.test(item.name) &&
          !this.looksLikeFinanceName(item.name) &&
          item.price >= 2 &&
          (!hasLiveTradingData || item.amount >= 50_000_000) &&
          item.marketCap >= 10_000_000_000 &&
          item.pe >= 4 &&
          item.pe <= 60 &&
          item.pb >= 0.3 &&
          item.pb <= 10 &&
          (!hasLiveTradingData ||
            (item.turnover >= 0.15 && item.turnover <= 15)) &&
          Math.abs(item.changePercent) <= 7,
      );
  }

  private broadCandidateScore(candidate: MarketCandidate): number {
    const valuation = this.valuationScore(candidate.pe, candidate.pb);
    const sizeScore =
      candidate.marketCap >= 100_000_000_000
        ? 90
        : candidate.marketCap >= 30_000_000_000
          ? 75
          : 60;
    const liquidityScore =
      candidate.amount >= 2_000_000_000
        ? 90
        : candidate.amount >= 800_000_000
          ? 76
          : 62;
    const stabilityScore =
      Math.abs(candidate.changePercent) <= 3
        ? 82
        : Math.abs(candidate.changePercent) <= 5
          ? 68
          : 52;
    return Math.round(
      valuation * 0.58 +
        sizeScore * 0.18 +
        liquidityScore * 0.14 +
        stabilityScore * 0.1,
    );
  }

  private async fetchCapitalFlows(
    candidates: MarketCandidate[],
  ): Promise<Map<string, CapitalFlowSignal>> {
    const result = new Map<string, CapitalFlowSignal>();
    if (!candidates.length) return result;
    if (this.capitalFlowCache && this.capitalFlowCache.expiresAt > Date.now()) {
      for (const candidate of candidates) {
        const cached = this.capitalFlowCache.signals.get(candidate.code);
        if (cached) result.set(candidate.code, cached);
      }
    }

    const params = new URLSearchParams({
      fltt: '2',
      secids: candidates.map((candidate) => candidate.quoteId).join(','),
      fields: 'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75',
    });
    const payload = await this.fetchOptionalJson(
      `https://push2.eastmoney.com/api/qt/ulist.np/get?${params.toString()}`,
    );
    const data = this.asRecord(payload?.data);
    const rows = Array.isArray(data.diff) ? data.diff : [];
    const candidateMap = new Map(
      candidates.map((candidate) => [candidate.code, candidate]),
    );

    for (const item of rows) {
      const row = this.asRecord(item);
      const code = this.asString(row.f12);
      const candidate = candidateMap.get(code);
      if (!candidate) continue;
      const mainNetInflow = this.asNumber(row.f62) ?? 0;
      const mainNetRatio = this.asNumber(row.f184) ?? 0;
      const superLargeNetInflow = this.asNumber(row.f66) ?? 0;
      const largeNetInflow = this.asNumber(row.f72) ?? 0;
      const amountRatio =
        candidate.marketCap > 0
          ? (mainNetInflow / candidate.marketCap) * 100
          : 0;
      const ratioScore = this.clamp(50 + mainNetRatio * 5, 5, 96);
      const scaleScore = this.clamp(50 + amountRatio * 22, 10, 95);
      const consistencyScore =
        mainNetInflow > 0 && superLargeNetInflow + largeNetInflow > 0
          ? 88
          : mainNetInflow > 0
            ? 68
            : mainNetInflow < 0
              ? 25
              : 45;
      const chaseScore =
        candidate.changePercent > 5
          ? 35
          : candidate.changePercent >= 0 && candidate.changePercent <= 3.5
            ? 82
            : candidate.changePercent >= -2
              ? 62
              : 42;
      const score = Math.round(
        ratioScore * 0.45 +
          scaleScore * 0.25 +
          consistencyScore * 0.2 +
          chaseScore * 0.1,
      );
      const available =
        mainNetInflow !== 0 ||
        superLargeNetInflow !== 0 ||
        largeNetInflow !== 0;
      if (!available) continue;
      result.set(code, {
        score,
        label:
          score >= 78
            ? '重点流入'
            : score >= 65
              ? '温和流入'
              : score >= 48
                ? '资金中性'
                : '资金流出',
        mainNetInflow,
        mainNetInflowFormatted: this.formatAmount(mainNetInflow, true),
        mainNetRatio: Number(mainNetRatio.toFixed(2)),
        superLargeNetInflow,
        largeNetInflow,
        available,
        flowDays: 1,
        positiveDays: mainNetInflow > 0 ? 1 : 0,
      });
    }

    const missingCandidates = candidates.filter(
      (candidate) => !result.get(candidate.code)?.available,
    );
    const histories = await this.processInBatches(
      missingCandidates,
      6,
      async (candidate) => ({
        code: candidate.code,
        signal: await this.fetchCapitalFlowHistory(candidate),
      }),
    );
    for (const item of histories) {
      if (item.signal) result.set(item.code, item.signal);
    }
    const availableSignals = new Map(
      Array.from(result.entries()).filter(([, signal]) => signal.available),
    );
    if (availableSignals.size) {
      this.capitalFlowCache = {
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        signals: availableSignals,
      };
    }
    return result;
  }

  private async fetchCapitalFlowHistory(
    candidate: MarketCandidate,
  ): Promise<CapitalFlowSignal | null> {
    const params = new URLSearchParams({
      lmt: '5',
      klt: '101',
      secid: candidate.quoteId,
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
    });
    const payload = await this.fetchOptionalJson(
      `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?${params.toString()}`,
    );
    const data = this.asRecord(payload?.data);
    const klines = Array.isArray(data.klines) ? data.klines : [];
    const rows = klines
      .map((item) => String(item).split(','))
      .filter((parts) => parts.length >= 13)
      .slice(-5);
    if (!rows.length) return null;

    const mainFlows = rows.map((parts) => Number(parts[1]) || 0);
    const mainRatios = rows.map((parts) => Number(parts[6]) || 0);
    const mainNetInflow = mainFlows.reduce((sum, value) => sum + value, 0);
    const mainNetRatio = this.average(mainRatios);
    const superLargeNetInflow = rows.reduce(
      (sum, parts) => sum + (Number(parts[5]) || 0),
      0,
    );
    const largeNetInflow = rows.reduce(
      (sum, parts) => sum + (Number(parts[4]) || 0),
      0,
    );
    const positiveDays = mainFlows.filter((value) => value > 0).length;
    const amountRatio =
      candidate.marketCap > 0 ? (mainNetInflow / candidate.marketCap) * 100 : 0;
    const ratioScore = this.clamp(50 + mainNetRatio * 5, 5, 96);
    const scaleScore = this.clamp(50 + amountRatio * 20, 10, 95);
    const positiveScore = [20, 35, 48, 68, 84, 95][positiveDays] ?? 50;
    const recentFlows = mainFlows.slice(-2);
    const recentScore = recentFlows.every((value) => value > 0)
      ? 90
      : recentFlows.some((value) => value > 0)
        ? 60
        : 25;
    const score = Math.round(
      ratioScore * 0.4 +
        scaleScore * 0.25 +
        positiveScore * 0.25 +
        recentScore * 0.1,
    );
    return {
      score,
      label:
        score >= 78
          ? '持续重点流入'
          : score >= 65
            ? '资金回流'
            : score >= 48
              ? '多空交织'
              : '持续流出',
      mainNetInflow,
      mainNetInflowFormatted: this.formatAmount(mainNetInflow, true),
      mainNetRatio: Number(mainNetRatio.toFixed(2)),
      superLargeNetInflow,
      largeNetInflow,
      available: mainFlows.some((value) => value !== 0),
      flowDays: rows.length,
      positiveDays,
      dataAsOf: rows.at(-1)?.[0],
    };
  }

  private neutralCapitalFlow(): CapitalFlowSignal {
    return {
      score: 45,
      label: '资金数据暂缺',
      mainNetInflow: 0,
      mainNetInflowFormatted: '--',
      mainNetRatio: 0,
      superLargeNetInflow: 0,
      largeNetInflow: 0,
      available: false,
      flowDays: 0,
      positiveDays: 0,
    };
  }

  private async fetchMarketIndustryHeat(): Promise<
    Map<string, IndustryHeatSignal>
  > {
    const result = new Map<string, IndustryHeatSignal>();
    const params = new URLSearchParams({
      pn: '1',
      pz: '80',
      po: '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid: 'f62',
      fs: 'm:90+t:2',
      fields: 'f12,f14,f3,f62,f184,f104,f105',
    });
    const payload = await this.fetchOptionalJson(
      `https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`,
    );
    const data = this.asRecord(payload?.data);
    const rows = Array.isArray(data.diff) ? data.diff : [];
    const amounts = rows
      .map((item) => this.asNumber(this.asRecord(item).f62) ?? 0)
      .filter((value) => value > 0);
    const maximumAmount = Math.max(...amounts, 1);

    for (const item of rows) {
      const row = this.asRecord(item);
      const industry = this.asString(row.f14);
      if (!industry) continue;
      const mainNetInflow = this.asNumber(row.f62) ?? 0;
      const mainNetRatio = this.asNumber(row.f184) ?? 0;
      const averageChange = this.asNumber(row.f3) ?? 0;
      const upCount = this.asNumber(row.f104) ?? 0;
      const downCount = this.asNumber(row.f105) ?? 0;
      const sampleCount = upCount + downCount;
      const positiveRatio =
        sampleCount > 0 ? (upCount / sampleCount) * 100 : 50;
      const amountScore =
        mainNetInflow > 0
          ? 45 + 50 * Math.sqrt(mainNetInflow / maximumAmount)
          : 25;
      const ratioScore = this.clamp(50 + mainNetRatio * 5, 20, 95);
      const momentumScore =
        averageChange >= 0.3 && averageChange <= 3.5
          ? 88
          : averageChange > 5
            ? 52
            : averageChange >= -0.5
              ? 68
              : 38;
      const score = Math.round(
        amountScore * 0.42 +
          ratioScore * 0.25 +
          positiveRatio * 0.18 +
          momentumScore * 0.15,
      );
      result.set(this.normalizeIndustryName(industry), {
        industry,
        score,
        label:
          score >= 78
            ? '资金热点'
            : score >= 66
              ? '升温中'
              : score >= 52
                ? '活跃'
                : '热度一般',
        averageChange: Number(averageChange.toFixed(2)),
        positiveRatio: Number(positiveRatio.toFixed(1)),
        sampleCount,
        totalAmount: 0,
        totalAmountFormatted: '--',
        mainNetInflow,
        mainNetInflowFormatted: this.formatAmount(mainNetInflow, true),
        mainNetRatio: Number(mainNetRatio.toFixed(2)),
        source: 'market-board',
      });
    }
    return result;
  }

  private findIndustryHeat(
    heat: Map<string, IndustryHeatSignal>,
    industry: string,
  ): IndustryHeatSignal | undefined {
    const normalized = this.normalizeIndustryName(industry);
    const exact = heat.get(normalized);
    if (exact) return exact;
    return Array.from(heat.entries())
      .filter(
        ([name]) =>
          name.length >= 2 &&
          (name.includes(normalized) || normalized.includes(name)),
      )
      .sort((a, b) => b[1].score - a[1].score)[0]?.[1];
  }

  private normalizeIndustryName(value: string): string {
    return value
      .replace(/[ⅠⅡⅢIV\s（）()]/g, '')
      .replace(/行业|板块/g, '')
      .trim();
  }

  private buildSetupSignal(klines: KlinePoint[]): SetupSignal {
    const recent = klines.slice(-80);
    const closes = recent.map((item) => item.close);
    const volumes = recent.map((item) => item.volume).filter(Number.isFinite);
    const latest = closes.at(-1) ?? 0;
    const ma20 = this.average(closes.slice(-20));
    const high60 = Math.max(...closes.slice(-60), latest);
    const return5 = this.periodReturn(closes, 5);
    const return20 = this.periodReturn(closes, 20);
    const distanceToHigh60 = high60 > 0 ? (latest / high60 - 1) * 100 : 0;
    const distanceToMa20 = ma20 > 0 ? (latest / ma20 - 1) * 100 : 0;
    const recentVolume = this.average(volumes.slice(-5));
    const previousVolume = this.average(volumes.slice(-25, -5));
    const volumeRatio = previousVolume > 0 ? recentVolume / previousVolume : 1;
    const returns = closes.slice(1).map((close, index) => {
      const previous = closes[index];
      return previous > 0 ? (close / previous - 1) * 100 : 0;
    });
    const recentVolatility = this.standardDeviation(returns.slice(-8));
    const previousVolatility = this.standardDeviation(returns.slice(-28, -8));
    const volatilityRatio =
      previousVolatility > 0 ? recentVolatility / previousVolatility : 1;

    const maScore =
      distanceToMa20 >= -2 && distanceToMa20 <= 5
        ? 90
        : distanceToMa20 > 5 && distanceToMa20 <= 10
          ? 65
          : distanceToMa20 >= -5
            ? 68
            : 35;
    const trendScore =
      return20 >= -2 && return20 <= 10
        ? 88
        : return20 > 10 && return20 <= 18
          ? 65
          : return20 >= -7
            ? 62
            : 32;
    const breakoutScore =
      distanceToHigh60 >= -8 && distanceToHigh60 <= 0
        ? 88
        : distanceToHigh60 >= -15
          ? 68
          : 42;
    const compressionScore =
      volatilityRatio <= 0.72
        ? 92
        : volatilityRatio <= 0.95
          ? 78
          : volatilityRatio <= 1.15
            ? 58
            : 35;
    const volumeScore =
      volumeRatio >= 0.55 && volumeRatio <= 1.05
        ? 86
        : volumeRatio <= 1.3
          ? 65
          : 42;
    const chasePenalty =
      (return5 > 8 ? Math.min(18, (return5 - 8) * 2) : 0) +
      (return20 > 15 ? Math.min(15, (return20 - 15) * 1.5) : 0);
    const score = this.clamp(
      Math.round(
        maScore * 0.24 +
          trendScore * 0.22 +
          breakoutScore * 0.2 +
          compressionScore * 0.2 +
          volumeScore * 0.14 -
          chasePenalty,
      ),
      0,
      100,
    );
    return {
      score,
      label:
        score >= 80
          ? '蓄势待发'
          : score >= 68
            ? '临近启动'
            : score >= 55
              ? '整理观察'
              : '形态偏弱',
      return5: Number(return5.toFixed(2)),
      return20: Number(return20.toFixed(2)),
      distanceToHigh60: Number(distanceToHigh60.toFixed(2)),
      distanceToMa20: Number(distanceToMa20.toFixed(2)),
      volumeRatio: Number(volumeRatio.toFixed(2)),
      volatilityRatio: Number(volatilityRatio.toFixed(2)),
    };
  }

  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.average(values);
    return Math.sqrt(
      this.average(values.map((value) => Math.pow(value - mean, 2))),
    );
  }

  private buildMarketRegime(
    indexKlines: KlinePoint[],
    universe: MarketCandidate[],
  ): MarketRegimeSignal {
    if (indexKlines.length < 60) {
      return {
        score: 42,
        label: '防守',
        tone: 'warning',
        targetPickCount: 4,
        indexReturn20: 0,
        indexDistanceMa20: 0,
        indexDistanceMa60: 0,
        breadth: 50,
        volatility20: 0,
        dataAsOf: '',
        reason: '沪深300历史行情不足，模型按防守状态降低候选数量',
      };
    }

    const closes = indexKlines.map((item) => item.close);
    const latest = closes.at(-1) ?? 0;
    const ma20 = this.average(closes.slice(-20));
    const ma60 = this.average(closes.slice(-60));
    const indexReturn20 = this.periodReturn(closes, 20);
    const indexDistanceMa20 = ma20 > 0 ? (latest / ma20 - 1) * 100 : 0;
    const indexDistanceMa60 = ma60 > 0 ? (latest / ma60 - 1) * 100 : 0;
    const dailyReturns = closes
      .slice(-21)
      .slice(1)
      .map((close, index) => {
        const previous = closes.slice(-21)[index];
        return previous > 0 ? (close / previous - 1) * 100 : 0;
      });
    const volatility20 = this.standardDeviation(dailyReturns);
    const changedStocks = universe.filter(
      (candidate) => candidate.changePercent !== 0,
    );
    const breadth = changedStocks.length
      ? (changedStocks.filter((candidate) => candidate.changePercent > 0)
          .length /
          changedStocks.length) *
        100
      : 50;

    let trendScore = 30;
    if (latest > ma20) trendScore += 20;
    if (latest > ma60) trendScore += 20;
    if (ma20 > ma60) trendScore += 15;
    if (indexReturn20 > 0) trendScore += 15;
    const volatilityScore =
      volatility20 <= 1.2
        ? 88
        : volatility20 <= 1.8
          ? 72
          : volatility20 <= 2.5
            ? 50
            : 28;
    const score = this.clamp(
      trendScore * 0.55 + breadth * 0.25 + volatilityScore * 0.2,
      0,
      100,
    );
    const label = score >= 68 ? '进攻' : score >= 48 ? '均衡' : '防守';
    const targetPickCount = label === '进攻' ? 10 : label === '均衡' ? 7 : 4;

    return {
      score,
      label,
      tone:
        label === '进攻'
          ? 'positive'
          : label === '均衡'
            ? 'neutral'
            : 'warning',
      targetPickCount,
      indexReturn20: Number(indexReturn20.toFixed(2)),
      indexDistanceMa20: Number(indexDistanceMa20.toFixed(2)),
      indexDistanceMa60: Number(indexDistanceMa60.toFixed(2)),
      breadth: Number(breadth.toFixed(1)),
      volatility20: Number(volatility20.toFixed(2)),
      dataAsOf: indexKlines.at(-1)?.date || '',
      reason: `沪深300近20日 ${this.formatPercent(indexReturn20)}，位于20日均线 ${this.formatPercent(indexDistanceMa20)}，上涨家数占比 ${breadth.toFixed(1)}%`,
    };
  }

  private buildIndustryRelativeScores(
    entries: Array<{
      candidate: MarketCandidate;
      industry: string;
      scores: ScoreBreakdown;
    }>,
  ): Map<string, IndustryRelativeSignal> {
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const industry = this.industryGroup(entry.industry);
      groups.set(industry, [...(groups.get(industry) ?? []), entry]);
    }
    const result = new Map<string, IndustryRelativeSignal>();
    for (const entry of entries) {
      const industry = this.industryGroup(entry.industry);
      const industryPeers = groups.get(industry) ?? [];
      const peerScope = industryPeers.length >= 3 ? 'industry' : 'market';
      const peers = peerScope === 'industry' ? industryPeers : entries;
      const peerScore =
        this.percentileOf(
          entry.scores.quality,
          peers.map((item) => item.scores.quality),
        ) *
          0.3 +
        this.percentileOf(
          entry.scores.growth,
          peers.map((item) => item.scores.growth),
        ) *
          0.25 +
        this.percentileOf(
          entry.scores.valuation,
          peers.map((item) => item.scores.valuation),
        ) *
          0.25 +
        this.percentileOf(
          entry.scores.safety,
          peers.map((item) => item.scores.safety),
        ) *
          0.2;
      const globalPercentile = this.percentileOf(
        entry.scores.total,
        entries.map((item) => item.scores.total),
      );
      const score = this.clamp(
        peerScore * 0.75 + globalPercentile * 0.25,
        0,
        100,
      );
      result.set(entry.candidate.code, {
        score,
        label:
          score >= 80
            ? peerScope === 'industry'
              ? '行业领先'
              : '样本领先'
            : score >= 65
              ? peerScope === 'industry'
                ? '行业前列'
                : '样本前列'
              : score >= 45
                ? peerScope === 'industry'
                  ? '行业中游'
                  : '样本中游'
                : peerScope === 'industry'
                  ? '行业偏弱'
                  : '样本偏弱',
        percentile: Number(score.toFixed(1)),
        sampleCount: peers.length,
        industry,
        peerScope,
      });
    }
    return result;
  }

  private neutralIndustryRelative(industry: string): IndustryRelativeSignal {
    return {
      score: 50,
      label: '样本不足',
      percentile: 50,
      sampleCount: 0,
      industry: this.industryGroup(industry),
      peerScope: 'market',
    };
  }

  private percentileOf(value: number, values: number[]): number {
    if (values.length <= 1) return 50;
    const lower = values.filter((item) => item < value).length;
    const equal = values.filter((item) => item === value).length;
    return ((lower + equal * 0.5) / values.length) * 100;
  }

  private buildWalkForwardBacktest(
    entries: Array<{
      candidate: MarketCandidate;
      industry: string;
      financeRows: FinancialRow[];
      klines: KlinePoint[];
    }>,
  ): WalkForwardSummary {
    const horizonDays = 20;
    const reference = entries.find(
      (entry) => entry.klines.length >= 260,
    )?.klines;
    if (!reference) return this.unavailableBacktest(horizonDays);

    const lastCheckpoint = reference.length - horizonDays - 1;
    const firstCheckpoint = Math.max(120, lastCheckpoint - 7 * horizonDays);
    const checkpoints: string[] = [];
    for (
      let index = firstCheckpoint;
      index <= lastCheckpoint;
      index += horizonDays
    ) {
      const date = reference[index]?.date;
      if (date) checkpoints.push(date);
    }

    const portfolioReturns: number[] = [];
    const selectedReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    const usedDates: string[] = [];
    for (const checkpoint of checkpoints) {
      const snapshots = entries.flatMap((entry) => {
        const index = entry.klines.findIndex(
          (item) => item.date === checkpoint,
        );
        if (index < 120 || index + horizonDays >= entry.klines.length)
          return [];
        const disclosed = entry.financeRows.filter(
          (row) => row.noticeDate && row.noticeDate <= checkpoint,
        );
        if (!disclosed.length) return [];
        const latest = disclosed[0];
        const annual = disclosed.find((row) => row.reportType.includes('年报'));
        const fundamental =
          this.qualityScore(latest) * 0.4 +
          this.growthScore(disclosed) * 0.35 +
          this.safetyScore(latest, annual) * 0.25;
        const setup = this.buildSetupSignal(entry.klines.slice(0, index + 1));
        const startPrice = entry.klines[index]?.close ?? 0;
        const endPrice = entry.klines[index + horizonDays]?.close ?? 0;
        if (startPrice <= 0 || endPrice <= 0) return [];
        return [
          {
            industry: this.industryGroup(entry.industry),
            rawScore: fundamental * 0.68 + setup.score * 0.32,
            forwardReturn: (endPrice / startPrice - 1) * 100,
          },
        ];
      });
      if (snapshots.length < 10) continue;

      const groups = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        groups.set(snapshot.industry, [
          ...(groups.get(snapshot.industry) ?? []),
          snapshot,
        ]);
      }
      const ranked = snapshots
        .map((snapshot) => {
          const peers = groups.get(snapshot.industry) ?? snapshots;
          const relative = this.percentileOf(
            snapshot.rawScore,
            peers.length >= 3
              ? peers.map((item) => item.rawScore)
              : snapshots.map((item) => item.rawScore),
          );
          return {
            ...snapshot,
            score: snapshot.rawScore * 0.7 + relative * 0.3,
          };
        })
        .sort((a, b) => b.score - a.score);
      const selectionCount = Math.min(
        5,
        Math.max(3, Math.ceil(ranked.length * 0.25)),
      );
      const selected = ranked.slice(0, selectionCount);
      const portfolioReturn = this.average(
        selected.map((item) => item.forwardReturn),
      );
      portfolioReturns.push(portfolioReturn);
      selectedReturns.push(...selected.map((item) => item.forwardReturn));
      benchmarkReturns.push(
        this.average(ranked.map((item) => item.forwardReturn)),
      );
      usedDates.push(checkpoint);
    }

    if (portfolioReturns.length < 3 || !selectedReturns.length) {
      return this.unavailableBacktest(horizonDays);
    }
    const averageReturn = this.average(portfolioReturns);
    const benchmarkReturn = this.average(benchmarkReturns);
    const excessReturn = averageReturn - benchmarkReturn;
    const positiveRate =
      (selectedReturns.filter((value) => value > 0).length /
        selectedReturns.length) *
      100;
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (const value of portfolioReturns) {
      equity *= 1 + value / 100;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, (equity / peak - 1) * 100);
    }
    return {
      available: true,
      checkpoints: portfolioReturns.length,
      observations: selectedReturns.length,
      horizonDays,
      averageReturn: Number(averageReturn.toFixed(2)),
      benchmarkReturn: Number(benchmarkReturn.toFixed(2)),
      excessReturn: Number(excessReturn.toFixed(2)),
      positiveRate: Number(positiveRate.toFixed(1)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      label:
        excessReturn >= 2 && positiveRate >= 55
          ? '历史验证偏强'
          : excessReturn > 0
            ? '历史验证中性偏正'
            : '历史验证暂未形成优势',
      periodStart: usedDates[0] || '',
      periodEnd: usedDates.at(-1) || '',
      limitation:
        '采用当前复评样本进行20交易日滚动验证，财务数据按公告日截断；不使用未来财报，但仍存在当前样本幸存者偏差，且未还原历史主力资金字段。',
    };
  }

  private unavailableBacktest(horizonDays: number): WalkForwardSummary {
    return {
      available: false,
      checkpoints: 0,
      observations: 0,
      horizonDays,
      averageReturn: 0,
      benchmarkReturn: 0,
      excessReturn: 0,
      positiveRate: 0,
      maxDrawdown: 0,
      label: '历史样本不足',
      periodStart: '',
      periodEnd: '',
      limitation:
        '当前候选的可用历史价格或当时已披露财报不足，未生成滚动评估。',
    };
  }

  private selectDiversifiedPicks<T extends { industry: string }>(
    ranked: T[],
    limit: number,
  ): T[] {
    const selected: T[] = [];
    const selectedSet = new Set<T>();
    const industryCounts = new Map<string, number>();
    for (const entry of ranked) {
      const industry = this.industryGroup(entry.industry);
      if ((industryCounts.get(industry) ?? 0) >= 3) continue;
      selected.push(entry);
      selectedSet.add(entry);
      industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
      if (selected.length === limit) return selected;
    }
    for (const entry of ranked) {
      if (selectedSet.has(entry)) continue;
      selected.push(entry);
      if (selected.length === limit) break;
    }
    return selected;
  }

  private capitalActivityScore(candidate: MarketCandidate): number {
    const amountScore =
      candidate.amount >= 5_000_000_000
        ? 95
        : candidate.amount >= 2_000_000_000
          ? 88
          : candidate.amount >= 1_000_000_000
            ? 80
            : candidate.amount >= 500_000_000
              ? 72
              : candidate.amount >= 200_000_000
                ? 64
                : 54;
    const turnoverScore =
      candidate.turnover >= 1 && candidate.turnover <= 5
        ? 88
        : candidate.turnover >= 0.5 && candidate.turnover <= 8
          ? 76
          : candidate.turnover <= 12
            ? 62
            : 45;
    const directionScore =
      candidate.changePercent >= 0.3 && candidate.changePercent <= 4
        ? 82
        : candidate.changePercent > 4
          ? 62
          : candidate.changePercent >= -1
            ? 68
            : candidate.changePercent >= -3
              ? 52
              : 36;

    return Math.round(
      amountScore * 0.55 + turnoverScore * 0.25 + directionScore * 0.2,
    );
  }

  private buildIndustryHeat(
    entries: IndustryEntry[],
  ): Map<string, IndustryHeatSignal> {
    const groups = new Map<string, MarketCandidate[]>();
    for (const entry of entries) {
      const industry = this.industryGroup(entry.industry);
      groups.set(industry, [...(groups.get(industry) ?? []), entry.candidate]);
    }

    const totals = Array.from(groups.values()).map((candidates) =>
      candidates.reduce((sum, candidate) => sum + candidate.amount, 0),
    );
    const maximumAmount = Math.max(...totals, 1);
    const result = new Map<string, IndustryHeatSignal>();

    for (const [industry, candidates] of groups) {
      if (industry === '行业信息暂缺') {
        result.set(industry, this.neutralIndustryHeat(industry));
        continue;
      }
      const averageChange = this.average(
        candidates.map((candidate) => candidate.changePercent),
      );
      const positiveCount = candidates.filter(
        (candidate) => candidate.changePercent > 0,
      ).length;
      const positiveRatio =
        ((positiveCount + 1.5) / (candidates.length + 3)) * 100;
      const totalAmount = candidates.reduce(
        (sum, candidate) => sum + candidate.amount,
        0,
      );
      const changeScore = this.clamp(50 + averageChange * 8, 25, 92);
      const liquidityScore = 45 + 55 * Math.sqrt(totalAmount / maximumAmount);
      const rawScore =
        changeScore * 0.45 + positiveRatio * 0.3 + liquidityScore * 0.25;
      const confidence = Math.min(candidates.length / 3, 1);
      const score = Math.round(50 + (rawScore - 50) * confidence);
      result.set(industry, {
        industry,
        score,
        label:
          score >= 75
            ? '高热'
            : score >= 60
              ? '活跃'
              : score >= 45
                ? '中性'
                : '偏冷',
        averageChange: Number(averageChange.toFixed(2)),
        positiveRatio: Number(positiveRatio.toFixed(1)),
        sampleCount: candidates.length,
        totalAmount,
        totalAmountFormatted: this.formatAmount(totalAmount),
        source: 'candidate-sample',
      });
    }
    return result;
  }

  private buildCapitalIndustryHeat(
    entries: IndustryEntry[],
    capitalFlows: Map<string, CapitalFlowSignal>,
  ): Map<string, IndustryHeatSignal> {
    const groups = new Map<
      string,
      Array<{ candidate: MarketCandidate; flow: CapitalFlowSignal }>
    >();
    for (const entry of entries) {
      const flow = capitalFlows.get(entry.candidate.code);
      if (!flow?.available) continue;
      const industry = this.industryGroup(entry.industry);
      groups.set(industry, [
        ...(groups.get(industry) ?? []),
        { candidate: entry.candidate, flow },
      ]);
    }
    const positiveTotals = Array.from(groups.values())
      .map((items) =>
        items.reduce((sum, item) => sum + item.flow.mainNetInflow, 0),
      )
      .filter((value) => value > 0);
    const maximumAmount = Math.max(...positiveTotals, 1);
    const result = new Map<string, IndustryHeatSignal>();

    for (const [industry, items] of groups) {
      const mainNetInflow = items.reduce(
        (sum, item) => sum + item.flow.mainNetInflow,
        0,
      );
      const mainNetRatio = this.average(
        items.map((item) => item.flow.mainNetRatio),
      );
      const positiveCount = items.filter(
        (item) => item.flow.mainNetInflow > 0,
      ).length;
      const positiveRatio = (positiveCount / items.length) * 100;
      const averageChange = this.average(
        items.map((item) => item.candidate.changePercent),
      );
      const amountScore =
        mainNetInflow > 0
          ? 45 + 50 * Math.sqrt(mainNetInflow / maximumAmount)
          : 25;
      const rawScore =
        amountScore * 0.35 +
        this.average(items.map((item) => item.flow.score)) * 0.4 +
        positiveRatio * 0.25;
      const confidence = Math.min(items.length / 3, 1);
      const score = Math.round(50 + (rawScore - 50) * confidence);
      result.set(industry, {
        industry,
        score,
        label:
          score >= 75
            ? '资金热点'
            : score >= 63
              ? '资金升温'
              : score >= 50
                ? '资金分化'
                : '热度偏弱',
        averageChange: Number(averageChange.toFixed(2)),
        positiveRatio: Number(positiveRatio.toFixed(1)),
        sampleCount: items.length,
        totalAmount: items.reduce(
          (sum, item) => sum + item.candidate.amount,
          0,
        ),
        totalAmountFormatted: this.formatAmount(
          items.reduce((sum, item) => sum + item.candidate.amount, 0),
        ),
        mainNetInflow,
        mainNetInflowFormatted: this.formatAmount(mainNetInflow, true),
        mainNetRatio: Number(mainNetRatio.toFixed(2)),
        source: 'candidate-sample',
      });
    }
    return result;
  }

  private neutralIndustryHeat(industry = '行业信息暂缺'): IndustryHeatSignal {
    return {
      industry,
      score: 50,
      label: '样本不足',
      averageChange: 0,
      positiveRatio: 0,
      sampleCount: 0,
      totalAmount: 0,
      totalAmountFormatted: '--',
      source: 'candidate-sample',
    };
  }

  private industryGroup(value: string): string {
    return value.split(/[-—>\/]/)[0]?.trim() || '行业信息暂缺';
  }

  private activityLabel(score: number): string {
    return score >= 82
      ? '强势活跃'
      : score >= 70
        ? '较活跃'
        : score >= 58
          ? '中性'
          : '偏弱';
  }

  private formatAmount(value: number, includeSign = false): string {
    if (!Number.isFinite(value)) return '--';
    const sign = value > 0 && includeSign ? '+' : value < 0 ? '-' : '';
    const absolute = Math.abs(value);
    if (absolute >= 100_000_000)
      return `${sign}${(absolute / 100_000_000).toFixed(1)}亿`;
    if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
    return `${sign}${absolute.toFixed(0)}`;
  }

  private marketCandidateQuote(candidate: MarketCandidate): JsonRecord {
    return {
      f43: candidate.price * 100,
      f116: candidate.marketCap,
      f162: candidate.pe * 100,
      f167: candidate.pb * 100,
      f168: candidate.turnover * 100,
      f170: candidate.changePercent * 100,
    };
  }

  private looksLikeFinanceName(name: string): boolean {
    return [
      ...FINANCE_KEYWORDS,
      '人寿',
      '人保',
      '太保',
      '平安',
      '金控',
      '金租',
      '资本',
      '产融',
    ].some((keyword) => name.includes(keyword));
  }

  private buildPickReasons(
    latest: FinancialRow | undefined,
    scores: ScoreBreakdown,
    klines: KlinePoint[],
    events: AnalysisEvent[],
    candidate: MarketCandidate,
  ): string[] {
    const reasons: string[] = [];
    if ((latest?.roe ?? 0) >= 12) {
      reasons.push(
        `最新披露ROE为 ${latest?.roe?.toFixed(2)}%，盈利能力达到模型优选线`,
      );
    }
    if ((latest?.cashProfitRatio ?? 0) >= 0.8) {
      reasons.push(
        `经营现金流/净利润为 ${latest?.cashProfitRatio?.toFixed(2)}，利润含金量较好`,
      );
    }
    if (
      (latest?.revenueGrowth ?? -1) >= 8 &&
      (latest?.profitGrowth ?? -1) >= 8
    ) {
      reasons.push(
        `营收与扣非利润分别增长 ${latest?.revenueGrowth?.toFixed(2)}%、${latest?.profitGrowth?.toFixed(2)}%`,
      );
    }
    if (candidate.pe > 0 && candidate.pe <= 25) {
      reasons.push(`PE约 ${candidate.pe.toFixed(2)} 倍，处于模型偏好估值区间`);
    }
    const positiveEvent = events.find((item) => item.tone === 'positive');
    if (positiveEvent) {
      reasons.push(`近期催化：${this.truncate(positiveEvent.title, 42)}`);
    }
    const return60 = this.periodReturn(
      klines.map((item) => item.close),
      60,
    );
    if (scores.trend >= 70 && return60 > 0) {
      reasons.push(
        `中期价格结构偏强，近60日涨跌幅 ${this.formatPercent(return60)}`,
      );
    }
    if (scores.safety >= 75) {
      reasons.push('年度盈利、经营现金流和杠杆红线均通过');
    }
    if (reasons.length < 3) {
      reasons.push(
        `公司质量与估值综合得分分别为 ${scores.quality}、${scores.valuation}`,
      );
    }
    if (reasons.length < 3) {
      reasons.push(`六维综合评分为 ${scores.total}，位于本轮市场候选前列`);
    }
    return Array.from(new Set(reasons)).slice(0, 3);
  }

  private async processInBatches<T, R>(
    items: T[],
    batchSize: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += batchSize) {
      const batch = items.slice(index, index + batchSize);
      results.push(...(await Promise.all(batch.map(worker))));
    }
    return results;
  }

  private async resolveStock(query: string): Promise<SearchStock | null> {
    const params = new URLSearchParams({
      input: query,
      type: '14',
      token: EASTMONEY_SEARCH_TOKEN,
      count: '10',
    });
    const payload = await this.fetchJson(
      `http://searchapi.eastmoney.com/api/suggest/get?${params.toString()}`,
    );
    const table = this.asRecord(payload.QuotationCodeTable);
    const data = Array.isArray(table.Data) ? table.Data : [];
    const candidates = data
      .map((item) => this.asRecord(item))
      .filter(
        (item) =>
          this.asString(item.Classify) === 'AStock' &&
          /^\d{6}$/.test(this.asString(item.Code)) &&
          /^[01]\./.test(this.asString(item.QuoteID)),
      )
      .map((item) => ({
        Code: this.asString(item.Code),
        Name: this.asString(item.Name),
        QuoteID: this.asString(item.QuoteID),
        SecurityTypeName: this.asString(item.SecurityTypeName),
        Classify: this.asString(item.Classify),
      }));

    const normalized = query.toUpperCase();
    return (
      candidates.find(
        (item) => item.Code === normalized || item.Name === query,
      ) ||
      candidates[0] ||
      null
    );
  }

  private async fetchQuote(quoteId: string): Promise<JsonRecord> {
    const quoteCode = this.quotePageCode(quoteId);
    const text = await this.fetchText(`https://qt.gtimg.cn/q=${quoteCode}`);
    const start = text.indexOf('"');
    const end = text.lastIndexOf('"');
    const fields = text.slice(start + 1, end).split('~');
    if (fields.length < 47) {
      throw new BadGatewayException('腾讯行情数据字段不完整');
    }

    const price = this.nullableNumber(fields[3]);
    const changePercent = this.nullableNumber(fields[32]);
    const turnover = this.nullableNumber(fields[38]);
    const pe = this.nullableNumber(fields[39]);
    const totalMarketCapYi = this.nullableNumber(fields[45]);
    const pb = this.nullableNumber(fields[46]);

    return {
      f43: price === null ? null : price * 100,
      f116: totalMarketCapYi === null ? null : totalMarketCapYi * 100_000_000,
      f162: pe === null ? null : pe * 100,
      f167: pb === null ? null : pb * 100,
      f168: turnover === null ? null : turnover * 100,
      f170: changePercent === null ? null : changePercent * 100,
      quoteTime: fields[30],
    };
  }

  private async fetchKlines(quoteId: string): Promise<KlinePoint[]> {
    const quoteCode = this.quotePageCode(quoteId);
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${quoteCode},day,,,800,qfq`;
    const payload = this.asRecord(JSON.parse(await this.fetchText(url)));
    const data = this.asRecord(payload.data);
    const stockData = this.asRecord(data[quoteCode]);
    const klines = Array.isArray(stockData.qfqday)
      ? stockData.qfqday
      : Array.isArray(stockData.day)
        ? stockData.day
        : [];

    return klines
      .map((line) => (Array.isArray(line) ? line : []))
      .filter((parts) => parts.length >= 6)
      .map((parts) => ({
        date: String(parts[0]),
        open: Number(parts[1]),
        close: Number(parts[2]),
        high: Number(parts[3]),
        low: Number(parts[4]),
        volume: Number(parts[5]),
        amount: 0,
        amplitude: 0,
        changePercent: 0,
        change: 0,
        turnover: 0,
      }))
      .filter((item) => Number.isFinite(item.close));
  }

  private async fetchFinancials(secucode: string): Promise<FinancialRow[]> {
    const params = new URLSearchParams({
      reportName: 'RPT_F10_FINANCE_MAINFINADATA',
      columns: 'ALL',
      filter: `(SECUCODE="${secucode}")`,
      pageNumber: '1',
      pageSize: '24',
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
    });
    const balanceParams = new URLSearchParams({
      reportName: 'RPT_F10_FINANCE_GBALANCE',
      columns: 'ALL',
      filter: `(SECUCODE="${secucode}")`,
      pageNumber: '1',
      pageSize: '24',
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
    });
    const [payload, balancePayload] = await Promise.all([
      this.fetchJson(
        `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`,
      ),
      this.fetchOptionalJson(
        `https://datacenter.eastmoney.com/securities/api/data/v1/get?${balanceParams.toString()}`,
      ),
    ]);
    const result = this.asRecord(payload.result);
    const rows = Array.isArray(result.data) ? result.data : [];
    const balanceResult = this.asRecord(balancePayload?.result);
    const balanceRows = Array.isArray(balanceResult.data)
      ? balanceResult.data.map((item) => this.asRecord(item))
      : [];
    const balancesByDate = new Map(
      balanceRows.map((row) => [this.shortDate(row.REPORT_DATE), row]),
    );

    return rows.map((item) => {
      const row = this.asRecord(item);
      const reportDate = this.shortDate(row.REPORT_DATE);
      const balance = balancesByDate.get(reportDate) ?? {};
      return {
        period:
          this.asString(row.REPORT_DATE_NAME) ||
          this.shortDate(row.REPORT_DATE),
        reportType: this.asString(row.REPORT_TYPE),
        noticeDate: this.shortDate(row.NOTICE_DATE),
        revenueGrowth: this.nullableNumber(row.TOTALOPERATEREVETZ),
        profitGrowth: this.nullableNumber(
          row.KCFJCXSYJLRTZ ?? row.PARENTNETPROFITTZ,
        ),
        roe: this.nullableNumber(row.ROEJQ),
        grossMargin: this.nullableNumber(row.XSMLL),
        debtRatio: this.nullableNumber(row.ZCFZL),
        operatingCash: this.nullableNumber(row.NETCASH_OPERATE_PK),
        netProfit: this.nullableNumber(row.PARENTNETPROFIT),
        cashProfitRatio: this.nullableNumber(row.NCO_NETPROFIT),
        totalAssets: this.nullableNumber(
          balance.TOTAL_ASSETS ?? row.TOTAL_ASSETS_PK,
        ),
        totalEquity: this.nullableNumber(
          balance.TOTAL_EQUITY ?? row.TOTAL_EQUITY_PK,
        ),
        accountsReceivable: this.nullableNumber(
          balance.NOTE_ACCOUNTS_RECE ?? balance.ACCOUNTS_RECE,
        ),
        accountsReceivableGrowth: this.nullableNumber(
          balance.ACCOUNTS_RECE_YOY,
        ),
        goodwill: this.nullableNumber(balance.GOODWILL),
        inventory: this.nullableNumber(balance.INVENTORY),
      };
    });
  }

  private async fetchCompany(secucode: string): Promise<JsonRecord> {
    const params = new URLSearchParams({
      reportName: 'RPT_F10_BASIC_ORGINFO',
      columns: 'ALL',
      filter: `(SECUCODE="${secucode}")`,
      pageNumber: '1',
      pageSize: '1',
    });
    const payload = await this.fetchJson(
      `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`,
    );
    const result = this.asRecord(payload.result);
    const rows = Array.isArray(result.data) ? result.data : [];
    return this.asRecord(rows[0]);
  }

  private async fetchAnnouncements(code: string): Promise<AnalysisEvent[]> {
    const params = new URLSearchParams({
      page_size: '10',
      page_index: '1',
      ann_type: 'A',
      client_source: 'web',
      stock_list: code,
    });

    try {
      const payload = await this.fetchJson(
        `https://np-anotice-stock.eastmoney.com/api/security/ann?${params.toString()}`,
      );
      const data = this.asRecord(payload.data);
      const rows = Array.isArray(data.list) ? data.list : [];
      return rows.map((item) => {
        const row = this.asRecord(item);
        const columns = Array.isArray(row.columns) ? row.columns : [];
        const column = this.asRecord(columns[0]);
        const title = this.asString(row.title_ch) || this.asString(row.title);
        const artCode = this.asString(row.art_code);
        return {
          date: this.shortDate(row.notice_date),
          type: this.asString(column.column_name) || '公告',
          tone: this.eventTone(title),
          title,
          detail: '公司公开披露文件，点击标题查看公告正文。',
          source: '公司公告',
          url: artCode
            ? `https://data.eastmoney.com/notices/detail/${code}/${artCode}.html`
            : undefined,
        };
      });
    } catch {
      return [];
    }
  }

  private async fetchNews(name: string): Promise<AnalysisEvent[]> {
    const searchPayload = {
      uid: '',
      keyword: name,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          sort: 'default',
          pageIndex: 1,
          pageSize: 8,
          preTag: '',
          postTag: '',
        },
      },
    };
    const params = new URLSearchParams({
      cb: '',
      param: JSON.stringify(searchPayload),
    });

    try {
      const payload = await this.fetchJson(
        `http://search-api-web.eastmoney.com/search/jsonp?${params.toString()}`,
      );
      const result = this.asRecord(payload.result);
      const rows = Array.isArray(result.cmsArticleWebOld)
        ? result.cmsArticleWebOld
        : [];
      return rows.map((item) => {
        const row = this.asRecord(item);
        const title = this.stripHtml(this.asString(row.title));
        return {
          date: this.asString(row.date),
          type: '新闻',
          tone: this.eventTone(title),
          title,
          detail: this.truncate(
            this.stripHtml(this.asString(row.content)),
            150,
          ),
          source: this.asString(row.mediaName) || '财经媒体',
          url: this.asString(row.url) || undefined,
        };
      });
    } catch {
      return [];
    }
  }

  private calculateScores(
    quote: JsonRecord,
    klines: KlinePoint[],
    financeRows: FinancialRow[],
    events: AnalysisEvent[],
  ): ScoreBreakdown {
    const latest = financeRows[0];
    const annual = financeRows.find((row) => row.reportType.includes('年报'));
    const quality = latest ? this.qualityScore(latest) : 35;
    const growth = this.growthScore(financeRows);
    const valuation = this.valuationScore(
      this.scaledNumber(quote.f162),
      this.scaledNumber(quote.f167),
    );
    const trend = this.trendScore(klines);
    const eventPositive = events.filter(
      (item) => item.tone === 'positive',
    ).length;
    const eventNegative = events.filter(
      (item) => item.tone === 'warning',
    ).length;
    const catalysts = this.clamp(
      50 + eventPositive * 6 - eventNegative * 8,
      10,
      90,
    );
    const safety = latest ? this.safetyScore(latest, annual) : 35;
    let riskPenalty = 0;

    if (latest) {
      if ((latest.profitGrowth ?? 0) < -20) riskPenalty += 6;
      if ((latest.revenueGrowth ?? 0) < -10) riskPenalty += 4;
      if ((latest.debtRatio ?? 0) > 80) riskPenalty += 10;
    }
    if ((annual?.operatingCash ?? 0) < 0) riskPenalty += 10;
    if ((annual?.netProfit ?? 0) < 0) riskPenalty += 15;
    if (events.some((item) => this.isSeriousRiskEvent(item.title)))
      riskPenalty += 10;
    if ((this.scaledNumber(quote.f162) ?? 0) > 80) riskPenalty += 5;
    riskPenalty = this.clamp(riskPenalty, 0, 35);

    const total = this.clamp(
      Math.round(
        quality * 0.3 +
          growth * 0.2 +
          valuation * 0.2 +
          catalysts * 0.15 +
          trend * 0.1 +
          safety * 0.05 -
          riskPenalty,
      ),
      0,
      100,
    );

    return {
      quality,
      growth,
      valuation,
      catalysts,
      trend,
      safety,
      riskPenalty,
      total,
    };
  }

  private qualityScore(row: FinancialRow): number {
    const roe = this.rangeScore(row.roe, [
      [20, 100],
      [15, 85],
      [10, 68],
      [5, 45],
    ]);
    const margin = this.rangeScore(row.grossMargin, [
      [40, 95],
      [25, 80],
      [15, 65],
      [5, 45],
    ]);
    const cash = this.rangeScore(row.cashProfitRatio, [
      [1, 100],
      [0.7, 80],
      [0.4, 60],
      [0, 35],
    ]);
    const profitQuality =
      row.netProfit === null ? 50 : row.netProfit > 0 ? 82 : 10;

    return Math.round(
      roe * 0.34 + margin * 0.22 + cash * 0.3 + profitQuality * 0.14,
    );
  }

  private growthScore(rows: FinancialRow[]): number {
    const recent = rows.slice(0, 4);
    if (!recent.length) return 35;

    const revenue = this.average(
      recent.map((row) =>
        this.rangeScore(row.revenueGrowth, [
          [20, 100],
          [10, 85],
          [0, 65],
          [-10, 35],
        ]),
      ),
    );
    const profit = this.average(
      recent.map((row) =>
        this.rangeScore(row.profitGrowth, [
          [20, 100],
          [10, 85],
          [0, 65],
          [-10, 35],
        ]),
      ),
    );
    const positivePeriods =
      recent.filter(
        (row) =>
          (row.revenueGrowth ?? -1) >= 0 && (row.profitGrowth ?? -1) >= 0,
      ).length / recent.length;
    const consistency = 35 + positivePeriods * 60;
    const score = Math.round(
      revenue * 0.38 + profit * 0.47 + consistency * 0.15,
    );

    // 亏损收窄也可能显示为较高同比增速，不能直接等同于高质量成长。
    return (recent[0]?.netProfit ?? 0) < 0 ? Math.min(score, 45) : score;
  }

  private safetyScore(row: FinancialRow, annual?: FinancialRow): number {
    const debt =
      row.debtRatio === null
        ? 50
        : row.debtRatio <= 30
          ? 95
          : row.debtRatio <= 50
            ? 78
            : row.debtRatio <= 70
              ? 55
              : row.debtRatio <= 80
                ? 35
                : 10;
    const cashRatio = this.rangeScore(row.cashProfitRatio, [
      [1, 100],
      [0.8, 88],
      [0.4, 62],
      [0, 35],
    ]);
    const annualCash =
      annual?.operatingCash === null || annual?.operatingCash === undefined
        ? 50
        : annual.operatingCash >= 0
          ? 85
          : 10;
    const annualProfit =
      annual?.netProfit === null || annual?.netProfit === undefined
        ? 50
        : annual.netProfit > 0
          ? 85
          : 10;

    return Math.round(
      debt * 0.4 + cashRatio * 0.25 + annualCash * 0.2 + annualProfit * 0.15,
    );
  }

  private valuationScore(pe: number | null, pb: number | null): number {
    const peScore =
      pe === null || pe <= 0
        ? 35
        : pe <= 15
          ? 88
          : pe <= 25
            ? 76
            : pe <= 40
              ? 62
              : pe <= 60
                ? 45
                : 28;
    const pbScore =
      pb === null || pb <= 0
        ? 40
        : pb <= 1.5
          ? 88
          : pb <= 3
            ? 74
            : pb <= 6
              ? 60
              : pb <= 10
                ? 44
                : 28;
    return Math.round(peScore * 0.7 + pbScore * 0.3);
  }

  private trendScore(klines: KlinePoint[]): number {
    const closes = klines.map((item) => item.close);
    const latest = closes.at(-1) ?? 0;
    const ma20 = this.average(closes.slice(-20));
    const ma60 = this.average(closes.slice(-60));
    const ma120 = this.average(closes.slice(-120));
    const return20 = this.periodReturn(closes, 20);
    const return60 = this.periodReturn(closes, 60);
    let score = 40;

    if (latest > ma20) score += 12;
    if (latest > ma60) score += 12;
    if (latest > ma120) score += 12;
    if (ma20 > ma60) score += 8;
    if (ma60 > ma120) score += 6;
    if (return20 > 0) score += 5;
    if (return60 > 0) score += 5;
    if (return20 < -10) score -= 8;
    if (return60 < -20) score -= 10;

    return this.clamp(score, 10, 95);
  }

  private buildPriceSignals(klines: KlinePoint[]) {
    const closes = klines.map((item) => item.close);
    const latest = closes.at(-1) ?? 0;
    const ma20 = this.average(closes.slice(-20));
    const ma60 = this.average(closes.slice(-60));
    const ma120 = this.average(closes.slice(-120));
    const return60 = this.periodReturn(closes, 60);
    const high120 = Math.max(...closes.slice(-120));
    const drawdown = high120 > 0 ? (latest / high120 - 1) * 100 : 0;
    const volume5 = this.average(klines.slice(-5).map((item) => item.volume));
    const volume20 = this.average(klines.slice(-20).map((item) => item.volume));
    const volumeRatio = volume20 > 0 ? volume5 / volume20 : 1;
    let trend = '震荡整理';
    let trendTone = 'neutral';

    if (latest > ma20 && ma20 > ma60 && ma60 > ma120) {
      trend = '多头排列';
      trendTone = 'positive';
    } else if (latest > ma20 && latest > ma60 && latest > ma120) {
      trend = '中期偏强';
      trendTone = 'positive';
    } else if (latest < ma20 && ma20 < ma60 && ma60 < ma120) {
      trend = '弱势下行';
      trendTone = 'warning';
    } else if (latest < ma20 && latest < ma60 && latest < ma120) {
      trend = '中期偏弱';
      trendTone = 'warning';
    }

    return [
      { label: '中期趋势', value: trend, tone: trendTone },
      {
        label: '60日涨跌',
        value: this.formatPercent(return60),
        tone: return60 > 3 ? 'positive' : return60 < -3 ? 'warning' : 'neutral',
      },
      {
        label: '成交状态',
        value:
          volumeRatio >= 1.25
            ? '近期放量'
            : volumeRatio <= 0.75
              ? '近期缩量'
              : '量能平稳',
        tone: volumeRatio >= 1.25 ? 'positive' : 'neutral',
      },
      {
        label: '120日回撤',
        value: this.formatPercent(drawdown),
        tone: drawdown < -20 ? 'warning' : 'neutral',
      },
    ];
  }

  private buildPeriodPerformance(klines: KlinePoint[]) {
    const periods = [
      { label: '近一周', days: 5 },
      { label: '近半个月', days: 10 },
      { label: '近一个月', days: 20 },
      { label: '近3个月', days: 60 },
      { label: '近半年', days: 120 },
    ];
    const latest = klines.at(-1);

    return periods.map((period) => {
      if (!latest || klines.length <= period.days) {
        return {
          ...period,
          value: null,
          formatted: '--',
          tone: 'neutral',
          startDate: '',
          endDate: latest?.date || '',
        };
      }

      const start = klines.at(-(period.days + 1));
      const value =
        start && start.close > 0
          ? (latest.close / start.close - 1) * 100
          : null;

      return {
        ...period,
        value,
        formatted: this.formatPercent(value),
        tone:
          value === null || Math.abs(value) < 0.005
            ? 'neutral'
            : value > 0
              ? 'positive'
              : 'negative',
        startDate: start?.date || '',
        endDate: latest.date,
      };
    });
  }

  private buildAssessment(
    scores: ScoreBreakdown,
    financials: FinancialRow[],
    klines: KlinePoint[],
    hardChecks: HardCheck[],
  ) {
    const latest = financials[0];
    const trendSignal = this.buildPriceSignals(klines)[0]?.value;
    const failedChecks = hardChecks.filter((item) => item.status === 'failed');
    let rating = '等待机会';
    let tone = 'watch';

    if (failedChecks.length) {
      rating = '回避';
      tone = 'cautious';
    } else if (
      scores.total >= 75 &&
      scores.quality >= 65 &&
      scores.growth >= 55 &&
      scores.valuation >= 55
    ) {
      rating = '可以关注';
      tone = 'positive';
    } else if (scores.total >= 60) {
      rating = '等待机会';
      tone = 'watch';
    } else {
      rating = '回避';
      tone = 'cautious';
    }

    const growth =
      latest?.profitGrowth === null || latest?.profitGrowth === undefined
        ? '最新利润增速暂缺'
        : latest.profitGrowth >= 10
          ? '利润保持较快增长'
          : latest.profitGrowth >= 0
            ? '利润仍为正增长'
            : '利润同比承压';
    const valuation =
      scores.valuation >= 70
        ? '估值评分较有吸引力'
        : scores.valuation >= 50
          ? '估值处于中性区间'
          : '当前估值安全边际偏弱';

    return {
      rating,
      tone,
      summary: failedChecks.length
        ? `触发 ${failedChecks.length} 项准入红线：${failedChecks.map((item) => item.label).join('、')}。即使部分评分较高，也优先归入回避。`
        : `${growth}，${valuation}；价格形态为“${trendSignal}”。六维综合评分已扣除 ${scores.riskPenalty} 分风险项，结论适用于未来 3—12 个月的跟踪观察。`,
      rule: '“可以关注”要求无红线失败、总分≥75、公司质量≥65、成长≥55、估值≥55；总分≥60为“等待机会”，其余为“回避”。',
    };
  }

  private buildHardChecks(
    rows: FinancialRow[],
    events: AnalysisEvent[],
  ): HardCheck[] {
    const latest = rows[0];
    const annual = rows.find((row) => row.reportType.includes('年报'));
    const seriousEvents = events.filter((item) =>
      this.isSeriousRiskEvent(item.title),
    );
    const reductionEvents = events.filter((item) =>
      item.title.includes('减持'),
    );
    const goodwillRatio =
      latest?.goodwill !== null &&
      latest?.goodwill !== undefined &&
      (latest?.totalEquity ?? 0) > 0
        ? (latest.goodwill / (latest.totalEquity ?? 1)) * 100
        : null;
    const receivableRatio =
      latest?.accountsReceivable !== null &&
      latest?.accountsReceivable !== undefined &&
      (latest?.totalAssets ?? 0) > 0
        ? (latest.accountsReceivable / (latest.totalAssets ?? 1)) * 100
        : null;
    const receivableGrowthGap =
      latest?.accountsReceivableGrowth !== null &&
      latest?.accountsReceivableGrowth !== undefined &&
      latest?.revenueGrowth !== null &&
      latest?.revenueGrowth !== undefined
        ? latest.accountsReceivableGrowth - latest.revenueGrowth
        : null;
    const receivableRisk =
      (receivableRatio ?? 0) > 35 ||
      ((receivableRatio ?? 0) > 15 &&
        (latest?.accountsReceivableGrowth ?? 0) > 30 &&
        (receivableGrowthGap ?? 0) > 30);

    return [
      {
        label: 'ST与退市标识',
        status: 'passed',
        detail: '未触发范围排除',
      },
      {
        label: '金融行业',
        status: 'passed',
        detail: '未触发行业排除',
      },
      {
        label: '年度盈利',
        status:
          annual?.netProfit === null || annual?.netProfit === undefined
            ? 'unavailable'
            : annual.netProfit > 0
              ? 'passed'
              : 'failed',
        detail:
          annual?.netProfit === null || annual?.netProfit === undefined
            ? '年度利润数据不足'
            : annual.netProfit > 0
              ? '最近年报归母利润为正'
              : '最近年报归母利润为负',
      },
      {
        label: '年度经营现金流',
        status:
          annual?.operatingCash === null || annual?.operatingCash === undefined
            ? 'unavailable'
            : annual.operatingCash >= 0
              ? 'passed'
              : 'failed',
        detail:
          annual?.operatingCash === null || annual?.operatingCash === undefined
            ? '年度现金流数据不足'
            : annual.operatingCash >= 0
              ? '最近年报经营现金流非负'
              : '最近年报经营现金流为负',
      },
      {
        label: '净资产红线',
        status:
          latest?.totalEquity === null || latest?.totalEquity === undefined
            ? 'unavailable'
            : latest.totalEquity > 0
              ? 'passed'
              : 'failed',
        detail:
          latest?.totalEquity === null || latest?.totalEquity === undefined
            ? '净资产数据不足'
            : latest.totalEquity > 0
              ? '最新披露净资产为正'
              : '最新披露净资产不为正',
      },
      {
        label: '高杠杆风险',
        status:
          latest?.debtRatio === null || latest?.debtRatio === undefined
            ? 'unavailable'
            : latest.debtRatio <= 80
              ? 'passed'
              : 'failed',
        detail:
          latest?.debtRatio === null || latest?.debtRatio === undefined
            ? '负债率数据不足'
            : `最新资产负债率 ${latest.debtRatio.toFixed(2)}%`,
      },
      {
        label: '商誉风险',
        status:
          goodwillRatio === null
            ? 'unavailable'
            : goodwillRatio <= 40
              ? 'passed'
              : 'failed',
        detail:
          goodwillRatio === null
            ? '商誉或净资产数据不足'
            : `商誉占净资产 ${goodwillRatio.toFixed(2)}%`,
      },
      {
        label: '应收账款异常',
        status:
          receivableRatio === null
            ? 'unavailable'
            : receivableRisk
              ? 'failed'
              : 'passed',
        detail:
          receivableRatio === null
            ? '应收账款或总资产数据不足'
            : `应收占总资产 ${receivableRatio.toFixed(2)}%，应收增速较营收差 ${receivableGrowthGap?.toFixed(2) ?? '--'} 个百分点`,
      },
      {
        label: '密集减持',
        status: reductionEvents.length >= 2 ? 'failed' : 'passed',
        detail:
          reductionEvents.length >= 2
            ? `近期公开信息出现 ${reductionEvents.length} 条减持事项`
            : '近期未发现密集减持信号',
      },
      {
        label: '重大风险事件',
        status: seriousEvents.length ? 'failed' : 'passed',
        detail: seriousEvents.length
          ? `近期发现 ${seriousEvents.length} 条重大风险类信息`
          : '近期公开信息未触发重大风险词',
      },
    ];
  }

  private isSeriousRiskEvent(title: string): boolean {
    return [
      '立案',
      '退市',
      '财务造假',
      '欺诈发行',
      '重大违法',
      '非标审计',
      '保留意见',
      '无法表示意见',
      '否定意见',
      '内部控制否定意见',
      '内部控制无法表示意见',
      '非标准内部控制审计',
      '重大诉讼',
      '资金占用',
      '违规担保',
      '质押风险',
    ].some((word) => title.includes(word));
  }

  private buildPositiveFactors(
    rows: FinancialRow[],
    klines: KlinePoint[],
    scores: ScoreBreakdown,
  ): string[] {
    const latest = rows[0];
    const items: string[] = [];
    if ((latest?.roe ?? 0) >= 15)
      items.push(`最新披露 ROE 为 ${latest?.roe?.toFixed(2)}%，盈利能力较强`);
    if ((latest?.cashProfitRatio ?? 0) >= 0.7)
      items.push('经营现金流与净利润匹配度较好');
    if ((latest?.debtRatio ?? 100) <= 40)
      items.push(
        `资产负债率为 ${latest?.debtRatio?.toFixed(2)}%，财务杠杆较低`,
      );
    if (scores.trend >= 70) items.push('中期价格趋势评分较强');
    if (
      this.periodReturn(
        klines.map((item) => item.close),
        60,
      ) > 0
    )
      items.push('近60个交易日价格收益为正');
    return items.slice(0, 4).length
      ? items.slice(0, 4)
      : ['当前没有足够强的积极信号'];
  }

  private buildRiskFactors(
    rows: FinancialRow[],
    klines: KlinePoint[],
    events: AnalysisEvent[],
    quote: JsonRecord,
  ): string[] {
    const latest = rows[0];
    const items: string[] = [];
    if ((latest?.revenueGrowth ?? 0) < 0)
      items.push(
        `最新营收同比下降 ${Math.abs(latest?.revenueGrowth ?? 0).toFixed(2)}%`,
      );
    if ((latest?.profitGrowth ?? 0) < 0)
      items.push(
        `最新扣非利润同比下降 ${Math.abs(latest?.profitGrowth ?? 0).toFixed(2)}%`,
      );
    if ((latest?.operatingCash ?? 0) < 0) items.push('最新披露经营现金流为负');
    if ((latest?.debtRatio ?? 0) > 70)
      items.push(`资产负债率达到 ${latest?.debtRatio?.toFixed(2)}%`);
    if ((latest?.totalEquity ?? 1) <= 0) items.push('最新披露净资产不为正');
    if (
      (latest?.goodwill ?? 0) > 0 &&
      (latest?.totalEquity ?? 0) > 0 &&
      ((latest?.goodwill ?? 0) / (latest?.totalEquity ?? 1)) * 100 > 30
    )
      items.push(
        `商誉占净资产 ${(((latest?.goodwill ?? 0) / (latest?.totalEquity ?? 1)) * 100).toFixed(2)}%，需关注减值风险`,
      );
    const receivableRatio =
      (latest?.accountsReceivable ?? 0) > 0 && (latest?.totalAssets ?? 0) > 0
        ? ((latest?.accountsReceivable ?? 0) / (latest?.totalAssets ?? 1)) * 100
        : null;
    const receivableGrowthGap =
      latest?.accountsReceivableGrowth !== null &&
      latest?.accountsReceivableGrowth !== undefined &&
      latest?.revenueGrowth !== null &&
      latest?.revenueGrowth !== undefined
        ? latest.accountsReceivableGrowth - latest.revenueGrowth
        : null;
    if (
      (receivableRatio ?? 0) > 35 ||
      ((receivableRatio ?? 0) > 15 &&
        (latest?.accountsReceivableGrowth ?? 0) > 30 &&
        (receivableGrowthGap ?? 0) > 30)
    )
      items.push(
        `应收账款占总资产 ${receivableRatio?.toFixed(2)}%，回款质量需重点核实`,
      );
    const pe = this.scaledNumber(quote.f162);
    if ((pe ?? 0) > 60)
      items.push(`当前 PE-TTM 约为 ${pe?.toFixed(2)} 倍，估值风险较高`);
    const negativeEvents = events.filter((item) => item.tone === 'warning');
    if (negativeEvents.length)
      items.push(
        `近期发现 ${negativeEvents.length} 条风险类公告或新闻，需要核实影响`,
      );
    const reductionEvents = events.filter((item) =>
      item.title.includes('减持'),
    );
    if (reductionEvents.length >= 2)
      items.push(`近期出现 ${reductionEvents.length} 条减持事项`);
    const return20 = this.periodReturn(
      klines.map((item) => item.close),
      20,
    );
    if (return20 < -10)
      items.push(
        `近20个交易日下跌 ${Math.abs(return20).toFixed(2)}%，价格趋势偏弱`,
      );
    return items.slice(0, 4).length
      ? items.slice(0, 4)
      : ['当前公开数据未触发重大风险扣分项'];
  }

  private buildWatchlist(
    rows: FinancialRow[],
    klines: KlinePoint[],
    scores: ScoreBreakdown,
  ): string[] {
    const latest = rows[0];
    const closes = klines.map((item) => item.close);
    const ma60 = this.average(closes.slice(-60));
    return [
      `下一期营收与扣非利润能否改善（当前分别为 ${this.formatNullablePercent(latest?.revenueGrowth)}、${this.formatNullablePercent(latest?.profitGrowth)}）`,
      `经营现金流/净利润比能否保持稳定（当前 ${latest?.cashProfitRatio === null || latest?.cashProfitRatio === undefined ? '--' : latest.cashProfitRatio.toFixed(2)}）`,
      `股价能否守住60日均线附近 ${ma60.toFixed(2)} 元（当前趋势评分 ${scores.trend}）`,
    ];
  }

  private eventTone(text: string): 'positive' | 'neutral' | 'warning' {
    if (/没有回购计划|暂无回购计划|无回购计划|不实施回购/.test(text)) {
      return 'neutral';
    }
    if (NEGATIVE_EVENT_WORDS.some((word) => text.includes(word)))
      return 'warning';
    if (POSITIVE_EVENT_WORDS.some((word) => text.includes(word)))
      return 'positive';
    return 'neutral';
  }

  private eventScoreNote(score: number): string {
    if (score >= 65) return '近期事件偏积极';
    if (score < 45) return '风险事件需关注';
    return '近期事件偏中性';
  }

  private growthScoreNote(score: number): string {
    if (score >= 75) return '收入利润成长较强';
    if (score >= 55) return '成长表现中性';
    return '成长动能偏弱';
  }

  private safetyScoreNote(score: number): string {
    if (score >= 75) return '现金流与杠杆稳健';
    if (score >= 55) return '财务安全中性';
    return '财务安全需关注';
  }

  private valuationNote(pe: number | null): string {
    if (pe === null || pe <= 0) return '常用估值暂不可用';
    if (pe <= 25) return 'PE处于较低区间';
    if (pe <= 45) return 'PE处于中性区间';
    return 'PE处于偏高区间';
  }

  private scoreNote(score: number, label: string): string {
    if (score >= 75) return `${label}较强`;
    if (score >= 55) return `${label}中性`;
    return `${label}偏弱`;
  }

  private cashQuality(row: FinancialRow): string {
    if (row.operatingCash !== null && row.operatingCash < 0) return '偏弱';
    if ((row.cashProfitRatio ?? 0) >= 0.8) return '良好';
    if ((row.cashProfitRatio ?? 0) >= 0.4) return '稳定';
    return '需关注';
  }

  private rangeScore(
    value: number | null,
    ranges: Array<[minimum: number, score: number]>,
  ): number {
    if (value === null) return 50;
    for (const [minimum, score] of ranges) {
      if (value >= minimum) return score;
    }
    return 15;
  }

  private periodReturn(values: number[], days: number): number {
    if (values.length < 2) return 0;
    const latest = values.at(-1) ?? 0;
    const base = values.at(-Math.min(days + 1, values.length)) ?? latest;
    return base > 0 ? (latest / base - 1) * 100 : 0;
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private downsample(values: number[], target: number): number[] {
    if (values.length <= target) return values;
    return Array.from({ length: target }, (_, index) => {
      const position = Math.round((index / (target - 1)) * (values.length - 1));
      return values[position];
    });
  }

  private async fetchText(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: this.sourceHeaders(url),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 200 * (attempt + 1)),
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    const message = lastError instanceof Error ? lastError.message : '未知错误';
    throw new BadGatewayException(
      `公开数据源 ${new URL(url).hostname} 请求失败：${message}`,
    );
  }

  private async fetchOptionalJson(url: string): Promise<JsonRecord | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.sourceHeaders(url),
      });
      if (!response.ok) return null;
      const text = (await response.text()).trim();
      if (!text) return null;
      return this.asRecord(JSON.parse(text));
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson(url: string): Promise<JsonRecord> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: this.sourceHeaders(url),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const trimmed = text.trim();
        const json =
          trimmed.startsWith('{') || trimmed.startsWith('[')
            ? trimmed
            : trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')'));
        return this.asRecord(JSON.parse(json));
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    const message = lastError instanceof Error ? lastError.message : '未知错误';
    throw new BadGatewayException(
      `公开数据源 ${new URL(url).hostname} 请求失败：${message}`,
    );
  }

  private sourceHeaders(url: string): Record<string, string> {
    const hostname = new URL(url).hostname;
    const referer = hostname.includes('qq.com')
      ? 'https://gu.qq.com/'
      : hostname.includes('sina.com.cn')
        ? 'https://finance.sina.com.cn/'
        : 'https://www.eastmoney.com/';
    return {
      Accept: 'application/json,text/plain,*/*',
      Referer: referer,
      'User-Agent':
        'Mozilla/5.0 (compatible; AStockResearch/2.0; public-market-data)',
    };
  }

  private async probeSource(
    name: string,
    url: string,
    validate: (text: string) => boolean,
  ): Promise<JsonRecord> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.sourceHeaders(url),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!validate(text)) throw new Error('返回内容校验失败');
      return { name, status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        name,
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : '请求失败',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toSecucode(stock: SearchStock): string {
    const suffix = this.marketPrefix(stock.QuoteID).toUpperCase();
    return `${stock.Code}.${suffix}`;
  }

  private exchangeName(quoteId: string): string {
    const prefix = this.marketPrefix(quoteId);
    return prefix === 'sh'
      ? '沪市A股'
      : prefix === 'bj'
        ? '北交所A股'
        : '深市A股';
  }

  private f10Code(quoteId: string): string {
    const [, code] = quoteId.split('.');
    return `${this.marketPrefix(quoteId).toUpperCase()}${code}`;
  }

  private quotePageCode(quoteId: string): string {
    const [, code] = quoteId.split('.');
    return `${this.marketPrefix(quoteId)}${code}`;
  }

  private marketPrefix(quoteId: string): 'sh' | 'sz' | 'bj' {
    const [market, code = ''] = quoteId.split('.');
    if (/^(4|8|92)/.test(code)) return 'bj';
    return market === '1' ? 'sh' : 'sz';
  }

  private formatPrice(value: number | null): string {
    return value === null ? '--' : value.toFixed(2);
  }

  private formatPercent(value: number | null, includeSign = true): string {
    if (value === null || !Number.isFinite(value)) return '--';
    const sign = includeSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  private formatNullablePercent(value?: number | null): string {
    return value === null || value === undefined
      ? '--'
      : this.formatPercent(value);
  }

  private formatMarketCap(value: number | null): string {
    if (value === null) return '--';
    const yi = value / 100_000_000;
    return yi >= 10_000
      ? `${(yi / 10_000).toFixed(2)}万亿`
      : `${yi.toFixed(2)}亿`;
  }

  private scaledNumber(value: unknown): number | null {
    const number = this.nullableNumber(value);
    return number === null ? null : number / 100;
  }

  private nullableNumber(value: unknown): number | null {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      value === '-'
    ) {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private asNumber(value: unknown): number | null {
    return this.nullableNumber(value);
  }

  private asString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private asRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private shortDate(value: unknown): string {
    return this.asString(value).slice(0, 10);
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
