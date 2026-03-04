import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot(): { status: string; api: string } {
    return {
      status: 'ok',
      api: '/api/history',
    };
  }
}
