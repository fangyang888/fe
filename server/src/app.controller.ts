import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot(): { status: string; api: string; api_hk: string } {
    return {
      status: 'ok',
      api: '/api/history',
      api_hk: '/api/hk/history',
    };
  }
}
