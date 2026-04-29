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
  Query,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { History } from './history.entity';

class CreateHistoryDto {
  numbers: number[];
  year?: number;
  No?: number;
}

@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** GET /api/history — 获取记录，支持 ?year=2025 */
  @Get()
  async findAll(@Query('year') year?: string): Promise<History[]> {
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.historyService.findAll(yearNum);
  }

  /** GET /api/history/text — 以纯文本格式返回，支持 ?year=2025 */
  @Get('text')
  @Header('Content-Type', 'text/plain')
  async getAsText(@Query('year') year?: string): Promise<string> {
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.historyService.getAsText(yearNum);
  }

  /** GET /api/history/:id — 获取单条 */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<History> {
    return this.historyService.findOne(id);
  }

  /** POST /api/history — 新增 { numbers: [7个数字] } */
  @Post()
  async create(@Body() dto: CreateHistoryDto): Promise<History> {
    return this.historyService.create(dto.numbers, dto.year, dto.No);
  }

  /** PUT /api/history/:id — 修改 */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHistoryDto,
  ): Promise<History> {
    return this.historyService.update(id, dto.numbers, dto.year, dto.No);
  }

  /** DELETE /api/history/:id — 删除 */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.historyService.remove(id);
  }
}
