import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { History } from './history.entity';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(History)
    private readonly historyRepo: Repository<History>,
  ) {}

  /** 获取所有记录（按 id 升序） */
  async findAll(): Promise<History[]> {
    return this.historyRepo.find({ order: { id: 'ASC' } });
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
  async create(numbers: number[], year?: number, No?: number): Promise<History> {
    if (numbers.length !== 7) {
      throw new Error('需要恰好 7 个数字');
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

  /** 修改一行 */
  async update(id: number, numbers: number[], year?: number, No?: number): Promise<History> {
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
    return this.historyRepo.save(record);
  }

  /** 删除一行 */
  async remove(id: number): Promise<void> {
    const record = await this.findOne(id);
    await this.historyRepo.remove(record);
  }

  /** 以纯文本格式返回（兼容前端 history.txt 格式） */
  async getAsText(): Promise<string> {
    const records = await this.findAll();
    return records
      .map((r) => `${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.n6},${r.n7}`)
      .join('\n');
  }
}
