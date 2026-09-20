import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('Estado')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Verificacion de estado del servidor' })
  @ApiResponse({ status: 200, description: 'Servidor operativo' })
  getHello(): string {
    return this.appService.getHello();
  }
}
