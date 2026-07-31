import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateHistoryDto {
  @IsArray({ message: 'numbers 必须是数组' })
  @ArrayMinSize(7, { message: 'numbers 必须恰好包含 7 个数字' })
  @ArrayMaxSize(7, { message: 'numbers 必须恰好包含 7 个数字' })
  @ArrayUnique({ message: 'numbers 不能包含重复数字' })
  @IsInt({ each: true, message: 'numbers 中的每一项都必须是整数' })
  @Min(1, { each: true, message: 'numbers 中的数字不能小于 1' })
  @Max(49, { each: true, message: 'numbers 中的数字不能大于 49' })
  numbers: number[];

  @IsOptional()
  @IsInt({ message: 'year 必须是整数' })
  @Min(2000, { message: 'year 不能小于 2000' })
  @Max(2100, { message: 'year 不能大于 2100' })
  year?: number;

  @IsOptional()
  @IsInt({ message: 'No 必须是整数' })
  @Min(1, { message: 'No 必须大于等于 1' })
  No?: number;
}

export class SyncHistoryDto {
  @IsInt({ message: 'year 必须是整数' })
  @Min(2000, { message: 'year 不能小于 2000' })
  @Max(2100, { message: 'year 不能大于 2100' })
  year: number;
}
