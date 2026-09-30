import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('Salud y Monitoreo')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary:
      'Diagnostico de salud del sistema (PostgreSQL, almacenamiento y memoria)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sistema saludable y operativo',
  })
  @ApiResponse({
    status: 503,
    description: 'Degradacion detectada en base de datos o almacenamiento',
  })
  async checkHealth(@Res() res: Response) {
    const result = await this.healthService.checkHealth();
    const statusCode =
      result.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json(result);
  }
}
