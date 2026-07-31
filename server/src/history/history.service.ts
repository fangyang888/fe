import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { History } from './history.entity';
import { loadSpider } from '../common/spider-loader';

type HistorySyncItem = {
  year?: number;
  No?: number;
  items: number[];
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
  ): Promise<History> {
    if (numbers.length !== 7) {
      throw new BadRequestException('需要恰好 7 个数字');
    }
    this.validatePeriodPair(year, No);
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
    });
    return this.historyRepo.save(record);
  }

  async syncYear(year: number) {
    const records = await this.fetchOnlineYear(year);
    let inserted = 0;
    let skipped = 0;
    const insertedRecords: History[] = [];

    for (const item of records) {
      const itemYear = item.year || year;
      if (await this.existsByYearNo(itemYear, item.No)) {
        skipped++;
        continue;
      }
      const saved = await this.create(item.items, itemYear, item.No);
      inserted++;
      insertedRecords.push(saved);
    }

    return {
      year,
      fetched: records.length,
      inserted,
      skipped,
      records: insertedRecords,
    };
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
    if (await this.existsByYearNo(itemYear, latest.No)) {
      return {
        year,
        sourceYear,
        inserted: 0,
        skipped: 1,
        record: null,
        message: `第 ${itemYear} 年第 ${latest.No} 期数据已存在`,
      };
    }

    const saved = await this.create(latest.items, itemYear, latest.No);
    return {
      year,
      sourceYear,
      inserted: 1,
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
  ): Promise<History> {
    if (numbers.length !== 7) {
      throw new BadRequestException('需要恰好 7 个数字');
    }
    this.validatePeriodPair(year, No);
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
}
