import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHistoryDto } from './history.dto';

describe('CreateHistoryDto', () => {
  it('接受合法数据', async () => {
    const dto = plainToInstance(CreateHistoryDto, {
      numbers: [1, 2, 3, 4, 5, 6, 7],
      year: 2026,
      No: 1,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('接受与 7 个号码对应的颜色和生肖信息', async () => {
    const dto = plainToInstance(CreateHistoryDto, {
      numbers: [1, 2, 3, 4, 5, 6, 7],
      numberInfos: [
        { number: 1, color: '红', zodiac: '鼠' },
        { number: 2, color: '蓝', zodiac: '牛' },
        { number: 3, color: '绿', zodiac: '虎' },
        { number: 4, color: '红', zodiac: '兔' },
        { number: 5, color: '蓝', zodiac: '龙' },
        { number: 6, color: '绿', zodiac: '蛇' },
        { number: 7, color: '红', zodiac: '马' },
      ],
      year: 2026,
      No: 1,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('拒绝数量不是 7 个的数据', async () => {
    const dto = plainToInstance(CreateHistoryDto, {
      numbers: [1, 2, 3],
      year: 2026,
      No: 1,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'numbers')).toBe(true);
  });

  it('拒绝重复和超出范围的数字', async () => {
    const dto = plainToInstance(CreateHistoryDto, {
      numbers: [1, 1, 3, 4, 5, 6, 50],
      year: 2026,
      No: 1,
    });

    const errors = await validate(dto);
    const numbersError = errors.find((error) => error.property === 'numbers');

    expect(numbersError?.constraints).toHaveProperty('arrayUnique');
    expect(numbersError?.constraints).toHaveProperty('max');
  });

  it('拒绝非法颜色或生肖', async () => {
    const dto = plainToInstance(CreateHistoryDto, {
      numbers: [1, 2, 3, 4, 5, 6, 7],
      numberInfos: Array.from({ length: 7 }, (_, index) => ({
        number: index + 1,
        color: index === 0 ? '黄' : '红',
        zodiac: index === 1 ? '猫' : '鼠',
      })),
      year: 2026,
      No: 1,
    });

    const errors = await validate(dto);
    const infosError = errors.find((error) => error.property === 'numberInfos');

    expect(infosError?.children?.length).toBeGreaterThan(0);
  });
});
