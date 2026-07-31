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
});
