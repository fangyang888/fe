import { Controller, Get } from '@nestjs/common';
import { DrawFingerprintControlService } from './draw-fingerprint-control.service';

@Controller('api/kill/draw-fingerprint-control')
export class DrawFingerprintControlController {
  constructor(private readonly service: DrawFingerprintControlService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
