import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LotteryNumberInfoDto {
  @IsInt({ message: 'numberInfos.number 必须是整数' })
  @Min(1, { message: 'numberInfos.number 不能小于 1' })
  @Max(49, { message: 'numberInfos.number 不能大于 49' })
  number: number;

  @IsIn(['红', '蓝', '绿'], { message: 'numberInfos.color 必须是红、蓝或绿' })
  color: '红' | '蓝' | '绿';

  @IsString({ message: 'numberInfos.zodiac 必须是字符串' })
  @IsIn(
    ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'],
    {
      message: 'numberInfos.zodiac 必须是有效生肖',
    },
  )
  zodiac: string;
}

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
  @IsArray({ message: 'numberInfos 必须是数组' })
  @ArrayMinSize(7, { message: 'numberInfos 必须恰好包含 7 项' })
  @ArrayMaxSize(7, { message: 'numberInfos 必须恰好包含 7 项' })
  @ValidateNested({ each: true })
  @Type(() => LotteryNumberInfoDto)
  numberInfos?: LotteryNumberInfoDto[];

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
