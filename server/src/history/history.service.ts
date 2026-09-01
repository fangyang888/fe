import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { History, LotteryNumberInfo } from './history.entity';
import { loadSpider } from '../common/spider-loader';

type HistorySyncItem = {
  year?: number;
  No?: number;
  items: number[];
  numberInfos?: LotteryNumberInfo[];
};

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(History)
    private readonly historyRepo: Repository<History>,
  ) {}

  /** 获取记录（可选年份过滤，按 id 升序） */
  async findAll(year?: number): Promise<History[]> {
    const where: any = {};
    if (year) {
      where.year = year;
    }
    return this.historyRepo.find({
      where,
      order: { year: 'ASC', No: 'ASC', id: 'ASC' },
    });
  }

  async existsByYearNo(year?: number, No?: number): Promise<boolean> {
    if (year === undefined || No === undefined) return false;
    const count = await this.historyRepo.count({ where: { year, No } });
    return count > 0;
  }

  async findByYearNo(year: number, No: number): Promise<History | null> {
    return this.historyRepo.findOneBy({ year, No });
  }

  /** 获取单条记录 */
  async findOne(id: number): Promise<History> {
    const record = await this.historyRepo.findOneBy({ id });
    if (!record) {
      throw new NotFoundException(`History #${id} not found`);
    }
    return record;
  }

  /** 新增一行 */
  async create(
    numbers: number[],
    year?: number,
    No?: number,
    numberInfos?: LotteryNumberInfo[],
  ): Promise<History> {
    if (numbers.length !== 7) {
      throw new BadRequestException('需要恰好 7 个数字');
    }
    this.validatePeriodPair(year, No);
    this.validateNumberInfos(numbers, numberInfos);
    if (await this.existsByYearNo(year, No)) {
      throw new ConflictException(`第 ${year} 年第 ${No} 期数据已存在`);
    }
    const record = this.historyRepo.create({
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      n6: numbers[5],
      n7: numbers[6],
      year,
      No,
      numberInfos,
    });
    return this.historyRepo.save(record);
  }

  async syncYear(year: number) {
    const records = await this.fetchYear(year);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const insertedRecords: History[] = [];

    for (const item of records) {
      const itemYear = item.year || year;
      if (item.No === undefined) {
        skipped++;
        continue;
      }
      const existing = await this.findByYearNo(itemYear, item.No);
      if (existing) {
        const changed = this.applySyncItem(existing, item);
        if (changed) {
          await this.historyRepo.save(existing);
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      const saved = await this.create(
        item.items,
        itemYear,
        item.No,
        item.numberInfos,
      );
      inserted++;
      insertedRecords.push(saved);
    }

    return {
      year,
      fetched: records.length,
      inserted,
      updated,
      skipped,
      records: insertedRecords,
    };
  }

  private async fetchYear(year: number): Promise<HistorySyncItem[]> {
    try {
      const spider = loadSpider();
      const records = await spider.fetchLotteryData(year);
      if (Array.isArray(records) && records.length > 0) return records;
    } catch {
      // Local environments may not be able to reach the upstream HTTPS port.
      // In that case, keep the existing online API fallback.
    }
    return this.fetchOnlineYear(year);
  }

  private async fetchOnlineYear(year: number): Promise<HistorySyncItem[]> {
    const baseUrl =
      process.env.HISTORY_SYNC_SOURCE_URL || 'http://47.106.103.79/api/history';
    const url = `${baseUrl}?year=${encodeURIComponent(year)}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`线上历史数据读取失败：HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('线上历史数据格式不正确');
    }

    return data.map((item) => ({
      year: item.year || year,
      No: item.No,
      items: [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7],
      numberInfos: item.numberInfos,
    }));
  }

  async syncLatest(year: number) {
    const spider = loadSpider();
    let sourceYear = year;
    let records = await spider.fetchLotteryData(sourceYear);
    while (records.length === 0 && sourceYear > year - 3) {
      sourceYear--;
      records = await spider.fetchLotteryData(sourceYear);
    }
    const latest = [...records].sort((a, b) => b.No - a.No)[0];
    if (!latest) {
      return {
        year,
        sourceYear,
        inserted: 0,
        skipped: 0,
        record: null,
        message: '未抓取到数据',
      };
    }

    const itemYear = latest.year || year;
    const existing = await this.findByYearNo(itemYear, latest.No);
    if (existing) {
      const changed = this.applySyncItem(existing, latest);
      if (changed) {
        const saved = await this.historyRepo.save(existing);
        return {
          year,
          sourceYear,
          inserted: 0,
          updated: 1,
          skipped: 0,
          record: saved,
          message: `已更新第 ${itemYear} 年第 ${latest.No} 期附加信息`,
        };
      }
      return {
        year,
        sourceYear,
        inserted: 0,
        updated: 0,
        skipped: 1,
        record: null,
        message: `第 ${itemYear} 年第 ${latest.No} 期数据已存在`,
      };
    }

    const saved = await this.create(
      latest.items,
      itemYear,
      latest.No,
      latest.numberInfos,
    );
    return {
      year,
      sourceYear,
      inserted: 1,
      updated: 0,
      skipped: 0,
      record: saved,
      message: `已同步第 ${itemYear} 年第 ${latest.No} 期`,
    };
  }

  /** 修改一行 */
  async update(
    id: number,
    numbers: number[],
    year?: number,
    No?: number,
    numberInfos?: LotteryNumberInfo[],
  ): Promise<History> {
    if (numbers.length !== 7) {
      throw new BadRequestException('需要恰好 7 个数字');
    }
    this.validatePeriodPair(year, No);
    this.validateNumberInfos(numbers, numberInfos);
    const record = await this.findOne(id);
    record.n1 = numbers[0];
    record.n2 = numbers[1];
    record.n3 = numbers[2];
    record.n4 = numbers[3];
    record.n5 = numbers[4];
    record.n6 = numbers[5];
    record.n7 = numbers[6];
    if (year !== undefined) record.year = year;
    if (No !== undefined) record.No = No;
    if (numberInfos !== undefined) record.numberInfos = numberInfos;
    return this.historyRepo.save(record);
  }

  /** 删除一行 */
  async remove(id: number): Promise<void> {
    const record = await this.findOne(id);
    await this.historyRepo.remove(record);
  }

  /** 以纯文本格式返回（兼容前端 history.txt 格式） */
  async getAsText(year?: number): Promise<string> {
    const records = await this.findAll(year);
    return records
      .map((r) => `${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.n6},${r.n7}`)
      .join('\n');
  }

  /**
   * year 和 No 描述同一期数据，必须同时提供或同时省略。
   * 这是跨字段业务规则，因此放在 Service，而不是单个字段的 DTO 装饰器中。
   */
  private validatePeriodPair(year?: number, No?: number): void {
    const onlyOneProvided =
      (year !== undefined && No === undefined) ||
      (year === undefined && No !== undefined);

    if (onlyOneProvided) {
      throw new BadRequestException('year 和 No 必须同时提供');
    }
  }

  private validateNumberInfos(
    numbers: number[],
    numberInfos?: LotteryNumberInfo[],
  ): void {
    if (numberInfos === undefined) return;
    if (numberInfos.length !== 7) {
      throw new BadRequestException('numberInfos 需要恰好 7 项');
    }
    const validColors = new Set(['红', '蓝', '绿']);
    const validZodiacs = new Set([
      '鼠',
      '牛',
      '虎',
      '兔',
      '龙',
      '蛇',
      '马',
      '羊',
      '猴',
      '鸡',
      '狗',
      '猪',
    ]);
    const invalidIndex = numberInfos.findIndex(
      (info, index) =>
        info.number !== numbers[index] ||
        !validColors.has(info.color) ||
        !validZodiacs.has(info.zodiac),
    );
    if (invalidIndex !== -1) {
      throw new BadRequestException(
        `numberInfos 第 ${invalidIndex + 1} 项与号码顺序不一致或属性无效`,
      );
    }
  }

  private applySyncItem(record: History, item: HistorySyncItem): boolean {
    this.validateNumberInfos(item.items, item.numberInfos);
    const currentNumbers = [
      record.n1,
      record.n2,
      record.n3,
      record.n4,
      record.n5,
      record.n6,
      record.n7,
    ];
    const numbersChanged = currentNumbers.some(
      (number, index) => number !== item.items[index],
    );
    const infosChanged =
      item.numberInfos !== undefined &&
      JSON.stringify(record.numberInfos || null) !==
        JSON.stringify(item.numberInfos);

    if (numbersChanged) {
      record.n1 = item.items[0];
      record.n2 = item.items[1];
      record.n3 = item.items[2];
      record.n4 = item.items[3];
      record.n5 = item.items[4];
      record.n6 = item.items[5];
      record.n7 = item.items[6];
    }
    if (infosChanged) record.numberInfos = item.numberInfos;
    return numbersChanged || infosChanged;
  }
}
