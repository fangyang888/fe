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
    const industry = this.asString(company.EM2016) || this.asString(company.INDUSTRYCSRC1);
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
    const assessment = this.buildAssessment(scores, financeRows, klines, hardChecks);
    const latestKline = klines.at(-1);
    const latestFinance = financeRows[0];
    const annualFinancials = financeRows
      .filter((row) => row.reportType.includes('年报'))
      .slice(0, 3)
      .reverse();
    const displayFinancials = [
      ...annualFinancials,
      ...(latestFinance && !latestFinance.reportType.includes('年报') ? [latestFinance] : []),
    ].slice(-4);
    const priceSignals = this.buildPriceSignals(klines);
    const riskFactors = this.buildRiskFactors(financeRows, klines, events, quote);
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
      chart: this.downsample(klines.map((item) => item.close), 24),
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
      candidates.find((item) => item.Code === normalized || item.Name === query) ||
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
    const payload = await this.fetchJson(
      `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`,
    );
    const result = this.asRecord(payload.result);
    const rows = Array.isArray(result.data) ? result.data : [];

    return rows.map((item) => {
      const row = this.asRecord(item);
      return {
        period: this.asString(row.REPORT_DATE_NAME) || this.shortDate(row.REPORT_DATE),
        reportType: this.asString(row.REPORT_TYPE),
        noticeDate: this.shortDate(row.NOTICE_DATE),
        revenueGrowth: this.nullableNumber(row.TOTALOPERATEREVETZ),
        profitGrowth: this.nullableNumber(row.KCFJCXSYJLRTZ ?? row.PARENTNETPROFITTZ),
        roe: this.nullableNumber(row.ROEJQ),
        grossMargin: this.nullableNumber(row.XSMLL),
        debtRatio: this.nullableNumber(row.ZCFZL),
        operatingCash: this.nullableNumber(row.NETCASH_OPERATE_PK),
        netProfit: this.nullableNumber(row.PARENTNETPROFIT),
        cashProfitRatio: this.nullableNumber(row.NCO_NETPROFIT),
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
          detail: this.truncate(this.stripHtml(this.asString(row.content)), 150),
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
    const eventPositive = events.filter((item) => item.tone === 'positive').length;
    const eventNegative = events.filter((item) => item.tone === 'warning').length;
    const catalysts = this.clamp(50 + eventPositive * 6 - eventNegative * 8, 10, 90);
    const safety = latest ? this.safetyScore(latest, annual) : 35;
    let riskPenalty = 0;

    if (latest) {
      if ((latest.profitGrowth ?? 0) < -20) riskPenalty += 6;
      if ((latest.revenueGrowth ?? 0) < -10) riskPenalty += 4;
      if ((latest.debtRatio ?? 0) > 80) riskPenalty += 10;
    }
    if ((annual?.operatingCash ?? 0) < 0) riskPenalty += 10;
    if ((annual?.netProfit ?? 0) < 0) riskPenalty += 15;
    if (events.some((item) => this.isSeriousRiskEvent(item.title))) riskPenalty += 10;
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
      roe * 0.34 +
        margin * 0.22 +
        cash * 0.3 +
        profitQuality * 0.14,
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
          (row.revenueGrowth ?? -1) >= 0 &&
          (row.profitGrowth ?? -1) >= 0,
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
    const drawdown = high120 > 0 ? ((latest / high120) - 1) * 100 : 0;
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
        value: volumeRatio >= 1.25 ? '近期放量' : volumeRatio <= 0.75 ? '近期缩量' : '量能平稳',
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
          ? ((latest.close / start.close) - 1) * 100
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
      rule:
        '“可以关注”要求无红线失败、总分≥75、公司质量≥65、成长≥55、估值≥55；总分≥60为“等待机会”，其余为“回避”。',
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
      '无法表示意见',
      '否定意见',
    ].some((word) => title.includes(word));
  }

  private buildPositiveFactors(
    rows: FinancialRow[],
    klines: KlinePoint[],
    scores: ScoreBreakdown,
  ): string[] {
    const latest = rows[0];
    const items: string[] = [];
    if ((latest?.roe ?? 0) >= 15) items.push(`最新披露 ROE 为 ${latest?.roe?.toFixed(2)}%，盈利能力较强`);
    if ((latest?.cashProfitRatio ?? 0) >= 0.7) items.push('经营现金流与净利润匹配度较好');
    if ((latest?.debtRatio ?? 100) <= 40) items.push(`资产负债率为 ${latest?.debtRatio?.toFixed(2)}%，财务杠杆较低`);
    if (scores.trend >= 70) items.push('中期价格趋势评分较强');
    if (this.periodReturn(klines.map((item) => item.close), 60) > 0) items.push('近60个交易日价格收益为正');
    return items.slice(0, 4).length ? items.slice(0, 4) : ['当前没有足够强的积极信号'];
  }

  private buildRiskFactors(
    rows: FinancialRow[],
    klines: KlinePoint[],
    events: AnalysisEvent[],
    quote: JsonRecord,
  ): string[] {
    const latest = rows[0];
    const items: string[] = [];
    if ((latest?.revenueGrowth ?? 0) < 0) items.push(`最新营收同比下降 ${Math.abs(latest?.revenueGrowth ?? 0).toFixed(2)}%`);
    if ((latest?.profitGrowth ?? 0) < 0) items.push(`最新扣非利润同比下降 ${Math.abs(latest?.profitGrowth ?? 0).toFixed(2)}%`);
    if ((latest?.operatingCash ?? 0) < 0) items.push('最新披露经营现金流为负');
    if ((latest?.debtRatio ?? 0) > 70) items.push(`资产负债率达到 ${latest?.debtRatio?.toFixed(2)}%`);
    const pe = this.scaledNumber(quote.f162);
    if ((pe ?? 0) > 60) items.push(`当前 PE-TTM 约为 ${pe?.toFixed(2)} 倍，估值风险较高`);
    const negativeEvents = events.filter((item) => item.tone === 'warning');
    if (negativeEvents.length) items.push(`近期发现 ${negativeEvents.length} 条风险类公告或新闻，需要核实影响`);
    const return20 = this.periodReturn(klines.map((item) => item.close), 20);
    if (return20 < -10) items.push(`近20个交易日下跌 ${Math.abs(return20).toFixed(2)}%，价格趋势偏弱`);
    return items.slice(0, 4).length ? items.slice(0, 4) : ['当前公开数据未触发重大风险扣分项'];
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
    if (NEGATIVE_EVENT_WORDS.some((word) => text.includes(word))) return 'warning';
    if (POSITIVE_EVENT_WORDS.some((word) => text.includes(word))) return 'positive';
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
    return base > 0 ? ((latest / base) - 1) * 100 : 0;
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
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
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

  private async fetchJson(url: string): Promise<JsonRecord> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json,text/plain,*/*',
            Referer: 'https://www.eastmoney.com/',
            'User-Agent':
              'Mozilla/5.0 (compatible; AStockResearch/1.0; public-market-data)',
          },
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

  private toSecucode(stock: SearchStock): string {
    const suffix = this.marketPrefix(stock.QuoteID).toUpperCase();
    return `${stock.Code}.${suffix}`;
  }

  private exchangeName(quoteId: string): string {
    const prefix = this.marketPrefix(quoteId);
    return prefix === 'sh' ? '沪市A股' : prefix === 'bj' ? '北交所A股' : '深市A股';
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
    return value === null || value === undefined ? '--' : this.formatPercent(value);
  }

  private formatMarketCap(value: number | null): string {
    if (value === null) return '--';
    const yi = value / 100_000_000;
    return yi >= 10_000 ? `${(yi / 10_000).toFixed(2)}万亿` : `${yi.toFixed(2)}亿`;
  }

  private scaledNumber(value: unknown): number | null {
    const number = this.nullableNumber(value);
    return number === null ? null : number / 100;
  }

  private nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || value === '-') {
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
    return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
