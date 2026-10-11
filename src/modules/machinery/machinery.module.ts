import { Module } from '@nestjs/common';
import { MachineryService } from './machinery.service.js';
import { MachineryController } from './machinery.controller.js';

@Module({
  controllers: [MachineryController],
  providers: [MachineryService],
  exports: [MachineryService],
})
export class MachineryModule {}
