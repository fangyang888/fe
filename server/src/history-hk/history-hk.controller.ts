import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Header,
} from '@nestjs/common';
import { HistoryHkService } from './history-hk.service';
import { HistoryHk } from './history-hk.entity';

class CreateHistoryHkDto {
  numbers: number[];
  year?: number;
  No?: number;
}

@Controller('api/hk/history')
export class HistoryHkController {
  constructor(private readonly historyHkService: HistoryHkService) {}

  /** GET /api/hk/history — 获取全部记录 */
  @Get()
  async findAll(): Promise<HistoryHk[]> {
    return this.historyHkService.findAll();
  }

  /** GET /api/hk/history/text — 以纯文本格式返回（兼容前端） */
  @Get('text')
  @Header('Content-Type', 'text/plain')
  async getAsText(): Promise<string> {
    return this.historyHkService.getAsText();
  }

  /** GET /api/hk/history/:id — 获取单条 */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<HistoryHk> {
    return this.historyHkService.findOne(id);
  }

  /** POST /api/hk/history — 新增 { numbers: [7个数字] } */
  @Post()
  async create(@Body() dto: CreateHistoryHkDto): Promise<HistoryHk> {
    return this.historyHkService.create(dto.numbers, dto.year, dto.No);
  }

  /** PUT /api/hk/history/:id — 修改 */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHistoryHkDto,
  ): Promise<HistoryHk> {
    return this.historyHkService.update(id, dto.numbers, dto.year, dto.No);
  }

  /** DELETE /api/hk/history/:id — 删除 */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.historyHkService.remove(id);
  }
}
