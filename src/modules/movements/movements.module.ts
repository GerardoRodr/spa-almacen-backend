import { Module } from '@nestjs/common';
import { MovementsController } from './movements.controller.js';
import { MovementsService } from './movements.service.js';

@Module({
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService],
})
export class MovementsModule {}
