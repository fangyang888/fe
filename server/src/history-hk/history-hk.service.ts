import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync } from 'fs';
import { join } from 'path';
import { HistoryHk } from './history-hk.entity';

@Injectable()
export class HistoryHkService {
  constructor(
    @InjectRepository(HistoryHk)
    private readonly historyHkRepo: Repository<HistoryHk>,
  ) {}

  /** 获取记录（可选年份过滤，按 id 升序） */
  async findAll(year?: number): Promise<HistoryHk[]> {
    const where: any = {};
    if (year) {
      where.year = year;
    }
    return this.historyHkRepo.find({
      where,
      order: { id: 'ASC' },
    });
  }

  async existsByYearNo(year?: number, No?: number): Promise<boolean> {
    if (year === undefined || No === undefined) return false;
    const count = await this.historyHkRepo.count({ where: { year, No } });
    return count > 0;
  }

  /** 获取单条记录 */
  async findOne(id: number): Promise<HistoryHk> {
    const record = await this.historyHkRepo.findOneBy({ id });
    if (!record) {
      throw new NotFoundException(`HistoryHk #${id} not found`);
    }
    return record;
  }

  /** 新增一行 */
  async create(numbers: number[], year?: number, No?: number): Promise<HistoryHk> {
    if (numbers.length !== 7) {
      throw new Error('需要恰好 7 个数字');
    }
    if (await this.existsByYearNo(year, No)) {
      throw new ConflictException(`第 ${year} 年第 ${No} 期数据已存在`);
    }
    const record = this.historyHkRepo.create({
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
    return this.historyHkRepo.save(record);
  }

  private loadSpider() {
    const candidates = [
      join(process.cwd(), 'spider.js'),
      join(process.cwd(), 'server', 'spider.js'),
      join(__dirname, '..', '..', 'spider.js'),
      join(__dirname, '..', '..', '..', 'spider.js'),
    ];
    const spiderPath = candidates.find((path) => existsSync(path));
    if (!spiderPath) {
      throw new Error(`找不到 spider.js，已尝试：${candidates.join(', ')}`);
    }
    delete require.cache[require.resolve(spiderPath)];
    return require(spiderPath);
  }

  async syncYear(year: number) {
    const spider = this.loadSpider();
    const records = await spider.fetchLotteryData(year, { type: 'hk' });
    let inserted = 0;
    let skipped = 0;
    const insertedRecords: HistoryHk[] = [];

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

  async syncLatest(year: number) {
    const spider = this.loadSpider();
    let sourceYear = year;
    let records = await spider.fetchLotteryData(sourceYear, { type: 'hk' });
    while (records.length === 0 && sourceYear > year - 3) {
      sourceYear--;
      records = await spider.fetchLotteryData(sourceYear, { type: 'hk' });
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
  async update(id: number, numbers: number[], year?: number, No?: number): Promise<HistoryHk> {
    if (numbers.length !== 7) {
      throw new Error('需要恰好 7 个数字');
    }
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
    return this.historyHkRepo.save(record);
  }

  /** 删除一行 */
  async remove(id: number): Promise<void> {
    const record = await this.findOne(id);
    await this.historyHkRepo.remove(record);
  }

  /** 以纯文本格式返回（兼容前端 history.txt 格式） */
  async getAsText(year?: number): Promise<string> {
    const records = await this.findAll(year);
    return records
      .map((r) => `${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.n6},${r.n7}`)
      .join('\n');
  }
}
