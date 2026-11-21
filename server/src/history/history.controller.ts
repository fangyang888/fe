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
  Res,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { HistoryService } from './history.service';
import { History } from './history.entity';
import { CreateHistoryDto, SyncHistoryDto } from './history.dto';
import { Likely32ReportService } from './likely32-report.service';

@Controller('api/history')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly likely32Report: Likely32ReportService,
  ) {}

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

  @Get('qwen-report')
  @Header('Cache-Control', 'no-store')
  async getQwenReport(@Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Likely32-Report-Status', this.likely32Report.status);
    return this.likely32Report.read();
  }

  /** GET /api/history/:id — 获取单条 */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<History> {
    return this.historyService.findOne(id);
  }

  /** POST /api/history — 新增 { numbers: [7个数字] } */
  @Post()
  async create(@Body() dto: CreateHistoryDto): Promise<History> {
    return this.historyService.create(
      dto.numbers,
      dto.year,
      dto.No,
      dto.numberInfos,
    );
  }

  /** POST /api/history/sync-year — 从 spider 同步整年，重复 year+No 自动忽略 */
  @Post('sync-year')
  async syncYear(@Body() dto: SyncHistoryDto) {
    const result = await this.historyService.syncYear(dto.year);
    return { ...result, qwenReport: this.likely32Report.refresh() };
  }

  /** POST /api/history/sync-latest — 从 spider 同步指定年份最后一期 */
  @Post('sync-latest')
  async syncLatest(@Body() dto: SyncHistoryDto) {
    const result = await this.historyService.syncLatest(dto.year);
    return { ...result, qwenReport: this.likely32Report.refresh() };
  }

  /** PUT /api/history/:id — 修改 */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHistoryDto,
  ): Promise<History> {
    return this.historyService.update(
      id,
      dto.numbers,
      dto.year,
      dto.No,
      dto.numberInfos,
    );
  }

  /** DELETE /api/history/:id — 删除 */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.historyService.remove(id);
  }
}
